import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext, Env } from '../types';
import { requireSuperAdmin, superAdminIdFor } from '../middleware/require-super-admin';
import { generateId } from '../utils/uuid';
import { sendTransactional } from '../services/mail/transactional';
import { appUrl } from '../utils/app-urls';
import { REGIONS } from '../services/tenancy/provisioner';
import { runProvisioning, type ProvisionOutcome, type TenantRow } from '../services/tenancy/run-provisioning';

/**
 * Agency provisioning (R104). Mounted at /api/v1/admin/tenants, super admin only.
 * POST creates an agency whose admin can sign in; POST /:id/retry resumes a failed run;
 * GET /:id/provisioning reports progress. Every action writes super_admin_audit_log.
 */
const app = new Hono<AppContext>();
app.use('*', requireSuperAdmin);

const PLAN_MAX_USERS: Record<string, number> = { trial: 5, basic: 5, pro: 15, enterprise: 50 };

const createSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/, 'Slug must be 3-40 characters: a-z, 0-9 and hyphens'),
  ownerName: z.string().trim().min(1).max(120),
  ownerEmail: z.string().trim().email().max(200),
  plan: z.enum(['trial', 'basic', 'pro', 'enterprise']),
  country: z.string().trim().min(2).max(80),
  currency: z.string().trim().min(3).max(3).default('INR'),
  timezone: z.string().trim().min(2).max(64).default('Asia/Kolkata'),
  taxSystem: z.enum(['gst', 'vat', 'sales_tax', 'none']).default('gst'),
  region: z.enum(REGIONS).default('in'),
});

function fail(c: Context, status: number, code: string, message: string, details?: Record<string, unknown>) {
  return c.json({ success: false, error: { code, message, ...(details && { details }) } }, status as 400);
}

async function audit(
  c: Context<AppContext>,
  action: string,
  entityId: string,
  details: Record<string, unknown>,
): Promise<void> {
  const env = c.env as Env;
  const email = c.get('jwtPayload')?.email;
  const adminId = await superAdminIdFor(env, email);
  await env.MASTER_DB
    .prepare(
      `INSERT INTO super_admin_audit_log (id, admin_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, 'tenant', ?, ?, ?, ?)`,
    )
    .bind(
      generateId(),
      adminId,
      action,
      entityId,
      JSON.stringify({ actor: email ?? null, ...details }),
      c.get('clientIp') ?? null,
      c.req.header('User-Agent') ?? null,
    )
    .run();
}

async function loadTenant(env: Env, id: string): Promise<TenantRow | null> {
  return env.MASTER_DB.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(id).first<TenantRow>();
}

async function welcome(env: Env, tenant: TenantRow, outcome: Extract<ProvisionOutcome, { ok: true }>): Promise<boolean> {
  const res = await sendTransactional(env, {
    to: outcome.adminEmail,
    template: 'welcome_admin',
    tenantId: tenant.id,
    data: {
      agencyName: tenant.company_name,
      adminName: tenant.owner_name ?? '',
      email: outcome.adminEmail,
      temporaryPassword: outcome.temporaryPassword,
      loginUrl: appUrl(env),
    },
  });
  return res.delivered;
}

function failureResponse(c: Context, tenantId: string, out: Extract<ProvisionOutcome, { ok: false }>) {
  return fail(c, out.httpStatus, out.code, out.message, { step: out.step, tenantId: out.purged ? null : tenantId, retryable: !out.purged });
}

async function finish(c: Context<AppContext>, tenant: TenantRow, out: ProvisionOutcome, action: string) {
  const env = c.env as Env;
  if (!out.ok) {
    await audit(c, `${action}_failed`, tenant.id, { step: out.step, code: out.code, purged: out.purged });
    return failureResponse(c, tenant.id, out);
  }
  // Only an agency that can already sign in gets the welcome mail; a pending deploy is mailed by the operator flow later.
  const emailed = out.status === 'active' ? await welcome(env, tenant, out) : false;
  await audit(c, action, tenant.id, { slug: tenant.subdomain, plan: tenant.plan, provisioningStatus: out.status, emailed });
  return c.json(
    {
      success: true,
      data: {
        tenantId: tenant.id,
        slug: tenant.subdomain,
        provisioningStatus: out.status,
        adminEmail: out.adminEmail,
        temporaryPassword: out.temporaryPassword,
        welcomeEmailSent: emailed,
      },
    },
    action === 'tenant.create' ? 201 : 200,
  );
}

app.post('/', zValidator('json', createSchema), async (c) => {
  const env = c.env as Env;
  const body = c.req.valid('json');

  const taken = await env.MASTER_DB.prepare(`SELECT id FROM tenants WHERE subdomain = ?`).bind(body.slug).first();
  if (taken) return fail(c, 409, 'SLUG_TAKEN', `The slug "${body.slug}" is already in use`);

  const tenantId = generateId();
  const now = new Date().toISOString();
  const next = new Date();
  if (body.plan === 'trial') next.setDate(next.getDate() + 14);
  else next.setMonth(next.getMonth() + 1);

  try {
    await env.MASTER_DB.batch([
      env.MASTER_DB
        .prepare(
          `INSERT INTO tenants (id, company_name, subdomain, plan, status, max_users, settings, provisioning_status, owner_email, owner_name, country, created_by_admin, region)
           VALUES (?, ?, ?, ?, 'provisioning', ?, ?, 'creating_db', ?, ?, ?, ?, ?)`,
        )
        .bind(
          tenantId,
          body.companyName,
          body.slug,
          body.plan,
          PLAN_MAX_USERS[body.plan],
          JSON.stringify({ currency: body.currency.toUpperCase(), timezone: body.timezone, taxSystem: body.taxSystem }),
          body.ownerEmail.toLowerCase(),
          body.ownerName,
          body.country,
          c.get('jwtPayload')?.email ?? null,
          body.region,
        ),
      env.MASTER_DB
        .prepare(
          `INSERT INTO subscriptions (id, tenant_id, plan, amount, billing_cycle, start_date, next_billing_date, status)
           VALUES (?, ?, ?, 0, 'monthly', ?, ?, ?)`,
        )
        .bind(generateId(), tenantId, body.plan, now, next.toISOString(), body.plan === 'trial' ? 'trial' : 'active'),
    ]);
  } catch (err) {
    if (/UNIQUE|constraint/i.test(err instanceof Error ? err.message : '')) return fail(c, 409, 'SLUG_TAKEN', `The slug "${body.slug}" is already in use`);
    throw err;
  }

  const tenant = (await loadTenant(env, tenantId))!;
  const out = await runProvisioning(env, tenant);
  return finish(c, tenant, out, 'tenant.create');
});

app.post('/:id/retry', async (c) => {
  const env = c.env as Env;
  const tenant = await loadTenant(env, c.req.param('id'));
  if (!tenant) return fail(c, 404, 'NOT_FOUND', 'Tenant not found');
  if (tenant.provisioning_status !== 'failed') {
    return fail(c, 409, 'NOT_RETRYABLE', `Provisioning is "${tenant.provisioning_status}", only a failed run can be retried`);
  }
  const out = await runProvisioning(env, tenant);
  return finish(c, tenant, out, 'tenant.provision_retry');
});

app.get('/:id/provisioning', async (c) => {
  const env = c.env as Env;
  const row = await env.MASTER_DB
    .prepare(`SELECT id, subdomain, status, provisioning_status, provisioning_error, db_binding FROM tenants WHERE id = ?`)
    .bind(c.req.param('id'))
    .first<{ id: string; subdomain: string; status: string; provisioning_status: string; provisioning_error: string | null; db_binding: string | null }>();
  if (!row) return fail(c, 404, 'NOT_FOUND', 'Tenant not found');
  return c.json({
    success: true,
    data: {
      tenantId: row.id,
      slug: row.subdomain,
      tenantStatus: row.status,
      provisioningStatus: row.provisioning_status,
      provisioningError: row.provisioning_error,
      dbBinding: row.db_binding,
      deployNeeded: row.provisioning_status === 'pending_deploy',
    },
  });
});

export default app;
