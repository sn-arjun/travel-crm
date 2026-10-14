import { isTestMode } from './test-mode';

/**
 * Credential encryption at rest (R108).
 *
 * AES-256-GCM through WebCrypto with a random 96-bit IV per value. The stored text is
 *   enc:v1:<keyId>:<base64url iv>:<base64url ciphertext+tag>
 * The key id names the key that sealed the value, so keys can rotate: encrypt with the active key,
 * decrypt with whichever key the value names. `aad` (additional authenticated data) binds a value to
 * the row and column it was written for, so a ciphertext copied elsewhere does not open.
 *
 * Keys come from the Worker secret CREDENTIALS_KEYS (JSON {"<keyId>": "<base64 of 32 bytes>"}) and the
 * variable CREDENTIALS_ACTIVE_KEY_ID. With no keys configured, test mode (isTestMode, never production)
 * uses a fixed derived key; anything else fails closed with CredentialsKeyMissing.
 */

export interface CryptoEnv {
  CREDENTIALS_KEYS?: string;
  CREDENTIALS_ACTIVE_KEY_ID?: string;
  TEST_MODE?: string;
  ENVIRONMENT?: string;
}

export const ENC_PREFIX = 'enc:v1:';
const TEST_KEY_ID = 'test';

/** No usable key is configured: callers answer 503 CREDENTIALS_UNAVAILABLE and never store plaintext. */
export class CredentialsKeyMissing extends Error {
  constructor(detail = 'Credential encryption keys are not configured') {
    super(detail);
    this.name = 'CredentialsKeyMissing';
  }
}

/** A stored value could not be opened (tampered, wrong binding, or its key was removed). */
export class CredentialDecryptError extends Error {
  constructor(detail = 'Stored credential could not be decrypted') {
    super(detail);
    this.name = 'CredentialDecryptError';
  }
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/** The key id a stored value was sealed with, or null for plaintext. */
export function keyIdOf(value: string | null | undefined): string | null {
  if (!isEncrypted(value)) return null;
  return (value as string).split(':')[2] ?? null;
}

const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(cacheId: string, raw: Uint8Array): Promise<CryptoKey> {
  let key = keyCache.get(cacheId);
  if (!key) {
    key = crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    keyCache.set(cacheId, key);
  }
  return key;
}

async function testKey(): Promise<CryptoKey> {
  const raw = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode('travelcrm-test-only-credentials-key')));
  return importKey('test-derived', raw);
}

function parseKeys(env: CryptoEnv): Record<string, string> | null {
  if (!env.CREDENTIALS_KEYS) return null;
  try {
    const parsed = JSON.parse(env.CREDENTIALS_KEYS);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, string>;
  } catch {
    // fall through: a malformed secret is the same as a missing one
  }
  throw new CredentialsKeyMissing('CREDENTIALS_KEYS is not valid JSON');
}

async function keyById(env: CryptoEnv, keyId: string): Promise<CryptoKey> {
  const keys = parseKeys(env);
  const b64 = keys?.[keyId];
  if (b64) {
    let raw: Uint8Array;
    try {
      raw = fromBase64Url(b64.replace(/=+$/, ''));
    } catch {
      throw new CredentialsKeyMissing(`Key "${keyId}" is not valid base64`);
    }
    if (raw.length !== 32) throw new CredentialsKeyMissing(`Key "${keyId}" must be 32 bytes`);
    return importKey(`${keyId}:${b64}`, raw);
  }
  if (!keys && keyId === TEST_KEY_ID && isTestMode(env)) return testKey();
  throw new CredentialsKeyMissing(`No credential key named "${keyId}"`);
}

async function activeKey(env: CryptoEnv): Promise<{ id: string; key: CryptoKey }> {
  const keys = parseKeys(env);
  if (!keys) {
    if (isTestMode(env)) return { id: TEST_KEY_ID, key: await testKey() };
    throw new CredentialsKeyMissing();
  }
  const id = env.CREDENTIALS_ACTIVE_KEY_ID;
  if (!id) throw new CredentialsKeyMissing('CREDENTIALS_ACTIVE_KEY_ID is not set');
  return { id, key: await keyById(env, id) };
}

/** Seal a value. Throws CredentialsKeyMissing when no key is available. Never returns plaintext. */
export async function encryptSecret(env: CryptoEnv, plaintext: string, aad: string): Promise<string> {
  const { id, key } = await activeKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(aad) }, key, encoder.encode(plaintext)),
  );
  return `${ENC_PREFIX}${id}:${toBase64Url(iv)}:${toBase64Url(sealed)}`;
}

/**
 * Open a stored value. A value without the enc: prefix is legacy plaintext and is returned as is with
 * legacy=true (the caller upgrades it on its next write or through the reencrypt maintenance route).
 */
export async function decryptSecret(env: CryptoEnv, stored: string, aad: string): Promise<{ value: string; legacy: boolean }> {
  if (!isEncrypted(stored)) return { value: stored, legacy: true };
  const parts = stored.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) throw new CredentialDecryptError('Malformed stored credential');
  const [keyId, ivText, dataText] = parts;
  const key = await keyById(env, keyId);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(ivText), additionalData: encoder.encode(aad) },
      key,
      fromBase64Url(dataText),
    );
    return { value: new TextDecoder().decode(plain), legacy: false };
  } catch {
    throw new CredentialDecryptError();
  }
}

/** Decrypt a nullable column. Null and empty stay as they are. */
export async function decryptColumn(env: CryptoEnv, stored: string | null | undefined, aad: string): Promise<string | null> {
  if (!stored) return stored ?? null;
  const { value, legacy } = await decryptSecret(env, stored, aad);
  if (legacy) console.warn(`[crypto-box] legacy plaintext credential read (${aad.split(':').slice(1).join(':')})`);
  return value;
}

/** One-way hash of a website API key (lowercase hex SHA-256). Keys are 192-bit random, so no salt is needed. */
export async function hashApiKey(key: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(key)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Id of the key new values are sealed with (the derived test key's id when none is configured in test mode). */
export async function activeKeyId(env: CryptoEnv): Promise<string> {
  return (await activeKey(env)).id;
}
