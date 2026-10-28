/**
 * R164-1: where a customer lands after the payment page (the test gateway today, a real gateway's return URL later): the booking
 * page or the traveller page with `?payment=<result>`. The API's mock pay page answers success, failed or cancelled; paid, canceled
 * and the like are accepted too. The parameter only chooses what to show: a payment is only ever recorded by the gateway's own
 * (signed) event on the server, never by this address.
 */
export type PaymentReturnState = 'paid' | 'cancelled' | 'failed';

export interface PaymentReturn {
  state: PaymentReturnState;
  /** The booking reference the booking page put in the return address, when it did. */
  reference: string | null;
}

const PAID = new Set(['paid', 'success', 'succeeded', 'ok', 'completed']);
const CANCELLED = new Set(['cancelled', 'canceled', 'cancel']);
const FAILED = new Set(['failed', 'failure', 'error', 'declined']);

/** The state named by the query string, or null when it is not a payment return at all (a normal visit). */
export function parsePaymentReturn(search: string): PaymentReturn | null {
  const params = new URLSearchParams(search);
  const raw = params.get('payment')?.trim().toLowerCase();
  if (!raw) return null;
  const state: PaymentReturnState | null = PAID.has(raw) ? 'paid' : CANCELLED.has(raw) ? 'cancelled' : FAILED.has(raw) ? 'failed' : null;
  if (!state) return null;
  const ref = params.get('ref')?.trim().slice(0, 64) ?? '';
  return { state, reference: /^[A-Za-z0-9._-]+$/.test(ref) ? ref : null };
}

/** The address of this page without the payment answer (and without the reference): a fresh start. */
export function withoutPaymentReturn(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('payment');
  url.searchParams.delete('ref');
  return url.toString();
}

/** The address the pay page sends the customer back to: this page, carrying the booking reference. */
export function paymentReturnAddress(href: string, reference: string | null): string {
  const url = new URL(withoutPaymentReturn(href));
  if (reference) url.searchParams.set('ref', reference);
  return url.toString();
}

/** What the booking page remembers so a cancelled or failed payment can be tried again from the same browser. */
export interface PendingPayment {
  reference: string;
  url: string;
  amount: number;
  currency: string;
}

const pendingKey = (token: string) => `travelcrm.booking-pay.${token}`;

export function rememberPendingPayment(token: string, pending: PendingPayment): void {
  try {
    window.sessionStorage.setItem(pendingKey(token), JSON.stringify(pending));
  } catch {
    // private window or blocked storage: the retry then falls back to asking the customer to contact the agency
  }
}

export function recallPendingPayment(token: string, reference: string | null): PendingPayment | null {
  try {
    const raw = window.sessionStorage.getItem(pendingKey(token));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PendingPayment>;
    if (typeof v.url !== 'string' || !/^https?:\/\//i.test(v.url) || typeof v.reference !== 'string') return null;
    if (reference && v.reference !== reference) return null;
    return { reference: v.reference, url: v.url, amount: Number(v.amount) || 0, currency: String(v.currency ?? '') };
  } catch {
    return null;
  }
}

export function forgetPendingPayment(token: string): void {
  try {
    window.sessionStorage.removeItem(pendingKey(token));
  } catch {
    // nothing stored, nothing to forget
  }
}
