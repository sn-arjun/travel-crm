/**
 * Phone number helpers.
 *
 * Phones arrive in several shapes: the desktop PhoneInput stores digits only
 * ("9876543210"), the driver app sends E.164 ("+919876543210"), and seeded data
 * mixes both. normalizePhone() produces the canonical E.164 form for storage;
 * phoneLookupVariants() returns every form an existing row might be stored in,
 * so lookups stay compatible with data written before normalisation existed.
 */

/** Strip everything except digits. */
function digitsOf(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Normalise a phone number to E.164.
 * - "+<digits>" is kept as-is (separators removed)
 * - 10 digits -> +<defaultCc><digits>
 * - leading 0 + 10 digits -> +<defaultCc><10 digits>
 * - <defaultCc> + 10 digits -> +<defaultCc><10 digits>
 * Anything else becomes "+" + digits. Empty input returns ''.
 */
export function normalizePhone(raw: string, defaultCc: string = '91'): string {
  const trimmed = (raw ?? '').trim();
  const digits = digitsOf(trimmed);
  if (!digits) return '';

  if (trimmed.startsWith('+')) return `+${digits}`;
  if (trimmed.startsWith('00') && digits.length > 12) return `+${digits.slice(2)}`;
  if (digits.length === 10) return `+${defaultCc}${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+${defaultCc}${digits.slice(1)}`;
  if (digits.startsWith(defaultCc) && digits.length === defaultCc.length + 10) return `+${digits}`;
  return `+${digits}`;
}

/**
 * All stored forms a phone may take: [e164, last 10 digits, digits only]
 * (unique values, suitable for `phone IN (?, ?, ?)`).
 */
export function phoneLookupVariants(raw: string, defaultCc: string = '91'): string[] {
  const e164 = normalizePhone(raw, defaultCc);
  if (!e164) return [];
  const digits = e164.slice(1);
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;
  return Array.from(new Set([e164, last10, digits]));
}

/** Build a "?, ?, ?" placeholder list for an IN clause. */
export function inPlaceholders(values: unknown[]): string {
  return values.map(() => '?').join(', ');
}
