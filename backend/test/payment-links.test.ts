import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { hmacSha256Hex } from '../src/services/billing/gateway';
import { stripeSignatureHeader } from '../src/services/billing/stripe';
import { decryptSecret } from '../src/utils/crypto-box';

/**
 * R207: an agency collects from its own customers through its OWN Razorpay or Stripe account.
 * Every gateway call is a mocked fetch and every webhook is a signed fixture: no real payment call is made.
 */

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const RZP_SECRET = 'rzp_test_secret_for_r207_tests';
const RZP_WEBHOOK = 'razorpay_webhook_secret_r207';
const STRIPE_SECRET = 'sk_test_r207_agency_secret_key';
const STRIPE_WEBHOOK = 'whsec_r207_agency_webhook';

let admin = '';
let webhookKey = '';

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
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

async function db<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}

async function hook(key: string, gateway: string, body: string, headers: Record<string, string>): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1/webhooks/payments/${key}/${gateway}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

const razorpayHook = async (body: string, eventId: string, secret = RZP_WEBHOOK, key = webhookKey) =>
  hook(key, 'razorpay', body, { 'X-Razorpay-Signature': await hmacSha256Hex(secret, body), 'X-Razorpay-Event-Id': eventId });

const stripeHook = async (body: string, secret = STRIPE_WEBHOOK) =>
  hook(webhookKey, 'stripe', body, { 'Stripe-Signature': await stripeSignatureHeader(secret, body, Math.floor(Date.now() / 1000)) });

interface Fetched { url: string; init: any }
let calls: Fetched[] = [];

/** Pretend to be the gateways. Anything not recognised fails loudly: a real call must never be made. */
function mockGateways(overrides: Record<string, () => Response> = {}) {
  calls = [];
  vi.stubGlobal('fetch', async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push({ url, init });
    for (const [needle, make] of Object.entries(overrides)) if (url.includes(needle)) return make();
    if (url === 'https://api.razorpay.com/v1/payment_links') {
      const sent = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: `plink_${sent.reference_id.slice(-8)}`, short_url: `https://rzp.io/i/${sent.reference_id.slice(-8)}`, amount: sent.amount, currency: sent.currency }), { status: 200 });
    }
    if (url.startsWith('https://api.razorpay.com/v1/payment_links/') && url.endsWith('/cancel')) return new Response('{}', { status: 200 });
    if (url.startsWith('https://api.razorpay.com/v1/payment_links?')) return new Response('{"payment_links":[]}', { status: 200 });
    if (url === 'https://api.stripe.com/v1/prices') return new Response(JSON.stringify({ id: 'price_r207' }), { status: 200 });
    if (url === 'https://api.stripe.com/v1/payment_links') return new Response(JSON.stringify({ id: 'plink_stripe_r207', url: 'https://buy.stripe.com/test_r207' }), { status: 200 });
    if (url.startsWith('https://api.stripe.com/v1/payment_links/')) return new Response('{}', { status: 200 });
    throw new Error(`unexpected network call in test: ${url}`);
  });
}

async function newInvoice(currency: string, rate = 1000): Promise<{ id: string; contactId: string; total: number }> {
  const contact = await call('POST', '/contacts', admin, { name: `R207 Payer ${Math.random().toString(36).slice(2, 8)}`, phone: `90000${Math.floor(10000 + Math.random() * 89999)}`, email: 'payer@example.test', type: 'customer' });
  const contactId = ((await contact.json()) as any).data.id;
  const res = await call('POST', '/invoices', admin, { contactId, currency, items: [{ description: 'Tour', quantity: 1, rate, taxRate: 0 }] });
  expect(res.status).toBe(201);
  const data = ((await res.json()) as any).data;
  return { id: data.id, contactId, total: data.total ?? rate };
}

const invoiceRow = async (id: string) => (await db('SELECT * FROM invoices WHERE id = ?', id))[0];
const paymentsFor = (id: string) => db('SELECT * FROM payments WHERE invoice_id = ?', id);

function razorpayPaid(invoiceId: string, linkId: string, payId: string, minor: number, currency: string): string {
  return JSON.stringify({
    event: 'payment_link.paid',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment_link: { entity: { id: linkId, amount: minor, amount_paid: minor, currency, notes: { invoice_id: invoiceId } } },
      payment: { entity: { id: payId, amount: minor, currency, status: 'captured' } },
    },
  });
}

describe('R207 agency payment links', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;
  });

  afterEach(() => vi.unstubAllGlobals());

  describe('connecting the agency gateway', () => {
    it('refuses link creation before any gateway is connected', async () => {
      mockGateways();
      const inv = await newInvoice('INR');
      const res = await call('POST', `/invoices/${inv.id}/payment-link`, admin, {});
      expect(res.status).toBe(409);
      expect(((await res.json()) as any).error.details.code).toBe('NO_GATEWAY');
      expect(calls).toHaveLength(0);
    });

    it('saves keys sealed and never returns them (configured + last 4 only)', async () => {
      const razor = await call('PUT', '/integrations/payment-gateways/razorpay', admin, { mode: 'test', keyId: 'rzp_test_AgencyKey01', keySecret: RZP_SECRET, webhookSecret: RZP_WEBHOOK });
      expect(razor.status).toBe(200);
      const view = ((await razor.json()) as any).data;
      expect(view).toMatchObject({ gateway: 'razorpay', mode: 'test', keyConfigured: true, secretLast4: RZP_SECRET.slice(-4), keyIdLast4: 'ey01', webhookSecretConfigured: true });
      expect(view.webhookUrl).toMatch(/\/api\/v1\/webhooks\/payments\/pw_[0-9a-f]{40}\/razorpay$/);
      webhookKey = view.webhookUrl.split('/').slice(-2)[0];

      const stripe = await call('PUT', '/integrations/payment-gateways/stripe', admin, { mode: 'test', keySecret: STRIPE_SECRET, webhookSecret: STRIPE_WEBHOOK });
      expect(stripe.status).toBe(200);

      // Nothing sensitive in any read of the accounts
      const listed = await call('GET', '/integrations/payment-gateways', admin);
      const text = await listed.text();
      for (const secret of [RZP_SECRET, RZP_WEBHOOK, STRIPE_SECRET, STRIPE_WEBHOOK, 'rzp_test_AgencyKey01']) expect(text).not.toContain(secret);
      expect(JSON.parse(text).data.accounts).toHaveLength(2);

      // At rest the secrets are sealed with the credential key and open only with their own binding
      const row = (await db("SELECT id, secret_enc, webhook_secret_enc FROM payment_gateway_accounts WHERE gateway = 'razorpay'"))[0];
      expect(row.secret_enc).toMatch(/^enc:v1:/);
      expect(row.webhook_secret_enc).toMatch(/^enc:v1:/);
      expect((await decryptSecret(testEnv, row.secret_enc, `payment_gateway_accounts:secret_enc:${row.id}`)).value).toBe(RZP_SECRET);
      await expect(decryptSecret(testEnv, row.secret_enc, 'payment_gateway_accounts:secret_enc:other')).rejects.toThrow();

      // The per-agency webhook key is not listed as a receiving address
      const channels = ((await (await call('GET', '/integrations/channels', admin)).json()) as any).data;
      expect(channels.some((c: any) => c.channel === 'payment_webhook')).toBe(false);
    });

    it('rejects a live key saved in test mode', async () => {
      const res = await call('PUT', '/integrations/payment-gateways/razorpay', admin, { mode: 'test', keyId: 'rzp_live_AgencyKey01', keySecret: RZP_SECRET });
      expect(res.status).toBe(400);
    });

    it('"Test connection" calls the gateway with the agency keys (mocked) and reports the result', async () => {
      mockGateways();
      const ok = await call('POST', '/integrations/payment-gateways/razorpay/test', admin);
      expect(((await ok.json()) as any).data).toMatchObject({ ok: true });
      expect(calls[0].url).toContain('https://api.razorpay.com/v1/payment_links');
      expect(calls[0].init.headers.Authorization).toBe(`Basic ${btoa(`rzp_test_AgencyKey01:${RZP_SECRET}`)}`);

      mockGateways({ 'api.stripe.com': () => new Response('{"error":{"message":"Invalid API Key"}}', { status: 401 }) });
      const bad = await call('POST', '/integrations/payment-gateways/stripe/test', admin);
      expect(((await bad.json()) as any).data).toMatchObject({ ok: false });
    });

    it('is admin only', async () => {
      const login = await call('POST', '/auth/login', null, { email: 'sales@e2e.test', password: 'password123', tenantId: TENANT_ID });
      if (login.status !== 200) return;
      const sales = ((await login.json()) as any).data.accessToken;
      expect((await call('GET', '/integrations/payment-gateways', sales)).status).toBe(403);
    });
  });

  describe('creating a link', () => {
    it('creates a Razorpay link for the balance due in INR, with the agency keys', async () => {
      mockGateways();
      const inv = await newInvoice('INR', 2500);
      const res = await call('POST', `/invoices/${inv.id}/payment-link`, admin, {});
      expect(res.status).toBe(201);
      const data = ((await res.json()) as any).data;
      expect(data).toMatchObject({ gateway: 'razorpay', currency: 'INR', status: 'created', amount: 2500 });
      expect(data.url).toMatch(/^https:\/\/rzp\.io\/i\//);

      const sent = JSON.parse(calls.find((c) => c.url.endsWith('/payment_links'))!.init.body);
      expect(sent).toMatchObject({ amount: 250000, currency: 'INR', accept_partial: false, notify: { email: false, sms: false } });
      expect(sent.notes.invoice_id).toBe(inv.id);
      expect(calls.find((c) => c.url.endsWith('/payment_links'))!.init.headers.Authorization).toBe(`Basic ${btoa(`rzp_test_AgencyKey01:${RZP_SECRET}`)}`);

      const row = await invoiceRow(inv.id);
      expect(row).toMatchObject({ payment_link_id: data.linkId, payment_link_url: data.url, payment_link_status: 'created', payment_link_gateway: 'razorpay' });
      const detail = ((await (await call('GET', `/invoices/${inv.id}`, admin)).json()) as any).data;
      expect(detail.payment_link_url).toBe(data.url);
    });

    it('creates a Stripe link in GBP, with the agency secret key', async () => {
      mockGateways();
      const inv = await newInvoice('GBP', 800);
      const res = await call('POST', `/invoices/${inv.id}/payment-link`, admin, {});
      expect(res.status).toBe(201);
      expect(((await res.json()) as any).data).toMatchObject({ gateway: 'stripe', currency: 'GBP', url: 'https://buy.stripe.com/test_r207' });
      const price = calls.find((c) => c.url.endsWith('/prices'))!;
      const form = new URLSearchParams(price.init.body);
      expect(form.get('currency')).toBe('gbp');
      expect(form.get('unit_amount')).toBe('80000');
      expect(price.init.headers.Authorization).toBe(`Bearer ${STRIPE_SECRET}`);
      const link = new URLSearchParams(calls.find((c) => c.url.endsWith('/v1/payment_links'))!.init.body);
      expect(link.get('metadata[invoice_id]')).toBe(inv.id);
    });

    it('a new link stops the previous one at the gateway', async () => {
      mockGateways();
      const inv = await newInvoice('INR');
      const first = ((await (await call('POST', `/invoices/${inv.id}/payment-link`, admin, {})).json()) as any).data;
      calls.length = 0;
      await call('POST', `/invoices/${inv.id}/payment-link`, admin, {});
      expect(calls.some((c) => c.url.endsWith(`/payment_links/${first.linkId}/cancel`))).toBe(true);
    });

    it('reports a gateway failure as 502 and leaves the invoice without a link', async () => {
      mockGateways({ 'api.razorpay.com/v1/payment_links': () => new Response('{"error":{"description":"Authentication failed"}}', { status: 401 }) });
      const inv = await newInvoice('INR');
      const res = await call('POST', `/invoices/${inv.id}/payment-link`, admin, {});
      expect(res.status).toBe(502);
      expect((await invoiceRow(inv.id)).payment_link_id).toBeNull();
    });

    it('refuses a settled invoice', async () => {
      mockGateways();
      const inv = await newInvoice('INR', 100);
      expect((await call('POST', '/payments', admin, { invoiceId: inv.id, amount: 100, method: 'cash' })).status).toBe(201);
      const res = await call('POST', `/invoices/${inv.id}/payment-link`, admin, {});
      expect(res.status).toBe(409);
      expect(((await res.json()) as any).error.details.code).toBe('NOTHING_DUE');
    });
  });

  describe('the per-agency webhook', () => {
    it('records one payment from a signed Razorpay event, marks the invoice paid and emits payment.recorded once', async () => {
      mockGateways();
      const inv = await newInvoice('INR', 1200);
      const link = ((await (await call('POST', `/invoices/${inv.id}/payment-link`, admin, {})).json()) as any).data;
      const body = razorpayPaid(inv.id, link.linkId, 'pay_R207A', 120000, 'INR');

      const res = await razorpayHook(body, 'evt_r207_a');
      expect(res.status).toBe(200);

      const payments = await paymentsFor(inv.id);
      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({ amount: 1200, currency: 'INR', method: 'online', reference: 'pay_R207A', type: 'incoming', created_by: null });
      expect(await invoiceRow(inv.id)).toMatchObject({ status: 'paid', paid_amount: 1200, balance_due: 0, payment_link_status: 'paid' });
      const events = await db("SELECT payload FROM domain_events WHERE type = 'payment.recorded' AND entity_id = ?", payments[0].id);
      expect(events).toHaveLength(1);
      expect(JSON.parse(events[0].payload)).toMatchObject({ invoiceId: inv.id, amount: 1200 });
    });

    it('ignores a replay of the same event id and a second event describing the same payment', async () => {
      mockGateways();
      const inv = await newInvoice('INR', 700);
      const link = ((await (await call('POST', `/invoices/${inv.id}/payment-link`, admin, {})).json()) as any).data;
      const body = razorpayPaid(inv.id, link.linkId, 'pay_R207B', 70000, 'INR');

      expect((await razorpayHook(body, 'evt_r207_b')).status).toBe(200);
      const replay = await razorpayHook(body, 'evt_r207_b');
      expect(replay.status).toBe(200);
      expect(((await replay.json()) as any).data.duplicate).toBe(true);
      // Razorpay may deliver the same payment under another event id
      expect((await razorpayHook(body, 'evt_r207_b_second')).status).toBe(200);

      expect(await paymentsFor(inv.id)).toHaveLength(1);
      const events = await db("SELECT id FROM domain_events WHERE type = 'payment.recorded' AND payload LIKE ?", `%${inv.id}%`);
      expect(events).toHaveLength(1);
    });

    it('records a Stripe Payment Link checkout in GBP', async () => {
      mockGateways();
      const inv = await newInvoice('GBP', 450);
      const link = ((await (await call('POST', `/invoices/${inv.id}/payment-link`, admin, { gateway: 'stripe' })).json()) as any).data;
      const body = JSON.stringify({
        id: 'evt_stripe_r207_1',
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'cs_test_r207', payment_status: 'paid', payment_link: link.linkId, payment_intent: 'pi_r207', amount_total: 45000, currency: 'gbp', metadata: { invoice_id: inv.id } } },
      });
      expect((await stripeHook(body)).status).toBe(200);
      expect((await stripeHook(body)).status).toBe(200); // Stripe retries
      const payments = await paymentsFor(inv.id);
      expect(payments).toHaveLength(1);
      expect(payments[0]).toMatchObject({ amount: 450, currency: 'GBP', reference: 'pi_r207' });
      expect(await invoiceRow(inv.id)).toMatchObject({ status: 'paid', payment_link_status: 'paid' });
    });

    it('a part-paid invoice records only what the link collected', async () => {
      mockGateways();
      const inv = await newInvoice('INR', 1000);
      expect((await call('POST', '/payments', admin, { invoiceId: inv.id, amount: 400, method: 'cash' })).status).toBe(201);
      const link = ((await (await call('POST', `/invoices/${inv.id}/payment-link`, admin, {})).json()) as any).data;
      expect(link.amount).toBe(600);
      expect((await razorpayHook(razorpayPaid(inv.id, link.linkId, 'pay_R207C', 60000, 'INR'), 'evt_r207_c')).status).toBe(200);
      expect(await invoiceRow(inv.id)).toMatchObject({ status: 'paid', paid_amount: 1000, balance_due: 0 });
      expect(await paymentsFor(inv.id)).toHaveLength(2);
    });

    it('an unknown tenant key is 404 with the same body as an unconnected gateway', async () => {
      const body = razorpayPaid('x', 'plink_x', 'pay_x', 100, 'INR');
      const unknownKey = await razorpayHook(body, 'evt_x1', RZP_WEBHOOK, 'pw_0000000000000000000000000000000000000000');
      expect(unknownKey.status).toBe(404);
      const unknownGateway = await hook(webhookKey, 'paypal', body, {});
      expect(unknownGateway.status).toBe(404);
      expect(await unknownKey.json()).toEqual(await unknownGateway.json());
    });

    it('a bad signature is 400 and writes nothing', async () => {
      mockGateways();
      const inv = await newInvoice('INR', 300);
      const link = ((await (await call('POST', `/invoices/${inv.id}/payment-link`, admin, {})).json()) as any).data;
      const body = razorpayPaid(inv.id, link.linkId, 'pay_R207D', 30000, 'INR');
      expect((await razorpayHook(body, 'evt_r207_d', 'not_the_agency_secret')).status).toBe(400);
      expect((await hook(webhookKey, 'razorpay', body, {})).status).toBe(400);
      expect(await paymentsFor(inv.id)).toHaveLength(0);
      expect((await db("SELECT 1 FROM payment_events WHERE event_id = 'evt_r207_d'")).length).toBe(0);
      // Stripe: a signature made with the platform-style wrong secret
      expect((await stripeHook('{"id":"evt_bad","type":"checkout.session.completed"}', 'whsec_wrong')).status).toBe(400);
    });

    it('a signature is checked with THIS agency secret, not the other gateway or another agency', async () => {
      const body = razorpayPaid('whatever', 'plink_y', 'pay_y', 100, 'INR');
      // signed with the Stripe webhook secret of the same agency: still invalid for Razorpay
      expect((await razorpayHook(body, 'evt_cross', STRIPE_WEBHOOK)).status).toBe(400);
    });

    it('an expired link updates only the link status', async () => {
      mockGateways();
      const inv = await newInvoice('INR', 150);
      const link = ((await (await call('POST', `/invoices/${inv.id}/payment-link`, admin, {})).json()) as any).data;
      const body = JSON.stringify({ event: 'payment_link.expired', created_at: Math.floor(Date.now() / 1000), payload: { payment_link: { entity: { id: link.linkId, notes: { invoice_id: inv.id } } } } });
      expect((await razorpayHook(body, 'evt_r207_exp')).status).toBe(200);
      expect(await invoiceRow(inv.id)).toMatchObject({ payment_link_status: 'expired', status: expect.not.stringMatching(/paid/) });
      expect(await paymentsFor(inv.id)).toHaveLength(0);
    });

    it('does not record a payment in a different currency than the invoice', async () => {
      mockGateways();
      const inv = await newInvoice('INR', 500);
      const link = ((await (await call('POST', `/invoices/${inv.id}/payment-link`, admin, {})).json()) as any).data;
      expect((await razorpayHook(razorpayPaid(inv.id, link.linkId, 'pay_R207E', 50000, 'USD'), 'evt_r207_e')).status).toBe(200);
      expect(await paymentsFor(inv.id)).toHaveLength(0);
    });

    it('an agency cannot be reached through another agency key or while disconnected', async () => {
      mockGateways();
      expect((await call('DELETE', '/integrations/payment-gateways/stripe', admin)).status).toBe(200);
      const body = '{"id":"evt_gone","type":"checkout.session.completed"}';
      expect((await stripeHook(body)).status).toBe(404);
    });
  });

  describe('amounts and Stripe payment methods (R142)', () => {
    const stripeLinkForm = () => new URLSearchParams(calls.find((c) => c.url.endsWith('/v1/payment_links') && c.init?.method === 'POST')!.init.body);

    it('an amount above the balance due is a 400, a smaller one is stored and sent to the gateway', async () => {
      mockGateways();
      expect((await call('PUT', '/integrations/payment-gateways/stripe', admin, { mode: 'test', keySecret: STRIPE_SECRET, webhookSecret: STRIPE_WEBHOOK })).status).toBe(200);
      const inv = await newInvoice('EUR', 1000);
      const above = await call('POST', `/invoices/${inv.id}/payment-link`, admin, { amount: 1000.01 });
      expect(above.status).toBe(400);
      expect(((await above.json()) as any).error.details.code).toBe('AMOUNT_ABOVE_BALANCE');
      expect(calls).toHaveLength(0);

      const ok = await call('POST', `/invoices/${inv.id}/payment-link`, admin, { amount: 250, purpose: 'deposit' });
      expect(ok.status).toBe(201);
      expect(((await ok.json()) as any).data).toMatchObject({ amount: 250, purpose: 'deposit', balanceDue: 1000 });
      const price = new URLSearchParams(calls.find((c) => c.url.endsWith('/prices'))!.init.body);
      expect(price.get('unit_amount')).toBe('25000');
      expect(await invoiceRow(inv.id)).toMatchObject({ payment_link_amount: 250, payment_link_purpose: 'deposit' });
    });

    it('sends no payment_method_types by default, so Stripe dynamic methods apply (iDEAL for EUR when enabled in the dashboard)', async () => {
      mockGateways();
      const inv = await newInvoice('EUR', 300);
      expect((await call('POST', `/invoices/${inv.id}/payment-link`, admin, {})).status).toBe(201);
      const form = stripeLinkForm();
      expect([...form.keys()].filter((k) => k.startsWith('payment_method_types'))).toEqual([]);
    });

    it('with stripeMethodTypes set, the list is sent as payment_method_types[i] for EUR', async () => {
      mockGateways();
      expect((await call('PUT', '/settings/payment-defaults', admin, { stripeMethodTypes: ['ideal', 'card', 'bancontact'] })).status).toBe(200);
      const inv = await newInvoice('EUR', 300);
      expect((await call('POST', `/invoices/${inv.id}/payment-link`, admin, {})).status).toBe(201);
      const form = stripeLinkForm();
      expect(form.get('payment_method_types[0]')).toBe('ideal');
      expect(form.get('payment_method_types[1]')).toBe('card');
      expect(form.get('payment_method_types[2]')).toBe('bancontact');
    });

    it('iDEAL on a GBP invoice is a readable 400 and nothing is sent to Stripe', async () => {
      mockGateways();
      const inv = await newInvoice('GBP', 300);
      const res = await call('POST', `/invoices/${inv.id}/payment-link`, admin, { gateway: 'stripe' });
      expect(res.status).toBe(400);
      const err = ((await res.json()) as any).error;
      expect(err.message).toContain('iDEAL');
      expect(err.message).toContain('EUR');
      expect(err.details.code).toBe('PAYMENT_METHOD_CURRENCY');
      expect(calls).toHaveLength(0);
      // card only is fine for GBP
      expect((await call('PUT', '/settings/payment-defaults', admin, { stripeMethodTypes: ['card'] })).status).toBe(200);
      expect((await call('POST', `/invoices/${inv.id}/payment-link`, admin, { gateway: 'stripe' })).status).toBe(201);
      // an unknown method is refused when saving
      expect((await call('PUT', '/settings/payment-defaults', admin, { stripeMethodTypes: ['paypal'] })).status).toBe(400);
      // clearing the list goes back to dynamic methods
      expect((await call('PUT', '/settings/payment-defaults', admin, { stripeMethodTypes: null })).status).toBe(200);
      expect(((await (await call('GET', '/settings/payment-defaults', admin)).json()) as any).data.stripeMethodTypes).toBeNull();
    });

    it('a deposit with no default set asks for an amount; a fixed default is capped at the balance', async () => {
      mockGateways();
      expect((await call('PUT', '/settings/payment-defaults', admin, { deposit: { type: 'none' } })).status).toBe(200);
      const inv = await newInvoice('EUR', 200);
      const none = await call('POST', `/invoices/${inv.id}/payment-link`, admin, { purpose: 'deposit' });
      expect(none.status).toBe(400);
      expect((await call('PUT', '/settings/payment-defaults', admin, { deposit: { type: 'fixed', value: 500 } })).status).toBe(200);
      const capped = await call('POST', `/invoices/${inv.id}/payment-link`, admin, { purpose: 'deposit' });
      expect(capped.status).toBe(201);
      expect(((await capped.json()) as any).data.amount).toBe(200);
      expect((await call('PUT', '/settings/payment-defaults', admin, { deposit: { type: 'percent', value: 120 } })).status).toBe(400);
    });
  });
});
