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

/**
 * The interface language the pick-lists are written in. Set by the language provider (components/providers/i18n-provider);
 * English until then. Names come from the browser's own tables (Intl.DisplayNames and the time-zone names of
 * Intl.DateTimeFormat), so no second hand-written list has to be kept in step with the English one above.
 */
let uiLanguage = 'en';

export function setUiLanguage(lang: string): void {
  uiLanguage = lang || 'en';
}

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

/** A currency's name in the interface language (English from CURRENCY_NAMES; other languages from Intl, else the English name). */
export function currencyName(code: string, lang: string = uiLanguage): string {
  const english = CURRENCY_NAMES[code] ?? code;
  if (!lang || lang === 'en') return english;
  try {
    return new Intl.DisplayNames([lang], { type: 'currency' }).of(code) || english;
  } catch {
    return english;
  }
}

/** A time zone's label in the interface language. English keeps TIMEZONE_LABELS; other languages show the localized zone name before the zone id. */
export function timezoneLabel(tz: string, lang: string = uiLanguage): string {
  if (!lang || lang === 'en') return TIMEZONE_LABELS[tz] ?? tz;
  try {
    const part = new Intl.DateTimeFormat(lang, { timeZone: tz, timeZoneName: 'long' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
    return part?.value ? `${part.value} (${tz})` : (TIMEZONE_LABELS[tz] ?? tz);
  } catch {
    return TIMEZONE_LABELS[tz] ?? tz;
  }
}

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
  return currencyCodes(...also).map((code) => ({ value: code, label: `${currencyName(code)} (${code})` }));
}

/** The short symbol of a currency in the active locale ("₹", "£", "$"); the code itself when it has none. */
export function currencySymbol(code: string, locale: string = getLocaleContext().intlLocale): string {
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
    if (tz && !out.some((o) => o.value === tz)) out.push({ value: tz, label: timezoneLabel(tz) });
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

/**
 * Agency locales (BCP 47) offered for number, date and currency formatting. Independent of the interface language:
 * a Dutch agency can run the interface in English and still format money and dates the Dutch way (and the reverse).
 * "en-NL" is English text with Dutch conventions (day-month order, comma decimals, euro).
 */
export const LOCALE_NAMES: Record<string, string> = {
  'en-IN': 'English (India)',
  'en-GB': 'English (United Kingdom)',
  'en-US': 'English (United States)',
  'en-AU': 'English (Australia)',
  'en-NL': 'English (Netherlands)',
  'nl-NL': 'Nederlands (Nederland)',
  'nl-BE': 'Nederlands (België)',
  'ar-AE': 'العربية (الإمارات)',
};

/** Locale tags to offer: the agency's own first, then the given values, then the standard set. */
export function localeOptions(...also: Array<string | null | undefined>): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  for (const tag of [getLocaleContext().locale, ...also, ...Object.keys(LOCALE_NAMES)]) {
    if (tag && !out.some((o) => o.value === tag)) out.push({ value: tag, label: LOCALE_NAMES[tag] ?? tag });
  }
  return out;
}
