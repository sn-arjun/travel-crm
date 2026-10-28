/**
 * Phone number helpers.
 *
 * Phones arrive in several shapes: the desktop PhoneInput stores digits only
 * ("9876543210"), the driver app sends E.164 ("+919876543210"), and seeded data
 * mixes both. normalizePhone() produces the canonical E.164 form for storage;
 * phoneLookupVariants() returns every form an existing row might be stored in,
 * so lookups stay compatible with data written before normalisation existed.
 *
 * A number typed without a country code is read as a number of the agency's phone country (R204): callers that
 * have a tenant database pass `await tenantPhoneCountry(db)`. The country table lives in ./countries (generated).
 */

import { DEFAULT_COUNTRY_ISO, splitE164, toE164 } from './countries';
import { loadLocaleContext } from './money';

/**
 * Normalise a phone number to E.164, reading a number typed without a country code as a number of
 * `defaultCountry` (an ISO 3166 alpha-2 code). See toE164() in countries.ts for the rules.
 * Empty input returns ''.
 */
export function normalizePhone(raw: string, defaultCountry: string = DEFAULT_COUNTRY_ISO): string {
  return toE164(raw, defaultCountry);
}

/**
 * All stored forms a phone may take: [e164, national number, digits only] (unique values, suitable for
 * `phone IN (?, ?, ?)`). The national number is what a country's own digits-only rows look like.
 */
export function phoneLookupVariants(raw: string, defaultCountry: string = DEFAULT_COUNTRY_ISO): string[] {
  const e164 = normalizePhone(raw, defaultCountry);
  if (!e164) return [];
  const digits = e164.slice(1);
  const split = splitE164(e164);
  const national = split ? split.national : digits.length > 10 ? digits.slice(-10) : digits;
  return Array.from(new Set([e164, national, digits]));
}

/**
 * The country an agency's numbers are read in when typed without a country code: its phone_default_country
 * setting, else its country, else the launch market (R202 resolveTenantLocale). Never throws.
 */
export async function tenantPhoneCountry(db: D1Database): Promise<string> {
  try {
    return (await loadLocaleContext(db)).phoneDefaultCountry || DEFAULT_COUNTRY_ISO;
  } catch {
    return DEFAULT_COUNTRY_ISO;
  }
}

/** Build a "?, ?, ?" placeholder list for an IN clause. */
export function inPlaceholders(values: unknown[]): string {
  return values.map(() => '?').join(', ');
}
