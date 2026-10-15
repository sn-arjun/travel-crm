/**
 * Money and locale helpers (R202). Dependencies: none, Intl only.
 *
 * Every function takes the agency's currency and locale explicitly; nothing here reads a global default.
 * The one place that names India is LEGACY_LOCALE, used by resolveTenantLocale() for an agency whose settings
 * table has no value yet (agencies created before R202 are Indian). New agencies get their own values at
 * provisioning (R104) and onboarding (R113).
 */

import { isValidTimeZone } from './tz';

/** What the settings table implies for an agency that never saved a value. Existing agencies are Indian. */
export const LEGACY_LOCALE = {
  currency: 'INR',
  locale: 'en-IN',
  timezone: 'Asia/Kolkata',
  country: 'IN',
} as const;

/** Display settings of an agency, with the signed-in user's overrides applied. */
export interface LocaleContext {
  currency: string;
  /** BCP 47 tag, e.g. en-IN, en-GB, ar-AE, en-US. */
  locale: string;
  /** IANA zone name. */
  timezone: string;
  /** ISO 3166-1 alpha-2, '' when the agency never set one. */
  country: string;
  /** ISO 3166-1 alpha-2 used to read phone numbers typed without a country code. */
  phoneDefaultCountry: string;
  /** Free-form date pattern the agency chose (settings key date_format), '' when unset. */
  dateFormat: string;
}

export function isValidCurrency(code: string | null | undefined): code is string {
  if (!code || !/^[A-Za-z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}

export function isValidLocale(tag: string | null | undefined): tag is string {
  if (!tag) return false;
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
}

export function isValidCountryCode(code: string | null | undefined): code is string {
  return !!code && /^[A-Za-z]{2}$/.test(code);
}

export interface FormatMoneyOptions {
  /** Round to whole units (notification text); default shows 0 to 2 decimals. */
  whole?: boolean;
}

/**
 * Format an amount in `currency` with the number conventions of `locale`:
 * formatMoney(1234567.5, 'INR', 'en-IN') = 'INR 12,34,567.5' with lakh grouping (symbol per locale), formatMoney(1234.5, 'GBP', 'en-GB') = '£1,234.50'.
 * Never throws: an unknown currency prints as 'CODE 1,234.5' and an unknown locale falls back to en-US.
 */
export function formatMoney(
  amount: number,
  currency: string,
  locale: string,
  options: FormatMoneyOptions = {},
): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const tag = isValidLocale(locale) ? locale : 'en-US';
  const digits = options.whole
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 0, maximumFractionDigits: 2 };
  if (isValidCurrency(currency)) {
    return new Intl.NumberFormat(tag, { style: 'currency', currency: currency.toUpperCase(), ...digits }).format(value);
  }
  const plain = new Intl.NumberFormat(tag, digits).format(value);
  return currency ? `${currency} ${plain}` : plain;
}

/**
 * Excel number format for a currency column, e.g. '"£"#,##0.00' or '#,##0.00" د.إ."'. The symbol goes before
 * or after the number the way `locale` writes it; decimals follow the currency (JPY 0, KWD 3, most 2).
 */
export function excelCurrencyFormat(currency: string, locale: string): string {
  const tag = isValidLocale(locale) ? locale : 'en-US';
  if (!isValidCurrency(currency)) return '#,##0.00';
  const nf = new Intl.NumberFormat(tag, { style: 'currency', currency: currency.toUpperCase(), currencyDisplay: 'narrowSymbol' });
  const decimals = nf.resolvedOptions().maximumFractionDigits ?? 2;
  const parts = nf.formatToParts(1234.5);
  const symbol = (parts.find((p) => p.type === 'currency')?.value ?? currency).replace(/"/g, '');
  const firstNumber = parts.findIndex((p) => p.type === 'integer');
  const symbolAt = parts.findIndex((p) => p.type === 'currency');
  const number = decimals > 0 ? `#,##0.${'0'.repeat(decimals)}` : '#,##0';
  return symbolAt >= 0 && symbolAt < firstNumber ? `"${symbol}"${number}` : `${number}" ${symbol}"`;
}

type SettingsLike = Record<string, string | null | undefined>;
interface UserLocaleLike {
  locale?: string | null;
  timezone?: string | null;
}

/**
 * Pure: the agency's settings rows (key to value) plus an optional user row become one LocaleContext.
 * Order for each field: user override (locale, timezone only), agency setting, legacy default. An invalid
 * stored value is skipped rather than trusted.
 */
export function resolveTenantLocale(settings: SettingsLike, user?: UserLocaleLike | null): LocaleContext {
  const text = (k: string) => (settings[k] ?? '').trim();
  const currency = isValidCurrency(text('currency')) ? text('currency').toUpperCase() : LEGACY_LOCALE.currency;
  const locale = [user?.locale, text('locale')].find((v) => isValidLocale(v?.trim())) ?? LEGACY_LOCALE.locale;
  const timezone =
    [user?.timezone, text('timezone'), text('company_timezone')].find((v) => isValidTimeZone(v?.trim())) ??
    LEGACY_LOCALE.timezone;
  const countrySetting = [text('country'), text('company_country')].find((v) => isValidCountryCode(v));
  const country = countrySetting ? countrySetting.toUpperCase() : '';
  const phoneSetting = text('phone_default_country');
  const phoneDefaultCountry = isValidCountryCode(phoneSetting)
    ? phoneSetting.toUpperCase()
    : country || LEGACY_LOCALE.country;
  return {
    currency,
    locale: locale.trim(),
    timezone: timezone.trim(),
    country,
    phoneDefaultCountry,
    dateFormat: text('date_format'),
  };
}

export const LOCALE_SETTING_KEYS = [
  'currency', 'locale', 'timezone', 'company_timezone', 'country', 'company_country', 'phone_default_country', 'date_format',
] as const;

/** Read the agency's locale settings from its database (and the user's overrides when `userId` is given). */
export async function loadLocaleContext(db: D1Database, userId?: string | null): Promise<LocaleContext> {
  const settings: SettingsLike = {};
  try {
    const marks = LOCALE_SETTING_KEYS.map(() => '?').join(',');
    const { results } = await db
      .prepare(`SELECT key, value FROM settings WHERE key IN (${marks})`)
      .bind(...LOCALE_SETTING_KEYS)
      .all<{ key: string; value: string | null }>();
    for (const row of results ?? []) settings[row.key] = row.value;
  } catch {
    // settings unavailable: resolveTenantLocale falls back to the legacy defaults
  }
  let user: UserLocaleLike | null = null;
  if (userId) {
    try {
      user = await db.prepare('SELECT locale, timezone FROM users WHERE id = ?').bind(userId).first<UserLocaleLike>();
    } catch {
      user = null;
    }
  }
  return resolveTenantLocale(settings, user);
}

/**
 * Validate the locale-related keys of a settings update (PUT /settings/company). Returns the first problem as a
 * message, or null. Empty strings and null clear a key and are allowed; other keys are not checked here.
 */
export function validateLocaleSettings(data: Record<string, string | null>): string | null {
  const given = (k: string) => (data[k] ?? '').trim();
  if (given('currency') && !isValidCurrency(given('currency'))) return 'currency must be a 3-letter ISO 4217 code';
  if (given('locale') && !isValidLocale(given('locale'))) return 'locale must be a BCP 47 tag such as en-GB';
  for (const key of ['timezone', 'company_timezone']) {
    if (given(key) && !isValidTimeZone(given(key))) return `${key} must be an IANA time zone such as Europe/London`;
  }
  for (const key of ['country', 'phone_default_country']) {
    if (given(key) && !isValidCountryCode(given(key))) return `${key} must be a 2-letter ISO 3166 country code`;
  }
  if (given('date_format').length > 40) return 'date_format is too long';
  return null;
}
