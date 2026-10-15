/**
 * An agency collecting from ITS customers through its OWN Razorpay or Stripe account (R207).
 *
 * This is a different money flow from the platform's subscription billing (services/billing): the keys are the
 * agency's, the payers are the agency's customers and the money goes straight to the agency, never through the
 * platform. Nothing here reads or writes platform billing tables. Only the low-level helpers are shared with the
 * platform gateways: REST conventions, minor units and the webhook signature checks (the platform gateway classes
 * are instantiated with the agency's secrets, so there is one implementation of each signature scheme).
 *
 * No provider SDK: fetch and Web Crypto. Every function takes the fetch implementation so tests mock it.
 */

import {
  GatewayError,
  fromMinorUnits,
  toMinorUnits,
  type FetchLike,
  type VerifyResult,
} from '../billing/gateway';
import { RAZORPAY_API, RazorpayGateway } from '../billing/razorpay';
import { STRIPE_API, StripeGateway, stripeForm } from '../billing/stripe';

export type AgencyGatewayId = 'razorpay' | 'stripe';
export const AGENCY_GATEWAYS: readonly AgencyGatewayId[] = ['razorpay', 'stripe'];

export function isAgencyGateway(value: string): value is AgencyGatewayId {
  return (AGENCY_GATEWAYS as readonly string[]).includes(value);
}

/** The agency's decrypted credentials for one gateway. */
export interface AgencyCredentials {
  gateway: AgencyGatewayId;
  /** Razorpay key id (rzp_test_... / rzp_live_...); optional for Stripe. */
  keyId: string | null;
  /** Razorpay key secret / Stripe secret key. */
  secret: string;
  webhookSecret: string | null;
}

export interface PaymentLinkParams {
  /** Our id for this link: unique per link, carried through the provider (Razorpay reference_id). */
  linkRef: string;
  invoiceId: string;
  invoiceNumber: string;
  /** Major units, tax included: the balance due. */
  amount: number;
  currency: string;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
}

export interface PaymentLinkResult {
  /** The provider's id for the link. */
  id: string;
  url: string;
}

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

function razorpayAuth(creds: AgencyCredentials): string {
  return `Basic ${btoa(`${creds.keyId ?? ''}:${creds.secret}`)}`;
}

async function readJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

// ----------------------------------------------------------------------------
// Create / cancel a link
// ----------------------------------------------------------------------------

export async function createPaymentLink(
  creds: AgencyCredentials,
  params: PaymentLinkParams,
  fetchImpl: FetchLike = defaultFetch,
): Promise<PaymentLinkResult> {
  const currency = params.currency.toUpperCase();
  const minor = toMinorUnits(params.amount, currency);
  if (!(minor > 0)) throw new GatewayError('Nothing to collect on this invoice');
  const description = `Invoice ${params.invoiceNumber}`;

  if (creds.gateway === 'razorpay') {
    const phone = (params.customerPhone ?? '').replace(/[^\d+]/g, '');
    const customer: Record<string, string> = {};
    if (params.customerName) customer.name = params.customerName;
    if (params.customerEmail) customer.email = params.customerEmail;
    if (phone.length >= 8) customer.contact = phone;
    const res = await fetchImpl(`${RAZORPAY_API}/payment_links`, {
      method: 'POST',
      headers: { Authorization: razorpayAuth(creds), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: minor,
        currency,
        accept_partial: false,
        reference_id: params.linkRef,
        description,
        ...(Object.keys(customer).length ? { customer } : {}),
        // We send the link ourselves through the Communication Hub; Razorpay must not message the customer too.
        notify: { email: false, sms: false },
        reminder_enable: false,
        notes: { invoice_id: params.invoiceId, invoice_number: params.invoiceNumber },
      }),
    });
    const json = await readJson(res);
    if (!res.ok || !json?.id || !json?.short_url) {
      throw new GatewayError(json?.error?.description ?? `Razorpay request failed (${res.status})`, res.status);
    }
    return { id: String(json.id), url: String(json.short_url) };
  }

  // Stripe: a Payment Link needs a Price; create one with its product inline, then the link.
  const auth = { Authorization: `Bearer ${creds.secret}`, 'Content-Type': 'application/x-www-form-urlencoded' };
  const priceRes = await fetchImpl(`${STRIPE_API}/prices`, {
    method: 'POST',
    headers: auth,
    body: stripeForm({
      currency: currency.toLowerCase(),
      unit_amount: minor,
      'product_data[name]': description,
      'metadata[invoice_id]': params.invoiceId,
    }),
  });
  const price = await readJson(priceRes);
  if (!priceRes.ok || !price?.id) throw new GatewayError(price?.error?.message ?? `Stripe request failed (${priceRes.status})`, priceRes.status);

  const linkRes = await fetchImpl(`${STRIPE_API}/payment_links`, {
    method: 'POST',
    headers: auth,
    body: stripeForm({
      'line_items[0][price]': price.id,
      'line_items[0][quantity]': 1,
      'metadata[invoice_id]': params.invoiceId,
      'metadata[invoice_number]': params.invoiceNumber,
      'metadata[link_ref]': params.linkRef,
      'payment_intent_data[metadata][invoice_id]': params.invoiceId,
    }),
  });
  const link = await readJson(linkRes);
  if (!linkRes.ok || !link?.id || !link?.url) throw new GatewayError(link?.error?.message ?? `Stripe request failed (${linkRes.status})`, linkRes.status);
  return { id: String(link.id), url: String(link.url) };
}

/** Stop a link from being paid (a newer link replaced it, or the invoice was settled otherwise). Best effort. */
export async function cancelPaymentLink(creds: AgencyCredentials, linkId: string, fetchImpl: FetchLike = defaultFetch): Promise<boolean> {
  try {
    if (creds.gateway === 'razorpay') {
      const res = await fetchImpl(`${RAZORPAY_API}/payment_links/${encodeURIComponent(linkId)}/cancel`, {
        method: 'POST',
        headers: { Authorization: razorpayAuth(creds), 'Content-Type': 'application/json' },
        body: '{}',
      });
      return res.ok;
    }
    const res = await fetchImpl(`${STRIPE_API}/payment_links/${encodeURIComponent(linkId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.secret}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: stripeForm({ active: 'false' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** "Test connection": a harmless authenticated read. Never throws; the message is safe to show. */
export async function testConnection(
  creds: AgencyCredentials,
  fetchImpl: FetchLike = defaultFetch,
): Promise<{ ok: boolean; message: string }> {
  try {
    const res =
      creds.gateway === 'razorpay'
        ? await fetchImpl(`${RAZORPAY_API}/payment_links?count=1`, { method: 'GET', headers: { Authorization: razorpayAuth(creds) } })
        : await fetchImpl(`${STRIPE_API}/payment_links?limit=1`, { method: 'GET', headers: { Authorization: `Bearer ${creds.secret}` } });
    if (res.ok) return { ok: true, message: 'Connected' };
    const json = await readJson(res);
    const detail = json?.error?.description ?? json?.error?.message ?? `HTTP ${res.status}`;
    return { ok: false, message: res.status === 401 ? 'The gateway rejected these keys' : String(detail).slice(0, 200) };
  } catch {
    return { ok: false, message: 'Could not reach the gateway' };
  }
}

// ----------------------------------------------------------------------------
// Webhooks
// ----------------------------------------------------------------------------

/** Check the signature over the exact raw body with THIS agency's webhook secret (same scheme as the platform's). */
export async function verifyAgencyWebhook(
  creds: Pick<AgencyCredentials, 'gateway' | 'webhookSecret'>,
  headers: Headers,
  rawBody: string,
  now?: Date,
): Promise<VerifyResult> {
  if (!creds.webhookSecret) return { ok: false, reason: 'not_configured' };
  if (creds.gateway === 'razorpay') {
    return new RazorpayGateway({ RAZORPAY_WEBHOOK_SECRET: creds.webhookSecret }).verifyWebhook(headers, rawBody);
  }
  return new StripeGateway({ STRIPE_WEBHOOK_SECRET: creds.webhookSecret }).verifyWebhook(headers, rawBody, now);
}

/**
 * A provider event reduced to what an invoice needs.
 *  paid      the customer paid (record the payment once)
 *  closed    the link ended without payment (expired or cancelled)
 *  ignored   a verified event with no use here
 */
export interface AgencyPaymentEvent {
  gateway: AgencyGatewayId;
  /** The provider's unique id for this event: the idempotency key. */
  eventId: string;
  type: string;
  kind: 'paid' | 'closed' | 'ignored';
  invoiceId: string | null;
  linkId: string | null;
  /** Major units. */
  amount: number | null;
  currency: string | null;
  /** The provider's id for the payment: stored as the payment reference, a second guard against double recording. */
  paymentRef: string | null;
  closedStatus?: 'expired' | 'cancelled';
}

export function parseAgencyEvent(gateway: AgencyGatewayId, rawBody: string, headers: Headers): AgencyPaymentEvent | null {
  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!event || typeof event !== 'object') return null;

  if (gateway === 'razorpay') {
    if (typeof event.event !== 'string') return null;
    const link = event.payload?.payment_link?.entity;
    const payment = event.payload?.payment?.entity;
    const notes = { ...(payment?.notes && !Array.isArray(payment.notes) ? payment.notes : {}), ...(link?.notes && !Array.isArray(link.notes) ? link.notes : {}) } as Record<string, string>;
    // Razorpay's id is a header; fall back to a stable id built from the payload so a replay still collides.
    const eventId = headers.get('x-razorpay-event-id') || `${event.event}:${link?.id ?? 'none'}:${payment?.id ?? ''}:${event.created_at ?? ''}`;
    const base = {
      gateway,
      eventId,
      type: event.event as string,
      invoiceId: (notes.invoice_id as string | undefined) ?? null,
      linkId: (link?.id as string | undefined) ?? null,
    };
    if (event.event === 'payment_link.paid') {
      const currency = String(payment?.currency ?? link?.currency ?? '').toUpperCase() || null;
      const minor = payment?.amount ?? link?.amount_paid;
      return {
        ...base,
        kind: 'paid',
        amount: minor != null && currency ? fromMinorUnits(Number(minor), currency) : null,
        currency,
        paymentRef: (payment?.id as string | undefined) ?? null,
      };
    }
    if (event.event === 'payment_link.expired' || event.event === 'payment_link.cancelled') {
      return { ...base, kind: 'closed', closedStatus: event.event === 'payment_link.expired' ? 'expired' : 'cancelled', amount: null, currency: null, paymentRef: null };
    }
    // payment.captured, payment.authorized, order.paid ... all describe the same payment as payment_link.paid
    // (a different event id): ignoring them is what keeps a payment from being recorded twice.
    return { ...base, kind: 'ignored', amount: null, currency: null, paymentRef: null };
  }

  if (typeof event.id !== 'string' || typeof event.type !== 'string') return null;
  const obj = event.data?.object ?? {};
  const meta = (obj.metadata && typeof obj.metadata === 'object' ? obj.metadata : {}) as Record<string, string>;
  const base = {
    gateway,
    eventId: event.id as string,
    type: event.type as string,
    invoiceId: meta.invoice_id ?? null,
    linkId: typeof obj.payment_link === 'string' ? obj.payment_link : null,
  };
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const paid = obj.payment_status === 'paid';
    const currency = obj.currency ? String(obj.currency).toUpperCase() : null;
    if (!paid || !meta.invoice_id) return { ...base, kind: 'ignored', amount: null, currency, paymentRef: null };
    return {
      ...base,
      kind: 'paid',
      amount: typeof obj.amount_total === 'number' && currency ? fromMinorUnits(obj.amount_total, currency) : null,
      currency,
      paymentRef: typeof obj.payment_intent === 'string' ? obj.payment_intent : typeof obj.id === 'string' ? obj.id : null,
    };
  }
  return { ...base, kind: 'ignored', amount: null, currency: null, paymentRef: null };
}
