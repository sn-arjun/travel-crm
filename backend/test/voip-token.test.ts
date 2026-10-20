import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { signAccessToken } from '../src/utils/jwt';
import { MockVoipProvider } from '../src/services/voip/mock-provider';
import { TwilioVoipProvider } from '../src/services/twilio-voice';
import { voipClientIdentity } from '../src/services/voip-base';

// R307: GET /voip/token. Agent roles only; the agency must be allowed calling and have an active sub-account;
// the identity is derived from the signed-in user; the token is short-lived; the sub-account's key is created once.

const testEnv = env as any;
const mockEnv = { ...testEnv, VOIP_PROVIDER: 'mock' } as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const OWNER_EMAIL = 'owner@r307.test';
const AGENT_ID = '01960000-0000-7000-8000-00000000a307';

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = mockEnv): Promise<Response> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

const run = (sql: string, ...binds: unknown[]) => testEnv.MASTER_DB.prepare(sql).bind(...binds).run();
const one = async <T = Record<string, any>>(sql: string, ...binds: unknown[]) =>
  (await testEnv.MASTER_DB.prepare(sql).bind(...binds).first()) as T | null;
const json = async (res: Response) => (await res.json()) as any;
const decode = (jwt: string) => JSON.parse(atob(jwt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));

async function seedUser(id: string, role: string, active = 1): Promise<string> {
  await run(
    `INSERT OR REPLACE INTO users (id, email, name, password_hash, role, is_active) VALUES (?, ?, ?, 'x', ?, ?)`,
    id, `${id}@r307.test`, `User ${id}`, role, active,
  );
  return signAccessToken({ userId: id, tenantId: TENANT_ID, role, email: `${id}@r307.test` }, testEnv.JWT_SECRET);
}

async function wipe(): Promise<void> {
  for (const sql of ['DELETE FROM voip_number_registry', 'DELETE FROM voip_accounts', 'DELETE FROM voip_settings']) await run(sql);
  await run("UPDATE platform_settings SET value = '0' WHERE key = 'voip_calling_on_trial'");
}

let admin = '';

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  await wipe();
  MockVoipProvider.reset();
  await run("INSERT INTO settings (key, value) VALUES ('country', 'GB') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  await run("UPDATE tenants SET country = 'GB', owner_email = ?, plan = 'pro', status = 'active' WHERE id = ?", OWNER_EMAIL, TENANT_ID);
  await run("UPDATE call_country_policy SET position = 'resell', kyc_required = 1 WHERE country = 'GB'");
  const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
  admin = (await json(login)).data.accessToken;
});

afterAll(async () => {
  await wipe();
  await run("UPDATE tenants SET country = NULL, owner_email = NULL, plan = 'pro', status = 'active' WHERE id = ?", TENANT_ID);
  await run("DELETE FROM settings WHERE key IN ('country', 'company_country')");
  await run("DELETE FROM users WHERE email LIKE '%@r307.test'");
  vi.restoreAllMocks();
});

afterEach(() => vi.restoreAllMocks());

describe('GET /voip/token', () => {
  it('refuses an agency without calling: no account yet, a country off the list, a trial', async () => {
    const none = await call('GET', '/voip/token', admin);
    expect(none.status).toBe(403);
    expect((await json(none)).error.details).toMatchObject({ code: 'CALLING_NOT_AVAILABLE', reason: 'no_account' });

    await run("INSERT INTO settings (key, value) VALUES ('country', 'AE') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    await run("UPDATE tenants SET country = 'AE' WHERE id = ?", TENANT_ID);
    const country = await call('GET', '/voip/token', admin, undefined, { ...mockEnv, VOIP_CALLING_COUNTRIES: 'GB,US,AU,SG' });
    expect(country.status).toBe(403);
    expect((await json(country)).error.details.reason).toBe('country_not_supported');
    await run("INSERT INTO settings (key, value) VALUES ('country', 'GB') ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    await run("UPDATE tenants SET country = 'GB' WHERE id = ?", TENANT_ID);

    await run("UPDATE tenants SET plan = 'trial' WHERE id = ?", TENANT_ID);
    const trial = await call('GET', '/voip/token', admin);
    expect(trial.status).toBe(403);
    // The plan gate answers first on a trial; either way no token.
    await run("UPDATE tenants SET plan = 'pro' WHERE id = ?", TENANT_ID);
  });

  it('once calling is on, an agent gets a short-lived token whose identity is derived from the signed-in user', async () => {
    expect((await call('POST', '/voip/account/enable', admin, {})).status).toBeLessThan(300);

    const agent = await seedUser(AGENT_ID, 'salesperson');
    const res = await call('GET', '/voip/token', agent);
    expect(res.status).toBe(200);
    const body = (await json(res)).data;
    expect(body.identity).toBe(voipClientIdentity(AGENT_ID));
    expect(body.identity).toMatch(/^u_[A-Za-z0-9]+$/);
    expect(typeof body.token).toBe('string');
    // Short-lived: 15 minutes, and the expiry timestamp agrees.
    expect(body.expiresIn).toBe(900);
    expect(Date.parse(body.expiresAt) - Date.now()).toBeLessThanOrEqual(900_000);
    expect(Date.parse(body.expiresAt) - Date.now()).toBeGreaterThan(800_000);

    // A request cannot choose another identity.
    const spoof = await call('GET', '/voip/token?identity=u_someoneelse&userId=other', agent);
    expect((await json(spoof)).data.identity).toBe(body.identity);

    // The other agent roles get one too.
    expect((await call('GET', '/voip/token', await seedUser('01960000-0000-7000-8000-00000000b307', 'sales_manager'))).status).toBe(200);
    expect((await call('GET', '/voip/token', admin)).status).toBe(200);
  });

  it('refuses the roles that are not agents, a removed user, and the old POST route', async () => {
    for (const [id, role] of [
      ['01960000-0000-7000-8000-00000000c307', 'accountant'],
      ['01960000-0000-7000-8000-00000000d307', 'view_only'],
      ['01960000-0000-7000-8000-00000000e307', 'operations'],
    ] as const) {
      expect((await call('GET', '/voip/token', await seedUser(id, role))).status).toBe(403);
    }
    const gone = await seedUser('01960000-0000-7000-8000-00000000f307', 'salesperson', 0);
    expect((await call('GET', '/voip/token', gone)).status).toBe(403);
    expect((await call('GET', '/voip/token', null)).status).toBe(401);
    expect([403, 404, 405]).toContain((await call('POST', '/voip/token', admin, {})).status);
  });

  it('a two-factor setup-only session gets no token', async () => {
    const restricted = await signAccessToken(
      { userId: AGENT_ID, tenantId: TENANT_ID, role: 'salesperson', email: 'a@r307.test', twoFactorSetupRequired: true },
      testEnv.JWT_SECRET,
    );
    expect(decode(restricted).tfs).toBe(true);
    const res = await call('GET', '/voip/token', restricted);
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe('TWO_FACTOR_SETUP_REQUIRED');
  });

  it('refuses when the account is suspended or the agency uses credentials of its own', async () => {
    const agent = await seedUser(AGENT_ID, 'salesperson');
    await run("UPDATE voip_accounts SET status = 'suspended'");
    const suspended = await call('GET', '/voip/token', agent);
    expect(suspended.status).toBe(403);
    expect((await json(suspended)).error.details.reason).toBe('suspended');
    await run("UPDATE voip_accounts SET status = 'active'");

    const mirrored = await one<{ provider_account_id: string }>('SELECT provider_account_id FROM voip_settings LIMIT 1');
    await run("UPDATE voip_settings SET provider_account_id = 'ACsomeoneelse'");
    expect((await call('GET', '/voip/token', agent)).status).toBe(409);
    await run('UPDATE voip_settings SET provider_account_id = ?', mirrored!.provider_account_id);
    expect((await call('GET', '/voip/token', agent)).status).toBe(200);
  });

  it('creates the sub-account key once and keeps it sealed', async () => {
    const stored = await one<{ provider_api_key_id: string | null; provider_api_key_secret: string | null }>('SELECT provider_api_key_id, provider_api_key_secret FROM voip_settings LIMIT 1');
    expect(stored!.provider_api_key_id).toMatch(/^SKmock/);
    expect(stored!.provider_api_key_secret).toBeTruthy();
    expect(stored!.provider_api_key_secret).not.toBe('mock-key-secret');
    const agent = await seedUser(AGENT_ID, 'salesperson');
    await call('GET', '/voip/token', agent);
    await call('GET', '/voip/token', agent);
    expect(MockVoipProvider.log.filter((l) => l === 'provisionSoftphoneKey')).toHaveLength(1);
  });

  it('is rate limited per user', async () => {
    const agent = await seedUser('01960000-0000-7000-8000-00000000a308', 'salesperson');
    const strict = { ...mockEnv, RATE_LIMIT_MULTIPLIER: '1' };
    let limited = 0;
    for (let i = 0; i < 24; i++) {
      const res = await call('GET', '/voip/token', agent, undefined, strict);
      if (res.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });
});

describe('the Twilio access token (SDK-free JWT)', () => {
  const settings: any = {
    id: 's', voipProvider: 'twilio', providerAccountId: 'ACsub', providerAuthToken: 'tok', providerApiKeyId: 'SKkey', providerApiKeySecret: 'secret',
    providerAppId: null, twilioAccountSid: null, twilioAuthToken: null, twilioApiKeySid: null, twilioApiKeySecret: null, twilioTwimlAppSid: null,
    defaultCallerId: null, recordingPolicy: 'all', ivrEnabled: 0, ivrConfig: null, businessHoursEnabled: 0, businessHours: null,
    voicemailEnabled: 1, voicemailGreetingUrl: null, maxRingDuration: 30, routingStrategy: 'assigned', autoCreateLeadMissedCall: 1,
    recordingRetentionDays: 90, recordingStorageBytes: 0,
  };

  it('signs with the sub-account key, expires after the given short time, grants incoming only without a TwiML app', async () => {
    const p = new TwilioVoipProvider({ TWILIO_ACCOUNT_SID: 'ACplatform', TWILIO_AUTH_TOKEN: 'platform' }, settings);
    const t = await p.generateClientToken(AGENT_ID, { ttlSeconds: 600 });
    const payload = decode(t.token);
    expect(t.expiresIn).toBe(600);
    expect(payload.iss).toBe('SKkey');
    expect(payload.sub).toBe('ACsub');
    expect(payload.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(600);
    expect(payload.grants.voice.incoming.allow).toBe(true);
    expect(payload.grants.voice.outgoing).toBeUndefined();
    expect(payload.grants.identity).toBe(voipClientIdentity(AGENT_ID));
    // The lifetime is clamped to at most an hour; the default is 15 minutes.
    expect((await p.generateClientToken('u', { ttlSeconds: 999999 })).expiresIn).toBe(3600);
    expect((await p.generateClientToken('u')).expiresIn).toBe(900);
  });

  it('provisionSoftphoneKey creates a key in the sub-account and returns its id and secret', async () => {
    const seen: Array<{ url: string; auth: string }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      seen.push({ url: String(url), auth: String((init.headers as any).Authorization) });
      return new Response(JSON.stringify({ sid: 'SKnew', secret: 'sekret' }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    });
    const p = new TwilioVoipProvider({ TWILIO_ACCOUNT_SID: 'ACplatform', TWILIO_AUTH_TOKEN: 'platform' }, settings);
    expect(await p.provisionSoftphoneKey()).toEqual({ apiKeyId: 'SKnew', apiKeySecret: 'sekret' });
    expect(seen[0]!.url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACsub/Keys.json');
    expect(seen[0]!.auth).toBe('Basic ' + btoa('ACsub:tok'));
    vi.unstubAllGlobals();
  });
});
