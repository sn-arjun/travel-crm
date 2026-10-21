/**
 * Bank details shaped by the agency's country (R140, design section 4.4).
 *
 * The same rules live in backend/src/utils/bank-details.ts; change both together. Pure: no I/O, no React.
 *
 * Stored shape (settings key `bank_details`): accountName, bankName, iban, bic, sortCode, accountNumber,
 * routingNumber, bsb, swift, ifsc, upiId, branch. The API returns this shape whatever keys an older save used.
 */
import { COUNTRIES } from './countries';

export type BankField =
  | 'accountName'
  | 'bankName'
  | 'iban'
  | 'bic'
  | 'sortCode'
  | 'accountNumber'
  | 'routingNumber'
  | 'bsb'
  | 'swift'
  | 'ifsc'
  | 'upiId'
  | 'branch';

export const BANK_FIELDS: readonly BankField[] = [
  'accountName', 'bankName', 'iban', 'bic', 'sortCode', 'accountNumber', 'routingNumber', 'bsb', 'swift', 'ifsc', 'upiId', 'branch',
];

export type BankDetails = Partial<Record<BankField, string>>;

/** EU member states, the rest of the EEA, Switzerland and the small SEPA countries. */
const SEPA_EUROPE = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH', 'MC', 'SM', 'AD', 'VA',
]);
const GULF = new Set(['AE', 'SA', 'QA', 'KW', 'BH', 'OM']);

/** EU, EEA, Switzerland and the small SEPA countries: iDEAL and SEPA transfer are offered there. */
export function isSepaCountry(country: string | null | undefined): boolean {
  return SEPA_EUROPE.has((country ?? '').trim().toUpperCase());
}

export type BankRegion = 'IN' | 'GB' | 'EU' | 'US' | 'AU' | 'GULF' | 'OTHER';

export function bankRegionOf(country: string | null | undefined): BankRegion {
  const c = (country ?? '').trim().toUpperCase();
  if (c === 'IN') return 'IN';
  if (c === 'GB' || c === 'UK') return 'GB';
  if (c === 'US') return 'US';
  if (c === 'AU') return 'AU';
  if (SEPA_EUROPE.has(c)) return 'EU';
  if (GULF.has(c)) return 'GULF';
  return 'OTHER';
}

const FIELDS_BY_REGION: Record<BankRegion, readonly BankField[]> = {
  IN: ['accountName', 'accountNumber', 'ifsc', 'bankName', 'branch', 'upiId'],
  GB: ['accountName', 'sortCode', 'accountNumber', 'iban', 'bic'],
  EU: ['accountName', 'iban', 'bic', 'bankName'],
  US: ['accountName', 'routingNumber', 'accountNumber', 'swift'],
  AU: ['accountName', 'bsb', 'accountNumber'],
  GULF: ['accountName', 'iban', 'swift'],
  OTHER: ['accountName', 'iban', 'accountNumber', 'swift'],
};

/** The fields an agency in this country enters and prints, in print order. */
export function bankFieldsFor(country: string | null | undefined): BankField[] {
  return [...FIELDS_BY_REGION[bankRegionOf(country)]];
}

const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  uae: 'AE', usa: 'US', america: 'US', 'united states of america': 'US', ksa: 'SA',
  holland: 'NL', 'the netherlands': 'NL', czechia: 'CZ',
};

/**
 * The ISO code of what an agency typed as its country (a code or a name). Falls back to the active locale's country,
 * and for an agency with neither, a rupee agency is India (agencies created before R202), anything else is unknown ('').
 */
export function bankCountryOf(typed: string | null | undefined, localeCountry?: string | null, currency?: string | null): string {
  const v = (typed ?? '').trim();
  if (v) {
    if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
    const lower = v.toLowerCase();
    const alias = COUNTRY_ALIASES[lower];
    if (alias) return alias;
    const named = COUNTRIES.find((c) => c.name.toLowerCase() === lower);
    if (named) return named.iso;
    return '';
  }
  const own = (localeCountry ?? '').trim().toUpperCase();
  if (own) return own;
  return /^inr$/i.test(currency ?? '') ? 'IN' : '';
}

// ── Validators ───────────────────────────────────────────────

/** Upper-case without spaces or dashes. */
export function compactIban(value: string): string {
  return value.replace(/[\s-]+/g, '').toUpperCase();
}

/** IBAN in groups of four, as printed on paper. */
export function formatIban(value: string): string {
  return compactIban(value).replace(/(.{4})(?=.)/g, '$1 ');
}

/** ISO 13616 mod-97 check; spaces allowed. Length must be plausible (15 to 34). */
export function isValidIban(value: string): boolean {
  const iban = compactIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

/** BIC / SWIFT: 4 letters bank, 2 letters country, 2 alphanumerics location, optional 3 branch. */
export function isValidBic(value: string): boolean {
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(value.replace(/\s+/g, '').toUpperCase());
}

/** UK sort code and Australian BSB: 6 digits, a dash or space between pairs allowed. */
export function isValidSixDigitCode(value: string): boolean {
  return /^\d{6}$/.test(value.replace(/[\s-]/g, ''));
}

/** US ABA routing number: 9 digits with the 3-7-1 checksum. */
export function isValidRoutingNumber(value: string): boolean {
  const v = value.replace(/[\s-]/g, '');
  if (!/^\d{9}$/.test(v)) return false;
  const d = v.split('').map(Number) as [number, number, number, number, number, number, number, number, number];
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

/**
 * The first field of the country's set whose value is filled and wrong, with the catalogue key of its message
 * (`banks.error.<field>`), or null.
 */
export function bankFieldError(country: string | null | undefined, details: BankDetails): { field: BankField; key: string } | null {
  const fields = new Set(bankFieldsFor(country));
  const has = (f: BankField) => fields.has(f) && !!(details[f] ?? '').trim();
  const bad = (f: BankField) => ({ field: f, key: `banks.error.${f}` });
  if (has('iban') && !isValidIban(details.iban!)) return bad('iban');
  if (has('bic') && !isValidBic(details.bic!)) return bad('bic');
  if (has('swift') && !isValidBic(details.swift!)) return bad('swift');
  if (has('sortCode') && !isValidSixDigitCode(details.sortCode!)) return bad('sortCode');
  if (has('bsb') && !isValidSixDigitCode(details.bsb!)) return bad('bsb');
  if (has('routingNumber') && !isValidRoutingNumber(details.routingNumber!)) return bad('routingNumber');
  return null;
}

/** Filled fields of the country's set, in print order, IBAN grouped in fours. `label` turns a field into its caption. */
export function bankPrintLines(
  country: string | null | undefined,
  details: BankDetails,
  label: (field: BankField) => string,
): Array<{ field: BankField; label: string; value: string }> {
  return bankFieldsFor(country)
    .filter((f) => !!(details[f] ?? '').trim())
    .map((f) => ({ field: f, label: label(f), value: f === 'iban' ? formatIban(details[f]!) : details[f]!.trim() }));
}

/** Any bank_details object from the API or an invoice (JSON text or object, old or new keys) in the current shape. */
export function readBankDetails(raw: unknown, legacyUpiId?: unknown): BankDetails {
  let src: unknown = raw;
  if (typeof src === 'string') {
    try {
      src = JSON.parse(src);
    } catch {
      src = null;
    }
  }
  const o = src && typeof src === 'object' ? (src as Record<string, unknown>) : {};
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
  const out: BankDetails = {};
  for (const field of BANK_FIELDS) {
    const value = text(o[field]);
    if (value) out[field] = value;
  }
  if (!out.accountName && text(o.accountHolderName)) out.accountName = text(o.accountHolderName);
  const upi = text(o.upi_id) || text(legacyUpiId);
  if (!out.upiId && upi) out.upiId = upi;
  return out;
}
