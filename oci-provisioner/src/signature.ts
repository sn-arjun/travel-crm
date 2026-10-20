import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Request signing between the TravelCRM API (Cloudflare Worker) and this provisioner (R309).
 *
 * The caller sends two headers:
 *   X-Timestamp  Unix time in whole seconds when the request was signed.
 *   X-Signature  Lowercase hex HMAC-SHA256, keyed with PROVISIONER_SECRET, of this string:
 *                  <timestamp> LF <METHOD> LF <path and query> LF <raw body>
 *                (LF is a single \n; METHOD is upper case; the path is exactly the request target, for example
 *                 /sites or /sites/acme-travel; the body is the raw bytes as text, empty for GET and DELETE.)
 *
 * The provisioner rejects a timestamp more than 300 seconds away from its own clock (either direction) and
 * compares the signatures with crypto.timingSafeEqual. There is no unauthenticated mode and no default secret.
 *
 * This file has no imports from the rest of the project so the backend, the tests and the server share one
 * definition of the string. The backend has a WebCrypto twin (backend/src/services/wordpress/provisioner-client.ts);
 * both are tested against the same fixed vector.
 */

export const MAX_SKEW_SECONDS = 300;

export function canonicalString(timestamp: string, method: string, path: string, body: string): string {
  return [timestamp, method.toUpperCase(), path, body].join('\n');
}

export function computeSignature(secret: string, timestamp: string, method: string, path: string, body: string): string {
  return createHmac('sha256', secret).update(canonicalString(timestamp, method, path, body)).digest('hex');
}

export interface SignedHeaders {
  'X-Timestamp': string;
  'X-Signature': string;
}

export function signRequest(
  secret: string,
  req: { method: string; path: string; body?: string; nowMs?: number },
): SignedHeaders {
  const timestamp = String(Math.floor((req.nowMs ?? Date.now()) / 1000));
  return {
    'X-Timestamp': timestamp,
    'X-Signature': computeSignature(secret, timestamp, req.method, req.path, req.body ?? ''),
  };
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'bad-signature' };

export function verifyRequest(
  secret: string,
  req: { method: string; path: string; body?: string; timestamp?: string | null; signature?: string | null; nowMs?: number },
): VerifyResult {
  if (!secret) return { ok: false, reason: 'bad-signature' }; // never verify against an empty key
  if (!req.timestamp || !req.signature) return { ok: false, reason: 'missing' };
  if (!/^\d{1,12}$/.test(req.timestamp) || !/^[0-9a-f]{64}$/i.test(req.signature)) return { ok: false, reason: 'malformed' };

  const nowSeconds = Math.floor((req.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - Number(req.timestamp)) > MAX_SKEW_SECONDS) return { ok: false, reason: 'stale' };

  const expected = Buffer.from(computeSignature(secret, req.timestamp, req.method, req.path, req.body ?? ''), 'hex');
  const given = Buffer.from(req.signature, 'hex');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: 'bad-signature' };
  return { ok: true };
}
