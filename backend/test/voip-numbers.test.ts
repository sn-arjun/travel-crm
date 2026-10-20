import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import voipRouteSource from '../src/routes/voip.ts?raw';
import { twilioSignature } from '../src/middleware/provider-signature';
import { decryptSecret } from '../src/utils/crypto-box';
import { MockVoipProvider } from '../src/services/voip/mock-provider';
import { VoipProviderError, subAccountSecretAad } from '../src/services/voip-provider';
import { decideCalling } from '../src/services/voip/country-policy';
import { runNumberLifecycle } from '../src/services/voip/numbers';
import { superAdminToken } from './utils/super-admin';

// R304: one sub-account per agency, number search / purchase / release / registration, the country switch and the trial switch.
// The provider is the in-memory mock (VOIP_PROVIDER=mock) except in the last block, which drives the real Twilio adapter over a mocked fetch.

const testEnv = env as any;
const mockEnv = { ...testEnv, VOIP_PROVIDER: 'mock' } as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const SA_ID = '01960000-0000-7000-8000-0000000304aa';
const OWNER_EMAIL = 'owner@r304.test';
const CUSTOMER = '+447700900111';

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = mockEnv, headers: Record<string, string> = {}): Promise<Response> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
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

async function webhook(path: string, fields: Record<string, string>, token: string): Promise<Response> {
  const base = testEnv.API_PUBLIC_URL ? String(testEnv.API_PUBLIC_URL).replace(/[/]+$/, '') : 'http://localhost';
  const signature = await twilioSignature(`${base}/api/v1/voip${path}`, fields, token);
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

async function setCountry(country: string | null): Promise<void> {
  if (country === null) await run("DELETE FROM settings WHERE key IN ('country', 'company_country')");
  else await run("INSERT INTO settings (key, value) VALUES ('country', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", country);
}

const periodNow = () => new Date().toISOString().slice(0, 7);
const monthsAhead = (n: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 15, 12));
};

let admin = '';
let sa = '';
const asAdmin = (method: string, path: string, body?: unknown, e: any = mockEnv) => call(method, path, sa, body, e);
const data = async (res: Response) => ((await res.json()) as any);

async function wipe(): Promise<void> {
  for (const sql of [
    'DELETE FROM voip_number_registry', 'DELETE FROM voip_accounts', 'DELETE FROM number_documents',
    "DELETE FROM tenant_channel_addresses WHERE channel = 'voice'", 'DELETE FROM voip_numbers',
    "DELETE FROM tenant_addons WHERE product_key LIKE 'phone_number%'",
    'DELETE FROM voip_settings',
  ]) await run(sql);
  await run("UPDATE platform_settings SET value = '0' WHERE key = 'voip_calling_on_trial'");
}

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  await wipe();
  MockVoipProvider.reset();
  await setCountry('GB');
  await run("UPDATE tenants SET country = 'GB', owner_email = ?, plan = 'pro', status = 'active' WHERE id = ?", OWNER_EMAIL, TENANT_ID);
  await run("UPDATE call_country_policy SET position = 'resell', kyc_required = 1 WHERE country = 'GB'");
  const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
  admin = ((await login.json()) as any).data.accessToken;
  sa = await superAdminToken(testEnv, { id: SA_ID, email: 'r304-sa@test.local' });
});

afterAll(async () => {
  await wipe();
  await run("UPDATE tenants SET country = NULL, owner_email = NULL, plan = 'pro', status = 'active' WHERE id = ?", TENANT_ID);
  await setCountry(null);
  await call('DELETE', '/test/outbox', null);
  vi.restoreAllMocks();
});

afterEach(() => vi.restoreAllMocks());

describe('who may have calling: trial switch and country policy', () => {
  it('a trial agency cannot enable calling by default, and the super admin can change the switch', async () => {
    await run("UPDATE tenants SET plan = 'trial' WHERE id = ?", TENANT_ID);
    const refused = await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/enable`);
    expect(refused.status).toBe(403);
    expect((await data(refused)).error.details).toMatchObject({ code: 'CALLING_NOT_AVAILABLE', reason: 'trial_not_allowed' });
    expect(await one('SELECT * FROM voip_accounts')).toBeUndefined();

    expect((await data(await asAdmin('GET', '/admin/voip/settings'))).data.callingOnTrial).toBe(false);
    expect((await asAdmin('PUT', '/admin/voip/settings', { callingOnTrial: true })).status).toBe(200);
    expect((await decideCalling(mockEnv, { country: 'GB', plan: 'trial' })).allowed).toBe(true);
    expect((await asAdmin('PUT', '/admin/voip/settings', { callingOnTrial: false })).status).toBe(200);
    expect((await decideCalling(mockEnv, { country: 'GB', plan: 'trial' })).reason).toBe('trial_not_allowed');
    await run("UPDATE tenants SET plan = 'pro' WHERE id = ?", TENANT_ID);
  });

  it('an agency in the UAE gets not_offered (policy) and an agency in India cannot search or buy even by calling the service directly', async () => {
    await run("UPDATE tenants SET country = 'AE' WHERE id = ?", TENANT_ID);
    const listed = { ...mockEnv, VOIP_CALLING_COUNTRIES: 'GB,US,AU,SG,AE' };
    const notOffered = await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/enable`, undefined, listed);
    expect(notOffered.status).toBe(403);
    expect((await data(notOffered)).error.details.reason).toBe('country_not_offered');
    const unsupported = await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/enable`);
    expect((await data(unsupported)).error.details.reason).toBe('country_not_supported');
    expect(await one('SELECT * FROM voip_accounts')).toBeUndefined();
    await run("UPDATE tenants SET country = 'GB' WHERE id = ?", TENANT_ID);

    // The agency's own routes: refused by the gate for an Indian agency.
    await setCountry('IN');
    expect((await call('POST', '/voip/numbers/search', admin, {})).status).toBe(403);
    expect((await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: '+442030011001' })).status).toBe(403);
    expect((await call('POST', '/voip/account/enable', admin, {})).status).toBe(403);
    // And the service itself refuses (not only the middleware).
    const { searchNumbers, purchaseNumber } = await import('../src/services/voip/numbers');
    await expect(searchNumbers(mockEnv, TENANT_ID, testEnv.MASTER_DB, {})).rejects.toMatchObject({ code: 'CALLING_NOT_AVAILABLE' });
    await expect(purchaseNumber(mockEnv, TENANT_ID, testEnv.MASTER_DB, { phoneNumber: '+442030011001', webhookBaseUrl: 'http://x' })).rejects.toMatchObject({ code: 'CALLING_NOT_AVAILABLE' });
    await setCountry('GB');
  });

  it('the super admin can change a country position and it takes effect at once', async () => {
    expect((await asAdmin('PUT', '/admin/voip/country-policy/GB', { position: 'not_offered' })).status).toBe(200);
    const refused = await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/enable`);
    expect((await data(refused)).error.details.reason).toBe('country_not_offered');
    expect((await asAdmin('PUT', '/admin/voip/country-policy/GB', { position: 'resell', kycRequired: true })).status).toBe(200);
    const list = (await data(await asAdmin('GET', '/admin/voip/country-policy'))).data as any[];
    expect(list.find((p) => p.country === 'IN').position).toBe('not_offered');
    expect(list.find((p) => p.country === 'GB')).toMatchObject({ position: 'resell', kycRequired: true, provider: 'twilio' });
  });
});

describe('sub-account lifecycle', () => {
  it('enabling creates exactly one sub-account even when requested twice at once, and seals the token', async () => {
    MockVoipProvider.reset();
    const [a, b] = await Promise.all([call('POST', '/voip/account/enable', admin, {}), call('POST', '/voip/account/enable', admin, {})]);
    expect([a.status, b.status].filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    expect([a.status, b.status].every((s) => s === 200 || s === 409)).toBe(true);
    expect(MockVoipProvider.log.filter((l) => l === 'createSubAccount')).toHaveLength(1);

    const again = await call('POST', '/voip/account/enable', admin, {});
    expect(again.status).toBe(200);
    const body = await data(again);
    expect(body.data.created).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/mocktoken|credentials|authToken|enc:v1/);

    const account = await one<any>('SELECT * FROM voip_accounts WHERE tenant_id = ?', TENANT_ID);
    expect(account.status).toBe('active');
    expect(account.credentials_enc.startsWith('enc:v1:')).toBe(true);
    const opened = await decryptSecret(testEnv, account.credentials_enc, subAccountSecretAad(TENANT_ID, account.sub_account_id));
    expect(opened.value).toMatch(/^mocktoken/);
    expect(account.credentials_enc).not.toContain(opened.value);
    expect(await rows('SELECT 1 FROM voip_accounts')).toHaveLength(1);

    // Existing code reads credentials from the agency's voip_settings (callback signature check): the sub-account is mirrored there, sealed.
    const settings = await one<any>('SELECT provider_account_id, provider_auth_token FROM voip_settings LIMIT 1');
    expect(settings.provider_account_id).toBe(account.sub_account_id);
    expect(settings.provider_auth_token.startsWith('enc:v1:')).toBe(true);
  });

  it('GET /voip/account tells the agency its state without any secret', async () => {
    const body = await data(await call('GET', '/voip/account', admin));
    expect(body.data).toMatchObject({ available: true, country: 'GB', position: 'resell', account: { status: 'active', provider: 'twilio' } });
    expect(JSON.stringify(body)).not.toMatch(/credentials|token/i);
  });
});

describe('number purchase rules', () => {
  let chosen: string[] = [];

  it('shows the price before buying: provider cost + 20%, from the catalogue', async () => {
    const offer = (await data(await call('GET', '/voip/number-offer', admin))).data;
    expect(offer.calling).toMatchObject({ allowed: true, country: 'GB', position: 'resell' });
    expect(offer.price.currency).toBe('USD');
    expect(offer.price.monthly).toBeCloseTo(1.38, 2); // 1.15 x 1.20
    expect(offer.kyc).toMatchObject({ required: true, status: 'none' });
    expect(offer.addon.freeThisMonth).toBe(0);
  });

  it('search returns numbers of the agency country only', async () => {
    const res = await call('POST', '/voip/numbers/search', admin, {});
    expect(res.status).toBe(200);
    const list = (await data(res)).data as any[];
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((n) => n.phoneNumber.startsWith('+44'))).toBe(true);
    chosen = list.map((n) => n.phoneNumber);
    expect((await call('POST', '/voip/numbers/search', admin, { country: 'US' })).status).toBe(403);
    // The provider's failure path still surfaces (e2e uses the reserved area code).
    const failing = await call('POST', '/voip/numbers/search', admin, { areaCode: '999' });
    expect(failing.status).toBe(502);
  });

  it('purchase without approved KYC is 409, through submission, rejection and approval', async () => {
    const buy = () => call('POST', '/voip/numbers/purchase', admin, { phoneNumber: chosen[0] });
    let res = await buy();
    expect(res.status).toBe(409);
    expect((await data(res)).error.details).toMatchObject({ code: 'KYC_REQUIRED', kycStatus: 'none' });

    const submit = await call('POST', '/voip/kyc', admin, {
      details: { businessName: 'Test Travels Ltd', address: '1 High Street, London' },
      files: [{ name: 'certificate.pdf', url: 'https://files.example.test/cert.pdf' }],
    });
    expect(submit.status).toBe(200);
    expect((await data(submit)).data.document.status).toBe('pending');
    res = await buy();
    expect((await data(res)).error.details).toMatchObject({ code: 'KYC_REQUIRED', kycStatus: 'pending' });
    expect((await call('POST', '/voip/kyc', admin, { country: 'US', details: { businessName: 'x', address: 'y' } })).status).toBe(403);

    // Reviewing: a rejection needs a reason.
    expect((await asAdmin('PUT', `/admin/tenants/${TENANT_ID}/voip/documents/GB`, { status: 'rejected' })).status).toBe(400);
    expect((await asAdmin('PUT', `/admin/tenants/${TENANT_ID}/voip/documents/GB`, { status: 'rejected', note: 'Address page unreadable' })).status).toBe(200);
    const kyc = (await data(await call('GET', '/voip/kyc', admin))).data.document;
    expect(kyc).toMatchObject({ status: 'rejected', reviewNote: 'Address page unreadable' });
    expect((await data(await buy())).error.details.kycStatus).toBe('rejected');
    expect((await call('POST', '/voip/kyc', admin, { details: { businessName: 'Test Travels Ltd', address: '1 High Street, London' }, files: [] })).status).toBe(200);
    const pending = (await data(await asAdmin('GET', '/admin/voip/documents?status=pending'))).data as any[];
    expect(pending.some((d) => d.tenantId === TENANT_ID && d.country === 'GB')).toBe(true);
    expect((await asAdmin('PUT', `/admin/tenants/${TENANT_ID}/voip/documents/GB`, { status: 'approved' })).status).toBe(200);
  });

  it('with approved KYC but no number add-on, purchase is 409 NUMBER_ADDON_REQUIRED and nothing is bought', async () => {
    MockVoipProvider.reset();
    const res = await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: chosen[0] });
    expect(res.status).toBe(409);
    expect((await data(res)).error.details).toMatchObject({ code: 'NUMBER_ADDON_REQUIRED', productKey: 'phone_number_west' });
    expect(MockVoipProvider.heldNumbers).toEqual([]);
    expect(await rows('SELECT 1 FROM voip_number_registry')).toHaveLength(0);
  });

  it('a market with no number price gets 409 PRICE_NOT_CONFIGURED', async () => {
    await setCountry('MY');
    const myEnv = { ...mockEnv, VOIP_CALLING_COUNTRIES: 'GB,US,AU,SG,MY' };
    const res = await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: '+60312000111' }, myEnv);
    expect(res.status).toBe(409);
    expect((await data(res)).error.details.code).toBe('PRICE_NOT_CONFIGURED');
    await setCountry('GB');
  });

  it('purchase consumes the number add-on and registers the address so inbound calls find the agency', async () => {
    const grant = await data(await asAdmin('POST', `/admin/tenants/${TENANT_ID}/addons`, { productKey: 'phone_number_west', quantity: 1 }));
    const grantId = grant.data.id;
    expect((await data(await call('GET', '/voip/number-offer', admin))).data.addon.freeThisMonth).toBe(1);

    MockVoipProvider.reset();
    const res = await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: chosen[0], friendlyName: 'Main line' }, mockEnv, { 'Idempotency-Key': 'buy-1' });
    expect(res.status).toBe(200);
    const bought = (await data(res)).data;
    expect(bought.phoneNumber).toBe(chosen[0]);

    const reg = await one<any>('SELECT * FROM voip_number_registry WHERE phone_number = ?', chosen[0]);
    expect(reg).toMatchObject({ tenant_id: TENANT_ID, status: 'active', addon_id: grantId, paid_through: periodNow(), country: 'GB', currency: 'USD' });
    expect(reg.sub_account_id).toBe((await one<any>('SELECT sub_account_id FROM voip_accounts')).sub_account_id);
    expect(MockVoipProvider.heldNumbers).toEqual([chosen[0]]);

    // Registered for inbound routing, and listed for the agency.
    expect(await one<any>(`SELECT tenant_id, is_active FROM tenant_channel_addresses WHERE channel = 'voice' AND address = ?`, chosen[0])).toEqual({ tenant_id: TENANT_ID, is_active: 1 });
    const list = (await data(await call('GET', '/voip/numbers', admin))).data as any[];
    expect(list.find((n) => n.phoneNumber === chosen[0])).toMatchObject({ isDefault: true, rental: { status: 'active', paidThrough: periodNow() } });

    // The grant is used up.
    expect((await data(await call('GET', '/voip/number-offer', admin))).data.addon.freeThisMonth).toBe(0);
    const second = await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: chosen[1] });
    expect((await data(second)).error.details.code).toBe('NUMBER_ADDON_REQUIRED');
  });

  it('buying is idempotent: a retry with the same key returns the same number and buys nothing more', async () => {
    const before = MockVoipProvider.log.filter((l) => l.startsWith('purchaseNumber')).length;
    const res = await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: chosen[0] }, mockEnv, { 'Idempotency-Key': 'buy-1' });
    expect(res.status).toBe(200);
    expect((await data(res)).data.replay).toBe(true);
    expect(MockVoipProvider.log.filter((l) => l.startsWith('purchaseNumber')).length).toBe(before);
    expect(await rows('SELECT 1 FROM voip_number_registry WHERE phone_number = ?', chosen[0])).toHaveLength(1);
    expect(await rows('SELECT 1 FROM voip_numbers WHERE phone_number = ?', chosen[0])).toHaveLength(1);
  });

  it('a number belongs to exactly one agency: it cannot be bought again and a refused buy does not consume the add-on', async () => {
    await asAdmin('POST', `/admin/tenants/${TENANT_ID}/addons`, { productKey: 'phone_number_west', quantity: 1 });
    const res = await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: chosen[0] }, mockEnv, { 'Idempotency-Key': 'buy-dup' });
    expect(res.status).toBe(409);
    expect((await data(res)).error.details.code).toBe('NUMBER_UNAVAILABLE');
    expect((await data(await call('GET', '/voip/number-offer', admin))).data.addon.freeThisMonth).toBe(1);
    // The search never offers a number somebody holds.
    const offered = ((await data(await call('POST', '/voip/numbers/search', admin, {}))).data as any[]).map((n) => n.phoneNumber);
    expect(offered).not.toContain(chosen[0]);
    // A manual claim of the same address by another workspace is also refused by the unique index.
    const claim = await call('POST', '/integrations/channels', admin, { channel: 'voice', address: chosen[0], provider: 'twilio' });
    expect(claim.status).toBe(409);
  });

  it('a failed provider purchase frees the claim and the add-on', async () => {
    vi.spyOn(MockVoipProvider.prototype, 'purchaseNumber').mockRejectedValueOnce(new VoipProviderError('mock', 21422, 'Phone number is not available', 'unavailable'));
    const res = await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: chosen[1] }, mockEnv, { 'Idempotency-Key': 'buy-fail' });
    expect(res.status).toBe(409);
    expect(await rows('SELECT 1 FROM voip_number_registry WHERE phone_number = ?', chosen[1])).toHaveLength(0);
    expect((await data(await call('GET', '/voip/number-offer', admin))).data.addon.freeThisMonth).toBe(1);
  });

  it('a second number can be bought with the second add-on', async () => {
    const res = await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: chosen[1], friendlyName: 'Second line' });
    expect(res.status).toBe(200);
    expect(MockVoipProvider.heldNumbers.sort()).toEqual([chosen[0], chosen[1]].sort());
  });

  describe('inbound calls to the new number', () => {
    it('resolve the agency from the called number, with the platform token or the sub-account token, and not with a wrong one', async () => {
      expect((await one<any>(`SELECT tenant_id FROM tenant_channel_addresses WHERE address = ? AND is_active = 1`, chosen[0])).tenant_id).toBe(TENANT_ID);

      const ok = await webhook('/twiml/inbound', { CallSid: 'CA-r304-1', From: CUSTOMER, To: chosen[0] }, testEnv.TWILIO_AUTH_TOKEN);
      expect(ok.status).toBe(200);
      expect(await one<any>(`SELECT direction FROM call_logs WHERE provider_call_id = 'CA-r304-1'`)).toEqual({ direction: 'inbound' });

      const account = await one<any>('SELECT * FROM voip_accounts');
      const subToken = (await decryptSecret(testEnv, account.credentials_enc, subAccountSecretAad(TENANT_ID, account.sub_account_id))).value;
      expect((await webhook('/twiml/inbound', { CallSid: 'CA-r304-2', From: CUSTOMER, To: chosen[0] }, subToken)).status).toBe(200);
      expect((await webhook('/twiml/inbound', { CallSid: 'CA-r304-3', From: CUSTOMER, To: chosen[0] }, 'not-a-token')).status).toBe(403);
      expect(await rows(`SELECT 1 FROM call_logs WHERE provider_call_id = 'CA-r304-3'`)).toHaveLength(0);
    });
  });

  describe('release', () => {
    it('a provider failure keeps the number, stops its routing, and a retry releases it at the provider before the row goes', async () => {
      const listed = (await data(await call('GET', '/voip/numbers', admin))).data as any[];
      const target = listed.find((n) => n.phoneNumber === chosen[1])!;

      vi.spyOn(MockVoipProvider.prototype, 'releaseNumber').mockRejectedValueOnce(new VoipProviderError('mock', 500, 'provider down', 'provider'));
      const failed = await call('DELETE', `/voip/numbers/${target.id}`, admin);
      expect(failed.status).toBe(502);
      // Not deleted without the provider's release; routing already stopped; the daily job will retry.
      expect(await rows('SELECT 1 FROM voip_numbers WHERE id = ?', target.id)).toHaveLength(1);
      expect(MockVoipProvider.heldNumbers).toContain(chosen[1]);
      expect(await rows(`SELECT 1 FROM tenant_channel_addresses WHERE address = ?`, chosen[1])).toHaveLength(0);
      expect((await one<any>('SELECT status, release_reason FROM voip_number_registry WHERE phone_number = ?', chosen[1]))).toEqual({ status: 'release_scheduled', release_reason: 'release_failed' });

      const ok = await call('DELETE', `/voip/numbers/${target.id}`, admin);
      expect(ok.status).toBe(200);
      const log = MockVoipProvider.log;
      expect(log.some((l) => l.startsWith('releaseNumber:'))).toBe(true);
      expect(MockVoipProvider.heldNumbers).toEqual([chosen[0]]);
      expect(await rows('SELECT 1 FROM voip_numbers WHERE id = ?', target.id)).toHaveLength(0);
      expect((await one<any>('SELECT status FROM voip_number_registry WHERE phone_number = ?', chosen[1])).status).toBe('released');
      // The released number can be rented again (by anyone) and the add-on it used is free again.
      expect((await data(await call('GET', '/voip/number-offer', admin))).data.addon.freeThisMonth).toBe(1);
    });

    it('the only number is kept (409) and no row is removed', async () => {
      const only = (await data(await call('GET', '/voip/numbers', admin))).data as any[];
      expect(only).toHaveLength(1);
      const res = await call('DELETE', `/voip/numbers/${only[0].id}`, admin);
      expect(res.status).toBe(409);
      expect(MockVoipProvider.heldNumbers).toEqual([chosen[0]]);
    });

    it('no path removes a number row without releasing it at the provider (route source)', () => {
      const deleteAt = [...voipRouteSource.matchAll(/DELETE FROM \$\{table\}/g)].map((m) => m.index!);
      expect(deleteAt.length).toBeGreaterThan(0);
      const releaseAt = voipRouteSource.indexOf('await releaseTenantNumber(');
      expect(releaseAt).toBeGreaterThan(0);
      for (const at of deleteAt) expect(at).toBeGreaterThan(releaseAt);
      expect(voipRouteSource).not.toMatch(/DELETE FROM voip_numbers/);
    });
  });
});

describe('suspend, cancel, close', () => {
  it('suspending stops the sub-account and routing, resuming restores them', async () => {
    const res = await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/suspend`);
    expect(res.status).toBe(200);
    expect((await one<any>('SELECT status FROM voip_accounts')).status).toBe('suspended');
    expect(MockVoipProvider.log.some((l) => l.startsWith('suspendSubAccount:'))).toBe(true);
    const a = (await one<any>(`SELECT tenant_id FROM tenant_channel_addresses WHERE address = ? AND is_active = 1`, MockVoipProvider.heldNumbers[0]));
    expect(a).toBeUndefined();
    expect((await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/resume`)).status).toBe(200);
    expect((await one<any>('SELECT status FROM voip_accounts')).status).toBe('active');
    expect((await one<any>(`SELECT is_active FROM tenant_channel_addresses WHERE channel = 'voice'`)).is_active).toBe(1);
  });

  it('cancelling the agency schedules the release after a grace period with a notice; reactivating calls it off', async () => {
    await call('DELETE', '/test/outbox', null);
    const cancel = await asAdmin('POST', `/admin/tenants/${TENANT_ID}/cancel`, { reason: 'test' });
    expect(cancel.status).toBe(200);
    expect((await data(cancel)).data.voip).toBe('ok');
    const reg = await one<any>(`SELECT status, release_at, release_reason FROM voip_number_registry WHERE status <> 'released'`);
    expect(reg).toMatchObject({ status: 'release_scheduled', release_reason: 'cancelled' });
    const days = (Date.parse(reg.release_at) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13);
    expect(days).toBeLessThan(15);
    expect((await one<any>('SELECT status FROM voip_accounts')).status).toBe('suspended');
    const mails = ((await data(await call('GET', `/test/outbox?to=${encodeURIComponent(OWNER_EMAIL)}`, null))).data as any[]).filter((m) => m.template === 'number_release_notice');
    expect(mails).toHaveLength(1);
    expect(mails[0].text).toContain(MockVoipProvider.heldNumbers[0]);

    expect((await asAdmin('POST', `/admin/tenants/${TENANT_ID}/reactivate`, {})).status).toBe(200);
    expect((await one<any>(`SELECT status FROM voip_number_registry WHERE status <> 'released'`)).status).toBe('active');
    expect((await one<any>('SELECT status FROM voip_accounts')).status).toBe('active');
  });

  it('after the grace the daily job releases the numbers at the provider and closes the sub-account and its mirrored credentials', async () => {
    expect((await asAdmin('POST', `/admin/tenants/${TENANT_ID}/cancel`, { reason: 'test' })).status).toBe(200);
    const early = await runNumberLifecycle(mockEnv, new Date(Date.now() + 5 * 86_400_000));
    expect(early.released).toBe(0);
    expect(MockVoipProvider.heldNumbers).toHaveLength(1);

    const subId = (await one<any>('SELECT sub_account_id FROM voip_accounts')).sub_account_id;
    const late = await runNumberLifecycle(mockEnv, new Date(Date.now() + 15 * 86_400_000));
    expect(late).toMatchObject({ released: 1, closedAccounts: 1, failed: 0 });
    expect(MockVoipProvider.heldNumbers).toEqual([]);
    expect(MockVoipProvider.subAccounts.get(subId)?.closed).toBe(true);
    const log = MockVoipProvider.log;
    expect(log.findIndex((l) => l.startsWith('releaseNumber:'))).toBeLessThan(log.indexOf(`closeSubAccount:${subId}`));
    const account = await one<any>('SELECT status, credentials_enc FROM voip_accounts');
    expect(account).toEqual({ status: 'closed', credentials_enc: null });
    expect((await one<any>('SELECT provider_account_id, provider_auth_token FROM voip_settings LIMIT 1'))).toEqual({ provider_account_id: null, provider_auth_token: null });
    expect(await rows(`SELECT 1 FROM tenant_channel_addresses WHERE channel = 'voice'`)).toHaveLength(0);
    expect(await rows('SELECT 1 FROM voip_numbers')).toHaveLength(0);

    expect((await asAdmin('POST', `/admin/tenants/${TENANT_ID}/reactivate`, {})).status).toBe(200);
  });
});

describe('monthly number rental', () => {
  let phone = '';

  it('after a close, enabling again opens a fresh sub-account', async () => {
    const res = await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/enable`);
    expect(res.status).toBe(200);
    expect((await data(res)).data.created).toBe(true);
    expect((await one<any>('SELECT status FROM voip_accounts')).status).toBe('active');
    await asAdmin('POST', `/admin/tenants/${TENANT_ID}/addons`, { productKey: 'phone_number_west', quantity: 1 });
    const found = ((await data(await call('POST', '/voip/numbers/search', admin, {}))).data as any[])[0];
    phone = found.phoneNumber;
    expect((await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: phone })).status).toBe(200);
  });

  it('with the next month\'s add-on the rent renews; without it the number is scheduled for release with a notice, and comes back when the add-on arrives', async () => {
    const next = monthsAhead(1);
    const nextKey = next.toISOString().slice(0, 7);

    // A second add-on for the current month does not pay next month's rent.
    await call('DELETE', '/test/outbox', null);
    const unpaid = await runNumberLifecycle(mockEnv, next);
    expect(unpaid).toMatchObject({ renewed: 0, scheduled: 1 });
    const sched = await one<any>('SELECT status, release_reason, release_at FROM voip_number_registry WHERE phone_number = ?', phone);
    expect(sched).toMatchObject({ status: 'release_scheduled', release_reason: 'unpaid' });
    expect(Date.parse(sched.release_at)).toBeGreaterThan(next.getTime() + 6 * 86_400_000);
    const mails = ((await data(await call('GET', `/test/outbox?to=${encodeURIComponent(OWNER_EMAIL)}`, null))).data as any[]).filter((m) => m.template === 'number_release_notice');
    expect(mails).toHaveLength(1);

    await run(
      `INSERT INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source) VALUES ('r304-next-grant', ?, 'phone_number_west', 1, 1, ?, 'super_admin_grant')`,
      TENANT_ID, nextKey,
    );
    const restored = await runNumberLifecycle(mockEnv, next);
    expect(restored.restored).toBe(1);
    expect(await one<any>('SELECT status, paid_through, addon_id FROM voip_number_registry WHERE phone_number = ?', phone)).toEqual({ status: 'active', paid_through: nextKey, addon_id: 'r304-next-grant' });
    expect(MockVoipProvider.heldNumbers).toContain(phone);

    // Two months on, with that month's add-on in place, rent simply renews.
    const later = monthsAhead(2);
    await run(
      `INSERT INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source) VALUES ('r304-later-grant', ?, 'phone_number_west', 1, 1, ?, 'super_admin_grant')`,
      TENANT_ID, later.toISOString().slice(0, 7),
    );
    expect(await runNumberLifecycle(mockEnv, later)).toMatchObject({ renewed: 1, scheduled: 0 });
  });

  it('closing from the console releases every number first, then closes', async () => {
    const res = await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/close`);
    expect(res.status).toBe(200);
    expect((await data(res)).data.released).toEqual([phone]);
    expect(MockVoipProvider.heldNumbers).toEqual([]);
    expect((await one<any>('SELECT status FROM voip_accounts')).status).toBe('closed');
  });
});

describe('the real Twilio adapter, over a mocked fetch', () => {
  it('creates the sub-account with platform credentials, buys and releases inside it with its own credentials', async () => {
    const calls: Array<{ url: string; method: string; auth: string; body: URLSearchParams }> = [];
    const SUB = 'AC' + 'b'.repeat(32);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, method: init?.method ?? 'GET', auth: headers.Authorization ?? '', body: new URLSearchParams(typeof init?.body === 'string' ? init.body : '') });
      if (url.endsWith('/Accounts.json')) return new Response(JSON.stringify({ sid: SUB, auth_token: 'subtoken0123456789abcdef0123456789' }), { status: 201 });
      if (url.includes('/IncomingPhoneNumbers.json')) return new Response(JSON.stringify({ sid: 'PN' + 'c'.repeat(32), phone_number: '+442030099777', friendly_name: 'Line', capabilities: { voice: true, sms: true } }), { status: 201 });
      if (url.includes('/AvailablePhoneNumbers/')) return new Response(JSON.stringify({ available_phone_numbers: [{ phone_number: '+442030099777', friendly_name: '+442030099777', capabilities: { voice: true, sms: true } }] }), { status: 200 });
      if (init?.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response('{}', { status: 200 });
    });
    const realEnv = { ...testEnv, VOIP_PROVIDER: undefined } as any;

    await run('DELETE FROM voip_accounts');
    await run('DELETE FROM voip_settings');
    const enable = await call('POST', '/voip/account/enable', admin, {}, realEnv);
    expect(enable.status).toBe(200);
    const create = calls.find((c) => c.url.endsWith('/Accounts.json'))!;
    expect(create.method).toBe('POST');
    expect(create.auth).toBe('Basic ' + btoa(`${testEnv.TWILIO_ACCOUNT_SID}:${testEnv.TWILIO_AUTH_TOKEN}`));
    expect(create.body.get('FriendlyName')).toContain('Test Agency');
    const account = await one<any>('SELECT * FROM voip_accounts');
    expect(account.sub_account_id).toBe(SUB);
    expect(account.credentials_enc.startsWith('enc:v1:')).toBe(true);
    expect(account.credentials_enc).not.toContain('subtoken');

    // Search and buy run AS the sub-account.
    expect((await call('POST', '/voip/numbers/search', admin, {}, realEnv)).status).toBe(200);
    const search = calls.find((c) => c.url.includes('/AvailablePhoneNumbers/'))!;
    expect(search.url).toContain(`/Accounts/${SUB}/`);
    expect(search.auth).toBe('Basic ' + btoa(`${SUB}:subtoken0123456789abcdef0123456789`));

    await asAdmin('POST', `/admin/tenants/${TENANT_ID}/addons`, { productKey: 'phone_number_west', quantity: 1 });
    const buy = await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: '+442030099777' }, realEnv);
    expect(buy.status).toBe(200);
    const purchase = calls.find((c) => c.url.includes('/IncomingPhoneNumbers.json') && c.method === 'POST')!;
    expect(purchase.url).toContain(`/Accounts/${SUB}/IncomingPhoneNumbers.json`);
    expect(purchase.body.get('VoiceUrl')).toMatch(/\/api\/v1\/voip\/twiml\/inbound$/);

    // Close: the number is released (DELETE in the sub-account) before the sub-account is closed (platform credentials).
    const close = await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/close`, undefined, realEnv);
    expect(close.status).toBe(200);
    const del = calls.findIndex((c) => c.method === 'DELETE' && c.url.includes(`/Accounts/${SUB}/IncomingPhoneNumbers/`));
    const closeIdx = calls.findIndex((c) => c.url.endsWith(`/Accounts/${SUB}.json`) && c.body.get('Status') === 'closed');
    expect(del).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(del);
    expect(calls[closeIdx].auth).toBe('Basic ' + btoa(`${testEnv.TWILIO_ACCOUNT_SID}:${testEnv.TWILIO_AUTH_TOKEN}`));
  });
});
