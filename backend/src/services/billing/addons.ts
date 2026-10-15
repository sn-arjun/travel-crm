/**
 * Self-serve add-ons (R206): an agency buys extra users, an AI credit pack or a communication pack online.
 *
 *   quote        price from the catalogue (never hardcoded) + platform tax from the R201 tax engine
 *   createOrder  an addon_orders row (pending) and a one-off checkout at the agency's gateway
 *                (Stripe Checkout in payment mode, a Razorpay Payment Link, the mock gateway locally)
 *   applyOrderEvent  the gateway's paid / failed event: credits the add-on exactly once, issues the invoice
 *
 * What a purchase grants (tenant_addons, source 'purchase', reference = the order id):
 *   AI credit packs and communication packs  units for the CURRENT month only (period_key = the month the payment
 *                                            arrived in); they do not carry into next month, like granted packs
 *   extra users                              seats from now until the paid year ends (expires_at = the subscription's
 *                                            current_period_end); to keep them the agency renews with those seats
 *
 * Exactly once: the order row is claimed with a conditional UPDATE (status <> 'paid'), the provider event id is
 * de-duplicated by billing_events upstream, and tenant_addons carries a unique index on the order id.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { invalidateTenantCache } from '../tenant-db';
import type { TaxLine } from '../tax-calculator';
import {
  activePriceFrom,
  currentPeriodKey,
  getCatalogue,
  marketForCountry,
  seatLimit,
  type AddonProduct,
  type Catalogue,
} from '../plans/catalogue';
import { addonPriceFrom, activeUnitCost, ceilToMinorUnit } from '../plans/pricing';
import { appUrl } from '../../utils/app-urls';
import { gatewayForCountry } from './registry';
import type { BillingEvent, FetchLike } from './gateway';
import {
  BillingError,
  currentSubscription,
  nextInvoiceNumber,
  notifyReceipt,
  platformTax,
  roundMoney,
  type ApplyResult,
  type TenantRow,
} from './subscriptions';

/** Owner decision 2026-10-14: communication is sold at provider cost + 20%. No communication pack sells below it. */
export const MIN_COMM_MARGIN_PCT = 20;

const YEAR_MS = 365 * 86_400_000;
export const MAX_PACK_QUANTITY = 100;
export const MAX_USER_QUANTITY = 500;

export interface AddonQuote {
  productKey: string;
  name: string;
  kind: AddonProduct['kind'];
  channel: string | null;
  quantity: number;
  /** Units one pack holds (credits, messages, codes, minutes); 0 for extra users. */
  unitsPerPack: number;
  /** Units the order grants in all. */
  unitsGranted: number;
  currency: string;
  /** Price of one pack (or of one extra user for the rest of the paid year). */
  unitPrice: number;
  subtotal: number;
  taxLines: TaxLine[];
  taxTotal: number;
  total: number;
  description: string;
  /** Extra users: the share of a year the price covers (1 = a full year). */
  prorated: number | null;
  /** Extra users: when the seats end. */
  expiresAt: string | null;
}

function ensureCanBuy(tenant: TenantRow): void {
  if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
    throw new BillingError('ACCOUNT_BLOCKED', 'This account cannot be changed online. Please contact support.', 400);
  }
  if (tenant.status === 'expired') {
    throw new BillingError('SUBSCRIPTION_EXPIRED', 'Renew your subscription before buying add-ons.', 409);
  }
}

/** The price of one pack in the agency's market, with the communication margin floor applied. Null when it has no price. */
function packUnitPrice(catalogue: Catalogue, product: AddonProduct, market: string): { price: number; currency: string } | null {
  if (!product.isActive || product.market !== market) return null;
  const priced = addonPriceFrom(catalogue, product);
  if (!priced || !(priced.price > 0)) return null;
  if (product.kind === 'comm_pack' && product.channel) {
    const cost = activeUnitCost(catalogue, product.channel, product.market);
    if (cost && cost.unitCost > 0 && cost.currency === priced.currency) {
      const floor = ceilToMinorUnit(product.units * cost.unitCost * (1 + MIN_COMM_MARGIN_PCT / 100), cost.currency);
      if (priced.price < floor) return { price: floor, currency: priced.currency };
    }
  }
  return priced;
}

/** Yearly price of one extra user on the agency's plan, from plan_prices for its own market. */
function extraUserYearly(catalogue: Catalogue, planKey: string, market: string): { price: number; currency: string } | null {
  const row = activePriceFrom(catalogue, planKey, market);
  if (!row || row.extraUserYearlyPrice == null || !(row.extraUserYearlyPrice > 0)) return null;
  // A non-India agency is never charged the India (INR) price.
  if (market !== 'IN' && row.market !== market) return null;
  return { price: row.extraUserYearlyPrice, currency: row.currency };
}

/** Where an agency's paid year stands, for pricing seats bought mid-term. */
async function paidYear(env: Env, tenant: TenantRow, now: Date): Promise<{ periodEnd: string; fraction: number }> {
  const sub = await currentSubscription(env, tenant.id);
  const periodEnd = sub?.current_period_end ?? null;
  if (!sub || sub.status !== 'active' || tenant.plan === 'trial' || !periodEnd || new Date(periodEnd).getTime() <= now.getTime()) {
    throw new BillingError('NO_ACTIVE_SUBSCRIPTION', 'Extra users can be added once you are on a paid plan. Choose a plan first.', 409);
  }
  const left = new Date(periodEnd).getTime() - now.getTime();
  return { periodEnd, fraction: Math.min(1, left / YEAR_MS) };
}

export async function quoteAddon(env: Env, tenant: TenantRow, productKey: string, quantity: number, now: Date = new Date()): Promise<AddonQuote> {
  ensureCanBuy(tenant);
  const catalogue = await getCatalogue(env);
  const product = catalogue.addons.find((a) => a.key === productKey);
  if (!product || !product.isActive) throw new BillingError('UNKNOWN_PRODUCT', 'That add-on is not available.', 404);
  const max = product.kind === 'extra_user' ? MAX_USER_QUANTITY : MAX_PACK_QUANTITY;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > max) {
    throw new BillingError('INVALID_QUANTITY', `Quantity must be a whole number from 1 to ${max}.`, 400);
  }
  const market = marketForCountry(tenant.country);
  const notConfigured = new BillingError('PRICE_NOT_CONFIGURED', 'Pricing for your region is not available yet. Please contact support.', 409);

  let unitPrice: number;
  let currency: string;
  let prorated: number | null = null;
  let expiresAt: string | null = null;
  let description: string;
  if (product.kind === 'extra_user') {
    const yearly = extraUserYearly(catalogue, tenant.plan, market);
    if (!yearly) throw notConfigured;
    const year = await paidYear(env, tenant, now);
    prorated = Math.round(year.fraction * 10_000) / 10_000;
    unitPrice = ceilToMinorUnit(yearly.price * year.fraction, yearly.currency);
    currency = yearly.currency;
    expiresAt = year.periodEnd;
    description = `Extra users x ${quantity} (until ${year.periodEnd.slice(0, 10)})`;
  } else {
    const priced = packUnitPrice(catalogue, product, market);
    if (!priced) throw notConfigured;
    unitPrice = priced.price;
    currency = priced.currency;
    description = `${product.name} x ${quantity}`;
  }
  if (!(unitPrice > 0)) throw notConfigured;

  const subtotal = roundMoney(unitPrice * quantity);
  const tax = platformTax(env, tenant, subtotal);
  return {
    productKey: product.key,
    name: product.name,
    kind: product.kind,
    channel: product.channel,
    quantity,
    unitsPerPack: product.kind === 'extra_user' ? 0 : product.units,
    unitsGranted: product.kind === 'extra_user' ? 0 : product.units * quantity,
    currency,
    unitPrice,
    subtotal,
    taxLines: tax.taxLines,
    taxTotal: tax.totalTax,
    total: roundMoney(subtotal + tax.totalTax),
    description,
    prorated,
    expiresAt,
  };
}

export interface AddonOffer {
  key: string;
  name: string;
  kind: AddonProduct['kind'];
  channel: string | null;
  unitsPerPack: number;
  available: boolean;
  reason: string | null;
  currency: string | null;
  /** One pack, or one extra user for the rest of the paid year; before tax. */
  unitPrice: number | null;
  /** Extra users: the full yearly price of one user. */
  yearlyPrice: number | null;
  prorated: number | null;
  expiresAt: string | null;
}

/** Every active add-on with its live price for this agency's market (the Buy more screen). */
export async function listOffers(env: Env, tenant: TenantRow, now: Date = new Date()): Promise<AddonOffer[]> {
  const catalogue = await getCatalogue(env);
  const market = marketForCountry(tenant.country);
  const offers: AddonOffer[] = [];
  for (const product of catalogue.addons.filter((a) => a.isActive)) {
    const base = {
      key: product.key,
      name: product.name,
      kind: product.kind,
      channel: product.channel,
      unitsPerPack: product.kind === 'extra_user' ? 0 : product.units,
      currency: null as string | null,
      unitPrice: null as number | null,
      yearlyPrice: null as number | null,
      prorated: null as number | null,
      expiresAt: null as string | null,
    };
    try {
      const q = await quoteAddon(env, tenant, product.key, 1, now);
      const yearly = product.kind === 'extra_user' ? extraUserYearly(catalogue, tenant.plan, market) : null;
      offers.push({ ...base, available: true, reason: null, currency: q.currency, unitPrice: q.unitPrice, yearlyPrice: yearly?.price ?? null, prorated: q.prorated, expiresAt: q.expiresAt });
    } catch (err) {
      if (!(err instanceof BillingError)) throw err;
      // Not for sale to this agency: a market with no price, or seats before a paid plan.
      if (err.code === 'PRICE_NOT_CONFIGURED' && product.kind !== 'extra_user' && product.market !== market) continue;
      offers.push({ ...base, available: false, reason: err.code });
    }
  }
  return offers;
}

// ----------------------------------------------------------------------------
// Orders
// ----------------------------------------------------------------------------

export interface AddonOrderRow {
  id: string;
  tenant_id: string;
  product_key: string;
  quantity: number;
  unit_price: number;
  currency: string;
  subtotal: number;
  tax_total: number;
  tax_lines: string | null;
  total: number;
  units_granted: number;
  description: string | null;
  gateway: string;
  gateway_ref: string | null;
  checkout_url: string | null;
  status: 'pending' | 'paid' | 'failed';
  invoice_id: string | null;
  idempotency_key: string;
  created_at: string;
  paid_at: string | null;
}

export function orderView(row: AddonOrderRow) {
  return {
    id: row.id,
    productKey: row.product_key,
    description: row.description,
    quantity: row.quantity,
    unitsGranted: row.units_granted,
    currency: row.currency,
    unitPrice: row.unit_price,
    subtotal: row.subtotal,
    taxTotal: row.tax_total,
    total: row.total,
    status: row.status,
    gateway: row.gateway,
    invoiceId: row.invoice_id,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}

export async function listOrders(env: Env, tenantId: string): Promise<AddonOrderRow[]> {
  const rows = await env.MASTER_DB
    .prepare('SELECT * FROM addon_orders WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 100')
    .bind(tenantId)
    .all<AddonOrderRow>();
  return rows.results ?? [];
}

export interface CreatedOrder {
  order: AddonOrderRow;
  url: string | null;
  gatewayId: string;
  replay: boolean;
}

/**
 * Price the add-on, record a pending order and start the one-off checkout. A repeated idempotencyKey returns the same
 * order and checkout link instead of creating another.
 */
export async function createOrder(
  env: Env,
  tenant: TenantRow,
  input: { productKey: string; quantity: number; idempotencyKey?: string | null },
  opts: { now?: Date; fetchImpl?: FetchLike } = {},
): Promise<CreatedOrder> {
  const now = opts.now ?? new Date();
  const key = `${tenant.id}:${input.idempotencyKey?.trim() || generateId()}`;

  const existing = await env.MASTER_DB.prepare('SELECT * FROM addon_orders WHERE idempotency_key = ?').bind(key).first<AddonOrderRow>();
  if (existing) {
    if (existing.status === 'paid') throw new BillingError('ALREADY_PURCHASED', 'This purchase was already paid.', 409);
    return { order: existing, url: existing.checkout_url, gatewayId: existing.gateway, replay: true };
  }

  const quote = await quoteAddon(env, tenant, input.productKey, input.quantity, now);
  const gateway = gatewayForCountry(env, tenant.country, opts.fetchImpl);
  const orderId = generateId();
  await env.MASTER_DB
    .prepare(
      `INSERT INTO addon_orders (id, tenant_id, product_key, quantity, unit_price, currency, subtotal, tax_total, tax_lines, total,
                                 units_granted, description, gateway, status, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .bind(
      orderId, tenant.id, quote.productKey, quote.quantity, quote.unitPrice, quote.currency, quote.subtotal, quote.taxTotal,
      JSON.stringify(quote.taxLines), quote.total, quote.unitsGranted, quote.description, gateway.id, key, now.toISOString(),
    )
    .run();

  try {
    const customer = await env.MASTER_DB
      .prepare('SELECT customer_id FROM billing_customers WHERE tenant_id = ? AND gateway = ?')
      .bind(tenant.id, gateway.id)
      .first<{ customer_id: string }>();
    const home = `${appUrl(env)}/settings/billing`;
    const result = await gateway.createOrderCheckout({
      tenantId: tenant.id,
      orderId,
      description: `TravelCRM Pro: ${quote.description}`,
      currency: quote.currency,
      total: quote.total,
      customerEmail: tenant.owner_email,
      customerName: tenant.owner_name || tenant.company_name,
      customerId: customer?.customer_id ?? null,
      successUrl: `${home}?addon=success`,
      cancelUrl: `${home}?addon=cancelled`,
    });
    await env.MASTER_DB
      .prepare('UPDATE addon_orders SET gateway_ref = ?, checkout_url = ? WHERE id = ?')
      .bind(result.reference, result.url, orderId)
      .run();
    const order = (await env.MASTER_DB.prepare('SELECT * FROM addon_orders WHERE id = ?').bind(orderId).first<AddonOrderRow>())!;
    return { order, url: result.url, gatewayId: gateway.id, replay: false };
  } catch (err) {
    // No checkout exists, so there is nothing to pay or to credit: drop the order.
    await env.MASTER_DB.prepare('DELETE FROM addon_orders WHERE id = ?').bind(orderId).run().catch(() => undefined);
    throw err;
  }
}

// ----------------------------------------------------------------------------
// The paid / failed event
// ----------------------------------------------------------------------------

async function grantOrder(env: Env, order: AddonOrderRow, tenantRow: TenantRow, now: Date): Promise<void> {
  const catalogue = await getCatalogue(env);
  const product = catalogue.addons.find((a) => a.key === order.product_key);
  const kind = product?.kind ?? (order.product_key === 'extra_user' ? 'extra_user' : 'comm_pack');

  if (kind === 'extra_user') {
    const sub = await currentSubscription(env, order.tenant_id);
    const end = sub?.current_period_end && sub.current_period_end > now.toISOString() ? sub.current_period_end : new Date(now.getTime() + YEAR_MS).toISOString();
    await env.MASTER_DB
      .prepare(
        `INSERT OR IGNORE INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source, reference, expires_at)
         VALUES (?, ?, ?, ?, 0, NULL, 'purchase', ?, ?)`,
      )
      .bind(generateId(), order.tenant_id, order.product_key, order.quantity, order.id, end)
      .run();
    // The seat limit follows at once (seatLimit adds the unexpired extra-user rows).
    const seats = await seatLimit(env, order.tenant_id);
    await env.MASTER_DB.prepare('UPDATE tenants SET max_users = ? WHERE id = ?').bind(seats, order.tenant_id).run();
  } else {
    await env.MASTER_DB
      .prepare(
        `INSERT OR IGNORE INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source, reference)
         VALUES (?, ?, ?, ?, ?, ?, 'purchase', ?)`,
      )
      .bind(generateId(), order.tenant_id, order.product_key, order.quantity, order.units_granted, currentPeriodKey(now), order.id)
      .run();
  }
  await invalidateTenantCache(env, tenantRow.id);
}

async function issueOrderInvoice(env: Env, order: AddonOrderRow, event: BillingEvent, now: Date) {
  const ref = event.paymentRef ?? `order:${order.id}`;
  const existing = await env.MASTER_DB
    .prepare('SELECT id, number, total, currency FROM platform_invoices WHERE gateway = ? AND gateway_ref = ?')
    .bind(event.gateway, ref)
    .first<{ id: string; number: string; total: number; currency: string }>();
  if (existing) return { ...existing, created: false };
  const id = generateId();
  const number = await nextInvoiceNumber(env, now);
  await env.MASTER_DB
    .prepare(
      `INSERT INTO platform_invoices (id, number, tenant_id, subscription_id, period, currency, subtotal, tax_lines, total, status, gateway, gateway_ref, description, issued_at)
       VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, 'paid', ?, ?, ?, ?)`,
    )
    .bind(id, number, order.tenant_id, order.currency, order.subtotal, order.tax_lines ?? '[]', order.total, event.gateway, ref, order.description, event.occurredAt)
    .run();
  return { id, number, total: order.total, currency: order.currency, created: true };
}

/** Apply a one-off payment event: order_paid credits the add-on once; order_failed credits nothing. */
export async function applyOrderEvent(env: Env, event: BillingEvent, now: Date = new Date()): Promise<ApplyResult> {
  const order = event.orderId
    ? await env.MASTER_DB.prepare('SELECT * FROM addon_orders WHERE id = ?').bind(event.orderId).first<AddonOrderRow>()
    : null;
  if (!order) return { outcome: 'unknown_order', tenantId: event.tenantId ?? null };
  const tenantId = order.tenant_id;
  if (event.tenantId && event.tenantId !== tenantId) return { outcome: 'tenant_mismatch', tenantId };

  if (event.kind === 'order_failed') {
    await env.MASTER_DB.prepare(`UPDATE addon_orders SET status = 'failed' WHERE id = ? AND status = 'pending'`).bind(order.id).run();
    return { outcome: 'order_failed', tenantId };
  }

  // Never credit a payment for a different amount than the order was quoted at.
  if (
    (event.amount != null && Math.abs(Number(event.amount) - order.total) > 0.011) ||
    (event.currency && event.currency.toUpperCase() !== order.currency.toUpperCase())
  ) {
    console.error(`[billing] add-on order ${order.id}: paid ${event.amount} ${event.currency}, quoted ${order.total} ${order.currency}; not credited`);
    return { outcome: 'amount_mismatch', tenantId };
  }

  // The claim: only the delivery that flips the order to paid credits it.
  const claim = await env.MASTER_DB
    .prepare(`UPDATE addon_orders SET status = 'paid', paid_at = ? WHERE id = ? AND status <> 'paid'`)
    .bind(now.toISOString(), order.id)
    .run();
  if ((claim.meta.changes ?? 0) === 0) return { outcome: 'order_already_paid', tenantId };

  try {
    const tenant = (await env.MASTER_DB
      .prepare('SELECT id, company_name, owner_email, owner_name, country, settings, plan, status FROM tenants WHERE id = ?')
      .bind(tenantId)
      .first<TenantRow>())!;
    await grantOrder(env, order, tenant, now);
    const invoice = await issueOrderInvoice(env, order, event, now);
    await env.MASTER_DB.prepare('UPDATE addon_orders SET invoice_id = ? WHERE id = ?').bind(invoice.id, order.id).run();
    if (invoice.created) {
      await notifyReceipt(env, tenant, { ...invoice, created: true }, { periodEnd: null });
    }
  } catch (err) {
    // Not credited: reopen the order so the provider's redelivery is handled (the unique index stops a double grant).
    await env.MASTER_DB.prepare(`UPDATE addon_orders SET status = ?, paid_at = NULL WHERE id = ?`).bind(order.status, order.id).run().catch(() => undefined);
    throw err;
  }
  return { outcome: 'order_paid', tenantId };
}

