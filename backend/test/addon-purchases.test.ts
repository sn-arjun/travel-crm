import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { signAccessToken } from '../src/utils/jwt';
import { bumpCatalogueVersion, getAllowance, getCatalogue, seatLimit, currentPeriodKey } from '../src/services/plans/catalogue';
import { hmacSha256Hex } from '../src/services/billing/gateway';
import { stripeSignatureHeader } from '../src/services/billing/stripe';
import { signedMockEvent } from '../src/services/billing/mock';

/**
 * R206: self-serve add-ons. Every payment here is a mocked fetch or a signed fixture webhook: no real gateway is called.
 */

const testEnv = env as any;
const SEED_TENANT = '00000000-0000-0000-0000-000000000000';
const STRIPE_SECRET = 'whsec_test_only_stripe_r206';
const RAZORPAY_SECRET = 'test_only_razorpay_webhook_secret_r206';
const SUB_ID = 'r206-sub-seed';

async function master<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}
const one = async <T = Record<string, any>>(sql: string, ...binds: unknown[]) => (await master<T>(sql, ...binds))[0];

let adminToken = '';
const fetchCalls: Array<{ url: string; body: string }> = [];

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function webhook(gateway: string, body: string, headers: Record<string, string>): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1/billing/webhooks/${gateway}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function razorpayPaid(orderId: string, eventId: string, rupees: number, opts: { type?: string } = {}): Promise<Response> {
  const body = JSON.stringify({
    event: opts.type ?? 'payment_link.paid',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment_link: { entity: { id: `plink_${orderId.slice(-6)}`, reference_id: orderId, amount_paid: Math.round(rupees * 100), notes: { tenant_id: SEED_TENANT, addon_order_id: orderId } } },
      payment: { entity: { id: `pay_${eventId}`, amount: Math.round(rupees * 100), currency: 'INR', notes: {} } },
    },
  });
  return webhook('razorpay', body, { 'X-Razorpay-Signature': await hmacSha256Hex(RAZORPAY_SECRET, body), 'X-Razorpay-Event-Id': eventId });
}

async function stripeSessionEvent(type: string, eventId: string, orderId: string, amountMinor: number, currency = 'gbp'): Promise<Response> {
  const body = JSON.stringify({
    id: eventId,
    object: 'event',
    type,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `cs_${eventId}`,
        mode: 'payment',
        payment_status: type === 'checkout.session.completed' ? 'paid' : 'unpaid',
        client_reference_id: SEED_TENANT,
        amount_total: amountMinor,
        currency,
        payment_intent: `pi_${eventId}`,
        metadata: { tenant_id: SEED_TENANT, addon_order_id: orderId },
      },
    },
  });
  return webhook('stripe', body, { 'Stripe-Signature': await stripeSignatureHeader(STRIPE_SECRET, body, Math.floor(Date.now() / 1000)) });
}

function stubProviders() {
  vi.stubGlobal('fetch', async (input: any, init?: any) => {
    const url = String(typeof input === 'string' ? input : input.url);
    fetchCalls.push({ url, body: String(init?.body ?? '') });
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (url.endsWith('/payment_links')) return json({ id: 'plink_test_1', short_url: 'https://rzp.io/i/addon1' });
    if (url.startsWith('https://api.stripe.com/v1/checkout/sessions')) return json({ id: 'cs_test_addon', url: 'https://checkout.stripe.test/c/pay/cs_test_addon', customer: 'cus_addon_1' });
    return new Response('unexpected', { status: 500 });
  });
}

async function setTenant(country: string | null, plan = 'pro', status = 'active') {
  await master('UPDATE tenants SET country = ?, plan = ?, status = ?, max_users = 15 WHERE id = ?', country, plan, status, SEED_TENANT);
  await testEnv.CACHE.delete(`tenant:v2:${SEED_TENANT}`);
}

async function setSubscription(status: 'active' | 'trial', daysLeft: number) {
  await master('DELETE FROM subscriptions WHERE id = ?', SUB_ID);
  const end = new Date(Date.now() + daysLeft * 86400_000).toISOString();
  await master(
    `INSERT INTO subscriptions (id, tenant_id, plan, amount, billing_cycle, start_date, next_billing_date, current_period_end, status, created_at)
     VALUES (?, ?, 'pro', 18000, 'yearly', '2026-10-01T00:00:00Z', ?, ?, ?, '2099-01-01T00:00:00Z')`,
    SUB_ID, SEED_TENANT, end, end, status,
  );
}

async function resetAddonState() {
  await master('DELETE FROM tenant_addons WHERE tenant_id = ?', SEED_TENANT);
  await master('DELETE FROM addon_orders WHERE tenant_id = ?', SEED_TENANT);
  await master('DELETE FROM platform_invoices WHERE tenant_id = ?', SEED_TENANT);
}

async function checkout(productKey: string, quantity: number, idempotencyKey?: string) {
  const res = await call('POST', '/billing/addons/checkout', { productKey, quantity, ...(idempotencyKey ? { idempotencyKey } : {}) });
  return { res, json: (await res.json()) as any };
}

describe('self-serve add-on purchases (R206)', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    const reset = createExecutionContext();
    expect((await worker.fetch(new Request('http://localhost/api/v1/test/reset', { method: 'POST' }), testEnv, reset)).status).toBe(200);
    await waitOnExecutionContext(reset);
    Object.assign(testEnv, {
      STRIPE_SECRET_KEY: 'sk_test_fake_never_used',
      STRIPE_WEBHOOK_SECRET: STRIPE_SECRET,
      RAZORPAY_KEY_ID: 'rzp_test_fake',
      RAZORPAY_KEY_SECRET: 'rzp_secret_fake',
      RAZORPAY_WEBHOOK_SECRET: RAZORPAY_SECRET,
    });
    adminToken = await signAccessToken({ userId: '11111111-1111-1111-1111-111111111111', tenantId: SEED_TENANT, role: 'admin', email: 'admin@e2e.test' }, testEnv.JWT_SECRET);

    // A UK market for the Stripe tests: a Pro price, an SMS provider cost and the packs priced from it.
    await master(`DELETE FROM plan_prices WHERE id = '0196a206-9999-7000-8000-000000000001'`);
    await master(`DELETE FROM plan_prices WHERE market = 'WEST' AND plan_key = 'pro'`);
    await master(
      `INSERT INTO plan_prices (id, plan_key, market, currency, yearly_price, included_users, extra_user_yearly_price, is_active, valid_from)
       VALUES ('0196a206-9999-7000-8000-000000000001', 'pro', 'WEST', 'GBP', 200, 10, 20, 1, '2026-10-01T00:00:00Z')`,
    );
    await master(`DELETE FROM comm_unit_costs WHERE id = '0196a206-9999-7000-8000-000000000002'`);
    await master(
      `INSERT INTO comm_unit_costs (id, channel, market, provider, unit_cost, currency, margin_pct, effective_from, is_active)
       VALUES ('0196a206-9999-7000-8000-000000000002', 'sms', 'WEST', 'Twilio', 0.05, 'GBP', 20, '2026-10-01T00:00:00Z', 1)`,
    );
    await master(`DELETE FROM addon_products WHERE key IN ('sms_100_west', 'ai_credit_pack_5000_west')`);
    await master(
      `INSERT INTO addon_products (key, name, kind, channel, units, fixed_price, currency, market, is_active) VALUES ('sms_100_west', '100 SMS', 'comm_pack', 'sms', 100, NULL, 'GBP', 'WEST', 1)`,
    );
    await master(
      `INSERT INTO addon_products (key, name, kind, channel, units, fixed_price, currency, market, is_active) VALUES ('ai_credit_pack_5000_west', '5,000 AI credits', 'ai_credit_pack', NULL, 5000, 4, 'GBP', 'WEST', 1)`,
    );
    await bumpCatalogueVersion(testEnv);
  });

  beforeEach(async () => {
    stubProviders();
    await resetAddonState();
    await setTenant('IN');
    await setSubscription('active', 200);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    fetchCalls.length = 0;
    // Restore any catalogue edit a test made.
    await master(`UPDATE comm_unit_costs SET unit_cost = 8.06, margin_pct = 20 WHERE channel = 'sms' AND market = 'IN'`);
    await master(`UPDATE addon_products SET fixed_price = NULL WHERE key = 'sms_100'`);
    await bumpCatalogueVersion(testEnv);
  });

  afterAll(async () => {
    await resetAddonState();
    await master('DELETE FROM subscriptions WHERE id = ?', SUB_ID);
    await setTenant(null);
    await master(`DELETE FROM addon_products WHERE key IN ('sms_100_west', 'ai_credit_pack_5000_west')`);
    await master(`DELETE FROM comm_unit_costs WHERE id = '0196a206-9999-7000-8000-000000000002'`);
    await master(`DELETE FROM plan_prices WHERE id = '0196a206-9999-7000-8000-000000000001'`);
    await bumpCatalogueVersion(testEnv);
  });

  it('quotes sms_100 in India as 100 x unit cost x 1.2 and follows a unit-cost change (nothing is hardcoded)', async () => {
    let res = await call('GET', '/billing/addons/quote?productKey=sms_100&quantity=1');
    expect(res.status).toBe(200);
    let q = ((await res.json()) as any).data;
    // 100 x Rs 8.06 x 1.2 = Rs 967.20, then 18% GST from the tax engine
    expect(q.currency).toBe('INR');
    expect(q.unitPrice).toBeCloseTo(100 * 8.06 * 1.2, 2);
    expect(q.subtotal).toBeCloseTo(967.2, 2);
    expect(q.taxTotal).toBeCloseTo(967.2 * 0.18, 1);
    expect(q.total).toBeCloseTo(967.2 * 1.18, 1);

    // The provider raised its price: the next quote follows with no code change.
    await master(`UPDATE comm_unit_costs SET unit_cost = 10 WHERE channel = 'sms' AND market = 'IN'`);
    await bumpCatalogueVersion(testEnv);
    res = await call('GET', '/billing/addons/quote?productKey=sms_100&quantity=2');
    q = ((await res.json()) as any).data;
    expect(q.unitPrice).toBeCloseTo(1200, 2);
    expect(q.subtotal).toBeCloseTo(2400, 2);
  });

  it('never sells a communication pack below cost + 20%, even if the margin or fixed price is lowered', async () => {
    await master(`UPDATE comm_unit_costs SET margin_pct = 2 WHERE channel = 'sms' AND market = 'IN'`);
    await master(`UPDATE addon_products SET fixed_price = 50 WHERE key = 'sms_100'`);
    await bumpCatalogueVersion(testEnv);
    const q = ((await (await call('GET', '/billing/addons/quote?productKey=sms_100&quantity=1')).json()) as any).data;
    expect(q.unitPrice).toBeCloseTo(967.2, 2);
  });

  it('lists the add-ons with live prices for the agency market, and nothing for a market with no price rows', async () => {
    const data = ((await (await call('GET', '/billing/addons')).json()) as any).data;
    const keys = data.products.map((p: any) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['sms_100', 'whatsapp_1000', 'otp_100', 'ai_credit_pack_5000', 'extra_user']));
    expect(keys).not.toContain('sms_100_west');
    expect(data.products.find((p: any) => p.key === 'ai_credit_pack_5000')).toMatchObject({ available: true, unitPrice: 250, currency: 'INR' });
    expect(data.configured).toBe(true);

    // Singapore has no add-on or plan price rows: 409, and the gateway is never called
    await setTenant('SG');
    const { res, json } = await checkout('sms_100', 1);
    expect(res.status).toBe(409);
    expect(json.code).toBe('PRICE_NOT_CONFIGURED');
    expect(fetchCalls).toHaveLength(0);
  });

  it('Razorpay: starts a Payment Link for the exact total, a retry with the same key reuses it, and the paid webhook credits the pack once', async () => {
    const { res, json } = await checkout('sms_100', 2, 'r206-sms-key-1');
    expect(res.status).toBe(200);
    expect(json.data.gateway).toBe('razorpay');
    expect(json.data.url).toBe('https://rzp.io/i/addon1');
    const order = json.data.order;
    expect(order).toMatchObject({ productKey: 'sms_100', quantity: 2, unitsGranted: 200, status: 'pending', currency: 'INR' });
    expect(fetchCalls).toHaveLength(1);
    const link = JSON.parse(fetchCalls[0].body);
    expect(fetchCalls[0].url).toBe('https://api.razorpay.com/v1/payment_links');
    expect(link.amount).toBe(Math.round(order.total * 100));
    expect(link.reference_id).toBe(order.id);
    expect(link.notes).toMatchObject({ tenant_id: SEED_TENANT, addon_order_id: order.id });

    // Same idempotency key: the same order and link, no second provider call, no second order
    const again = await checkout('sms_100', 2, 'r206-sms-key-1');
    expect(again.json.data.replay).toBe(true);
    expect(again.json.data.order.id).toBe(order.id);
    expect(again.json.data.url).toBe('https://rzp.io/i/addon1');
    expect(fetchCalls).toHaveLength(1);
    expect((await one('SELECT COUNT(*) AS c FROM addon_orders WHERE tenant_id = ?', SEED_TENANT)).c).toBe(1);

    // Before payment nothing is granted
    const before = await getAllowance(testEnv, SEED_TENANT, 'sms');
    expect((await one('SELECT COUNT(*) AS c FROM tenant_addons WHERE tenant_id = ?', SEED_TENANT)).c).toBe(0);

    // The signed paid event credits 200 SMS to this month
    expect((await razorpayPaid(order.id, 'evt_r206_paid_1', order.total)).status).toBe(200);
    const row = await one('SELECT * FROM tenant_addons WHERE tenant_id = ?', SEED_TENANT);
    expect(row).toMatchObject({ product_key: 'sms_100', quantity: 2, units_granted: 200, period_key: currentPeriodKey(), source: 'purchase', reference: order.id });
    expect(await getAllowance(testEnv, SEED_TENANT, 'sms')).toBe(before + 200);
    const paid = await one('SELECT status, paid_at, invoice_id FROM addon_orders WHERE id = ?', order.id);
    expect(paid.status).toBe('paid');
    expect(paid.paid_at).toBeTruthy();

    // The platform invoice carries the price, the tax from the engine and what was bought
    const invoice = await one('SELECT * FROM platform_invoices WHERE tenant_id = ?', SEED_TENANT);
    expect(invoice).toMatchObject({ id: paid.invoice_id, currency: 'INR', status: 'paid', gateway: 'razorpay', total: order.total, description: '100 SMS x 2' });
    expect(invoice.subtotal).toBeCloseTo(order.subtotal, 2);
    expect(JSON.parse(invoice.tax_lines).length).toBeGreaterThan(0);
    expect(order.total).toBeCloseTo(order.subtotal + order.taxTotal, 2);

    // Replays change nothing: the same event id, and a second event for the same order
    const replay = await razorpayPaid(order.id, 'evt_r206_paid_1', order.total);
    expect(((await replay.json()) as any).data.duplicate).toBe(true);
    const second = await razorpayPaid(order.id, 'evt_r206_paid_2', order.total);
    expect(second.status).toBe(200);
    expect((await one('SELECT COUNT(*) AS c FROM tenant_addons WHERE tenant_id = ?', SEED_TENANT)).c).toBe(1);
    expect((await one('SELECT COUNT(*) AS c FROM platform_invoices WHERE tenant_id = ?', SEED_TENANT)).c).toBe(1);
    expect(await getAllowance(testEnv, SEED_TENANT, 'sms')).toBe(before + 200);

    // The order shows in the list
    const orders = ((await (await call('GET', '/billing/addons/orders')).json()) as any).data.orders;
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ id: order.id, status: 'paid' });
  });

  it('Stripe: Checkout in payment mode for an AI credit pack, priced from the UK catalogue; the paid event credits the credits once', async () => {
    await setTenant('GB');
    const { res, json } = await checkout('ai_credit_pack_5000_west', 3);
    expect(res.status).toBe(200);
    expect(json.data.gateway).toBe('stripe');
    expect(json.data.url).toBe('https://checkout.stripe.test/c/pay/cs_test_addon');
    // GBP 4 x 3, no platform tax outside India
    expect(json.data.order).toMatchObject({ currency: 'GBP', subtotal: 12, taxTotal: 0, total: 12, unitsGranted: 15000 });
    expect(fetchCalls).toHaveLength(1);
    const form = new URLSearchParams(fetchCalls[0].body);
    expect(form.get('mode')).toBe('payment');
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('1200');
    expect(form.get('line_items[0][price_data][currency]')).toBe('gbp');
    expect(form.get('metadata[addon_order_id]')).toBe(json.data.order.id);
    expect(form.get('payment_intent_data[metadata][addon_order_id]')).toBe(json.data.order.id);
    expect(form.get('line_items[0][price_data][recurring][interval]')).toBeNull();

    const orderId = json.data.order.id;
    const base = await getAllowance(testEnv, SEED_TENANT, 'ai_credits');
    expect((await stripeSessionEvent('checkout.session.completed', 'evt_r206_stripe_1', orderId, 1200)).status).toBe(200);
    expect(await getAllowance(testEnv, SEED_TENANT, 'ai_credits')).toBe(base + 15000);
    expect((await stripeSessionEvent('checkout.session.completed', 'evt_r206_stripe_1', orderId, 1200)).status).toBe(200);
    expect((await stripeSessionEvent('checkout.session.completed', 'evt_r206_stripe_2', orderId, 1200)).status).toBe(200);
    expect(await getAllowance(testEnv, SEED_TENANT, 'ai_credits')).toBe(base + 15000);
    // A payment-mode session never touches the subscription
    expect((await one('SELECT status FROM subscriptions WHERE id = ?', SUB_ID)).status).toBe('active');
  });

  it('prices a UK communication pack from the UK unit cost x 1.2', async () => {
    await setTenant('GB');
    const q = ((await (await call('GET', '/billing/addons/quote?productKey=sms_100_west&quantity=1')).json()) as any).data;
    expect(q.currency).toBe('GBP');
    expect(q.unitPrice).toBeCloseTo(100 * 0.05 * 1.2, 2);
  });

  it('a pack bought this month does not carry into next month', async () => {
    const { json } = await checkout('sms_100', 1);
    const order = json.data.order;
    expect((await razorpayPaid(order.id, 'evt_r206_month', order.total)).status).toBe(200);
    const now = new Date();
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
    const thisMonthAllowance = await getAllowance(testEnv, SEED_TENANT, 'sms', currentPeriodKey());
    const nextMonthAllowance = await getAllowance(testEnv, SEED_TENANT, 'sms', nextMonth);
    expect(thisMonthAllowance - nextMonthAllowance).toBe(100);
  });

  it('extra users: the seat limit rises the moment the payment arrives, priced pro rata from the plan, and lapses with the paid year', async () => {
    const limitBefore = await seatLimit(testEnv, SEED_TENANT);
    const catalogue = await getCatalogue(testEnv);
    const yearly = catalogue.plans.find((p) => p.key === 'pro')!.prices.find((p) => p.market === 'IN')!.extraUserYearlyPrice!;

    const { res, json } = await checkout('extra_user', 3);
    expect(res.status).toBe(200);
    const order = json.data.order;
    // 200 of 365 days left: about 55% of the yearly price per user, never more than the full price
    expect(order.unitPrice).toBeGreaterThan(0);
    expect(order.unitPrice).toBeLessThan(yearly);
    expect(order.unitPrice).toBeCloseTo((yearly * 200) / 365, 0);
    expect(await seatLimit(testEnv, SEED_TENANT)).toBe(limitBefore); // not before payment

    expect((await razorpayPaid(order.id, 'evt_r206_users', order.total)).status).toBe(200);
    expect(await seatLimit(testEnv, SEED_TENANT)).toBe(limitBefore + 3);
    expect((await one('SELECT max_users FROM tenants WHERE id = ?', SEED_TENANT)).max_users).toBe(limitBefore + 3);
    const sub = await one('SELECT current_period_end FROM subscriptions WHERE id = ?', SUB_ID);
    const row = await one('SELECT * FROM tenant_addons WHERE tenant_id = ?', SEED_TENANT);
    expect(row).toMatchObject({ product_key: 'extra_user', quantity: 3, source: 'purchase', period_key: null, expires_at: sub.current_period_end });

    // The seats end with the paid year
    await master('UPDATE tenant_addons SET expires_at = ? WHERE id = ?', new Date(Date.now() - 1000).toISOString(), row.id);
    expect(await seatLimit(testEnv, SEED_TENANT)).toBe(limitBefore);
  });

  it('refuses extra users to an agency with no paid plan', async () => {
    await setSubscription('trial', 20);
    await setTenant('IN', 'trial', 'active');
    const { res, json } = await checkout('extra_user', 1);
    expect(res.status).toBe(409);
    expect(json.code).toBe('NO_ACTIVE_SUBSCRIPTION');
    expect(fetchCalls).toHaveLength(0);
  });

  it('a failed payment grants nothing; a later successful retry of the same order still does, once', async () => {
    const { json } = await checkout('whatsapp_1000', 1);
    const order = json.data.order;
    const before = await getAllowance(testEnv, SEED_TENANT, 'whatsapp');

    expect((await razorpayPaid(order.id, 'evt_r206_failed', order.total, { type: 'payment.failed' })).status).toBe(200);
    expect((await one('SELECT status FROM addon_orders WHERE id = ?', order.id)).status).toBe('failed');
    expect((await one('SELECT COUNT(*) AS c FROM tenant_addons WHERE tenant_id = ?', SEED_TENANT)).c).toBe(0);
    expect(await getAllowance(testEnv, SEED_TENANT, 'whatsapp')).toBe(before);
    // A failed Razorpay payment never starts the subscription grace period
    expect((await one('SELECT status, past_due_since FROM subscriptions WHERE id = ?', SUB_ID))).toMatchObject({ status: 'active', past_due_since: null });

    expect((await razorpayPaid(order.id, 'evt_r206_retry', order.total)).status).toBe(200);
    expect(await getAllowance(testEnv, SEED_TENANT, 'whatsapp')).toBe(before + 1000);
    expect((await one('SELECT COUNT(*) AS c FROM tenant_addons WHERE tenant_id = ?', SEED_TENANT)).c).toBe(1);
  });

  it('does not credit a payment whose amount differs from the quote, or an event from the mock gateway that failed', async () => {
    const { json } = await checkout('otp_100', 1);
    const order = json.data.order;
    const before = await getAllowance(testEnv, SEED_TENANT, 'otp');
    expect((await razorpayPaid(order.id, 'evt_r206_short', order.total - 50)).status).toBe(200);
    expect(await getAllowance(testEnv, SEED_TENANT, 'otp')).toBe(before);
    expect((await one('SELECT status FROM addon_orders WHERE id = ?', order.id)).status).toBe('pending');

    // The mock gateway's failed event (unsigned callers cannot send it)
    const failed = await signedMockEvent(testEnv, { type: 'order.failed', tenant_id: SEED_TENANT, order_id: order.id });
    expect((await webhook('mock', failed.body, { 'X-Mock-Signature': failed.signature })).status).toBe(200);
    expect((await one('SELECT status FROM addon_orders WHERE id = ?', order.id)).status).toBe('failed');
    expect(await getAllowance(testEnv, SEED_TENANT, 'otp')).toBe(before);
    const forged = await webhook('mock', failed.body, { 'X-Mock-Signature': 'deadbeef' });
    expect(forged.status).toBe(400);
  });

  it('reports an unconfigured gateway plainly, so the app can fall back to Request top-up', async () => {
    const saved = testEnv.RAZORPAY_KEY_SECRET;
    testEnv.RAZORPAY_KEY_SECRET = '';
    try {
      const { res, json } = await checkout('sms_100', 1);
      expect(res.status).toBe(503);
      expect(json.code).toBe('BILLING_NOT_CONFIGURED');
      const list = ((await (await call('GET', '/billing/addons')).json()) as any).data;
      expect(list.configured).toBe(false);
    } finally {
      testEnv.RAZORPAY_KEY_SECRET = saved;
    }
    expect((await one('SELECT COUNT(*) AS c FROM addon_orders WHERE tenant_id = ?', SEED_TENANT)).c).toBe(0);
  });

  it('rejects an unknown product, a bad quantity and a read-only agency', async () => {
    expect((await checkout('no_such_pack', 1)).res.status).toBe(404);
    expect((await checkout('sms_100', 0)).res.status).toBe(400);
    expect((await checkout('sms_100', 101)).res.status).toBe(400);
    await setTenant('IN', 'pro', 'expired');
    const { res, json } = await checkout('sms_100', 1);
    expect(res.status).toBe(409);
    expect(json.code).toBe('SUBSCRIPTION_EXPIRED');
  });
});
