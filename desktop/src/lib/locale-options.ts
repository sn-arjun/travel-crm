/**
 * Pick-lists for currency and time zone fields (R203). The agency's own currency and zone are always offered
 * (first in the list), then a fixed set of travel-market currencies and zones. A value already on the record
 * that is not in the set is added so the select never shows a blank.
 *
 * This file is the one place that names currencies and zones; pages never carry their own literal lists.
 */
import { getLocaleContext } from './locale';

export const CURRENCY_NAMES: Record<string, string> = {
  INR: 'Indian Rupee',
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  AED: 'UAE Dirham',
  SGD: 'Singapore Dollar',
  THB: 'Thai Baht',
  AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar',
  SAR: 'Saudi Riyal',
  QAR: 'Qatari Riyal',
  LKR: 'Sri Lankan Rupee',
  NPR: 'Nepalese Rupee',
  MYR: 'Malaysian Ringgit',
  IDR: 'Indonesian Rupiah',
  JPY: 'Japanese Yen',
  CHF: 'Swiss Franc',
  ZAR: 'South African Rand',
  NZD: 'New Zealand Dollar',
  CNY: 'Chinese Yuan',
};

export const TIMEZONE_LABELS: Record<string, string> = {
  'Asia/Kolkata': 'Asia/Kolkata (IST)',
  'Asia/Dubai': 'Asia/Dubai (GST)',
  'America/New_York': 'America/New_York (EST)',
  'America/Chicago': 'America/Chicago (CST)',
  'America/Los_Angeles': 'America/Los_Angeles (PST)',
  'Europe/London': 'Europe/London (GMT)',
  'Europe/Paris': 'Europe/Paris (CET)',
  'Asia/Bangkok': 'Asia/Bangkok (ICT)',
  'Asia/Singapore': 'Asia/Singapore (SGT)',
  'Asia/Colombo': 'Asia/Colombo (IST)',
  'Asia/Kathmandu': 'Asia/Kathmandu (NPT)',
  'Asia/Riyadh': 'Asia/Riyadh (AST)',
  'Asia/Tokyo': 'Asia/Tokyo (JST)',
  'Australia/Sydney': 'Australia/Sydney (AEST)',
  'Pacific/Auckland': 'Pacific/Auckland (NZST)',
  'Africa/Johannesburg': 'Africa/Johannesburg (SAST)',
};

/** Currency codes to offer: the agency's currency first, then the given values, then the standard set. */
export function currencyCodes(...also: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const c of [getLocaleContext().currency, ...also, ...Object.keys(CURRENCY_NAMES)]) {
    const code = typeof c === 'string' ? c.toUpperCase() : '';
    if (/^[A-Z]{3}$/.test(code) && !out.includes(code)) out.push(code);
  }
  return out;
}

/** "Indian Rupee (INR)" for a select that shows names. */
export function currencyOptions(...also: Array<string | null | undefined>): Array<{ value: string; label: string }> {
  return currencyCodes(...also).map((code) => ({ value: code, label: `${CURRENCY_NAMES[code] ?? code} (${code})` }));
}

/** The short symbol of a currency in the active locale ("₹", "£", "$"); the code itself when it has none. */
export function currencySymbol(code: string, locale: string = getLocaleContext().locale): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}

/** "GBP (£)" for a select that shows codes with their symbol. */
export function currencyLabel(code: string): string {
  return `${code} (${currencySymbol(code)})`;
}

/** Time zones to offer: the agency's zone first, then the given values, then the standard set. */
export function timezoneOptions(...also: Array<string | null | undefined>): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  for (const tz of [getLocaleContext().timeZone, ...also, ...Object.keys(TIMEZONE_LABELS)]) {
    if (tz && !out.some((o) => o.value === tz)) out.push({ value: tz, label: TIMEZONE_LABELS[tz] ?? tz });
  }
  return out;
}

/** The viewer's own IANA zone (used when the agency has none stored). */
export function systemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}
