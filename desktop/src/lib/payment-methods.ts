/**
 * Payment methods by country (R140). The same union is accepted by the API (backend/src/routes/payments.ts).
 *
 * Every agency: cash, bank transfer, card, cheque, online, other. UPI only in India. iDEAL and SEPA transfer in the
 * EU, the EEA, Switzerland and the small SEPA countries. A value already stored on a row (UPI on an old row, `transfer`
 * or `check` from the assistant and older rows) is still shown by its label wherever it appears.
 */
import { bankCountryOf, isSepaCountry } from './bank-details';
import { tEn, useT, type TranslateFn } from './i18n';
import { getLocaleContext, useLocale } from './locale';

export type PaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'transfer'
  | 'card'
  | 'cheque'
  | 'check'
  | 'online'
  | 'upi'
  | 'ideal'
  | 'sepa_transfer'
  | 'other';

/** The methods an agency in this country records, in the order they are offered. */
export function paymentMethodsFor(country: string | null | undefined): PaymentMethod[] {
  const c = (country ?? '').trim().toUpperCase();
  const methods: PaymentMethod[] = ['cash', 'bank_transfer'];
  if (c === 'IN') methods.push('upi');
  if (isSepaCountry(c)) methods.push('sepa_transfer', 'ideal');
  methods.push('card', 'cheque', 'online', 'other');
  return methods;
}

const KNOWN = new Set<string>(['cash', 'bank_transfer', 'transfer', 'card', 'cheque', 'check', 'online', 'upi', 'ideal', 'sepa_transfer', 'other']);

/** Label of any method, current or stored: `payments.method.<value>`; an unknown value is shown humanised. */
export function paymentMethodLabel(method: string | null | undefined, t: TranslateFn = tEn): string {
  if (!method) return '—';
  return KNOWN.has(method) ? t(`payments.method.${method}`) : method.replace(/_/g, ' ');
}

/** The country the agency is in for method and bank purposes, from the active locale (a rupee agency with none is India). */
export function agencyCountry(): string {
  const { country, currency } = getLocaleContext();
  return bankCountryOf('', country, currency);
}

/**
 * Options for a method select: the agency country's methods, plus `current` when the row being edited holds a value
 * outside that set (so an old UPI row does not lose its value).
 */
export function paymentMethodOptions(country: string | null | undefined, t: TranslateFn = tEn, current?: string | null): Array<{ value: string; label: string }> {
  const values: string[] = paymentMethodsFor(country);
  if (current && !values.includes(current)) values.push(current);
  return values.map((value) => ({ value, label: paymentMethodLabel(value, t) }));
}

/** Hook form of paymentMethodOptions for the agency's own country. */
export function usePaymentMethodOptions(current?: string | null): Array<{ value: string; label: string }> {
  const t = useT();
  const { country, currency } = useLocale();
  return paymentMethodOptions(bankCountryOf('', country, currency), t, current);
}
