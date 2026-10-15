/**
 * Time-based one-time passwords (RFC 6238 over RFC 4226) with WebCrypto, no dependency.
 *
 * HMAC-SHA1, 30 second steps, 6 digits: what Google Authenticator, Microsoft Authenticator, Authy and 1Password
 * all implement. A code is accepted for the current step and one step either side (clock drift), and a step is
 * accepted only once per user: callers keep the last accepted step and pass it as `afterStep`.
 */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Steps accepted either side of the current one. */
export const TOTP_WINDOW = 1;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const encoder = new TextEncoder();

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Decodes RFC 4648 base32; spaces, dashes, padding and case are ignored. Returns null on any other character. */
export function base32Decode(text: string): Uint8Array | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** A fresh 160-bit secret, base32 (32 characters). */
export function generateTotpSecret(): string {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

/** HOTP (RFC 4226) for a raw key and counter. */
export async function hotp(key: Uint8Array, counter: number, digits = TOTP_DIGITS): Promise<string> {
  const msg = new Uint8Array(8);
  // Counters stay far below 2^53; split into two 32-bit halves.
  new DataView(msg.buffer).setUint32(0, Math.floor(counter / 2 ** 32));
  new DataView(msg.buffer).setUint32(4, counter >>> 0);
  const hmacKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, msg));
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totpStep(nowMs: number, stepSeconds = TOTP_STEP_SECONDS): number {
  return Math.floor(nowMs / 1000 / stepSeconds);
}

/** The code for a base32 secret at a moment (RFC 6238). */
export async function totpAt(secret: string, nowMs: number, digits = TOTP_DIGITS): Promise<string> {
  const key = base32Decode(secret);
  if (!key || key.length === 0) throw new Error('Invalid TOTP secret');
  return hotp(key, totpStep(nowMs), digits);
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Checks a submitted code against steps [now-window, now+window]. Returns the matching step or null.
 * Steps at or before `afterStep` (the last one already used) never match, so a code works once.
 */
export async function verifyTotp(
  secret: string,
  code: string,
  opts: { nowMs?: number; window?: number; afterStep?: number | null } = {},
): Promise<number | null> {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const key = base32Decode(secret);
  if (!key || key.length === 0) return null;
  const now = totpStep(opts.nowMs ?? Date.now());
  const window = opts.window ?? TOTP_WINDOW;
  let matched: number | null = null;
  // Every step is computed (no early exit) so timing does not reveal which one matched.
  for (let step = now - window; step <= now + window; step++) {
    const expected = await hotp(key, step);
    if (sameText(expected, clean) && (opts.afterStep == null || step > opts.afterStep) && matched === null) matched = step;
  }
  return matched;
}

/** otpauth:// URI that authenticator apps read from a QR code. */
export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// ---------------------------------------------------------------- recovery codes

// No 0/O/1/I/L so a code read off paper is not misread.
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RECOVERY_CODE_COUNT = 10;

function randomRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let chars = '';
  for (const b of bytes) chars += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

/** Ten single-use codes shown to the person once. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, randomRecoveryCode);
}

/** Case, dashes and spaces do not matter when typing a code. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

export function looksLikeRecoveryCode(code: string): boolean {
  return /^[A-Z0-9]{10}$/.test(normalizeRecoveryCode(code));
}

/** SHA-256 hex of the normalised code. The codes carry about 50 bits of randomness each, so a salt adds nothing. */
export async function hashRecoveryCode(code: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(normalizeRecoveryCode(code))));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
