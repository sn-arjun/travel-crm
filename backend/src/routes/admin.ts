import { Hono } from 'hono';
import type { AppContext } from '../types';
import { success, error, notFound, paginated } from '../utils/response';
import { requireSuperAdmin } from '../middleware/require-super-admin';
import { getTenantInfo, tenantDbFor, resolveTenantDb, tenancyMode } from '../services/tenant-db';
import { actorFrom, logAdminAction } from '../services/admin/audit';
import { CredentialsKeyMissing, activeKeyId, decryptSecret, encryptSecret, hashApiKey, isEncrypted, keyIdOf } from '../utils/crypto-box';
import { VOIP_SECRET_COLUMNS, voipSecretAad } from '../services/voip-provider';
import tenantOpsRoutes from './admin-tenant-ops';
import reportRoutes from './admin-reports';
import { appUrl, emailFrom, supportEmail } from '../utils/app-urls';
import { getCatalogue, activePriceFrom, type Catalogue, type CataloguePlan } from '../services/plans/catalogue';
import { catalogueAdminRoutes, grantAddon } from './admin-catalogue';

/**
 * Platform administration routes, cross-tenant. This file holds the read-only platform views; the writes live in
 * admin-tenant-ops.ts (lifecycle, plan, features, caps, usage, impersonation, audit log), admin-reports.ts (console
 * dashboard, reports, subscriptions), admin-catalogue.ts (plan catalogue, add-ons) and admin-tenants.ts (provisioning).
 *
 * Handlers read MASTER_DB (the platform registry); per-agency counts go through that agency's own database
 * (see tenantCounts). The whole mount sits behind `requireSuperAdmin` (a super admin token, R111).
 */
const app = new Hono<AppContext>();

/**
 * GET /whoami — kept for the desktop shell, which asks it for every signed-in tenant user.
 *
 * Since R111 a tenant session is never a super admin (operators sign in with POST /admin/auth/login and a
 * separate token), so the answer for any tenant token is false. It stays outside `requireSuperAdmin` and on
 * tenant authentication (see authMiddleware) so the desktop keeps getting 200 instead of 401/403. Operators
 * use GET /admin/auth/me.
 */
app.get('/whoami', async (c) => success(c, { isSuperAdmin: false }));

app.use('*', requireSuperAdmin);

// Plan catalogue administration (R109) and add-on grants live in routes/admin-catalogue.ts
app.route('/catalogue', catalogueAdminRoutes);
app.post('/tenants/:id/addons', grantAddon);

// Lifecycle, plan, features, caps, usage, impersonation, audit log (R111) and console dashboard/reports/subscriptions
app.route('/', tenantOpsRoutes);
app.route('/', reportRoutes);

// --- Credential maintenance (R108) ---

/**
 * POST /maintenance/hash-api-keys: hash every website API key still stored as plaintext and blank the plaintext
 * column. Idempotent; a second run changes nothing.
 */
app.post('/maintenance/hash-api-keys', async (c) => {
  const rows = await c.env.MASTER_DB
    .prepare("SELECT id, api_key FROM tenant_api_keys WHERE api_key != '' AND key_hash IS NULL")
    .all<{ id: string; api_key: string }>();
  let hashed = 0;
  for (const row of rows.results) {
    const res = await c.env.MASTER_DB
      .prepare("UPDATE tenant_api_keys SET key_hash = ?, key_prefix = ?, api_key = '' WHERE id = ? AND key_hash IS NULL")
      .bind(await hashApiKey(row.api_key), row.api_key.slice(0, 8), row.id)
      .run();
    hashed += res.meta.changes ? 1 : 0;
  }
  await logAdminAction(c.env, actorFrom(c), 'maintenance.hash_api_keys', null, null, { converted: hashed }, { entityType: 'system' });
  return success(c, { hashed });
});

/**
 * POST /maintenance/reencrypt?cursor=<tenantId>&limit=<n>: for each agency (ordered by id, after the cursor), encrypt
 * legacy plaintext VoIP credentials and move values sealed with an older key to the active key. Idempotent and
 * resumable: when nextCursor is not null, call again with it. Never returns or logs a credential.
 */
app.post('/maintenance/reencrypt', async (c) => {
  const params = new URL(c.req.url).searchParams;
  const cursor = (params.get('cursor') || '').trim();
  const limit = Math.min(200, Math.max(1, parseInt(params.get('limit') || '25', 10) || 25));
  let activeId: string;
  try {
    activeId = await activeKeyId(c.env);
  } catch (e) {
    if (e instanceof CredentialsKeyMissing) return error(c, 'Credential encryption keys are not configured', 503, { code: 'CREDENTIALS_UNAVAILABLE' });
    throw e;
  }

  const tenants = await c.env.MASTER_DB
    .prepare('SELECT id FROM tenants WHERE id > ? ORDER BY id LIMIT ?')
    .bind(cursor, limit)
    .all<{ id: string }>();
  const counts = { tenantsScanned: 0, encrypted: 0, rotated: 0, failed: 0 };
  const seen = new Set<D1Database>();
  const databases: D1Database[] = [];
  for (const tenant of tenants.results) {
    counts.tenantsScanned++;
    try {
      const db = await resolveTenantDb(c.env, tenant.id);
      if (db && !seen.has(db)) { seen.add(db); databases.push(db); }
    } catch {
      counts.failed++;
    }
  }
  if (!cursor && databases.length === 0 && tenancyMode(c.env) === 'single') databases.push(c.env.MASTER_DB);

  for (const db of databases) {
    let row: Record<string, any> | null = null;
    try {
      row = await db.prepare('SELECT * FROM voip_settings LIMIT 1').first<Record<string, any>>();
    } catch {
      continue; // an agency database without VoIP settings
    }
    if (!row) continue;
    const sets: string[] = [];
    const binds: string[] = [];
    for (const column of VOIP_SECRET_COLUMNS) {
      const stored = row[column] as string | null;
      if (!stored) continue;
      try {
        const aad = voipSecretAad(row.id, column);
        const { value, legacy } = await decryptSecret(c.env, stored, aad);
        if (!legacy && isEncrypted(stored) && keyIdOf(stored) === activeId) continue;
        sets.push(`${column} = ?`);
        binds.push(await encryptSecret(c.env, value, aad));
        if (legacy) counts.encrypted++; else counts.rotated++;
      } catch {
        counts.failed++;
      }
    }
    if (sets.length) await db.prepare(`UPDATE voip_settings SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, row.id).run();
  }

  const nextCursor = tenants.results.length === limit ? tenants.results[tenants.results.length - 1].id : null;
  await logAdminAction(c.env, actorFrom(c), 'maintenance.reencrypt', null, null, { ...counts, activeKeyId: activeId }, { entityType: 'system' });
  return success(c, { ...counts, nextCursor });
});

// --- Helpers ---

function readPaging(c: any): { page: number; limit: number; offset: number } {
  const params = new URL(c.req.url).searchParams;
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const rawLimit = parseInt(params.get('limit') || '20', 10) || 20;
  const limit = Math.min(100, Math.max(1, rawLimit));
  return { page, limit, offset: (page - 1) * limit };
}

function param(c: any, key: string): string {
  return (new URL(c.req.url).searchParams.get(key) || '').trim();
}

/**
 * Tenant `status` in MASTER_DB carries trial/active/suspended/expired, but the
 * admin UI only renders active/suspended/inactive. Collapse the tail states.
 */
function uiTenantStatus(status: string | null): 'active' | 'suspended' | 'inactive' {
  if (status === 'active' || status === 'trial') return 'active';
  if (status === 'suspended') return 'suspended';
  return 'inactive';
}

function uiUserStatus(isActive: number | null): 'active' | 'inactive' {
  return isActive ? 'active' : 'inactive';
}

/** Money is REAL in D1; guard against NULL aggregates. */
function money(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Count rows in a table that may not exist in every deployment (per-tenant
 * tables live in a separate D1 in production). Missing table -> 0, not a 500.
 */
async function safeCount(db: D1Database, sql: string, ...binds: unknown[]): Promise<number> {
  try {
    const row = await db.prepare(sql).bind(...binds).first<{ c: number }>();
    return row?.c ?? 0;
  } catch {
    return 0;
  }
}

interface TenantCounts {
  contactCount: number;
  leadCount: number;
  invoiceCount: number;
}

const COUNTS_TTL_SECONDS = 600;

/**
 * Contacts, leads and invoices of ONE agency, counted in that agency's own database and cached in KV for 10 minutes
 * (callers loop over at most 50 agencies). Suspended agencies are counted too; an unreachable database gives zeros.
 */
async function tenantCounts(env: AppContext['Bindings'], tenantId: string): Promise<TenantCounts> {
  const cacheKey = `sa:counts:${tenantId}`;
  const cached = (await env.CACHE.get(cacheKey, 'json').catch(() => null)) as TenantCounts | null;
  if (cached) return cached;

  let counts: TenantCounts = { contactCount: 0, leadCount: 0, invoiceCount: 0 };
  try {
    const info = await getTenantInfo(env, tenantId);
    if (info) {
      const db = tenantDbFor(env, info);
      counts = {
        contactCount: await safeCount(db, 'SELECT COUNT(*) AS c FROM contacts WHERE is_deleted = 0'),
        leadCount: await safeCount(db, 'SELECT COUNT(*) AS c FROM leads WHERE is_deleted = 0'),
        invoiceCount: await safeCount(db, 'SELECT COUNT(*) AS c FROM invoices WHERE is_deleted = 0'),
      };
    }
  } catch {
    // binding missing: zeros
  }
  await env.CACHE.put(cacheKey, JSON.stringify(counts), { expirationTtl: COUNTS_TTL_SECONDS }).catch(() => undefined);
  return counts;
}

/** The last `months` calendar months as YYYY-MM, oldest first. */
function recentMonths(months: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// --- Plan catalogue ------------------------------------------------
// Plans, prices, included users and features come from the plan catalogue tables in MASTER_DB (R109).

function buildPlan(plan: CataloguePlan, catalogue: Catalogue) {
  const price = activePriceFrom(catalogue, plan.key);
  return {
    id: plan.key,
    name: plan.name,
    description: plan.description ?? '',
    price: price?.yearlyPrice ?? 0,
    currency: price?.currency ?? 'INR',
    billingCycle: 'yearly' as const,
    maxUsers: price?.includedUsers ?? 0,
    maxTeam: price?.includedUsers ?? 0,
    extraUserYearlyPrice: price?.extraUserYearlyPrice ?? null,
    allowances: plan.allowances,
    features: plan.features,
    isActive: plan.isActive,
    isPublic: plan.isPublic,
    createdAt: new Date(0).toISOString(),
  };
}

// --- Aggregates ---------------------------------------------------

async function platformStats(db: D1Database) {
  const tenantCount = await safeCount(db, 'SELECT COUNT(*) AS c FROM tenants');
  const activeUsers = await safeCount(
    db,
    'SELECT COUNT(*) AS c FROM tenant_users WHERE is_active = 1'
  );

  const revenueRow = await db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM subscription_payments
        WHERE status = 'success'`
    )
    .first<{ total: number }>()
    .catch(() => null);

  // Signups per day for the trailing 30 days.
  const signupRows = await db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
         FROM tenants
        WHERE created_at >= ?
        GROUP BY substr(created_at, 1, 10)
        ORDER BY date ASC`
    )
    .bind(new Date(Date.now() - 30 * 86400000).toISOString())
    .all<{ date: string; count: number }>()
    .catch(() => ({ results: [] as { date: string; count: number }[] }));

  // Tenant mix by plan — feeds the pie chart.
  const breakdownRows = await db
    .prepare(
      `SELECT COALESCE(plan, 'unknown') AS name, COUNT(*) AS value
         FROM tenants
        GROUP BY COALESCE(plan, 'unknown')
        ORDER BY value DESC`
    )
    .all<{ name: string; value: number }>()
    .catch(() => ({ results: [] as { name: string; value: number }[] }));

  const revenueByPlanRows = await db
    .prepare(
      `SELECT COALESCE(s.plan, 'unknown') AS plan,
              COALESCE(SUM(p.amount), 0) AS revenue
         FROM subscription_payments p
         LEFT JOIN subscriptions s ON s.id = p.subscription_id
        WHERE p.status = 'success'
        GROUP BY COALESCE(s.plan, 'unknown')
        ORDER BY revenue DESC`
    )
    .all<{ plan: string; revenue: number }>()
    .catch(() => ({ results: [] as { plan: string; revenue: number }[] }));

  // No paid subscriptions yet still shows the tiers at zero, so the chart
  // renders an axis instead of an empty frame.
  const revenueByPlan = revenueByPlanRows.results?.length
    ? revenueByPlanRows.results.map((r) => ({ plan: r.plan, revenue: money(r.revenue) }))
    : (await getCatalogue(db)).plans.filter((p) => p.isPublic).map((p) => ({ plan: p.key, revenue: 0 }));

  const suspended = await safeCount(
    db,
    `SELECT COUNT(*) AS c FROM tenants WHERE status IN ('suspended', 'expired')`
  );
  const platformHealth =
    tenantCount === 0 ? 100 : Math.round(((tenantCount - suspended) / tenantCount) * 100);

  return {
    totalTenants: tenantCount,
    activeUsers,
    totalRevenue: money(revenueRow?.total),
    platformHealth,
    recentSignups: (signupRows.results ?? []).map((r) => ({
      date: r.date,
      count: r.count ?? 0,
    })),
    tenantBreakdown: (breakdownRows.results ?? []).map((r) => ({
      name: r.name,
      value: r.value ?? 0,
    })),
    revenueByPlan,
  };
}

async function billingStats(db: D1Database) {
  const totalRow = await db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM subscription_payments
        WHERE status = 'success'`
    )
    .first<{ total: number }>()
    .catch(() => null);

  const mrrRow = await db
    .prepare(
      `SELECT COALESCE(SUM(
                CASE WHEN billing_cycle = 'yearly' THEN amount / 12.0 ELSE amount END
              ), 0) AS mrr
         FROM subscriptions
        WHERE status = 'active'`
    )
    .first<{ mrr: number }>()
    .catch(() => null);

  const activeSubscriptions = await safeCount(
    db,
    `SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'active'`
  );
  const cancelled = await safeCount(
    db,
    `SELECT COUNT(*) AS c FROM subscriptions WHERE status = 'cancelled'`
  );

  const totalSubs = activeSubscriptions + cancelled;
  const churnRate = totalSubs === 0 ? 0 : Math.round((cancelled / totalSubs) * 1000) / 10;

  const monthRows = await db
    .prepare(
      `SELECT substr(created_at, 1, 7) AS month,
              COALESCE(SUM(amount), 0) AS revenue
         FROM subscription_payments
        WHERE status = 'success'
        GROUP BY substr(created_at, 1, 7)`
    )
    .all<{ month: string; revenue: number }>()
    .catch(() => ({ results: [] as { month: string; revenue: number }[] }));

  // Always emit a 12-month series so the chart has a stable x-axis.
  const byMonth = new Map(
    (monthRows.results ?? []).map((r) => [r.month, money(r.revenue)] as const)
  );
  const revenueByMonth = recentMonths(12).map((month) => ({
    month,
    revenue: byMonth.get(month) ?? 0,
  }));

  return {
    totalRevenue: money(totalRow?.total),
    monthlyRecurring: Math.round(money(mrrRow?.mrr) * 100) / 100,
    activeSubscriptions,
    churnRate,
    revenueByMonth,
  };
}

/**
 * Subscriptions rendered as the invoice rows the billing page expects.
 * There is no platform `invoices` table — a subscription period *is* the
 * invoice at this level.
 */
async function listInvoices(db: D1Database, search: string, status: string, limit: number, offset: number) {
  const where: string[] = [];
  const binds: unknown[] = [];

  if (search) {
    where.push('t.company_name LIKE ?');
    binds.push(`%${search}%`);
  }
  if (status) {
    // Map the UI's invoice vocabulary onto subscription status.
    const map: Record<string, string> = {
      paid: 'active',
      overdue: 'past_due',
      cancelled: 'cancelled',
    };
    where.push('s.status = ?');
    binds.push(map[status] ?? status);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS c
         FROM subscriptions s
         LEFT JOIN tenants t ON t.id = s.tenant_id
         ${clause}`
    )
    .bind(...binds)
    .first<{ c: number }>()
    .catch(() => null);

  const rows = await db
    .prepare(
      `SELECT s.id, s.tenant_id, s.amount, s.status, s.start_date,
              s.next_billing_date, s.created_at,
              t.company_name
         FROM subscriptions s
         LEFT JOIN tenants t ON t.id = s.tenant_id
         ${clause}
        ORDER BY s.created_at DESC
        LIMIT ? OFFSET ?`
    )
    .bind(...binds, limit, offset)
    .all<any>()
    .catch(() => ({ results: [] as any[] }));

  const data = (rows.results ?? []).map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    tenantName: r.company_name ?? 'Unknown',
    amount: money(r.amount),
    status:
      r.status === 'active' ? 'paid' : r.status === 'past_due' ? 'overdue' : r.status === 'cancelled' ? 'cancelled' : 'sent',
    issueDate: r.start_date ?? r.created_at ?? '',
    dueDate: r.next_billing_date ?? '',
    ...(r.status === 'active' ? { paidDate: r.start_date ?? r.created_at ?? '' } : {}),
  }));

  return { data, total: countRow?.c ?? 0 };
}

async function listPayments(db: D1Database, search: string, limit: number, offset: number) {
  const where: string[] = [];
  const binds: unknown[] = [];

  if (search) {
    where.push('t.company_name LIKE ?');
    binds.push(`%${search}%`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) AS c
         FROM subscription_payments p
         LEFT JOIN tenants t ON t.id = p.tenant_id
         ${clause}`
    )
    .bind(...binds)
    .first<{ c: number }>()
    .catch(() => null);

  const rows = await db
    .prepare(
      `SELECT p.id, p.tenant_id, p.amount, p.status, p.payment_method, p.created_at,
              t.company_name
         FROM subscription_payments p
         LEFT JOIN tenants t ON t.id = p.tenant_id
         ${clause}
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?`
    )
    .bind(...binds, limit, offset)
    .all<any>()
    .catch(() => ({ results: [] as any[] }));

  const data = (rows.results ?? []).map((r) => ({
    id: r.id,
    tenantId: r.tenant_id,
    tenantName: r.company_name ?? 'Unknown',
    amount: money(r.amount),
    status:
      r.status === 'success' ? 'completed' : r.status === 'refunded' ? 'refunded' : r.status === 'failed' ? 'failed' : 'pending',
    method: r.payment_method ?? 'unknown',
    processedAt: r.created_at ?? '',
  }));

  return { data, total: countRow?.c ?? 0 };
}

/**
 * The platform has no log store; the webhook log is the closest real signal
 * and is what the system page surfaces as its recent event stream.
 */
async function listSystemLogs(db: D1Database, search: string, level: string, limit: number, offset: number) {
  const where: string[] = [];
  const binds: unknown[] = [];

  if (search) {
    where.push('(w.error_message LIKE ? OR w.source LIKE ?)');
    binds.push(`%${search}%`, `%${search}%`);
  }
  if (level === 'info') {
    where.push(`w.status = 'success'`);
  } else if (level) {
    where.push(`w.status != 'success'`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countRow = await db
    .prepare(`SELECT COUNT(*) AS c FROM webhook_log w ${clause}`)
    .bind(...binds)
    .first<{ c: number }>()
    .catch(() => null);

  const rows = await db
    .prepare(
      `SELECT w.id, w.source, w.status, w.error_message, w.created_at
         FROM webhook_log w
         ${clause}
        ORDER BY w.created_at DESC
        LIMIT ? OFFSET ?`
    )
    .bind(...binds, limit, offset)
    .all<any>()
    .catch(() => ({ results: [] as any[] }));

  const data = (rows.results ?? []).map((r) => ({
    id: r.id,
    timestamp: r.created_at ?? '',
    level: r.status === 'success' ? 'info' : 'error',
    service: r.source ?? 'webhook',
    message: r.error_message ?? `Webhook ${r.status ?? 'processed'}`,
    ...(r.error_message ? { details: r.error_message } : {}),
  }));

  return { data, total: countRow?.c ?? 0 };
}

async function systemHealth(db: D1Database) {
  const start = Date.now();
  let databaseConnection = true;
  try {
    await db.prepare('SELECT 1 AS ok').first();
  } catch {
    databaseConnection = false;
  }
  const responseTime = Date.now() - start;

  const recent = await listSystemLogs(db, '', 'error', 10, 0);

  // A Worker isolate exposes no CPU/memory counters. Report the honest
  // measurements we do have and zero the ones the platform cannot provide.
  return {
    status: databaseConnection ? ('healthy' as const) : ('critical' as const),
    uptime: Math.floor(Date.now() / 1000),
    responseTime,
    cpuUsage: 0,
    memoryUsage: 0,
    databaseConnection,
    cacheHealth: databaseConnection ? 'ok' : 'degraded',
    metrics: [
      {
        timestamp: new Date().toISOString(),
        cpu: 0,
        memory: 0,
        responseTime,
      },
    ],
    recentErrors: recent.data,
  };
}

// --- Dashboard & Stats --------------------------------------------

app.get('/dashboard', async (c) => {
  try {
    return success(c, await platformStats(c.env.MASTER_DB));
  } catch (err) {
    console.error('Error loading admin dashboard:', err);
    return error(c, 'Failed to load dashboard', 500);
  }
});

app.get('/stats', async (c) => {
  try {
    return success(c, await platformStats(c.env.MASTER_DB));
  } catch (err) {
    console.error('Error loading admin stats:', err);
    return error(c, 'Failed to load stats', 500);
  }
});

// --- System / Platform health -------------------------------------
// Registered before /tenants/:id etc. so the literal segments always win.

app.get('/system/health', async (c) => {
  try {
    return success(c, await systemHealth(c.env.MASTER_DB));
  } catch (err) {
    console.error('Error loading system health:', err);
    return error(c, 'Failed to load system health', 500);
  }
});

app.get('/platform/health', async (c) => {
  try {
    return success(c, await systemHealth(c.env.MASTER_DB));
  } catch (err) {
    console.error('Error loading platform health:', err);
    return error(c, 'Failed to load platform health', 500);
  }
});

app.get('/system/logs', async (c) => {
  const { page, limit, offset } = readPaging(c);
  try {
    const { data, total } = await listSystemLogs(
      c.env.MASTER_DB,
      param(c, 'search'),
      param(c, 'level'),
      limit,
      offset
    );
    return paginated(c, data, total, page, limit);
  } catch (err) {
    console.error('Error loading system logs:', err);
    return error(c, 'Failed to load system logs', 500);
  }
});

app.get('/system/metrics', async (c) => {
  try {
    const health = await systemHealth(c.env.MASTER_DB);
    return success(c, {
      metrics: health.metrics,
      responseTime: health.responseTime,
      uptime: health.uptime,
      databaseConnection: health.databaseConnection,
    });
  } catch (err) {
    console.error('Error loading system metrics:', err);
    return error(c, 'Failed to load system metrics', 500);
  }
});

// --- Billing ------------------------------------------------------

app.get('/billing', async (c) => {
  try {
    const db = c.env.MASTER_DB;
    const stats = await billingStats(db);
    const invoices = await listInvoices(db, '', '', 10, 0);
    const payments = await listPayments(db, '', 10, 0);

    return success(c, {
      ...stats,
      invoices: invoices.data,
      payments: payments.data,
    });
  } catch (err) {
    console.error('Error loading billing overview:', err);
    return error(c, 'Failed to load billing', 500);
  }
});

app.get('/billing/stats', async (c) => {
  try {
    return success(c, await billingStats(c.env.MASTER_DB));
  } catch (err) {
    console.error('Error loading billing stats:', err);
    return error(c, 'Failed to load billing stats', 500);
  }
});

app.get('/billing/invoices', async (c) => {
  const { page, limit, offset } = readPaging(c);
  try {
    const { data, total } = await listInvoices(
      c.env.MASTER_DB,
      param(c, 'search'),
      param(c, 'status'),
      limit,
      offset
    );
    return paginated(c, data, total, page, limit);
  } catch (err) {
    console.error('Error loading invoices:', err);
    return error(c, 'Failed to load invoices', 500);
  }
});

app.get('/billing/payments', async (c) => {
  const { page, limit, offset } = readPaging(c);
  try {
    const { data, total } = await listPayments(
      c.env.MASTER_DB,
      param(c, 'search'),
      limit,
      offset
    );
    return paginated(c, data, total, page, limit);
  } catch (err) {
    console.error('Error loading payments:', err);
    return error(c, 'Failed to load payments', 500);
  }
});

app.get('/billing/revenue', async (c) => {
  try {
    const db = c.env.MASTER_DB;
    const stats = await billingStats(db);
    const platform = await platformStats(db);
    return success(c, {
      totalRevenue: stats.totalRevenue,
      monthlyRecurring: stats.monthlyRecurring,
      revenueByMonth: stats.revenueByMonth,
      revenueByPlan: platform.revenueByPlan,
    });
  } catch (err) {
    console.error('Error loading revenue:', err);
    return error(c, 'Failed to load revenue', 500);
  }
});

// --- Plans --------------------------------------------------------

app.get('/plans', async (c) => {
  const catalogue = await getCatalogue(c.env);
  return success(c, catalogue.plans.filter((p) => p.isPublic).map((p) => buildPlan(p, catalogue)));
});

app.get('/plans/:id', async (c) => {
  const catalogue = await getCatalogue(c.env);
  const entry = catalogue.plans.find((p) => p.key === c.req.param('id'));
  if (!entry) return notFound(c, 'Plan');
  return success(c, buildPlan(entry, catalogue));
});

// --- Config -------------------------------------------------------

app.get('/config', async (c) => {
  // Derived from deployment settings and the plan catalog. Secrets are never
  // read here — only whether an integration is configured at all.
  const db = c.env.MASTER_DB;

  const maxTenantsPerPlan: Record<string, number> = {};
  for (const plan of (await getCatalogue(c.env)).plans) {
    maxTenantsPerPlan[plan.key] = await safeCount(
      db,
      'SELECT COUNT(*) AS c FROM tenants WHERE plan = ?',
      plan.key
    );
  }

  return success(c, {
    id: 'global',
    appName: 'TravelCRM Pro',
    appUrl: appUrl(c.env),
    supportEmail: supportEmail(c.env),
    supportPhone: '',
    maxTenantsPerPlan,
    features: {
      emailNotifications: Boolean(c.env.SENDGRID_API_KEY),
      smsNotifications: Boolean(c.env.TWILIO_ACCOUNT_SID || c.env.PLIVO_AUTH_ID),
      twoFactor: Boolean(c.env.TWILIO_VERIFY_SERVICE_SID),
      apiAccess: true,
      customDomain: true,
      whiteLabel: true,
      advancedAnalytics: Boolean(c.env.AI),
    },
    security: {
      passwordMinLength: 8,
      passwordRequireSpecialChar: false,
      passwordRequireNumbers: true,
      maxLoginAttempts: 5,
      sessionTimeoutMinutes: 15,
      requireEmailVerification: false,
    },
    email: {
      smtpHost: 'smtp.sendgrid.net',
      smtpPort: 587,
      smtpUser: 'apikey',
      fromEmail: emailFrom(c.env).email,
      fromName: emailFrom(c.env).name,
    },
  });
});

// --- Audit Logs ---------------------------------------------------

app.get('/audit-logs', async (c) => {
  const { page, limit, offset } = readPaging(c);
  const search = param(c, 'search');
  const action = param(c, 'action');

  const where: string[] = [];
  const binds: unknown[] = [];

  if (search) {
    where.push('(l.action LIKE ? OR l.entity_type LIKE ? OR a.name LIKE ? OR a.email LIKE ?)');
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (action) {
    where.push('l.action LIKE ?');
    binds.push(`%${action}%`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const db = c.env.MASTER_DB;

    const countRow = await db
      .prepare(
        `SELECT COUNT(*) AS c
           FROM super_admin_audit_log l
           LEFT JOIN super_admins a ON a.id = l.admin_id
           ${clause}`
      )
      .bind(...binds)
      .first<{ c: number }>();

    const rows = await db
      .prepare(
        `SELECT l.id, l.admin_id, l.action, l.entity_type, l.entity_id,
                l.details, l.ip_address, l.user_agent, l.created_at,
                a.name AS admin_name, a.email AS admin_email
           FROM super_admin_audit_log l
           LEFT JOIN super_admins a ON a.id = l.admin_id
           ${clause}
          ORDER BY l.created_at DESC
          LIMIT ? OFFSET ?`
      )
      .bind(...binds, limit, offset)
      .all<any>();

    const data = (rows.results ?? []).map((r) => {
      // `details` is JSON text; it carries the changed fields and, when the
      // action failed, a status marker.
      let details: Record<string, any> = {};
      try {
        details = r.details ? JSON.parse(r.details) : {};
      } catch {
        details = {};
      }

      return {
        id: r.id,
        timestamp: r.created_at ?? '',
        userId: r.admin_id ?? '',
        userName: r.admin_name ?? r.admin_email ?? 'Unknown',
        action: r.action,
        resourceType: r.entity_type ?? 'system',
        resourceId: r.entity_id ?? undefined,
        resourceName: details.name ?? undefined,
        ipAddress: r.ip_address ?? '',
        userAgent: r.user_agent ?? undefined,
        status: details.status === 'failure' ? 'failure' : 'success',
      };
    });

    return paginated(c, data, countRow?.c ?? 0, page, limit);
  } catch (err) {
    console.error('Error loading audit logs:', err);
    return error(c, 'Failed to load audit logs', 500);
  }
});

// --- Users --------------------------------------------------------

app.get('/users', async (c) => {
  const { page, limit, offset } = readPaging(c);
  const search = param(c, 'search');
  const role = param(c, 'role');
  const status = param(c, 'status');

  const where: string[] = [];
  const binds: unknown[] = [];

  if (search) {
    where.push('(u.email LIKE ? OR t.company_name LIKE ?)');
    binds.push(`%${search}%`, `%${search}%`);
  }
  if (role) {
    where.push('u.role = ?');
    binds.push(role);
  }
  if (status) {
    where.push('u.is_active = ?');
    binds.push(status === 'active' ? 1 : 0);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const db = c.env.MASTER_DB;

    const countRow = await db
      .prepare(
        `SELECT COUNT(*) AS c
           FROM tenant_users u
           LEFT JOIN tenants t ON t.id = u.tenant_id
           ${clause}`
      )
      .bind(...binds)
      .first<{ c: number }>();

    const rows = await db
      .prepare(
        `SELECT u.id, u.tenant_id, u.email, u.role, u.is_active, u.created_at,
                t.company_name
           FROM tenant_users u
           LEFT JOIN tenants t ON t.id = u.tenant_id
           ${clause}
          ORDER BY u.created_at DESC
          LIMIT ? OFFSET ?`
      )
      .bind(...binds, limit, offset)
      .all<any>();

    // `tenant_users` is the cross-tenant registry and carries no display
    // name; the local part of the email is the best label available here.
    const data = (rows.results ?? []).map((r) => ({
      id: r.id,
      name: String(r.email ?? '').split('@')[0] || r.email,
      email: r.email,
      tenantId: r.tenant_id,
      tenantName: r.company_name ?? 'Unknown',
      role: r.role,
      status: uiUserStatus(r.is_active),
      createdAt: r.created_at ?? '',
    }));

    return paginated(c, data, countRow?.c ?? 0, page, limit);
  } catch (err) {
    console.error('Error loading admin users:', err);
    return error(c, 'Failed to load users', 500);
  }
});

app.get('/users/:id', async (c) => {
  try {
    const row = await c.env.MASTER_DB.prepare(
      `SELECT u.id, u.tenant_id, u.email, u.phone, u.role, u.is_active, u.created_at,
              t.company_name
         FROM tenant_users u
         LEFT JOIN tenants t ON t.id = u.tenant_id
        WHERE u.id = ?
        LIMIT 1`
    )
      .bind(c.req.param('id'))
      .first<any>();

    if (!row) return notFound(c, 'User');

    return success(c, {
      id: row.id,
      name: String(row.email ?? '').split('@')[0] || row.email,
      email: row.email,
      phone: row.phone ?? undefined,
      tenantId: row.tenant_id,
      tenantName: row.company_name ?? 'Unknown',
      role: row.role,
      status: uiUserStatus(row.is_active),
      createdAt: row.created_at ?? '',
    });
  } catch (err) {
    console.error('Error loading admin user:', err);
    return error(c, 'Failed to load user', 500);
  }
});

// --- Tenants ------------------------------------------------------

app.get('/tenants', async (c) => {
  const paging = readPaging(c);
  // ?counts=1 adds per-agency record counts, read from each agency's own database: at most 50 agencies per request.
  const withCounts = param(c, 'counts') === '1';
  const page = paging.page;
  const limit = withCounts ? Math.min(paging.limit, 50) : paging.limit;
  const offset = (page - 1) * limit;
  const search = param(c, 'search');
  const status = param(c, 'status');

  const where: string[] = [];
  const binds: unknown[] = [];

  if (search) {
    where.push('(t.company_name LIKE ? OR t.subdomain LIKE ?)');
    binds.push(`%${search}%`, `%${search}%`);
  }
  if (status === 'active') {
    where.push(`t.status IN ('active', 'trial')`);
  } else if (status === 'suspended') {
    where.push(`t.status = 'suspended'`);
  } else if (status === 'inactive') {
    where.push(`t.status NOT IN ('active', 'trial', 'suspended')`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const db = c.env.MASTER_DB;

    const countRow = await db
      .prepare(`SELECT COUNT(*) AS c FROM tenants t ${clause}`)
      .bind(...binds)
      .first<{ c: number }>();

    // `tenants` has no email column — the tenant's admin in tenant_users is
    // the contact the UI shows, and user_count comes from the same registry.
    const rows = await db
      .prepare(
        `SELECT t.id, t.company_name, t.subdomain, t.plan, t.status, t.created_at,
                (SELECT COUNT(*) FROM tenant_users tu WHERE tu.tenant_id = t.id) AS user_count,
                (SELECT tu.email FROM tenant_users tu
                  WHERE tu.tenant_id = t.id
                  ORDER BY CASE WHEN tu.role = 'admin' THEN 0 ELSE 1 END, tu.created_at ASC
                  LIMIT 1) AS contact_email,
                (SELECT s.status FROM subscriptions s
                  WHERE s.tenant_id = t.id
                  ORDER BY s.created_at DESC LIMIT 1) AS sub_status
           FROM tenants t
           ${clause}
          ORDER BY t.created_at DESC
          LIMIT ? OFFSET ?`
      )
      .bind(...binds, limit, offset)
      .all<any>();

    const countsById = new Map<string, TenantCounts>();
    if (withCounts) {
      await Promise.all((rows.results ?? []).map(async (r) => countsById.set(r.id, await tenantCounts(c.env, r.id))));
    }

    const data = (rows.results ?? []).map((r) => ({
      id: r.id,
      name: r.company_name,
      slug: r.subdomain,
      ...(withCounts && { stats: countsById.get(r.id) }),
      email: r.contact_email ?? `${r.subdomain ?? 'tenant'}@example.com`,
      status: uiTenantStatus(r.status),
      createdAt: r.created_at ?? '',
      userCount: r.user_count ?? 0,
      subscription: {
        plan: r.plan ?? 'trial',
        status:
          r.sub_status === 'cancelled'
            ? 'cancelled'
            : r.sub_status === 'past_due'
              ? 'expired'
              : 'active',
      },
    }));

    return paginated(c, data, countRow?.c ?? 0, page, limit);
  } catch (err) {
    console.error('Error loading tenants:', err);
    return error(c, 'Failed to load tenants', 500);
  }
});

app.get('/tenants/:id', async (c) => {
  const id = c.req.param('id');

  try {
    const db = c.env.MASTER_DB;

    const row = await db
      .prepare(
        `SELECT t.id, t.company_name, t.subdomain, t.plan, t.status, t.settings,
                t.created_at,
                (SELECT tu.email FROM tenant_users tu
                  WHERE tu.tenant_id = t.id
                  ORDER BY CASE WHEN tu.role = 'admin' THEN 0 ELSE 1 END, tu.created_at ASC
                  LIMIT 1) AS contact_email,
                (SELECT tu.phone FROM tenant_users tu
                  WHERE tu.tenant_id = t.id AND tu.phone IS NOT NULL
                  ORDER BY tu.created_at ASC LIMIT 1) AS contact_phone
           FROM tenants t
          WHERE t.id = ?
          LIMIT 1`
      )
      .bind(id)
      .first<any>();

    if (!row) return notFound(c, 'Tenant');

    const sub = await db
      .prepare(
        `SELECT plan, status, next_billing_date
           FROM subscriptions
          WHERE tenant_id = ?
          ORDER BY created_at DESC
          LIMIT 1`
      )
      .bind(id)
      .first<any>()
      .catch(() => null);

    // Per-agency counts come from the agency's own database (the tenant tables have no tenant_id column).
    const userCount = await safeCount(
      db,
      'SELECT COUNT(*) AS c FROM tenant_users WHERE tenant_id = ?',
      id
    );
    const { contactCount, leadCount, invoiceCount } = await tenantCounts(c.env, id);

    let website: string | undefined;
    try {
      const settings = row.settings ? JSON.parse(row.settings) : {};
      website = settings.website ?? undefined;
    } catch {
      website = undefined;
    }

    return success(c, {
      id: row.id,
      name: row.company_name,
      email: row.contact_email ?? `${row.subdomain ?? 'tenant'}@example.com`,
      phone: row.contact_phone ?? undefined,
      status: uiTenantStatus(row.status),
      planId: row.plan ?? 'trial',
      website,
      createdAt: row.created_at ?? '',
      subscription: {
        plan: sub?.plan ?? row.plan ?? 'trial',
        status:
          sub?.status === 'cancelled'
            ? 'cancelled'
            : sub?.status === 'past_due'
              ? 'expired'
              : 'active',
        renewalDate: sub?.next_billing_date ?? undefined,
      },
      stats: { userCount, contactCount, leadCount, invoiceCount },
    });
  } catch (err) {
    console.error('Error loading tenant detail:', err);
    return error(c, 'Failed to load tenant', 500);
  }
});

export default app;
