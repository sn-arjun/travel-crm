/**
 * R208: signed unsubscribe tokens.
 *
 * A token is `base64url("v1|<tenantId>|<contactId>|<channel>") . base64url(HMAC-SHA256(payload))`. It carries
 * no secret and no personal data (ids only), cannot be forged or edited without UNSUB_SECRET, names the agency
 * so the public endpoint can find the right database, and never expires (an old email must still unsubscribe).
 * Using it only ever withdraws marketing consent, so a leaked link can do nothing worse than unsubscribe.
 */

export type UnsubscribeChannel = 'email' | 'whatsapp' | 'sms' | 'any';
const CHANNELS: ReadonlySet<string> = new Set(['email', 'whatsapp', 'sms', 'any']);

export interface UnsubscribeTokenEnv {
  UNSUB_SECRET?: string;
  JWT_SECRET?: string;
}

export interface UnsubscribeClaims {
  tenantId: string;
  contactId: string;
  channel: UnsubscribeChannel;
}

const encoder = new TextEncoder();

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

/** UNSUB_SECRET when set; otherwise a key derived from JWT_SECRET with a domain prefix so it never equals a JWT key. */
function secretFor(env: UnsubscribeTokenEnv): string {
  const secret = env.UNSUB_SECRET?.trim() || (env.JWT_SECRET ? `unsubscribe-token-v1:${env.JWT_SECRET}` : '');
  if (!secret) throw new Error('UNSUB_SECRET is not configured');
  return secret;
}

async function hmac(secret: string, payload: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, payload));
}

function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signUnsubscribeToken(env: UnsubscribeTokenEnv, claims: UnsubscribeClaims): Promise<string> {
  const payload = encoder.encode(`v1|${claims.tenantId}|${claims.contactId}|${claims.channel}`);
  const sig = await hmac(secretFor(env), payload);
  return `${toB64Url(payload)}.${toB64Url(sig)}`;
}

/** The claims when the signature is valid; null for anything else (malformed, tampered, wrong secret). */
export async function verifyUnsubscribeToken(env: UnsubscribeTokenEnv, token: string): Promise<UnsubscribeClaims | null> {
  if (typeof token !== 'string' || token.length > 400) return null;
  const [payloadPart, sigPart, extra] = token.split('.');
  if (!payloadPart || !sigPart || extra !== undefined) return null;
  const payload = fromB64Url(payloadPart);
  const sig = fromB64Url(sigPart);
  if (!payload || !sig) return null;
  let expected: Uint8Array;
  try {
    expected = await hmac(secretFor(env), payload);
  } catch {
    return null;
  }
  if (!safeEqual(expected, sig)) return null;
  const [version, tenantId, contactId, channel] = new TextDecoder().decode(payload).split('|');
  if (version !== 'v1' || !tenantId || !contactId || !CHANNELS.has(channel)) return null;
  return { tenantId, contactId, channel: channel as UnsubscribeChannel };
}

/** Hex HMAC-SHA256 of a message under the same secret, for short-lived signed links (R208 privacy exports). */
export async function signMessage(env: UnsubscribeTokenEnv, message: string): Promise<string> {
  const sig = await hmac(secretFor(env), encoder.encode(message));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}
