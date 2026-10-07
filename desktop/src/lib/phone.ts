/**
 * Phone helpers for E.164 values ("+919820144562").
 *
 * `PhoneInput` shows a country-code picker plus the national digits, so a form that stores one
 * string has to split it for the picker and join it back on every change.
 */

/** Country calling codes the PhoneInput offers, longest first so +971 wins over +9. */
const CALLING_CODES = [
  '+91', '+1', '+44', '+971', '+966', '+65', '+66', '+60', '+61', '+49', '+33', '+86', '+81',
  '+82', '+7', '+55', '+27', '+234', '+254', '+62', '+63', '+84', '+34', '+39', '+90', '+20',
  '+94', '+977', '+880', '+92',
].sort((a, b) => b.length - a.length);

const DEFAULT_CODE = '+91';

/**
 * Splits a stored number into the picker code and the national digits. Accepts E.164
 * ("+919820144562") and legacy digit-only values ("9820144562", "09820144562", "919820144562").
 */
export function splitPhone(phone: string | null | undefined): { countryCode: string; national: string } {
  const raw = (phone ?? '').trim();
  if (!raw) return { countryCode: DEFAULT_CODE, national: '' };
  if (raw.startsWith('+')) {
    const compact = `+${raw.replace(/\D/g, '')}`;
    const code = CALLING_CODES.find((c) => compact.startsWith(c));
    if (code) return { countryCode: code, national: compact.slice(code.length) };
  }
  const digits = raw.replace(/\D/g, '');
  // Legacy Indian values stored with the country code but no plus sign
  if (digits.length === 12 && digits.startsWith('91')) return { countryCode: DEFAULT_CODE, national: digits.slice(2) };
  return { countryCode: DEFAULT_CODE, national: digits.replace(/^0+/, '') };
}

/** Joins the picker code and national digits into E.164; '' when there are no digits. */
export function joinPhone(countryCode: string, national: string): string {
  const digits = national.replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `${countryCode}${digits}` : '';
}

/** Normalises a stored or typed number (E.164 or legacy digits) to E.164; '' when empty. */
export function toE164(phone: string | null | undefined): string {
  const { countryCode, national } = splitPhone(phone);
  return joinPhone(countryCode, national);
}

/** "+919820144562" -> "+91 98201 44562"; other countries get the code and the digits unchanged. */
export function formatPhone(phone: string | null | undefined): string {
  const raw = (phone ?? '').trim();
  if (!raw) return '';
  const { countryCode, national } = splitPhone(raw);
  if (!national) return raw;
  if (countryCode === '+91' && national.length === 10) return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
  return `${countryCode} ${national}`;
}
