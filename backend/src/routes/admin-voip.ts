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
  RECORDING_DEFAULTS,
  TRIAL_CALLING_SETTING,
  callingAllowedOnTrial,
  getCountryPolicy,
  listCountryPolicies,
  setPlatformSetting,
} from '../services/voip/country-policy';
import { afterPlatformApproval, hasBundleFlow, refreshProviderStatus, resetProvider, submitToProvider } from '../services/voip/regulatory';
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

  SETTING_DAILY_MINUTES,
  SETTING_PLATFORM_COST,
  SETTING_SPIKE_MIN,
  DEFAULT_DAILY_MINUTES,
  DEFAULT_PLATFORM_DAILY_COST,
  DEFAULT_SPIKE_MIN_COST,
  allowedExtraCountries,
  dailyMinuteCeiling,
  fraudEventView,
  liftFraudEvent,
  tenantDailyMinutesKey,
  type FraudEventRow,
} from '../services/voip/fraud';
import { getPlatformSetting } from '../services/voip/country-policy';
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
 *   PUT     /voip/country-policy/:country        change a country's position, recording default and requirement list
 *   GET     /voip/documents?status=pending       number documents waiting for review
 *   GET     /tenants/:id/voip                    an agency's account, numbers, documents and what the policy says
 *   POST    /tenants/:id/voip/enable|suspend|resume|close
 *   PUT     /tenants/:id/voip/documents/:country approve or reject number documents (an approval in a country with a regulatory bundle also submits it to the provider, R137)
 *   POST    /tenants/:id/voip/documents/:country/submit-to-provider | refresh-status | reset   the provider side of the bundle (R137)
 *   POST    /tenants/:id/voip/numbers/:numberId/release
 *   GET     /voip/fraud-events?status=active     fraud limits that fired (blocks and flags), newest first
 *   POST    /voip/fraud-events/:id/lift          lift a block / dismiss a flag (audited)
 *   GET/PUT /voip/limits                         platform daily ceilings
 *   PUT     /tenants/:id/voip/countries          destinations the agency may call besides its own country
 *   PUT     /tenants/:id/voip/limits             the agency's own daily minute ceiling
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
  recordingDefault: z.enum(RECORDING_DEFAULTS as unknown as [string, ...string[]]).optional(),
  /** The fields and documents the agency form asks for; null removes the list (free-form upload, no provider bundle). */
  kycRequirements: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(40).regex(/^[A-Za-z][A-Za-z0-9_]*$/),
        label: z.string().trim().min(1).max(120),
        type: z.enum(['text', 'address', 'file', 'date']),
        required: z.boolean().default(true),
      }),
    )
    .max(20)
    .nullable()
    .optional(),
});

app.put('/voip/country-policy/:country', zValidator('json', policySchema), async (c) => {
  const country = c.req.param('country').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return error(c, 'Country must be a two-letter code', 400);
  const body = c.req.valid('json');
  const before = (await listCountryPolicies(c.env)).find((p) => p.country === country) ?? null;
  const requirements = body.kycRequirements === undefined ? before?.kycRequirements ?? null : body.kycRequirements;
  await c.env.MASTER_DB
    .prepare(
      `INSERT INTO call_country_policy (country, position, provider, kyc_required, notes, recording_default, kyc_requirements, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
       ON CONFLICT(country) DO UPDATE SET position = excluded.position, provider = excluded.provider,
         kyc_required = excluded.kyc_required, notes = excluded.notes, recording_default = excluded.recording_default,
         kyc_requirements = excluded.kyc_requirements, updated_at = excluded.updated_at`,
    )
    .bind(
      country,
      body.position,
      body.provider ?? before?.provider ?? null,
      body.kycRequired === undefined ? (before?.kycRequired ? 1 : 0) : body.kycRequired ? 1 : 0,
      body.notes ?? before?.notes ?? null,
      body.recordingDefault ?? before?.recordingDefault ?? 'announce',
      requirements && requirements.length > 0 ? JSON.stringify(requirements) : null,
    )
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
  const policies = await listCountryPolicies(c.env);
  return success(c, (rows.results ?? []).map((r) => ({
    tenantId: r.tenant_id,
    companyName: r.company_name,
    ...kycView(r, hasBundleFlow(policies.find((p) => p.country === r.country)), true),
  })));
});

app.get('/voip/fraud-events', async (c) => {
  const status = c.req.query('status');
  const filtered = status === 'active' || status === 'lifted';
  const rows = await c.env.MASTER_DB
    .prepare(
      `SELECT e.*, t.company_name FROM voip_fraud_events e LEFT JOIN tenants t ON t.id = e.tenant_id
        ${filtered ? 'WHERE e.status = ?' : ''} ORDER BY e.blocking DESC, e.created_at DESC LIMIT 200`,
    )
    .bind(...(filtered ? [status] : []))
    .all<FraudEventRow & { company_name: string | null }>();
  return success(c, (rows.results ?? []).map(fraudEventView));
});

app.post('/voip/fraud-events/:id/lift', async (c) => {
  const row = await liftFraudEvent(c.env, c.req.param('id'), actorFrom(c));
  if (!row) return notFound(c, 'Fraud event');
  return success(c, fraudEventView(row));
});

const limitsSchema = z.object({
  dailyMinutesPerAgency: z.number().int().min(1).max(100000).optional(),
  platformDailyCostCeiling: z.number().min(0).max(1_000_000).optional(),
  spikeMinCost: z.number().min(0).max(1_000_000).optional(),
});

async function platformLimits(env: AppContext['Bindings']) {
  const num = async (key: string, fallback: number) => {
    const raw = await getPlatformSetting(env, key);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    dailyMinutesPerAgency: await num(SETTING_DAILY_MINUTES, DEFAULT_DAILY_MINUTES),
    platformDailyCostCeiling: await num(SETTING_PLATFORM_COST, DEFAULT_PLATFORM_DAILY_COST),
    spikeMinCost: await num(SETTING_SPIKE_MIN, DEFAULT_SPIKE_MIN_COST),
  };
}

app.get('/voip/limits', async (c) => success(c, await platformLimits(c.env)));

app.put('/voip/limits', zValidator('json', limitsSchema), async (c) => {
  const body = c.req.valid('json');
  const before = await platformLimits(c.env);
  const actor = actorFrom(c)?.email ?? null;
  if (body.dailyMinutesPerAgency !== undefined) await setPlatformSetting(c.env, SETTING_DAILY_MINUTES, String(body.dailyMinutesPerAgency), actor);
  if (body.platformDailyCostCeiling !== undefined) await setPlatformSetting(c.env, SETTING_PLATFORM_COST, String(body.platformDailyCostCeiling), actor);
  if (body.spikeMinCost !== undefined) await setPlatformSetting(c.env, SETTING_SPIKE_MIN, String(body.spikeMinCost), actor);
  const after = await platformLimits(c.env);
  await logAdminAction(c.env, actorFrom(c), 'voip.limits.update', null, before, after, { entityType: 'platform_setting', entityId: 'voip_limits' });
  return success(c, after);
});

const countriesSchema = z.object({ countries: z.array(z.string().trim().length(2)).max(60) });

app.put('/tenants/:id/voip/countries', zValidator('json', countriesSchema), async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const next = [...new Set(c.req.valid('json').countries.map((x) => x.toUpperCase()))].filter((x) => /^[A-Z]{2}$/.test(x));
  const before = await allowedExtraCountries(c.env, tenant.id);
  const by = actorFrom(c)?.email ?? null;
  const statements = [
    c.env.MASTER_DB.prepare('DELETE FROM voip_allowed_countries WHERE tenant_id = ?').bind(tenant.id),
    ...next.map((country) => c.env.MASTER_DB.prepare('INSERT INTO voip_allowed_countries (tenant_id, country, created_by) VALUES (?, ?, ?)').bind(tenant.id, country, by)),
  ];
  await c.env.MASTER_DB.batch(statements);
  await logAdminAction(c.env, actorFrom(c), 'voip.countries.update', tenant.id, { countries: before }, { countries: next });
  return success(c, { countries: next });
});

const tenantLimitSchema = z.object({ dailyMinutes: z.number().int().min(1).max(100000).nullable() });

app.put('/tenants/:id/voip/limits', zValidator('json', tenantLimitSchema), async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const { dailyMinutes } = c.req.valid('json');
  const before = await dailyMinuteCeiling(c.env, tenant.id);
  if (dailyMinutes === null) {
    await c.env.MASTER_DB.prepare('DELETE FROM platform_settings WHERE key = ?').bind(tenantDailyMinutesKey(tenant.id)).run();
  } else {
    await setPlatformSetting(c.env, tenantDailyMinutesKey(tenant.id), String(dailyMinutes), actorFrom(c)?.email ?? null);
  }
  const after = await dailyMinuteCeiling(c.env, tenant.id);
  await logAdminAction(c.env, actorFrom(c), 'voip.tenant_limits.update', tenant.id, { dailyMinutes: before }, { dailyMinutes: after });
  return success(c, { dailyMinutes: after });
});

app.get('/tenants/:id/voip', async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const decision = await decisionFor(c.env, tenant);
  const docs = await c.env.MASTER_DB.prepare('SELECT * FROM number_documents WHERE tenant_id = ? ORDER BY country').bind(tenant.id).all<any>();
  const policies = await listCountryPolicies(c.env);
  const numbers = await c.env.MASTER_DB.prepare(`SELECT * FROM voip_number_registry WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100`).bind(tenant.id).all<RegistryRow>();
  return success(c, {
    tenantId: tenant.id,
    plan: tenant.plan,
    country: decision.country,
    calling: { allowed: decision.allowed, reason: decision.reason, message: decision.message, position: decision.policy?.position ?? null, kycRequired: decision.policy?.kycRequired ?? false },
    account: accountView(await getAccount(c.env, tenant.id)),
    documents: (docs.results ?? []).map((d) => kycView(d, hasBundleFlow(policies.find((p) => p.country === d.country)), true)),
    numbers: (numbers.results ?? []).map(registryView),
    ...(await callingSafety(c.env, tenant.id)),
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
  // R137: an approval in a country with a regulatory bundle hands the bundle to the provider now. A failure does not undo the
  // approval: the row shows state platform_review with the reason, and "submit to provider" tries again.
  let submission: { submitted: boolean; error: string | null } = { submitted: false, error: null };
  if (body.status === 'approved') {
    submission = await afterPlatformApproval(c.env, tenant.id, country, { baseUrl: publicBase(c) });
    if (submission.submitted) await logAdminAction(c.env, actorFrom(c), 'voip.regulatory.submit', tenant.id, null, { country, trigger: 'approval' });
  }
  return success(c, { ...(await documentView(c.env, tenant.id, country)), submittedToProvider: submission.submitted, submitError: submission.error });
});

function publicBase(c: { env: AppContext['Bindings']; req: { url: string } }): string {
  return c.env.API_PUBLIC_URL?.trim().replace(/\/+$/, '') || new URL(c.req.url).origin;
}

/** The console view of one document set after a change. */
async function documentView(env: AppContext['Bindings'], tenantId: string, country: string) {
  const row = await getKyc(env, tenantId, country);
  return kycView(row, hasBundleFlow(await getCountryPolicy(env, country)), true);
}

app.post('/tenants/:id/voip/documents/:country/submit-to-provider', async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const country = c.req.param('country').toUpperCase();
  const result = await submitToProvider(c.env, tenant.id, country, { baseUrl: publicBase(c) });
  await logAdminAction(c.env, actorFrom(c), 'voip.regulatory.submit', tenant.id, null, { country, providerStatus: result.providerStatus });
  return success(c, await documentView(c.env, tenant.id, country));
});

app.post('/tenants/:id/voip/documents/:country/refresh-status', async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const country = c.req.param('country').toUpperCase();
  if (!(await getKyc(c.env, tenant.id, country))) return notFound(c, 'Documents');
  await refreshProviderStatus(c.env, tenant.id, country);
  return success(c, await documentView(c.env, tenant.id, country));
});

app.post('/tenants/:id/voip/documents/:country/reset', async (c) => {
  const tenant = await loadTenant(c.env, c.req.param('id'));
  if (!tenant) return notFound(c, 'Tenant');
  const country = c.req.param('country').toUpperCase();
  const before = await getKyc(c.env, tenant.id, country);
  if (!before) return notFound(c, 'Documents');
  await resetProvider(c.env, tenant.id, country);
  await logAdminAction(c.env, actorFrom(c), 'voip.regulatory.reset', tenant.id, { providerStatus: before.provider_status }, { providerStatus: null, country });
  return success(c, await documentView(c.env, tenant.id, country));
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

/** R305: minutes charged this month, the import cursor, fraud events and destination limits of one agency. */
async function callingSafety(env: AppContext['Bindings'], tenantId: string) {
  const month = new Date().toISOString().slice(0, 7);
  const [cursor, minutes, events, extra, ceiling] = await Promise.all([
    env.MASTER_DB.prepare('SELECT cursor_at, last_run_at, last_error, imported_total FROM voip_usage_cursor WHERE tenant_id = ?').bind(tenantId).first<{ cursor_at: string; last_run_at: string | null; last_error: string | null; imported_total: number }>(),
    env.MASTER_DB.prepare(`SELECT COALESCE(SUM(minutes_counted), 0) AS minutes, COALESCE(SUM(provider_cost), 0) AS cost, COUNT(*) AS calls FROM call_usage WHERE tenant_id = ? AND substr(started_at, 1, 7) = ?`).bind(tenantId, month).first<{ minutes: number; cost: number; calls: number }>(),
    env.MASTER_DB.prepare('SELECT * FROM voip_fraud_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50').bind(tenantId).all<FraudEventRow>(),
    allowedExtraCountries(env, tenantId),
    dailyMinuteCeiling(env, tenantId),
  ]);
  return {
    usage: {
      month,
      minutesCounted: Number(minutes?.minutes ?? 0),
      providerCost: Math.round(Number(minutes?.cost ?? 0) * 10000) / 10000,
      calls: Number(minutes?.calls ?? 0),
      cursor: cursor ? { at: cursor.cursor_at, lastRunAt: cursor.last_run_at, lastError: cursor.last_error, imported: cursor.imported_total } : null,
    },
    fraud: {
      events: (events.results ?? []).map(fraudEventView),
      allowedCountries: extra,
      dailyMinuteCeiling: ceiling,
    },
  };
}

export default app;
