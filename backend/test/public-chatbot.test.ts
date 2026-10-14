import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { twilioSignature } from '../src/middleware/provider-signature';

const testEnv = env as any;
const multiEnv = { ...testEnv, TENANCY_MODE: 'multi' };
// Real limits: the suites normally raise them (RATE_LIMIT_MULTIPLIER defaults to 1000 in test mode).
const multiRealLimits = { ...multiEnv, RATE_LIMIT_MULTIPLIER: '1' };

const TENANT_ID = '00000000-0000-0000-0000-000000000000';
// Unique ids: storage is shared across test files (isolatedStorage is false).
const AGENCY_PRO = '0196b107-0000-7000-8000-00000000000a'; // enterprise plan: has ai_chatbot
const AGENCY_BASIC = '0196b107-0000-7000-8000-00000000000b'; // pro plan: no ai_chatbot
const POOL_PRO = 'TENANT_DB_POOL_1';
const POOL_BASIC = 'TENANT_DB_POOL_2';
const KEY_PRO = 'wk_r107_enterprise_agency_key';
const KEY_BASIC = 'wk_r107_basic_agency_key';
const SITE = 'https://www.sunrise-travels.example';
const FAQ = JSON.stringify([{ question: 'visa', answer: 'We take care of your visa.' }]);

async function req(e: any, method: string, path: string, init: { json?: unknown; token?: string; headers?: Record<string, string>; raw?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.json !== undefined || init.raw !== undefined) headers['Content-Type'] = 'application/json';
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost${path}`, { method, headers, body: init.raw ?? (init.json === undefined ? undefined : JSON.stringify(init.json)) }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

const message = (e: any, key: string, text: string, opts: { origin?: string; ip?: string; visitorId?: string; conversationId?: string } = {}) =>
  req(e, 'POST', `/api/v1/public/chatbot/${key}/messages`, {
    json: { visitorId: opts.visitorId ?? 'visitor-1', message: text, conversationId: opts.conversationId },
    headers: { ...(opts.origin ? { Origin: opts.origin } : {}), 'cf-connecting-ip': opts.ip ?? '203.0.113.7' },
  });

async function count(db: D1Database, sql = 'SELECT COUNT(*) AS n FROM chatbot_conversations', ...binds: unknown[]): Promise<number> {
  return ((await db.prepare(sql).bind(...binds).first()) as any).n;
}

async function insertAgency(id: string, sub: string, plan: string, pool: string, key: string) {
  await testEnv.MASTER_DB
    .prepare(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, db_binding) VALUES (?, ?, ?, ?, 'active', ?)`)
    .bind(id, `Chat agency ${sub}`, `r107-${sub}`, plan, pool)
    .run();
  await testEnv.MASTER_DB
    .prepare(`INSERT OR REPLACE INTO tenant_channel_addresses (id, tenant_id, channel, address, provider) VALUES (?, ?, 'widget', ?, NULL)`)
    .bind(`r107-widget-${sub}`, id, key)
    .run();
  await testEnv[pool]
    .prepare(
      `INSERT OR REPLACE INTO chatbot_config (id, channel, enabled, greeting, faq_entries, allowed_origins) VALUES (?, 'website', 1, ?, ?, ?)`,
    )
    .bind(`r107-config-${sub}`, `Welcome to ${sub}`, FAQ, JSON.stringify([SITE]))
    .run();
}

describe('public chatbot widget', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    for (const pool of [POOL_PRO, POOL_BASIC]) await applyD1Migrations(testEnv[pool], testEnv.TEST_MIGRATIONS);
    await insertAgency(AGENCY_PRO, 'enterprise', 'enterprise', POOL_PRO, KEY_PRO);
    await insertAgency(AGENCY_BASIC, 'basic', 'pro', POOL_BASIC, KEY_BASIC);
  });

  it('serves widget.js without a login for a known key, and 404 for an unknown key', async () => {
    const ok = await req(multiEnv, 'GET', `/api/v1/public/chatbot/${KEY_PRO}/widget.js`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('javascript');
    const script = await ok.text();
    expect(script).toContain(`/api/v1/public/chatbot/${KEY_PRO}`);
    expect(script).not.toContain(KEY_BASIC);

    expect((await req(multiEnv, 'GET', '/api/v1/public/chatbot/wk_does_not_exist_at_all/widget.js')).status).toBe(404);
    expect((await req(multiEnv, 'GET', '/api/v1/public/chatbot/x/widget.js')).status).toBe(404);
    expect((await message(multiEnv, 'wk_does_not_exist_at_all', 'hello', { origin: SITE })).status).toBe(404);
  });

  it('a visitor message creates a conversation in that agency\'s own database only (multi-tenant)', async () => {
    const proBefore = await count(testEnv[POOL_PRO]);
    const basicBefore = await count(testEnv[POOL_BASIC]);
    const sharedBefore = await count(testEnv.MASTER_DB);

    const res = await message(multiEnv, KEY_PRO, 'Do you handle my visa?', { origin: SITE, visitorId: 'visitor-multi' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.reply).toBe('We take care of your visa.');
    expect(body.data.cost).toBeUndefined();

    expect(await count(testEnv[POOL_PRO])).toBe(proBefore + 1);
    expect(await count(testEnv[POOL_BASIC])).toBe(basicBefore);
    expect(await count(testEnv.MASTER_DB)).toBe(sharedBefore);
    expect(await count(testEnv[POOL_PRO], 'SELECT COUNT(*) AS n FROM chatbot_conversations WHERE id = ? AND visitor_id = ?', body.data.conversationId, 'visitor-multi')).toBe(1);

    // The same conversation continues; another visitor cannot continue it.
    const again = await message(multiEnv, KEY_PRO, 'visa again', { origin: SITE, visitorId: 'visitor-multi', conversationId: body.data.conversationId });
    expect(((await again.json()) as any).data.conversationId).toBe(body.data.conversationId);
    const stranger = await message(multiEnv, KEY_PRO, 'visa', { origin: SITE, visitorId: 'someone-else', conversationId: body.data.conversationId });
    expect(((await stranger.json()) as any).data.conversationId).not.toBe(body.data.conversationId);
  });

  it('config returns only public fields', async () => {
    const res = await req(multiEnv, 'GET', `/api/v1/public/chatbot/${KEY_PRO}/config`, { headers: { Origin: SITE } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data).toEqual({ enabled: true, greeting: 'Welcome to enterprise', brandingColor: null, brandingLogo: null });
  });

  it('a website that is not on the allow-list gets 403 and nothing is stored', async () => {
    const before = await count(testEnv[POOL_PRO]);
    const evil = await message(multiEnv, KEY_PRO, 'visa', { origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    // Not the same site on another scheme or port either.
    expect((await message(multiEnv, KEY_PRO, 'visa', { origin: 'http://www.sunrise-travels.example' })).status).toBe(403);
    expect(await count(testEnv[POOL_PRO])).toBe(before);

    // The allow-list is case- and trailing-slash-insensitive for the right site.
    expect((await message(multiEnv, KEY_PRO, 'visa', { origin: SITE.toUpperCase() })).status).toBe(200);

    // The browser must be able to read the refusal: CORS reflects the origin on this public mount.
    expect(evil.headers.get('access-control-allow-origin')).toBe('https://evil.example');
  });

  it('answers a CORS preflight from any website (the route enforces the allow-list)', async () => {
    const res = await req(multiEnv, 'OPTIONS', `/api/v1/public/chatbot/${KEY_PRO}/messages`, {
      headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(SITE);
  });

  it('an agency whose plan has no ai_chatbot gets 403 with the upgrade flag, and nothing is stored', async () => {
    const before = await count(testEnv[POOL_BASIC]);
    const res = await message(multiEnv, KEY_BASIC, 'visa', { origin: SITE });
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.upgrade).toBe(true);
    expect(body.featureKey).toBe('ai_chatbot');
    expect(await count(testEnv[POOL_BASIC])).toBe(before);
  });

  it('the 31st message in 10 minutes from one IP is 429; another IP is unaffected', async () => {
    for (let i = 1; i <= 30; i++) {
      const res = await message(multiRealLimits, KEY_PRO, 'visa', { origin: SITE, ip: '198.51.100.31' });
      expect(res.status, `message ${i}`).toBe(200);
    }
    const over = await message(multiRealLimits, KEY_PRO, 'visa', { origin: SITE, ip: '198.51.100.31' });
    expect(over.status).toBe(429);
    expect((await message(multiRealLimits, KEY_PRO, 'visa', { origin: SITE, ip: '198.51.100.32' })).status).toBe(200);
  });

  it('a message over 2 KB is refused', async () => {
    const before = await count(testEnv[POOL_PRO]);
    const res = await message(multiEnv, KEY_PRO, 'x'.repeat(3000), { origin: SITE });
    expect(res.status).toBe(413);
    expect(await count(testEnv[POOL_PRO])).toBe(before);
    expect((await req(multiEnv, 'POST', `/api/v1/public/chatbot/${KEY_PRO}/messages`, { raw: '{not json', headers: { Origin: SITE } })).status).toBe(400);
  });

  describe('staff side and WhatsApp (single workspace)', () => {
    let admin = '';
    let widgetKey = '';

    beforeAll(async () => {
      expect((await req(testEnv, 'POST', '/api/v1/test/reset')).status).toBe(200);
      // The test agency is on the pro plan; switch ai_chatbot on for it.
      await testEnv.MASTER_DB
        .prepare(`INSERT OR REPLACE INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES ('r107-flag', ?, 'ai_chatbot', 1)`)
        .bind(TENANT_ID)
        .run();
      const login = await req(testEnv, 'POST', '/api/v1/auth/login', { json: { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID } });
      admin = ((await login.json()) as any).data.accessToken;
    });

    it('the staff widget endpoint creates one stable key, and the widget then works with no login', async () => {
      const first = await req(testEnv, 'GET', '/api/v1/chatbot/widget', { token: admin });
      expect(first.status).toBe(200);
      const data = ((await first.json()) as any).data;
      widgetKey = data.widgetKey;
      expect(widgetKey).toMatch(/^wk_[A-Za-z0-9_-]{20,}$/);
      expect(data.scriptUrl).toContain(`/api/v1/public/chatbot/${widgetKey}/widget.js`);
      expect(data.snippet).toContain(data.scriptUrl);

      const second = await req(testEnv, 'GET', '/api/v1/chatbot/widget', { token: admin });
      expect(((await second.json()) as any).data.widgetKey).toBe(widgetKey);

      // The agency lists its website and a FAQ; then an anonymous visitor chats.
      const saved = await req(testEnv, 'PUT', '/api/v1/chatbot/config/website', {
        token: admin,
        json: { enabled: 1, greeting: 'Hi from the agency', faqEntries: [{ question: 'visa', answer: 'Visas are our speciality.' }], allowedOrigins: [SITE] },
      });
      expect(saved.status).toBeLessThan(300);

      const chat = await message(testEnv, widgetKey, 'tell me about a visa', { origin: SITE, visitorId: 'visitor-single' });
      expect(chat.status).toBe(200);
      expect(((await chat.json()) as any).data.reply).toBe('Visas are our speciality.');

      const list = await req(testEnv, 'GET', '/api/v1/chatbot/conversations?channel=website', { token: admin });
      const rows = ((await list.json()) as any).data as Array<{ visitor_id: string }>;
      expect(rows.some((r) => r.visitor_id === 'visitor-single')).toBe(true);
    });

    it('the old authenticated webhook, WhatsApp and widget.js mounts are gone', async () => {
      expect((await req(testEnv, 'POST', '/api/v1/chatbot/webhook/website', { token: admin, json: { visitorId: 'a', message: 'hi' } })).status).toBe(404);
      expect((await req(testEnv, 'POST', '/api/v1/chatbot/whatsapp/incoming', { token: admin, json: {} })).status).toBe(404);
      expect((await req(testEnv, 'GET', '/api/v1/chatbot/widget.js', { token: admin })).status).toBe(404);
    });

    it('a signed Twilio WhatsApp message reaches the agency that owns the number it was sent to', async () => {
      const number = '+918047182299';
      await testEnv.MASTER_DB
        .prepare(`INSERT OR REPLACE INTO tenant_channel_addresses (id, tenant_id, channel, address, provider) VALUES ('r107-wa', ?, 'whatsapp', ?, 'twilio')`)
        .bind(TENANT_ID, number)
        .run();
      const saved = await req(testEnv, 'PUT', '/api/v1/chatbot/config/whatsapp', {
        token: admin,
        json: { enabled: 1, faqEntries: [{ question: 'visa', answer: 'Yes, visa help is included.' }] },
      });
      expect(saved.status).toBeLessThan(300);
      const path = '/api/v1/webhooks/chatbot/whatsapp';
      const form = { From: 'whatsapp:+919000007200', To: `whatsapp:${number}`, Body: 'Is a visa included?', MessageSid: 'SM-r107-wa' };
      const signature = await twilioSignature(`http://localhost${path}`, form, testEnv.TWILIO_AUTH_TOKEN);

      const send = (sig: string | null, to = form.To) =>
        worker.fetch(
          new Request(`http://localhost${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(sig ? { 'X-Twilio-Signature': sig } : {}) },
            body: new URLSearchParams({ ...form, To: to }).toString(),
          }),
          testEnv,
          createExecutionContext(),
        );

      expect((await send('forged')).status).toBe(403);
      const ok = await send(signature);
      expect(ok.status).toBe(200);
      const mine = await testEnv.MASTER_DB
        .prepare(`SELECT channel, visitor_phone FROM chatbot_conversations WHERE visitor_id = '+919000007200'`)
        .first();
      expect(mine).toEqual({ channel: 'whatsapp', visitor_phone: '+919000007200' });

      // A number no agency owns is acknowledged and stored nowhere.
      const before = await count(testEnv.MASTER_DB);
      const other = await twilioSignature(`http://localhost${path}`, { ...form, To: 'whatsapp:+15550009999' }, testEnv.TWILIO_AUTH_TOKEN);
      expect((await send(other, 'whatsapp:+15550009999')).status).toBe(200);
      expect(await count(testEnv.MASTER_DB)).toBe(before);
    });
  });
});
