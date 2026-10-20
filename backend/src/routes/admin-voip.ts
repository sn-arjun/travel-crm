import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, error, notFound } from '../utils/response';
import { actorFrom, logAdminAction } from '../services/admin/audit';
import { loadTenant } from '../services/billing/subscriptions';
import { voipErrorHandler } from '../services/voip/http';
import {
  CALL_POSITIONS,
  TRIAL_CALLING_SETTING,
  callingAllowedOnTrial,
  listCountryPolicies,
  setPlatformSetting,
} from '../services/voip/country-policy';
import {
  accountView,
  closeAccount,
  decisionFor,
  enableCalling,
  getAccount,
  resumeAccount,
  suspendAccount,
} from '../services/voip/subaccounts';
import {
  getKyc,
  kycView,
  liveNumbers,
  registryView,
  releaseAllNumbers,
  releaseRegistered,
  reviewKyc,
  type RegistryRow,
} from '../services/voip/numbers';

/**
 * Super admin: calling for agencies (R304). Mounted by routes/admin.ts, so every route is /api/v1/admin/... behind the
 * super admin gate, and every write is audited.
 *
 *   GET/PUT /voip/settings                       the "calling on free trials" switch (default off; owner has not confirmed)
 *   GET     /voip/country-policy                 where calling is offered, and where numbers need documents
 *   PUT     /voip/country-policy/:country        change a country's position
 *   GET     /voip/documents?status=pending       number documents waiting for review
 *   GET     /tenants/:id/voip                    an agency's account, numbers, documents and what the policy says
 *   POST    /tenants/:id/voip/enable|suspend|resume|close
 *   PUT     /tenants/:id/voip/documents/:country approve or reject number documents
 *   POST    /tenants/:id/voip/numbers/:numberId/release
 */
const app = new Hono<AppContext>();
app.onError(voipErrorHandler);

const settingsSchema = z.object({ callingOnTrial: z.boolean() });

app.get('/voip/settings', async (c) => success(c, { callingOnTrial: await callingAllowedOnTrial(c.env) }));

app.put('/voip/settings', zValidator('json', settingsSchema), async (c) => {
  const { callingOnTrial } = c.req.valid('json');
  const before = await callingAllowedOnTrial(c.env);
  await setPlatformSetting(c.env, TRIAL_CALLING_SETTING, callingOnTrial ? '1' : '0', actorFrom(c)?.email ?? null);
  await logAdminAction(c.env, actorFrom(c), 'voip.settings.update', null, { callingOnTrial: before }, { callingOnTrial }, { entityType: 'platform_setting', entityId: TRIAL_CALLING_SETTING });
  return success(c, { callingOnTrial });
});

app.get('/voip/country-policy', async (c) => success(c, await listCountryPolicies(c.env)));

const policySchema = z.object({
  position: z.enum(CALL_POSITIONS as unknown as [string, ...string[]]),
  provider: z.string().trim().max(60).nullable().optional(),
  kycRequired: z.boolean().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

app.put('/voip/country-policy/:country', zValidator('json', policySchema), async (c) => {
  const country = c.req.param('country').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return error(c, 'Country must be a two-letter code', 400);
  const body = c.req.valid('json');
  const before = (await listCountryPolicies(c.env)).find((p) => p.country === country) ?? null;
  await c.env.MASTER_DB
    .prepare(
      `INSERT INTO call_country_policy (country, position, provider, kyc_required, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
       ON CONFLICT(country) DO UPDATE SET position = excluded.position, provider = excluded.provider,
         kyc_required = excluded.kyc_required, notes = excluded.notes, updated_at = excluded.updated_at`,
    )
    .bind(country, body.position, body.provider ?? before?.provider ?? null, body.kycRequired === undefined ? (before?.kycRequired ? 1 : 0) : body.kycRequired ? 1 : 0, body.notes ?? before?.notes ?? null)
    .run();
  const after = (await listCountryPolicies(c.env)).find((p) => p.country === country);
  await logAdminAction(c.env, actorFrom(c), 'voip.country_policy.update', null, before, after ?? null, { entityType: 'call_country_policy', entityId: country });
  return success(c, after);
});

app.get('/voip/documents', async (c) => {
  const status = c.req.query('status');
  const rows = await c.env.MASTER_DB
    .prepare(
      `SELECT d.*, t.company_name FROM number_documents d JOIN tenants t ON t.id = d.tenant_id
        ${status ? 'WHERE d.status = ?' : ''} ORDER BY d.updated_at DESC LIMIT 200`,
    )
    .bind(...(status ? [status] : []))
    .all<any>();
  return success(c, (rows.results ?? []).map((r) => ({ tenantId: r.tenant_id, companyName: r.company_name, ...kycView(r) })));
});

app.get('/tenants/:id/voip', async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const decision = await decisionFor(c.env, tenant);
  const docs = await c.env.MASTER_DB.prepare('SELECT * FROM number_documents WHERE tenant_id = ? ORDER BY country').bind(tenant.id).all<any>();
  const numbers = await c.env.MASTER_DB.prepare(`SELECT * FROM voip_number_registry WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100`).bind(tenant.id).all<RegistryRow>();
  return success(c, {
    tenantId: tenant.id,
    plan: tenant.plan,
    country: decision.country,
    calling: { allowed: decision.allowed, reason: decision.reason, message: decision.message, position: decision.policy?.position ?? null, kycRequired: decision.policy?.kycRequired ?? false },
    account: accountView(await getAccount(c.env, tenant.id)),
    documents: (docs.results ?? []).map(kycView),
    numbers: (numbers.results ?? []).map(registryView),
  });
});

app.post('/tenants/:id/voip/enable', async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const body = (await c.req.json().catch(() => ({}))) as { replaceOwnCredentials?: boolean };
  const { account, created } = await enableCalling(c.env, tenant.id, { replaceOwnCredentials: body.replaceOwnCredentials === true });
  await logAdminAction(c.env, actorFrom(c), 'voip.enable', tenant.id, null, { created, status: account.status, subAccountId: account.sub_account_id });
  return success(c, { created, account: accountView(account) });
});

app.post('/tenants/:id/voip/suspend', async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const account = await suspendAccount(c.env, tenant.id);
  if (!account) return error(c, 'This agency has no calling account', 409, { code: 'CALLING_NOT_ENABLED' });
  await logAdminAction(c.env, actorFrom(c), 'voip.suspend', tenant.id, null, { status: account.status });
  return success(c, { account: accountView(account) });
});

app.post('/tenants/:id/voip/resume', async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const account = await resumeAccount(c.env, tenant.id);
  if (!account) return error(c, 'This agency has no calling account', 409, { code: 'CALLING_NOT_ENABLED' });
  await logAdminAction(c.env, actorFrom(c), 'voip.resume', tenant.id, null, { status: account.status });
  return success(c, { account: accountView(account) });
});

/** Close now: every number is released at the provider, then the sub-account is closed. No grace. */
app.post('/tenants/:id/voip/close', async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const before = await liveNumbers(c.env, tenant.id);
  const account = await closeAccount(c.env, tenant.id, releaseAllNumbers);
  await logAdminAction(c.env, actorFrom(c), 'voip.close', tenant.id, { numbers: before.map((n) => n.phone_number) }, { status: account?.status ?? 'none' });
  return success(c, { account: accountView(account), released: before.map((n) => n.phone_number) });
});

const reviewSchema = z.object({ status: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() });

app.put('/tenants/:id/voip/documents/:country', zValidator('json', reviewSchema), async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const country = c.req.param('country').toUpperCase();
  const body = c.req.valid('json');
  if (body.status === 'rejected' && !body.note) return error(c, 'Say what is wrong so the agency can fix it', 400);
  const before = await getKyc(c.env, tenant.id, country);
  if (!before) return notFound(c, 'Documents');
  const row = await reviewKyc(c.env, tenant.id, country, { status: body.status, note: body.note ?? null, reviewer: actorFrom(c)?.email ?? null });
  await logAdminAction(c.env, actorFrom(c), `voip.documents.${body.status}`, tenant.id, { status: before.status }, { status: row?.status, country, note: body.note ?? null });
  return success(c, kycView(row));
});

app.post('/tenants/:id/voip/numbers/:numberId/release', async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const row = await c.env.MASTER_DB
    .prepare(`SELECT * FROM voip_number_registry WHERE id = ? AND tenant_id = ? AND status <> 'released'`)
    .bind(c.req.param('numberId'), tenant.id)
    .first<RegistryRow>();
  if (!row) return notFound(c, 'Number');
  await releaseRegistered(c.env, row, 'released_by_admin');
  await logAdminAction(c.env, actorFrom(c), 'voip.number.release', tenant.id, { phoneNumber: row.phone_number }, { status: 'released' });
  return success(c, { released: row.phone_number });
});

export default app;
