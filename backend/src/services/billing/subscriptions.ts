/**
 * Subscription state, driven by gateway events (R205).
 *
 * One row per agency in master `subscriptions` (the trial row becomes the paid subscription). Its status:
 *
 *   trial -> active              first payment (checkout completed / payment succeeded)
 *   active -> past_due           a renewal failed; past_due_since starts the grace period (BILLING_GRACE_DAYS, 7)
 *   past_due -> active           a later payment succeeded
 *   past_due -> expired          the daily job, once the grace period is over: the agency turns read-only
 *   active -> cancelled          the gateway reports the subscription ended (or the period of a cancelled one ran out)
 *   expired/cancelled -> active  the agency pays again
 *
 * The tenant row follows: `tenants.status` stays 'active' through the grace period (the agency keeps working while it
 * fixes the card) and becomes 'expired' when the subscription expires or ends; the tenant middleware serves an
 * expired paid agency read-only, so no data is ever lost. A suspended agency is never reactivated by a payment.
 *
 * Events are applied at most once (billing_events, unique on gateway + event id) and are ordered by the provider's
 * own timestamp: an event older than the newest one already applied cannot move the status backwards.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { formatMoney } from '../../utils/money';
import { appUrl } from '../../utils/app-urls';
import { invalidateTenantCache } from '../tenant-db';
import { sendTransactional } from '../mail/transactional';
import { computeInvoiceTax, normalizeCountry, type TaxLine, type TaxRegime } from '../tax-calculator';
import { activePriceFrom, getCatalogue, marketForCountry } from '../plans/catalogue';
import {
  sha256Hex,
  type BillingEvent,
  type BillingGateway,
  type CheckoutQuote,
} from './gateway';

export const DEFAULT_GRACE_DAYS = 7;
const DAY_MS = 86_400_000;
/** A row whose processing started but never finished is retried by the next delivery after this long. */
const STUCK_EVENT_MS = 2 * 60_000;

export class BillingError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: 400 | 402 | 404 | 409 | 422 | 503 = 422) {
    super(message);
    this.name = 'BillingError';
  }
}

/** The tenant is not known yet (for example a renewal that arrives before the checkout that creates the link). */
export class RetryLater extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryLater';
  }
}

export function graceDays(env: Pick<Env, 'BILLING_GRACE_DAYS'>): number {
  const n = Number(env.BILLING_GRACE_DAYS);
  return Number.isInteger(n) && n >= 0 && n <= 60 ? n : DEFAULT_GRACE_DAYS;
}

const nowIso = (now: Date) => now.toISOString();

function addYear(iso: string): string {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString();
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

// ----------------------------------------------------------------------------
// Rows
// ----------------------------------------------------------------------------

export interface SubscriptionRow {
  id: string;
  tenant_id: string;
  plan: string;
  amount: number;
  currency: string | null;
  status: string;
  payment_gateway: string | null;
  gateway_subscription_id: string | null;
  current_period_end: string | null;
  next_billing_date: string | null;
  trial_ends_at: string | null;
  past_due_since: string | null;
  last_event_at: string | null;
  extra_users: number;
  quote_subtotal: number | null;
  quote_tax_lines: string | null;
  cancel_at_period_end: number;
  cancelled_at: string | null;
  created_at: string | null;
}

interface TenantRow {
  id: string;
  company_name: string;
  owner_email: string | null;
  owner_name: string | null;
  country: string | null;
  settings: string | null;
  plan: string;
  status: string;
}

export async function loadTenant(env: Env, tenantId: string): Promise<TenantRow | null> {
  return env.MASTER_DB
    .prepare('SELECT id, company_name, owner_email, owner_name, country, settings, plan, status FROM tenants WHERE id = ?')
    .bind(tenantId)
    .first<TenantRow>();
}

export async function currentSubscription(env: Env, tenantId: string): Promise<SubscriptionRow | null> {
  return env.MASTER_DB
    .prepare('SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 1')
    .bind(tenantId)
    .first<SubscriptionRow>();
}

/** The agency's subscription row, created (as a trial or active row, following the tenant) when it has none. */
export async function ensureSubscription(env: Env, tenant: TenantRow, now: Date = new Date()): Promise<SubscriptionRow> {
  const existing = await currentSubscription(env, tenant.id);
  if (existing) return existing;
  const id = generateId();
  const at = nowIso(now);
  await env.MASTER_DB
    .prepare(
      `INSERT INTO subscriptions (id, tenant_id, plan, amount, billing_cycle, start_date, next_billing_date, status)
       VALUES (?, ?, ?, 0, 'yearly', ?, ?, ?)`,
    )
    .bind(id, tenant.id, tenant.plan || 'trial', at, at, tenant.status === 'trial' ? 'trial' : 'active')
    .run();
  return (await currentSubscription(env, tenant.id))!;
}

// ----------------------------------------------------------------------------
// Pricing a checkout
// ----------------------------------------------------------------------------

export interface PricedQuote extends CheckoutQuote {
  market: string;
  includedUsers: number;
  taxLines: TaxLine[];
  taxTotal: number;
  taxTreatment: string;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Tax the platform charges an agency for its subscription, through the same engine the agencies' invoices use. */
export function platformTax(env: Env, tenant: Pick<TenantRow, 'country' | 'settings'>, subtotal: number) {
  const buyerCountry = normalizeCountry(tenant.country) ?? 'IN';
  const vatCountries = (env.PLATFORM_VAT_COUNTRIES ?? '').split(',').map((c) => normalizeCountry(c)).filter(Boolean);
  const vatRate = Number(env.PLATFORM_VAT_RATE);
  let regime: TaxRegime = 'none';
  if (buyerCountry === 'IN') regime = 'gst';
  else if (vatCountries.includes(buyerCountry) && Number.isFinite(vatRate) && env.PLATFORM_VAT_RATE) regime = 'vat';

  let buyerState: string | null = null;
  try {
    const parsed = tenant.settings ? JSON.parse(tenant.settings) : null;
    buyerState = typeof parsed?.state === 'string' ? parsed.state : null;
  } catch {
    buyerState = null;
  }
  const gstRate = Number(env.PLATFORM_GST_RATE);
  return computeInvoiceTax({
    regime,
    seller: {
      country: env.PLATFORM_TAX_COUNTRY || 'IN',
      state: env.PLATFORM_TAX_STATE || null,
      taxId: env.PLATFORM_TAX_ID || null,
      vatRate: regime === 'vat' ? vatRate : null,
    },
    buyer: { country: buyerCountry, state: buyerState },
    lines: [{ amount: subtotal }],
    gstDefaultRate: env.PLATFORM_GST_RATE && Number.isFinite(gstRate) ? gstRate : 18,
  });
}

/**
 * What an agency would pay each year for a plan and extra users: prices come from the plan catalogue for the
 * agency's market (never hardcoded), tax from the tax engine. Throws BillingError for an unknown plan, a plan with no
 * price in the agency's market, or an extra-user count the plan cannot price.
 */
export async function buildQuote(env: Env, tenant: TenantRow, planKey: string, extraUsers: number): Promise<PricedQuote> {
  if (!Number.isInteger(extraUsers) || extraUsers < 0 || extraUsers > 5000) {
    throw new BillingError('INVALID_SEATS', 'Extra users must be a whole number from 0 to 5000.');
  }
  const catalogue = await getCatalogue(env);
  const plan = catalogue.plans.find((p) => p.key === planKey);
  if (!plan || !plan.isActive || plan.key === 'trial') {
    throw new BillingError('UNKNOWN_PLAN', 'That plan is not available.', 404);
  }
  const market = marketForCountry(tenant.country);
  const price = activePriceFrom(catalogue, planKey, market);
  // A non-India agency is never charged the India (INR) price: it needs a price row for its own market.
  if (!price || !(price.yearlyPrice > 0) || (market !== 'IN' && price.market !== market)) {
    throw new BillingError('PRICE_NOT_CONFIGURED', 'Pricing for your region is not available yet. Please contact support.', 409);
  }
  if (extraUsers > 0 && price.extraUserYearlyPrice == null) {
    throw new BillingError('EXTRA_USERS_UNAVAILABLE', 'This plan has no extra-user price. Choose a larger plan.');
  }
  const subtotal = roundMoney(price.yearlyPrice + extraUsers * (price.extraUserYearlyPrice ?? 0));
  const tax = platformTax(env, tenant, subtotal);
  return {
    planKey,
    planName: plan.name,
    currency: price.currency,
    extraUsers,
    subtotal,
    total: roundMoney(subtotal + tax.totalTax),
    customerEmail: tenant.owner_email,
    customerName: tenant.owner_name || tenant.company_name,
    market,
    includedUsers: price.includedUsers,
    taxLines: tax.taxLines,
    taxTotal: tax.totalTax,
    taxTreatment: tax.treatment,
  };
}

/** Remember the quote a checkout was started with, so the invoice for its payment shows the same subtotal and tax. */
export async function saveQuote(env: Env, subscriptionId: string, quote: PricedQuote): Promise<void> {
  await env.MASTER_DB
    .prepare('UPDATE subscriptions SET quote_subtotal = ?, quote_tax_lines = ?, updated_at = ? WHERE id = ?')
    .bind(quote.subtotal, JSON.stringify(quote.taxLines), nowIso(new Date()), subscriptionId)
    .run();
}

// ----------------------------------------------------------------------------
// Applying an event
// ----------------------------------------------------------------------------

export interface ApplyResult {
  outcome: string;
  tenantId: string | null;
  /** A gateway subscription this event replaced; the caller cancels it at the provider. */
  supersededSubscriptionId?: string | null;
}

async function resolveTenantId(env: Env, event: BillingEvent): Promise<string | null> {
  if (event.tenantId) {
    const row = await env.MASTER_DB.prepare('SELECT id FROM tenants WHERE id = ?').bind(event.tenantId).first<{ id: string }>();
    if (row) return row.id;
  }
  if (event.subscriptionId) {
    const row = await env.MASTER_DB
      .prepare('SELECT tenant_id FROM subscriptions WHERE payment_gateway = ? AND gateway_subscription_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(event.gateway, event.subscriptionId)
      .first<{ tenant_id: string }>();
    if (row) return row.tenant_id;
  }
  if (event.customerId) {
    const row = await env.MASTER_DB
      .prepare('SELECT tenant_id FROM billing_customers WHERE gateway = ? AND customer_id = ?')
      .bind(event.gateway, event.customerId)
      .first<{ tenant_id: string }>();
    if (row) return row.tenant_id;
  }
  return null;
}

async function nextInvoiceNumber(env: Env, now: Date): Promise<string> {
  const year = now.getUTCFullYear();
  const row = await env.MASTER_DB
    .prepare(
      `INSERT INTO billing_counters (key, value) VALUES (?, 1)
       ON CONFLICT(key) DO UPDATE SET value = value + 1 RETURNING value`,
    )
    .bind(`platform_invoice:${year}`)
    .first<{ value: number }>();
  return `PINV-${year}-${String(row?.value ?? 1).padStart(6, '0')}`;
}

interface IssuedInvoice {
  id: string;
  number: string;
  total: number;
  currency: string;
  created: boolean;
}

async function issueInvoice(env: Env, sub: SubscriptionRow, event: BillingEvent, now: Date): Promise<IssuedInvoice | null> {
  const amount = event.amount ?? null;
  if (!(amount && amount > 0)) return null;
  const currency = (event.currency || sub.currency || 'INR').toUpperCase();
  const ref = event.paymentRef ?? null;
  if (ref) {
    const existing = await env.MASTER_DB
      .prepare('SELECT id, number, total, currency FROM platform_invoices WHERE gateway = ? AND gateway_ref = ?')
      .bind(event.gateway, ref)
      .first<{ id: string; number: string; total: number; currency: string }>();
    if (existing) return { ...existing, created: false };
  }

  let subtotal = amount;
  let taxLines: TaxLine[] = [];
  if (sub.quote_subtotal != null && sub.quote_tax_lines) {
    try {
      const lines = JSON.parse(sub.quote_tax_lines) as TaxLine[];
      const taxSum = lines.reduce((s, l) => s + l.amount, 0);
      if (Math.abs(sub.quote_subtotal + taxSum - amount) < 0.011) {
        subtotal = sub.quote_subtotal;
        taxLines = lines;
      }
    } catch {
      /* an unreadable quote: invoice the amount paid with no tax breakdown */
    }
  }

  const id = generateId();
  const number = await nextInvoiceNumber(env, now);
  const period = event.periodStart && event.periodEnd ? `${event.periodStart.slice(0, 10)}/${event.periodEnd.slice(0, 10)}` : null;
  await env.MASTER_DB
    .prepare(
      `INSERT INTO platform_invoices (id, number, tenant_id, subscription_id, period, currency, subtotal, tax_lines, total, status, gateway, gateway_ref, issued_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?)`,
    )
    .bind(id, number, sub.tenant_id, sub.id, period, currency, subtotal, JSON.stringify(taxLines), amount, event.gateway, ref, event.occurredAt)
    .run();
  return { id, number, total: amount, currency, created: true };
}

function moneyText(amount: number, currency: string): string {
  const locale = currency === 'INR' ? 'en-IN' : currency === 'GBP' ? 'en-GB' : 'en-US';
  return formatMoney(amount, currency, locale);
}

/** Keep the agency's seat limit in step with the extra users it is paying for. */
async function syncSeats(env: Env, tenantId: string, subscriptionId: string, extraUsers: number, includedUsers: number | null): Promise<void> {
  await env.MASTER_DB.prepare(`DELETE FROM tenant_addons WHERE tenant_id = ? AND source = 'subscription'`).bind(tenantId).run();
  if (extraUsers > 0) {
    await env.MASTER_DB
      .prepare(
        `INSERT INTO tenant_addons (id, tenant_id, product_key, quantity, units_granted, period_key, source, reference)
         VALUES (?, ?, 'extra_user', ?, 0, NULL, 'subscription', ?)`,
      )
      .bind(generateId(), tenantId, extraUsers, subscriptionId)
      .run();
  }
  if (includedUsers != null) {
    await env.MASTER_DB
      .prepare('UPDATE tenants SET max_users = ? WHERE id = ?')
      .bind(includedUsers + extraUsers, tenantId)
      .run();
  }
}

/** Plan, seats and active status for an agency that has paid. A suspended agency stays suspended. */
async function activateTenant(env: Env, tenant: TenantRow, sub: SubscriptionRow, planKey: string, extraUsers: number): Promise<void> {
  const catalogue = await getCatalogue(env);
  const price = activePriceFrom(catalogue, planKey, marketForCountry(tenant.country));
  await env.MASTER_DB
    .prepare(
      `UPDATE tenants SET plan = ?,
              status = CASE WHEN status IN ('trial', 'active', 'expired') THEN 'active' ELSE status END,
              updated_at = ? WHERE id = ?`,
    )
    .bind(planKey, nowIso(new Date()), tenant.id)
    .run();
  await syncSeats(env, tenant.id, sub.id, extraUsers, price?.includedUsers ?? null);
}

async function recordCustomer(env: Env, tenantId: string, event: BillingEvent): Promise<void> {
  if (!event.customerId) return;
  await env.MASTER_DB
    .prepare('INSERT INTO billing_customers (id, tenant_id, gateway, customer_id) VALUES (?, ?, ?, ?) ON CONFLICT(tenant_id, gateway) DO UPDATE SET customer_id = excluded.customer_id')
    .bind(generateId(), tenantId, event.gateway, event.customerId)
    .run();
}

async function recordPayment(env: Env, sub: SubscriptionRow, event: BillingEvent, status: 'success' | 'failed'): Promise<void> {
  const ref = event.paymentRef ?? event.eventId;
  const exists = await env.MASTER_DB
    .prepare('SELECT 1 AS x FROM subscription_payments WHERE payment_method = ? AND payment_reference = ? AND status = ?')
    .bind(event.gateway, ref, status)
    .first();
  if (exists) return;
  await env.MASTER_DB
    .prepare(
      `INSERT INTO subscription_payments (id, subscription_id, tenant_id, amount, currency, payment_method, payment_reference, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(generateId(), sub.id, sub.tenant_id, event.amount ?? 0, (event.currency || sub.currency || 'INR').toUpperCase(), event.gateway, ref, status, event.occurredAt)
    .run();
}

/**
 * Apply one verified, not-yet-seen event to the subscription and tenant. Throws RetryLater when the agency cannot
 * be identified yet for an event that needs it (the webhook then answers 503 so the provider redelivers).
 */
export async function applyBillingEvent(env: Env, event: BillingEvent, now: Date = new Date()): Promise<ApplyResult> {
  if (event.kind === 'ignored') return { outcome: 'ignored', tenantId: null };

  const tenantId = await resolveTenantId(env, event);
  if (!tenantId) {
    if (event.kind === 'checkout_completed' || event.kind === 'payment_succeeded') {
      throw new RetryLater(`No agency found for ${event.gateway} event ${event.eventId}`);
    }
    return { outcome: 'unresolved', tenantId: null };
  }
  const tenant = (await loadTenant(env, tenantId))!;
  const sub = await ensureSubscription(env, tenant, now);

  const stale = !!sub.last_event_at && event.occurredAt < sub.last_event_at;
  const differentSubscription = !!event.subscriptionId && !!sub.gateway_subscription_id && event.subscriptionId !== sub.gateway_subscription_id;

  await recordCustomer(env, tenantId, event);

  switch (event.kind) {
    case 'checkout_completed':
    case 'payment_succeeded': {
      let invoice: IssuedInvoice | null = null;
      if (event.kind === 'payment_succeeded') {
        invoice = await issueInvoice(env, sub, event, now);
        await recordPayment(env, sub, event, 'success');
      }
      if (stale) {
        // An older event delivered late: the money is recorded, the status stays as the newer events left it.
        if (event.kind === 'payment_succeeded' && event.periodEnd && (!sub.current_period_end || event.periodEnd > sub.current_period_end)) {
          await env.MASTER_DB
            .prepare('UPDATE subscriptions SET current_period_end = ?, next_billing_date = ?, updated_at = ? WHERE id = ?')
            .bind(event.periodEnd, event.periodEnd, nowIso(now), sub.id)
            .run();
        }
        if (invoice?.created) await notifyReceipt(env, tenant, invoice, event);
        return { outcome: 'stale', tenantId };
      }

      const planKey = event.planKey || (sub.plan !== 'trial' ? sub.plan : null);
      if (!planKey) return { outcome: 'no_plan', tenantId };
      const extraUsers = event.extraUsers != null && Number.isFinite(event.extraUsers) ? event.extraUsers : sub.extra_users;
      const periodEnd =
        event.periodEnd && (!sub.current_period_end || event.periodEnd >= sub.current_period_end)
          ? event.periodEnd
          : sub.current_period_end && sub.current_period_end > event.occurredAt
            ? sub.current_period_end
            : addYear(event.occurredAt);
      const superseded = differentSubscription ? sub.gateway_subscription_id : null;

      await env.MASTER_DB
        .prepare(
          `UPDATE subscriptions SET plan = ?, status = 'active', payment_gateway = ?, gateway_subscription_id = COALESCE(?, gateway_subscription_id),
                  amount = COALESCE(?, amount), currency = COALESCE(?, currency), billing_cycle = 'yearly',
                  extra_users = ?, current_period_end = ?, next_billing_date = ?, past_due_since = NULL,
                  cancel_at_period_end = 0, cancelled_at = NULL, last_event_at = ?, updated_at = ?
            WHERE id = ?`,
        )
        .bind(
          planKey, event.gateway, event.subscriptionId ?? null,
          event.amount && event.amount > 0 ? event.amount : null, event.currency ? event.currency.toUpperCase() : null,
          extraUsers, periodEnd, periodEnd, event.occurredAt, nowIso(now), sub.id,
        )
        .run();
      await activateTenant(env, tenant, sub, planKey, extraUsers);
      await invalidateTenantCache(env, tenantId);
      if (invoice?.created) await notifyReceipt(env, tenant, invoice, event);
      return { outcome: event.kind === 'checkout_completed' ? 'activated' : 'paid', tenantId, supersededSubscriptionId: superseded };
    }

    case 'payment_failed': {
      if (differentSubscription) return { outcome: 'superseded', tenantId };
      await recordPayment(env, sub, event, 'failed');
      if (stale) return { outcome: 'stale', tenantId };
      // Only a paying agency has a renewal to fail; a trial, an expired or an ended subscription is left alone.
      if (sub.status !== 'active' && sub.status !== 'past_due') return { outcome: 'not_applicable', tenantId };
      const firstFailure = sub.status !== 'past_due';
      await env.MASTER_DB
        .prepare(`UPDATE subscriptions SET status = 'past_due', past_due_since = COALESCE(past_due_since, ?), last_event_at = ?, updated_at = ? WHERE id = ?`)
        .bind(event.occurredAt, event.occurredAt, nowIso(now), sub.id)
        .run();
      if (firstFailure) await notifyPaymentFailed(env, tenant, event.occurredAt);
      return { outcome: 'past_due', tenantId };
    }

    case 'subscription_cancelled': {
      if (differentSubscription) return { outcome: 'superseded', tenantId };
      if (stale) return { outcome: 'stale', tenantId };
      const periodStillRuns = !!sub.current_period_end && sub.current_period_end > nowIso(now);
      await env.MASTER_DB
        .prepare(`UPDATE subscriptions SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, ?), last_event_at = ?, updated_at = ? WHERE id = ?`)
        .bind(nowIso(now), event.occurredAt, nowIso(now), sub.id)
        .run();
      if (!periodStillRuns) await expireTenant(env, tenantId);
      return { outcome: 'cancelled', tenantId };
    }
  }
  return { outcome: 'ignored', tenantId };
}

async function expireTenant(env: Env, tenantId: string): Promise<void> {
  await env.MASTER_DB
    .prepare(`UPDATE tenants SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'active' AND plan != 'trial'`)
    .bind(nowIso(new Date()), tenantId)
    .run();
  await invalidateTenantCache(env, tenantId);
}

// ----------------------------------------------------------------------------
// Emails (R102 transactional mail; they never fail the webhook)
// ----------------------------------------------------------------------------

async function notifyReceipt(env: Env, tenant: TenantRow, invoice: IssuedInvoice, event: BillingEvent): Promise<void> {
  if (!tenant.owner_email) return;
  await sendTransactional(env, {
    to: tenant.owner_email,
    template: 'payment_receipt',
    tenantId: tenant.id,
    data: {
      agencyName: tenant.company_name,
      invoiceNumber: invoice.number,
      amount: moneyText(invoice.total, invoice.currency),
      paidUntil: event.periodEnd ? event.periodEnd.slice(0, 10) : '',
      billingUrl: `${appUrl(env)}/settings/billing`,
    },
  });
}

async function notifyPaymentFailed(env: Env, tenant: TenantRow, since: string): Promise<void> {
  if (!tenant.owner_email) return;
  const days = graceDays(env);
  await sendTransactional(env, {
    to: tenant.owner_email,
    template: 'payment_failed',
    tenantId: tenant.id,
    data: {
      agencyName: tenant.company_name,
      graceDays: days,
      graceEnds: addDays(since, days).slice(0, 10),
      billingUrl: `${appUrl(env)}/settings/billing`,
    },
  });
}

// ----------------------------------------------------------------------------
// The webhook pipeline (shared by the public route and the mock checkout)
// ----------------------------------------------------------------------------

export interface WebhookOutcome {
  status: 200 | 400 | 503 | 500;
  body: { success: boolean; code?: string; message?: string; data?: Record<string, unknown> };
}

/**
 * Verify, de-duplicate and apply one webhook. The signature is checked over the exact raw body before it is parsed;
 * the billing_events insert is the first write, and only an event whose insert succeeded is processed.
 */
export async function handleWebhook(
  env: Env,
  gateway: BillingGateway,
  headers: Headers,
  rawBody: string,
  options: { now?: Date; cancelOnSuperseded?: boolean } = {},
): Promise<WebhookOutcome> {
  const now = options.now ?? new Date();
  const verified = await gateway.verifyWebhook(headers, rawBody, now);
  if (!verified.ok) {
    if (verified.reason === 'not_configured') {
      return { status: 503, body: { success: false, code: 'BILLING_NOT_CONFIGURED', message: 'This payment gateway is not configured' } };
    }
    return { status: 400, body: { success: false, code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } };
  }

  const event = gateway.parseEvent(rawBody, headers);
  if (!event) return { status: 400, body: { success: false, code: 'INVALID_PAYLOAD', message: 'Unrecognised webhook payload' } };

  const eventRowId = generateId();
  const inserted = await env.MASTER_DB
    .prepare('INSERT OR IGNORE INTO billing_events (id, gateway, event_id, type, payload_hash, received_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(eventRowId, event.gateway, event.eventId, event.type, await sha256Hex(rawBody), nowIso(now))
    .run();
  if ((inserted.meta.changes ?? 0) === 0) {
    const prior = await env.MASTER_DB
      .prepare('SELECT id, processed_at, received_at FROM billing_events WHERE gateway = ? AND event_id = ?')
      .bind(event.gateway, event.eventId)
      .first<{ id: string; processed_at: string | null; received_at: string }>();
    const stuck = !!prior && !prior.processed_at && now.getTime() - new Date(prior.received_at).getTime() > STUCK_EVENT_MS;
    if (!stuck) return { status: 200, body: { success: true, data: { duplicate: true } } };
    // A delivery that began and never finished (the worker was cut off): take it over and finish it.
    await env.MASTER_DB.prepare('UPDATE billing_events SET received_at = ? WHERE id = ?').bind(nowIso(now), prior!.id).run();
    return processInserted(env, gateway, event, prior!.id, now, options.cancelOnSuperseded !== false);
  }
  return processInserted(env, gateway, event, eventRowId, now, options.cancelOnSuperseded !== false);
}

async function processInserted(
  env: Env,
  gateway: BillingGateway,
  event: BillingEvent,
  eventRowId: string,
  now: Date,
  cancelSuperseded: boolean,
): Promise<WebhookOutcome> {
  try {
    const result = await applyBillingEvent(env, event, now);
    await env.MASTER_DB
      .prepare('UPDATE billing_events SET processed_at = ?, outcome = ?, tenant_id = ? WHERE id = ?')
      .bind(nowIso(now), result.outcome, result.tenantId, eventRowId)
      .run();
    if (result.supersededSubscriptionId && cancelSuperseded) {
      // The agency changed plan or seats: the old gateway subscription must stop renewing. Best effort.
      try {
        await gateway.cancelSubscription(result.supersededSubscriptionId, { atPeriodEnd: false });
      } catch (err) {
        console.error(`[billing] could not cancel replaced subscription ${result.supersededSubscriptionId}:`, err instanceof Error ? err.message : err);
      }
    }
    return { status: 200, body: { success: true, data: { outcome: result.outcome } } };
  } catch (err) {
    // Not processed: free the idempotency key so the provider's redelivery is handled.
    await env.MASTER_DB.prepare('DELETE FROM billing_events WHERE id = ?').bind(eventRowId).run().catch(() => undefined);
    if (err instanceof RetryLater) {
      return { status: 503, body: { success: false, code: 'RETRY_LATER', message: err.message } };
    }
    console.error(`[billing] ${event.gateway} event ${event.eventId} failed:`, err instanceof Error ? err.message : err);
    return { status: 500, body: { success: false, code: 'PROCESSING_FAILED', message: 'Could not process the event' } };
  }
}

// ----------------------------------------------------------------------------
// Daily platform job
// ----------------------------------------------------------------------------

export interface BillingDailyResult {
  expired: string[];
  ended: string[];
  trialNotices: number;
}

/**
 * - past_due longer than the grace period: subscription -> expired, agency -> read-only (tenant 'expired')
 * - cancelled (or set to cancel) subscriptions whose paid period has run out: agency -> read-only
 * - trial-ending emails, once per agency, three days before the trial ends
 */
export async function runBillingDaily(env: Env, now: Date = new Date()): Promise<BillingDailyResult> {
  const result: BillingDailyResult = { expired: [], ended: [], trialNotices: 0 };
  const cutoff = new Date(now.getTime() - graceDays(env) * DAY_MS).toISOString();

  const pastDue = await env.MASTER_DB
    .prepare(`SELECT id, tenant_id FROM subscriptions WHERE status = 'past_due' AND past_due_since IS NOT NULL AND past_due_since <= ?`)
    .bind(cutoff)
    .all<{ id: string; tenant_id: string }>();
  for (const row of pastDue.results ?? []) {
    await env.MASTER_DB.prepare(`UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'past_due'`).bind(nowIso(now), row.id).run();
    await expireTenant(env, row.tenant_id);
    result.expired.push(row.tenant_id);
  }

  const ended = await env.MASTER_DB
    .prepare(
      `SELECT id, tenant_id FROM subscriptions
        WHERE (status = 'cancelled' OR (status = 'active' AND cancel_at_period_end = 1))
          AND current_period_end IS NOT NULL AND current_period_end <= ?`,
    )
    .bind(nowIso(now))
    .all<{ id: string; tenant_id: string }>();
  for (const row of ended.results ?? []) {
    await env.MASTER_DB.prepare(`UPDATE subscriptions SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, ?), updated_at = ? WHERE id = ?`).bind(nowIso(now), nowIso(now), row.id).run();
    await expireTenant(env, row.tenant_id);
    result.ended.push(row.tenant_id);
  }

  result.trialNotices = await sendTrialEndingNotices(env, now);
  return result;
}

async function sendTrialEndingNotices(env: Env, now: Date): Promise<number> {
  const soon = addDays(nowIso(now), 3);
  const due = await env.MASTER_DB
    .prepare(
      `SELECT s.id AS sub_id, s.tenant_id, COALESCE(s.trial_ends_at, s.next_billing_date) AS ends_at, t.company_name, t.owner_email
         FROM subscriptions s JOIN tenants t ON t.id = s.tenant_id
        WHERE s.status = 'trial' AND t.plan = 'trial' AND t.status IN ('trial', 'active')
          AND COALESCE(s.trial_ends_at, s.next_billing_date) > ? AND COALESCE(s.trial_ends_at, s.next_billing_date) <= ?`,
    )
    .bind(nowIso(now), soon)
    .all<{ sub_id: string; tenant_id: string; ends_at: string; company_name: string; owner_email: string | null }>();
  let sent = 0;
  for (const row of due.results ?? []) {
    if (!row.owner_email) continue;
    const key = `billing:trial-notice:${row.sub_id}`;
    if (await env.CACHE.get(key)) continue;
    await env.CACHE.put(key, '1', { expirationTtl: 10 * DAY_MS / 1000 });
    const daysLeft = Math.max(1, Math.ceil((new Date(row.ends_at).getTime() - now.getTime()) / DAY_MS));
    await sendTransactional(env, {
      to: row.owner_email,
      template: 'trial_ending',
      tenantId: row.tenant_id,
      data: { agencyName: row.company_name, daysLeft, endsOn: row.ends_at.slice(0, 10), billingUrl: `${appUrl(env)}/settings/billing` },
    });
    sent++;
  }
  return sent;
}
