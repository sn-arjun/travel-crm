/**
 * Bank details shaped by the agency's country (R140, design section 4.4).
 *
 * The same rules live in desktop/src/lib/bank-details.ts; change both together. Pure, except loadAgencyBankDetails.
 *
 * Stored shape (settings key `bank_details`): accountName, bankName, iban, bic, sortCode, accountNumber,
 * routingNumber, bsb, swift, ifsc, upiId, branch. Older rows used accountHolderName for the account name, ifsc
 * as is, and kept the UPI id in the separate `upi_id` setting; normalizeBankDetails reads all of them.
 */

import { loadLocaleContext } from './money';

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

/** UK sort code and Australian BSB: 6 digits, one dash or space after every two allowed. */
export function isValidSixDigitCode(value: string): boolean {
  return /^\d{6}$/.test(value.replace(/[\s-]/g, ''));
}

/** US ABA routing number: 9 digits with the 3-7-1 checksum. */
export function isValidRoutingNumber(value: string): boolean {
  const v = value.replace(/[\s-]/g, '');
  if (!/^\d{9}$/.test(v)) return false;
  const d = v.split('').map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

// ── Stored shape ─────────────────────────────────────────────

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
}

/**
 * Any stored or submitted bank_details object (old or new keys) becomes the current shape. Empty values are
 * dropped. `legacyUpiId` is the separate `upi_id` setting of older agencies.
 */
export function normalizeBankDetails(raw: unknown, legacyUpiId?: unknown): BankDetails {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: BankDetails = {};
  for (const field of BANK_FIELDS) {
    const value = text(src[field]);
    if (value) out[field] = value;
  }
  const holder = text(src.accountHolderName) || text(src.account_holder_name);
  if (!out.accountName && holder) out.accountName = holder;
  const upi = text(src.upi_id) || text(legacyUpiId);
  if (!out.upiId && upi) out.upiId = upi;
  if (out.iban) out.iban = compactIban(out.iban);
  if (out.bic) out.bic = out.bic.replace(/\s+/g, '').toUpperCase();
  if (out.swift) out.swift = out.swift.replace(/\s+/g, '').toUpperCase();
  if (out.ifsc) out.ifsc = out.ifsc.replace(/\s+/g, '').toUpperCase();
  return out;
}

/**
 * First problem with the fields that apply to this country, or null. Fields the country does not use are not
 * checked (they are kept but never shown or printed).
 */
export function validateBankDetails(country: string | null | undefined, details: BankDetails): string | null {
  const fields = new Set(bankFieldsFor(country));
  const has = (f: BankField) => fields.has(f) && !!details[f];
  if (has('iban') && !isValidIban(details.iban!)) return 'IBAN is not valid: check the digits and the country prefix';
  if (has('bic') && !isValidBic(details.bic!)) return 'BIC must be 8 or 11 characters, for example ABNANL2A';
  if (has('swift') && !isValidBic(details.swift!)) return 'SWIFT code must be 8 or 11 characters';
  if (has('sortCode') && !isValidSixDigitCode(details.sortCode!)) return 'Sort code must be 6 digits';
  if (has('bsb') && !isValidSixDigitCode(details.bsb!)) return 'BSB must be 6 digits';
  if (has('routingNumber') && !isValidRoutingNumber(details.routingNumber!)) return 'Routing number must be 9 digits with a valid check digit';
  return null;
}

/** Label and value of every filled field of the country's set, in print order; the IBAN is grouped in fours. */
export function bankPrintLines(country: string | null | undefined, details: BankDetails): Array<{ field: BankField; label: string; value: string }> {
  const LABELS: Record<BankField, string> = {
    accountName: 'Account name',
    bankName: 'Bank',
    iban: 'IBAN',
    bic: 'BIC',
    sortCode: 'Sort code',
    accountNumber: 'Account number',
    routingNumber: 'Routing number',
    bsb: 'BSB',
    swift: 'SWIFT',
    ifsc: 'IFSC',
    upiId: 'UPI ID',
    branch: 'Branch',
  };
  return bankFieldsFor(country)
    .filter((f) => !!details[f])
    .map((f) => ({ field: f, label: LABELS[f], value: f === 'iban' ? formatIban(details[f]!) : details[f]! }));
}

/**
 * The agency's bank details as saved in settings (current shape, old keys read) and the country they are printed for.
 * An agency that never saved a country is a pre-R202 Indian agency, as in the invoice-defaults route.
 */
export async function loadAgencyBankDetails(db: D1Database): Promise<{ country: string; details: BankDetails }> {
  const locale = await loadLocaleContext(db);
  let raw: unknown = null;
  let upi: unknown = null;
  try {
    const { results } = await db.prepare(`SELECT key, value FROM settings WHERE key IN ('bank_details', 'upi_id')`).all<{ key: string; value: string | null }>();
    for (const row of results ?? []) {
      let value: unknown = row.value;
      try {
        value = JSON.parse(row.value ?? 'null');
      } catch {
        // a plain string stays as it is
      }
      if (row.key === 'bank_details') raw = value;
      else upi = value;
    }
  } catch {
    // settings unavailable: no bank details
  }
  return { country: locale.country || 'IN', details: normalizeBankDetails(raw, upi) };
}
