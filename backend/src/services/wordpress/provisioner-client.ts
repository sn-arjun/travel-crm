import type { Env } from '../../types';

/**
 * Signed calls from the API to the WordPress provisioner on the Oracle VM (R309).
 *
 * Headers: X-Timestamp (Unix seconds) and X-Signature = lowercase hex HMAC-SHA256, keyed with PROVISIONER_SECRET,
 * of  <timestamp> LF <METHOD> LF <path and query> LF <raw body>.  The provisioner (oci-provisioner/src/signature.ts)
 * accepts a timestamp within 300 seconds either way and compares with timingSafeEqual. The signed path is the path
 * of the URL actually requested, so OCI_PROVISIONER_URL must not sit behind a proxy that rewrites paths.
 */

export class ProvisionerNotConfigured extends Error {}

export function canonicalString(timestamp: string, method: string, path: string, body: string): string {
  return [timestamp, method.toUpperCase(), path, body].join('\n');
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signProvisionerRequest(
  secret: string,
  req: { method: string; path: string; body?: string; nowMs?: number },
): Promise<{ 'X-Timestamp': string; 'X-Signature': string }> {
  const timestamp = String(Math.floor((req.nowMs ?? Date.now()) / 1000));
  return {
    'X-Timestamp': timestamp,
    'X-Signature': await hmacHex(secret, canonicalString(timestamp, req.method, req.path, req.body ?? '')),
  };
}

export interface ProvisionerResponse {
  status: number;
  body: Record<string, any>;
}

const REQUEST_TIMEOUT_MS = 25_000;

/** Call the provisioner. Throws ProvisionerNotConfigured when the URL or secret is missing, and the fetch error on a network failure. */
export async function callProvisioner(
  env: Pick<Env, 'OCI_PROVISIONER_URL' | 'PROVISIONER_SECRET'>,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  payload?: unknown,
): Promise<ProvisionerResponse> {
  if (!env.OCI_PROVISIONER_URL) throw new ProvisionerNotConfigured('OCI_PROVISIONER_URL is not set on the API');
  if (!env.PROVISIONER_SECRET) throw new ProvisionerNotConfigured('PROVISIONER_SECRET is not set on the API');

  const url = new URL(path.replace(/^\/+/, ''), env.OCI_PROVISIONER_URL.replace(/\/+$/, '') + '/');
  const target = url.pathname + url.search;
  const body = payload === undefined ? '' : JSON.stringify(payload);
  const headers = await signProvisionerRequest(env.PROVISIONER_SECRET, { method, path: target, body });

  const res = await fetch(url.toString(), {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body || undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  let parsed: Record<string, any> = {};
  try {
    parsed = (await res.json()) as Record<string, any>;
  } catch {
    parsed = { error: `Provisioner answered ${res.status} without JSON` };
  }
  return { status: res.status, body: parsed };
}
