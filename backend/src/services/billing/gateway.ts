/**
 * The one interface every payment gateway implements (R205).
 *
 * Razorpay serves agencies in India, Stripe everyone else, and a mock gateway serves local development and
 * tests. Nothing outside services/billing/ knows which provider is behind a checkout: routes and the
 * subscription state machine only see BillingEvent, a provider-neutral event.
 *
 * No provider SDK is used: every gateway talks to its REST API with fetch and verifies webhook signatures with
 * Web Crypto over the exact raw request body. Card data never reaches this server; only provider customer and
 * subscription ids are stored.
 */

import type { Env } from '../../types';
import { isTestMode } from '../../utils/test-mode';
import { normalizeCountry } from '../tax-calculator';
import { marketForCountry } from '../plans/catalogue';

export type GatewayId = 'razorpay' | 'stripe' | 'mock';

export const GATEWAY_IDS: readonly GatewayId[] = ['razorpay', 'stripe', 'mock'];

export function isGatewayId(value: string): value is GatewayId {
  return (GATEWAY_IDS as readonly string[]).includes(value);
}

/** What the agency is buying: a plan for a year, plus extra users. Amounts are in major units (rupees, pounds). */
export interface CheckoutQuote {
  planKey: string;
  planName: string;
  currency: string;
  extraUsers: number;
  /** Plan price plus extra users, before tax. */
  subtotal: number;
  /** What the agency is charged each year: subtotal plus tax. */
  total: number;
  customerEmail?: string | null;
  customerName?: string | null;
}

export interface CheckoutParams {
  tenantId: string;
  quote: CheckoutQuote;
  /** A customer id this gateway already issued for the agency, when there is one. */
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  /** Where the agency pays (opened in the browser). */
  url: string;
  /** The provider's id for the checkout or subscription this created. */
  reference: string;
  customerId?: string | null;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'bad_signature' | 'stale_timestamp' | 'missing_signature' };

/**
 * A provider event reduced to what the subscription state machine needs.
 *
 *  checkout_completed       the agency finished paying the first time (activates the plan and seats)
 *  payment_succeeded        a period was paid (first payment or a renewal): extends the period, issues an invoice
 *  payment_failed           a renewal charge failed: starts the grace period
 *  subscription_cancelled   the subscription ended at the provider
 *  ignored                  a verified event this system has no use for (acknowledged, nothing changes)
 */
export type BillingEventKind =
  | 'checkout_completed'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'subscription_cancelled'
  | 'order_paid'
  | 'order_failed'
  | 'ignored';

/**
 * A one-off payment for an add-on (R206): extra users, an AI credit pack or a communication pack.
 *  order_paid     the one-off payment succeeded (credits the pack, exactly once)
 *  order_failed   the one-off payment failed or the checkout expired (credits nothing)
 */
export interface OrderCheckoutParams {
  tenantId: string;
  /** Our addon_orders id: carried through the provider and returned in its webhook. */
  orderId: string;
  description: string;
  currency: string;
  /** Major units, tax included. */
  total: number;
  customerEmail?: string | null;
  customerName?: string | null;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface BillingEvent {
  gateway: GatewayId;
  /** The provider's unique id for this event: the idempotency key. */
  eventId: string;
  /** The provider's own event type, for the log. */
  type: string;
  kind: BillingEventKind;
  /** When the provider says this happened (ISO). Used to ignore events that arrive out of order. */
  occurredAt: string;
  tenantId?: string | null;
  planKey?: string | null;
  extraUsers?: number | null;
  /** Our addon_orders id, on order_paid / order_failed. */
  orderId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  /** Major units. */
  amount?: number | null;
  currency?: string | null;
  /** The provider's id for the payment or invoice (the invoice reference). */
  paymentRef?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}

export interface BillingGateway {
  readonly id: GatewayId;
  /** True when the credentials this gateway needs are present. */
  isConfigured(): boolean;
  createCheckout(params: CheckoutParams): Promise<CheckoutResult>;
  /** A one-off payment (add-on purchase): Stripe Checkout in payment mode, a Razorpay Payment Link. */
  createOrderCheckout(params: OrderCheckoutParams): Promise<CheckoutResult>;
  /** Check the signature over the exact raw body. Called before the body is parsed. */
  verifyWebhook(headers: Headers, rawBody: string, now?: Date): Promise<VerifyResult>;
  /** Null when the body is not an event this gateway understands. */
  parseEvent(rawBody: string, headers?: Headers): BillingEvent | null;
  /** Stop renewals. With atPeriodEnd the agency keeps what it paid for until the period ends. */
  cancelSubscription(subscriptionId: string, opts?: { atPeriodEnd?: boolean }): Promise<void>;
}

// ----------------------------------------------------------------------------
// Market and gateway selection
// ----------------------------------------------------------------------------

export { marketForCountry };

/**
 * Which gateway collects from an agency: BILLING_GATEWAY=mock overrides (never in production); otherwise an
 * agency in India (or with no country recorded: the product started in India) pays through Razorpay and every
 * other country through Stripe.
 */
export function gatewayIdForCountry(env: Pick<Env, 'BILLING_GATEWAY' | 'ENVIRONMENT' | 'TEST_MODE'>, country: string | null | undefined): GatewayId {
  if (env.BILLING_GATEWAY === 'mock' && env.ENVIRONMENT !== 'production') return 'mock';
  const code = normalizeCountry(country);
  return !code || code === 'IN' ? 'razorpay' : 'stripe';
}

// ----------------------------------------------------------------------------
// Web Crypto helpers shared by the gateways
// ----------------------------------------------------------------------------

const encoder = new TextEncoder();

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (const b of view) out += b.toString(16).padStart(2, '0');
  return out;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

export async function sha256Hex(message: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(message)));
}

/** Compare two strings without exiting at the first difference. */
export function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Major units to the currency's smallest unit (paise, cents), for the gateways that want integers. */
export function toMinorUnits(amount: number, currency: string): number {
  const zero = new Set(['JPY', 'KRW', 'VND']);
  const factor = zero.has(currency.toUpperCase()) ? 1 : 100;
  return Math.round(Number((amount * factor).toPrecision(12)));
}

export function fromMinorUnits(minor: number, currency: string): number {
  const zero = new Set(['JPY', 'KRW', 'VND']);
  return zero.has(currency.toUpperCase()) ? minor : Math.round(minor) / 100;
}

export function isoFromSeconds(seconds: unknown): string | null {
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class GatewayError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'GatewayError';
  }
}

/** True when this environment may use the mock gateway. */
export function mockAllowed(env: Pick<Env, 'ENVIRONMENT' | 'TEST_MODE' | 'BILLING_GATEWAY'>): boolean {
  return env.ENVIRONMENT !== 'production' && (isTestMode(env) || env.BILLING_GATEWAY === 'mock');
}
