import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { signedMockPaidEvent, loadMockPayLink } from '../src/services/payments/mock-agency';

/**
 * R142: the test gateway for agency payment links. A link opens a pay page served by the API; paying signs an event and runs
 * it through the same pipeline as a real webhook. It exists only where mockAllowed(env) is true: in production every
 * mock route answers 404 and connecting the gateway is refused. No provider is ever contacted.
 */

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
// Production: TEST_MODE off, BILLING_GATEWAY=mock set by mistake - still not allowed.
const prodEnv = { ...testEnv, ENVIRONMENT: 'production', TEST_MODE: 'false', BILLING_GATEWAY: 'mock', ALLOW_SINGLE_TENANT_PRODUCTION: 'true' };

let admin = '';

async function raw(method: string, url: string, init: { token?: string | null; body?: string; type?: string; e?: any } = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (init.type) headers['Content-Type'] = init.type;
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(url, { method, headers, body: init.body, redirect: 'manual' }), init.e ?? testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function call(method: string, path: string, token: string | null, body?: unknown, e?: any): Promise<Response> {
  return raw(method, `http://localhost/api/v1${path}`, { token, body: body === undefined ? undefined : JSON.stringify(body), type: 'application/json', e });
}

async function db<T = Record<string, any>>(sql: string, ...binds: unknown[]): Promise<T[]> {
  const { results } = await testEnv.MASTER_DB.prepare(sql).bind(...binds).all();
  return results as T[];
}

async function newInvoice(currency: string, rate = 1000): Promise<{ id: string }> {
  const contact = await call('POST', '/contacts', admin, { name: `R142 Payer ${Math.random().toString(36).slice(2, 8)}`, phone: `90000${Math.floor(10000 + Math.random() * 89999)}`, email: 'payer-r142@example.test', type: 'customer' });
  const contactId = ((await contact.json()) as any).data.id;
  const res = await call('POST', '/invoices', admin, { contactId, currency, items: [{ description: 'Tour', quantity: 1, rate, taxRate: 0 }] });
  expect(res.status).toBe(201);
  return { id: ((await res.json()) as any).data.id };
}

const invoiceRow = async (id: string) => (await db('SELECT * FROM invoices WHERE id = ?', id))[0];
const paymentsFor = (id: string) => db('SELECT * FROM payments WHERE invoice_id = ?', id);
const pathOf = (url: string) => new URL(url).pathname;

async function makeLink(invoiceId: string, body: Record<string, unknown> = {}) {
  const res = await call('POST', `/invoices/${invoiceId}/payment-link`, admin, { gateway: 'mock', ...body });
  return { res, data: ((await res.clone().json()) as any).data };
}

const pay = (url: string, fields = 'method=ideal&action=pay', e?: any) =>
  raw('POST', `http://localhost${pathOf(url)}`, { body: fields, type: 'application/x-www-form-urlencoded', e });

describe('R142 test gateway for agency payment links', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;
    // Any real network call is a failure.
    vi.stubGlobal('fetch', async (input: any) => {
      throw new Error(`unexpected network call in test: ${typeof input === 'string' ? input : input.url}`);
    });
  });

  afterEach(() => undefined);

  it('connects the test gateway with no secrets and reports mockAvailable', async () => {
    const before = ((await (await call('GET', '/integrations/payment-gateways', admin)).json()) as any).data;
    expect(before.mockAvailable).toBe(true);
    const res = await call('PUT', '/integrations/payment-gateways/mock', admin, {});
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data).toMatchObject({ gateway: 'mock', mode: 'test', isActive: true, keyConfigured: false });
    const row = (await db("SELECT * FROM payment_gateway_accounts WHERE gateway = 'mock'"))[0];
    expect(row).toMatchObject({ secret_enc: null, webhook_secret_enc: null, key_id: null });
    const after = ((await (await call('GET', '/integrations/payment-gateways', admin)).json()) as any).data;
    expect(after.accounts.map((a: any) => a.gateway)).toContain('mock');
  });

  it('a deposit link of 30% on a EUR invoice, a pay page that lists iDEAL, and one payment of the link amount', async () => {
    const put = await call('PUT', '/settings/payment-defaults', admin, { deposit: { type: 'percent', value: 30 } });
    expect(put.status).toBe(200);
    expect(((await (await call('GET', '/settings/payment-defaults', admin)).json()) as any).data.deposit).toEqual({ type: 'percent', value: 30 });

    const inv = await newInvoice('EUR', 1000);
    const { res, data } = await makeLink(inv.id, { purpose: 'deposit' });
    expect(res.status).toBe(201);
    expect(data).toMatchObject({ gateway: 'mock', purpose: 'deposit', amount: 300, currency: 'EUR', status: 'created' });
    expect(data.url).toMatch(/^http:\/\/localhost\/api\/v1\/webhooks\/payments\/mock-pay\/pw_[0-9a-f]{40}\/[0-9a-f-]{36}$/);
    expect(await invoiceRow(inv.id)).toMatchObject({ payment_link_amount: 300, payment_link_purpose: 'deposit', payment_link_gateway: 'mock', payment_link_status: 'created' });
    expect(await loadMockPayLink(testEnv, data.linkId)).toMatchObject({ amount: 300, currency: 'EUR', invoiceId: inv.id, tenantId: TENANT_ID });

    const page = await raw('GET', data.url);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('iDEAL');
    expect(html).toContain('Bancontact');
    expect(html).toContain('300');
    expect(html).not.toContain('UPI');

    const paid = await pay(data.url);
    expect(paid.status).toBe(200);
    expect(await paid.text()).toContain('Payment received');
    const payments = await paymentsFor(inv.id);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amount: 300, currency: 'EUR', method: 'online', reference: `mock_pay_${data.linkId}`, created_by: null });
    expect(payments[0].notes).toContain('(ideal)');
    expect(await invoiceRow(inv.id)).toMatchObject({ status: 'partially_paid', paid_amount: 300, balance_due: 700, payment_link_status: 'paid' });
    const events = await db("SELECT id FROM domain_events WHERE type = 'payment.recorded' AND entity_id = ?", payments[0].id);
    expect(events).toHaveLength(1);

    // A replay of the same submit, and the same signed event delivered to the webhook, change nothing.
    expect((await pay(data.url)).status).toBe(200);
    const link = (await loadMockPayLink(testEnv, data.linkId))!;
    const { body, signature } = await signedMockPaidEvent(testEnv, link, 'ideal');
    const key = data.url.split('/').slice(-2)[0];
    const hook = await raw('POST', `http://localhost/api/v1/webhooks/payments/${key}/mock`, { body, type: 'application/json', e: { ...testEnv } });
    expect(hook.status).toBe(400); // no signature header: refused
    const ctx = createExecutionContext();
    const signed = await worker.fetch(
      new Request(`http://localhost/api/v1/webhooks/payments/${key}/mock`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mock-Signature': signature }, body }),
      testEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(signed.status).toBe(200);
    expect(((await signed.json()) as any).data.duplicate).toBe(true);
    expect(await paymentsFor(inv.id)).toHaveLength(1);

    // The page of a paid link says so instead of offering payment again.
    expect(await (await raw('GET', data.url)).text()).toContain('Payment received');
  });

  it('the balance link after a deposit collects the rest and the invoice becomes paid', async () => {
    const inv = await newInvoice('EUR', 500);
    const dep = (await makeLink(inv.id, { purpose: 'deposit' })).data;
    expect(dep.amount).toBe(150);
    expect((await pay(dep.url)).status).toBe(200);
    expect(await invoiceRow(inv.id)).toMatchObject({ status: 'partially_paid' });

    const bal = (await makeLink(inv.id, { purpose: 'balance' })).data;
    expect(bal).toMatchObject({ amount: 350, purpose: 'balance' });
    expect(bal.linkId).not.toBe(dep.linkId);
    // The deposit link was replaced by the balance link
    expect((await raw('GET', dep.url)).status).toBe(410); // the balance link replaced it
    expect((await pay(bal.url, 'method=card&action=pay')).status).toBe(200);
    expect(await invoiceRow(inv.id)).toMatchObject({ status: 'paid', paid_amount: 500, balance_due: 0 });
    expect(await paymentsFor(inv.id)).toHaveLength(2);
  });

  it('a custom amount is bounded by the balance, and a new link replaces the live one', async () => {
    const inv = await newInvoice('EUR', 400);
    const above = await makeLink(inv.id, { amount: 400.01 });
    expect(above.res.status).toBe(400);
    expect(above.data).toBeUndefined();
    expect(((await above.res.json()) as any).error.details.code).toBe('AMOUNT_ABOVE_BALANCE');
    expect((await makeLink(inv.id, { purpose: 'custom' })).res.status).toBe(400);
    expect((await call('POST', `/invoices/${inv.id}/payment-link`, admin, { gateway: 'mock', amount: 0 })).status).toBe(400);

    const first = (await makeLink(inv.id, { amount: 100 })).data;
    expect(first).toMatchObject({ amount: 100, purpose: 'custom' });
    const second = (await makeLink(inv.id, { amount: 250 })).data;
    // The replaced link can no longer be paid
    expect((await pay(first.url)).status).toBe(410);
    expect(await paymentsFor(inv.id)).toHaveLength(0);
    expect((await pay(second.url)).status).toBe(200);
    expect((await paymentsFor(inv.id))[0]).toMatchObject({ amount: 250 });
  });

  it('INR shows UPI and card; GBP shows pay by bank; other currencies show card only', async () => {
    const inr = (await makeLink((await newInvoice('INR', 900)).id)).data;
    const inrHtml = await (await raw('GET', inr.url)).text();
    expect(inrHtml).toContain('UPI');
    expect(inrHtml).toContain('Card');
    expect(inrHtml).not.toContain('iDEAL');
    const gbp = (await makeLink((await newInvoice('GBP', 900)).id)).data;
    expect(await (await raw('GET', gbp.url)).text()).toContain('Pay by bank');
    const usd = (await makeLink((await newInvoice('USD', 900)).id)).data;
    const usdHtml = await (await raw('GET', usd.url)).text();
    expect(usdHtml).toContain('Card');
    expect(usdHtml).not.toContain('UPI');
    expect(usdHtml).not.toContain('iDEAL');
  });

  it('Fail and Cancel record nothing; the return URL is followed only inside APP_URL', async () => {
    const inv = await newInvoice('EUR', 200);
    const { data } = await makeLink(inv.id);
    expect(await (await pay(data.url, 'action=fail')).text()).toContain('Payment failed');
    expect(await (await pay(data.url, 'action=cancel')).text()).toContain('Payment cancelled');
    expect(await paymentsFor(inv.id)).toHaveLength(0);

    const inside = `http://localhost:3000/invoices/${inv.id}`;
    const failed = await pay(data.url, `action=fail&return=${encodeURIComponent(inside)}`);
    expect(failed.status).toBe(303);
    expect(failed.headers.get('location')).toBe(`${inside}?payment=failed`);

    // Outside APP_URL the address is ignored and the plain page is shown
    const outside = await pay(data.url, `method=ideal&action=pay&return=${encodeURIComponent('https://evil.example/steal')}`);
    expect(outside.status).toBe(200);
    expect(outside.headers.get('location')).toBeNull();
    expect(await outside.text()).toContain('Payment received');
    // A look-alike host that merely starts with APP_URL is outside too
    const inv2 = await newInvoice('EUR', 200);
    const link2 = (await makeLink(inv2.id)).data;
    const look = await pay(link2.url, `action=cancel&return=${encodeURIComponent('http://localhost:3000.evil.example/x')}`);
    expect(look.status).toBe(200);
    expect(look.headers.get('location')).toBeNull();

    // Inside APP_URL a paid return redirects with the status
    const inv3 = await newInvoice('EUR', 200);
    const link3 = (await makeLink(inv3.id)).data;
    const ok = await pay(link3.url, `method=ideal&action=pay&return=${encodeURIComponent(`http://localhost:3000/invoices/${inv3.id}`)}`);
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toBe(`http://localhost:3000/invoices/${inv3.id}?payment=success`);
    // return can also travel in the page URL, and the page carries it into the form
    const link4 = (await makeLink((await newInvoice('EUR', 200)).id)).data;
    const page = await (await raw('GET', `${link4.url}?return=${encodeURIComponent('http://localhost:3000/x')}`)).text();
    expect(page).toContain('name="return"');
    expect(await (await raw('GET', `${link4.url}?return=${encodeURIComponent('https://evil.example')}`)).text()).not.toContain('name="return"');
  });

  it('the page text follows the agency language (Dutch)', async () => {
    await testEnv.MASTER_DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_language', 'nl')").run();
    const { data } = await makeLink((await newInvoice('EUR', 100)).id);
    const html = await (await raw('GET', data.url)).text();
    expect(html).toContain('Betaalmethode');
    expect(html).toContain('lang="nl"');
    await testEnv.MASTER_DB.prepare("DELETE FROM settings WHERE key = 'default_language'").run();
  });

  it('in production every mock route answers 404 and the gateway cannot be connected or used', async () => {
    const inv = await newInvoice('EUR', 300);
    const { data } = await makeLink(inv.id);
    expect(data.url).toBeTruthy();

    expect((await raw('GET', data.url, { e: prodEnv })).status).toBe(404);
    expect((await pay(data.url, 'method=ideal&action=pay', prodEnv)).status).toBe(404);
    expect(await paymentsFor(inv.id)).toHaveLength(0);

    const link = (await loadMockPayLink(testEnv, data.linkId))!;
    const { body, signature } = await signedMockPaidEvent(testEnv, link, 'ideal');
    const key = data.url.split('/').slice(-2)[0];
    const ctx = createExecutionContext();
    const hook = await worker.fetch(
      new Request(`http://localhost/api/v1/webhooks/payments/${key}/mock`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mock-Signature': signature }, body }),
      prodEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(hook.status).toBe(404);
    expect(await paymentsFor(inv.id)).toHaveLength(0);

    // The login in production needs the same tokens: reuse the admin token against the production env
    const connect = await call('PUT', '/integrations/payment-gateways/mock', admin, {}, prodEnv);
    expect(connect.status).toBe(400);
    expect(((await connect.json()) as any).error.details.code).toBe('MOCK_NOT_ALLOWED');
    const listed = ((await (await call('GET', '/integrations/payment-gateways', admin, undefined, prodEnv)).json()) as any).data;
    expect(listed.mockAvailable).toBe(false);
    expect(listed.accounts.map((a: any) => a.gateway)).not.toContain('mock');
    const create = await call('POST', `/invoices/${inv.id}/payment-link`, admin, { gateway: 'mock' }, prodEnv);
    expect(create.status).toBe(400);
  });
});
