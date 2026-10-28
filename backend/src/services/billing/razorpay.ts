/**
 * Razorpay (India, INR): the Subscriptions API over REST with basic auth, and the X-Razorpay-Signature webhook
 * check. No SDK.
 *
 *   X-Razorpay-Signature = hex(HMAC-SHA256(RAZORPAY_WEBHOOK_SECRET, rawBody))
 *   X-Razorpay-Event-Id  = the event's unique id (the idempotency key)
 *
 * Razorpay plans are fixed-amount, so each checkout creates a yearly plan for the exact amount the agency was
 * quoted (plan price plus extra users plus tax) and a subscription on it.
 */

import type { Env } from '../../types';
import {
  GatewayError,
  fromMinorUnits,
  hmacSha256Hex,
  isoFromSeconds,
  safeEqual,
  toMinorUnits,
  type BillingEvent,
  type BillingGateway,
  type CheckoutParams,
  type CheckoutResult,
  type FetchLike,
  type OrderCheckoutParams,
  type VerifyResult,
} from './gateway';

export const RAZORPAY_API = 'https://api.razorpay.com/v1';
/** A yearly subscription Razorpay keeps renewing for this many years unless cancelled. */
export const RAZORPAY_TOTAL_COUNT = 10;

type RazorpayEnv = Pick<Env, 'RAZORPAY_KEY_ID' | 'RAZORPAY_KEY_SECRET' | 'RAZORPAY_WEBHOOK_SECRET'>;

function basicAuth(id: string, secret: string): string {
  return `Basic ${btoa(`${id}:${secret}`)}`;
}

export class RazorpayGateway implements BillingGateway {
  readonly id = 'razorpay' as const;

  constructor(
    private readonly env: RazorpayEnv,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  isConfigured(): boolean {
    return !!this.env.RAZORPAY_KEY_ID && !!this.env.RAZORPAY_KEY_SECRET && !!this.env.RAZORPAY_WEBHOOK_SECRET;
  }

  private async post<T>(path: string, payload: unknown): Promise<T> {
    const id = this.env.RAZORPAY_KEY_ID;
    const secret = this.env.RAZORPAY_KEY_SECRET;
    if (!id || !secret) throw new GatewayError('Razorpay is not configured');
    const res = await this.fetchImpl(`${RAZORPAY_API}${path}`, {
      method: 'POST',
      headers: { Authorization: basicAuth(id, secret), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new GatewayError(json?.error?.description ?? `Razorpay request failed (${res.status})`, res.status);
    return json as T;
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const { quote, tenantId } = params;
    let customerId = params.customerId ?? null;
    if (!customerId && quote.customerEmail) {
      const customer = await this.post<{ id: string }>('/customers', {
        name: quote.customerName || undefined,
        email: quote.customerEmail,
        fail_existing: '0',
        notes: { tenant_id: tenantId },
      });
      customerId = customer.id;
    }
    const plan = await this.post<{ id: string }>('/plans', {
      period: 'yearly',
      interval: 1,
      item: {
        name: `TravelCRM Pro ${quote.planName} (yearly)`,
        amount: toMinorUnits(quote.total, quote.currency),
        currency: quote.currency.toUpperCase(),
      },
      notes: { tenant_id: tenantId, plan_key: quote.planKey, extra_users: String(quote.extraUsers) },
    });
    const subscription = await this.post<{ id: string; short_url?: string }>('/subscriptions', {
      plan_id: plan.id,
      total_count: RAZORPAY_TOTAL_COUNT,
      customer_notify: 1,
      ...(customerId ? { customer_id: customerId } : {}),
      notes: { tenant_id: tenantId, plan_key: quote.planKey, extra_users: String(quote.extraUsers) },
    });
    if (!subscription.short_url) throw new GatewayError('Razorpay did not return a payment link');
    return { url: subscription.short_url, reference: subscription.id, customerId };
  }

  /** A one-off payment: a Payment Link whose reference_id and notes carry our order id. */
  async createOrderCheckout(params: OrderCheckoutParams): Promise<CheckoutResult> {
    const link = await this.post<{ id: string; short_url?: string }>('/payment_links', {
      amount: toMinorUnits(params.total, params.currency),
      currency: params.currency.toUpperCase(),
      accept_partial: false,
      reference_id: params.orderId,
      description: params.description,
      ...(params.customerEmail ? { customer: { name: params.customerName || undefined, email: params.customerEmail } } : {}),
      notify: { email: false, sms: false },
      callback_url: params.successUrl,
      callback_method: 'get',
      notes: { tenant_id: params.tenantId, addon_order_id: params.orderId },
    });
    if (!link.short_url) throw new GatewayError('Razorpay did not return a payment link');
    return { url: link.short_url, reference: link.id, customerId: params.customerId ?? null };
  }

  async verifyWebhook(headers: Headers, rawBody: string): Promise<VerifyResult> {
    const secret = this.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return { ok: false, reason: 'not_configured' };
    const signature = headers.get('x-razorpay-signature');
    if (!signature) return { ok: false, reason: 'missing_signature' };
    const expected = await hmacSha256Hex(secret, rawBody);
    return safeEqual(signature.trim().toLowerCase(), expected) ? { ok: true } : { ok: false, reason: 'bad_signature' };
  }

  parseEvent(rawBody: string, headers?: Headers): BillingEvent | null {
    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!event || typeof event.event !== 'string') return null;
    const subscription = event.payload?.subscription?.entity;
    const payment = event.payload?.payment?.entity;
    const paymentLink = event.payload?.payment_link?.entity;
    const notes: Record<string, string> = {
      ...(payment?.notes && !Array.isArray(payment.notes) ? payment.notes : {}),
      ...(paymentLink?.notes && !Array.isArray(paymentLink.notes) ? paymentLink.notes : {}),
      ...(subscription?.notes && !Array.isArray(subscription.notes) ? subscription.notes : {}),
    };
    // An add-on purchase (Payment Link): its events carry our order id and never touch the subscription.
    const orderId = notes.addon_order_id ?? (paymentLink?.reference_id as string | undefined) ?? null;
    const occurredAt = isoFromSeconds(event.created_at) ?? new Date().toISOString();
    // Razorpay puts the unique id in a header; fall back to a stable id built from the payload.
    const eventId =
      headers?.get('x-razorpay-event-id') ||
      `${event.event}:${subscription?.id ?? payment?.id ?? 'none'}:${payment?.id ?? ''}:${event.created_at ?? ''}`;

    const base = {
      gateway: 'razorpay' as const,
      eventId,
      type: event.event as string,
      occurredAt,
      tenantId: notes.tenant_id ?? null,
      planKey: notes.plan_key ?? null,
      extraUsers: notes.extra_users !== undefined ? Number(notes.extra_users) : null,
      customerId: (subscription?.customer_id ?? payment?.customer_id ?? null) as string | null,
      subscriptionId: (subscription?.id ?? null) as string | null,
    };

    if (orderId && (event.event === 'payment_link.paid' || event.event === 'payment_link.expired' || event.event === 'payment_link.cancelled' || event.event === 'payment.failed')) {
      const paid = event.event === 'payment_link.paid';
      const amountMinor = paid ? payment?.amount ?? paymentLink?.amount_paid : payment?.amount ?? paymentLink?.amount;
      return {
        ...base,
        kind: paid ? 'order_paid' : 'order_failed',
        planKey: null,
        extraUsers: null,
        orderId,
        subscriptionId: null,
        amount: amountMinor != null ? fromMinorUnits(Number(amountMinor), payment?.currency ?? paymentLink?.currency ?? 'INR') : null,
        currency: payment?.currency ?? paymentLink?.currency ?? 'INR',
        paymentRef: payment?.id ?? paymentLink?.id ?? null,
      };
    }

    switch (event.event) {
      case 'subscription.charged':
        return {
          ...base,
          kind: 'payment_succeeded',
          amount: payment ? fromMinorUnits(Number(payment.amount ?? 0), payment.currency ?? 'INR') : null,
          currency: payment?.currency ?? 'INR',
          paymentRef: payment?.id ?? null,
          periodStart: isoFromSeconds(subscription?.current_start),
          periodEnd: isoFromSeconds(subscription?.current_end),
        };
      case 'subscription.halted':
        return { ...base, kind: 'payment_failed', paymentRef: null };
      case 'payment.failed':
        return {
          ...base,
          kind: 'payment_failed',
          amount: payment ? fromMinorUnits(Number(payment.amount ?? 0), payment.currency ?? 'INR') : null,
          currency: payment?.currency ?? 'INR',
          paymentRef: payment?.id ?? null,
        };
      case 'subscription.cancelled':
        return { ...base, kind: 'subscription_cancelled' };
      default:
        return { ...base, kind: 'ignored' };
    }
  }

  async cancelSubscription(subscriptionId: string, opts: { atPeriodEnd?: boolean } = {}): Promise<void> {
    await this.post(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
      cancel_at_cycle_end: opts.atPeriodEnd === false ? 0 : 1,
    });
  }
}

