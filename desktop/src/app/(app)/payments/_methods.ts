import { tEn, type TranslateFn } from '@/lib/i18n';
import { paymentMethodLabel } from '@/lib/payment-methods';

export type MethodTone = 'info' | 'success' | 'warning' | 'neutral';

export const methodTone: Record<string, MethodTone> = {
  bank_transfer: 'info',
  transfer: 'info',
  sepa_transfer: 'info',
  ideal: 'info',
  upi: 'info',
  online: 'info',
  cash: 'success',
  card: 'warning',
  cheque: 'neutral',
  check: 'neutral',
};

/** Label of a stored method value, in the user's language (`payments.method.*`); old values such as UPI on an old row still show. */
export function labelForMethod(method: string | null | undefined, t: TranslateFn = tEn): string {
  return paymentMethodLabel(method, t);
}
