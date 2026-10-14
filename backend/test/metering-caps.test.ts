import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { twilioSignature } from '../src/middleware/provider-signature';
import { superAdminToken } from './utils/super-admin';
import { bumpCatalogueVersion, getAllowance, currentPeriodKey } from '../src/services/plans/catalogue';
import { meterUsage, tryMeter, recordUsage, refundUsage, AllowanceExhausted } from '../src/services/metering/meter';
import { chargeCredits, getCreditBalance } from '../src/services/ai-credits';
import { handleSmsJob } from '../src/queues/sms-queue';
import { handleCampaignQueue } from '../src/queues/campaign-queue';
import { clearOutbox, listOutbox } from '../src/services/mail/transactional';

/**
 * R110: every paid send is metered against the agency's monthly allowance before the provider is called.
 * The e2e tenant is on the Pro plan; each test sets the allowance it needs on plan_allowances and the file puts the
 * seeded values back afterwards.
 */

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const AGENCY_NUMBER = '+918047182299';
const ADMIN_EMAIL = 'admin@e2e.test';
const SUPER_EMAIL = 'super-r110@platform.test';

let admin = '';
let adminId = '';
let contactId = '';
let waTemplateId = '';
const queued: any[] = [];
const queueEnv = () => ({ ...testEnv, SMS_QUEUE: { send: async (m: unknown) => { queued.push(m); } }, EMAIL_QUEUE: { send: async (m: unknown) => { queued.push(m); } }, CAMPAIGN_QUEUE: { send: async () => {} } });

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

const db = (sql: string, ...binds: unknown[]) => (testEnv.MASTER_DB as D1Database).prepare(sql).bind(...binds);
async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  return ((await db(sql, ...binds).all()).results ?? []) as T[];
}

async function setAllowance(key: string, amount: number) {
  await db(`UPDATE plan_allowances SET monthly_amount = ? WHERE plan_key = 'pro' AND allowance_key = ?`, amount, key).run();
  await bumpCatalogueVersion(testEnv);
}

async function usage(capKey: string): Promise<number> {
  const row = await db('SELECT current_usage FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = ?', TENANT_ID, capKey).first<{ current_usage: number }>();
  return row?.current_usage ?? 0;
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
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function resetUsage() {
  await db('DELETE FROM tenant_usage_caps WHERE tenant_id = ?', TENANT_ID).run();
  await db('DELETE FROM usage_alerts WHERE tenant_id = ?', TENANT_ID).run();
  await db('DELETE FROM metered_events WHERE tenant_id = ?', TENANT_ID).run();
  await db(`DELETE FROM tenant_addons WHERE tenant_id = ? AND product_key <> 'extra_user'`, TENANT_ID).run();
  await db(`DELETE FROM notifications WHERE type = 'usage_alert'`).run();
  await clearOutbox(testEnv);
  queued.length = 0;
}

async function restoreSeed() {
  const seeded: Array<[string, number]> = [['sms', 15], ['whatsapp', 400], ['otp', 12], ['call_minutes', 0], ['email', 2000], ['ai_credits', 15000]];
  for (const [key, amount] of seeded) {
    await db(`UPDATE plan_allowances SET monthly_amount = ? WHERE plan_key = 'pro' AND allowance_key = ?`, amount, key).run();
  }
  await bumpCatalogueVersion(testEnv);
}

describe('communication caps (R110)', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    await restoreSeed();
    const login = await call('POST', '/auth/login', null, { email: ADMIN_EMAIL, password: 'password123', tenantId: TENANT_ID });
    const body = (await login.json()) as any;
    admin = body.data.accessToken;
    adminId = body.data.user.id;

    const contact = await call('POST', '/contacts', admin, { name: 'Cap Contact', phone: '+91 90000 07001', email: 'cap-contact@example.com', type: 'customer' });
    contactId = ((await contact.json()) as any).data.id;
    waTemplateId = 'r110-wa-template';
    await db(`INSERT OR REPLACE INTO message_templates (id, channel, name, content) VALUES (?, 'whatsapp', 'R110 template', 'Hello {{name}}')`, waTemplateId).run();
  });

  afterAll(async () => {
    await restoreSeed();
    await resetUsage();
  });

  beforeEach(async () => {
    await resetUsage();
    await restoreSeed();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Communication Hub', () => {
    it('whatsapp cap 2: the third template send is a 402 ALLOWANCE_EXHAUSTED, nothing is queued, the provider is not called', async () => {
      await setAllowance('whatsapp', 2);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const send = () => call('POST', '/communications/send-template', admin, { contact_id: contactId, template_id: waTemplateId }, queueEnv());
      expect((await send()).status).toBe(201);
      expect((await send()).status).toBe(201);
      const third = await send();
      expect(third.status).toBe(402);
      const body = (await third.json()) as any;
      expect(body).toMatchObject({ success: false, code: 'ALLOWANCE_EXHAUSTED', channel: 'whatsapp', used: 2, allowance: 2, options: ['upgrade', 'top_up'] });
      expect(body.error.code).toBe('ALLOWANCE_EXHAUSTED');
      expect(body.upgradeTo).toMatchObject({ key: expect.any(String), allowance: expect.any(Number) });
      const pack = body.addons.find((a: any) => a.key === 'whatsapp_1000');
      expect(pack).toMatchObject({ units: 1000, currency: 'INR' });
      expect(pack.price).toBeGreaterThan(0);
      expect(queued).toHaveLength(2);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(await usage('whatsapp_per_month')).toBe(2);
    });

    it('a free-form reply inside the 24 hour window is not metered; a template still is', async () => {
      await setAllowance('whatsapp', 0);
      await db(
        `INSERT INTO message_log (id, contact_id, channel, content, direction, status, created_at) VALUES (?, ?, 'whatsapp', 'Hi, price?', 'incoming', 'delivered', ?)`,
        'r110-incoming', contactId, new Date().toISOString(),
      ).run();
      const reply = await call('POST', '/communications/send', admin, { channel: 'whatsapp', contact_id: contactId, message: 'Sure, sending the quote' }, queueEnv());
      expect(reply.status).toBe(201);
      expect(await usage('whatsapp_per_month')).toBe(0);
      expect(queued[0].data).toMatchObject({ metered: true, refundOnFailure: false });
      const template = await call('POST', '/communications/send-template', admin, { contact_id: contactId, template_id: waTemplateId }, queueEnv());
      expect(template.status).toBe(402);
      await db(`DELETE FROM message_log WHERE id = 'r110-incoming'`).run();
    });

    it('bulk send stops at the cap: the rest are reported skipped, and a bulk send with nothing sendable is a 402', async () => {
      await setAllowance('sms', 1);
      const second = await call('POST', '/contacts', admin, { name: 'Second', phone: '+91 90000 07002', type: 'customer' });
      const secondId = ((await second.json()) as any).data.id;
      const res = await call('POST', '/communications/bulk-send', admin, { channel: 'sms', contact_ids: [contactId, secondId], message: 'Offer' }, queueEnv());
      expect(res.status).toBe(201);
      const data = ((await res.json()) as any).data;
      expect(data.total_messages).toBe(1);
      expect(data.skipped_allowance).toBe(1);
      const again = await call('POST', '/communications/bulk-send', admin, { channel: 'sms', contact_ids: [contactId], message: 'Offer' }, queueEnv());
      expect(again.status).toBe(402);
    });
  });

  describe('queues', () => {
    it('a queued SMS with no allowance left is never sent and its log row says skipped_allowance', async () => {
      await setAllowance('sms', 0);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await db(`INSERT INTO message_log (id, contact_id, channel, content, status) VALUES ('r110-q1', ?, 'sms', 'x', 'queued')`, contactId).run();
      await handleSmsJob({ to: '+919000007001', body: 'x', tenantId: TENANT_ID, channel: 'sms', messageLogId: 'r110-q1' }, testEnv);
      expect(fetchSpy).not.toHaveBeenCalled();
      const log = (await rows(`SELECT status, error_message FROM message_log WHERE id = 'r110-q1'`))[0];
      expect(log.status).toBe('failed');
      expect(log.error_message).toContain('skipped_allowance');
    });

    it('a send the provider rejects gives its unit back', async () => {
      await setAllowance('sms', 5);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'rejected' }), { status: 400 }));
      await db(`INSERT INTO message_log (id, contact_id, channel, content, status) VALUES ('r110-q2', ?, 'sms', 'x', 'queued')`, contactId).run();
      await handleSmsJob({ to: '+919000007001', body: 'x', tenantId: TENANT_ID, channel: 'sms', messageLogId: 'r110-q2' }, testEnv);
      expect(await usage('sms_per_month')).toBe(0);
    });

    it('an SMS campaign of 5 with a cap of 3 sends 3 and marks 2 skipped_allowance; the campaign still completes', async () => {
      await setAllowance('sms', 3);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 }));
      await db(`INSERT INTO marketing_campaigns (id, name, type, message_body, status) VALUES ('r110-camp', 'R110 camp', 'sms', 'Hello', 'sending')`).run();
      for (let i = 1; i <= 5; i++) {
        await db(`INSERT INTO campaign_recipients (id, campaign_id, phone, status) VALUES (?, 'r110-camp', ?, 'pending')`, `r110-r${i}`, `+9190000080${i}0`).run();
      }
      const batch = { messages: [{ body: { type: 'sms_campaign', data: { campaignId: 'r110-camp', tenantId: TENANT_ID, campaignType: 'sms' } }, ack: vi.fn(), retry: vi.fn() }] };
      await handleCampaignQueue(batch as any, queueEnv() as any);
      expect(batch.messages[0].ack).toHaveBeenCalled();
      expect(batch.messages[0].retry).not.toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      const statuses = (await rows(`SELECT status, COUNT(*) AS n FROM campaign_recipients WHERE campaign_id = 'r110-camp' GROUP BY status`));
      expect(Object.fromEntries(statuses.map((r) => [r.status, r.n]))).toEqual({ sent: 3, skipped_allowance: 2 });
      expect((await rows(`SELECT status FROM marketing_campaigns WHERE id = 'r110-camp'`))[0].status).toBe('sent');
      expect(await usage('sms_per_month')).toBe(3);
    });
  });

  describe('the meter', () => {
    it('5 parallel sends with a cap of 3 never exceed 3', async () => {
      await setAllowance('sms', 3);
      const results = await Promise.all(Array.from({ length: 5 }, () => tryMeter(testEnv, TENANT_ID, 'sms')));
      expect(results.filter((r) => r.allowed)).toHaveLength(3);
      expect(await usage('sms_per_month')).toBe(3);
    });

    it('a stale row from an earlier month is brought to this month, not carried over', async () => {
      await setAllowance('sms', 2);
      await db(
        `INSERT INTO tenant_usage_caps (id, tenant_id, cap_key, cap_value, current_usage, reset_period, period_key) VALUES ('r110-stale', ?, 'sms_per_month', 2, 2, 'monthly', '2020-01')`,
        TENANT_ID,
      ).run();
      expect((await meterUsage(testEnv, TENANT_ID, 'sms')).allowed).toBe(true);
      expect(await usage('sms_per_month')).toBe(1);
    });

    it('a super admin communication pack raises the cap for this month only', async () => {
      await setAllowance('sms', 1);
      await meterUsage(testEnv, TENANT_ID, 'sms');
      await expect(meterUsage(testEnv, TENANT_ID, 'sms')).rejects.toBeInstanceOf(AllowanceExhausted);

      const token = await superAdminToken(testEnv, { id: '0196a110-0000-7000-8000-0000000000ab', email: SUPER_EMAIL });
      const grant = await call('POST', `/admin/tenants/${TENANT_ID}/addons`, token, { productKey: 'sms_100' });
      expect(grant.status).toBe(201);
      expect((await meterUsage(testEnv, TENANT_ID, 'sms')).allowed).toBe(true);

      const thisMonth = currentPeriodKey();
      const next = new Date(Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)), 1)).toISOString().slice(0, 7);
      expect(await getAllowance(testEnv, TENANT_ID, 'sms', thisMonth)).toBe(101);
      expect(await getAllowance(testEnv, TENANT_ID, 'sms', next)).toBe(1);
    });

    it('a refund gives units back and never goes below zero', async () => {
      await setAllowance('email', 5);
      await meterUsage(testEnv, TENANT_ID, 'email', 2);
      await refundUsage(testEnv, TENANT_ID, 'email', 1);
      expect(await usage('email_per_month')).toBe(1);
      await refundUsage(testEnv, TENANT_ID, 'email', 9);
      expect(await usage('email_per_month')).toBe(0);
    });
  });

  describe('alerts at 80% and 100%', () => {
    const notifications = async () =>
      rows(`SELECT title, reference_id FROM notifications WHERE type = 'usage_alert' AND user_id = ?`, adminId);
    const emails = async () => (await listOutbox(testEnv, ADMIN_EMAIL)).filter((m) => m.template === 'usage_alert');

    it('crossing 80% creates one notification and one email, crossing 100% another, repeats create none', async () => {
      await setAllowance('sms', 10);
      for (let i = 0; i < 7; i++) await meterUsage(testEnv, TENANT_ID, 'sms');
      expect(await notifications()).toHaveLength(0);

      await meterUsage(testEnv, TENANT_ID, 'sms'); // 8 of 10 = 80%
      expect(await notifications()).toHaveLength(1);
      expect(await emails()).toHaveLength(1);
      expect((await emails())[0].subject).toContain('80%');

      await meterUsage(testEnv, TENANT_ID, 'sms'); // 9: nothing new
      expect(await notifications()).toHaveLength(1);

      await meterUsage(testEnv, TENANT_ID, 'sms'); // 10 of 10 = 100%
      expect(await notifications()).toHaveLength(2);
      expect(await emails()).toHaveLength(2);

      await expect(meterUsage(testEnv, TENANT_ID, 'sms')).rejects.toBeInstanceOf(AllowanceExhausted); // refusals alert nothing more
      await expect(meterUsage(testEnv, TENANT_ID, 'sms')).rejects.toBeInstanceOf(AllowanceExhausted);
      expect(await notifications()).toHaveLength(2);
      expect(await emails()).toHaveLength(2);
    });

    it('a channel with no allowance alerts once when the first send is refused', async () => {
      await setAllowance('otp', 0);
      await expect(meterUsage(testEnv, TENANT_ID, 'otp')).rejects.toBeInstanceOf(AllowanceExhausted);
      await expect(meterUsage(testEnv, TENANT_ID, 'otp')).rejects.toBeInstanceOf(AllowanceExhausted);
      expect((await notifications()).filter((n) => n.reference_id === 'otp_per_month')).toHaveLength(1);
    });

    it('AI credits use the same alerts', async () => {
      await setAllowance('ai_credits', 10);
      await getCreditBalance(testEnv, TENANT_ID);
      for (let i = 0; i < 7; i++) await chargeCredits(testEnv, TENANT_ID, 'read');
      expect((await notifications()).filter((n) => n.reference_id === 'ai_credits_per_month')).toHaveLength(0);
      await chargeCredits(testEnv, TENANT_ID, 'read'); // 8 of 10
      expect((await notifications()).filter((n) => n.reference_id === 'ai_credits_per_month')).toHaveLength(1);
      await chargeCredits(testEnv, TENANT_ID, 'read');
      await chargeCredits(testEnv, TENANT_ID, 'read'); // 10 of 10
      expect((await notifications()).filter((n) => n.reference_id === 'ai_credits_per_month')).toHaveLength(2);
      expect((await emails()).length).toBe(2);
    });

    it('a system email (usage alert, reset) is never blocked by an exhausted email allowance', async () => {
      await setAllowance('email', 0);
      await setAllowance('sms', 1);
      await meterUsage(testEnv, TENANT_ID, 'sms'); // 1 of 1: jumps straight to 100%, only the 100% alert is sent
      expect(await emails()).toHaveLength(1);
      expect((await emails())[0].subject).toContain('used all');
    });
  });

  describe('call minutes', () => {
    beforeAll(async () => {
      expect((await call('POST', '/integrations/channels', admin, { channel: 'voice', address: AGENCY_NUMBER, provider: 'twilio', label: 'R110 line' })).status).toBe(201);
      await db(`INSERT OR REPLACE INTO voip_settings (id, voip_provider, routing_strategy, default_caller_id) VALUES ('r110-voip', 'twilio', 'assigned', ?)`, AGENCY_NUMBER).run();
    });

    const grantMinutes = (units: number) =>
      db(
        `INSERT INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source) VALUES (?, ?, 'call_minutes_100', 1, ?, ?, 'super_admin_grant')`,
        `r110-cm-${units}-${Math.random().toString(16).slice(2)}`, TENANT_ID, units, currentPeriodKey(),
      ).run();

    it('a completed call adds ceil(duration / 60) minutes once, however often the callback repeats', async () => {
      await grantMinutes(100);
      await db(
        `INSERT INTO call_logs (id, direction, from_number, to_number, status, provider_call_id) VALUES ('r110-call', 'outbound', ?, '+919000007001', 'in-progress', 'CA-r110')`,
        AGENCY_NUMBER,
      ).run();
      const fields = { CallSid: 'CA-r110', CallStatus: 'completed', CallDuration: '61', To: '+919000007001', From: AGENCY_NUMBER };
      expect((await webhook('/status-callback', fields)).status).toBe(200);
      expect((await webhook('/status-callback', fields)).status).toBe(200);
      expect(await usage('call_minutes_per_month')).toBe(2);
    });

    it('POST /calls/outbound is refused with 402 once the minutes are used up; the call in progress is not cut', async () => {
      await grantMinutes(2);
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await recordUsage(testEnv, TENANT_ID, 'call_minute', 2, 'call:r110-fill');
      const res = await call('POST', '/calls/outbound', admin, { toNumber: '+919000007001' });
      expect(res.status).toBe(402);
      expect(((await res.json()) as any)).toMatchObject({ code: 'ALLOWANCE_EXHAUSTED', channel: 'call_minute', used: 2, allowance: 2 });
      expect(fetchSpy).not.toHaveBeenCalled();
      // a finished call may take the counter past the allowance: it already happened
      await recordUsage(testEnv, TENANT_ID, 'call_minute', 3, 'call:r110-over');
      expect(await usage('call_minutes_per_month')).toBe(5);
    });
  });
});
