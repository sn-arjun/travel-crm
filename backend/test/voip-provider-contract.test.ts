import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { TwilioVoipProvider } from '../src/services/twilio-voice';
import { PlivoVoipProvider } from '../src/services/plivo-voice';
import { MockVoipProvider, MOCK_AUTH_TOKEN } from '../src/services/voip/mock-provider';
import { simulateVoipScenario } from '../src/services/voip/simulator';
import { callingAllowList, callingAvailabilityFor } from '../src/services/voip/country-gate';
import { createVoipProvider, NotImplementedForProvider, VoipProviderError, voipClientIdentity, subAccountSecretAad } from '../src/services/voip-provider';
import type { VoipProvider, VoipSettingsRow } from '../src/services/voip-provider';
import { twilioSignature } from '../src/middleware/provider-signature';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const USER_ID = '01960000-0000-7000-8000-0000000000a1';
const USER_IDENTITY = 'u_019600000000700080000000000000a1';
const AGENCY_NUMBER = '+442030011001';
const CUSTOMER = '+14155550123';

function settings(over: Partial<VoipSettingsRow> = {}): VoipSettingsRow {
  return {
    id: 'r301-settings', voipProvider: 'twilio',
    providerAccountId: 'ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', providerAuthToken: 'agency-token', providerApiKeyId: 'SKkey', providerApiKeySecret: 'key-secret', providerAppId: 'APapp',
    twilioAccountSid: null, twilioAuthToken: null, twilioApiKeySid: null, twilioApiKeySecret: null, twilioTwimlAppSid: null,
    defaultCallerId: AGENCY_NUMBER, recordingPolicy: 'all', ivrEnabled: 0, ivrConfig: null, businessHoursEnabled: 0, businessHours: null,
    voicemailEnabled: 1, voicemailGreetingUrl: null, maxRingDuration: 30, routingStrategy: 'assigned', autoCreateLeadMissedCall: 1,
    recordingRetentionDays: 90, recordingStorageBytes: 0,
    ...over,
  };
}

// A sealer that is visibly not the plaintext, and records what it was asked to seal.
const sealed: Array<{ plain: string; aad: string }> = [];
const deps = { sealSecret: async (plain: string, aad: string) => { sealed.push({ plain, aad }); return `sealed(${aad})`; } };

const twilio = () => new TwilioVoipProvider({ TWILIO_ACCOUNT_SID: 'ACplatform', TWILIO_AUTH_TOKEN: 'platform-token' }, settings(), deps);
const mock = () => new MockVoipProvider(settings({ voipProvider: 'mock' }), deps);

// ── Twilio over a mocked fetch ────────────────────────────────

interface Captured { url: string; method: string; headers: Record<string, string>; body: URLSearchParams }
let captured: Captured[] = [];
let respond: (c: Captured) => Response;

beforeEach(() => {
  captured = [];
  sealed.length = 0;
  MockVoipProvider.reset();
  respond = () => new Response('{}', { status: 200 });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: RequestInit) => {
    const c: Captured = {
      url: typeof input === 'string' ? input : input.url,
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: new URLSearchParams(typeof init?.body === 'string' ? init.body : ''),
    };
    captured.push(c);
    return respond(c);
  });
});
afterEach(() => vi.restoreAllMocks());

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const basic = (user: string, pass: string) => 'Basic ' + btoa(`${user}:${pass}`);

function decodeJwt(token: string): any {
  const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(part));
}

// Recorded Twilio responses (shape per the Calls list resource), used as fixtures for fetchUsage.
const CALLS_PAGE_1 = {
  calls: [
    { sid: 'CAfixture0000000000000000000000001', direction: 'outbound-api', from: AGENCY_NUMBER, to: CUSTOMER, start_time: 'Thu, 15 Oct 2026 10:00:00 +0000', duration: '61', price: '-0.01400', price_unit: 'USD', status: 'completed' },
    { sid: 'CAfixture0000000000000000000000002', direction: 'inbound', from: CUSTOMER, to: AGENCY_NUMBER, start_time: 'Thu, 15 Oct 2026 11:30:00 +0000', duration: '0', price: null, price_unit: 'USD', status: 'no-answer' },
  ],
  next_page_uri: '/2010-04-01/Accounts/ACsub/Calls.json?Page=1&PageSize=1000',
};
const CALLS_PAGE_2 = {
  calls: [
    { sid: 'CAfixture0000000000000000000000003', direction: 'outbound-dial', from: AGENCY_NUMBER, to: '+61291234567', start_time: 'Wed, 14 Oct 2026 09:00:00 +0000', duration: '120', price: '-0.0420', price_unit: 'usd', status: 'completed' },
    { sid: 'CAfixture0000000000000000000000004', direction: 'outbound-api', from: AGENCY_NUMBER, to: CUSTOMER, start_time: 'Wed, 14 Oct 2026 18:00:00 +0000', duration: '5', price: '-0.014', price_unit: 'GBP', status: 'completed' },
  ],
  next_page_uri: null,
};

// ── The contract, run against every provider that implements it ──

const providers: Array<[string, () => VoipProvider]> = [['MockProvider', mock], ['Twilio (mocked fetch)', twilio]];

describe.each(providers)('VoipProvider contract: %s', (_name, make) => {
  it('places a bridge call: the agent phone rings first, then the customer', async () => {
    respond = () => json({ sid: 'CAbridge000000000000000000000000001', status: 'queued', direction: 'outbound-api', from: AGENCY_NUMBER, to: '+447700900123' });
    const result = await make().placeCall({ mode: 'bridge', from: AGENCY_NUMBER, to: CUSTOMER, agentNumber: '+447700900123', callbackBaseUrl: 'https://api.example.test', record: true });
    expect(result.providerCallId).toMatch(/^CA/);
    expect(result).toMatchObject({ direction: 'outbound', from: AGENCY_NUMBER, to: CUSTOMER });
  });

  it('places a softphone call to the agent client identity', async () => {
    respond = () => json({ sid: 'CAsoft0000000000000000000000000009', status: 'queued', direction: 'outbound-api', from: AGENCY_NUMBER, to: 'client:x' });
    const result = await make().placeCall({ mode: 'softphone', from: AGENCY_NUMBER, to: CUSTOMER, agentIdentity: USER_ID, callbackBaseUrl: 'https://api.example.test', record: false });
    expect(result.providerCallId).toMatch(/^CA/);
  });

  it('refuses a call without the agent leg its mode needs, as a typed invalid_request', async () => {
    const bridge = make().placeCall({ mode: 'bridge', from: AGENCY_NUMBER, to: CUSTOMER, callbackBaseUrl: 'https://x.test', record: false });
    await expect(bridge).rejects.toBeInstanceOf(VoipProviderError);
    await expect(bridge).rejects.toMatchObject({ kind: 'invalid_request', code: 'AGENT_NUMBER_REQUIRED' });
    await expect(make().placeCall({ mode: 'softphone', from: AGENCY_NUMBER, to: CUSTOMER, callbackBaseUrl: 'https://x.test', record: false }))
      .rejects.toMatchObject({ kind: 'invalid_request', code: 'AGENT_IDENTITY_REQUIRED' });
  });

  it('creates a sub-account whose token comes back sealed, never in the clear', async () => {
    respond = () => json({ sid: 'ACsub00000000000000000000000000001', auth_token: 'plain-sub-token', friendly_name: 'x' });
    const sub = await make().createSubAccount({ tenantId: TENANT_ID, name: 'Sahyadri Holidays' });
    expect(sub.authId).toBe(sub.subAccountId);
    expect(sub.subAccountId).toMatch(/^AC/);
    expect(sub.authTokenEnc).toBe(`sealed(${subAccountSecretAad(TENANT_ID, sub.subAccountId)})`);
    expect(JSON.stringify(sub)).not.toContain('plain-sub-token');
    expect(sealed).toHaveLength(1);
    expect(sealed[0].aad).toBe(`voip_sub_account:${TENANT_ID}:${sub.subAccountId}`);
  });

  it('closes a sub-account', async () => {
    const provider = make();
    respond = () => json({ sid: 'ACsub00000000000000000000000000002', auth_token: 't' });
    const sub = await provider.createSubAccount({ tenantId: TENANT_ID, name: 'Closing Co' });
    respond = () => json({ sid: sub.subAccountId, status: 'closed' });
    await expect(provider.closeSubAccount(sub.subAccountId)).resolves.toBeUndefined();
  });

  it('gives a token and ring markup the same identity for one user, however the id is written', async () => {
    const provider = make();
    const token = await provider.generateClientToken(USER_ID);
    expect(provider.clientIdentity(USER_ID)).toBe(USER_IDENTITY);
    expect(token.identity).toBe(USER_IDENTITY);
    expect(voipClientIdentity(USER_ID)).toBe(USER_IDENTITY);
    // The legacy routing form and an already-formed identity map to the same thing.
    expect(voipClientIdentity(`user_${USER_ID}`)).toBe(USER_IDENTITY);
    expect(voipClientIdentity(USER_IDENTITY)).toBe(USER_IDENTITY);
    for (const written of [USER_ID, `user_${USER_ID}`, USER_IDENTITY]) {
      expect(provider.generateClientDialMarkup(written, AGENCY_NUMBER, false)).toContain(`<Client>${USER_IDENTITY}</Client>`);
    }
  });

  it('checks a webhook signature the way the provider signs it', async () => {
    const provider = make();
    const token = 'agency-token'; // the row's provider token, which both adapters verify with
    const url = 'https://api.example.test/api/v1/voip/status-callback';
    const fields = { CallSid: 'CA1', CallStatus: 'completed' };
    expect(await provider.validateWebhookSignature(url, fields, await twilioSignature(url, fields, token))).toBe(true);
    expect(await provider.validateWebhookSignature(url, fields, await twilioSignature(url, fields, 'someone-else'))).toBe(false);
    expect(await provider.validateWebhookSignature(url, { ...fields, CallStatus: 'busy' }, await twilioSignature(url, fields, token))).toBe(false);
  });
});

// ── Twilio request shapes ─────────────────────────────────────

describe('Twilio adapter request shapes', () => {
  it('bridge: Calls.json rings the agent phone with inline TwiML that dials the customer and records', async () => {
    respond = () => json({ sid: 'CAbridge000000000000000000000000001', status: 'queued', direction: 'outbound-api', from: AGENCY_NUMBER, to: '+447700900123' });
    const result = await twilio().placeCall({ mode: 'bridge', from: AGENCY_NUMBER, to: CUSTOMER, agentNumber: '+447700900123', callbackBaseUrl: 'https://api.example.test/', record: true });

    expect(captured).toHaveLength(1);
    const [req] = captured;
    expect(req.method).toBe('POST');
    // Authenticates as the agency's own account, not the platform's.
    expect(req.url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Calls.json');
    expect(req.headers.Authorization).toBe(basic('ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'agency-token'));
    expect(req.body.get('From')).toBe(AGENCY_NUMBER);
    expect(req.body.get('To')).toBe('+447700900123');
    expect(req.body.get('StatusCallback')).toBe('https://api.example.test/api/v1/voip/status-callback');
    const twiml = req.body.get('Twiml')!;
    expect(twiml).toContain(`<Dial callerId="${AGENCY_NUMBER}"`);
    expect(twiml).toContain(`<Number>${CUSTOMER}</Number>`);
    expect(twiml).toContain('record="record-from-answer-dual"');
    expect(twiml).toContain('recordingStatusCallback="https://api.example.test/api/v1/voip/recording-callback"');
    // The result describes the customer leg the caller cares about, not the agent leg.
    expect(result).toEqual({ providerCallId: 'CAbridge000000000000000000000000001', status: 'queued', direction: 'outbound', from: AGENCY_NUMBER, to: CUSTOMER });
  });

  it('softphone: the first leg is the agent client, named by the shared identity rule, with no recording when off', async () => {
    respond = () => json({ sid: 'CAsoft0000000000000000000000000001', status: 'queued', direction: 'outbound-api', from: AGENCY_NUMBER, to: `client:${USER_IDENTITY}` });
    await twilio().placeCall({ mode: 'softphone', from: AGENCY_NUMBER, to: CUSTOMER, agentIdentity: USER_ID, callbackBaseUrl: 'https://api.example.test', record: false });
    const [req] = captured;
    expect(req.body.get('To')).toBe(`client:${USER_IDENTITY}`);
    expect(req.body.get('Twiml')).not.toContain('record');
    expect(req.body.get('Twiml')).toContain(`<Number>${CUSTOMER}</Number>`);
  });

  it('initiateCall still dials the customer directly (existing routes keep working)', async () => {
    respond = () => json({ sid: 'CAdirect000000000000000000000000001', status: 'queued', direction: 'outbound-api', from: AGENCY_NUMBER, to: CUSTOMER });
    await twilio().initiateCall({ from: AGENCY_NUMBER, to: CUSTOMER, statusCallbackUrl: 'https://api.example.test/api/v1/voip/status-callback', record: false });
    expect(captured[0].body.get('To')).toBe(CUSTOMER);
    expect(captured[0].body.get('Url')).toBe('https://api.example.test/api/v1/voip/twiml/outbound');
  });

  it('createSubAccount: posts to the platform Accounts resource and seals the returned token with the tenant AAD', async () => {
    respond = () => json({ sid: 'ACnewsub000000000000000000000000001', auth_token: 'secret-from-twilio' });
    const sub = await twilio().createSubAccount({ tenantId: TENANT_ID, name: 'Sahyadri Holidays' });
    const [req] = captured;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('https://api.twilio.com/2010-04-01/Accounts.json');
    expect(req.body.get('FriendlyName')).toBe(`Sahyadri Holidays (${TENANT_ID.slice(-8)})`);
    expect(sub).toEqual({
      subAccountId: 'ACnewsub000000000000000000000000001',
      authId: 'ACnewsub000000000000000000000000001',
      authTokenEnc: `sealed(voip_sub_account:${TENANT_ID}:ACnewsub000000000000000000000000001)`,
    });
    expect(sealed[0].plain).toBe('secret-from-twilio');
  });

  it('createSubAccount refuses to run without a sealer rather than hand back a plaintext token', async () => {
    const provider = new TwilioVoipProvider({ TWILIO_ACCOUNT_SID: 'ACplatform', TWILIO_AUTH_TOKEN: 'platform-token' }, settings());
    await expect(provider.createSubAccount({ tenantId: TENANT_ID, name: 'x' })).rejects.toMatchObject({ code: 'NO_SEALER' });
    expect(captured).toHaveLength(0);
  });

  it('closeSubAccount: sets the sub-account status to closed', async () => {
    respond = () => json({ sid: 'ACold', status: 'closed' });
    await twilio().closeSubAccount('ACold00000000000000000000000000001');
    expect(captured[0].url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACold00000000000000000000000000001.json');
    expect(captured[0].body.get('Status')).toBe('closed');
  });

  it('a Twilio failure becomes a typed VoipProviderError with a kind', async () => {
    respond = () => json({ code: 20404, message: 'The requested resource was not found' }, 404);
    await expect(twilio().closeSubAccount('ACmissing')).rejects.toMatchObject({ provider: 'twilio', kind: 'not_found' });
    respond = () => json({ code: 21401, message: 'bad creds' }, 401);
    await expect(twilio().closeSubAccount('ACx')).rejects.toMatchObject({ kind: 'auth' });
  });

  it('the access token carries the shared identity as its grant', async () => {
    const token = await twilio().generateClientToken(USER_ID);
    expect(decodeJwt(token.token).grants.identity).toBe(USER_IDENTITY);
  });

  it('fetchUsage: lists the sub-account calls, follows paging and normalises direction, billing and cost', async () => {
    respond = (c) => (c.url.includes('Page=1') ? json(CALLS_PAGE_2) : json(CALLS_PAGE_1));
    const records = await twilio().fetchUsage({ subAccountId: 'ACsub', since: '2026-10-14T00:00:00Z' });

    expect(captured).toHaveLength(2);
    expect(captured[0].url).toContain('/2010-04-01/Accounts/ACsub/Calls.json?');
    expect(captured[0].url).toContain('StartTime%3E=2026-10-14');
    expect(captured[1].url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACsub/Calls.json?Page=1&PageSize=1000');
    // Reads with the platform credentials of this provider instance.
    expect(captured[0].headers.Authorization).toBe(basic('ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'agency-token'));

    expect(records).toEqual([
      { providerCallId: 'CAfixture0000000000000000000000001', direction: 'outbound', to: CUSTOMER, from: AGENCY_NUMBER, startedAt: '2026-10-15T10:00:00.000Z', durationSeconds: 61, billedSeconds: 120, cost: 0.014, currency: 'USD', leg: 'agent', parentCallId: null },
      { providerCallId: 'CAfixture0000000000000000000000002', direction: 'inbound', to: AGENCY_NUMBER, from: CUSTOMER, startedAt: '2026-10-15T11:30:00.000Z', durationSeconds: 0, billedSeconds: 0, cost: 0, currency: 'USD', leg: 'customer', parentCallId: null },
      { providerCallId: 'CAfixture0000000000000000000000003', direction: 'outbound', to: '+61291234567', from: AGENCY_NUMBER, startedAt: '2026-10-14T09:00:00.000Z', durationSeconds: 120, billedSeconds: 120, cost: 0.042, currency: 'USD', leg: 'dial', parentCallId: null },
      { providerCallId: 'CAfixture0000000000000000000000004', direction: 'outbound', to: CUSTOMER, from: AGENCY_NUMBER, startedAt: '2026-10-14T18:00:00.000Z', durationSeconds: 5, billedSeconds: 60, cost: 0.014, currency: 'GBP', leg: 'agent', parentCallId: null },
    ]);
  });

  it('fetchUsage drops calls that started before the requested time', async () => {
    respond = (c) => (c.url.includes('Page=1') ? json(CALLS_PAGE_2) : json(CALLS_PAGE_1));
    const records = await twilio().fetchUsage({ subAccountId: 'ACsub', since: '2026-10-15T00:00:00Z' });
    expect(records.map((r) => r.providerCallId)).toEqual(['CAfixture0000000000000000000000001', 'CAfixture0000000000000000000000002']);
  });

  it('fetchRecording downloads the mp3 from the owning sub-account', async () => {
    respond = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
    const file = await twilio().fetchRecording({ recordingId: 'RE001', subAccountId: 'ACsub' });
    expect(captured[0].url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACsub/Recordings/RE001.mp3');
    expect(Array.from(new Uint8Array(file.bytes))).toEqual([1, 2, 3]);
    expect(file.contentType).toBe('audio/mpeg');

    respond = () => new Response('', { status: 404 });
    await expect(twilio().fetchRecording({ recordingId: 'REnone' })).rejects.toMatchObject({ kind: 'not_found' });
  });
});

// ── Plivo: compiles against the contract, supports none of the new methods ──

describe('Plivo adapter', () => {
  it('throws NotImplementedForProvider for the reselling methods', async () => {
    const plivo = new PlivoVoipProvider({ accountId: 'MA1', authToken: 't' }, settings({ voipProvider: 'plivo' }));
    const calls: Array<() => Promise<unknown>> = [
      () => plivo.createSubAccount({ tenantId: TENANT_ID, name: 'x' }),
      () => plivo.closeSubAccount('x'),
      () => plivo.placeCall({ mode: 'bridge', from: AGENCY_NUMBER, to: CUSTOMER, agentNumber: CUSTOMER, callbackBaseUrl: 'https://x.test', record: false }),
      () => plivo.fetchUsage({ subAccountId: 'x', since: '2026-01-01T00:00:00Z' }),
      () => plivo.fetchRecording({ recordingId: 'x' }),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toBeInstanceOf(NotImplementedForProvider);
      await expect(call()).rejects.toMatchObject({ kind: 'not_implemented', code: 'NOT_IMPLEMENTED_FOR_PROVIDER' });
    }
    expect(plivo.clientIdentity(USER_ID)).toBe(USER_IDENTITY);
  });
});

// ── The mock provider ─────────────────────────────────────────

describe('MockProvider behaviour', () => {
  it('is deterministic: after a reset the same calls get the same ids', async () => {
    const run = async () => {
      MockVoipProvider.reset();
      const m = mock();
      const sub = await m.createSubAccount({ tenantId: TENANT_ID, name: 'A' });
      const call = await m.placeCall({ mode: 'bridge', from: AGENCY_NUMBER, to: CUSTOMER, agentNumber: '+447700900123', callbackBaseUrl: 'https://x.test', record: false });
      return [sub.subAccountId, call.providerCallId];
    };
    expect(await run()).toEqual(await run());
  });

  it('records the legs it was asked to place', async () => {
    const m = mock();
    await m.placeCall({ mode: 'softphone', from: AGENCY_NUMBER, to: CUSTOMER, agentIdentity: USER_ID, callbackBaseUrl: 'https://x.test', record: true });
    expect(MockVoipProvider.calls).toHaveLength(1);
    expect(MockVoipProvider.calls[0]).toMatchObject({ mode: 'softphone', agentLeg: `client:${USER_IDENTITY}`, to: CUSTOMER, record: true });
  });

  it('searches, buys and releases numbers; a number cannot be bought twice', async () => {
    const m = mock();
    const found = await m.searchAvailableNumbers('GB');
    expect(found).toHaveLength(5);
    expect(found.every((n) => n.phoneNumber.startsWith('+44'))).toBe(true);
    const bought = await m.purchaseNumber(found[0].phoneNumber, 'Main line');
    expect((await m.searchAvailableNumbers('GB')).map((n) => n.phoneNumber)).not.toContain(found[0].phoneNumber);
    await expect(m.purchaseNumber(found[0].phoneNumber)).rejects.toMatchObject({ kind: 'unavailable' });
    await m.releaseNumber(bought.providerNumberId);
    await expect(m.releaseNumber(bought.providerNumberId)).rejects.toMatchObject({ kind: 'not_found' });
    expect(await m.searchAvailableNumbers('IN')).toEqual([]);
  });

  it('reports usage for the completed calls of a sub-account and bills per started minute', async () => {
    const m = mock();
    const call = await m.placeCall({ mode: 'bridge', from: AGENCY_NUMBER, to: CUSTOMER, agentNumber: '+447700900123', callbackBaseUrl: 'https://x.test', record: false });
    MockVoipProvider.completeCall(call.providerCallId, 61, { subAccountId: 'ACmine', startedAt: '2026-10-15T10:00:00.000Z' });
    expect(await m.fetchUsage({ subAccountId: 'ACother', since: '2026-10-01T00:00:00Z' })).toEqual([]);
    const [record] = await m.fetchUsage({ subAccountId: 'ACmine', since: '2026-10-01T00:00:00Z' });
    expect(record).toMatchObject({ providerCallId: call.providerCallId, durationSeconds: 61, billedSeconds: 120, currency: 'USD', direction: 'outbound' });
    expect(await m.fetchUsage({ subAccountId: 'ACmine', since: '2026-10-16T00:00:00Z' })).toEqual([]);
  });

  it('serves recordings it was given and not found otherwise', async () => {
    const m = mock();
    MockVoipProvider.addRecording('RE9', new Uint8Array([9, 8]), 12);
    const file = await m.fetchRecording({ recordingId: 'RE9' });
    expect(Array.from(new Uint8Array(file.bytes))).toEqual([9, 8]);
    expect(file.durationSeconds).toBe(12);
    await expect(m.fetchRecording({ recordingId: 'REnone' })).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('never makes a network request', async () => {
    const m = mock();
    await m.createSubAccount({ tenantId: TENANT_ID, name: 'A' });
    await m.searchAvailableNumbers('US');
    await m.generateClientToken(USER_ID);
    await m.testConnection();
    expect(captured).toHaveLength(0);
  });

  it('is chosen by the factory for VOIP_PROVIDER=mock, and for no credentials in test mode, never in production', () => {
    const row = settings();
    expect(createVoipProvider({ ...testEnv, VOIP_PROVIDER: 'mock' }, row).providerName).toBe('mock');
    expect(createVoipProvider({ ...testEnv, TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' }, settings({ providerAccountId: null, providerAuthToken: null })).providerName).toBe('mock');
    // Credentials exist: Twilio, as before.
    expect(createVoipProvider(testEnv, row).providerName).toBe('twilio');
    // Production: never.
    expect(createVoipProvider({ ...testEnv, ENVIRONMENT: 'production', VOIP_PROVIDER: 'mock' }, row).providerName).toBe('twilio');
    expect(MOCK_AUTH_TOKEN).toBeTruthy();
  });
});

// ── Country allow-list ────────────────────────────────────────

describe('calling country allow-list', () => {
  it('defaults to GB, US, AU, SG and is configuration', () => {
    expect(callingAllowList({}).countries).toEqual(['GB', 'US', 'AU', 'SG']);
    expect(callingAllowList({ VOIP_CALLING_COUNTRIES: ' gb, de ,MY,, x1 ' }).countries).toEqual(['GB', 'DE', 'MY']);
    expect(callingAllowList({ VOIP_CALLING_COUNTRIES: 'junk' }).countries).toEqual(['GB', 'US', 'AU', 'SG']);
  });

  it('"*" opens every country outside production only', () => {
    expect(callingAllowList({ VOIP_CALLING_COUNTRIES: '*' }).all).toBe(true);
    expect(callingAllowList({ VOIP_CALLING_COUNTRIES: '*', ENVIRONMENT: 'production' })).toEqual({ all: false, countries: ['GB', 'US', 'AU', 'SG'] });
  });

  it('decides per country: India, the Gulf, Thailand, Sri Lanka, Nepal, Bangladesh out; an unset country is out', () => {
    const list = callingAllowList({});
    for (const country of ['GB', 'US', 'AU', 'SG', 'gb']) expect(callingAvailabilityFor(country, list).available).toBe(true);
    for (const country of ['IN', 'AE', 'SA', 'QA', 'TH', 'LK', 'NP', 'BD', 'DE', 'MY']) {
      expect(callingAvailabilityFor(country, list)).toMatchObject({ available: false, reason: 'country_not_supported' });
    }
    expect(callingAvailabilityFor('', list)).toMatchObject({ available: false, reason: 'country_not_set' });
    expect(callingAvailabilityFor('DE', callingAllowList({ VOIP_CALLING_COUNTRIES: 'GB,DE' })).available).toBe(true);
  });
});

// ── Through the API: gating, mock-provider calls and the simulator ──

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = testEnv): Promise<Response> {
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

async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}

async function setCountry(country: string | null): Promise<void> {
  if (country === null) await testEnv.MASTER_DB.prepare("DELETE FROM settings WHERE key IN ('country', 'company_country')").run();
  else await testEnv.MASTER_DB.prepare("INSERT INTO settings (key, value) VALUES ('country', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(country).run();
}

describe('country gating through the API', () => {
  let admin = '';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;
  });

  it('an Indian agency gets 403 CALLING_NOT_AVAILABLE_IN_COUNTRY from the call and VoIP endpoints', async () => {
    await setCountry('IN');
    for (const [method, path, body] of [
      ['POST', '/calls/outbound', { toNumber: CUSTOMER }],
      ['GET', '/calls', undefined],
      ['GET', '/voip/settings', undefined],
      ['POST', '/voip/token', undefined],
      ['GET', '/voip/numbers/search?country=IN', undefined],
    ] as const) {
      const res = await call(method, path, admin, body);
      expect(res.status, `${method} ${path}`).toBe(403);
      const payload = (await res.json()) as any;
      expect(payload.error.code).toBe('CALLING_NOT_AVAILABLE_IN_COUNTRY');
      expect(payload.error.details).toMatchObject({ code: 'CALLING_NOT_AVAILABLE_IN_COUNTRY', country: 'IN', reason: 'country_not_supported' });
    }
  });

  it('an agency that has not set a country is not offered calling either', async () => {
    await setCountry(null);
    const res = await call('GET', '/voip/settings', admin);
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error.details.reason).toBe('country_not_set');
  });

  it('a UK agency on a calling plan is not blocked by the country gate', async () => {
    await setCountry('GB');
    const settingsRes = await call('GET', '/voip/settings', admin);
    expect(settingsRes.status).toBe(200);
    // Not configured yet: the route's own answer, not a country refusal.
    const outbound = await call('POST', '/calls/outbound', admin, { toNumber: CUSTOMER });
    expect(outbound.status).toBe(422);
    expect(JSON.stringify(await outbound.json())).not.toContain('CALLING_NOT_AVAILABLE_IN_COUNTRY');
    expect((await call('GET', '/calls', admin)).status).toBe(200);
  });

  it('the allow-list is configuration: a second-wave country opens with the variable, no code change', async () => {
    await setCountry('DE');
    expect((await call('GET', '/voip/settings', admin)).status).toBe(403);
    expect((await call('GET', '/voip/settings', admin, undefined, { ...testEnv, VOIP_CALLING_COUNTRIES: 'GB,US,AU,SG,DE' })).status).toBe(200);
  });

  it('the desktop learns availability from /ai/settings: the voip_calling flag is off and voipCalling says why', async () => {
    const flag = async () => {
      const body = (await (await call('GET', '/ai/settings', admin)).json()) as any;
      return { feature: body.data.aiFeatures.find((f: any) => f.key === 'voip_calling'), voipCalling: body.data.voipCalling };
    };
    await setCountry('IN');
    const india = await flag();
    expect(india.feature.enabled).toBe(false);
    expect(india.voipCalling).toEqual({ available: false, country: 'IN', reason: 'country_not_supported' });
    const check = (await (await call('GET', '/ai/settings/features/check/voip_calling', admin)).json()) as any;
    expect(check.data.enabled).toBe(false);

    await setCountry('GB');
    const uk = await flag();
    expect(uk.feature.enabled).toBe(true);
    expect(uk.voipCalling).toEqual({ available: true, country: 'GB', reason: 'ok' });
  });

  it('provider webhooks are not gated by country (a call already in flight must still be recorded)', async () => {
    await setCountry('IN');
    const res = await call('POST', '/voip/status-callback', null, undefined);
    expect(res.status).not.toBe(403);
    await setCountry('GB');
  });
});

// ── Simulator: full flows with no provider ────────────────────

describe('call simulator', () => {
  const NUMBER = '+442030099301';
  const CALLER = '+447700900301';
  let admin = '';

  const send = async (request: Request): Promise<Response> => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(request, testEnv, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  };
  const play = (scenario: any, over: Record<string, unknown> = {}) =>
    simulateVoipScenario({ scenario, to: NUMBER, from: CALLER, baseUrl: 'http://localhost', authToken: testEnv.TWILIO_AUTH_TOKEN, send, ...over } as any);

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    await setCountry('GB');
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;
    await call('POST', '/test/voip/own-number', null, { tenantId: TENANT_ID, phoneNumber: NUMBER });
    await testEnv.MASTER_DB.prepare("INSERT OR IGNORE INTO voip_allowed_countries (tenant_id, country) VALUES (?, 'US')").bind(TENANT_ID).run(); // the customer here is a US number (R305 destination allow-list)
    expect((await call('POST', '/integrations/channels', admin, { channel: 'voice', address: NUMBER, provider: 'twilio', label: 'Sim line' })).status).toBe(201);
    await testEnv.MASTER_DB.prepare("INSERT INTO voip_settings (id, voip_provider, routing_strategy, default_caller_id) VALUES ('r301-sim', 'twilio', 'assigned', ?)").bind(NUMBER).run();
    expect((await call('POST', '/contacts', admin, { name: 'Simulated Caller', phone: CALLER, type: 'customer' })).status).toBe(201);
  });

  it('a missed inbound call creates the call-back task and notifies, the same as a real provider would', async () => {
    const result = await play('inbound_missed');
    expect(result.steps.map((s) => [s.path, s.fields.CallStatus])).toEqual([
      ['/twiml/inbound', 'ringing'],
      ['/status-callback', 'ringing'],
      ['/status-callback', 'no-answer'],
    ]);
    expect(result.steps.every((s) => s.status === 200)).toBe(true);

    const log = (await rows('SELECT direction, status, from_number, to_number FROM call_logs WHERE provider_call_id = ?', result.callSid))[0];
    expect(log).toEqual({ direction: 'inbound', status: 'no-answer', from_number: CALLER, to_number: NUMBER });
    expect(await rows("SELECT title, priority FROM tasks WHERE title = 'Call back Simulated Caller'")).toEqual([{ title: 'Call back Simulated Caller', priority: 'high' }]);
  });

  it('an answered inbound call ends completed with its duration', async () => {
    const result = await play('inbound_answered', { durationSeconds: 75 });
    expect(result.steps.map((s) => s.fields.CallStatus)).toEqual(['ringing', 'ringing', 'in-progress', 'completed']);
    expect((await rows('SELECT status, duration_seconds FROM call_logs WHERE provider_call_id = ?', result.callSid))[0]).toEqual({ status: 'completed', duration_seconds: 75 });
  });

  it('a voicemail scenario stores the recording on the call', async () => {
    const result = await play('inbound_voicemail', { durationSeconds: 18 });
    const log = (await rows('SELECT recording_url, recording_duration, status FROM call_logs WHERE provider_call_id = ?', result.callSid))[0];
    expect(log.recording_url).toMatch(/\/Recordings\/RE.*\.mp3$/);
    expect(log.recording_duration).toBe(18);
    expect(log.status).toBe('completed');
  });

  it('callbacks are really signed: a wrong token is refused by the callback routes', async () => {
    const result = await play('inbound_missed', { authToken: 'not-the-token' });
    expect(result.steps.every((s) => s.status === 403)).toBe(true);
  });

  it('outbound through the mock provider: the call endpoint places it, the simulator completes it through the callback routes', async () => {
    await testEnv.MASTER_DB
      .prepare("INSERT OR IGNORE INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source) VALUES ('0196a301-0000-7000-8000-0000000000c1', ?, 'call_minutes_100', 1, 100, ?, 'super_admin_grant')")
      .bind(TENANT_ID, new Date().toISOString().slice(0, 7)).run();
    MockVoipProvider.reset();

    // VOIP_PROVIDER=mock is how a local stack runs: the row still says twilio, so signed callbacks verify as usual.
    const placed = await call('POST', '/calls/outbound', admin, { toNumber: CUSTOMER }, { ...testEnv, VOIP_PROVIDER: 'mock' });
    expect(placed.status).toBe(201);
    const { callLogId, providerCallId } = ((await placed.json()) as any).data;
    expect(providerCallId).toMatch(/^CA[0-9a-f]{32}$/);
    expect(MockVoipProvider.calls.map((c) => c.providerCallId)).toContain(providerCallId);

    // Through the test route, as the e2e stack uses it.
    const res = await call('POST', '/test/voip/simulate', null, { scenario: 'outbound_answered', from: NUMBER, to: CUSTOMER, callSid: providerCallId, durationSeconds: 130 });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.steps.map((s: any) => s.status)).toEqual([200, 200, 200, 200]);
    expect((await rows('SELECT status, duration_seconds FROM call_logs WHERE id = ?', callLogId))[0]).toEqual({ status: 'completed', duration_seconds: 130 });
  });

  it('the test route rejects an unknown scenario and bad numbers, and does not exist outside test mode', async () => {
    expect((await call('POST', '/test/voip/simulate', null, { scenario: 'bogus', from: NUMBER, to: CUSTOMER })).status).toBe(400);
    expect((await call('POST', '/test/voip/simulate', null, { scenario: 'inbound_missed', from: '123', to: CUSTOMER })).status).toBe(400);
    expect((await call('POST', '/test/voip/simulate', null, { scenario: 'inbound_missed', from: NUMBER, to: CUSTOMER }, { ...testEnv, TEST_MODE: 'false' })).status).toBe(403);
  });
});

describe('sub-account secret AAD', () => {
  it('binds the sealed token to its tenant and sub-account', () => {
    expect(subAccountSecretAad('t1', 'AC1')).toBe('voip_sub_account:t1:AC1');
  });
});
