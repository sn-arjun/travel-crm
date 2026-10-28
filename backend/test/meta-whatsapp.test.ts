import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { MetaWhatsAppProvider, metaSignature, parseMetaWebhook, verifyMetaSignature } from '../src/services/messaging/meta-whatsapp';
import { effectiveProvider, metaCategoryForTemplate, recordWhatsAppCategory, templateParametersFor } from '../src/services/messaging/whatsapp-sender';
import { handleSmsJob } from '../src/queues/sms-queue';
import { processWhatsAppCampaign } from '../src/queues/whatsapp-campaign-queue';
import inboundFixture from './fixtures/meta/inbound-text.json';
import statusFixture from './fixtures/meta/status-delivered.json';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const OTHER_TENANT = 'meta-wa-other-tenant';
const PHONE_ID = '109876543210001';
const OTHER_PHONE_ID = '109876543210002';
const CUSTOMER_PHONE = '+919876543210';
// Test-only secrets: nothing outside this file knows them.
const AGENCY_APP_SECRET = 'test-only-agency-meta-app-secret-0001';
const PLATFORM_APP_SECRET = 'test-only-platform-meta-app-secret-0002';
const AGENCY_TOKEN = 'EAAG-test-only-agency-access-token-9f3a';
const PLATFORM_VERIFY = 'test-only-platform-verify-token';

async function api(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

/** POST a webhook body exactly as Meta would, signed with `secret` (or unsigned / badly signed). */
async function metaPost(payload: unknown, secret: string | null, signatureOverride?: string): Promise<Response> {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (signatureOverride !== undefined) headers['X-Hub-Signature-256'] = signatureOverride;
  else if (secret) headers['X-Hub-Signature-256'] = await metaSignature(raw, secret);
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request('http://localhost/api/v1/webhooks/inbound/meta/whatsapp', { method: 'POST', headers, body: raw }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function metaGet(query: string): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1/webhooks/inbound/meta/whatsapp?${query}`), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}

function clone<T>(value: T): any {
  return JSON.parse(JSON.stringify(value));
}

/** A fetch double: records calls, answers Graph-style JSON. */
function graphFetch(reply: (url: string, body: any) => { status?: number; json: unknown }) {
  const calls: Array<{ url: string; init: RequestInit; body: any }> = [];
  const fn = vi.fn(async (input: any, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, init: init ?? {}, body });
    const r = reply(url, body);
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  });
  return { fn, calls };
}

const accepted = (id: string) => ({ json: { messaging_product: 'whatsapp', contacts: [{ input: '919876543210', wa_id: '919876543210' }], messages: [{ id }] } });

describe('WhatsApp through Meta (R213)', () => {
  let admin = '';
  let contactId = '';
  let leadId = '';
  let verifyToken = '';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await api('POST', '/test/reset', null)).status).toBe(200);
    const login = await api('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;

    const contact = await api('POST', '/contacts', admin, { name: 'Meera Iyer', phone: CUSTOMER_PHONE, type: 'customer' });
    contactId = ((await contact.json()) as any).data.id;
    const lead = await api('POST', '/leads', admin, { contactId, title: 'Kerala 5 nights', destinations: ['Kerala'], travelDate: '2026-12-20', tripType: 'family', source: 'manual' });
    leadId = ((await lead.json()) as any).data.id;

    testEnv.WHATSAPP_META_VERIFY_TOKEN = PLATFORM_VERIFY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    delete testEnv.WHATSAPP_META_VERIFY_TOKEN;
    delete testEnv.WHATSAPP_META_APP_SECRET;
    delete testEnv.WHATSAPP_META_TOKEN;
    delete testEnv.WHATSAPP_META_PHONE_NUMBER_ID;
    await api('DELETE', '/integrations/whatsapp/meta', admin);
    await testEnv.MASTER_DB.prepare("DELETE FROM settings WHERE key = 'whatsapp_provider'").run();
    await testEnv.MASTER_DB.prepare("DELETE FROM tenant_channel_addresses WHERE channel IN ('meta_whatsapp', 'meta_verify')").run();
    await testEnv.MASTER_DB.prepare("DELETE FROM tenants WHERE id = ?").bind(OTHER_TENANT).run();
  });

  // ---------------------------------------------------------------- connection

  describe('agency connection', () => {
    it('saves the agency number with the token and app secret sealed, and never returns them', async () => {
      const res = await api('PUT', '/integrations/whatsapp/meta', admin, {
        phoneNumberId: PHONE_ID,
        wabaId: '5550001',
        displayPhone: '+1 555 123 0001',
        accessToken: AGENCY_TOKEN,
        appSecret: AGENCY_APP_SECRET,
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain(AGENCY_TOKEN);
      expect(text).not.toContain(AGENCY_APP_SECRET);
      const view = (JSON.parse(text) as any).data;
      expect(view.account).toMatchObject({ phoneNumberId: PHONE_ID, tokenConfigured: true, tokenLast4: AGENCY_TOKEN.slice(-4), appSecretConfigured: true });
      expect(view.webhookUrl).toMatch(/\/api\/v1\/webhooks\/inbound\/meta\/whatsapp$/);
      expect(view.verifyToken).toMatch(/^mv_/);
      verifyToken = view.verifyToken;

      const [stored] = await rows('SELECT access_token_enc, app_secret_enc FROM whatsapp_meta_accounts');
      expect(stored.access_token_enc).toMatch(/^enc:v1:/);
      expect(stored.app_secret_enc).toMatch(/^enc:v1:/);
      expect(JSON.stringify(stored)).not.toContain(AGENCY_TOKEN);

      // The numbers this workspace receives on do not list the internal routing rows.
      const channels = (await (await api('GET', '/integrations/channels', admin)).json()) as any;
      expect(channels.data.some((ch: any) => String(ch.channel).startsWith('meta_'))).toBe(false);
    });

    it('refuses a number another workspace already owns, without saying which', async () => {
      await testEnv.MASTER_DB.prepare("INSERT OR IGNORE INTO tenants (id, company_name, subdomain) VALUES (?, 'Other Agency', 'meta-wa-other')").bind(OTHER_TENANT).run();
      await testEnv.MASTER_DB
        .prepare("INSERT OR REPLACE INTO tenant_channel_addresses (id, tenant_id, channel, address, provider) VALUES ('meta-wa-other-row', ?, 'meta_whatsapp', ?, 'meta')")
        .bind(OTHER_TENANT, OTHER_PHONE_ID)
        .run();
      const res = await api('PUT', '/integrations/whatsapp/meta', admin, { phoneNumberId: OTHER_PHONE_ID, accessToken: AGENCY_TOKEN });
      expect(res.status).toBe(409);
      expect(JSON.stringify(await res.json())).not.toContain(OTHER_TENANT);
    });

    it('"Test connection" is an authenticated read at Meta (mocked) and reports a rejected token', async () => {
      const ok = graphFetch(() => ({ json: { display_phone_number: '+1 555 123 0001', verified_name: 'Test Travels' } }));
      vi.stubGlobal('fetch', ok.fn);
      const good = (await (await api('POST', '/integrations/whatsapp/meta/test', admin)).json()) as any;
      expect(good.data).toMatchObject({ ok: true });
      expect(ok.calls[0].url).toContain(`graph.facebook.com/`);
      expect(ok.calls[0].url).toContain(`/${PHONE_ID}?fields=`);
      expect((ok.calls[0].init.headers as any).Authorization).toBe(`Bearer ${AGENCY_TOKEN}`);

      const bad = graphFetch(() => ({ status: 401, json: { error: { code: 190, message: 'Invalid OAuth access token' } } }));
      vi.stubGlobal('fetch', bad.fn);
      const rejected = (await (await api('POST', '/integrations/whatsapp/meta/test', admin)).json()) as any;
      expect(rejected.data).toEqual({ ok: false, message: 'Meta rejected this access token' });
    });

    it('selects the provider per agency: Twilio when nothing is set up, Meta once chosen', async () => {
      const db = testEnv.MASTER_DB as D1Database;
      await db.prepare("DELETE FROM settings WHERE key = 'whatsapp_provider'").run();
      // No platform token: an agency account alone does not switch it over.
      expect(await effectiveProvider(testEnv, db)).toEqual({ choice: 'twilio', explicit: false });
      // Platform token + the agency's number: Meta is the default for an agency that never chose.
      expect(await effectiveProvider({ ...testEnv, WHATSAPP_META_TOKEN: 'platform-token' }, db)).toEqual({ choice: 'meta', explicit: false });

      const chosen = await api('PUT', '/integrations/whatsapp/provider', admin, { provider: 'meta' });
      expect(chosen.status).toBe(200);
      expect(((await chosen.json()) as any).data).toMatchObject({ provider: 'meta', providerExplicit: true });
      // An explicit choice beats the default.
      await api('PUT', '/integrations/whatsapp/provider', admin, { provider: 'twilio' });
      expect(await effectiveProvider({ ...testEnv, WHATSAPP_META_TOKEN: 'platform-token' }, db)).toEqual({ choice: 'twilio', explicit: true });
      await api('PUT', '/integrations/whatsapp/provider', admin, { provider: 'meta' });
    });
  });

  // ---------------------------------------------------------------- webhook: verification

  describe('webhook verification handshake', () => {
    it('echoes hub.challenge for the platform verify token and for an agency verify token', async () => {
      const platform = await metaGet(`hub.mode=subscribe&hub.verify_token=${PLATFORM_VERIFY}&hub.challenge=1158201444`);
      expect(platform.status).toBe(200);
      expect(await platform.text()).toBe('1158201444');

      const agency = await metaGet(`hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=abc123`);
      expect(agency.status).toBe(200);
      expect(await agency.text()).toBe('abc123');
    });

    it('refuses a wrong token, a wrong mode and a missing challenge', async () => {
      expect((await metaGet('hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1')).status).toBe(403);
      expect((await metaGet(`hub.mode=unsubscribe&hub.verify_token=${PLATFORM_VERIFY}&hub.challenge=1`)).status).toBe(403);
      expect((await metaGet(`hub.mode=subscribe&hub.verify_token=${PLATFORM_VERIFY}`)).status).toBe(403);
    });
  });

  // ---------------------------------------------------------------- webhook: inbound

  describe('inbound messages', () => {
    it('a correctly signed text creates an inbound message on the contact and its open lead, like the Twilio path', async () => {
      const res = await metaPost(inboundFixture, AGENCY_APP_SECRET);
      expect(res.status).toBe(200);
      expect(((await res.json()) as any).messages).toBe(1);

      const [msg] = await rows(`SELECT * FROM message_log WHERE external_id = 'wamid.INBOUND.FIXTURE.1'`);
      expect(msg).toMatchObject({ direction: 'incoming', channel: 'whatsapp', contact_id: contactId, lead_id: leadId, status: 'delivered', from_address: CUSTOMER_PHONE });
      expect(msg.content).toBe('Hi, can you quote a 5 night Kerala trip for 4 adults?');
      expect(JSON.parse(msg.metadata)).toMatchObject({ provider: 'meta', phone_number_id: PHONE_ID, from_name: 'Meera Iyer' });
      const activities = await rows(`SELECT content FROM lead_activities WHERE lead_id = ? AND type = 'whatsapp'`, leadId);
      expect(activities.some((a) => String(a.content).includes('Received WhatsApp message'))).toBe(true);
    });

    it('a redelivery of the same message id stores nothing a second time', async () => {
      const res = await metaPost(inboundFixture, AGENCY_APP_SECRET);
      expect(res.status).toBe(200);
      expect(((await res.json()) as any).messages).toBe(0);
      expect(await rows(`SELECT id FROM message_log WHERE external_id = 'wamid.INBOUND.FIXTURE.1'`)).toHaveLength(1);
    });

    it('a bad, missing or malformed signature is 401 and stores nothing', async () => {
      const fresh = clone(inboundFixture);
      fresh.entry[0].changes[0].value.messages[0].id = 'wamid.FORGED.1';
      expect((await metaPost(fresh, 'not-the-secret-at-all-xxxxxxxx')).status).toBe(401);
      expect((await metaPost(fresh, null)).status).toBe(401);
      expect((await metaPost(fresh, null, 'sha256=deadbeef')).status).toBe(401);
      expect((await metaPost(fresh, null, 'garbage')).status).toBe(401);
      // The body must be the exact signed bytes: a signature over another body does not carry over.
      const raw = JSON.stringify(fresh);
      expect((await metaPost(raw, null, await metaSignature(raw + ' ', AGENCY_APP_SECRET))).status).toBe(401);
      expect(await rows(`SELECT id FROM message_log WHERE external_id = 'wamid.FORGED.1'`)).toHaveLength(0);
    });

    it('the platform app secret signs any agency number; an unknown number is acknowledged and ignored', async () => {
      testEnv.WHATSAPP_META_APP_SECRET = PLATFORM_APP_SECRET;
      const unknown = clone(inboundFixture);
      unknown.entry[0].changes[0].value.metadata.phone_number_id = '999000111222';
      unknown.entry[0].changes[0].value.messages[0].id = 'wamid.UNKNOWN.NUMBER.1';
      const res = await metaPost(unknown, PLATFORM_APP_SECRET);
      expect(res.status).toBe(200);
      expect(await rows(`SELECT id FROM message_log WHERE external_id = 'wamid.UNKNOWN.NUMBER.1'`)).toHaveLength(0);
      const log = await rows(`SELECT status, error_message FROM webhook_log WHERE source = 'meta:whatsapp' AND status = 'unrouted' ORDER BY created_at DESC LIMIT 1`);
      expect(log[0].error_message).toContain('999000111222');

      const known = clone(inboundFixture);
      known.entry[0].changes[0].value.messages[0].id = 'wamid.PLATFORM.SIGNED.1';
      expect(((await (await metaPost(known, PLATFORM_APP_SECRET)).json()) as any).messages).toBe(1);
      delete testEnv.WHATSAPP_META_APP_SECRET;
    });

    it("an agency's own app secret cannot be used to deliver into another agency's number", async () => {
      const forged = clone(inboundFixture);
      const value = forged.entry[0].changes[0].value;
      // Same delivery names the agency's own number (so its secret is picked) and another agency's number.
      const second = clone(forged.entry[0]);
      second.changes[0].value.metadata.phone_number_id = OTHER_PHONE_ID;
      second.changes[0].value.messages[0].id = 'wamid.CROSS.TENANT.1';
      value.messages[0].id = 'wamid.CROSS.OWN.1';
      forged.entry.push(second);

      const res = await metaPost(forged, AGENCY_APP_SECRET);
      expect(res.status).toBe(200);
      expect(await rows(`SELECT id FROM message_log WHERE external_id = 'wamid.CROSS.OWN.1'`)).toHaveLength(1);
      expect(await rows(`SELECT id FROM message_log WHERE external_id = 'wamid.CROSS.TENANT.1'`)).toHaveLength(0);
    });

    it('media messages keep the caption and the media id', () => {
      const events = parseMetaWebhook({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: PHONE_ID }, messages: [{ from: '91', id: 'w1', type: 'image', image: { id: 'MEDIA1', mime_type: 'image/jpeg', caption: 'Passport' } }] } }] }],
      });
      expect(events[0]).toMatchObject({ kind: 'message', body: 'Passport', mediaId: 'MEDIA1', mimeType: 'image/jpeg' });
    });
  });

  // ---------------------------------------------------------------- webhook: statuses

  describe('delivery statuses', () => {
    const STATUS_KEY = { provider: 'meta_whatsapp', id: 'wamid.OUTBOUND.FIXTURE.1' };
    let outboundId = '';

    beforeAll(async () => {
      outboundId = 'meta-out-1';
      await testEnv.MASTER_DB
        .prepare(`INSERT INTO message_log (id, contact_id, channel, content, direction, status, external_id, sent_at) VALUES (?, ?, 'whatsapp', 'Your plan is ready', 'outgoing', 'sent', ?, '2026-10-15T10:00:00Z')`)
        .bind(outboundId, contactId, STATUS_KEY.id)
        .run();
    });

    const outbound = async () => (await rows('SELECT status, delivered_at, read_at, error_message FROM message_log WHERE id = ?', outboundId))[0];
    const statusPayload = (status: string, extra: Record<string, unknown> = {}) => {
      const p = clone(statusFixture);
      Object.assign(p.entry[0].changes[0].value.statuses[0], { status, ...extra });
      return p;
    };

    it('delivered updates the message', async () => {
      const res = await metaPost(statusFixture, AGENCY_APP_SECRET);
      expect(res.status).toBe(200);
      expect(((await res.json()) as any).statuses).toBe(1);
      expect(await outbound()).toMatchObject({ status: 'delivered', delivered_at: '2025-10-09T08:55:00.000Z' });
    });

    it('the same status delivered again changes nothing and is claimed exactly once', async () => {
      const before = await outbound();
      const res = await metaPost(statusFixture, AGENCY_APP_SECRET);
      expect(((await res.json()) as any).statuses).toBe(0);
      expect(await outbound()).toEqual(before);
      const claims = await rows(`SELECT * FROM provider_events WHERE provider = ? AND provider_call_id = ? AND event = 'delivered'`, STATUS_KEY.provider, STATUS_KEY.id);
      expect(claims).toHaveLength(1);
    });

    it('read follows delivered, and a late "sent" never moves the status backwards', async () => {
      await metaPost(statusPayload('read', { timestamp: '1760000200' }), AGENCY_APP_SECRET);
      expect(await outbound()).toMatchObject({ status: 'read' });
      expect((await outbound()).read_at).toBeTruthy();
      await metaPost(statusPayload('sent', { timestamp: '1760000050' }), AGENCY_APP_SECRET);
      expect((await outbound()).status).toBe('read');
    });

    it('failed on a message that never delivered records the error; a status for an unknown message is ignored', async () => {
      await testEnv.MASTER_DB
        .prepare(`INSERT INTO message_log (id, contact_id, channel, content, direction, status, external_id) VALUES ('meta-out-2', ?, 'whatsapp', 'x', 'outgoing', 'sent', 'wamid.OUTBOUND.FAIL.1')`)
        .bind(contactId)
        .run();
      const failed = statusPayload('failed', { id: 'wamid.OUTBOUND.FAIL.1', errors: [{ code: 131026, title: 'Message undeliverable', error_data: { details: 'Recipient is not a WhatsApp user' } }] });
      await metaPost(failed, AGENCY_APP_SECRET);
      const [row] = await rows(`SELECT status, error_message FROM message_log WHERE id = 'meta-out-2'`);
      expect(row.status).toBe('failed');
      expect(row.error_message).toContain('131026');

      const unknown = statusPayload('delivered', { id: 'wamid.NOT.OURS' });
      const res = await metaPost(unknown, AGENCY_APP_SECRET);
      expect(res.status).toBe(200);
      expect(await rows(`SELECT 1 FROM provider_events WHERE provider_call_id = 'wamid.NOT.OURS'`)).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------- provider: request shapes

  describe('MetaWhatsAppProvider requests (mocked Graph)', () => {
    const creds = { accessToken: 'tok', phoneNumberId: PHONE_ID, graphVersion: 'v21.0' };

    it('sends text to the phone number id endpoint with a bearer token and digits-only recipient', async () => {
      const g = graphFetch(() => accepted('wamid.T1'));
      const provider = new MetaWhatsAppProvider(creds, g.fn as any);
      const res = await provider.sendWhatsApp('+91 98765-43210', 'Hello there');
      expect(res).toMatchObject({ providerMessageId: 'wamid.T1', status: 'sent', channel: 'whatsapp', category: 'service' });
      expect(g.calls[0].url).toBe(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`);
      expect((g.calls[0].init.headers as any).Authorization).toBe('Bearer tok');
      expect(g.calls[0].body).toEqual({ messaging_product: 'whatsapp', recipient_type: 'individual', to: '919876543210', type: 'text', text: { body: 'Hello there', preview_url: false } });
    });

    it('sends media by URL with the message as caption, and a document with its filename', async () => {
      const g = graphFetch(() => accepted('wamid.M1'));
      const provider = new MetaWhatsAppProvider(creds, g.fn as any);
      await provider.sendWhatsApp('+919876543210', 'Your itinerary', 'https://files.example.com/a/trip%20plan.pdf?sig=1');
      expect(g.calls[0].body).toMatchObject({ type: 'document', document: { link: 'https://files.example.com/a/trip%20plan.pdf?sig=1', caption: 'Your itinerary', filename: 'trip plan.pdf' } });
      await provider.sendWhatsApp('+919876543210', 'Beach', 'https://files.example.com/beach.jpg');
      expect(g.calls[1].body).toMatchObject({ type: 'image', image: { link: 'https://files.example.com/beach.jpg', caption: 'Beach' } });
    });

    it('sends a template with name, language and ordered body parameters, and carries the category in the result', async () => {
      const g = graphFetch(() => accepted('wamid.TPL1'));
      const provider = new MetaWhatsAppProvider(creds, g.fn as any);
      const res = await provider.sendWhatsAppTemplate('+919876543210', 'booking_confirmation', { '2': 'Kerala', '1': 'Meera' }, { language: 'en_GB', category: 'utility' });
      expect(res).toMatchObject({ providerMessageId: 'wamid.TPL1', status: 'sent', category: 'utility' });
      expect(g.calls[0].body).toEqual({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '919876543210',
        type: 'template',
        template: {
          name: 'booking_confirmation',
          language: { code: 'en_GB' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: 'Meera' }, { type: 'text', text: 'Kerala' }] }],
        },
      });
    });

    it('maps Meta refusals: outside the window, bad token, rate limit; and a network failure never throws', async () => {
      const kinds: Array<[number, number, string]> = [[400, 131047, 'window'], [401, 190, 'auth'], [429, 130429, 'rate_limited'], [400, 131026, 'invalid_request']];
      for (const [status, code, kind] of kinds) {
        const g = graphFetch(() => ({ status, json: { error: { code, message: 'refused' } } }));
        const res = await new MetaWhatsAppProvider(creds, g.fn as any).sendWhatsApp('+919876543210', 'x');
        expect(res).toMatchObject({ status: 'failed', errorKind: kind, error: 'refused' });
      }
      const down = new MetaWhatsAppProvider(creds, (async () => { throw new Error('offline'); }) as any);
      expect(await down.sendWhatsApp('+919876543210', 'x')).toMatchObject({ status: 'failed', errorKind: 'provider' });
    });

    it('verifies X-Hub-Signature-256 as HMAC-SHA256 of the raw body', async () => {
      // A published reference vector: HMAC-SHA256("key", "The quick brown fox jumps over the lazy dog").
      expect(await metaSignature('The quick brown fox jumps over the lazy dog', 'key')).toBe('sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
      const body = '{"a":1}';
      const sig = await metaSignature(body, 's3cret-s3cret-s3cret');
      expect(await verifyMetaSignature(body, sig, 's3cret-s3cret-s3cret')).toBe(true);
      expect(await verifyMetaSignature(body, sig.toUpperCase().replace('SHA256=', 'sha256='), 's3cret-s3cret-s3cret')).toBe(true);
      expect(await verifyMetaSignature(body, sig, 'other-secret-other-secret')).toBe(false);
      expect(await verifyMetaSignature(body, null, 's3cret-s3cret-s3cret')).toBe(false);
      expect(await verifyMetaSignature(body, sig, '')).toBe(false);
    });
  });

  // ---------------------------------------------------------------- outbound through the queue: window + metering

  describe('outbound through the queue', () => {
    const baseJob = () => ({ to: CUSTOMER_PHONE, channel: 'whatsapp' as const, tenantId: TENANT_ID, contactId, metered: true });
    async function queued(content: string): Promise<string> {
      const id = `meta-q-${Math.random().toString(36).slice(2, 10)}`;
      await testEnv.MASTER_DB.prepare(`INSERT INTO message_log (id, contact_id, channel, content, direction, status) VALUES (?, ?, 'whatsapp', ?, 'outgoing', 'queued')`).bind(id, contactId, content).run();
      return id;
    }
    const logRow = async (id: string) => (await rows('SELECT status, external_id, error_message FROM message_log WHERE id = ?', id))[0];
    const ledger = async () => rows(`SELECT event_key, channel, units FROM metered_events WHERE channel LIKE 'whatsapp_%' ORDER BY event_key`);

    it('an agency on Meta sends through Graph, not Twilio; in the window free-form text goes and is not billed as a category', async () => {
      // The inbound fixture message above opened the 24 hour window: stamp it as just now.
      await testEnv.MASTER_DB.prepare(`UPDATE message_log SET created_at = ? WHERE external_id = 'wamid.INBOUND.FIXTURE.1'`).bind(new Date().toISOString()).run();
      const g = graphFetch(() => accepted('wamid.Q.TEXT.1'));
      vi.stubGlobal('fetch', g.fn);
      const id = await queued('Quote attached');
      await handleSmsJob({ ...baseJob(), body: 'Quote attached', messageLogId: id }, testEnv);
      expect(g.calls).toHaveLength(1);
      expect(g.calls[0].url).toContain('graph.facebook.com');
      expect((g.calls[0].init.headers as any).Authorization).toBe(`Bearer ${AGENCY_TOKEN}`);
      expect(g.calls[0].body).toMatchObject({ type: 'text', to: '919876543210' });
      expect(await logRow(id)).toMatchObject({ status: 'sent', external_id: 'wamid.Q.TEXT.1' });
      expect((await ledger()).filter((r) => r.event_key === 'wa:wamid.Q.TEXT.1')).toHaveLength(0);
    });

    it('outside the 24 hour window free-form text is not sent: the log says to use a template', async () => {
      await testEnv.MASTER_DB.prepare(`UPDATE message_log SET created_at = '2026-01-01T00:00:00Z' WHERE external_id = 'wamid.INBOUND.FIXTURE.1' OR (contact_id = ? AND direction = 'incoming')`).bind(contactId).run();
      const g = graphFetch(() => accepted('wamid.SHOULD.NOT.SEND'));
      vi.stubGlobal('fetch', g.fn);
      const id = await queued('Late reply');
      await handleSmsJob({ ...baseJob(), body: 'Late reply', messageLogId: id }, testEnv);
      expect(g.calls).toHaveLength(0);
      const row = await logRow(id);
      expect(row.status).toBe('failed');
      expect(row.error_message).toContain('outside_24h_window');
    });

    it('a utility template goes outside the window and is recorded as whatsapp_utility', async () => {
      const g = graphFetch(() => accepted('wamid.Q.UTILITY.1'));
      vi.stubGlobal('fetch', g.fn);
      const id = await queued('Booking confirmed');
      await handleSmsJob({ ...baseJob(), messageLogId: id, whatsappTemplate: { name: 'booking_confirmed', language: 'en', category: 'utility', parameters: ['Meera', 'Kerala'] } }, testEnv);
      expect(g.calls[0].body.template).toMatchObject({ name: 'booking_confirmed', language: { code: 'en' } });
      expect(g.calls[0].body.template.components[0].parameters).toEqual([{ type: 'text', text: 'Meera' }, { type: 'text', text: 'Kerala' }]);
      expect(await logRow(id)).toMatchObject({ status: 'sent', external_id: 'wamid.Q.UTILITY.1' });
      expect(await rows(`SELECT channel, units FROM metered_events WHERE event_key = 'wa:wamid.Q.UTILITY.1'`)).toEqual([{ channel: 'whatsapp_utility', units: 1 }]);
    });

    it('a marketing template is recorded as whatsapp_marketing; recording is idempotent per message id', async () => {
      const g = graphFetch(() => accepted('wamid.Q.MARKETING.1'));
      vi.stubGlobal('fetch', g.fn);
      const id = await queued('Diwali offer');
      await handleSmsJob({ ...baseJob(), messageLogId: id, whatsappTemplate: { name: 'diwali_offer', language: 'en', category: 'marketing', parameters: ['Meera'] } }, testEnv);
      expect(await rows(`SELECT channel, units FROM metered_events WHERE event_key = 'wa:wamid.Q.MARKETING.1'`)).toEqual([{ channel: 'whatsapp_marketing', units: 1 }]);
      expect(await recordWhatsAppCategory(testEnv, TENANT_ID, 'marketing', 'wamid.Q.MARKETING.1')).toBe(false);
      expect(await recordWhatsAppCategory(testEnv, TENANT_ID, 'service', 'wamid.SERVICE.1')).toBe(false);
    });

    it('a Meta refusal marks the message failed with the reason and records no category', async () => {
      const g = graphFetch(() => ({ status: 400, json: { error: { code: 131026, message: 'Message undeliverable' } } }));
      vi.stubGlobal('fetch', g.fn);
      const id = await queued('Bad number');
      await handleSmsJob({ ...baseJob(), messageLogId: id, whatsappTemplate: { name: 'booking_confirmed', language: 'en', category: 'utility', parameters: [] } }, testEnv);
      expect(await logRow(id)).toMatchObject({ status: 'failed', error_message: 'Message undeliverable' });
      expect((await ledger()).length).toBe(2);
    });

    it('maps CRM template categories to Meta: utility wherever it qualifies', () => {
      expect(metaCategoryForTemplate('booking')).toBe('utility');
      expect(metaCategoryForTemplate('reminder')).toBe('utility');
      expect(metaCategoryForTemplate(null)).toBe('utility');
      expect(metaCategoryForTemplate('offer')).toBe('marketing');
      expect(metaCategoryForTemplate('wish')).toBe('marketing');
      expect(templateParametersFor('Hi {first_name}, {destination} on {travel_date}. Bye {first_name}', { first_name: 'Meera', destination: 'Kerala', travel_date: null })).toEqual(['Meera', 'Kerala', '']);
    });
  });

  // ---------------------------------------------------------------- campaigns

  describe('marketing campaigns on Meta', () => {
    it('sends the approved template per recipient with the unsubscribe link, records marketing, stores the message id and skips opted-out contacts', async () => {
      const db = testEnv.MASTER_DB as D1Database;
      const optedOut = (await (await api('POST', '/contacts', admin, { name: 'Opted Out', phone: '+919876500002', type: 'customer' })).json()) as any;
      await db.prepare(`DELETE FROM whatsapp_campaign_recipients WHERE campaign_id = 'meta-camp-1'`).run();
      await db.prepare(`DELETE FROM whatsapp_campaigns WHERE id = 'meta-camp-1'`).run();
      await db
        .prepare(`INSERT INTO whatsapp_campaigns (id, name, status, template_name, template_content, total_recipients) VALUES ('meta-camp-1', 'Diwali', 'sending', 'diwali_offer', 'Hi {{name}}, our Diwali deals. Stop: {{unsubscribe_url}}', 2)`)
        .run();
      await db.prepare(`INSERT INTO whatsapp_campaign_recipients (id, campaign_id, contact_id, phone, name) VALUES ('meta-rcp-1', 'meta-camp-1', ?, ?, 'Meera')`).bind(contactId, CUSTOMER_PHONE).run();
      await db.prepare(`INSERT INTO whatsapp_campaign_recipients (id, campaign_id, contact_id, phone, name) VALUES ('meta-rcp-2', 'meta-camp-1', ?, '+919876500002', 'Opted Out')`).bind(optedOut.data.id).run();
      await db.prepare('UPDATE contacts SET opted_out = 1 WHERE id = ?').bind(optedOut.data.id).run();

      const g = graphFetch(() => accepted('wamid.CAMP.1'));
      vi.stubGlobal('fetch', g.fn);
      await processWhatsAppCampaign({ type: 'whatsapp_campaign', campaignId: 'meta-camp-1', tenantId: TENANT_ID }, testEnv);

      const sent = g.calls.filter((c) => c.body?.type === 'template');
      const first = sent[0].body;
      expect(first.template.name).toBe('diwali_offer');
      const params = first.template.components[0].parameters.map((p: any) => p.text);
      expect(params[0]).toBe('Meera');
      expect(params[1]).toMatch(/unsubscribe/i);

      const [rcp] = await rows(`SELECT status, provider_message_id FROM whatsapp_campaign_recipients WHERE id = 'meta-rcp-1'`);
      expect(rcp).toEqual({ status: 'sent', provider_message_id: 'wamid.CAMP.1' });
      expect(sent).toHaveLength(1);
      expect((await rows(`SELECT status FROM whatsapp_campaign_recipients WHERE id = 'meta-rcp-2'`))[0].status).toBe('opted_out');
      expect(await rows(`SELECT channel FROM metered_events WHERE event_key = 'wa:wamid.CAMP.1'`)).toEqual([{ channel: 'whatsapp_marketing' }]);
    }, 30_000);

    it('a delivered status for a campaign message updates its recipient and the campaign counters', async () => {
      const payload = clone(statusFixture);
      payload.entry[0].changes[0].value.statuses[0].id = 'wamid.CAMP.1';
      await metaPost(payload, AGENCY_APP_SECRET);
      expect((await rows(`SELECT status FROM whatsapp_campaign_recipients WHERE id = 'meta-rcp-1'`))[0].status).toBe('delivered');
      expect((await rows(`SELECT delivered_count FROM whatsapp_campaigns WHERE id = 'meta-camp-1'`))[0].delivered_count).toBe(1);
    });

    it('a template without {{unsubscribe_url}} is not sent on Meta (every marketing message must carry the link)', async () => {
      const db = testEnv.MASTER_DB as D1Database;
      await db.prepare(`INSERT INTO whatsapp_campaigns (id, name, status, template_name, template_content, total_recipients) VALUES ('meta-camp-2', 'No link', 'sending', 'plain_offer', 'Hi {{name}}', 1)`).run();
      await db.prepare(`INSERT INTO whatsapp_campaign_recipients (id, campaign_id, contact_id, phone, name) VALUES ('meta-rcp-3', 'meta-camp-2', ?, ?, 'Meera')`).bind(contactId, CUSTOMER_PHONE).run();
      const g = graphFetch(() => accepted('wamid.SHOULD.NOT.SEND.2'));
      vi.stubGlobal('fetch', g.fn);
      await processWhatsAppCampaign({ type: 'whatsapp_campaign', campaignId: 'meta-camp-2', tenantId: TENANT_ID }, testEnv);
      expect(g.calls).toHaveLength(0);
      const [rcp] = await rows(`SELECT status, error_message FROM whatsapp_campaign_recipients WHERE id = 'meta-rcp-3'`);
      expect(rcp.status).toBe('failed');
      expect(rcp.error_message).toContain('unsubscribe_url');
    }, 30_000);
  });
});
