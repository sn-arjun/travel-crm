import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { rbac } from '../middleware/rbac';
import { success } from '../utils/response';
import { appUrl } from '../utils/app-urls';
import { formatMoney } from '../utils/money';
import { getCatalogue, activePriceFrom, marketForCountry } from '../services/plans/catalogue';
import { getSeatStatus } from '../services/plans/seats';
import { createGateway, gatewayForCountry, gatewayFromParam } from '../services/billing/registry';
import { GatewayError, gatewayIdForCountry, mockAllowed } from '../services/billing/gateway';
import { MockGateway, signedMockEvent } from '../services/billing/mock';
import {
  BillingError,
  buildQuote,
  currentSubscription,
  ensureSubscription,
  graceDays,
  handleWebhook,
  loadTenant,
  saveQuote,
} from '../services/billing/subscriptions';
import { createOrder, listOffers, listOrders, MIN_COMM_MARGIN_PCT, orderView, quoteAddon } from '../services/billing/addons';
import { generateId } from '../utils/uuid';

/**
 * Subscription billing (R205).
 *
 * Signed in (agency admin):
 *   GET  /billing/subscription          plan, status, renewal date, seats, grace period, the plans on offer
 *   GET  /billing/quote                 price of a plan + extra users with tax, before paying
 *   POST /billing/checkout              start paying: returns the gateway's checkout URL (also used to upgrade or change seats)
 *   POST /billing/cancel                stop renewals; access continues to the end of the paid year
 *   GET  /billing/addons                add-ons on offer with live prices (extra users, AI credit packs, communication packs)
 *   GET  /billing/addons/quote          price of one add-on with tax
 *   POST /billing/addons/checkout       buy an add-on: returns the gateway's one-off checkout URL
 *   GET  /billing/addons/orders         this agency's add-on purchases
 *   GET  /billing/invoices              the platform's invoices to this agency
 *   GET  /billing/invoices/:id/download a printable invoice (HTML)
 *
 * Public (no login; the gateway is the caller, the signature is the credential):
 *   POST /billing/webhooks/:gateway     Stripe / Razorpay / mock events
 *   GET  /billing/mock-checkout         local only (TEST_MODE or BILLING_GATEWAY=mock): plays a payment
 */

function fail(c: Context, status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return c.json({ success: false, code, message, ...extra, error: { code, message, ...extra } }, status as any);
}

function billingError(c: Context, err: unknown) {
  if (err instanceof BillingError) return fail(c, err.status, err.code, err.message);
  if (err instanceof GatewayError) {
    console.error('[billing] gateway error:', err.message);
    return fail(c, 502, 'GATEWAY_ERROR', 'The payment provider could not start the checkout. Try again in a moment.');
  }
  throw err;
}

const NOT_CONFIGURED = 'Online payment is not set up yet. Please contact support to pay by other means.';

// ============================================================================
// Public routes (mounted before authentication)
// ============================================================================

export const billingPublicRoutes = new Hono<AppContext>();

billingPublicRoutes.post('/webhooks/:gateway', async (c) => {
  const gateway = gatewayFromParam(c.env, c.req.param('gateway'));
  if (!gateway) return fail(c, 404, 'UNKNOWN_GATEWAY', 'Unknown payment gateway');
  // The exact bytes the provider signed: read as text before anything parses them.
  const rawBody = await c.req.text();
  const outcome = await handleWebhook(c.env, gateway, c.req.raw.headers, rawBody);
  if (outcome.body.success) return c.json(outcome.body, outcome.status as 200);
  return c.json({ ...outcome.body, error: { code: outcome.body.code, message: outcome.body.message } }, outcome.status as any);
});

const mockCheckoutQuery = z.object({
  tenant: z.string().min(1),
  plan: z.string().min(1),
  users: z.coerce.number().int().min(0).default(0),
  amount: z.coerce.number().min(0),
  currency: z.string().min(3).max(3),
  subscription: z.string().min(1),
  success: z.string().optional(),
  cancel: z.string().optional(),
  outcome: z.enum(['paid', 'failed']).default('paid'),
});

billingPublicRoutes.get('/mock-checkout', zValidator('query', mockCheckoutQuery), async (c) => {
  if (!mockAllowed(c.env)) return fail(c, 404, 'NOT_FOUND', 'Not found');
  const q = c.req.valid('query');
  const home = `${appUrl(c.env)}/settings/billing`;
  const safe = (url: string | undefined, fallback: string) => (url && url.startsWith(appUrl(c.env)) ? url : fallback);
  const mock = new MockGateway(c.env);
  const created = Math.floor(Date.now() / 1000);
  const periodEnd = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const customer = `mock_cus_${q.tenant}`;
  const events =
    q.outcome === 'failed'
      ? [{ type: 'payment.failed', created, tenant_id: q.tenant, customer_id: customer, subscription_id: q.subscription, amount: q.amount, currency: q.currency, payment_ref: `mock_pay_${generateId()}` }]
      : [
          { type: 'checkout.completed', created, tenant_id: q.tenant, plan_key: q.plan, extra_users: q.users, customer_id: customer, subscription_id: q.subscription, amount: q.amount, currency: q.currency },
          { type: 'payment.succeeded', created, tenant_id: q.tenant, plan_key: q.plan, extra_users: q.users, customer_id: customer, subscription_id: q.subscription, amount: q.amount, currency: q.currency, payment_ref: `mock_pay_${generateId()}`, period_end: periodEnd },
        ];
  for (const input of events) {
    const { body, signature } = await signedMockEvent(c.env, input);
    await handleWebhook(c.env, mock, new Headers({ 'x-mock-signature': signature }), body);
  }
  return c.redirect(q.outcome === 'failed' ? safe(q.cancel, home) : safe(q.success, `${home}?checkout=success`), 302);
});

const mockAddonQuery = z.object({
  order: z.string().min(1),
  success: z.string().optional(),
  cancel: z.string().optional(),
  outcome: z.enum(['paid', 'failed']).default('paid'),
});

/** Local only: plays the provider's paid (or failed) event for an add-on order through the real webhook pipeline. */
billingPublicRoutes.get('/mock-addon-checkout', zValidator('query', mockAddonQuery), async (c) => {
  if (!mockAllowed(c.env)) return fail(c, 404, 'NOT_FOUND', 'Not found');
  const q = c.req.valid('query');
  const order = await c.env.MASTER_DB
    .prepare('SELECT id, tenant_id, total, currency FROM addon_orders WHERE id = ?')
    .bind(q.order)
    .first<{ id: string; tenant_id: string; total: number; currency: string }>();
  if (!order) return fail(c, 404, 'NOT_FOUND', 'Order not found');
  const home = `${appUrl(c.env)}/settings/billing`;
  const safe = (url: string | undefined, fallback: string) => (url && url.startsWith(appUrl(c.env)) ? url : fallback);
  const { body, signature } = await signedMockEvent(c.env, {
    type: q.outcome === 'failed' ? 'order.failed' : 'order.paid',
    tenant_id: order.tenant_id,
    order_id: order.id,
    amount: order.total,
    currency: order.currency,
    payment_ref: `mock_pay_${generateId()}`,
  });
  await handleWebhook(c.env, new MockGateway(c.env), new Headers({ 'x-mock-signature': signature }), body);
  return c.redirect(q.outcome === 'failed' ? safe(q.cancel, `${home}?addon=cancelled`) : safe(q.success, `${home}?addon=success`), 302);
});

// ============================================================================
// Agency admin routes
// ============================================================================

const billingRoutes = new Hono<AppContext>();
billingRoutes.use('*', rbac(['admin']));

/** Plans an agency can buy: active, public, priced in its own market. */
async function offeredPlans(c: Context<AppContext>, country: string | null) {
  const catalogue = await getCatalogue(c.env);
  const market = marketForCountry(country);
  return catalogue.plans
    .filter((p) => p.isActive && p.isPublic && p.key !== 'trial')
    .map((p) => {
      const price = activePriceFrom(catalogue, p.key, market);
      const available = !!price && price.yearlyPrice > 0 && (market === 'IN' || price.market === market);
      return {
        key: p.key,
        name: p.name,
        description: p.description,
        available,
        currency: price?.currency ?? null,
        yearlyPrice: available ? price!.yearlyPrice : null,
        includedUsers: available ? price!.includedUsers : null,
        extraUserYearlyPrice: available ? price!.extraUserYearlyPrice : null,
      };
    });
}

billingRoutes.get('/subscription', async (c) => {
  const tenantId = c.get('tenantId');
  const tenant = await loadTenant(c.env, tenantId);
  if (!tenant) return fail(c, 404, 'NOT_FOUND', 'Agency not found');
  const sub = await currentSubscription(c.env, tenantId);
  const catalogue = await getCatalogue(c.env);
  const planKey = tenant.plan || 'trial';
  const plan = catalogue.plans.find((p) => p.key === planKey);
  const market = marketForCountry(tenant.country);
  const price = activePriceFrom(catalogue, planKey, market);
  const seats = await getSeatStatus(c.env, c.get('tenantDb'), tenantId);
  const gatewayId = gatewayIdForCountry(c.env, tenant.country);
  const gateway = createGateway(c.env, gatewayId);
  const days = graceDays(c.env);
  const pastDueSince = sub?.past_due_since ?? null;

  const status = !sub ? 'none' : sub.status;
  return success(c, {
    configured: gateway.isConfigured(),
    gateway: gatewayId,
    market,
    currency: price?.currency ?? sub?.currency ?? null,
    tenantStatus: tenant.status,
    readOnly: tenant.status === 'expired',
    subscription: {
      status,
      planKey,
      planName: plan?.name ?? planKey,
      amount: sub?.amount ?? 0,
      currentPeriodEnd: sub?.current_period_end ?? null,
      trialEndsAt: sub?.trial_ends_at ?? null,
      pastDueSince,
      graceEndsAt: pastDueSince ? new Date(new Date(pastDueSince).getTime() + days * 86_400_000).toISOString() : null,
      graceDays: days,
      cancelAtPeriodEnd: !!sub?.cancel_at_period_end,
      cancelledAt: sub?.cancelled_at ?? null,
      extraUsers: sub?.extra_users ?? 0,
    },
    seats: { ...seats, included: price?.includedUsers ?? null },
    plans: await offeredPlans(c, tenant.country),
  });
});

const quoteQuery = z.object({
  planKey: z.string().min(1),
  extraUsers: z.coerce.number().int().min(0).default(0),
});

billingRoutes.get('/quote', zValidator('query', quoteQuery), async (c) => {
  const { planKey, extraUsers } = c.req.valid('query');
  const tenant = await loadTenant(c.env, c.get('tenantId'));
  if (!tenant) return fail(c, 404, 'NOT_FOUND', 'Agency not found');
  try {
    const q = await buildQuote(c.env, tenant, planKey, extraUsers);
    return success(c, {
      planKey: q.planKey,
      planName: q.planName,
      currency: q.currency,
      extraUsers: q.extraUsers,
      includedUsers: q.includedUsers,
      subtotal: q.subtotal,
      taxLines: q.taxLines,
      taxTotal: q.taxTotal,
      total: q.total,
    });
  } catch (err) {
    return billingError(c, err);
  }
});

const checkoutSchema = z.object({
  planKey: z.string().min(1),
  extraUsers: z.number().int().min(0).max(5000).default(0),
});

billingRoutes.post('/checkout', zValidator('json', checkoutSchema), async (c) => {
  const { planKey, extraUsers } = c.req.valid('json');
  const tenantId = c.get('tenantId');
  const tenant = await loadTenant(c.env, tenantId);
  if (!tenant) return fail(c, 404, 'NOT_FOUND', 'Agency not found');
  if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
    return fail(c, 403, 'ACCOUNT_BLOCKED', 'This account cannot be changed online. Please contact support.');
  }

  const gateway = gatewayForCountry(c.env, tenant.country);
  if (!gateway.isConfigured()) return fail(c, 503, 'BILLING_NOT_CONFIGURED', NOT_CONFIGURED);

  try {
    const quote = await buildQuote(c.env, tenant, planKey, extraUsers);
    const sub = await ensureSubscription(c.env, tenant);
    await saveQuote(c.env, sub.id, quote);
    const customer = await c.env.MASTER_DB
      .prepare('SELECT customer_id FROM billing_customers WHERE tenant_id = ? AND gateway = ?')
      .bind(tenantId, gateway.id)
      .first<{ customer_id: string }>();
    const home = `${appUrl(c.env)}/settings/billing`;
    const result = await gateway.createCheckout({
      tenantId,
      quote,
      customerId: customer?.customer_id ?? null,
      successUrl: `${home}?checkout=success`,
      cancelUrl: `${home}?checkout=cancelled`,
    });
    return success(c, {
      url: result.url,
      gateway: gateway.id,
      reference: result.reference,
      currency: quote.currency,
      subtotal: quote.subtotal,
      taxTotal: quote.taxTotal,
      total: quote.total,
      display: formatMoney(quote.total, quote.currency, quote.currency === 'INR' ? 'en-IN' : 'en-US'),
    });
  } catch (err) {
    return billingError(c, err);
  }
});

// ---------------------------------------------------------------------------
// Add-ons (R206): extra users, AI credit packs and communication packs
// ---------------------------------------------------------------------------

billingRoutes.get('/addons', async (c) => {
  const tenantId = c.get('tenantId');
  const tenant = await loadTenant(c.env, tenantId);
  if (!tenant) return fail(c, 404, 'NOT_FOUND', 'Agency not found');
  const gatewayId = gatewayIdForCountry(c.env, tenant.country);
  const gateway = createGateway(c.env, gatewayId);
  const catalogue = await getCatalogue(c.env);
  const purchased = await c.env.MASTER_DB
    .prepare(
      `SELECT SUM(quantity) AS users, MAX(expires_at) AS ends FROM tenant_addons
        WHERE tenant_id = ? AND source = 'purchase' AND product_key IN (SELECT key FROM addon_products WHERE kind = 'extra_user')
          AND (expires_at IS NULL OR expires_at > ?)`,
    )
    .bind(tenantId, new Date().toISOString())
    .first<{ users: number | null; ends: string | null }>();
  return success(c, {
    configured: gateway.isConfigured(),
    gateway: gatewayId,
    market: marketForCountry(tenant.country),
    marginPct: MIN_COMM_MARGIN_PCT,
    catalogueVersion: catalogue.version,
    products: await listOffers(c.env, tenant),
    purchasedUsers: { quantity: Number(purchased?.users ?? 0), endsAt: purchased?.ends ?? null },
  });
});

const addonCheckoutSchema = z.object({
  productKey: z.string().min(1),
  quantity: z.number().int().min(1).max(500).default(1),
  idempotencyKey: z.string().min(8).max(80).optional(),
});

billingRoutes.post('/addons/checkout', zValidator('json', addonCheckoutSchema), async (c) => {
  const body = c.req.valid('json');
  const tenant = await loadTenant(c.env, c.get('tenantId'));
  if (!tenant) return fail(c, 404, 'NOT_FOUND', 'Agency not found');
  const gateway = gatewayForCountry(c.env, tenant.country);
  if (!gateway.isConfigured()) return fail(c, 503, 'BILLING_NOT_CONFIGURED', NOT_CONFIGURED);
  try {
    const created = await createOrder(c.env, tenant, body);
    return success(c, {
      url: created.url,
      gateway: created.gatewayId,
      replay: created.replay,
      order: orderView(created.order),
      display: formatMoney(created.order.total, created.order.currency, created.order.currency === 'INR' ? 'en-IN' : 'en-US'),
    });
  } catch (err) {
    return billingError(c, err);
  }
});

const addonQuoteQuery = z.object({
  productKey: z.string().min(1),
  quantity: z.coerce.number().int().min(1).default(1),
});

billingRoutes.get('/addons/quote', zValidator('query', addonQuoteQuery), async (c) => {
  const { productKey, quantity } = c.req.valid('query');
  const tenant = await loadTenant(c.env, c.get('tenantId'));
  if (!tenant) return fail(c, 404, 'NOT_FOUND', 'Agency not found');
  try {
    return success(c, await quoteAddon(c.env, tenant, productKey, quantity));
  } catch (err) {
    return billingError(c, err);
  }
});

billingRoutes.get('/addons/orders', async (c) => {
  const rows = await listOrders(c.env, c.get('tenantId'));
  return success(c, { orders: rows.map(orderView) });
});

billingRoutes.post('/cancel', async (c) => {
  const tenantId = c.get('tenantId');
  const tenant = await loadTenant(c.env, tenantId);
  const sub = await currentSubscription(c.env, tenantId);
  if (!tenant || !sub || (sub.status !== 'active' && sub.status !== 'past_due')) {
    return fail(c, 409, 'NO_ACTIVE_SUBSCRIPTION', 'There is no paid subscription to cancel.');
  }
  if (sub.cancel_at_period_end) {
    return success(c, { cancelAtPeriodEnd: true, currentPeriodEnd: sub.current_period_end });
  }
  if (sub.payment_gateway && sub.gateway_subscription_id) {
    try {
      const gateway = createGateway(c.env, sub.payment_gateway as any);
      await gateway.cancelSubscription(sub.gateway_subscription_id, { atPeriodEnd: true });
    } catch (err) {
      return billingError(c, err);
    }
  }
  const at = new Date().toISOString();
  await c.env.MASTER_DB
    .prepare('UPDATE subscriptions SET cancel_at_period_end = 1, cancelled_at = ?, updated_at = ? WHERE id = ?')
    .bind(at, at, sub.id)
    .run();
  return success(c, { cancelAtPeriodEnd: true, currentPeriodEnd: sub.current_period_end });
});

billingRoutes.get('/invoices', async (c) => {
  const rows = await c.env.MASTER_DB
    .prepare('SELECT id, number, period, description, currency, subtotal, total, status, issued_at FROM platform_invoices WHERE tenant_id = ? ORDER BY issued_at DESC, id DESC LIMIT 100')
    .bind(c.get('tenantId'))
    .all<Record<string, unknown>>();
  return success(c, {
    invoices: (rows.results ?? []).map((r) => ({
      id: r.id,
      number: r.number,
      period: r.period,
      description: r.description ?? null,
      currency: r.currency,
      subtotal: r.subtotal,
      total: r.total,
      status: r.status,
      issuedAt: r.issued_at,
    })),
  });
});

const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

billingRoutes.get('/invoices/:id/download', async (c) => {
  const tenantId = c.get('tenantId');
  const inv = await c.env.MASTER_DB
    .prepare('SELECT * FROM platform_invoices WHERE id = ? AND tenant_id = ?')
    .bind(c.req.param('id'), tenantId)
    .first<any>();
  if (!inv) return fail(c, 404, 'NOT_FOUND', 'Invoice not found');
  const tenant = await loadTenant(c.env, tenantId);
  const locale = inv.currency === 'INR' ? 'en-IN' : inv.currency === 'GBP' ? 'en-GB' : 'en-US';
  const money = (n: number) => formatMoney(Number(n), inv.currency, locale);
  let taxRows = '';
  try {
    for (const t of JSON.parse(inv.tax_lines || '[]') as Array<{ label: string; rate: number; amount: number }>) {
      taxRows += `<tr><td>${esc(t.label)} ${esc(t.rate)}%</td><td style="text-align:right">${esc(money(t.amount))}</td></tr>`;
    }
  } catch {
    taxRows = '';
  }
  const taxId = c.env.PLATFORM_TAX_ID ? `<p>Tax ID: ${esc(c.env.PLATFORM_TAX_ID)}</p>` : '';
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${esc(inv.number)}</title></head>
<body style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:32px auto;color:#222">
<h1 style="margin-bottom:0">TravelCRM Pro</h1>${taxId}
<h2>Invoice ${esc(inv.number)}</h2>
<p>Issued: ${esc(String(inv.issued_at).slice(0, 10))}${inv.period ? `<br>Service period: ${esc(inv.period)}` : ''}<br>Billed to: ${esc(tenant?.company_name ?? '')}</p>
<table style="width:100%;border-collapse:collapse" cellpadding="6">
<tr><td>${esc(inv.description || 'Subscription')}</td><td style="text-align:right">${esc(money(inv.subtotal))}</td></tr>
${taxRows}
<tr style="border-top:1px solid #999"><td><strong>Total (${esc(inv.currency)})</strong></td><td style="text-align:right"><strong>${esc(money(inv.total))}</strong></td></tr>
</table>
<p>Status: ${esc(inv.status)}. Paid online through ${esc(inv.gateway)}.</p>
</body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${String(inv.number).replace(/[^A-Za-z0-9_-]/g, '_')}.html"`,
    },
  });
});

export default billingRoutes;
