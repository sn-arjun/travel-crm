import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { superAdminToken } from './utils/super-admin';
import { bumpCatalogueVersion, getAllowance, getCatalogue, planAllowance } from '../src/services/plans/catalogue';
import {
  AllowanceExhausted,
  CHANNEL_SPECS,
  getUsageOverview,
  meterUsage,
  nextPlanUp,
  packOffers,
  whatsappMeterChannel,
} from '../src/services/metering/meter';
import { publicPlansView } from '../src/services/plans/view';
import { handleSmsJob } from '../src/queues/sms-queue';
import { processWhatsAppCampaign } from '../src/queues/whatsapp-campaign-queue';
import { clearOutbox } from '../src/services/mail/transactional';

/**
 * R130 (pricing step B): WhatsApp marketing messages are metered on their own allowance (whatsapp_marketing) with their
 * own packs; utility / service templates stay on whatsapp. Allowances can differ by market (plan_allowances.market).
 * The e2e tenant is on the Pro plan in India: whatsapp 750, whatsapp_marketing 200 (PRICING.md 7.3, step B).
 */

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const DE_TENANT = '0196a130-0000-7000-8000-0000000000d1';
const SUPER_ID = '0196a130-0000-7000-8000-0000000000ab';

let admin = '';
let contactId = '';
const queued: any[] = [];
const queueEnv = () => ({ ...testEnv, SMS_QUEUE: { send: async (m: unknown) => { queued.push(m); } }, EMAIL_QUEUE: { send: async () => {} }, CAMPAIGN_QUEUE: { send: async () => {} } });

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = testEnv): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const db = (sql: string, ...binds: unknown[]) => (testEnv.MASTER_DB as D1Database).prepare(sql).bind(...binds);
async function rows<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  return ((await db(sql, ...binds).all()).results ?? []) as T[];
}
async function setAllowance(key: string, amount: number, planKey = 'pro') {
  await db(`UPDATE plan_allowances SET monthly_amount = ? WHERE plan_key = ? AND allowance_key = ? AND market IS NULL`, amount, planKey, key).run();
  await bumpCatalogueVersion(testEnv);
}
async function usage(capKey: string, tenantId = TENANT_ID): Promise<number> {
  const row = await db('SELECT current_usage FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = ?', tenantId, capKey).first<{ current_usage: number }>();
  return row?.current_usage ?? 0;
}
async function resetUsage() {
  await db('DELETE FROM tenant_usage_caps WHERE tenant_id IN (?, ?)', TENANT_ID, DE_TENANT).run();
  await db('DELETE FROM usage_alerts WHERE tenant_id IN (?, ?)', TENANT_ID, DE_TENANT).run();
  await db('DELETE FROM metered_events WHERE tenant_id = ?', TENANT_ID).run();
  await db(`DELETE FROM message_log WHERE id LIKE 'r130-%'`).run();
  await clearOutbox(testEnv);
  queued.length = 0;
}
async function restoreSeed() {
  await db(`UPDATE plan_allowances SET monthly_amount = 750 WHERE plan_key = 'pro' AND allowance_key = 'whatsapp' AND market IS NULL`).run();
  await db(`UPDATE plan_allowances SET monthly_amount = 200 WHERE plan_key = 'pro' AND allowance_key = 'whatsapp_marketing' AND market IS NULL`).run();
  await db(`DELETE FROM plan_allowances WHERE market IS NOT NULL`).run();
  await bumpCatalogueVersion(testEnv);
}
const sendTemplate = (templateId: string) => call('POST', '/communications/send-template', admin, { contact_id: contactId, template_id: templateId }, queueEnv());

describe('WhatsApp marketing and utility are metered apart (R130)', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    await restoreSeed();
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;
    const contact = await call('POST', '/contacts', admin, { name: 'Split Contact', phone: '+91 90000 13001', email: 'split@example.com', type: 'customer' });
    contactId = ((await contact.json()) as any).data.id;
    await db(`INSERT OR REPLACE INTO message_templates (id, channel, name, content, category) VALUES ('r130-marketing', 'whatsapp', 'r130_offer', 'Big offer for {name}', 'offer')`).run();
    await db(`INSERT OR REPLACE INTO message_templates (id, channel, name, content, category) VALUES ('r130-utility', 'whatsapp', 'r130_booking', 'Your booking {name}', 'booking')`).run();
    await db(
      `INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, country, max_users) VALUES (?, 'R130 Germany', 'r130-de', 'pro', 'active', 'DE', 10)`,
      DE_TENANT,
    ).run();
  });

  afterAll(async () => {
    await restoreSeed();
    await resetUsage();
    await db('DELETE FROM tenants WHERE id = ?', DE_TENANT).run();
  });

  beforeEach(async () => {
    await resetUsage();
    await restoreSeed();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('which allowance a message takes', () => {
    it('whatsappMeterChannel: marketing -> whatsapp_marketing, anything else -> whatsapp', () => {
      expect(whatsappMeterChannel('marketing')).toBe('whatsapp_marketing');
      expect(whatsappMeterChannel('utility')).toBe('whatsapp');
      expect(whatsappMeterChannel('service')).toBe('whatsapp');
      expect(whatsappMeterChannel(undefined)).toBe('whatsapp');
    });

    it('the channels are separate specs with separate counters', () => {
      expect(CHANNEL_SPECS.whatsapp).toMatchObject({ allowanceKey: 'whatsapp', capKey: 'whatsapp_per_month' });
      expect(CHANNEL_SPECS.whatsapp_marketing).toMatchObject({ allowanceKey: 'whatsapp_marketing', capKey: 'whatsapp_marketing_per_month' });
    });

    it('Hub: a marketing template takes whatsapp_marketing, a utility template takes whatsapp, and the job says which', async () => {
      expect((await sendTemplate('r130-marketing')).status).toBe(201);
      expect(await usage('whatsapp_marketing_per_month')).toBe(1);
      expect(await usage('whatsapp_per_month')).toBe(0);
      expect(queued[0].data).toMatchObject({ metered: true, meterChannel: 'whatsapp_marketing', whatsappTemplate: { category: 'marketing' } });

      expect((await sendTemplate('r130-utility')).status).toBe(201);
      expect(await usage('whatsapp_marketing_per_month')).toBe(1);
      expect(await usage('whatsapp_per_month')).toBe(1);
      expect(queued[1].data).toMatchObject({ metered: true, meterChannel: 'whatsapp', whatsappTemplate: { category: 'utility' } });
    });

    it('Hub: free-form text and a document are utility (they take whatsapp, never whatsapp_marketing)', async () => {
      const res = await call('POST', '/communications/send', admin, { channel: 'whatsapp', contact_id: contactId, message: 'Hello outside the window' }, queueEnv());
      expect(res.status).toBe(201);
      expect(await usage('whatsapp_per_month')).toBe(1);
      expect(await usage('whatsapp_marketing_per_month')).toBe(0);
      expect(queued[0].data.meterChannel).toBe('whatsapp');
    });

    it('Hub bulk send: a marketing template meters every recipient on the marketing allowance', async () => {
      const res = await call('POST', '/communications/bulk-send', admin, { channel: 'whatsapp', contact_ids: [contactId], template_id: 'r130-marketing' }, queueEnv());
      expect(res.status).toBe(201);
      expect(await usage('whatsapp_marketing_per_month')).toBe(1);
      expect(await usage('whatsapp_per_month')).toBe(0);
      expect(queued[0].data).toMatchObject({ meterChannel: 'whatsapp_marketing' });
    });

    it('a free-form reply inside the 24 hour window counts nothing on either allowance', async () => {
      await setAllowance('whatsapp', 0);
      await db(`INSERT INTO message_log (id, contact_id, channel, content, direction, status, created_at) VALUES ('r130-incoming', ?, 'whatsapp', 'Hi', 'incoming', 'delivered', ?)`, contactId, new Date().toISOString()).run();
      const reply = await call('POST', '/communications/send', admin, { channel: 'whatsapp', contact_id: contactId, message: 'Sure' }, queueEnv());
      expect(reply.status).toBe(201);
      expect(await usage('whatsapp_per_month')).toBe(0);
      expect(await usage('whatsapp_marketing_per_month')).toBe(0);
      expect(queued[0].data).toMatchObject({ metered: true, refundOnFailure: false });
      expect(queued[0].data.meterChannel).toBeUndefined();
    });
  });

  describe('each allowance has its own 402 and its own packs', () => {
    it('marketing cap 1: the second marketing template is a 402 on whatsapp_marketing with marketing packs only; utility still sends', async () => {
      await setAllowance('whatsapp_marketing', 1);
      expect((await sendTemplate('r130-marketing')).status).toBe(201);
      const second = await sendTemplate('r130-marketing');
      expect(second.status).toBe(402);
      const body = (await second.json()) as any;
      expect(body).toMatchObject({ code: 'ALLOWANCE_EXHAUSTED', channel: 'whatsapp_marketing', used: 1, allowance: 1, options: ['upgrade', 'top_up'] });
      expect(body.message).toContain('WhatsApp marketing messages');
      expect(body.addons.map((a: any) => [a.key, a.currency])).toEqual([['whatsapp_marketing_1000_in', 'INR']]);
      expect(body.addons[0].price).toBe(1444.09);
      expect(body.upgradeTo).toMatchObject({ key: 'basic', allowance: 50 }); // the cap was lowered to 1: the next plan up is the cheapest with more
      expect(queued).toHaveLength(1);
      // the utility allowance is untouched
      expect((await sendTemplate('r130-utility')).status).toBe(201);
      expect(await usage('whatsapp_per_month')).toBe(1);
    });

    it('utility cap 1: the second utility template is a 402 on whatsapp with the utility pack only; marketing still sends', async () => {
      await setAllowance('whatsapp', 1);
      expect((await sendTemplate('r130-utility')).status).toBe(201);
      const second = await sendTemplate('r130-utility');
      expect(second.status).toBe(402);
      const body = (await second.json()) as any;
      expect(body).toMatchObject({ code: 'ALLOWANCE_EXHAUSTED', channel: 'whatsapp', used: 1, allowance: 1 });
      expect(body.addons.map((a: any) => a.key)).toEqual(['whatsapp_1000']);
      expect(body.addons[0].price).toBe(171.34);
      expect((await sendTemplate('r130-marketing')).status).toBe(201);
      expect(await usage('whatsapp_marketing_per_month')).toBe(1);
    });

    it('a marketing pack lifts only the marketing allowance; a utility pack only the utility one', async () => {
      const token = await superAdminToken(testEnv, { id: SUPER_ID, email: 'super-r130@platform.test' });
      expect(await getAllowance(testEnv, TENANT_ID, 'whatsapp_marketing')).toBe(200);
      const grant = await call('POST', `/admin/tenants/${TENANT_ID}/addons`, token, { productKey: 'whatsapp_marketing_1000_in' });
      expect(grant.status).toBe(201);
      expect(await getAllowance(testEnv, TENANT_ID, 'whatsapp_marketing')).toBe(1200);
      expect(await getAllowance(testEnv, TENANT_ID, 'whatsapp')).toBe(750);
      await db(`DELETE FROM tenant_addons WHERE tenant_id = ? AND product_key = 'whatsapp_marketing_1000_in'`, TENANT_ID).run();
    });

    it('pack offers are per allowance and per market: UK marketing offers the GBP pack, India never sees it', async () => {
      const catalogue = await getCatalogue(testEnv);
      expect(packOffers(catalogue, 'whatsapp_marketing', 'UK').map((p) => [p.key, p.currency])).toEqual([['whatsapp_marketing_500_uk', 'GBP']]);
      expect(packOffers(catalogue, 'whatsapp', 'UK').map((p) => p.key)).toEqual(['whatsapp_1000_uk']);
      expect(packOffers(catalogue, 'whatsapp_marketing', 'IN').map((p) => p.key)).toEqual(['whatsapp_marketing_1000_in']);
    });

    it('the usage overview lists the two WhatsApp allowances as separate lines', async () => {
      await meterUsage(testEnv, TENANT_ID, 'whatsapp_marketing', 3);
      await meterUsage(testEnv, TENANT_ID, 'whatsapp', 2);
      const overview = await getUsageOverview(testEnv, TENANT_ID);
      const wa = overview.lines.find((l) => l.key === 'whatsapp')!;
      const mk = overview.lines.find((l) => l.key === 'whatsapp_marketing')!;
      expect(wa).toMatchObject({ used: 2, allowance: 750 });
      expect(mk).toMatchObject({ used: 3, allowance: 200 });
      expect(wa.addons.map((a) => a.key)).toEqual(['whatsapp_1000']);
      expect(mk.addons.map((a) => a.key)).toEqual(['whatsapp_marketing_1000_in']);
    });
  });

  describe('queues', () => {
    it('a WhatsApp campaign takes the marketing allowance: 3 recipients with a cap of 1 send 1 and skip 2; utility is untouched', async () => {
      await setAllowance('whatsapp_marketing', 1);
      await db(`DELETE FROM whatsapp_campaigns WHERE id = 'r130-camp'`).run();
      await db(`INSERT INTO whatsapp_campaigns (id, name, status, template_name, template_content, total_recipients) VALUES ('r130-camp', 'R130', 'sending', 'r130_offer', 'Hi {{name}}', 3)`).run();
      for (let i = 1; i <= 3; i++) {
        await db(`INSERT INTO whatsapp_campaign_recipients (id, campaign_id, contact_id, phone, name) VALUES (?, 'r130-camp', ?, ?, 'R')`, `r130-r${i}`, contactId, `+9190000130${i}0`).run();
      }
      await processWhatsAppCampaign({ type: 'whatsapp_campaign', campaignId: 'r130-camp', tenantId: TENANT_ID } as any, testEnv);
      const statuses = await rows(`SELECT status, COUNT(*) AS n FROM whatsapp_campaign_recipients WHERE campaign_id = 'r130-camp' GROUP BY status`);
      expect(Object.fromEntries(statuses.map((r) => [r.status, r.n]))).toEqual({ sent: 1, skipped_allowance: 2 });
      expect((await rows(`SELECT error_message FROM whatsapp_campaign_recipients WHERE status = 'skipped_allowance' AND campaign_id = 'r130-camp'`))[0].error_message).toContain('marketing');
      expect(await usage('whatsapp_marketing_per_month')).toBe(1);
      expect(await usage('whatsapp_per_month')).toBe(0);
    }, 30_000);

    it('an unmetered job (automation) takes the allowance of its template category; one without a template is utility (Twilio rule)', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ sid: 'SM130' }), { status: 201 }));
      await handleSmsJob({ to: '+919000013001', body: 'x', tenantId: TENANT_ID, channel: 'whatsapp', whatsappTemplate: { name: 'r130_offer', language: 'en', category: 'marketing', parameters: [] } }, testEnv);
      expect(await usage('whatsapp_marketing_per_month')).toBe(1);
      expect(await usage('whatsapp_per_month')).toBe(0);
      await handleSmsJob({ to: '+919000013001', body: 'x', tenantId: TENANT_ID, channel: 'whatsapp' }, testEnv);
      expect(await usage('whatsapp_per_month')).toBe(1);
      expect(await usage('whatsapp_marketing_per_month')).toBe(1);
    });

    it('a rejected marketing send gives its unit back to the marketing allowance, not the utility one', async () => {
      await meterUsage(testEnv, TENANT_ID, 'whatsapp', 2); // utility already has 2 used; a wrong refund would take one of them
      await meterUsage(testEnv, TENANT_ID, 'whatsapp_marketing', 1);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'rejected' }), { status: 400 }));
      await db(`INSERT INTO message_log (id, contact_id, channel, content, status) VALUES ('r130-q1', ?, 'whatsapp', 'x', 'queued')`, contactId).run();
      await handleSmsJob(
        { to: '+919000013001', body: 'x', tenantId: TENANT_ID, channel: 'whatsapp', messageLogId: 'r130-q1', metered: true, refundOnFailure: true, meterChannel: 'whatsapp_marketing' },
        testEnv,
      );
      expect(await usage('whatsapp_marketing_per_month')).toBe(0);
      expect(await usage('whatsapp_per_month')).toBe(2);
    });
  });

  describe('allowances by market (plan_allowances.market)', () => {
    const overrideEU = (key: string, amount: number) =>
      db(`INSERT INTO plan_allowances (plan_key, allowance_key, monthly_amount, market) VALUES ('pro', ?, ?, 'EU')`, key, amount).run();

    it('no per-market rows are seeded: PRICING.md names the markets but gives no amounts', async () => {
      expect(await rows(`SELECT 1 FROM plan_allowances WHERE market IS NOT NULL`)).toEqual([]);
      const catalogue = await getCatalogue(testEnv);
      for (const p of catalogue.plans) expect(p.marketAllowances ?? {}).toEqual({});
    });

    it('an agency in a market with its own row gets that amount; other keys and other markets keep the all-markets amount', async () => {
      await overrideEU('whatsapp_marketing', 120);
      await bumpCatalogueVersion(testEnv);
      expect(await getAllowance(testEnv, DE_TENANT, 'whatsapp_marketing')).toBe(120); // Germany is the EU market
      expect(await getAllowance(testEnv, DE_TENANT, 'whatsapp')).toBe(750); // no EU row for this key: the null row
      expect(await getAllowance(testEnv, TENANT_ID, 'whatsapp_marketing')).toBe(200); // India: the null row
      const catalogue = await getCatalogue(testEnv);
      const pro = catalogue.plans.find((p) => p.key === 'pro');
      expect(planAllowance(pro, 'whatsapp_marketing', 'EU')).toBe(120);
      expect(planAllowance(pro, 'whatsapp_marketing', 'IN')).toBe(200);
      expect(planAllowance(pro, 'whatsapp_marketing')).toBe(200);
    });

    it('the meter stops the agency at its market amount and the 402 carries it (and the next plan up in that market)', async () => {
      await overrideEU('whatsapp_marketing', 2);
      await bumpCatalogueVersion(testEnv);
      await meterUsage(testEnv, DE_TENANT, 'whatsapp_marketing');
      await meterUsage(testEnv, DE_TENANT, 'whatsapp_marketing');
      const err = (await meterUsage(testEnv, DE_TENANT, 'whatsapp_marketing').catch((e) => e)) as AllowanceExhausted;
      expect(err).toBeInstanceOf(AllowanceExhausted);
      expect(err.body).toMatchObject({ channel: 'whatsapp_marketing', used: 2, allowance: 2 });
      expect(err.body.addons.map((a) => [a.key, a.currency])).toEqual([['whatsapp_marketing_250_eu', 'EUR']]);
      expect(err.body.upgradeTo).toMatchObject({ key: 'basic', allowance: 50 });
      // an Indian Pro agency still has its 200
      expect((await meterUsage(testEnv, TENANT_ID, 'whatsapp_marketing')).allowance).toBe(200);
    });

    it('nextPlanUp compares amounts in the agency market', async () => {
      await overrideEU('whatsapp_marketing', 900); // Pro in the EU is above Enterprise's 500
      await bumpCatalogueVersion(testEnv);
      const catalogue = await getCatalogue(testEnv);
      expect(nextPlanUp(catalogue, 'pro', 'whatsapp_marketing', 'EU')).toBeNull();
      expect(nextPlanUp(catalogue, 'pro', 'whatsapp_marketing', 'IN')).toMatchObject({ key: 'enterprise', allowance: 500 });
    });

    it('the public plans of a market show that market amounts', async () => {
      await overrideEU('whatsapp_marketing', 120);
      await bumpCatalogueVersion(testEnv);
      const catalogue = await getCatalogue(testEnv);
      const eu = publicPlansView(catalogue, 'EU').plans.find((p) => p.key === 'pro')!;
      const india = publicPlansView(catalogue, 'IN').plans.find((p) => p.key === 'pro')!;
      expect(eu.allowances.whatsapp_marketing).toBe(120);
      expect(india.allowances.whatsapp_marketing).toBe(200);
    });

    it('the super admin sets a market amount with ?market=, which leaves the all-markets amount alone; a second save updates in place', async () => {
      const token = await superAdminToken(testEnv, { id: SUPER_ID, email: 'super-r130@platform.test' });
      const first = await call('PUT', '/admin/catalogue/allowances/pro?market=eu', token, { whatsapp_marketing: 300 });
      expect(first.status).toBe(200);
      expect(((await first.json()) as any).data.whatsapp_marketing).toBe(300);
      const again = await call('PUT', '/admin/catalogue/allowances/pro?market=EU', token, { whatsapp_marketing: 310 });
      expect(again.status).toBe(200);
      expect(await rows(`SELECT monthly_amount, market FROM plan_allowances WHERE plan_key = 'pro' AND allowance_key = 'whatsapp_marketing' ORDER BY market`)).toEqual([
        { monthly_amount: 200, market: null },
        { monthly_amount: 310, market: 'EU' },
      ]);
      const plain = await call('PUT', '/admin/catalogue/allowances/pro', token, { whatsapp_marketing: 210 });
      expect(plain.status).toBe(200);
      expect(await getAllowance(testEnv, DE_TENANT, 'whatsapp_marketing')).toBe(310);
      expect(await getAllowance(testEnv, TENANT_ID, 'whatsapp_marketing')).toBe(210);
    });

    it('the table holds one all-markets row and one row per market for a plan and key', async () => {
      await overrideEU('whatsapp_marketing', 1);
      await expect(overrideEU('whatsapp_marketing', 2)).rejects.toThrow();
      await expect(db(`INSERT INTO plan_allowances (plan_key, allowance_key, monthly_amount, market) VALUES ('pro', 'whatsapp_marketing', 5, NULL)`).run()).rejects.toThrow();
    });
  });
});
