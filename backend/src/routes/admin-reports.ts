import { getPlatformOffKeys } from '../services/features/resolve';
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, error, notFound } from '../utils/response';
import { generateId } from '../utils/uuid';
import { actorFrom, logAdminAction } from '../services/admin/audit';
import { invalidateTenantCache } from '../services/tenant-db';
import { getCatalogue } from '../services/plans/catalogue';

/**
 * Operator console reads and subscription writes ported from the standalone console's API routes
 * (super-admin/src/app/api/dashboard/*, reports/*, subscriptions/*) so R112 can switch the console to the
 * backend. Mounted by routes/admin.ts behind the super admin gate. Responses use the standard
 * { success, data } envelope; field names inside data match what the console already reads.
 *
 * Ported: GET /dashboard/stats, /dashboard/growth, /dashboard/revenue, /dashboard/top-tenants,
 * /dashboard/recent-activity, /reports/feature-usage, /reports/geographic-distribution, /reports/platform-summary,
 * /subscriptions, /subscriptions/:id; POST /subscriptions/:id/cancel, /subscriptions/:id/record-payment.
 * (Plan change is PUT /admin/tenants/:id/plan.)
 */
const app = new Hono<AppContext>();

/** Last 12 calendar months, oldest first, as { key: 'YYYY-MM', label: 'Oct 26' }. */
function last12Months(): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    });
  }
  return out;
}

app.get('/dashboard/stats', async (c) => {
  const db = c.env.MASTER_DB;
  const [tenantStats, revenueStats, planDist, lastMonthTenants, churnStats] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
                COALESCE(SUM(CASE WHEN status = 'trial' THEN 1 ELSE 0 END), 0) AS trial,
                COALESCE(SUM(CASE WHEN status IN ('expired', 'suspended') THEN 1 ELSE 0 END), 0) AS expired
           FROM tenants`,
      )
      .first<{ total: number; active: number; trial: number; expired: number }>(),
    // Prices are flat yearly amounts: mrr is the active yearly amounts / 12 (monthly amounts count as they are).
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN status = 'active' THEN (CASE WHEN billing_cycle = 'yearly' THEN amount / 12.0 ELSE amount END) ELSE 0 END), 0) AS mrr,
                COALESCE(SUM(amount), 0) AS total_revenue
           FROM subscriptions`,
      )
      .first<{ mrr: number; total_revenue: number }>(),
    db.prepare(`SELECT plan, COUNT(*) AS count FROM tenants GROUP BY plan`).all<{ plan: string; count: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM tenants WHERE created_at < date('now', 'start of month')`).first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM tenants WHERE status = 'cancelled' AND updated_at >= date('now', '-30 days')`).first<{ count: number }>(),
  ]);
  const currentTotal = tenantStats?.total ?? 0;
  const lastMonthTotal = lastMonthTenants?.count ?? 0;
  const growthRate = lastMonthTotal > 0 ? Math.round(((currentTotal - lastMonthTotal) / lastMonthTotal) * 100) : 0;
  const churnRate = currentTotal > 0 ? Math.round(((churnStats?.count ?? 0) / currentTotal) * 100) : 0;
  const mrr = Math.round((revenueStats?.mrr ?? 0) * 100) / 100;
  return success(c, {
    tenantStats: tenantStats ?? { total: 0, active: 0, trial: 0, expired: 0 },
    revenueStats: { mrr, arr: Math.round(mrr * 12 * 100) / 100, total_revenue: revenueStats?.total_revenue ?? 0 },
    planDistribution: planDist.results ?? [],
    growthRate,
    churnRate,
  });
});

app.get('/dashboard/growth', async (c) => {
  const rows = await c.env.MASTER_DB
    .prepare(
      `SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS count FROM tenants
        WHERE created_at >= date('now', '-12 months') GROUP BY strftime('%Y-%m', created_at) ORDER BY month ASC`,
    )
    .all<{ month: string; count: number }>();
  const found = new Map((rows.results ?? []).map((r) => [r.month, r.count]));
  return success(c, { months: last12Months().map((m) => ({ month: m.label, count: found.get(m.key) ?? 0 })) });
});

app.get('/dashboard/revenue', async (c) => {
  const rows = await c.env.MASTER_DB
    .prepare(
      `SELECT strftime('%Y-%m', start_date) AS month, COALESCE(SUM(amount), 0) AS amount FROM subscriptions
        WHERE status = 'active' AND start_date >= date('now', '-12 months') GROUP BY strftime('%Y-%m', start_date) ORDER BY month ASC`,
    )
    .all<{ month: string; amount: number }>();
  const found = new Map((rows.results ?? []).map((r) => [r.month, r.amount]));
  return success(c, { months: last12Months().map((m) => ({ month: m.label, amount: found.get(m.key) ?? 0 })) });
});

app.get('/dashboard/top-tenants', async (c) => {
  const rows = await c.env.MASTER_DB
    .prepare(
      `SELECT t.id, t.company_name, t.plan, t.status, COUNT(tu.id) AS user_count
         FROM tenants t LEFT JOIN tenant_users tu ON t.id = tu.tenant_id AND tu.is_active = 1
        GROUP BY t.id ORDER BY user_count DESC, t.created_at ASC LIMIT 10`,
    )
    .all();
  return success(c, { tenants: rows.results ?? [] });
});

/** Recent platform activity: the audit trail (every super admin action) plus the newest agencies. */
app.get('/dashboard/recent-activity', async (c) => {
  const db = c.env.MASTER_DB;
  const audit = await db
    .prepare(
      `SELECT al.id, al.action, al.entity_type, al.entity_id, al.created_at, COALESCE(sa.name, 'System') AS actor
         FROM super_admin_audit_log al LEFT JOIN super_admins sa ON sa.id = al.admin_id ORDER BY al.created_at DESC LIMIT 20`,
    )
    .all<{ id: string; action: string; entity_type: string; entity_id: string | null; created_at: string; actor: string }>();
  const created = await db
    .prepare(`SELECT id, company_name, created_at FROM tenants ORDER BY created_at DESC LIMIT 10`)
    .all<{ id: string; company_name: string; created_at: string }>();
  const activities = [
    ...(audit.results ?? []).map((a) => ({
      id: a.id,
      action: a.action,
      description: `${a.actor}: ${a.action}${a.entity_id ? ` (${a.entity_type} ${a.entity_id})` : ''}`,
      timestamp: a.created_at,
      actor: a.actor,
    })),
    ...(created.results ?? []).map((t) => ({
      id: t.id,
      action: 'tenant_created',
      description: `Tenant "${t.company_name}" created`,
      timestamp: t.created_at,
      actor: 'System',
    })),
  ]
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    .slice(0, 20);
  return success(c, { activities });
});

// ── Reports ──────────────────────────────────────────────────────────────────

app.get('/reports/feature-usage', async (c) => {
  const db = c.env.MASTER_DB;
  const catalogue = await getCatalogue(c.env);
  const tenants = await db.prepare(`SELECT id, plan FROM tenants WHERE status NOT IN ('deleted', 'cancelled')`).all<{ id: string; plan: string }>();
  const overrides = await db.prepare(`SELECT tenant_id, feature_key, is_enabled FROM tenant_feature_flags`).all<{ tenant_id: string; feature_key: string; is_enabled: number }>();
  const overrideMap = new Map<string, Map<string, boolean>>();
  for (const o of overrides.results ?? []) {
    if (!overrideMap.has(o.tenant_id)) overrideMap.set(o.tenant_id, new Map());
    overrideMap.get(o.tenant_id)!.set(o.feature_key, o.is_enabled === 1);
  }
  const platformOff = await getPlatformOffKeys(c.env);
  const planFeatures = new Map(catalogue.plans.map((p) => [p.key, new Set(p.features)]));
  const allFeatures = new Set<string>([...catalogue.plans.flatMap((p) => p.features), ...(overrides.results ?? []).map((o) => o.feature_key)]);
  const list = tenants.results ?? [];
  const counts = new Map<string, number>([...allFeatures].map((f) => [f, 0]));
  for (const t of list) {
    const defaults = planFeatures.get(t.plan) ?? new Set<string>();
    const own = overrideMap.get(t.id);
    for (const f of allFeatures) {
      const enabled = platformOff.has(f) ? false : own?.has(f) ? own.get(f)! : defaults.has(f);
      if (enabled) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
  }
  const features = [...allFeatures]
    .map((f) => ({
      feature: f,
      enabled_count: counts.get(f) ?? 0,
      total_tenants: list.length,
      adoption_pct: list.length > 0 ? Math.round(((counts.get(f) ?? 0) / list.length) * 100) : 0,
    }))
    .sort((a, b) => b.adoption_pct - a.adoption_pct || a.feature.localeCompare(b.feature));
  return success(c, { features, total_tenants: list.length });
});

app.get('/reports/geographic-distribution', async (c) => {
  const rows = await c.env.MASTER_DB
    .prepare(
      `SELECT COALESCE(NULLIF(country, ''), json_extract(settings, '$.country'), 'Unknown') AS country,
              COUNT(*) AS tenant_count,
              COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active_count
         FROM tenants WHERE status != 'deleted' GROUP BY 1 ORDER BY tenant_count DESC`,
    )
    .all<{ country: string; tenant_count: number; active_count: number }>();
  const distribution = rows.results ?? [];
  return success(c, { distribution, total: distribution.reduce((s, r) => s + r.tenant_count, 0) });
});

app.get('/reports/platform-summary', async (c) => {
  const db = c.env.MASTER_DB;
  const summary = await db
    .prepare(
      `SELECT COALESCE(SUM(us.leads_count), 0) AS total_leads, COALESCE(SUM(us.contacts_count), 0) AS total_contacts,
              COALESCE(SUM(us.users_count), 0) AS total_users, COALESCE(SUM(us.invoices_count), 0) AS total_invoices,
              COALESCE(ROUND(AVG(us.leads_count), 1), 0) AS avg_leads_per_tenant, COUNT(DISTINCT us.tenant_id) AS tenant_count
         FROM (SELECT tenant_id, leads_count, contacts_count, users_count, invoices_count,
                      ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY snapshot_date DESC) AS rn
                 FROM tenant_usage_snapshots) us WHERE us.rn = 1`,
    )
    .first<Record<string, number>>();
  const revenue = await db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM subscription_payments WHERE status = 'success'`).first<{ total: number }>();
  const byStatus = await db.prepare(`SELECT status, COUNT(*) AS cnt FROM tenants GROUP BY status`).all<{ status: string; cnt: number }>();
  const byPlan = await db.prepare(`SELECT plan, COUNT(*) AS cnt FROM tenants GROUP BY plan`).all<{ plan: string; cnt: number }>();
  return success(c, {
    ...(summary ?? {}),
    total_revenue: revenue?.total ?? 0,
    by_status: Object.fromEntries((byStatus.results ?? []).map((r) => [r.status, r.cnt])),
    by_plan: Object.fromEntries((byPlan.results ?? []).map((r) => [r.plan, r.cnt])),
  });
});

// ── Subscriptions ────────────────────────────────────────────────────────────

app.get('/subscriptions', async (c) => {
  const params = new URL(c.req.url).searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20', 10) || 20));
  const where: string[] = ['1 = 1'];
  const binds: unknown[] = [];
  if (params.get('status')) {
    where.push('s.status = ?');
    binds.push(params.get('status'));
  }
  if (params.get('plan')) {
    where.push('s.plan = ?');
    binds.push(params.get('plan'));
  }
  const clause = where.join(' AND ');
  const db = c.env.MASTER_DB;
  const rows = await db
    .prepare(
      `SELECT s.id, s.tenant_id, s.plan, s.amount, s.currency, s.billing_cycle, s.status, s.start_date, s.next_billing_date,
              s.trial_ends_at, s.payment_gateway, s.created_at, t.company_name AS tenant_name, t.subdomain AS tenant_slug
         FROM subscriptions s JOIN tenants t ON s.tenant_id = t.id WHERE ${clause}
        ORDER BY s.created_at DESC, s.rowid DESC LIMIT ? OFFSET ?`,
    )
    .bind(...binds, limit, (page - 1) * limit)
    .all();
  const total = await db.prepare(`SELECT COUNT(*) AS cnt FROM subscriptions s WHERE ${clause}`).bind(...binds).first<{ cnt: number }>();
  const revenue = await db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN status = 'active' THEN (CASE WHEN billing_cycle = 'yearly' THEN amount / 12.0 ELSE amount END) ELSE 0 END), 0) AS mrr,
              COALESCE(SUM(CASE WHEN status = 'active' THEN (CASE WHEN billing_cycle = 'yearly' THEN amount ELSE amount * 12 END) ELSE 0 END), 0) AS arr,
              COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_count
         FROM subscriptions`,
    )
    .first<{ mrr: number; arr: number; active_count: number }>();
  const activeCount = revenue?.active_count ?? 0;
  const count = total?.cnt ?? 0;
  return c.json({
    success: true,
    data: rows.results ?? [],
    pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit), hasMore: page * limit < count },
    revenue: {
      mrr: Math.round((revenue?.mrr ?? 0) * 100) / 100,
      arr: Math.round((revenue?.arr ?? 0) * 100) / 100,
      active_count: activeCount,
      arpt: activeCount > 0 ? Math.round(((revenue?.arr ?? 0) / activeCount) * 100) / 100 : 0,
    },
  });
});

app.get('/subscriptions/:id', async (c) => {
  const db = c.env.MASTER_DB;
  const sub = await db
    .prepare(`SELECT s.*, t.company_name AS tenant_name, t.subdomain AS tenant_slug FROM subscriptions s JOIN tenants t ON s.tenant_id = t.id WHERE s.id = ?`)
    .bind(c.req.param('id'))
    .first();
  if (!sub) return notFound(c, 'Subscription');
  const payments = await db
    .prepare(`SELECT * FROM subscription_payments WHERE subscription_id = ? ORDER BY created_at DESC LIMIT 50`)
    .bind(c.req.param('id'))
    .all();
  return success(c, { subscription: sub, payments: payments.results ?? [] });
});

const cancelSchema = z.object({ reason: z.string().trim().max(500).optional(), immediate: z.boolean().optional() });

app.post('/subscriptions/:id/cancel', zValidator('json', cancelSchema), async (c) => {
  const db = c.env.MASTER_DB;
  const body = c.req.valid('json');
  const sub = await db.prepare(`SELECT id, tenant_id, status FROM subscriptions WHERE id = ?`).bind(c.req.param('id')).first<{ id: string; tenant_id: string; status: string }>();
  if (!sub) return notFound(c, 'Subscription');
  if (sub.status === 'cancelled') return error(c, 'The subscription is already cancelled', 409);
  const tenant = await db.prepare(`SELECT status FROM tenants WHERE id = ?`).bind(sub.tenant_id).first<{ status: string }>();
  const at = new Date().toISOString();
  const stmts = [
    db
      .prepare(`UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?`)
      .bind(at, body.reason || 'No reason provided', at, sub.id),
  ];
  if (body.immediate) stmts.push(db.prepare(`UPDATE tenants SET status = 'cancelled', updated_at = ? WHERE id = ?`).bind(at, sub.tenant_id));
  await db.batch(stmts);
  if (body.immediate) await invalidateTenantCache(c.env, sub.tenant_id);
  await logAdminAction(
    c.env,
    actorFrom(c),
    'subscription.cancel',
    sub.tenant_id,
    { subscription: sub.status, tenant: tenant?.status ?? null },
    { subscription: 'cancelled', tenant: body.immediate ? 'cancelled' : tenant?.status ?? null },
    { extra: { subscriptionId: sub.id, reason: body.reason ?? null, immediate: !!body.immediate } },
  );
  return success(c, { id: sub.id, status: 'cancelled', tenantCancelled: !!body.immediate });
});

const paymentSchema = z.object({
  amount: z.number().positive().max(1_000_000_000),
  method: z.string().trim().min(1).max(40),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

app.post('/subscriptions/:id/record-payment', zValidator('json', paymentSchema), async (c) => {
  const db = c.env.MASTER_DB;
  const body = c.req.valid('json');
  const sub = await db.prepare(`SELECT id, tenant_id, status FROM subscriptions WHERE id = ?`).bind(c.req.param('id')).first<{ id: string; tenant_id: string; status: string }>();
  if (!sub) return notFound(c, 'Subscription');
  if (sub.status === 'cancelled') return error(c, 'The subscription is cancelled; reactivate the agency before recording a payment', 409);
  const paymentId = generateId();
  const at = new Date().toISOString();
  await db.batch([
    db
      .prepare(`INSERT INTO subscription_payments (id, subscription_id, tenant_id, amount, payment_method, payment_reference, status, notes) VALUES (?, ?, ?, ?, ?, ?, 'success', ?)`)
      .bind(paymentId, sub.id, sub.tenant_id, body.amount, body.method, body.reference ?? null, body.notes ?? null),
    db.prepare(`UPDATE subscriptions SET status = 'active', updated_at = ? WHERE id = ? AND status != 'active'`).bind(at, sub.id),
  ]);
  await logAdminAction(c.env, actorFrom(c), 'subscription.record_payment', sub.tenant_id, { subscription: sub.status }, { subscription: 'active', paymentId, amount: body.amount, method: body.method }, {
    extra: { subscriptionId: sub.id, reference: body.reference ?? null },
  });
  return success(c, { paymentId }, 201);
});

export default app;
