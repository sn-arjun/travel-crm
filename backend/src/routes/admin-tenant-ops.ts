import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext, Env } from '../types';
import { success, error, notFound, paginated } from '../utils/response';
import { generateId } from '../utils/uuid';
import { actorFrom, logAdminAction } from '../services/admin/audit';
import { invalidateTenantCache, getTenantInfo, tenantDbFor, TenantDbUnavailableError } from '../services/tenant-db';
import {
  ALLOWANCE_KEYS,
  activePriceFrom,
  currentPeriodKey,
  getAllowance,
  getCatalogue,
  seatLimit,
} from '../services/plans/catalogue';
import { signImpersonationToken, IMPERSONATION_TTL_SECONDS } from '../services/admin/impersonation';
import { resumeAccount, suspendAccount } from '../services/voip/subaccounts';
import { cancelScheduledRelease, scheduleTenantRelease } from '../services/voip/numbers';
import { FEATURE_KEYS, FEATURE_REGISTRY } from '../services/features/registry';
import { resolveTenantFeatures } from '../services/features/resolve';

/**
 * Super admin tenant lifecycle and support tools (R111). Mounted by routes/admin.ts, so every route is
 * /api/v1/admin/tenants/:id/... behind the super admin gate. Every write calls logAdminAction with the
 * before and after state, and every status or plan change drops the KV tenant cache entry so it takes effect
 * on the tenant's very next request. AI credit, communication and extra-user grants are POST /admin/tenants/:id/addons
 * (routes/admin-catalogue.ts); provisioning is routes/admin-tenants.ts.
 */
const app = new Hono<AppContext>();

interface TenantRow {
  id: string;
  company_name: string;
  subdomain: string;
  plan: string;
  status: string;
  max_users: number | null;
  provisioning_status: string;
  db_binding: string | null;
}

async function loadTenant(env: Env, id: string): Promise<TenantRow | null> {
  return env.MASTER_DB
    .prepare(`SELECT id, company_name, subdomain, plan, status, max_users, provisioning_status, db_binding FROM tenants WHERE id = ?`)
    .bind(id)
    .first<TenantRow>();
}

interface SubRow {
  id: string;
  plan: string;
  status: string;
  amount: number;
  trial_ends_at: string | null;
}

async function latestSubscription(env: Env, tenantId: string): Promise<SubRow | null> {
  return env.MASTER_DB
    .prepare(`SELECT id, plan, status, amount, trial_ends_at FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`)
    .bind(tenantId)
    .first<SubRow>();
}

const reasonSchema = z.object({ reason: z.string().trim().max(500).optional() });

async function readBody<T extends z.ZodTypeAny>(c: Context<AppContext>, schema: T): Promise<z.infer<T> | null> {
  const parsed = schema.safeParse(await c.req.json().catch(() => ({})));
  return parsed.success ? parsed.data : null;
}

const now = () => new Date().toISOString();

/** Calling follows the agency's lifecycle, but a provider hiccup must never block the lifecycle change itself: report it instead. */
async function voipLifecycle(step: string, run: () => Promise<void>): Promise<'ok' | 'failed'> {
  try {
    await run();
    return 'ok';
  } catch (err) {
    console.error(`[voip] ${step} sub-account follow-up failed:`, err instanceof Error ? err.message : err);
    return 'failed';
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

app.post('/tenants/:id/suspend', async (c) => {
  const env = c.env;
  const tenant = await loadTenant(env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  if (tenant.status !== 'active' && tenant.status !== 'trial') {
    return error(c, `Only an active or trial agency can be suspended (this one is "${tenant.status}")`, 409);
  }
  const body = (await readBody(c, reasonSchema)) ?? {};
  await env.MASTER_DB.prepare(`UPDATE tenants SET status = 'suspended', updated_at = ? WHERE id = ?`).bind(now(), tenant.id).run();
  await invalidateTenantCache(env, tenant.id);
  const voip = await voipLifecycle('suspend', () => suspendAccount(env, tenant.id).then(() => undefined));
  await logAdminAction(env, actorFrom(c), 'tenant.suspend', tenant.id, { status: tenant.status }, { status: 'suspended' }, { extra: { reason: body.reason ?? null, voip } });
  return success(c, { id: tenant.id, status: 'suspended', previousStatus: tenant.status, voip });
});

app.post('/tenants/:id/reactivate', async (c) => {
  const env = c.env;
  const tenant = await loadTenant(env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  if (tenant.status === 'active' || tenant.status === 'trial') return error(c, `The agency is already "${tenant.status}"`, 409);
  if (tenant.status === 'provisioning') return error(c, 'The agency is still being provisioned', 409);

  const sub = await latestSubscription(env, tenant.id);
  const isTrial = tenant.plan === 'trial' || sub?.status === 'trial';
  if (isTrial && sub?.trial_ends_at && Date.parse(sub.trial_ends_at) <= Date.now()) {
    return error(c, 'The trial has ended; change the plan to a paid one to reactivate', 409);
  }
  const target = isTrial ? 'trial' : 'active';
  const body = (await readBody(c, reasonSchema)) ?? {};

  const stmts = [env.MASTER_DB.prepare(`UPDATE tenants SET status = ?, updated_at = ? WHERE id = ?`).bind(target, now(), tenant.id)];
  if (sub && sub.status === 'cancelled') {
    stmts.push(
      env.MASTER_DB
        .prepare(`UPDATE subscriptions SET status = ?, cancelled_at = NULL, cancellation_reason = NULL, updated_at = ? WHERE id = ?`)
        .bind(target, now(), sub.id),
    );
  }
  await env.MASTER_DB.batch(stmts);
  await invalidateTenantCache(env, tenant.id);
  // Calling comes back with the agency: the sub-account resumes and a pending release of its numbers is called off.
  const voip = await voipLifecycle('reactivate', async () => {
    await resumeAccount(env, tenant.id);
    await cancelScheduledRelease(env, tenant.id);
  });
  await logAdminAction(
    env,
    actorFrom(c),
    'tenant.reactivate',
    tenant.id,
    { status: tenant.status, subscription: sub?.status ?? null },
    { status: target, subscription: sub?.status === 'cancelled' ? target : sub?.status ?? null },
    { extra: { reason: body.reason ?? null, voip } },
  );
  return success(c, { id: tenant.id, status: target, previousStatus: tenant.status, voip });
});

app.post('/tenants/:id/cancel', async (c) => {
  const env = c.env;
  const tenant = await loadTenant(env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  if (tenant.status === 'cancelled') return error(c, 'The agency is already cancelled', 409);
  const body = (await readBody(c, reasonSchema)) ?? {};
  const reason = body.reason || 'Cancelled by platform administrator';

  // Status cancelled blocks every tenant request; the agency's data is kept (nothing is deleted).
  await env.MASTER_DB.batch([
    env.MASTER_DB.prepare(`UPDATE tenants SET status = 'cancelled', updated_at = ? WHERE id = ?`).bind(now(), tenant.id),
    env.MASTER_DB
      .prepare(`UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE tenant_id = ? AND status != 'cancelled'`)
      .bind(now(), reason, now(), tenant.id),
  ]);
  await invalidateTenantCache(env, tenant.id);
  // Calling stops now (sub-account suspended); the numbers are released after a grace period with a notice, then the sub-account closes.
  const voip = await voipLifecycle('cancel', async () => {
    await suspendAccount(env, tenant.id);
    await scheduleTenantRelease(env, tenant.id);
  });
  await logAdminAction(env, actorFrom(c), 'tenant.cancel', tenant.id, { status: tenant.status }, { status: 'cancelled', subscriptions: 'cancelled', dataKept: true }, { extra: { reason, voip } });
  return success(c, { id: tenant.id, status: 'cancelled', previousStatus: tenant.status, dataKept: true, voip });
});

const planSchema = z.object({ plan: z.string().trim().min(1).max(40), reason: z.string().trim().max(500).optional() });

app.put('/tenants/:id/plan', zValidator('json', planSchema), async (c) => {
  const env = c.env;
  const body = c.req.valid('json');
  const tenant = await loadTenant(env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');

  const catalogue = await getCatalogue(env);
  const plan = catalogue.plans.find((p) => p.key === body.plan && p.isActive);
  if (!plan) return error(c, `Unknown plan "${body.plan}". Valid plans: ${catalogue.plans.filter((p) => p.isActive).map((p) => p.key).join(', ')}`, 400);

  const price = activePriceFrom(catalogue, plan.key);
  const sub = await latestSubscription(env, tenant.id);
  const leavingTrial = plan.key !== 'trial' && (tenant.status === 'trial' || sub?.status === 'trial');
  const newTenantStatus = leavingTrial && tenant.status === 'trial' ? 'active' : tenant.status;
  const amount = plan.key === 'trial' ? 0 : price?.yearlyPrice ?? 0;

  const stmts = [env.MASTER_DB.prepare(`UPDATE tenants SET plan = ?, status = ?, updated_at = ? WHERE id = ?`).bind(plan.key, newTenantStatus, now(), tenant.id)];
  if (sub) {
    stmts.push(
      env.MASTER_DB
        .prepare(
          `UPDATE subscriptions SET plan = ?, amount = ?, status = CASE WHEN ? THEN 'active' ELSE status END,
                  trial_ends_at = CASE WHEN ? THEN NULL ELSE trial_ends_at END, updated_at = ? WHERE id = ?`,
        )
        .bind(plan.key, amount, leavingTrial ? 1 : 0, leavingTrial ? 1 : 0, now(), sub.id),
    );
  } else {
    const next = new Date();
    next.setFullYear(next.getFullYear() + 1);
    stmts.push(
      env.MASTER_DB
        .prepare(`INSERT INTO subscriptions (id, tenant_id, plan, amount, billing_cycle, start_date, next_billing_date, status) VALUES (?, ?, ?, ?, 'yearly', ?, ?, 'active')`)
        .bind(generateId(), tenant.id, plan.key, amount, now(), next.toISOString()),
    );
  }
  await env.MASTER_DB.batch(stmts);

  // Seats follow the new plan's included users plus any extra-user add-ons.
  const seats = await seatLimit(env, tenant.id);
  await env.MASTER_DB.prepare(`UPDATE tenants SET max_users = ? WHERE id = ?`).bind(seats, tenant.id).run();
  await invalidateTenantCache(env, tenant.id);

  await logAdminAction(
    env,
    actorFrom(c),
    'tenant.plan_change',
    tenant.id,
    { plan: tenant.plan, status: tenant.status, maxUsers: tenant.max_users, subscriptionAmount: sub?.amount ?? null },
    { plan: plan.key, status: newTenantStatus, maxUsers: seats, subscriptionAmount: amount },
    { extra: { reason: body.reason ?? null } },
  );
  return success(c, { id: tenant.id, plan: plan.key, status: newTenantStatus, maxUsers: seats, yearlyPrice: amount });
});

// ── Feature flags ────────────────────────────────────────────────────────────

const featureKey = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, 'Feature keys are lower case letters, digits and underscores');
const featuresSchema = z.object({
  // true / false set an agency override; null removes it (follow the plan)
  features: z.record(featureKey, z.boolean().nullable()).refine((m) => Object.keys(m).length > 0 && Object.keys(m).length <= 200, 'Between 1 and 200 features'),
  reason: z.string().trim().max(500).optional(),
});

async function featureOverrides(env: Env, tenantId: string): Promise<Record<string, boolean>> {
  const rows = await env.MASTER_DB
    .prepare(`SELECT feature_key, is_enabled FROM tenant_feature_flags WHERE tenant_id = ?`)
    .bind(tenantId)
    .all<{ feature_key: string; is_enabled: number }>();
  return Object.fromEntries((rows.results ?? []).map((r) => [r.feature_key, r.is_enabled === 1]));
}

app.get('/tenants/:id/features', async (c) => {
  const env = c.env;
  const tenant = await loadTenant(env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const catalogue = await getCatalogue(env);
  const planDefaults = new Set(catalogue.plans.find((p) => p.key === tenant.plan)?.features ?? []);
  const overrides = await featureOverrides(env, tenant.id);
  const resolved = await resolveTenantFeatures(env, tenant.id, FEATURE_KEYS);
  const meta = new Map(FEATURE_REGISTRY.map((f) => [f.key, f]));
  const features = resolved.features.map((r) => ({
    key: r.key,
    name: meta.get(r.key)?.name ?? r.key,
    area: meta.get(r.key)?.area ?? null,
    enabled: r.enabled,
    source: r.source,
    isOverride: r.key in overrides,
    override: r.key in overrides ? overrides[r.key] : null,
    planDefault: planDefaults.has(r.key),
    platformOff: r.source === 'platform',
  }));
  return success(c, { plan: tenant.plan, features });
});

app.put('/tenants/:id/features', zValidator('json', featuresSchema), async (c) => {
  const env = c.env;
  const body = c.req.valid('json');
  const tenant = await loadTenant(env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const actor = actorFrom(c);
  const before = await featureOverrides(env, tenant.id);
  await env.MASTER_DB.batch(
    Object.entries(body.features).map(([key, enabled]) =>
      enabled === null
        ? env.MASTER_DB.prepare('DELETE FROM tenant_feature_flags WHERE tenant_id = ? AND feature_key = ?').bind(tenant.id, key)
        : env.MASTER_DB
        .prepare(
          `INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled, updated_by) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (tenant_id, feature_key) DO UPDATE SET is_enabled = excluded.is_enabled, updated_by = excluded.updated_by`,
        )
        .bind(generateId(), tenant.id, key, enabled ? 1 : 0, actor.email),
    ),
  );
  const after = await featureOverrides(env, tenant.id);
  await logAdminAction(env, actor, 'tenant.features_update', tenant.id, before, after, { extra: { reason: body.reason ?? null } });
  return success(c, { id: tenant.id, overrides: after });
});

app.delete('/tenants/:id/features', async (c) => {
  const env = c.env;
  const tenant = await loadTenant(env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const before = await featureOverrides(env, tenant.id);
  await env.MASTER_DB.prepare(`DELETE FROM tenant_feature_flags WHERE tenant_id = ?`).bind(tenant.id).run();
  await logAdminAction(env, actorFrom(c), 'tenant.features_reset', tenant.id, before, {});
  return success(c, { id: tenant.id, overrides: {} });
});

// ── Usage caps ───────────────────────────────────────────────────────────────

// ai_credits_per_month is not editable here: its limit always equals the catalogue allowance plus add-on packs.
const CAP_KEYS = [
  'ai_actions_per_day',
  'ai_tokens_per_month',
  'whatsapp_messages_per_month',
  'email_sends_per_month',
  'sms_per_month',
  'whatsapp_per_month',
  'email_per_month',
  'otp_per_month',
  'call_minutes_per_month',
  'voip_minutes_per_month',
  'storage_gb',
] as const;

const capsSchema = z.object({
  caps: z
    .array(
      z.object({
        capKey: z.enum(CAP_KEYS),
        capValue: z.number().int().min(0).max(1_000_000_000),
        resetPeriod: z.enum(['daily', 'monthly']).optional(),
      }),
    )
    .min(1)
    .max(CAP_KEYS.length),
  reason: z.string().trim().max(500).optional(),
});

interface CapRow {
  cap_key: string;
  cap_value: number;
  current_usage: number;
  reset_period: string | null;
  last_reset_at: string | null;
}

async function capRows(env: Env, tenantId: string): Promise<CapRow[]> {
  const rows = await env.MASTER_DB
    .prepare(`SELECT cap_key, cap_value, current_usage, reset_period, last_reset_at FROM tenant_usage_caps WHERE tenant_id = ? ORDER BY cap_key ASC`)
    .bind(tenantId)
    .all<CapRow>();
  return rows.results ?? [];
}

const capView = (r: CapRow) => ({
  capKey: r.cap_key,
  capValue: r.cap_value,
  currentUsage: r.current_usage,
  resetPeriod: r.reset_period,
  lastResetAt: r.last_reset_at,
  usagePercent: r.cap_value > 0 ? Math.round((r.current_usage / r.cap_value) * 100) : 0,
});

app.get('/tenants/:id/caps', async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  return success(c, { caps: (await capRows(c.env, tenant.id)).map(capView) });
});

app.put('/tenants/:id/caps', zValidator('json', capsSchema), async (c) => {
  const env = c.env;
  const body = c.req.valid('json');
  const tenant = await loadTenant(env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const before = (await capRows(env, tenant.id)).map(capView);
  await env.MASTER_DB.batch(
    body.caps.map((cap) =>
      env.MASTER_DB
        .prepare(
          `INSERT INTO tenant_usage_caps (id, tenant_id, cap_key, cap_value, reset_period) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (tenant_id, cap_key) DO UPDATE SET cap_value = excluded.cap_value,
             reset_period = COALESCE(?, tenant_usage_caps.reset_period), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
        )
        .bind(generateId(), tenant.id, cap.capKey, cap.capValue, cap.resetPeriod ?? (cap.capKey.endsWith('_per_day') ? 'daily' : 'monthly'), cap.resetPeriod ?? null),
    ),
  );
  const after = (await capRows(env, tenant.id)).map(capView);
  await logAdminAction(env, actorFrom(c), 'tenant.caps_update', tenant.id, before, after, { extra: { reason: body.reason ?? null } });
  return success(c, { caps: after });
});

// ── Usage ────────────────────────────────────────────────────────────────────

const USED_BY_ALLOWANCE: Record<string, string | null> = {
  ai_credits: 'ai_credits_per_month',
  sms: 'sms_per_month',
  whatsapp: 'whatsapp_per_month',
  email: 'email_per_month',
  call_minutes: 'call_minutes_per_month',
  otp: 'otp_per_month',
};

/** GET /admin/tenants/:id/usage — plan, seats, every monthly allowance with what was used, caps and a 30 day trend. */
app.get('/tenants/:id/usage', async (c) => {
  const env = c.env;
  const tenant = await loadTenant(env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const caps = await capRows(env, tenant.id);
  const capByKey = new Map(caps.map((r) => [r.cap_key, r]));
  const period = currentPeriodKey();

  const allowances: Record<string, { allowance: number; used: number | null; remaining: number | null }> = {};
  for (const key of ALLOWANCE_KEYS) {
    const allowance = await getAllowance(env, tenant.id, key, period);
    const counter = USED_BY_ALLOWANCE[key];
    const used = counter ? capByKey.get(counter)?.current_usage ?? 0 : null;
    allowances[key] = { allowance, used, remaining: used === null ? null : Math.max(0, allowance - used) };
  }

  const seatsUsed = await env.MASTER_DB
    .prepare(`SELECT COUNT(*) AS c FROM tenant_users WHERE tenant_id = ? AND is_active = 1`)
    .bind(tenant.id)
    .first<{ c: number }>();
  const snapshot = await env.MASTER_DB
    .prepare(`SELECT * FROM tenant_usage_snapshots WHERE tenant_id = ? ORDER BY snapshot_date DESC LIMIT 1`)
    .bind(tenant.id)
    .first();
  const trend = await env.MASTER_DB
    .prepare(
      `SELECT snapshot_date, users_count, leads_count, contacts_count, invoices_count, ai_requests, sms_sent, whatsapp_messages_sent, voip_minutes
         FROM tenant_usage_snapshots WHERE tenant_id = ? AND snapshot_date >= date('now', '-30 days') ORDER BY snapshot_date ASC`,
    )
    .bind(tenant.id)
    .all();
  const addons = await env.MASTER_DB
    .prepare(
      `SELECT id, product_key, quantity, units_granted, period_key, source, granted_by, reference, created_at
         FROM tenant_addons WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .bind(tenant.id)
    .all()
    .catch(() => ({ results: [] }));

  return success(c, {
    tenantId: tenant.id,
    plan: tenant.plan,
    status: tenant.status,
    period,
    seats: { used: seatsUsed?.c ?? 0, limit: await seatLimit(env, tenant.id) },
    allowances,
    caps: caps.map(capView),
    snapshot: snapshot ?? null,
    trend: trend.results ?? [],
    addons: addons.results ?? [],
  });
});

// ── Impersonation ────────────────────────────────────────────────────────────

const impersonateSchema = z.object({ reason: z.string().trim().min(5, 'A reason of at least 5 characters is required').max(500) });

app.post('/tenants/:id/impersonate', zValidator('json', impersonateSchema), async (c) => {
  const env = c.env;
  const { reason } = c.req.valid('json');
  const admin = c.get('superAdmin');
  const tenant = await loadTenant(env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  if (tenant.status !== 'active' && tenant.status !== 'trial') return error(c, `The agency is "${tenant.status}"; reactivate it before impersonating`, 409);
  if (tenant.provisioning_status !== 'active') return error(c, `The agency is not fully provisioned ("${tenant.provisioning_status}")`, 409);

  const info = await getTenantInfo(env, tenant.id);
  let db: D1Database | null = null;
  try {
    db = info ? tenantDbFor(env, info) : null;
  } catch (e) {
    if (!(e instanceof TenantDbUnavailableError)) throw e;
  }
  if (!db) return error(c, 'The agency database is not available', 503);

  // The agency's first active admin: candidates come from the registry (tenant_users), each confirmed in the agency database
  // (in a shared single-database setup the users table holds every agency, so the registry is what scopes it).
  const registered = await env.MASTER_DB
    .prepare(`SELECT user_id FROM tenant_users WHERE tenant_id = ? AND role = 'admin' AND is_active = 1 ORDER BY created_at ASC, rowid ASC LIMIT 10`)
    .bind(tenant.id)
    .all<{ user_id: string }>();
  let user: { id: string; email: string; role: string } | null = null;
  for (const candidate of registered.results ?? []) {
    user = await db
      .prepare(`SELECT id, email, role FROM users WHERE id = ? AND role = 'admin' AND is_active = 1`)
      .bind(candidate.user_id)
      .first<{ id: string; email: string; role: string }>();
    if (user) break;
  }
  if (!user && (registered.results ?? []).length === 0) {
    user = await db
      .prepare(`SELECT id, email, role FROM users WHERE role = 'admin' AND is_active = 1 ORDER BY created_at ASC, rowid ASC LIMIT 1`)
      .first<{ id: string; email: string; role: string }>();
  }
  if (!user) return error(c, 'The agency has no active admin to impersonate', 409);

  const sessionId = generateId();
  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + IMPERSONATION_TTL_SECONDS * 1000);
  await env.MASTER_DB
    .prepare(
      `INSERT INTO impersonation_sessions (id, super_admin_id, tenant_id, user_id, user_email, reason, started_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(sessionId, admin.id, tenant.id, user.id, user.email, reason, startedAt.toISOString(), expiresAt.toISOString())
    .run();

  const issued = await signImpersonationToken(env, {
    userId: user.id,
    tenantId: tenant.id,
    role: user.role,
    email: user.email,
    db: tenant.db_binding,
    superAdminId: admin.id,
    superAdminName: admin.name,
    sessionId,
  });

  await logAdminAction(env, actorFrom(c), 'tenant.impersonate_start', tenant.id, null, { sessionId, userId: user.id, userEmail: user.email, expiresAt: issued.expiresAt }, {
    extra: { reason },
  });
  return success(
    c,
    {
      accessToken: issued.token,
      expiresAt: issued.expiresAt,
      sessionId,
      tenantId: tenant.id,
      user: { id: user.id, email: user.email, role: user.role },
      impersonatedBy: { id: admin.id, name: admin.name },
      note: 'Time-boxed support session. The token carries an imp claim, has no refresh token and every request is logged in the agency activity log.',
    },
    201,
  );
});

/** End a session early (the token stops working at once: the session row is checked on every request). */
app.post('/impersonation/:sessionId/end', async (c) => {
  const env = c.env;
  const session = await env.MASTER_DB
    .prepare(`SELECT id, tenant_id, super_admin_id, ended_at FROM impersonation_sessions WHERE id = ?`)
    .bind(c.req.param('sessionId'))
    .first<{ id: string; tenant_id: string; super_admin_id: string; ended_at: string | null }>();
  if (!session) return notFound(c, 'Impersonation session');
  if (session.ended_at) return error(c, 'The session has already ended', 409);
  const admin = c.get('superAdmin');
  if (admin.role !== 'super_admin' && admin.id !== session.super_admin_id) return error(c, 'Only the admin who started a session (or a super admin) can end it', 403);
  const endedAt = now();
  await env.MASTER_DB.prepare(`UPDATE impersonation_sessions SET ended_at = ?, ended_by = ? WHERE id = ?`).bind(endedAt, admin.id, session.id).run();
  await logAdminAction(env, actorFrom(c), 'tenant.impersonate_end', session.tenant_id, { endedAt: null }, { endedAt, sessionId: session.id });
  return success(c, { sessionId: session.id, endedAt });
});

app.get('/impersonation', async (c) => {
  const params = new URL(c.req.url).searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20', 10) || 20));
  const tenantId = params.get('tenantId');
  const where = tenantId ? 'WHERE s.tenant_id = ?' : '';
  const binds = tenantId ? [tenantId] : [];
  const total = await c.env.MASTER_DB.prepare(`SELECT COUNT(*) AS c FROM impersonation_sessions s ${where}`).bind(...binds).first<{ c: number }>();
  const rows = await c.env.MASTER_DB
    .prepare(
      `SELECT s.id, s.super_admin_id, a.name AS super_admin_name, s.tenant_id, t.company_name, s.user_id, s.user_email, s.reason,
              s.started_at, s.expires_at, s.ended_at
         FROM impersonation_sessions s
         LEFT JOIN super_admins a ON a.id = s.super_admin_id
         LEFT JOIN tenants t ON t.id = s.tenant_id
         ${where} ORDER BY s.started_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limit, (page - 1) * limit)
    .all();
  return paginated(c, rows.results ?? [], total?.c ?? 0, page, limit);
});

// ── Audit log ────────────────────────────────────────────────────────────────

/** GET /admin/audit-log — filter by action, entityType, tenantId (entity_id), adminId, from/to; newest first. */
app.get('/audit-log', async (c) => {
  const params = new URL(c.req.url).searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '50', 10) || 50));
  const where: string[] = [];
  const binds: unknown[] = [];
  const add = (sql: string, v: string | null) => {
    if (v) {
      where.push(sql);
      binds.push(v);
    }
  };
  const action = params.get('action');
  if (action) {
    where.push(`(al.action = ? OR al.action LIKE ?)`);
    binds.push(action, `${action.replace(/[%_]/g, '')}.%`);
  }
  add('al.entity_type = ?', params.get('entityType') || params.get('entity_type'));
  add('al.entity_id = ?', params.get('tenantId'));
  add('al.admin_id = ?', params.get('adminId'));
  add('al.created_at >= ?', params.get('from'));
  add('al.created_at <= ?', params.get('to'));
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = await c.env.MASTER_DB.prepare(`SELECT COUNT(*) AS c FROM super_admin_audit_log al ${clause}`).bind(...binds).first<{ c: number }>();
  const rows = await c.env.MASTER_DB
    .prepare(
      `SELECT al.id, al.admin_id, sa.name AS admin_name, sa.email AS admin_email, al.action, al.entity_type, al.entity_id,
              al.details, al.ip_address, al.user_agent, al.created_at
         FROM super_admin_audit_log al LEFT JOIN super_admins sa ON sa.id = al.admin_id
         ${clause} ORDER BY al.created_at DESC, al.rowid DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limit, (page - 1) * limit)
    .all<Record<string, unknown> & { details: string | null }>();
  const data = (rows.results ?? []).map((r) => {
    let details: unknown = null;
    try {
      details = r.details ? JSON.parse(r.details) : null;
    } catch {
      details = null;
    }
    return { ...r, details };
  });
  return paginated(c, data, total?.c ?? 0, page, limit);
});

export default app;
