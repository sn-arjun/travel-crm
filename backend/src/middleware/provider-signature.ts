/**
 * Provider webhook signature checks (constant-time, the provider's documented algorithm).
 *
 *  - Twilio:   X-Twilio-Signature = base64(HMAC-SHA1(authToken, url + sorted(key + value))).
 *  - SendGrid: Signed Event Webhook, ECDSA P-256 / SHA-256 over (timestamp + raw body), public key in
 *              SENDGRID_WEBHOOK_PUBLIC_KEY (base64 SPKI), signature DER-encoded base64.
 *
 * Plivo is deliberately not handled here (owner decision 2026-10-14: Twilio outside India, Exotel later).
 */

import type { Context } from 'hono';
import type { AppContext } from '../types';
import { isTestMode } from '../utils/test-mode';

const encoder = new TextEncoder();

/** Compare two strings without an early exit on the first differing byte. */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(value: string): Uint8Array | null {
  try {
    const bin = atob(value.trim());
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** The signature Twilio would send for this URL and form fields. */
export async function twilioSignature(url: string, params: Record<string, string>, authToken: string): Promise<string> {
  let data = url;
  for (const key of Object.keys(params).sort()) data += key + params[key];
  const key = await crypto.subtle.importKey('raw', encoder.encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return toBase64(new Uint8Array(sig));
}

/** True only when `signature` is Twilio's HMAC-SHA1 of the URL and the form fields under `authToken`. */
export async function verifyTwilio(url: string, params: Record<string, string>, authToken: string, signature: string | null | undefined): Promise<boolean> {
  if (!signature || !authToken) return false;
  return timingSafeEqual(await twilioSignature(url, params, authToken), signature);
}

/** Verify against several candidate tokens (tenant's own account, then the platform's). */
export async function verifyTwilioAny(url: string, params: Record<string, string>, tokens: Array<string | null | undefined>, signature: string | null | undefined): Promise<boolean> {
  let ok = false;
  for (const token of tokens) {
    if (token && (await verifyTwilio(url, params, token, signature))) ok = true; // no early exit
  }
  return ok;
}

/** ASN.1 DER ECDSA signature -> the fixed-width r||s form WebCrypto expects. Null when malformed. */
function derToP1363(der: Uint8Array, size = 32): Uint8Array | null {
  if (der.length === size * 2) return der; // already raw r||s
  let i = 0;
  if (der[i++] !== 0x30) return null;
  let len = der[i++];
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 2) return null;
    len = 0;
    for (let k = 0; k < n; k++) len = (len << 8) | der[i++];
  }
  if (len !== der.length - i) return null;
  const out = new Uint8Array(size * 2);
  for (let part = 0; part < 2; part++) {
    if (der[i++] !== 0x02) return null;
    let l = der[i++];
    if (l > 0x7f || i + l > der.length) return null;
    let int = der.subarray(i, i + l);
    i += l;
    while (int.length > size && int[0] === 0) int = int.subarray(1);
    if (int.length > size) return null;
    out.set(int, part * size + (size - int.length));
  }
  return out;
}

/** SendGrid Signed Event Webhook check over `timestamp + rawBody`. */
export async function verifySendgrid(
  publicKeyBase64: string,
  signatureBase64: string | null | undefined,
  timestamp: string | null | undefined,
  rawBody: string,
): Promise<boolean> {
  if (!publicKeyBase64 || !signatureBase64 || !timestamp) return false;
  const spki = fromBase64(publicKeyBase64.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, ''));
  const der = fromBase64(signatureBase64);
  if (!spki || !der) return false;
  const raw = derToP1363(der);
  if (!raw) return false;
  try {
    const key = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw, encoder.encode(timestamp + rawBody));
  } catch {
    return false;
  }
}

/** The URL a provider was told to call: API_PUBLIC_URL + path + query when configured, else the request URL. */
export function publicRequestUrl(c: Context<AppContext>): string {
  const req = new URL(c.req.url);
  const base = c.env.API_PUBLIC_URL?.trim().replace(/\/+$/, '');
  return base ? `${base}${req.pathname}${req.search}` : c.req.url;
}

/**
 * Test mode lets a callback through only when it carries no signature at all (the e2e stack and unit
 * suites post unsigned callbacks). A callback that does carry a signature is always checked.
 * Outside test mode this is always false: an unsigned callback is never accepted.
 */
export function unsignedAllowed(env: AppContext['Bindings'], signature: string | null | undefined): boolean {
  return isTestMode(env) && !signature;
}

/** Form fields of a provider callback as plain strings (Hono caches the parsed body for later handlers). */
export async function formParams(c: Context<AppContext>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const contentType = c.req.header('Content-Type') || '';
  if (!/application\/x-www-form-urlencoded|multipart\/form-data/i.test(contentType)) return out;
  const body = await c.req.parseBody();
  for (const [k, v] of Object.entries(body)) if (typeof v === 'string') out[k] = v;
  return out;
}
