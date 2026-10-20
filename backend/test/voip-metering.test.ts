import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { twilioSignature } from '../src/middleware/provider-signature';
import { MockVoipProvider } from '../src/services/voip/mock-provider';
import { importTenantUsage, minuteWeight } from '../src/services/voip/metering';
import { checkSpend } from '../src/services/voip/fraud';
import { classifyDestination } from '../src/services/voip/destinations';
import { getCatalogue } from '../src/services/plans/catalogue';
import { JOB_SETS, runTenantJobSet } from '../src/cron/dispatch';
import { listOutbox } from '../src/services/mail/transactional';
import { superAdminToken } from './utils/super-admin';

// R305: call minutes are charged from the provider's usage records (once per provider call id) against the plan cap and
// minute packs, and the fraud limits stop pumped or runaway calling. The provider is the in-memory mock; nothing leaves the test.

const testEnv = env as any;
const OWNER_EMAIL = 'owner-r305@test.local';
const mockEnv = { ...testEnv, VOIP_PROVIDER: 'mock', SUPER_ADMIN_EMAIL: OWNER_EMAIL } as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const OTHER_TENANT = '00000000-0000-0000-0000-0000000305bb';
const SA_ID = '01960000-0000-7000-8000-0000000305aa';
const SUB_ACCOUNT = 'ACmockr305000000000000000000000001';
const AGENCY_NUMBER = '+442079460305';
const CUSTOMER = '+447700900123';

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = mockEnv): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function webhook(path: string, fields: Record<string, string>): Promise<Response> {
  const base = testEnv.API_PUBLIC_URL ? String(testEnv.API_PUBLIC_URL).replace(/[/]+$/, '') : 'http://localhost';
  const signature = await twilioSignature(`${base}/api/v1/voip${path}`, fields, testEnv.TWILIO_AUTH_TOKEN);
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1/voip${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': signature },
      body: new URLSearchParams(fields).toString(),
    }),
    mockEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}
const one = async <T = Record<string, any>>(sql: string, ...binds: unknown[]) => (await rows<T>(sql, ...binds))[0];
const run = (sql: string, ...binds: unknown[]) => testEnv.MASTER_DB.prepare(sql).bind(...binds).run();
const json = async (res: Response) => (await res.json()) as any;

const period = () => new Date().toISOString().slice(0, 7);
let admin = '';
let adminId = '';
let sa = '';
let seq = 0;

const usedMinutes = async () => Number((await one("SELECT current_usage AS n FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = 'call_minutes_per_month'", TENANT_ID))?.n ?? 0);
const grantMinutes = (units: number) =>
  run(
    `INSERT INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source) VALUES (?, ?, 'call_minutes_100_west', 1, ?, ?, 'super_admin_grant')`,
    `r305-pack-${++seq}-${Math.random().toString(16).slice(2)}`, TENANT_ID, units, period(),
  );

/** A finished provider call as the provider's records show it. */
function usage(over: Partial<{ id: string; seconds: number; direction: 'inbound' | 'outbound'; to: string; from: string; cost: number; at: Date; leg: 'agent' | 'customer' | 'dial'; parent: string }> = {}) {
  const id = over.id ?? `CA-r305-${++seq}`;
  const direction = over.direction ?? 'outbound';
  const seconds = over.seconds ?? 61;
  const billed = seconds > 0 ? Math.ceil(seconds / 60) * 60 : 0;
  MockVoipProvider.addUsage(SUB_ACCOUNT, {
    providerCallId: id,
    direction,
    to: over.to ?? (direction === 'outbound' ? CUSTOMER : AGENCY_NUMBER),
    from: over.from ?? (direction === 'outbound' ? AGENCY_NUMBER : CUSTOMER),
    startedAt: (over.at ?? new Date(Date.now() - 60_000)).toISOString(),
    durationSeconds: seconds,
    billedSeconds: billed,
    cost: over.cost ?? Math.round((billed / 60) * 0.014 * 10000) / 10000,
    currency: 'USD',
    ...(over.leg ? { leg: over.leg } : {}),
    ...(over.parent ? { parentCallId: over.parent } : {}),
  });
  return id;
}

async function reset(): Promise<void> {
  for (const sql of [
    'DELETE FROM call_usage', 'DELETE FROM voip_usage_cursor', 'DELETE FROM voip_fraud_events', 'DELETE FROM voip_allowed_countries',
    "DELETE FROM metered_events WHERE event_key LIKE 'call-minutes:%' OR event_key LIKE 'call:%'",
    "DELETE FROM tenant_usage_caps WHERE cap_key = 'call_minutes_per_month'", "DELETE FROM usage_alerts WHERE cap_key = 'call_minutes_per_month'",
    "DELETE FROM tenant_addons WHERE product_key LIKE 'call_minutes%'", 'DELETE FROM call_logs',
    "DELETE FROM platform_settings WHERE key LIKE 'voip_daily_minutes%' OR key IN ('voip_platform_daily_cost_ceiling', 'voip_spike_min_cost')",
  ]) await run(sql);
  MockVoipProvider.reset();
  await call('DELETE', '/test/outbox', null);
}

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  await run("INSERT INTO settings (key, value) VALUES ('country', 'GB') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  await run("UPDATE tenants SET country = 'GB', plan = 'pro', status = 'active' WHERE id = ?", TENANT_ID);
  await run('DELETE FROM voip_accounts');
  await run('DELETE FROM voip_number_registry');
  await run(
    "INSERT INTO voip_accounts (tenant_id, provider, sub_account_id, credentials_enc, status) VALUES (?, 'twilio', ?, 'sealed', 'active')",
    TENANT_ID, SUB_ACCOUNT,
  );
  const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
  admin = (await json(login)).data.accessToken;
  adminId = (await one<{ id: string }>("SELECT id FROM users WHERE email = 'admin@e2e.test'")).id;
  sa = await superAdminToken(testEnv, { id: SA_ID, email: 'r305-sa@test.local', name: 'R305 Admin' });
  // The agency owns its number through the registry (the purchase path); registering it as a voice line follows.
  await call('POST', '/test/voip/own-number', null, { tenantId: TENANT_ID, phoneNumber: AGENCY_NUMBER, country: 'GB' });
  expect((await call('POST', '/integrations/channels', admin, { channel: 'voice', address: AGENCY_NUMBER, provider: 'twilio', label: 'R305 line' })).status).toBe(201);
  await run("INSERT OR REPLACE INTO voip_settings (id, voip_provider, routing_strategy, default_caller_id) VALUES ('r305-voip', 'twilio', 'assigned', ?)", AGENCY_NUMBER);
});

afterAll(async () => {
  await reset();
  await run('DELETE FROM voip_accounts');
  await run('DELETE FROM voip_number_registry');
  await run("DELETE FROM tenant_channel_addresses WHERE channel = 'voice'");
  await run('DELETE FROM voip_settings');
  await run("UPDATE tenants SET country = NULL WHERE id = ?", TENANT_ID);
  await run("DELETE FROM settings WHERE key = 'country'");
  vi.restoreAllMocks();
});

beforeEach(reset);
afterEach(() => vi.restoreAllMocks());

const place = (toNumber = CUSTOMER, token = admin) => call('POST', '/calls/outbound', token, { toNumber });

describe('minutes come from the provider records, once per provider call id', () => {
  it('a replayed or overlapping import charges each provider call once, and the cursor makes the next window small', async () => {
    await grantMinutes(100);
    const a = usage({ seconds: 61 }); // 2 started minutes
    usage({ seconds: 30 }); // 1
    const first = await importTenantUsage(mockEnv, TENANT_ID);
    expect(first).toMatchObject({ fetched: 2, charged: 2, minutes: 3 });
    expect(await usedMinutes()).toBe(3);

    // The same window again (a crash and a retry), and an overlapping window after a new call: nothing is charged twice.
    const replay = await importTenantUsage(mockEnv, TENANT_ID);
    expect(replay).toMatchObject({ charged: 0, alreadyCharged: 2, minutes: 0 });
    usage({ seconds: 119 }); // 2
    const next = await importTenantUsage(mockEnv, TENANT_ID);
    expect(next).toMatchObject({ charged: 1, minutes: 2 });
    expect(await usedMinutes()).toBe(5);

    expect(await rows('SELECT provider_call_id FROM call_usage')).toHaveLength(3);
    expect(await rows("SELECT event_key FROM metered_events WHERE event_key LIKE 'call-minutes:%'")).toHaveLength(3);
    expect((await one('SELECT minutes_counted AS m, billed_seconds AS b, direction FROM call_usage WHERE provider_call_id = ?', a))).toEqual({ m: 2, b: 120, direction: 'outbound' });
    const cursor = await one<{ cursor_at: string; last_error: string | null }>('SELECT cursor_at, last_error FROM voip_usage_cursor WHERE tenant_id = ?', TENANT_ID);
    expect(cursor.last_error).toBeNull();
    expect(Date.parse(cursor.cursor_at)).toBeGreaterThan(Date.now() - 5 * 60_000);
  });

  it('a failed fetch keeps the cursor and the error; the next run picks up where it stopped (resumable)', async () => {
    await grantMinutes(100);
    usage({ seconds: 60 });
    await importTenantUsage(mockEnv, TENANT_ID);
    const before = (await one<{ cursor_at: string }>('SELECT cursor_at FROM voip_usage_cursor WHERE tenant_id = ?', TENANT_ID)).cursor_at;
    usage({ seconds: 60 });
    vi.spyOn(MockVoipProvider.prototype, 'fetchUsage').mockRejectedValueOnce(new Error('provider unavailable'));
    const failed = await importTenantUsage(mockEnv, TENANT_ID);
    expect(failed.error).toContain('provider unavailable');
    const row = await one<{ cursor_at: string; last_error: string }>('SELECT cursor_at, last_error FROM voip_usage_cursor WHERE tenant_id = ?', TENANT_ID);
    expect(row.cursor_at).toBe(before);
    expect(row.last_error).toContain('provider unavailable');
    expect(await usedMinutes()).toBe(1);

    const again = await importTenantUsage(mockEnv, TENANT_ID);
    expect(again).toMatchObject({ charged: 1 });
    expect(await usedMinutes()).toBe(2);
    expect((await one<{ last_error: string | null }>('SELECT last_error FROM voip_usage_cursor WHERE tenant_id = ?', TENANT_ID)).last_error).toBeNull();
  });

  it('is a tenant job on the five-minute schedule', async () => {
    expect(JOB_SETS.every5.map((j) => j.name)).toContain('voip.usage-import');
    await grantMinutes(100);
    usage({ seconds: 60 });
    const result = await runTenantJobSet(mockEnv, TENANT_ID, testEnv.MASTER_DB, 'every5', new Date().toISOString());
    expect(result.ran).toContain('voip.usage-import');
    expect(result.failed).toEqual([]);
    expect(await usedMinutes()).toBe(1);
  });

  it('the status callback alone counts nothing: only the provider record does', async () => {
    await grantMinutes(100);
    await run("INSERT INTO call_logs (id, direction, from_number, to_number, status, provider_call_id, created_by) VALUES ('r305-cb', 'outbound', ?, ?, 'in-progress', 'CA-r305-cb', ?)", AGENCY_NUMBER, CUSTOMER, adminId);
    const done = { CallSid: 'CA-r305-cb', CallStatus: 'completed', CallDuration: '125', To: CUSTOMER, From: AGENCY_NUMBER };
    expect((await webhook('/status-callback', done)).status).toBe(200);
    expect(await usedMinutes()).toBe(0);
    usage({ id: 'CA-r305-cb', seconds: 125 });
    await importTenantUsage(mockEnv, TENANT_ID);
    expect(await usedMinutes()).toBe(3);
  });

  it('weights a dear destination by its unit cost against the agency base minute; weight 1 when no cost is known', async () => {
    await grantMinutes(100);
    const catalogue = await getCatalogue(mockEnv);
    const gb = { country: 'GB', market: 'WEST' };
    expect(minuteWeight(catalogue, gb, 'GB')).toBe(1);
    expect(minuteWeight(catalogue, gb, 'US')).toBe(1); // cheaper than home: never below one minute
    expect(minuteWeight(catalogue, gb, 'AU')).toBeCloseTo(0.0763 / 0.0213, 1);
    expect(minuteWeight(catalogue, gb, 'ZZ')).toBe(1);
    expect(minuteWeight(catalogue, gb, null)).toBe(1);
    // An agency whose country has no row is measured against its market's row.
    expect(minuteWeight(catalogue, { country: 'FR', market: 'WEST' }, 'GB')).toBeCloseTo(0.0213 / 0.0136, 1);

    usage({ seconds: 60, to: '+61291234567' }); // Australia from a UK agency: 0.0763 / 0.0213 = 3.58 -> 4 minutes for one
    usage({ seconds: 60, to: CUSTOMER }); // home country: 1
    await importTenantUsage(mockEnv, TENANT_ID);
    expect(await usedMinutes()).toBe(5);
    expect((await one('SELECT destination_country AS c, minutes_counted AS m FROM call_usage WHERE destination_country = ?', 'AU'))).toMatchObject({ c: 'AU', m: 4 });

    // Equal costs disable the rule.
    const flat = { ...(await getCatalogue(mockEnv)) };
    flat.unitCosts = flat.unitCosts.map((u) => (u.channel === 'call_minute' ? { ...u, unitCost: 0.0136 } : u));
    expect(minuteWeight(flat, gb, 'AU')).toBe(1);
  });

  it('only the customer leg counts: the agent leg and a child of an inbound call are cost only', async () => {
    await grantMinutes(100);
    usage({ id: 'CA-parent-out', seconds: 60, leg: 'agent', to: 'client:u_abc' });
    usage({ id: 'CA-child-out', seconds: 60, leg: 'dial', parent: 'CA-parent-out', at: new Date(Date.now() - 30_000) });
    usage({ id: 'CA-in', seconds: 120, direction: 'inbound', leg: 'customer' });
    usage({ id: 'CA-child-in', seconds: 120, direction: 'outbound', leg: 'dial', parent: 'CA-in', to: 'client:u_abc', at: new Date(Date.now() - 30_000) });
    await importTenantUsage(mockEnv, TENANT_ID);
    const byId = Object.fromEntries((await rows('SELECT provider_call_id AS id, leg, minutes_counted AS m FROM call_usage')).map((r) => [r.id, r]));
    expect(byId['CA-parent-out']).toMatchObject({ leg: 'agent', m: 0 });
    expect(byId['CA-child-out']).toMatchObject({ leg: 'customer', m: 1 });
    expect(byId['CA-in']).toMatchObject({ leg: 'customer', m: 2 });
    expect(byId['CA-child-in']).toMatchObject({ leg: 'agent', m: 0 });
    expect(await usedMinutes()).toBe(3);
  });

  it('an agency with no sub-account has nothing to import', async () => {
    const res = await importTenantUsage(mockEnv, OTHER_TENANT);
    expect(res.skipped).toBe('no_account');
  });
});

describe('the cap: outbound is refused with the way out, an ongoing call is not cut, inbound still rings', () => {
  it('at the cap a new outbound call is refused with ALLOWANCE_EXHAUSTED, upgrade and the minute pack priced at cost + 20%; a pack grant re-enables it', async () => {
    await grantMinutes(2);
    usage({ seconds: 120 }); // 2 minutes: the pack is used up
    await importTenantUsage(mockEnv, TENANT_ID);
    expect(await usedMinutes()).toBe(2);

    const refused = await place();
    expect(refused.status).toBe(402);
    const body = await json(refused);
    expect(body).toMatchObject({ code: 'ALLOWANCE_EXHAUSTED', channel: 'call_minute', used: 2, allowance: 2 });
    expect(body.options).toEqual(['upgrade', 'top_up']);
    const pack = body.addons.find((a: any) => a.key === 'call_minutes_100_west');
    expect(pack).toBeTruthy();
    // 100 minutes x 0.0136 x 1.2 = 1.632, rounded up to the cent; never below cost x 1.2.
    expect(pack.price).toBe(1.64);
    expect(pack.price).toBeGreaterThanOrEqual(100 * 0.0136 * 1.2);
    expect(await rows('SELECT id FROM call_logs')).toHaveLength(0);
    expect(MockVoipProvider.calls).toHaveLength(0);

    await grantMinutes(100);
    const ok = await place();
    expect(ok.status).toBe(201);
    expect(MockVoipProvider.calls).toHaveLength(1);
  });

  it('a call in progress is never cut: it finishes past the cap and its minutes are counted', async () => {
    await grantMinutes(1);
    const started = await place();
    expect(started.status).toBe(201);
    const providerCallId = (await json(started)).data.providerCallId;
    // The cap is reached while the call runs (another agent's call finished); then this call ends 10 minutes long.
    usage({ seconds: 60 });
    await importTenantUsage(mockEnv, TENANT_ID);
    expect((await place()).status).toBe(402);
    expect(MockVoipProvider.calls.find((c) => c.providerCallId === providerCallId)?.ended).toBe(false);
    MockVoipProvider.completeCall(providerCallId, 600, { subAccountId: SUB_ACCOUNT, startedAt: new Date(Date.now() - 30_000).toISOString() });
    await importTenantUsage(mockEnv, TENANT_ID);
    expect(await usedMinutes()).toBe(11);
    expect((await place()).status).toBe(402);
  });

  it('an inbound call over the cap still rings and its minutes are counted, never blocking the caller', async () => {
    await grantMinutes(1);
    usage({ seconds: 60 });
    await importTenantUsage(mockEnv, TENANT_ID);
    expect((await place()).status).toBe(402);

    const ring = await webhook('/twiml/inbound', { CallSid: 'CA-r305-in', From: '+447700900555', To: AGENCY_NUMBER });
    expect(ring.status).toBe(200);
    expect(await ring.text()).toContain('<Client>');

    usage({ id: 'CA-r305-in', direction: 'inbound', seconds: 180, from: '+447700900555' });
    await importTenantUsage(mockEnv, TENANT_ID);
    expect(await usedMinutes()).toBe(4); // past the allowance of 1: counted, and nothing else changes
    const again = await webhook('/twiml/inbound', { CallSid: 'CA-r305-in-2', From: '+447700900556', To: AGENCY_NUMBER });
    expect(await again.text()).toContain('<Client>');
  });

  it('sends the provider a two hour time limit with every call', async () => {
    await grantMinutes(100);
    expect((await place()).status).toBe(201);
    expect(MockVoipProvider.calls[0].maxDurationSeconds).toBe(7200);
  });
});

describe('fraud limits', () => {
  beforeEach(() => grantMinutes(1000));

  it('classifies premium, satellite and country prefixes', () => {
    expect(classifyDestination('+88213456789').blocked?.why).toContain('international network');
    expect(classifyDestination('+870123456789').blocked?.why).toContain('satellite');
    expect(classifyDestination('+442071234567').blocked).toBeNull();
    expect(classifyDestination('+449091234567').blocked).not.toBeNull();
    expect(classifyDestination('+19005551234').blocked).not.toBeNull();
    expect(classifyDestination('+18765551234').blocked).not.toBeNull();
    expect(classifyDestination('+14155550123')).toMatchObject({ country: 'US', blocked: null });
    expect(classifyDestination('+14165550123').country).toBe('CA');
    expect(classifyDestination('+61291234567').country).toBe('AU');
  });

  it('a premium or satellite number is refused outright, even in an allowed country, and the attempt is flagged', async () => {
    await run("INSERT INTO voip_allowed_countries (tenant_id, country) VALUES (?, 'US')", TENANT_ID);
    for (const number of ['+882134567890', '+19005551234', '+449091234567', '+871234567890']) {
      const res = await place(number);
      expect(res.status, number).toBe(403);
      expect((await json(res)).code).toBe('DESTINATION_BLOCKED');
    }
    expect(MockVoipProvider.calls).toHaveLength(0);
    expect(await rows('SELECT id FROM call_logs')).toHaveLength(0);
    expect(await one("SELECT kind, occurrences, blocking FROM voip_fraud_events WHERE kind = 'blocked_destination'")).toMatchObject({ occurrences: 4, blocking: 0 });
  });

  it('only the agency country is callable until the super admin switches another on (audited); the agency cannot change it', async () => {
    const refused = await place('+33142685300');
    expect(refused.status).toBe(403);
    expect(await json(refused)).toMatchObject({ code: 'DESTINATION_NOT_ALLOWED', details: { country: 'FR', allowed: ['GB'] } });
    // The agency has no way to change the list.
    expect((await call('PUT', `/admin/tenants/${TENANT_ID}/voip/countries`, admin, { countries: ['FR'] })).status).toBeGreaterThanOrEqual(401);

    const set = await call('PUT', `/admin/tenants/${TENANT_ID}/voip/countries`, sa, { countries: ['fr'] });
    expect(set.status).toBe(200);
    expect((await place('+33142685300')).status).toBe(201);
    const audit = await one("SELECT details FROM super_admin_audit_log WHERE action = 'voip.countries.update' ORDER BY rowid DESC LIMIT 1");
    expect(JSON.parse(audit.details)).toMatchObject({ before: { countries: [] }, after: { countries: ['FR'] }, actor: 'r305-sa@test.local' });
  });

  it('the 11th call in a minute is blocked (10 a minute per agent)', async () => {
    for (let i = 0; i < 10; i++) {
      await run("INSERT INTO call_logs (id, direction, from_number, to_number, status, created_by) VALUES (?, 'outbound', ?, ?, 'completed', ?)", `r305-rate-${i}`, AGENCY_NUMBER, CUSTOMER, adminId);
    }
    const res = await place();
    expect(res.status).toBe(429);
    expect((await json(res)).code).toBe('CALL_RATE_LIMITED');
    expect(MockVoipProvider.calls).toHaveLength(0);
    // A minute later the same agent can call again.
    await run("UPDATE call_logs SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 minutes')");
    expect((await place()).status).toBe(201);
  });

  it('a fourth call at once is blocked (3 concurrent per agent)', async () => {
    for (let i = 0; i < 3; i++) {
      await run("INSERT INTO call_logs (id, direction, from_number, to_number, status, created_by, created_at) VALUES (?, 'outbound', ?, ?, 'in-progress', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes'))", `r305-live-${i}`, AGENCY_NUMBER, CUSTOMER, adminId);
    }
    const res = await place();
    expect(res.status).toBe(429);
    expect((await json(res)).code).toBe('TOO_MANY_CONCURRENT_CALLS');
  });

  it('the daily minute ceiling raises a blocking event the super admin sees, audited, and can lift', async () => {
    expect((await call('PUT', `/admin/tenants/${TENANT_ID}/voip/limits`, sa, { dailyMinutes: 5 })).status).toBe(200);
    await run("INSERT INTO call_logs (id, direction, from_number, to_number, status, duration_seconds, created_by) VALUES ('r305-day', 'outbound', ?, ?, 'completed', 300, ?)", AGENCY_NUMBER, CUSTOMER, adminId);

    const first = await place();
    expect(first.status).toBe(403);
    expect((await json(first)).code).toBe('DAILY_LIMIT_REACHED');
    const second = await place();
    expect((await json(second)).code).toBe('CALLING_BLOCKED');

    const list = await json(await call('GET', '/admin/voip/fraud-events?status=active', sa));
    const event = list.data.find((e: any) => e.kind === 'daily_minutes');
    expect(event).toMatchObject({ tenantId: TENANT_ID, blocking: true, status: 'active', detail: { minutesToday: 5, ceiling: 5 } });
    const detail = await json(await call('GET', `/admin/tenants/${TENANT_ID}/voip`, sa));
    expect(detail.data.fraud.events.some((e: any) => e.id === event.id && e.blocking)).toBe(true);
    expect(await one("SELECT action FROM super_admin_audit_log WHERE action = 'voip.fraud.daily_minutes'")).toBeTruthy();

    // An agency user cannot lift it.
    expect((await call('POST', `/admin/voip/fraud-events/${event.id}/lift`, admin)).status).toBeGreaterThanOrEqual(401);
    const lifted = await call('POST', `/admin/voip/fraud-events/${event.id}/lift`, sa);
    expect(lifted.status).toBe(200);
    expect((await json(lifted)).data).toMatchObject({ status: 'lifted', blocking: false, liftedBy: 'r305-sa@test.local' });
    const audit = await one("SELECT details FROM super_admin_audit_log WHERE action = 'voip.fraud.lift'");
    expect(JSON.parse(audit.details)).toMatchObject({ before: { kind: 'daily_minutes', status: 'active' }, after: { status: 'lifted' }, actor: 'r305-sa@test.local' });

    expect((await place()).status).toBe(201);
    // A lifted block is not raised again the same day.
    expect(await rows("SELECT id FROM voip_fraud_events WHERE kind = 'daily_minutes'")).toHaveLength(1);
  });

  it('a spend spike (more than 3x the 14-day average) raises a flag and one email to the owner; a platform ceiling does too', async () => {
    const insertCost = (id: string, when: Date, cost: number) =>
      run(
        `INSERT INTO call_usage (id, tenant_id, provider_call_id, direction, billed_seconds, provider_cost, started_at) VALUES (?, ?, ?, 'outbound', 60, ?, ?)`,
        id, TENANT_ID, `CA-spend-${id}`, cost, when.toISOString(),
      );
    for (let d = 1; d <= 14; d++) await insertCost(`h${d}`, new Date(Date.now() - d * 86_400_000 - 3600_000), 1); // about 1 a day
    await insertCost('t1', new Date(), 2); // a normal day: no flag
    expect(await checkSpend(mockEnv, TENANT_ID)).toMatchObject({ spike: false });
    expect(await rows('SELECT id FROM voip_fraud_events')).toHaveLength(0);

    await insertCost('t2', new Date(Date.now() - 1000), 30);
    expect(await checkSpend(mockEnv, TENANT_ID)).toMatchObject({ spike: true });
    await checkSpend(mockEnv, TENANT_ID);
    const flags = await rows("SELECT kind, blocking, notified_at, occurrences FROM voip_fraud_events WHERE kind = 'spend_spike'");
    expect(flags).toHaveLength(1);
    expect(flags[0].blocking).toBe(0);
    expect(flags[0].notified_at).toBeTruthy();
    const mails = await listOutbox(mockEnv, OWNER_EMAIL);
    expect(mails.filter((m) => m.subject.includes('spend spike'))).toHaveLength(1);

    expect((await call('PUT', '/admin/voip/limits', sa, { platformDailyCostCeiling: 10 })).status).toBe(200);
    expect(await checkSpend(mockEnv, TENANT_ID)).toMatchObject({ platform: true });
    expect(await one("SELECT tenant_id FROM voip_fraud_events WHERE kind = 'platform_ceiling'")).toEqual({ tenant_id: '*' });
    expect((await json(await call('GET', '/admin/voip/fraud-events?status=active', sa))).data.map((e: any) => e.kind)).toEqual(expect.arrayContaining(['spend_spike', 'platform_ceiling']));
  });

  it('a usage import that finds a cost spike raises the flag by itself', async () => {
    for (let d = 1; d <= 14; d++) {
      await run(`INSERT INTO call_usage (id, tenant_id, provider_call_id, direction, billed_seconds, provider_cost, started_at) VALUES (?, ?, ?, 'outbound', 60, 1, ?)`, `x${d}`, TENANT_ID, `CA-hist-${d}`, new Date(Date.now() - d * 86_400_000 - 3600_000).toISOString());
    }
    usage({ seconds: 60, cost: 40 });
    await importTenantUsage(mockEnv, TENANT_ID);
    expect(await one("SELECT kind FROM voip_fraud_events WHERE kind = 'spend_spike'")).toBeTruthy();
  });
});

describe('registering a voice line (R304 follow-up)', () => {
  beforeEach(async () => {
    await run("DELETE FROM voip_number_registry WHERE phone_number IN ('+442079460391', '+442079460392', '+442079460393')");
    await run("DELETE FROM tenant_channel_addresses WHERE address IN ('+442079460391', '+442079460392', '+442079460393')");
  });

  const register = (address: string, channel = 'voice') => call('POST', '/integrations/channels', admin, { channel, address, provider: 'twilio' });

  it('an unowned number cannot be registered as a voice line', async () => {
    const res = await register('+442079460391');
    expect(res.status).toBe(409);
    expect((await json(res)).error.details.code).toBe('NUMBER_NOT_OWNED');
    expect(await rows("SELECT id FROM tenant_channel_addresses WHERE address = '+442079460391'")).toHaveLength(0);
  });

  it("another agency's number cannot be registered, as voice or any other channel, and the answer does not say who holds it", async () => {
    await call('POST', '/test/voip/own-number', null, { tenantId: OTHER_TENANT, phoneNumber: '+442079460392', country: 'GB' });
    const voice = await register('+442079460392');
    expect(voice.status).toBe(409);
    const sms = await register('+442079460392', 'sms');
    expect(sms.status).toBe(409);
    expect(JSON.stringify(await json(sms))).not.toContain(OTHER_TENANT);
    expect(await rows("SELECT id FROM tenant_channel_addresses WHERE address = '+442079460392'")).toHaveLength(0);
  });

  it('a number the agency bought is registered; a released one is not', async () => {
    await call('POST', '/test/voip/own-number', null, { tenantId: TENANT_ID, phoneNumber: '+442079460393', country: 'GB' });
    expect((await register('+442079460393')).status).toBe(201);
    await run("DELETE FROM tenant_channel_addresses WHERE address = '+442079460393'");
    await run("UPDATE voip_number_registry SET status = 'released' WHERE phone_number = '+442079460393'");
    expect((await register('+442079460393')).status).toBe(409);
  });
});
