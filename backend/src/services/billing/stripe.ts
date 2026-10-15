/**
 * Stripe (every country except India): Checkout Sessions in subscription mode over the REST API, and the
 * Stripe-Signature webhook check. No SDK.
 *
 *   Stripe-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>...]
 *   v1 = HMAC-SHA256(STRIPE_WEBHOOK_SECRET, `${t}.${rawBody}`), accepted when t is within 300 seconds of now.
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
  type VerifyResult,
} from './gateway';

export const STRIPE_API = 'https://api.stripe.com/v1';
export const STRIPE_TOLERANCE_SECONDS = 300;

type StripeEnv = Pick<Env, 'STRIPE_SECRET_KEY' | 'STRIPE_WEBHOOK_SECRET'>;

/** Stripe's form encoding: nested keys as a[b][c]=value. */
export function stripeForm(fields: Record<string, string | number | undefined | null>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') body.append(key, String(value));
  }
  return body.toString();
}

/** The Stripe-Signature header Stripe would send for this body (used by tests and the mock tools). */
export async function stripeSignatureHeader(secret: string, rawBody: string, timestampSeconds: number): Promise<string> {
  return `t=${timestampSeconds},v1=${await hmacSha256Hex(secret, `${timestampSeconds}.${rawBody}`)}`;
}

function metaOf(...candidates: unknown[]): Record<string, string> {
  for (const c of candidates) {
    if (c && typeof c === 'object' && Object.keys(c as object).length > 0) return c as Record<string, string>;
  }
  return {};
}

export class StripeGateway implements BillingGateway {
  readonly id = 'stripe' as const;

  constructor(
    private readonly env: StripeEnv,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  isConfigured(): boolean {
    return !!this.env.STRIPE_SECRET_KEY && !!this.env.STRIPE_WEBHOOK_SECRET;
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const key = this.env.STRIPE_SECRET_KEY;
    if (!key) throw new GatewayError('Stripe is not configured');
    const { quote, tenantId } = params;
    const metadata = { tenant_id: tenantId, plan_key: quote.planKey, extra_users: String(quote.extraUsers) };
    const form = stripeForm({
      mode: 'subscription',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      client_reference_id: tenantId,
      customer: params.customerId ?? undefined,
      customer_email: params.customerId ? undefined : quote.customerEmail ?? undefined,
      'line_items[0][quantity]': 1,
      'line_items[0][price_data][currency]': quote.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': toMinorUnits(quote.total, quote.currency),
      'line_items[0][price_data][recurring][interval]': 'year',
      'line_items[0][price_data][product_data][name]': `TravelCRM Pro ${quote.planName} (yearly)`,
      'metadata[tenant_id]': metadata.tenant_id,
      'metadata[plan_key]': metadata.plan_key,
      'metadata[extra_users]': metadata.extra_users,
      'subscription_data[metadata][tenant_id]': metadata.tenant_id,
      'subscription_data[metadata][plan_key]': metadata.plan_key,
      'subscription_data[metadata][extra_users]': metadata.extra_users,
    });
    const res = await this.fetchImpl(`${STRIPE_API}/checkout/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; url?: string; customer?: string | null; error?: { message?: string } };
    if (!res.ok || !json.url || !json.id) {
      throw new GatewayError(json.error?.message ?? `Stripe checkout failed (${res.status})`, res.status);
    }
    return { url: json.url, reference: json.id, customerId: json.customer ?? null };
  }

  async verifyWebhook(headers: Headers, rawBody: string, now: Date = new Date()): Promise<VerifyResult> {
    const secret = this.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return { ok: false, reason: 'not_configured' };
    const header = headers.get('stripe-signature');
    if (!header) return { ok: false, reason: 'missing_signature' };

    let timestamp = NaN;
    const signatures: string[] = [];
    for (const part of header.split(',')) {
      const [k, v] = part.trim().split('=');
      if (k === 't') timestamp = Number(v);
      else if (k === 'v1' && v) signatures.push(v);
    }
    if (!Number.isFinite(timestamp) || signatures.length === 0) return { ok: false, reason: 'bad_signature' };

    const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
    // The signature first, so a forged request is told nothing about the clock.
    if (!signatures.some((s) => safeEqual(s, expected))) return { ok: false, reason: 'bad_signature' };
    if (Math.abs(now.getTime() / 1000 - timestamp) > STRIPE_TOLERANCE_SECONDS) return { ok: false, reason: 'stale_timestamp' };
    return { ok: true };
  }

  parseEvent(rawBody: string): BillingEvent | null {
    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') return null;
    const obj = event.data?.object ?? {};
    const base = {
      gateway: 'stripe' as const,
      eventId: event.id as string,
      type: event.type as string,
      occurredAt: isoFromSeconds(event.created) ?? new Date().toISOString(),
    };

    switch (event.type) {
      case 'checkout.session.completed': {
        const meta = metaOf(obj.metadata);
        const paid = obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required';
        return {
          ...base,
          kind: obj.mode === 'subscription' && paid ? 'checkout_completed' : 'ignored',
          tenantId: obj.client_reference_id ?? meta.tenant_id ?? null,
          planKey: meta.plan_key ?? null,
          extraUsers: meta.extra_users !== undefined ? Number(meta.extra_users) : null,
          customerId: typeof obj.customer === 'string' ? obj.customer : null,
          subscriptionId: typeof obj.subscription === 'string' ? obj.subscription : null,
          amount: typeof obj.amount_total === 'number' ? fromMinorUnits(obj.amount_total, obj.currency ?? 'usd') : null,
          currency: obj.currency ? String(obj.currency).toUpperCase() : null,
        };
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const line = obj.lines?.data?.[0];
        const meta = metaOf(obj.subscription_details?.metadata, obj.parent?.subscription_details?.metadata, line?.metadata, obj.metadata);
        const subscription =
          typeof obj.subscription === 'string'
            ? obj.subscription
            : typeof obj.parent?.subscription_details?.subscription === 'string'
              ? obj.parent.subscription_details.subscription
              : null;
        const paid = event.type === 'invoice.paid';
        const currency = obj.currency ?? 'usd';
        return {
          ...base,
          kind: paid ? 'payment_succeeded' : 'payment_failed',
          tenantId: meta.tenant_id ?? null,
          planKey: meta.plan_key ?? null,
          extraUsers: meta.extra_users !== undefined ? Number(meta.extra_users) : null,
          customerId: typeof obj.customer === 'string' ? obj.customer : null,
          subscriptionId: subscription,
          amount: fromMinorUnits(Number(paid ? obj.amount_paid ?? 0 : obj.amount_due ?? 0), currency),
          currency: String(currency).toUpperCase(),
          paymentRef: typeof obj.id === 'string' ? obj.id : null,
          periodStart: isoFromSeconds(line?.period?.start ?? obj.period_start),
          periodEnd: isoFromSeconds(line?.period?.end ?? obj.period_end),
        };
      }
      case 'customer.subscription.deleted': {
        const meta = metaOf(obj.metadata);
        return {
          ...base,
          kind: 'subscription_cancelled',
          tenantId: meta.tenant_id ?? null,
          customerId: typeof obj.customer === 'string' ? obj.customer : null,
          subscriptionId: typeof obj.id === 'string' ? obj.id : null,
        };
      }
      default:
        return { ...base, kind: 'ignored' };
    }
  }

  async cancelSubscription(subscriptionId: string, opts: { atPeriodEnd?: boolean } = {}): Promise<void> {
    const key = this.env.STRIPE_SECRET_KEY;
    if (!key) throw new GatewayError('Stripe is not configured');
    const atEnd = opts.atPeriodEnd !== false;
    const url = `${STRIPE_API}/subscriptions/${encodeURIComponent(subscriptionId)}`;
    const res = atEnd
      ? await this.fetchImpl(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: stripeForm({ cancel_at_period_end: 'true' }),
        })
      : await this.fetchImpl(url, { method: 'DELETE', headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new GatewayError(json.error?.message ?? `Stripe cancel failed (${res.status})`, res.status);
    }
  }
}
