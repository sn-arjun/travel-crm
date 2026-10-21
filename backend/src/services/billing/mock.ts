/**
 * Mock gateway for local development and tests (never in production).
 *
 * createCheckout returns a link to this server's own /billing/mock-checkout page. Opening it (TEST_MODE or
 * BILLING_GATEWAY=mock only) plays what a real provider would: it signs checkout and payment events with the mock
 * secret and delivers them to the same webhook pipeline the real gateways use, then redirects to the success URL.
 *
 *   X-Mock-Signature = hex(HMAC-SHA256(secret, rawBody))
 */

import type { Env } from '../../types';
import {
  hmacSha256Hex,
  mockAllowed,
  safeEqual,
  type BillingEvent,
  type BillingEventKind,
  type BillingGateway,
  type CheckoutParams,
  type CheckoutResult,
  type OrderCheckoutParams,
  type VerifyResult,
} from './gateway';
import { generateId } from '../../utils/uuid';

type MockEnv = Pick<Env, 'BILLING_MOCK_SECRET' | 'ENVIRONMENT' | 'TEST_MODE' | 'BILLING_GATEWAY' | 'API_PUBLIC_URL'>;

/** Used only when BILLING_MOCK_SECRET is unset and the mock gateway is allowed (never in production). */
export const DEFAULT_MOCK_SECRET = 'mock-billing-secret-for-local-development-only';

export function mockSecret(env: Pick<Env, 'BILLING_MOCK_SECRET'>): string {
  return env.BILLING_MOCK_SECRET || DEFAULT_MOCK_SECRET;
}

const KIND_BY_TYPE: Record<string, BillingEventKind> = {
  'checkout.completed': 'checkout_completed',
  'payment.succeeded': 'payment_succeeded',
  'payment.failed': 'payment_failed',
  'subscription.cancelled': 'subscription_cancelled',
  'order.paid': 'order_paid',
  'order.failed': 'order_failed',
};

export interface MockEventInput {
  id?: string;
  type: keyof typeof KIND_BY_TYPE | string;
  created?: number;
  tenant_id?: string;
  plan_key?: string;
  extra_users?: number;
  order_id?: string;
  customer_id?: string;
  subscription_id?: string;
  amount?: number;
  currency?: string;
  payment_ref?: string;
  period_start?: string;
  period_end?: string;
}

export class MockGateway implements BillingGateway {
  readonly id = 'mock' as const;

  constructor(private readonly env: MockEnv) {}

  isConfigured(): boolean {
    return mockAllowed(this.env);
  }

  async createCheckout(params: CheckoutParams): Promise<CheckoutResult> {
    const base = (this.env.API_PUBLIC_URL || params.apiBaseUrl || 'http://localhost').replace(/\/+$/, '');
    const reference = `mock_sub_${generateId()}`;
    const q = new URLSearchParams({
      tenant: params.tenantId,
      plan: params.quote.planKey,
      users: String(params.quote.extraUsers),
      amount: String(params.quote.total),
      currency: params.quote.currency,
      subscription: reference,
      success: params.successUrl,
      cancel: params.cancelUrl,
    });
    return { url: `${base}/api/v1/billing/mock-checkout?${q.toString()}`, reference, customerId: `mock_cus_${params.tenantId}` };
  }

  /** A one-off payment: a link to this server's mock add-on checkout, which plays the paid (or failed) event. */
  async createOrderCheckout(params: OrderCheckoutParams): Promise<CheckoutResult> {
    const base = (this.env.API_PUBLIC_URL || params.apiBaseUrl || 'http://localhost').replace(/\/+$/, '');
    const q = new URLSearchParams({ order: params.orderId, success: params.successUrl, cancel: params.cancelUrl });
    return { url: `${base}/api/v1/billing/mock-addon-checkout?${q.toString()}`, reference: `mock_ord_${params.orderId}`, customerId: `mock_cus_${params.tenantId}` };
  }

  async verifyWebhook(headers: Headers, rawBody: string): Promise<VerifyResult> {
    if (!mockAllowed(this.env)) return { ok: false, reason: 'not_configured' };
    const signature = headers.get('x-mock-signature');
    if (!signature) return { ok: false, reason: 'missing_signature' };
    const expected = await hmacSha256Hex(mockSecret(this.env), rawBody);
    return safeEqual(signature.trim().toLowerCase(), expected) ? { ok: true } : { ok: false, reason: 'bad_signature' };
  }

  parseEvent(rawBody: string): BillingEvent | null {
    let event: MockEventInput;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') return null;
    return {
      gateway: 'mock',
      eventId: event.id,
      type: event.type,
      kind: KIND_BY_TYPE[event.type] ?? 'ignored',
      occurredAt: new Date((event.created ?? Date.now() / 1000) * 1000).toISOString(),
      tenantId: event.tenant_id ?? null,
      planKey: event.plan_key ?? null,
      extraUsers: event.extra_users ?? null,
      orderId: event.order_id ?? null,
      customerId: event.customer_id ?? null,
      subscriptionId: event.subscription_id ?? null,
      amount: event.amount ?? null,
      currency: event.currency ?? null,
      paymentRef: event.payment_ref ?? null,
      periodStart: event.period_start ?? null,
      periodEnd: event.period_end ?? null,
    };
  }

  async cancelSubscription(): Promise<void> {
    // Nothing to cancel at a provider.
  }
}

/** A signed mock event body plus its signature header, the way the mock-checkout route and tests deliver one. */
export async function signedMockEvent(env: Pick<Env, 'BILLING_MOCK_SECRET'>, input: MockEventInput): Promise<{ body: string; signature: string }> {
  const body = JSON.stringify({ ...input, id: input.id ?? `mock_evt_${generateId()}`, created: input.created ?? Math.floor(Date.now() / 1000) });
  return { body, signature: await hmacSha256Hex(mockSecret(env), body) };
}
