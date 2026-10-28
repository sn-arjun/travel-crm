/**
 * The test gateway for an agency's payment links (R142). It exists only where mockAllowed(env) is true (TEST_MODE or
 * BILLING_GATEWAY=mock, never production) and never talks to a provider.
 *
 * It follows the subscription mock (services/billing/mock.ts): a link opens a page served by this API, and paying on
 * that page signs an event with the mock secret and delivers it to the same webhook pipeline the real gateways use, so
 * the payment is recorded once through recordInvoicePayment. Nothing here is reachable in production: the caller checks
 * mockAllowed first, and the routes answer 404 when it is false.
 */

import type { Env } from '../../types';
import { hmacSha256Hex, mockAllowed } from '../billing/gateway';
import { mockSecret } from '../billing/mock';
import type { PaymentLinkParams, PaymentLinkResult } from './agency-gateway';

export { mockAllowed };

export const MOCKPAY_PREFIX = 'mockpay:';
const MOCKPAY_TTL_SECONDS = 7 * 24 * 3600;

export interface MockPayLink {
  tenantId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  linkRef: string;
  purpose: 'deposit' | 'balance' | 'custom';
}

/** The methods the pay page offers for a currency (design section 8.1). */
export interface MockPayMethod {
  id: string;
  labelKey: string;
}

export function methodsForCurrency(currency: string): MockPayMethod[] {
  switch (currency.toUpperCase()) {
    case 'EUR':
      return [
        { id: 'ideal', labelKey: 'mockpay.method.ideal' },
        { id: 'card', labelKey: 'mockpay.method.card' },
        { id: 'bancontact', labelKey: 'mockpay.method.bancontact' },
      ];
    case 'GBP':
      return [
        { id: 'card', labelKey: 'mockpay.method.card' },
        { id: 'pay_by_bank', labelKey: 'mockpay.method.payByBank' },
      ];
    case 'INR':
      return [
        { id: 'upi', labelKey: 'mockpay.method.upi' },
        { id: 'card', labelKey: 'mockpay.method.card' },
      ];
    default:
      return [{ id: 'card', labelKey: 'mockpay.method.card' }];
  }
}

/**
 * Make a link on the test gateway: the link's details go to KV for seven days and the URL points at this API's own pay
 * page. `base` is the API's own public address (API_PUBLIC_URL, else the request's origin).
 */
export async function createMockPaymentLink(
  env: Env,
  tenantId: string,
  tenantKey: string,
  base: string,
  params: PaymentLinkParams,
): Promise<PaymentLinkResult> {
  const link: MockPayLink = {
    tenantId,
    invoiceId: params.invoiceId,
    amount: params.amount,
    currency: params.currency.toUpperCase(),
    linkRef: params.linkRef,
    purpose: params.purpose ?? 'balance',
  };
  await env.CACHE.put(`${MOCKPAY_PREFIX}${params.linkRef}`, JSON.stringify(link), { expirationTtl: MOCKPAY_TTL_SECONDS });
  return {
    id: params.linkRef,
    url: `${base.replace(/\/+$/, '')}/api/v1/webhooks/payments/mock-pay/${tenantKey}/${params.linkRef}`,
  };
}

export async function loadMockPayLink(env: Env, linkRef: string): Promise<MockPayLink | null> {
  const raw = await env.CACHE.get(`${MOCKPAY_PREFIX}${linkRef}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MockPayLink;
  } catch {
    return null;
  }
}

/** The paid event a real provider would send for this link, signed with the mock secret (X-Mock-Signature). */
export async function signedMockPaidEvent(
  env: Pick<Env, 'BILLING_MOCK_SECRET'>,
  link: MockPayLink,
  method: string,
): Promise<{ body: string; signature: string }> {
  const body = JSON.stringify({
    // One id per link: a second delivery of the same payment claims the same event row and does nothing.
    id: `mock_evt_${link.linkRef}`,
    type: 'payment.paid',
    invoice_id: link.invoiceId,
    link_id: link.linkRef,
    amount: link.amount,
    currency: link.currency,
    payment_ref: `mock_pay_${link.linkRef}`,
    method,
    created: Math.floor(Date.now() / 1000),
  });
  return { body, signature: await hmacSha256Hex(mockSecret(env), body) };
}

