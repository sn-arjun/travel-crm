/**
 * Phone helpers for E.164 values ("+919820144562").
 *
 * `PhoneInput` shows a country-code picker plus the national digits, so a form that stores one
 * string has to split it for the picker and join it back on every change. The country table lives in
 * `countries.ts` (generated, every country); a number typed without a country code is read as a number of
 * the agency's phone country (the locale store's `phoneDefaultCountry`, India until a session says otherwise).
 */
import { getLocaleContext } from '@/lib/locale';
import {
  DEFAULT_COUNTRY_ISO,
  countryByDial,
  countryByIso,
  isPlausibleNational,
  splitE164,
  toE164 as toE164For,
  type PhoneCountry,
} from '@/lib/countries';

/** The agency's phone country: what a number typed without a country code is read as. */
export function defaultPhoneCountry(): PhoneCountry {
  return countryByIso(getLocaleContext().phoneDefaultCountry) ?? countryByIso(DEFAULT_COUNTRY_ISO)!;
}

/** Picker code ("+91") of the agency's phone country. */
export function defaultCountryCode(): string {
  return `+${defaultPhoneCountry().dial}`;
}

/**
 * Splits a stored number into the picker code and the national digits. Accepts E.164
 * ("+919820144562") and digit-only values ("9820144562", "09820144562", "919820144562"), which are read
 * as numbers of the agency's country.
 */
export function splitPhone(phone: string | null | undefined): { countryCode: string; national: string } {
  const raw = (phone ?? '').trim();
  const fallback = defaultCountryCode();
  if (!raw) return { countryCode: fallback, national: '' };
  if (raw.startsWith('+')) {
    const split = splitE164(raw);
    if (split) return { countryCode: `+${split.country.dial}`, national: split.national };
  }
  const digits = raw.replace(/\D/g, '');
  const split = splitE164(toE164For(raw, defaultPhoneCountry().iso));
  if (split && isPlausibleNational(split.country, split.national)) {
    return { countryCode: `+${split.country.dial}`, national: split.national };
  }
  return { countryCode: fallback, national: digits.replace(/^0+/, '') };
}

/** Joins the picker code and national digits into E.164; '' when there are no digits. */
export function joinPhone(countryCode: string, national: string): string {
  const typed = national.replace(/\D/g, '');
  const country = countryByDial(countryCode);
  const digits = country?.keepZero ? typed.replace(/^0(?=0)/, '') : typed.replace(/^0+/, '');
  return digits ? `${countryCode}${digits}` : '';
}

/** Normalises a stored or typed number (E.164 or digit-only) to E.164; '' when empty. */
export function toE164(phone: string | null | undefined): string {
  const { countryCode, national } = splitPhone(phone);
  return joinPhone(countryCode, national);
}

/** How a country's national numbers are grouped for display, by national length. */
const GROUPS: Record<string, Record<number, number[]>> = {
  IN: { 10: [5, 5] },
  US: { 10: [3, 3, 4] },
  CA: { 10: [3, 3, 4] },
  GB: { 10: [4, 6] },
  AE: { 9: [2, 3, 4] },
  SG: { 8: [4, 4] },
  AU: { 9: [3, 3, 3] },
  // Netherlands: landlines and service numbers show as 85 208 0400; mobile numbers (6...) are grouped on their own below
  NL: { 9: [2, 3, 4] },
};

/** The grouping of one national number: by country and length, with the Dutch mobile range (6...) grouped on its own. */
function groupSizes(country: PhoneCountry | undefined, national: string): number[] | undefined {
  if (!country) return undefined;
  if (country.iso === 'NL' && national.length === 9 && national.startsWith('6')) return [1, 4, 4];
  return (GROUPS[country.iso] ?? (country.dial === '1' ? GROUPS.US : undefined))?.[national.length];
}

function group(national: string, sizes: number[]): string {
  const parts: string[] = [];
  let at = 0;
  for (const size of sizes) {
    parts.push(national.slice(at, at + size));
    at += size;
  }
  return parts.join(' ');
}

/**
 * "+919820144562" -> "+91 98201 44562", "+447911123456" -> "+44 7911 123456", "+971501234567" ->
 * "+971 50 123 4567", "+14155550132" -> "+1 415 555 0132", "+6591234567" -> "+65 9123 4567".
 * Other countries get the code and the digits unchanged.
 */
export function formatPhone(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim();
  if (!raw) return '';
  const { countryCode, national } = splitPhone(raw);
  if (!national) return raw;
  const country = countryByDial(countryCode);
  const sizes = groupSizes(country, national);
  return `${countryCode} ${sizes ? group(national, sizes) : national}`;
}

/** Example shape for the national field: "XXXXX XXXXX" for India, "XXXX XXXX" for Singapore, "XXXXXXXXX" elsewhere. */
export function phonePlaceholder(country: PhoneCountry | undefined): string {
  if (!country) return 'XXXXX XXXXX';
  const sizes = (GROUPS[country.iso] ?? (country.dial === '1' ? GROUPS.US : undefined))?.[country.max];
  return sizes ? sizes.map((n) => 'X'.repeat(n)).join(' ') : 'X'.repeat(Math.min(country.max, 12));
}
