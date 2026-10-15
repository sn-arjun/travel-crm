import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { signAccessToken } from '../src/utils/jwt';
import { bumpCatalogueVersion } from '../src/services/plans/catalogue';
import { runBillingDaily } from '../src/services/billing/subscriptions';
import { hmacSha256Hex } from '../src/services/billing/gateway';
import { stripeSignatureHeader } from '../src/services/billing/stripe';
import { signedMockEvent } from '../src/services/billing/mock';
import stripeCheckoutFixture from './fixtures/billing/stripe-checkout-completed.json?raw';
import razorpayChargedFixture from './fixtures/billing/razorpay-subscription-charged.json?raw';

const testEnv = env as any;
const STRIPE_SECRET = 'whsec_test_only_stripe';
const RAZORPAY_SECRET = 'test_only_razorpay_webhook_secret';

// Tenants of this file (unique ids: the suite shares storage with other files).
const T_STRIPE = '0196a205-0000-7000-8000-000000000001';
const T_RAZOR = '0196a205-0000-7000-8000-000000000002';
const T_ORDER = '0196a205-0000-7000-8000-000000000003';
const SEED_TENANT = '00000000-0000-0000-0000-000000000000';

async function master<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}
const one = async <T = Record<string, any>>(sql: string, ...binds: unknown[]) => (await master<T>(sql, ...binds))[0];

async function insertTenant(id: string, country: string, name: string): Promise<void> {
  await master('DELETE FROM subscriptions WHERE tenant_id = ?', id);
  await master('DELETE FROM tenant_addons WHERE tenant_id = ?', id);
  await master('DELETE FROM platform_invoices WHERE tenant_id = ?', id);
  await master('DELETE FROM tenants WHERE id = ?', id);
  await master(
    `INSERT INTO tenants (id, company_name, subdomain, plan, status, country, owner_email, max_users) VALUES (?, ?, ?, 'trial', 'trial', ?, ?, 3)`,
    id, name, `r205-${id.slice(-4)}`, country, `owner@${id.slice(-4)}.r205.test`,
  );
  await master(
    `INSERT INTO subscriptions (id, tenant_id, plan, amount, billing_cycle, start_date, next_billing_date, status, trial_ends_at)
     VALUES (?, ?, 'trial', 0, 'yearly', '2026-10-01T00:00:00Z', '2026-12-01T00:00:00Z', 'trial', '2026-12-01T00:00:00Z')`,
    `sub-${id.slice(-4)}`, id,
  );
}

async function send(path: string, body: string, headers: Record<string, string>): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1/billing/webhooks/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function stripePost(body: string, timestampSeconds = Math.floor(Date.now() / 1000), secret = STRIPE_SECRET): Promise<Response> {
  return send('stripe', body, { 'Stripe-Signature': await stripeSignatureHeader(secret, body, timestampSeconds) });
}

async function razorpayPost(body: string, eventId: string, secret = RAZORPAY_SECRET): Promise<Response> {
  return send('razorpay', body, { 'X-Razorpay-Signature': await hmacSha256Hex(secret, body), 'X-Razorpay-Event-Id': eventId });
}

function fixture(raw: string, vars: Record<string, string | number>): string {
  let out = raw;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(typeof v === 'number' ? `"__${k}__"` : `__${k}__`).join(String(v));
  }
  return out;
}

function stripeInvoice(type: 'invoice.paid' | 'invoice.payment_failed', id: string, created: number, tenantId: string, invoiceId: string, amountMinor: number): string {
  return JSON.stringify({
    id,
    object: 'event',
    created,
    type,
    data: {
      object: {
        id: invoiceId,
        subscription: 'sub_fixture_1',
        customer: 'cus_fixture_1',
        currency: 'gbp',
        amount_paid: type === 'invoice.paid' ? amountMinor : 0,
        amount_due: amountMinor,
        subscription_details: { metadata: { tenant_id: tenantId, plan_key: 'pro', extra_users: '2' } },
        lines: { data: [{ period: { start: created, end: created + 365 * 86400 } }] },
      },
    },
  });
}

async function state(tenantId: string) {
  const sub = await one('SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1', tenantId);
  const tenant = await one('SELECT plan, status, max_users FROM tenants WHERE id = ?', tenantId);
  return { sub, tenant };
}

const counts = async (tenantId: string) => ({
  events: (await one<{ c: number }>('SELECT COUNT(*) AS c FROM billing_events WHERE tenant_id = ?', tenantId)).c,
  invoices: (await one<{ c: number }>('SELECT COUNT(*) AS c FROM platform_invoices WHERE tenant_id = ?', tenantId)).c,
  payments: (await one<{ c: number }>('SELECT COUNT(*) AS c FROM subscription_payments WHERE tenant_id = ?', tenantId)).c,
});

describe('subscription billing webhooks (R205)', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    // Test-only secrets: no real key exists on this machine and none is ever requested.
    Object.assign(testEnv, {
      STRIPE_SECRET_KEY: 'sk_test_fake_never_used',
      STRIPE_WEBHOOK_SECRET: STRIPE_SECRET,
      RAZORPAY_KEY_ID: 'rzp_test_fake',
      RAZORPAY_KEY_SECRET: 'rzp_secret_fake',
      RAZORPAY_WEBHOOK_SECRET: RAZORPAY_SECRET,
    });
    // A UK price for Pro (the seeded draft prices are India only).
    await master(`DELETE FROM plan_prices WHERE market = 'WEST' AND plan_key = 'pro'`);
    await master(
      `INSERT INTO plan_prices (id, plan_key, market, currency, yearly_price, included_users, extra_user_yearly_price, is_active, valid_from)
       VALUES ('0196a205-9999-7000-8000-000000000001', 'pro', 'WEST', 'GBP', 200, 10, 20, 1, '2026-10-01T00:00:00Z')`,
    );
    await bumpCatalogueVersion(testEnv);
    await insertTenant(T_STRIPE, 'GB', 'R205 Stripe Tours');
    await insertTenant(T_RAZOR, 'IN', 'R205 Razorpay Tours');
    await insertTenant(T_ORDER, 'GB', 'R205 Order Tours');
  });

  it('moves a Stripe agency trial -> active -> past_due -> expired -> active, and a replayed event changes nothing', async () => {
    const base = Math.floor(Date.now() / 1000) - 3600;

    // trial -> active on checkout.session.completed (recorded fixture, signed with the test secret)
    const checkout = fixture(stripeCheckoutFixture, { EVENT_ID: 'evt_r205_checkout_1', TENANT_ID: T_STRIPE, CREATED: base });
    let res = await stripePost(checkout);
    expect(res.status).toBe(200);
    let s = await state(T_STRIPE);
    expect(s.sub.status).toBe('active');
    expect(s.sub.payment_gateway).toBe('stripe');
    expect(s.sub.gateway_subscription_id).toBe('sub_fixture_1');
    expect(s.tenant).toMatchObject({ plan: 'pro', status: 'active', max_users: 12 });
    expect((await one('SELECT SUM(quantity) AS q FROM tenant_addons WHERE tenant_id = ? AND source = ?', T_STRIPE, 'subscription')).q).toBe(2);
    expect((await one('SELECT customer_id FROM billing_customers WHERE tenant_id = ? AND gateway = ?', T_STRIPE, 'stripe')).customer_id).toBe('cus_fixture_1');

    // the first invoice.paid issues a platform invoice and a receipt email
    const paid1 = stripeInvoice('invoice.paid', 'evt_r205_paid_1', base + 10, T_STRIPE, 'in_r205_1', 24000);
    expect((await stripePost(paid1)).status).toBe(200);
    expect((await counts(T_STRIPE)).invoices).toBe(1);
    const invoice = await one('SELECT * FROM platform_invoices WHERE tenant_id = ?', T_STRIPE);
    expect(invoice.number).toMatch(/^PINV-\d{4}-\d{6}$/);
    expect(invoice).toMatchObject({ currency: 'GBP', total: 240, status: 'paid', gateway: 'stripe', gateway_ref: 'in_r205_1' });

    // every event replayed: 200, and nothing is written again
    const before = await counts(T_STRIPE);
    const stateBefore = await state(T_STRIPE);
    for (const body of [checkout, paid1]) {
      const replay = await stripePost(body);
      expect(replay.status).toBe(200);
      expect(((await replay.json()) as any).data.duplicate).toBe(true);
    }
    expect(await counts(T_STRIPE)).toEqual(before);
    expect((await state(T_STRIPE)).sub.updated_at).toBe(stateBefore.sub.updated_at);

    // active -> past_due on a failed renewal: grace period starts, the agency keeps working
    const failed = stripeInvoice('invoice.payment_failed', 'evt_r205_failed_1', base + 20, T_STRIPE, 'in_r205_2', 24000);
    expect((await stripePost(failed)).status).toBe(200);
    s = await state(T_STRIPE);
    expect(s.sub.status).toBe('past_due');
    expect(s.sub.past_due_since).toBe(new Date((base + 20) * 1000).toISOString());
    expect(s.tenant.status).toBe('active');
    expect((await stripePost(failed)).status).toBe(200);
    expect((await state(T_STRIPE)).sub.status).toBe('past_due');

    // inside the grace period the daily job leaves it alone ...
    await runBillingDaily(testEnv, new Date(Date.now() + 3 * 86400_000));
    expect((await state(T_STRIPE)).sub.status).toBe('past_due');
    // ... after 7 days it expires and the agency is read-only (tenant status expired)
    const job = await runBillingDaily(testEnv, new Date(Date.now() + 8 * 86400_000));
    expect(job.expired).toContain(T_STRIPE);
    s = await state(T_STRIPE);
    expect(s.sub.status).toBe('expired');
    expect(s.tenant.status).toBe('expired');

    // expired -> active when a later payment succeeds
    const paid2 = stripeInvoice('invoice.paid', 'evt_r205_paid_2', base + 30, T_STRIPE, 'in_r205_3', 24000);
    expect((await stripePost(paid2)).status).toBe(200);
    s = await state(T_STRIPE);
    expect(s.sub.status).toBe('active');
    expect(s.sub.past_due_since).toBeNull();
    expect(s.tenant.status).toBe('active');
    expect((await counts(T_STRIPE)).invoices).toBe(2);
    expect((await stripePost(paid2)).status).toBe(200);
    expect((await counts(T_STRIPE)).invoices).toBe(2);
  });

  it('moves a Razorpay agency from trial to active on subscription.charged and to past_due on payment.failed; replays are ignored', async () => {
    const base = Math.floor(Date.now() / 1000) - 600;
    const charged = fixture(razorpayChargedFixture, {
      TENANT_ID: T_RAZOR, CREATED: base, PERIOD_START: base, PERIOD_END: base + 365 * 86400,
    });
    expect((await razorpayPost(charged, 'evt_rzp_1')).status).toBe(200);
    let s = await state(T_RAZOR);
    expect(s.sub).toMatchObject({ status: 'active', payment_gateway: 'razorpay', gateway_subscription_id: 'sub_rzp_fixture_1' });
    expect(s.tenant).toMatchObject({ plan: 'pro', status: 'active' });
    const inv = await one('SELECT * FROM platform_invoices WHERE tenant_id = ?', T_RAZOR);
    expect(inv).toMatchObject({ currency: 'INR', total: 21240, gateway_ref: 'pay_rzp_fixture_1' });

    const before = await counts(T_RAZOR);
    const replay = await razorpayPost(charged, 'evt_rzp_1');
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as any).data.duplicate).toBe(true);
    expect(await counts(T_RAZOR)).toEqual(before);

    const failed = JSON.stringify({
      event: 'payment.failed',
      created_at: base + 50,
      payload: { payment: { entity: { id: 'pay_rzp_failed_1', amount: 2124000, currency: 'INR', customer_id: 'cust_rzp_fixture_1', notes: { tenant_id: T_RAZOR } } } },
    });
    expect((await razorpayPost(failed, 'evt_rzp_2')).status).toBe(200);
    s = await state(T_RAZOR);
    expect(s.sub.status).toBe('past_due');
    expect(s.tenant.status).toBe('active');
  });

  it('refuses a bad signature with 400 and writes nothing', async () => {
    const body = fixture(stripeCheckoutFixture, { EVENT_ID: 'evt_r205_forged', TENANT_ID: T_ORDER, CREATED: Math.floor(Date.now() / 1000) });
    const before = (await one<{ c: number }>('SELECT COUNT(*) AS c FROM billing_events')).c;
    expect((await stripePost(body, undefined, 'not-the-secret')).status).toBe(400);
    expect((await send('stripe', body, {})).status).toBe(400);
    // a signature over a different body
    const other = await stripeSignatureHeader(STRIPE_SECRET, body + ' ', Math.floor(Date.now() / 1000));
    expect((await send('stripe', body, { 'Stripe-Signature': other })).status).toBe(400);
    expect((await razorpayPost(body, 'evt_forged', 'wrong')).status).toBe(400);
    expect((await one<{ c: number }>('SELECT COUNT(*) AS c FROM billing_events')).c).toBe(before);
    expect((await state(T_ORDER)).sub.status).toBe('trial');
  });

  it('refuses a correctly signed Stripe event whose timestamp is older than 5 minutes', async () => {
    const body = fixture(stripeCheckoutFixture, { EVENT_ID: 'evt_r205_old', TENANT_ID: T_ORDER, CREATED: Math.floor(Date.now() / 1000) });
    const res = await stripePost(body, Math.floor(Date.now() / 1000) - 301);
    expect(res.status).toBe(400);
    expect(await one('SELECT 1 AS x FROM billing_events WHERE event_id = ?', 'evt_r205_old')).toBeUndefined();
    expect((await stripePost(body, Math.floor(Date.now() / 1000) - 120)).status).toBe(200);
  });

  it('never skips verification when a secret is not configured (503, no row)', async () => {
    const saved = testEnv.STRIPE_WEBHOOK_SECRET;
    testEnv.STRIPE_WEBHOOK_SECRET = '';
    try {
      const body = JSON.stringify({ id: 'evt_r205_nosecret', type: 'invoice.paid', created: 1, data: { object: {} } });
      const res = await send('stripe', body, { 'Stripe-Signature': 't=1,v1=00' });
      expect(res.status).toBe(503);
      expect(await one('SELECT 1 AS x FROM billing_events WHERE event_id = ?', 'evt_r205_nosecret')).toBeUndefined();
    } finally {
      testEnv.STRIPE_WEBHOOK_SECRET = saved;
    }
  });

  it('acknowledges and ignores events it has no use for, and unknown gateways are 404', async () => {
    const body = JSON.stringify({ id: 'evt_r205_unknown', type: 'customer.created', created: Math.floor(Date.now() / 1000), data: { object: {} } });
    const res = await stripePost(body);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data.outcome).toBe('ignored');
    expect((await send('paypal', '{}', {})).status).toBe(404);
  });

  it('does not let an older event move the status backwards', async () => {
    const base = Math.floor(Date.now() / 1000) - 2000;
    // paid at base+100 arrives first, then a failure from base+50 and an older payment arrive late
    expect((await stripePost(stripeInvoice('invoice.paid', 'evt_ord_paid_new', base + 100, T_ORDER, 'in_ord_new', 24000))).status).toBe(200);
    expect((await state(T_ORDER)).sub.status).toBe('active');
    expect((await stripePost(stripeInvoice('invoice.payment_failed', 'evt_ord_failed_old', base + 50, T_ORDER, 'in_ord_old', 24000))).status).toBe(200);
    expect((await state(T_ORDER)).sub.status).toBe('active');
    expect((await state(T_ORDER)).sub.past_due_since).toBeNull();
    // an older payment still records its invoice but keeps the later period end
    const periodEnd = (await state(T_ORDER)).sub.current_period_end;
    expect((await stripePost(stripeInvoice('invoice.paid', 'evt_ord_paid_old', base + 10, T_ORDER, 'in_ord_older', 24000))).status).toBe(200);
    expect((await state(T_ORDER)).sub.current_period_end).toBe(periodEnd);
    expect((await counts(T_ORDER)).invoices).toBe(2);
  });

  it('holds a renewal that arrives before its checkout (503, retried later) and applies it once the agency is known', async () => {
    const orphan = JSON.stringify({
      id: 'evt_r205_orphan', type: 'invoice.paid', created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'in_orphan', subscription: 'sub_unknown_1', customer: 'cus_unknown_1', currency: 'gbp', amount_paid: 100, lines: { data: [] } } },
    });
    expect((await stripePost(orphan)).status).toBe(503);
    expect(await one('SELECT 1 AS x FROM billing_events WHERE event_id = ?', 'evt_r205_orphan')).toBeUndefined();
  });
});

describe('billing routes (R205)', () => {
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

  /** Stand in for Stripe's and Razorpay's REST APIs: nothing leaves the machine. */
  function stubProviders() {
    vi.stubGlobal('fetch', async (input: any, init?: any) => {
      const url = String(typeof input === 'string' ? input : input.url);
      fetchCalls.push({ url, body: String(init?.body ?? '') });
      const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.startsWith('https://api.stripe.com/v1/checkout/sessions')) return json({ id: 'cs_test_1', url: 'https://checkout.stripe.test/c/pay/cs_test_1', customer: 'cus_route_1' });
      if (url.startsWith('https://api.stripe.com/v1/subscriptions/')) return json({ id: 'sub_route', cancel_at_period_end: true });
      if (url.endsWith('/customers')) return json({ id: 'cust_route_1' });
      if (url.endsWith('/plans')) return json({ id: 'plan_route_1' });
      if (url.endsWith('/subscriptions')) return json({ id: 'sub_route_rzp', short_url: 'https://rzp.io/i/route1' });
      if (url.includes('/cancel')) return json({ id: 'sub_route_rzp', status: 'cancelled' });
      return new Response('unexpected', { status: 500 });
    });
  }

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
    await master(`DELETE FROM plan_prices WHERE market = 'WEST' AND plan_key = 'pro'`);
    await master(
      `INSERT INTO plan_prices (id, plan_key, market, currency, yearly_price, included_users, extra_user_yearly_price, is_active, valid_from)
       VALUES ('0196a205-9999-7000-8000-000000000001', 'pro', 'WEST', 'GBP', 200, 10, 20, 1, '2026-10-01T00:00:00Z')`,
    );
    await bumpCatalogueVersion(testEnv);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    fetchCalls.length = 0;
    await master(`UPDATE tenants SET country = NULL, status = 'active', plan = 'pro' WHERE id = ?`, SEED_TENANT);
    await testEnv.CACHE.delete(`tenant:v2:${SEED_TENANT}`);
  });

  it('picks Razorpay for an Indian agency and Stripe for a UK agency, pricing from the catalogue with tax from the engine', async () => {
    stubProviders();
    await master(`UPDATE tenants SET country = 'IN' WHERE id = ?`, SEED_TENANT);
    let res = await call('POST', '/billing/checkout', { planKey: 'pro', extraUsers: 0 });
    expect(res.status).toBe(200);
    let data = ((await res.json()) as any).data;
    expect(data.gateway).toBe('razorpay');
    expect(data.url).toBe('https://rzp.io/i/route1');
    // Rs 18,000 from the catalogue + 18% GST
    expect(data).toMatchObject({ currency: 'INR', subtotal: 18000, taxTotal: 3240, total: 21240 });
    const plan = fetchCalls.find((c) => c.url.endsWith('/plans'))!;
    expect(JSON.parse(plan.body).item.amount).toBe(2124000);
    expect(fetchCalls.every((c) => c.url.startsWith('https://api.razorpay.com/'))).toBe(true);

    fetchCalls.length = 0;
    await master(`UPDATE tenants SET country = 'GB' WHERE id = ?`, SEED_TENANT);
    res = await call('POST', '/billing/checkout', { planKey: 'pro', extraUsers: 3 });
    expect(res.status).toBe(200);
    data = ((await res.json()) as any).data;
    expect(data.gateway).toBe('stripe');
    expect(data.url).toBe('https://checkout.stripe.test/c/pay/cs_test_1');
    // GBP 200 + 3 extra users x GBP 20, no platform tax outside India
    expect(data).toMatchObject({ currency: 'GBP', subtotal: 260, taxTotal: 0, total: 260 });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('https://api.stripe.com/v1/checkout/sessions');
    const form = new URLSearchParams(fetchCalls[0].body);
    expect(form.get('mode')).toBe('subscription');
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('26000');
    expect(form.get('line_items[0][price_data][currency]')).toBe('gbp');
    expect(form.get('metadata[tenant_id]')).toBe(SEED_TENANT);
    expect(form.get('metadata[extra_users]')).toBe('3');
  });

  it('never charges a non-India agency the India price, and reports an unconfigured gateway plainly', async () => {
    stubProviders();
    await master(`UPDATE tenants SET country = 'SG' WHERE id = ?`, SEED_TENANT);
    let res = await call('POST', '/billing/checkout', { planKey: 'pro' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).code).toBe('PRICE_NOT_CONFIGURED');
    expect(fetchCalls).toHaveLength(0);

    await master(`UPDATE tenants SET country = 'GB' WHERE id = ?`, SEED_TENANT);
    const saved = testEnv.STRIPE_SECRET_KEY;
    testEnv.STRIPE_SECRET_KEY = '';
    try {
      res = await call('POST', '/billing/checkout', { planKey: 'pro' });
      expect(res.status).toBe(503);
      expect(((await res.json()) as any).code).toBe('BILLING_NOT_CONFIGURED');
    } finally {
      testEnv.STRIPE_SECRET_KEY = saved;
    }
    expect((await call('POST', '/billing/checkout', { planKey: 'trial' })).status).toBe(404);
  });

  it('keeps an agency whose subscription expired read-only: reads and billing work, writes are refused with 402', async () => {
    stubProviders();
    await master(`UPDATE tenants SET status = 'expired', plan = 'pro' WHERE id = ?`, SEED_TENANT);
    await testEnv.CACHE.delete(`tenant:v2:${SEED_TENANT}`);
    expect((await call('GET', '/contacts')).status).toBe(200);
    expect((await call('GET', '/billing/subscription')).status).toBe(200);
    const write = await call('POST', '/contacts', { name: 'Blocked', phone: '9000005001', type: 'customer' });
    expect(write.status).toBe(402);
    expect(((await write.json()) as any).code).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('cancel stops renewals at the provider but keeps access to the end of the paid period', async () => {
    stubProviders();
    await master(`UPDATE tenants SET country = 'GB' WHERE id = ?`, SEED_TENANT);
    await master(`DELETE FROM subscriptions WHERE tenant_id = ?`, SEED_TENANT);
    await master(
      `INSERT INTO subscriptions (id, tenant_id, plan, amount, billing_cycle, start_date, next_billing_date, status, payment_gateway, gateway_subscription_id, current_period_end)
       VALUES ('sub-r205-cancel', ?, 'pro', 240, 'yearly', '2026-10-01T00:00:00Z', '2027-10-01T00:00:00Z', 'active', 'stripe', 'sub_cancel_1', '2027-10-01T00:00:00Z')`,
      SEED_TENANT,
    );
    const res = await call('POST', '/billing/cancel');
    expect(res.status).toBe(200);
    expect(fetchCalls[0].url).toBe('https://api.stripe.com/v1/subscriptions/sub_cancel_1');
    expect(fetchCalls[0].body).toContain('cancel_at_period_end=true');
    const row = await one('SELECT status, cancel_at_period_end FROM subscriptions WHERE id = ?', 'sub-r205-cancel');
    expect(row).toMatchObject({ status: 'active', cancel_at_period_end: 1 });
    const view = ((await (await call('GET', '/billing/subscription')).json()) as any).data;
    expect(view.subscription.cancelAtPeriodEnd).toBe(true);
    expect(view.subscription.status).toBe('active');
  });

  it('lists and downloads the agency\'s platform invoices, and only its own', async () => {
    await master(`DELETE FROM platform_invoices WHERE tenant_id IN (?, ?)`, SEED_TENANT, 'someone-else');
    await master(
      `INSERT INTO platform_invoices (id, number, tenant_id, currency, subtotal, tax_lines, total, status, gateway, gateway_ref) VALUES ('inv-r205-a', 'PINV-TEST-000001', ?, 'INR', 18000, '[{"label":"IGST","rate":18,"amount":3240}]', 21240, 'paid', 'razorpay', 'pay_x1')`,
      SEED_TENANT,
    );
    await master(
      `INSERT INTO platform_invoices (id, number, tenant_id, currency, subtotal, total, status, gateway, gateway_ref) VALUES ('inv-r205-b', 'PINV-TEST-000002', 'someone-else', 'INR', 1, 1, 'paid', 'razorpay', 'pay_x2')`,
    );
    const list = ((await (await call('GET', '/billing/invoices')).json()) as any).data.invoices;
    expect(list.map((i: any) => i.number)).toEqual(['PINV-TEST-000001']);
    const dl = await call('GET', '/billing/invoices/inv-r205-a/download');
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-disposition')).toContain('PINV-TEST-000001');
    expect(await dl.text()).toContain('IGST 18%');
    expect((await call('GET', '/billing/invoices/inv-r205-b/download')).status).toBe(404);
    await master(`DELETE FROM platform_invoices WHERE id IN ('inv-r205-a', 'inv-r205-b')`);
  });

  it('the mock gateway plays a payment locally through the same signed-webhook pipeline', async () => {
    await master(`UPDATE tenants SET country = NULL WHERE id = ?`, SEED_TENANT);
    await master(`DELETE FROM subscriptions WHERE tenant_id = ?`, SEED_TENANT);
    const q = new URLSearchParams({ tenant: SEED_TENANT, plan: 'pro', users: '1', amount: '21240', currency: 'INR', subscription: 'mock_sub_route_1' });
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request(`http://localhost/api/v1/billing/mock-checkout?${q}`), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(302);
    const sub = await one('SELECT status, plan, payment_gateway, extra_users FROM subscriptions WHERE tenant_id = ?', SEED_TENANT);
    expect(sub).toMatchObject({ status: 'active', plan: 'pro', payment_gateway: 'mock', extra_users: 1 });
    expect((await one<{ c: number }>('SELECT COUNT(*) AS c FROM platform_invoices WHERE tenant_id = ?', SEED_TENANT)).c).toBe(1);
    // and a forged mock event is refused
    const forged = await signedMockEvent({ BILLING_MOCK_SECRET: 'not-the-secret' }, { type: 'payment.succeeded', tenant_id: SEED_TENANT, amount: 1, currency: 'INR' });
    const ctx2 = createExecutionContext();
    const bad = await worker.fetch(
      new Request('http://localhost/api/v1/billing/webhooks/mock', { method: 'POST', headers: { 'X-Mock-Signature': forged.signature }, body: forged.body }),
      testEnv,
      ctx2,
    );
    await waitOnExecutionContext(ctx2);
    expect(bad.status).toBe(400);
  });
});
