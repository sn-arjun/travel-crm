import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;
const realLimits = { ...testEnv, RATE_LIMIT_MULTIPLIER: '1' };
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const SITE = 'https://www.sunrise-travels.example';
const db = () => testEnv.MASTER_DB as D1Database;

async function req(e: any, method: string, path: string, init: { json?: unknown; token?: string; headers?: Record<string, string> } = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost${path}`, { method, headers, body: init.json === undefined ? undefined : JSON.stringify(init.json) }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

let admin = '';
let key = '';
let n = 0;

const capture = (over: Record<string, unknown> = {}) => ({
  mode: 'before_chat',
  fields: { name: 'optional', email: 'optional', phone: 'required' },
  requireOneOf: ['email', 'phone'],
  consentText: 'I agree to be contacted about my trip.',
  marketingOptIn: true,
  autoCreateLead: false,
  ...over,
});

const saveConfig = (contactCapture: unknown) =>
  req(testEnv, 'PUT', '/api/v1/chatbot/config/website', {
    token: admin,
    json: { enabled: 1, greeting: 'Welcome', faqEntries: [{ question: 'hello', answer: 'Hi there' }], allowedOrigins: [SITE], ...(contactCapture === undefined ? {} : { contactCapture }) },
  });

const publicConfig = async () => ((await (await req(testEnv, 'GET', `/api/v1/public/chatbot/${key}/config`, { headers: { Origin: SITE } })).json()) as any).data;

let ipCounter = 10;
const submit = (body: Record<string, unknown>, opts: { origin?: string; ip?: string; e?: any } = {}) =>
  req(opts.e ?? testEnv, 'POST', `/api/v1/public/chatbot/${key}/contact`, {
    json: { visitorId: `visitor-${++n}`, consent: true, ...body },
    headers: { Origin: opts.origin ?? SITE, 'cf-connecting-ip': opts.ip ?? `203.0.113.${ipCounter++ % 250}` },
  });

const conversation = async (id: string) => (await db().prepare('SELECT * FROM chatbot_conversations WHERE id = ?').bind(id).first()) as any;
const count = async (sql: string, ...binds: unknown[]) => ((await db().prepare(sql).bind(...binds).first()) as any).n as number;

describe('chatbot widget asks for contact details (R151)', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  });

  beforeEach(async () => {
    expect((await req(testEnv, 'POST', '/api/v1/test/reset')).status).toBe(200);
    await db()
      .prepare(`INSERT OR REPLACE INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES ('r151-flag', ?, 'ai_chatbot', 1)`)
      .bind(TENANT_ID)
      .run();
    const login = await req(testEnv, 'POST', '/api/v1/auth/login', { json: { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID } });
    admin = ((await login.json()) as any).data.accessToken;
    key = ((await (await req(testEnv, 'GET', '/api/v1/chatbot/widget', { token: admin })).json()) as any).data.widgetKey;
  });

  it('with the setting off the widget config is exactly what it was, and the form route refuses', async () => {
    expect((await saveConfig(undefined)).status).toBeLessThan(300);
    expect(await publicConfig()).toEqual({ enabled: true, greeting: 'Welcome', brandingColor: null, brandingLogo: null });

    const before = await count('SELECT COUNT(*) AS n FROM chatbot_conversations');
    const res = await submit({ phone: '9876543210' });
    expect(res.status).toBe(400);
    expect(await count('SELECT COUNT(*) AS n FROM chatbot_conversations')).toBe(before);

    // A saved mode of "off" and a nonsense mode both read as off.
    await saveConfig(capture({ mode: 'off' }));
    expect((await publicConfig()).contactCapture).toBeUndefined();
    await saveConfig(capture({ mode: 'whenever' }));
    expect((await publicConfig()).contactCapture).toBeUndefined();
  });

  it('config returns the form settings with default wording in the agency language', async () => {
    await saveConfig(capture());
    const cc = (await publicConfig()).contactCapture;
    expect(cc.mode).toBe('before_chat');
    expect(cc.fields).toEqual({ name: 'optional', email: 'optional', phone: 'required' });
    expect(cc.requireOneOf).toEqual(['email', 'phone']);
    expect(cc.consentText).toBe('I agree to be contacted about my trip.');
    expect(cc.labels.title).toBe('How can we reach you?');
    expect(cc.labels.submit).toBe('Continue');

    // Defaults for the agency's own words come from the backend texts (Dutch agency); the agency's wording wins.
    await db().prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('locale', 'nl-NL', ?)").bind(new Date().toISOString()).run();
    await saveConfig(capture({ consentText: '', labels: { submit: 'Verstuur nu' } }));
    const nl = (await publicConfig()).contactCapture;
    expect(nl.labels.title).toBe('Hoe kunnen we u bereiken?');
    expect(nl.labels.submit).toBe('Verstuur nu');
    expect(nl.consentText).toContain('akkoord');
    await db().prepare("DELETE FROM settings WHERE key = 'locale'").run();
  });

  it('refuses a missing required field, a missing consent, a bad email and a bad phone', async () => {
    await saveConfig(capture());
    const before = await count('SELECT COUNT(*) AS n FROM chatbot_conversations');

    const noPhone = await submit({ name: 'Asha' });
    expect(noPhone.status).toBe(400);
    expect(((await noPhone.json()) as any).field).toBe('phone');
    expect((await submit({ phone: '9876543210', consent: false })).status).toBe(400);
    expect((await submit({ phone: '9876543210', consent: undefined })).status).toBe(400);
    expect((await submit({ phone: '12', })).status).toBe(400);
    expect((await submit({ phone: '9876543210', email: 'not-an-email' })).status).toBe(400);
    expect(await count('SELECT COUNT(*) AS n FROM chatbot_conversations')).toBe(before);

    // Phone optional, email optional, but one of the two is needed.
    await saveConfig(capture({ fields: { name: 'required', email: 'optional', phone: 'optional' } }));
    expect((await submit({ name: 'Asha' })).status).toBe(400);
    expect((await submit({ name: 'Asha', email: 'asha@example.com' })).status).toBe(200);
    // A hidden field is ignored even when sent.
    await saveConfig(capture({ fields: { name: 'hidden', email: 'optional', phone: 'optional' } }));
    const res = await submit({ name: 'Ignored', email: 'quiet@example.com' });
    expect(res.status).toBe(200);
    expect((await conversation(((await res.json()) as any).data.conversationId)).visitor_name).toBeNull();
  });

  it('stores the details on a new conversation, with the phone read in the agency country (NL)', async () => {
    await db().prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('phone_default_country', 'NL', ?)").bind(new Date().toISOString()).run();
    await saveConfig(capture());
    const res = await submit({ name: ' Eva de Vries ', email: 'Eva@Example.com', phone: '06 12345678' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.captured).toBe(true);
    const conv = await conversation(body.data.conversationId);
    expect(conv.visitor_phone).toBe('+31612345678');
    expect(conv.visitor_email).toBe('eva@example.com');
    expect(conv.visitor_name).toBe('Eva de Vries');
    expect(conv.contact_consent_at).toBeTruthy();
    expect(conv.contact_consent_text).toBe('I agree to be contacted about my trip.');
    expect(conv.channel).toBe('website');
    expect(JSON.parse(conv.messages)[0].content).toBe('Welcome');
    // The visitor's answer says nothing about the agency's records.
    expect(Object.keys(body.data).sort()).toEqual(['captured', 'conversationId']);
    await db().prepare("DELETE FROM settings WHERE key = 'phone_default_country'").run();
  });

  it('the form can come after the first message: it updates that conversation, and another visitor cannot reach it', async () => {
    await saveConfig(capture({ mode: 'after_first_reply' }));
    const first = await req(testEnv, 'POST', `/api/v1/public/chatbot/${key}/messages`, {
      json: { visitorId: 'visitor-after', message: 'hello' },
      headers: { Origin: SITE },
    });
    // The FAQ answers, so no AI is involved.
    const row = (await db().prepare("SELECT id FROM chatbot_conversations WHERE visitor_id = 'visitor-after'").first()) as any;
    expect(first).not.toBeNull();
    expect(row?.id).toBeTruthy();

    const own = await req(testEnv, 'POST', `/api/v1/public/chatbot/${key}/contact`, {
      json: { visitorId: 'visitor-after', conversationId: row.id, phone: '9876543210', consent: true },
      headers: { Origin: SITE, 'cf-connecting-ip': '198.51.100.9' },
    });
    expect(((await own.json()) as any).data.conversationId).toBe(row.id);
    expect((await conversation(row.id)).visitor_phone).toBe('+919876543210');

    const stranger = await req(testEnv, 'POST', `/api/v1/public/chatbot/${key}/contact`, {
      json: { visitorId: 'someone-else', conversationId: row.id, phone: '9123456789', consent: true },
      headers: { Origin: SITE, 'cf-connecting-ip': '198.51.100.10' },
    });
    const strangerId = ((await stranger.json()) as any).data.conversationId;
    expect(strangerId).not.toBe(row.id);
    expect((await conversation(row.id)).visitor_phone).toBe('+919876543210');
  });

  it('records consent when the chat becomes a lead: agreement always, marketing only when ticked', async () => {
    await saveConfig(capture());
    const ticked = ((await (await submit({ name: 'Ticked', phone: '9000000001', marketingOptIn: true })).json()) as any).data.conversationId;
    const plain = ((await (await submit({ name: 'Plain', phone: '9000000002', marketingOptIn: false })).json()) as any).data.conversationId;
    expect(await count('SELECT COUNT(*) AS n FROM contact_consents WHERE source = ?', 'chatbot')).toBe(0);

    for (const id of [ticked, plain]) {
      const lead = await req(testEnv, 'POST', `/api/v1/chatbot/conversations/${id}/create-lead`, { token: admin });
      expect(lead.status).toBe(201);
    }
    const rows = async (conversationId: string) => {
      const c = await conversation(conversationId);
      return ((await db().prepare("SELECT purpose, status, channel, evidence FROM contact_consents WHERE contact_id = ? AND source = 'chatbot' ORDER BY purpose").bind(c.contact_id).all()) as any).results as any[];
    };
    const t = await rows(ticked);
    expect(t.map((r) => `${r.purpose}:${r.status}`)).toEqual(['marketing:granted', 'service:granted']);
    expect(JSON.parse(t[0].evidence).text).toBe('I agree to be contacted about my trip.');
    expect((await rows(plain)).map((r) => `${r.purpose}:${r.status}`)).toEqual(['service:granted']);

    // Creating the lead twice does not repeat the records.
    await req(testEnv, 'POST', `/api/v1/chatbot/conversations/${ticked}/create-lead`, { token: admin });
    expect((await rows(ticked)).length).toBe(2);

    // The box only counts when the agency offers it.
    await saveConfig(capture({ marketingOptIn: false }));
    const offered = ((await (await submit({ phone: '9000000003', marketingOptIn: true })).json()) as any).data.conversationId;
    expect((await conversation(offered)).contact_marketing_opt_in).toBe(0);
  });

  it('autoCreateLead makes one contact and one lead, links the conversation, and a second capture does not duplicate', async () => {
    await saveConfig(capture({ autoCreateLead: true }));
    const contactsBefore = await count('SELECT COUNT(*) AS n FROM contacts');
    const leadsBefore = await count('SELECT COUNT(*) AS n FROM leads');

    const first = (await (await submit({ name: 'Auto Visitor', phone: '9000000044', email: 'auto@example.com', marketingOptIn: true })).json()) as any;
    const id = first.data.conversationId;
    const conv = await conversation(id);
    expect(conv.lead_id).toBeTruthy();
    expect(conv.contact_id).toBeTruthy();
    expect(conv.status).toBe('qualified');
    expect(await count('SELECT COUNT(*) AS n FROM contacts')).toBe(contactsBefore + 1);
    expect(await count('SELECT COUNT(*) AS n FROM leads')).toBe(leadsBefore + 1);
    const lead = (await db().prepare('SELECT contact_id, source, status FROM leads WHERE id = ?').bind(conv.lead_id).first()) as any;
    expect(lead).toMatchObject({ contact_id: conv.contact_id, source: 'website', status: 'new' });
    expect(await count("SELECT COUNT(*) AS n FROM contact_consents WHERE contact_id = ? AND source = 'chatbot'", conv.contact_id)).toBe(2);

    // The same visitor sends the form again for the same conversation.
    const again = await req(testEnv, 'POST', `/api/v1/public/chatbot/${key}/contact`, {
      json: { visitorId: conv.visitor_id, conversationId: id, name: 'Auto Visitor', phone: '9000000044', consent: true },
      headers: { Origin: SITE, 'cf-connecting-ip': '198.51.100.20' },
    });
    expect(again.status).toBe(200);
    expect(await count('SELECT COUNT(*) AS n FROM contacts')).toBe(contactsBefore + 1);
    expect(await count('SELECT COUNT(*) AS n FROM leads')).toBe(leadsBefore + 1);
    expect(await count("SELECT COUNT(*) AS n FROM contact_consents WHERE contact_id = ? AND source = 'chatbot'", conv.contact_id)).toBe(2);

    // The event carries ids and flags, not the visitor's details.
    const ev = (await db().prepare("SELECT payload FROM domain_events WHERE type = 'chatbot.contact_captured' AND entity_id = ? LIMIT 1").bind(id).first()) as any;
    expect(JSON.parse(ev.payload)).toMatchObject({ conversationId: id, hasPhone: true, hasEmail: true, marketingOptIn: true });
    expect(ev.payload).not.toContain('9000000044');
    expect(ev.payload).not.toContain('auto@example.com');
  });

  it('a ticked marketing box never overrides an unsubscribe the contact already made', async () => {
    await db()
      .prepare("INSERT INTO contacts (id, name, phone, type, opted_out, tags) VALUES ('r151-optout', 'Opted Out', '+919000000055', 'customer', 1, '[]')")
      .run();
    await saveConfig(capture({ autoCreateLead: true }));
    const id = ((await (await submit({ phone: '9000000055', marketingOptIn: true })).json()) as any).data.conversationId;
    const conv = await conversation(id);
    expect(conv.contact_id).toBe('r151-optout');
    const contact = (await db().prepare("SELECT opted_out FROM contacts WHERE id = 'r151-optout'").first()) as any;
    expect(contact.opted_out).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM contact_consents WHERE contact_id = 'r151-optout' AND source = 'chatbot' AND purpose = 'marketing'")).toBe(0);
  });

  it('a website that is not on the allow-list is refused and nothing is stored', async () => {
    await saveConfig(capture());
    const before = await count('SELECT COUNT(*) AS n FROM chatbot_conversations');
    const res = await submit({ phone: '9876543210' }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(await count('SELECT COUNT(*) AS n FROM chatbot_conversations')).toBe(before);
    expect((await req(testEnv, 'POST', '/api/v1/public/chatbot/wk_does_not_exist_at_all/contact', { json: { visitorId: 'v', consent: true, phone: '1' }, headers: { Origin: SITE } })).status).toBe(404);
  });

  it('the 11th submission in 10 minutes from one IP is 429', async () => {
    await saveConfig(capture());
    for (let i = 1; i <= 10; i++) {
      expect((await submit({ phone: '9876543210' }, { e: realLimits, ip: '198.51.100.77' })).status, `submission ${i}`).toBe(200);
    }
    expect((await submit({ phone: '9876543210' }, { e: realLimits, ip: '198.51.100.77' })).status).toBe(429);
    expect((await submit({ phone: '9876543210' }, { e: realLimits, ip: '198.51.100.78' })).status).toBe(200);
  });

  it('serves a widget that builds the form from text only and posts to /contact', async () => {
    const script = await (await req(testEnv, 'GET', `/api/v1/public/chatbot/${key}/widget.js`)).text();
    expect(script).toContain('/contact');
    expect(script).toContain('cap.consentText');
    // Agency wording is never written as markup: the only innerHTML is the static shell.
    expect(script.match(/innerHTML/g)?.length).toBe(1);
    expect(script).toContain('textContent');
  });
});
