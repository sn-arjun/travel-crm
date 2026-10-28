import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, error, notFound } from '../utils/response';
import { actorFrom, logAdminAction } from '../services/admin/audit';
import { loadSite, requestSite, retrySite, type WpSiteRow } from '../services/wordpress/sites';

/**
 * Super admin WordPress site provisioning (R309). Merged into the admin routes by routes/admin.ts (which applies
 * requireSuperAdmin: viewers and support staff can read, only super_admin can write). Every write is audited.
 *
 *   GET  /wordpress                    list with status, attempts, last error (?status= filters)
 *   GET  /wordpress/:siteId            one site with its history
 *   POST /tenants/:id/wordpress        give an agency a website (queues the build)
 *   POST /wordpress/:siteId/retry      queue a failed site again
 */
const app = new Hono<AppContext>();

const createSchema = z.object({
  companyName: z.string().trim().min(1).max(120).optional(),
  adminEmail: z.string().trim().email().max(200).optional(),
  logoUrl: z.string().trim().url().max(500).optional(),
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

/** What the console may see. Request details and internals stay out. */
function present(row: WpSiteRow & { company_name?: string | null }) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    companyName: row.company_name ?? null,
    subdomain: row.subdomain,
    status: row.status,
    siteUrl: row.site_url,
    adminUrl: row.wp_admin_url,
    domain: row.domain,
    attempts: row.attempts,
    lastError: row.error_message,
    provisionedAt: row.provisioned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

app.get('/wordpress', async (c) => {
  const status = c.req.query('status');
  const where = status && /^(queued|provisioning|active|failed|suspended)$/.test(status) ? 'WHERE w.status = ?' : '';
  const stmt = c.env.MASTER_DB.prepare(
    `SELECT w.*, t.company_name FROM wordpress_sites w LEFT JOIN tenants t ON t.id = w.tenant_id ${where}
      ORDER BY w.created_at DESC, w.rowid DESC LIMIT 200`,
  );
  const { results } = await (where ? stmt.bind(status) : stmt).all<WpSiteRow & { company_name: string | null }>();
  const counts = await c.env.MASTER_DB
    .prepare('SELECT status, COUNT(*) AS n FROM wordpress_sites GROUP BY status')
    .all<{ status: string; n: number }>();
  return success(c, {
    sites: results.map(present),
    counts: Object.fromEntries(counts.results.map((r) => [r.status, r.n])),
  });
});

app.get('/wordpress/:siteId', async (c) => {
  const row = await c.env.MASTER_DB
    .prepare('SELECT w.*, t.company_name FROM wordpress_sites w LEFT JOIN tenants t ON t.id = w.tenant_id WHERE w.id = ?')
    .bind(c.req.param('siteId'))
    .first<WpSiteRow & { company_name: string | null }>();
  if (!row) return notFound(c, 'WordPress site');
  const events = await c.env.MASTER_DB
    .prepare('SELECT id, event, status, detail, created_at FROM wordpress_site_events WHERE site_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100')
    .bind(row.id)
    .all<{ id: string; event: string; status: string | null; detail: string | null; created_at: string }>();
  return success(c, {
    site: present(row),
    history: events.results.map((e) => ({ id: e.id, event: e.event, status: e.status, detail: e.detail, at: e.created_at })),
  });
});

app.post('/tenants/:id/wordpress', zValidator('json', createSchema), async (c) => {
  const tenantId = c.req.param('id');
  const tenant = await c.env.MASTER_DB
    .prepare('SELECT id, company_name, subdomain, status, owner_email FROM tenants WHERE id = ?')
    .bind(tenantId)
    .first<{ id: string; company_name: string; subdomain: string; status: string; owner_email: string | null }>();
  if (!tenant) return notFound(c, 'Tenant');

  const body = c.req.valid('json');
  let adminEmail = body.adminEmail ?? tenant.owner_email ?? null;
  if (!adminEmail) {
    const admin = await c.env.MASTER_DB
      .prepare(`SELECT email FROM tenant_users WHERE tenant_id = ? AND role = 'admin' AND is_active = 1 ORDER BY rowid LIMIT 1`)
      .bind(tenantId)
      .first<{ email: string }>();
    adminEmail = admin?.email ?? null;
  }
  if (!adminEmail) return error(c, 'This agency has no admin email; pass adminEmail', 422);

  const actor = actorFrom(c);
  const result = await requestSite(
    c.env,
    { id: tenant.id, subdomain: tenant.subdomain },
    { companyName: body.companyName ?? tenant.company_name, adminEmail, logoUrl: body.logoUrl, primaryColor: body.primaryColor },
    actor.email,
  );

  if (result.kind === 'exists') {
    return c.json({ success: false, error: { code: 'ALREADY_EXISTS', message: `This agency already has a website (${result.site.status})` }, data: { site: present(result.site) } }, 409);
  }
  await logAdminAction(c.env, actor, result.kind === 'created' ? 'wordpress.requested' : 'wordpress.restarted', tenant.id, null, { status: result.site.status }, {
    entityType: 'wordpress_site',
    entityId: result.site.id,
  });
  return c.json({ success: true, data: { site: present({ ...result.site, company_name: tenant.company_name }) } }, 202);
});

app.post('/wordpress/:siteId/retry', async (c) => {
  const before = await loadSite(c.env, c.req.param('siteId'));
  const actor = actorFrom(c);
  const result = await retrySite(c.env, c.req.param('siteId'), actor.email);
  if (!result.ok) {
    if (result.reason === 'not_found') return notFound(c, 'WordPress site');
    return c.json({ success: false, error: { code: 'NOT_FAILED', message: `Only a failed site can be retried (this one is ${result.site?.status})` } }, 409);
  }
  await logAdminAction(c.env, actor, 'wordpress.retried', before?.tenant_id ?? null, { status: before?.status, lastError: before?.error_message }, { status: result.site.status }, {
    entityType: 'wordpress_site',
    entityId: result.site.id,
  });
  return c.json({ success: true, data: { site: present(result.site) } }, 202);
});

export default app;
