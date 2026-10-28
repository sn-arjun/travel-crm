import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { twilioSignature } from '../src/middleware/provider-signature';
import { decryptSecret } from '../src/utils/crypto-box';
import { MockVoipProvider, MOCK_AUTH_TOKEN } from '../src/services/voip/mock-provider';
import { TwilioVoipProvider } from '../src/services/twilio-voice';
import { subAccountSecretAad, type VoipSettingsRow } from '../src/services/voip-provider';
import { callingAllowList, callingAvailabilityFor } from '../src/services/voip/country-gate';
import { numberPrice } from '../src/services/voip/numbers';
import { loadTenant } from '../src/services/billing/subscriptions';
import { quoteAddon } from '../src/services/billing/addons';
import { getCatalogue } from '../src/services/plans/catalogue';
import { minuteWeight } from '../src/services/voip/metering';
import { preflightOutbound } from '../src/services/voip/fraud';
import { loadRecordingSettings } from '../src/services/voip/recordings';
import { PROMPTS, PROMPT_LANGUAGES, promptText, resolvePromptLanguage } from '../src/services/voip/prompts';
import { pollRegulatory, regulatoryState, regulatoryWebhookKey } from '../src/services/voip/regulatory';
import { JOB_SETS, runRegulatoryPoll } from '../src/cron/dispatch';
import { superAdminToken } from './utils/super-admin';
import submitFixture from './fixtures/twilio-regulatory/submit-bundle.json';
import approvedFixture from './fixtures/twilio-regulatory/status-approved.json';
import rejectedFixture from './fixtures/twilio-regulatory/status-rejected.json';
import purchaseFixture from './fixtures/twilio-regulatory/purchase-with-bundle.json';

// R137: calling ready to switch on in the EU, the Netherlands first. Country gate, pricing, number regulatory bundle
// (mock provider end to end, Twilio adapter against recorded fixtures), recording default by country, Dutch prompts.
// No network: the provider is the in-memory mock, and the adapter runs over a mocked fetch.

const testEnv = env as any;
const mockEnv = { ...testEnv, VOIP_PROVIDER: 'mock' } as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const SA_ID = '01960000-0000-7000-8000-000000137aaa';
const OWNER_EMAIL = 'owner@r137.test';
const NL_PHONE_COST_ID = '01a15fab-db01-7d72-bf77-cee76f237fa0';
const NL_MINUTE_COST_ID = '01a15fab-db02-7c41-83ce-0f5ac346d509';
const EU_MINUTE_COST_ID = '01a157e5-2f4a-752c-9ea7-ca87c01b6c58';
const EU_PHONE_COST_ID = '01a157e5-2f4b-7261-9e7a-8bfe8eda9884';

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = mockEnv, headers: Record<string, string> = {}): Promise<Response> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function postForm(path: string, token: string, form: FormData, e: any = mockEnv): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/** A provider callback posted as a form (unsigned unless a signature is given). */
async function callback(path: string, fields: Record<string, string>, signature?: string | null, e: any = mockEnv): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (signature) headers['X-Twilio-Signature'] = signature;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1/voip${path}`, { method: 'POST', headers, body: new URLSearchParams(fields).toString() }), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const publicBase = () => (testEnv.API_PUBLIC_URL ? String(testEnv.API_PUBLIC_URL).replace(/[/]+$/, '') : 'http://localhost');

async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}
const one = async <T = Record<string, any>>(sql: string, ...binds: unknown[]) => (await rows<T>(sql, ...binds))[0];
const run = (sql: string, ...binds: unknown[]) => testEnv.MASTER_DB.prepare(sql).bind(...binds).run();
const data = async (res: Response) => (await res.json()) as any;

async function setCountry(country: string | null): Promise<void> {
  if (country === null) await run("DELETE FROM settings WHERE key IN ('country', 'company_country')");
  else await run("INSERT INTO settings (key, value) VALUES ('country', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", country);
  await run('UPDATE tenants SET country = ? WHERE id = ?', country, TENANT_ID);
}

async function setLanguage(language: string | null): Promise<void> {
  if (language === null) await run("DELETE FROM settings WHERE key = 'default_language'");
  else await run("INSERT INTO settings (key, value) VALUES ('default_language', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", language);
}

async function wipe(): Promise<void> {
  for (const sql of [
    'DELETE FROM voip_number_registry', 'DELETE FROM voip_accounts', 'DELETE FROM number_documents',
    "DELETE FROM tenant_channel_addresses WHERE channel IN ('voice', 'voip_regulatory_webhook')", 'DELETE FROM voip_numbers',
    "DELETE FROM tenant_addons WHERE product_key LIKE 'phone_number%'",
    'DELETE FROM voip_settings', "DELETE FROM settings WHERE key = 'default_language'",
  ]) await run(sql);
}

let admin = '';
let sa = '';
const asAdmin = (method: string, path: string, body?: unknown, e: any = mockEnv) => call(method, path, sa, body, e);

const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52, 10]); // "%PDF-1.4\n", 9 bytes

function nlForm(over: { omitFile?: boolean; omitName?: boolean; badAddress?: boolean; fileType?: string } = {}): FormData {
  const f = new FormData();
  if (!over.omitName) f.set('businessName', 'Voorbeeld Reizen B.V.');
  f.set('registrationNumber', '12345678');
  f.set('address', over.badAddress ? JSON.stringify({ street: 'Voorbeeldstraat 1' }) : JSON.stringify({ street: 'Voorbeeldstraat 1', city: 'Amsterdam', region: 'Noord-Holland', postalCode: '1011 AB' }));
  f.set('representativeName', 'Jan de Vries');
  if (!over.omitFile) f.set('registrationExtract', new File([PDF], 'kvk-extract.pdf', { type: over.fileType ?? 'application/pdf' }));
  return f;
}

async function activateNlPrices(): Promise<void> {
  expect((await asAdmin('PUT', `/admin/catalogue/unit-costs/${NL_PHONE_COST_ID}`, { unitCost: 1.5, provider: 'Twilio NL (test price)', isActive: true })).status).toBe(200);
  expect((await asAdmin('PUT', '/admin/catalogue/addons/phone_number_nl', { isActive: true })).status).toBe(200);
}

async function deactivateNlPrices(): Promise<void> {
  await asAdmin('PUT', `/admin/catalogue/unit-costs/${NL_PHONE_COST_ID}`, { unitCost: 0, provider: "DRAFT: enter Twilio's NL price before selling", isActive: false });
  await asAdmin('PUT', '/admin/catalogue/addons/phone_number_nl', { isActive: false });
}

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  await wipe();
  MockVoipProvider.reset();
  await setCountry('NL');
  await run("UPDATE tenants SET owner_email = ?, plan = 'pro', status = 'active' WHERE id = ?", OWNER_EMAIL, TENANT_ID);
  const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
  admin = ((await login.json()) as any).data.accessToken;
  sa = await superAdminToken(testEnv, { id: SA_ID, email: 'r137-sa@test.local' });
});

afterAll(async () => {
  await wipe();
  await deactivateNlPrices();
  await run("UPDATE tenants SET country = NULL, owner_email = NULL, plan = 'pro', status = 'active' WHERE id = ?", TENANT_ID);
  await setCountry(null);
  await call('DELETE', '/test/outbox', null);
  MockVoipProvider.rejectBundles(null);
  vi.restoreAllMocks();
});

afterEach(() => vi.restoreAllMocks());

// ── Country gate ──────────────────────────────────────────────

describe('the Netherlands is offered calling', () => {
  it('is on the default allow-list; configuration decides otherwise', async () => {
    expect(callingAllowList({}).countries).toContain('NL');
    expect(callingAvailabilityFor('NL', callingAllowList({}))).toMatchObject({ available: true, reason: 'ok' });
    expect(callingAvailabilityFor('nl', callingAllowList({ VOIP_CALLING_COUNTRIES: 'US,NL' })).available).toBe(true);
    expect(callingAvailabilityFor('NL', callingAllowList({ VOIP_CALLING_COUNTRIES: 'US' }))).toMatchObject({ available: false, reason: 'country_not_supported' });
  });

  it('an NL agency sees calling with VOIP_CALLING_COUNTRIES unset, and does not when it is set to US only', async () => {
    const unset = { ...mockEnv, VOIP_CALLING_COUNTRIES: undefined };
    const ok = await call('GET', '/voip/account', admin, undefined, unset);
    expect(ok.status).toBe(200);
    expect((await data(ok)).data).toMatchObject({ available: true, country: 'NL', position: 'resell' });

    const usOnly = { ...mockEnv, VOIP_CALLING_COUNTRIES: 'US' };
    const refused = await call('GET', '/voip/account', admin, undefined, usOnly);
    expect(refused.status).toBe(403);
    expect((await data(refused)).error.details).toMatchObject({ code: 'CALLING_NOT_AVAILABLE_IN_COUNTRY', country: 'NL' });
  });

  it('the production default of the generated configuration is US,NL (gen-wrangler self-test), and the code default names NL', () => {
    expect(callingAllowList({ ENVIRONMENT: 'production', VOIP_CALLING_COUNTRIES: '*' }).countries).toContain('NL');
  });
});

// ── Seed rows ─────────────────────────────────────────────────

describe('migration 0029: policy, pricing and draft rows', () => {
  it('NL is a resell country with a draft requirement list and an announce recording default; other rows keep today\'s flow', async () => {
    const list = (await data(await asAdmin('GET', '/admin/voip/country-policy'))).data as any[];
    const nl = list.find((p) => p.country === 'NL');
    expect(nl).toMatchObject({ position: 'resell', provider: 'twilio', kycRequired: true, recordingDefault: 'announce' });
    expect(nl.kycRequirements.map((r: any) => [r.key, r.type, r.required])).toEqual([
      ['businessName', 'text', true],
      ['registrationNumber', 'text', true],
      ['address', 'address', true],
      ['representativeName', 'text', true],
      ['registrationExtract', 'file', true],
    ]);
    expect(nl.notes).toContain('Regulations API');
    for (const country of ['GB', 'US', 'AU', 'SG', 'DE', 'MY']) {
      const row = list.find((p) => p.country === country);
      expect(row.kycRequirements, country).toBeNull();
      expect(row.recordingDefault, country).toBe('announce');
    }
  });

  it('the EU minute and number rows and the two EU add-ons are active; the NL rows are inactive drafts with no price', async () => {
    const eu = await rows('SELECT id, is_active FROM comm_unit_costs WHERE id IN (?, ?)', EU_MINUTE_COST_ID, EU_PHONE_COST_ID);
    expect(eu.map((r) => r.is_active)).toEqual([1, 1]);
    const euAddons = await rows("SELECT key, is_active FROM addon_products WHERE key IN ('call_minutes_500_eu', 'phone_number_eu') ORDER BY key");
    expect(euAddons.map((r) => r.is_active)).toEqual([1, 1]);

    const draftNumber = await one<any>('SELECT * FROM comm_unit_costs WHERE id = ?', NL_PHONE_COST_ID);
    const draftMinute = await one<any>('SELECT * FROM comm_unit_costs WHERE id = ?', NL_MINUTE_COST_ID);
    expect(draftNumber).toMatchObject({ channel: 'phone_number', market: 'NL', unit_cost: 0, is_active: 0, currency: 'EUR' });
    expect(draftMinute).toMatchObject({ channel: 'call_minute', market: 'NL', unit_cost: 0, is_active: 0, currency: 'USD' });
    expect(draftNumber.provider).toMatch(/^DRAFT: enter Twilio's NL price before selling/);
    expect(await one<any>("SELECT * FROM addon_products WHERE key = 'phone_number_nl'")).toMatchObject({ channel: 'phone_number', market: 'NL', currency: 'EUR', units: 1, is_active: 0 });
  });
});

// ── Price by country, then market ─────────────────────────────

describe('number price: the country row first, then the market', () => {
  it('an NL number has no price while the NL row is a draft: never the Germany-based EU price', async () => {
    const tenant = (await loadTenant(mockEnv, TENANT_ID))!;
    expect(await numberPrice(mockEnv, tenant, 'NL')).toEqual({ price: null, reason: 'PRICE_NOT_CONFIGURED' });
    const offer = (await data(await call('GET', '/voip/number-offer', admin))).data;
    expect(offer.price).toBeNull();
    expect(offer.priceReason).toBe('PRICE_NOT_CONFIGURED');
    expect(offer.calling).toMatchObject({ allowed: true, country: 'NL', position: 'resell' });
  });

  it('a German agency still gets the EU price', async () => {
    const tenant = (await loadTenant(mockEnv, TENANT_ID))!;
    const de = await numberPrice(mockEnv, { ...tenant, country: 'DE' }, 'DE');
    expect(de.reason).toBeNull();
    expect(de.price).toMatchObject({ productKey: 'phone_number_eu', currency: 'EUR' });
    expect(de.price!.unitPrice).toBeGreaterThan(1.2);
  });

  it('once the owner enters the Twilio NL price and activates the row, the NL price applies', async () => {
    await activateNlPrices();
    const tenant = (await loadTenant(mockEnv, TENANT_ID))!;
    const nl = await numberPrice(mockEnv, tenant, 'NL');
    expect(nl.reason).toBeNull();
    expect(nl.price).toMatchObject({ productKey: 'phone_number_nl', currency: 'EUR' });
    expect(nl.price!.unitPrice).toBeCloseTo(1.95, 2); // EUR 1.50 x 1.30
    const offer = (await data(await call('GET', '/voip/number-offer', admin))).data;
    expect(offer.price).toMatchObject({ productKey: 'phone_number_nl', currency: 'EUR' });
    // The EU product is not sold to an NL agency while a country product exists, and still is to a German one.
    await expect(quoteAddon(mockEnv, tenant, 'phone_number_eu', 1)).rejects.toMatchObject({ code: 'PRICE_NOT_CONFIGURED' });
    expect((await quoteAddon(mockEnv, { ...tenant, country: 'DE' }, 'phone_number_eu', 1)).currency).toBe('EUR');
    await deactivateNlPrices();
    expect((await numberPrice(mockEnv, tenant, 'NL')).reason).toBe('PRICE_NOT_CONFIGURED');
  });

  it('a minute to an NL destination with the inactive draft row is priced by the EU market row (weight 1)', async () => {
    const catalogue = await getCatalogue(mockEnv);
    const draft = catalogue.unitCosts.find((u) => u.id === NL_MINUTE_COST_ID);
    expect(draft).toMatchObject({ market: 'NL', isActive: false, unitCost: 0 });
    expect(minuteWeight(catalogue, { country: 'NL', market: 'EU' }, 'NL')).toBe(1);
    // Even switched on with no price, a zero-cost row is ignored rather than producing a zero or infinite weight.
    expect(await asAdmin('PUT', `/admin/catalogue/unit-costs/${NL_MINUTE_COST_ID}`, { isActive: true })).toHaveProperty('status', 200);
    expect(minuteWeight(await getCatalogue(mockEnv), { country: 'NL', market: 'EU' }, 'NL')).toBe(1);
    await asAdmin('PUT', `/admin/catalogue/unit-costs/${NL_MINUTE_COST_ID}`, { isActive: false });
  });
});

// ── Fraud preflight for an NL agency ──────────────────────────

describe('fraud limits for an NL agency', () => {
  const preflight = (toNumber: string) => preflightOutbound(mockEnv, { tenantId: TENANT_ID, db: testEnv.MASTER_DB, userId: '11111111-1111-1111-1111-111111111111', toNumber });

  it('+31 mobile and landline numbers are allowed (the agency\'s own country)', async () => {
    expect(await preflight('+31612345678')).toBeNull();
    expect(await preflight('+31201234567')).toBeNull();
  });

  it('a UK number is refused unless the platform allow-lists the country; a premium prefix is refused outright', async () => {
    expect(await preflight('+442071234567')).toMatchObject({ status: 403, code: 'DESTINATION_NOT_ALLOWED' });
    await run('DELETE FROM voip_allowed_countries WHERE tenant_id = ?', TENANT_ID);
    expect((await asAdmin('PUT', `/admin/tenants/${TENANT_ID}/voip/countries`, { countries: ['GB'] })).status).toBe(200);
    expect(await preflight('+442071234567')).toBeNull();
    expect((await asAdmin('PUT', `/admin/tenants/${TENANT_ID}/voip/countries`, { countries: [] })).status).toBe(200);
    expect(await preflight('+87012345678')).toMatchObject({ status: 403, code: 'DESTINATION_BLOCKED' });
    expect(await preflight('+319001234')).toMatchObject({ status: 403, code: 'DESTINATION_BLOCKED' });
    await run("DELETE FROM voip_fraud_events WHERE tenant_id = ?", TENANT_ID);
  });
});

// ── Regulatory bundle, mock provider end to end ───────────────

describe('regulatory bundle flow (mock provider)', () => {
  let chosen: string[] = [];

  it('turns calling on and finds NL numbers; the requirements endpoint lists what the country asks for', async () => {
    MockVoipProvider.reset();
    expect((await call('POST', '/voip/account/enable', admin, {})).status).toBe(200);
    const search = await call('POST', '/voip/numbers/search', admin, {});
    expect(search.status).toBe(200);
    chosen = ((await data(search)).data as any[]).map((n) => n.phoneNumber);
    expect(chosen.length).toBeGreaterThan(0);
    expect(chosen.every((n) => n.startsWith('+31'))).toBe(true);

    const req = (await data(await call('GET', '/voip/numbers/requirements', admin))).data;
    expect(req).toMatchObject({ country: 'NL', bundleFlow: true, kycRequired: true, recordingDefault: 'announce', state: 'none', numberTypes: ['local', 'mobile', 'national'] });
    expect(req.requirements).toHaveLength(5);
    expect(req.requirements.find((r: any) => r.key === 'registrationExtract')).toMatchObject({ type: 'file', required: true });
  });

  it('incomplete or unacceptable submissions are refused and nothing is stored', async () => {
    const missingFile = await postForm('/voip/numbers/documents', admin, nlForm({ omitFile: true }));
    expect(missingFile.status).toBe(400);
    const missingBody = await data(missingFile);
    expect(missingBody.error.details).toMatchObject({ code: 'KYC_INCOMPLETE' });
    expect(missingBody.error.details.problems).toEqual([{ key: 'registrationExtract', message: 'Registration extract is required' }]);

    const badAddress = await postForm('/voip/numbers/documents', admin, nlForm({ badAddress: true }));
    expect((await data(badAddress)).error.details.problems[0]).toMatchObject({ key: 'address' });

    const noName = await postForm('/voip/numbers/documents', admin, nlForm({ omitName: true }));
    expect((await data(noName)).error.details.problems[0]).toMatchObject({ key: 'businessName' });

    const wrongType = await postForm('/voip/numbers/documents', admin, nlForm({ fileType: 'application/zip' }));
    expect(wrongType.status).toBe(400);
    expect((await data(wrongType)).error.details.code).toBe('FILE_TYPE_NOT_ALLOWED');

    // Links alone cannot satisfy a file requirement: only a stored upload reaches the provider.
    const linkOnly = await call('POST', '/voip/numbers/documents', admin, {
      details: { businessName: 'Voorbeeld Reizen B.V.', registrationNumber: '1', representativeName: 'J', address: { street: 's', city: 'c', postalCode: 'p' } },
      files: [{ name: 'extract.pdf', url: 'https://files.example.test/x.pdf', field: 'registrationExtract' }],
    });
    expect(linkOnly.status).toBe(400);
    expect(await rows('SELECT 1 FROM number_documents')).toHaveLength(0);
    // Another country's papers cannot be filed.
    const other = nlForm();
    other.set('country', 'GB');
    expect((await postForm('/voip/numbers/documents', admin, other)).status).toBe(403);
  });

  it('purchase before documents says KYC_REQUIRED; the agency uploads, and the state is submitted', async () => {
    await activateNlPrices();
    await run(
      `INSERT INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source) VALUES ('r137-grant-1', ?, 'phone_number_nl', 1, 1, ?, 'super_admin_grant')`,
      TENANT_ID,
      new Date().toISOString().slice(0, 7),
    );
    const buy = () => call('POST', '/voip/numbers/purchase', admin, { phoneNumber: chosen[0] });
    let res = await buy();
    expect(res.status).toBe(409);
    expect((await data(res)).error.details).toMatchObject({ code: 'KYC_REQUIRED', kycStatus: 'none' });

    const sent = await postForm('/voip/numbers/documents', admin, nlForm());
    expect(sent.status).toBe(200);
    const doc = (await data(sent)).data.document;
    expect(doc).toMatchObject({ status: 'pending', regulatory: { state: 'submitted', providerStatus: null } });
    // The agency sees file names, never storage keys; the console does.
    expect(doc.files).toEqual([expect.objectContaining({ name: 'kvk-extract.pdf', field: 'registrationExtract' })]);
    expect(JSON.stringify(doc.files)).not.toContain('/kyc/');
    const stored = await one<any>('SELECT files FROM number_documents');
    const key = JSON.parse(stored.files)[0].key as string;
    expect(key.startsWith(`${TENANT_ID}/kyc/NL/`)).toBe(true);
    expect(await testEnv.FILE_STORAGE.head(key)).not.toBeNull();
    // Admins can read the stored document through the files route; nobody can delete it there.
    const read = await call('GET', `/files/${encodeURIComponent(key)}`, admin);
    expect(read.status).toBe(200);
    expect([...new Uint8Array(await read.arrayBuffer())]).toEqual([...PDF]);
    expect((await call('DELETE', `/files/${encodeURIComponent(key)}`, admin)).status).toBe(403);

    res = await buy();
    expect((await data(res)).error.details).toMatchObject({ code: 'KYC_REQUIRED', kycStatus: 'pending' });
    expect((await data(await call('GET', '/voip/number-offer', admin))).data.regulatory).toMatchObject({ bundleFlow: true, state: 'submitted' });
  });

  it('the super admin approves: the bundle is submitted to the provider with the file from storage, and the agency waits', async () => {
    const res = await asAdmin('PUT', `/admin/tenants/${TENANT_ID}/voip/documents/NL`, { status: 'approved' });
    expect(res.status).toBe(200);
    const body = (await data(res)).data;
    expect(body).toMatchObject({ status: 'approved', submittedToProvider: true, submitError: null, regulatory: { state: 'provider_review', providerStatus: 'pending-review' } });
    expect(body.regulatory.bundleSid).toMatch(/^BU/);

    const [bundle] = [...MockVoipProvider.bundles.values()];
    expect(bundle.country).toBe('NL');
    expect(bundle.input).toMatchObject({
      numberType: 'local',
      email: OWNER_EMAIL,
      endUser: { name: 'Voorbeeld Reizen B.V.', attributes: { registrationNumber: '12345678', representativeName: 'Jan de Vries' } },
      address: { customerName: 'Voorbeeld Reizen B.V.', street: 'Voorbeeldstraat 1', city: 'Amsterdam', region: 'Noord-Holland', postalCode: '1011 AB', isoCountry: 'NL' },
    });
    expect(bundle.input.documents).toHaveLength(1);
    expect(bundle.input.documents[0]).toMatchObject({ field: 'registrationExtract', name: 'kvk-extract.pdf', contentType: 'application/pdf' });
    expect([...new Uint8Array(bundle.input.documents[0].bytes)]).toEqual([...PDF]);
    const key = await regulatoryWebhookKey(mockEnv, TENANT_ID, false);
    expect(key).toMatch(/^vr_[0-9a-f]{40}$/);
    expect(bundle.input.statusCallbackUrl).toBe(`${publicBase()}/api/v1/voip/regulatory-callback/${key}`);
  });

  it('a purchase now says which step is pending, with the provider status', async () => {
    const res = await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: chosen[0] });
    expect(res.status).toBe(409);
    expect((await data(res)).error.details).toMatchObject({ code: 'KYC_PENDING_PROVIDER', state: 'provider_review', providerStatus: 'pending-review' });
    expect(MockVoipProvider.heldNumbers).toEqual([]);
    expect((await data(await call('GET', '/voip/numbers/requirements', admin))).data).toMatchObject({ state: 'provider_review', providerStatus: 'pending-review' });
    // The documents cannot be changed while the provider reviews them.
    const again = await postForm('/voip/numbers/documents', admin, nlForm());
    expect(again.status).toBe(409);
    expect((await data(again)).error.details.code).toBe('KYC_IN_REVIEW');
  });

  it('a signed status callback moves the state; a bad signature is 403 and an unknown key is 404', async () => {
    const [bundle] = [...MockVoipProvider.bundles.values()];
    const key = (await regulatoryWebhookKey(mockEnv, TENANT_ID, false))!;
    const path = `/regulatory-callback/${key}`;
    const fields = { BundleSid: bundle.bundleSid, Status: 'twilio-approved', AccountSid: 'ACmock' };

    expect((await callback(path, fields, 'bogus-signature')).status).toBe(403);
    expect((await one<any>('SELECT provider_status FROM number_documents')).provider_status).toBe('pending-review');
    // Outside test mode an unsigned callback is refused too.
    expect((await callback(path, fields, null, { ...mockEnv, TEST_MODE: 'false' })).status).toBe(403);
    expect((await callback('/regulatory-callback/vr_unknown', fields, 'x')).status).toBe(404);

    // Signed with the platform token (the fallback) it is accepted; so it is with the agency's sub-account token (next test).
    const url = `${publicBase()}/api/v1/voip${path}`;
    const signed = await twilioSignature(url, fields, testEnv.TWILIO_AUTH_TOKEN || 'platform-token');
    if (testEnv.TWILIO_AUTH_TOKEN) {
      expect((await callback(path, fields, signed)).status).toBe(200);
    }
    const account = await one<any>('SELECT * FROM voip_accounts WHERE tenant_id = ?', TENANT_ID);
    const opened = await decryptSecret(testEnv, account.credentials_enc, subAccountSecretAad(TENANT_ID, account.sub_account_id));
    const good = await twilioSignature(url, fields, opened.value);
    const ok = await callback(path, fields, good);
    expect(ok.status).toBe(200);
    expect((await one<any>('SELECT provider_status FROM number_documents')).provider_status).toBe('twilio-approved');
    // A callback about a bundle that is not the agency's is ignored (200, nothing changes).
    const stray = { BundleSid: 'BUstray', Status: 'twilio-rejected' };
    expect((await callback(path, stray, await twilioSignature(url, stray, opened.value))).status).toBe(200);
    expect((await one<any>('SELECT provider_status FROM number_documents')).provider_status).toBe('twilio-approved');
  });

  it('approved: the purchase passes the bundle and address sids and the number is registered', async () => {
    const doc = await one<any>('SELECT * FROM number_documents');
    expect(regulatoryState(doc, true)).toBe('approved');
    const res = await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: chosen[0], friendlyName: 'Kantoor' });
    expect(res.status).toBe(200);
    expect(MockVoipProvider.bundlePurchases).toEqual([{ phoneNumber: chosen[0], bundleSid: doc.provider_bundle_sid, addressSid: doc.provider_address_sid }]);
    expect(MockVoipProvider.heldNumbers).toEqual([chosen[0]]);
    expect(await one<any>(`SELECT tenant_id FROM tenant_channel_addresses WHERE channel = 'voice' AND address = ?`, chosen[0])).toEqual({ tenant_id: TENANT_ID });
    expect((await data(await call('GET', '/voip/numbers/requirements', admin))).data).toMatchObject({ state: 'approved' });
  });

  it('the mock refuses a purchase with a bundle that is not approved, as the provider would', async () => {
    const provider = new MockVoipProvider({ voipProvider: 'mock' } as VoipSettingsRow);
    const submitted = await provider.submitRegulatoryBundle!({
      country: 'NL', numberType: 'local', email: 'a@b.test', documents: [],
      endUser: { name: 'X', attributes: {} },
      address: { customerName: 'X', street: 's', city: 'c', region: 'r', postalCode: 'p', isoCountry: 'NL' },
    });
    MockVoipProvider.rejectBundles(null);
    MockVoipProvider.decideBundle(submitted.bundleSid, 'twilio-rejected', 'No');
    await expect(provider.purchaseNumber('+31203009999', 'x', undefined, { bundleSid: submitted.bundleSid, addressSid: submitted.addressSid })).rejects.toMatchObject({ kind: 'invalid_request' });
    await expect(provider.purchaseNumber('+31203009999', 'x', undefined, { bundleSid: 'BUnone', addressSid: submitted.addressSid })).rejects.toMatchObject({ kind: 'invalid_request' });
  });
});

describe('regulatory bundle: rejection, delay, retry and poll (mock provider)', () => {
  const reset = async () => {
    await run('DELETE FROM number_documents');
    await run('DELETE FROM voip_number_registry');
    MockVoipProvider.reset();
  };

  it('a provider rejection blocks the purchase with the reason; the agency corrects and sends again', async () => {
    await reset();
    MockVoipProvider.rejectBundles('The registration number does not match the extract');
    expect((await postForm('/voip/numbers/documents', admin, nlForm())).status).toBe(200);
    const approved = await asAdmin('PUT', `/admin/tenants/${TENANT_ID}/voip/documents/NL`, { status: 'approved' });
    expect((await data(approved)).data.regulatory.state).toBe('provider_review');

    const refreshed = await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/documents/NL/refresh-status`);
    expect(refreshed.status).toBe(200);
    expect((await data(refreshed)).data.regulatory).toMatchObject({ state: 'rejected', providerStatus: 'twilio-rejected', failureReason: 'The registration number does not match the extract' });

    const buy = await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: '+31203000555' });
    expect(buy.status).toBe(409);
    expect((await data(buy)).error.details).toMatchObject({ code: 'KYC_PENDING_PROVIDER', state: 'rejected', failureReason: 'The registration number does not match the extract' });
    expect(MockVoipProvider.heldNumbers).toEqual([]);

    // The agency sees the reason and can send again: the state goes back to submitted and the provider side is cleared.
    expect((await data(await call('GET', '/voip/numbers/requirements', admin))).data).toMatchObject({ state: 'rejected', failureReason: 'The registration number does not match the extract' });
    MockVoipProvider.rejectBundles(null);
    const resent = await postForm('/voip/numbers/documents', admin, nlForm());
    expect(resent.status).toBe(200);
    expect((await data(resent)).data.document.regulatory).toMatchObject({ state: 'submitted', providerStatus: null });
    expect(await one<any>('SELECT provider_bundle_sid, provider_failure_reason FROM number_documents')).toEqual({ provider_bundle_sid: null, provider_failure_reason: null });
  });

  it('the super admin rejecting the documents is a rejection too, with the note as the reason', async () => {
    expect((await asAdmin('PUT', `/admin/tenants/${TENANT_ID}/voip/documents/NL`, { status: 'rejected', note: 'Extract is older than three months' })).status).toBe(200);
    const view = (await data(await call('GET', '/voip/numbers/requirements', admin))).data;
    expect(view).toMatchObject({ state: 'rejected', failureReason: 'Extract is older than three months' });
    expect((await data(await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: '+31203000555' }))).error.details).toMatchObject({ code: 'KYC_REQUIRED' });
  });

  it('a bundle the provider has not decided yet stays in review until the delay passes; the hourly poll and the job pick it up', async () => {
    await reset();
    const slow = { ...mockEnv, MOCK_BUNDLE_DELAY_SECONDS: '3600' };
    expect((await postForm('/voip/numbers/documents', admin, nlForm(), slow)).status).toBe(200);
    expect((await data(await asAdmin('PUT', `/admin/tenants/${TENANT_ID}/voip/documents/NL`, { status: 'approved' }, slow))).data.regulatory.state).toBe('provider_review');
    const still = await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/documents/NL/refresh-status`, undefined, slow);
    expect((await data(still)).data.regulatory).toMatchObject({ state: 'provider_review', providerStatus: 'pending-review' });
    expect(await pollRegulatory(slow, TENANT_ID)).toEqual({ checked: 1, changed: 0 });

    // The delay is over (the mock decides by the clock): the poll records the approval.
    const [bundle] = [...MockVoipProvider.bundles.values()];
    bundle.approveAt = Date.now() - 1;
    expect(await pollRegulatory(slow, TENANT_ID)).toEqual({ checked: 1, changed: 1 });
    expect((await one<any>('SELECT provider_status FROM number_documents')).provider_status).toBe('twilio-approved');
    expect(await pollRegulatory(slow, TENANT_ID)).toEqual({ checked: 0, changed: 0 });
    expect(JOB_SETS.every5.find((j) => j.name === 'voip.regulatory-poll')?.period).toBe('tick');
    // The job asks the provider at most once an hour per agency, however many ticks fire.
    const hour = new Date('2026-11-03T10:05:00Z');
    expect(await runRegulatoryPoll(slow, TENANT_ID, testEnv.MASTER_DB, hour)).toEqual({ checked: 0, changed: 0 });
    expect(await runRegulatoryPoll(slow, TENANT_ID, testEnv.MASTER_DB, new Date('2026-11-03T10:50:00Z'))).toEqual({ skipped: true });
    expect(await runRegulatoryPoll(slow, TENANT_ID, testEnv.MASTER_DB, new Date('2026-11-03T11:05:00Z'))).toEqual({ checked: 0, changed: 0 });
    await run("DELETE FROM cron_job_runs WHERE job = 'voip.regulatory-poll.hourly'");
  });

  it('a submission the provider refuses is recorded (platform_review with the reason) and the admin can retry or reset', async () => {
    await reset();
    expect((await postForm('/voip/numbers/documents', admin, nlForm())).status).toBe(200);
    vi.spyOn(MockVoipProvider.prototype, 'submitRegulatoryBundle').mockRejectedValueOnce(new Error('The provider is unavailable'));
    const approved = await asAdmin('PUT', `/admin/tenants/${TENANT_ID}/voip/documents/NL`, { status: 'approved' });
    expect(approved.status).toBe(200);
    const body = (await data(approved)).data;
    expect(body).toMatchObject({ status: 'approved', submittedToProvider: false, regulatory: { state: 'platform_review', providerStatus: 'submit_failed' } });
    expect(body.submitError).toContain('unavailable');
    expect((await data(await call('POST', '/voip/numbers/purchase', admin, { phoneNumber: '+31203000555' }))).error.details).toMatchObject({ code: 'KYC_PENDING_PROVIDER', state: 'platform_review' });

    const retry = await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/documents/NL/submit-to-provider`);
    expect(retry.status).toBe(200);
    expect((await data(retry)).data.regulatory.state).toBe('provider_review');
    // A second submit while the bundle is in review does not create another one.
    expect(MockVoipProvider.bundles.size).toBe(1);
    expect((await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/documents/NL/submit-to-provider`)).status).toBe(200);
    expect(MockVoipProvider.bundles.size).toBe(1);

    const resetRes = await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/documents/NL/reset`);
    expect((await data(resetRes)).data.regulatory).toMatchObject({ state: 'platform_review', providerStatus: null });
    expect((await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/documents/GB/refresh-status`)).status).toBe(404);
  });

  it('a country without a requirement list keeps the earlier flow: approval alone makes a number purchasable', async () => {
    await reset();
    await setCountry('GB');
    expect((await call('POST', '/voip/kyc', admin, { details: { businessName: 'Test Travels Ltd', address: '1 High Street, London' }, files: [] })).status).toBe(200);
    const approved = await asAdmin('PUT', `/admin/tenants/${TENANT_ID}/voip/documents/GB`, { status: 'approved' });
    const body = (await data(approved)).data;
    expect(body).toMatchObject({ status: 'approved', submittedToProvider: false, regulatory: { state: 'approved' } });
    expect(MockVoipProvider.bundles.size).toBe(0);
    expect((await asAdmin('POST', `/admin/tenants/${TENANT_ID}/voip/documents/GB/submit-to-provider`)).status).toBe(409);
    await setCountry('NL');
  });

  it('the admin can edit a country\'s requirement list and recording default', async () => {
    const list = [{ key: 'businessName', label: 'Company name', type: 'text', required: true }, { key: 'extract', label: 'Extract', type: 'file', required: true }];
    expect((await asAdmin('PUT', '/admin/voip/country-policy/DE', { position: 'resell', kycRequirements: list, recordingDefault: 'announce' })).status).toBe(200);
    const de = ((await data(await asAdmin('GET', '/admin/voip/country-policy'))).data as any[]).find((p) => p.country === 'DE');
    expect(de.kycRequirements).toEqual(list);
    expect((await asAdmin('PUT', '/admin/voip/country-policy/DE', { position: 'resell', kycRequirements: null })).status).toBe(200);
    expect((await data(await asAdmin('GET', '/admin/voip/country-policy'))).data.find((p: any) => p.country === 'DE').kycRequirements).toBeNull();
    expect((await asAdmin('PUT', '/admin/voip/country-policy/DE', { position: 'resell', recordingDefault: 'sometimes' })).status).toBe(400);
  });
});

// ── Recording default by country ──────────────────────────────

describe('recording default follows the agency country; an explicit choice wins', () => {
  const settingsRow = async (mode: string | null) => {
    await run('DELETE FROM voip_settings');
    await run('INSERT INTO voip_settings (id, recording_consent_mode) VALUES (?, ?)', 'r137-settings', mode);
  };

  it('a fresh NL agency announces and records; with no settings row at all the default is the same', async () => {
    await run('DELETE FROM voip_settings');
    expect((await loadRecordingSettings(testEnv.MASTER_DB, mockEnv)).consentMode).toBe('announce');
    await settingsRow(null);
    expect((await loadRecordingSettings(testEnv.MASTER_DB, mockEnv)).consentMode).toBe('announce');
    await settingsRow('announce');
    expect((await loadRecordingSettings(testEnv.MASTER_DB, mockEnv)).consentMode).toBe('announce');
    const payload = (await data(await call('GET', '/calls/recording-settings', admin))).data;
    expect(payload.consentMode).toBe('announce');
  });

  it('an explicit "off" or "on request" always wins over the country default', async () => {
    await settingsRow('off');
    expect((await loadRecordingSettings(testEnv.MASTER_DB, mockEnv)).consentMode).toBe('off');
    await settingsRow('on_request');
    expect((await loadRecordingSettings(testEnv.MASTER_DB, mockEnv)).consentMode).toBe('on_request');
  });

  it('a country whose default is not "announce" gives an agency that never chose that default', async () => {
    await asAdmin('PUT', '/admin/voip/country-policy/NL', { position: 'resell', recordingDefault: 'off' });
    await settingsRow(null);
    expect((await loadRecordingSettings(testEnv.MASTER_DB, mockEnv)).consentMode).toBe('off');
    await settingsRow('on_request');
    expect((await loadRecordingSettings(testEnv.MASTER_DB, mockEnv)).consentMode).toBe('on_request');
    // Without the environment (an old caller) the earlier default applies.
    await settingsRow(null);
    expect((await loadRecordingSettings(testEnv.MASTER_DB)).consentMode).toBe('announce');
    await asAdmin('PUT', '/admin/voip/country-policy/NL', { position: 'resell', recordingDefault: 'announce' });
    expect((await loadRecordingSettings(testEnv.MASTER_DB, mockEnv)).consentMode).toBe('announce');
    await run('DELETE FROM voip_settings');
  });
});

// ── Dutch prompts ─────────────────────────────────────────────

describe('spoken prompts in English and Dutch', () => {
  it('the catalogue has every prompt in every language, with a Polly voice and language per language', () => {
    expect(PROMPT_LANGUAGES).toEqual(['en', 'nl']);
    expect(Object.keys(PROMPTS.nl).sort()).toEqual(Object.keys(PROMPTS.en).sort());
    for (const lang of PROMPT_LANGUAGES) for (const text of Object.values(PROMPTS[lang])) expect(text.trim().length).toBeGreaterThan(3);
    expect(promptText('en', 'recordingAnnouncement')).toBe('This call may be recorded for quality and training purposes.');
    expect(promptText('nl', 'ivrPress', { digit: '2', label: 'Boekingen' })).toBe('Druk op 2 voor Boekingen.');
    expect(resolvePromptLanguage('nl-NL')).toBe('nl');
    expect(resolvePromptLanguage('NL')).toBe('nl');
    expect(resolvePromptLanguage('de')).toBe('en');
    expect(resolvePromptLanguage(null)).toBe('en');
  });

  it('the markup generators speak Dutch with the Dutch voice, and English stays as before', () => {
    const provider = new MockVoipProvider({ voipProvider: 'mock', voicemailGreetingUrl: null, maxRingDuration: 30 } as VoipSettingsRow);
    const ivr = provider.generateIvrMarkup('Welkom.', [{ digit: '1', label: 'Verkoop', action: 'dial', target: '' }], 'https://x.test/ivr', 'nl');
    expect(ivr).toContain('<Say voice="Polly.Lotte" language="nl-NL">Welkom. Druk op 1 voor Verkoop.</Say>');
    expect(ivr).toContain('We hebben geen invoer ontvangen. Tot ziens.');
    expect(provider.generateVoicemailMarkup('https://x.test/rec', undefined, 'nl')).toContain('<Say voice="Polly.Lotte" language="nl-NL">Laat een bericht achter na de piep.</Say>');
    expect(provider.generateHangupMarkup('Tot ziens.', 'nl')).toContain('<Say voice="Polly.Lotte" language="nl-NL">Tot ziens.</Say>');
    expect(provider.generateClientDialMarkup('u1', '+31201234567', true, { announcement: 'Dit gesprek wordt opgenomen.', language: 'nl' })).toContain('<Say voice="Polly.Lotte" language="nl-NL">Dit gesprek wordt opgenomen.</Say>');
    // English: the plain <Say> of before.
    expect(provider.generateVoicemailMarkup('https://x.test/rec')).toContain('<Say>Please leave a message after the beep.</Say>');
    expect(provider.generateIvrMarkup('Welcome.', [{ digit: '1', label: 'Sales', action: 'dial', target: '' }], 'https://x.test/ivr')).toContain('<Say>Welcome. Press 1 for Sales.</Say>');
  });

  it('callbacks for an agency whose language is Dutch answer in Dutch; an agency with no language hears English', async () => {
    await setLanguage('nl');
    const announce = await callback('/twiml/announce', {});
    const dutch = await announce.text();
    expect(dutch).toContain('<Say voice="Polly.Lotte" language="nl-NL">Dit gesprek kan worden opgenomen voor kwaliteits- en trainingsdoeleinden.</Say>');

    // The agency's own wording still wins, spoken in the Dutch voice.
    await run('DELETE FROM voip_settings');
    await run('INSERT INTO voip_settings (id, recording_announcement) VALUES (?, ?)', 'r137-own', 'Wij nemen dit gesprek op.');
    expect(await (await callback('/twiml/announce', {})).text()).toContain('<Say voice="Polly.Lotte" language="nl-NL">Wij nemen dit gesprek op.</Say>');

    const done = await (await callback('/voicemail-complete', {})).text();
    expect(done).toContain('<Say voice="Polly.Lotte" language="nl-NL">Bedankt voor uw bericht. Tot ziens.</Say>');
    const unanswered = await (await callback('/twiml/dial-status', { DialCallStatus: 'no-answer', CallSid: 'CAnl1' })).text();
    expect(unanswered).toContain('language="nl-NL"');
    expect(unanswered).toContain('Laat een bericht achter na de piep.');

    await setLanguage(null);
    await run('DELETE FROM voip_settings');
    const english = await (await callback('/twiml/announce', {})).text();
    expect(english).toContain('<Say>This call may be recorded for quality and training purposes.</Say>');
    expect(english).not.toContain('Polly.Lotte');
    expect(await (await callback('/voicemail-complete', {})).text()).toContain('<Say voice="Polly.Joanna" language="en-US">Thank you for your message. Goodbye.</Say>');
  });

  it('an inbound call to an NL agency that has no calling settings is told so in Dutch', async () => {
    await setLanguage('nl');
    await run('DELETE FROM voip_settings');
    const res = await callback('/twiml/inbound', { From: '+31612345678', To: '+31203000111', CallSid: 'CAnl2' });
    const xml = await res.text();
    // With no settings row the platform answers with the "unavailable" prompt in the agency language.
    expect(xml).toContain('Het spijt ons, deze dienst is momenteel niet beschikbaar. Probeer het later opnieuw.');
    expect(xml).toContain('voice="Polly.Lotte"');
    await setLanguage(null);
  });
});

// ── Twilio adapter against recorded fixtures ──────────────────

interface FixtureCall {
  request: { method: string; url: string; form?: Record<string, string>; multipart?: { fields: Record<string, string>; file: { field: string; name: string; type: string; size: number } } };
  response: { status: number; body: unknown };
}
interface Fixture { account: string; calls: FixtureCall[]; result: Record<string, unknown> }

const settingsFor = (account: string): VoipSettingsRow => ({
  id: 'r137-adapter', voipProvider: 'twilio', providerAccountId: account, providerAuthToken: 'sub-token', providerApiKeyId: null, providerApiKeySecret: null, providerAppId: null,
  twilioAccountSid: null, twilioAuthToken: null, twilioApiKeySid: null, twilioApiKeySecret: null, twilioTwimlAppSid: null,
  defaultCallerId: null, recordingPolicy: 'all', ivrEnabled: 0, ivrConfig: null, businessHoursEnabled: 0, businessHours: null,
  voicemailEnabled: 1, voicemailGreetingUrl: null, maxRingDuration: 30, routingStrategy: 'assigned', autoCreateLeadMissedCall: 1,
  recordingRetentionDays: 90, recordingStorageBytes: 0,
});

/** Mock fetch that replays a fixture in order and records every request that does not match the next recorded one. */
async function replay(fixture: Fixture): Promise<{ mismatches: string[]; used: number }> {
  const mismatches: string[] = [];
  let used = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.url;
    const method = init?.method ?? 'GET';
    const expected = fixture.calls[used++];
    if (!expected) {
      mismatches.push(`unexpected extra request ${method} ${url}`);
      return new Response('{}', { status: 500 });
    }
    if (expected.request.method !== method || expected.request.url !== url) mismatches.push(`expected ${expected.request.method} ${expected.request.url}, got ${method} ${url}`);
    const norm = (v: string) => (v.startsWith('{') ? JSON.stringify(JSON.parse(v)) : v);
    if (expected.request.form) {
      const got = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')).entries());
      const want = expected.request.form;
      if (JSON.stringify(Object.entries(got).map(([k, v]) => [k, norm(v)]).sort()) !== JSON.stringify(Object.entries(want).map(([k, v]) => [k, norm(v)]).sort())) {
        mismatches.push(`form of ${method} ${url}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
      }
    } else if (expected.request.multipart) {
      const body = init?.body;
      if (!(body instanceof FormData)) mismatches.push(`expected a multipart body for ${url}`);
      else {
        const want = expected.request.multipart;
        for (const [k, v] of Object.entries(want.fields)) {
          const got = body.get(k);
          if (typeof got !== 'string' || norm(got) !== norm(v)) mismatches.push(`multipart field ${k} of ${url}: expected ${v}, got ${String(got)}`);
        }
        const file = body.get(want.file.field) as unknown as File | null;
        if (!file || typeof file === 'string' || file.name !== want.file.name || file.type !== want.file.type || file.size !== want.file.size) {
          mismatches.push(`multipart file of ${url}: expected ${JSON.stringify(want.file)}`);
        }
      }
      const headers = (init?.headers ?? {}) as Record<string, string>;
      if (headers['Content-Type']) mismatches.push('a multipart request must not set its own Content-Type');
    }
    return new Response(JSON.stringify(expected.response.body), { status: expected.response.status, headers: { 'Content-Type': 'application/json' } });
  });
  return { mismatches, get used() { return used; } } as { mismatches: string[]; used: number };
}

describe('Twilio adapter: regulatory bundle requests match the recorded fixtures', () => {
  it('submitting a bundle makes exactly the recorded requests, in order, and returns the bundle and address', async () => {
    const fixture = submitFixture as unknown as Fixture;
    const state = await replay(fixture);
    const provider = new TwilioVoipProvider({ TWILIO_ACCOUNT_SID: 'ACplatform', TWILIO_AUTH_TOKEN: 'platform-token' }, settingsFor(fixture.account));
    const result = await provider.submitRegulatoryBundle({
      country: 'NL', numberType: 'local', email: 'owner@voorbeeld.test',
      endUser: { name: 'Voorbeeld Reizen B.V.', attributes: { registrationNumber: '12345678', representativeName: 'Jan de Vries' } },
      address: { customerName: 'Voorbeeld Reizen B.V.', street: 'Voorbeeldstraat 1', city: 'Amsterdam', region: 'Noord-Holland', postalCode: '1011 AB', isoCountry: 'NL' },
      documents: [{ field: 'registrationExtract', name: 'kvk-extract.pdf', contentType: 'application/pdf', bytes: PDF.buffer.slice(0) as ArrayBuffer }],
      statusCallbackUrl: 'https://api.example.test/api/v1/voip/regulatory-callback/vr_0123456789abcdef',
    });
    expect(state.mismatches).toEqual([]);
    expect(state.used).toBe(fixture.calls.length);
    expect(result).toEqual(fixture.result);
  });

  it('a country the provider has no regulation for is refused before anything is created', async () => {
    const fixture = submitFixture as unknown as Fixture;
    const state = await replay({ ...fixture, calls: [{ ...fixture.calls[0], response: { status: 200, body: { results: [] } } }] });
    const provider = new TwilioVoipProvider({ TWILIO_ACCOUNT_SID: 'ACplatform', TWILIO_AUTH_TOKEN: 'platform-token' }, settingsFor(fixture.account));
    await expect(
      provider.submitRegulatoryBundle({
        country: 'NL', numberType: 'local', email: 'a@b.test', documents: [], endUser: { name: 'X', attributes: {} },
        address: { customerName: 'X', street: 's', city: 'c', region: 'r', postalCode: 'p', isoCountry: 'NL' },
      }),
    ).rejects.toMatchObject({ code: 'NO_REGULATION' });
    expect(state.used).toBe(1);
  });

  it('polling an approved and a rejected bundle', async () => {
    for (const fixture of [approvedFixture, rejectedFixture] as unknown as Fixture[]) {
      const state = await replay(fixture);
      const provider = new TwilioVoipProvider({ TWILIO_ACCOUNT_SID: 'ACplatform', TWILIO_AUTH_TOKEN: 'platform-token' }, settingsFor(fixture.account));
      expect(await provider.getRegulatoryBundleStatus('BU00000000000000000000000000000001')).toEqual(fixture.result);
      expect(state.mismatches).toEqual([]);
      expect(state.used).toBe(fixture.calls.length);
      vi.restoreAllMocks();
    }
  });

  it('buying a number with an approved bundle sends BundleSid and AddressSid', async () => {
    const fixture = purchaseFixture as unknown as Fixture;
    const state = await replay(fixture);
    const provider = new TwilioVoipProvider({ TWILIO_ACCOUNT_SID: 'ACplatform', TWILIO_AUTH_TOKEN: 'platform-token' }, settingsFor(fixture.account));
    const bought = await provider.purchaseNumber('+31203000111', 'Company line', 'https://api.example.test', {
      bundleSid: 'BU00000000000000000000000000000001',
      addressSid: 'AD00000000000000000000000000000001',
    });
    expect(state.mismatches).toEqual([]);
    expect(bought).toMatchObject(fixture.result);
  });

  it('a purchase with no bundle sends neither field (every other country is unchanged)', async () => {
    let sent = '';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input: any, init?: RequestInit) => {
      sent = String(init?.body ?? '');
      return new Response(JSON.stringify({ sid: 'PN1', phone_number: '+442030011001', friendly_name: 'x', capabilities: { voice: true, sms: true } }), { status: 201 });
    });
    const provider = new TwilioVoipProvider({ TWILIO_ACCOUNT_SID: 'ACplatform', TWILIO_AUTH_TOKEN: 'platform-token' }, settingsFor('ACsub0000000000000000000000000000'));
    await provider.purchaseNumber('+442030011001', 'x', 'https://api.example.test');
    expect(sent).not.toContain('BundleSid');
    expect(sent).not.toContain('AddressSid');
  });
});

describe('mock provider defaults', () => {
  it('a mock bundle with the default delay is approved at once', async () => {
    MockVoipProvider.reset();
    const provider = new MockVoipProvider({ voipProvider: 'mock' } as VoipSettingsRow);
    const submitted = await provider.submitRegulatoryBundle!({
      country: 'NL', numberType: 'local', email: 'a@b.test', documents: [], endUser: { name: 'X', attributes: {} },
      address: { customerName: 'X', street: 's', city: 'c', region: 'r', postalCode: 'p', isoCountry: 'NL' },
    });
    expect(submitted.status).toBe('pending-review');
    expect(await provider.getRegulatoryBundleStatus!(submitted.bundleSid)).toEqual({ status: 'twilio-approved', failureReason: null });
    await expect(provider.getRegulatoryBundleStatus!('BUnone')).rejects.toMatchObject({ kind: 'not_found' });
    expect(MOCK_AUTH_TOKEN).toBeTruthy();
  });
});
