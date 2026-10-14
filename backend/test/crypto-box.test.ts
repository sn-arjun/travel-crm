import { describe, it, expect } from 'vitest';
import {
  CredentialDecryptError,
  CredentialsKeyMissing,
  decryptSecret,
  encryptSecret,
  hashApiKey,
  isEncrypted,
  keyIdOf,
} from '../src/utils/crypto-box';

const b64 = (byte: number) => btoa(String.fromCharCode(...new Uint8Array(32).fill(byte)));
const KEY_A = b64(0x11);
const KEY_B = b64(0x22);

const oldEnv = { CREDENTIALS_KEYS: JSON.stringify({ a: KEY_A }), CREDENTIALS_ACTIVE_KEY_ID: 'a' };
const rotatedEnv = { CREDENTIALS_KEYS: JSON.stringify({ a: KEY_A, b: KEY_B }), CREDENTIALS_ACTIVE_KEY_ID: 'b' };
const AAD = 'row-1:voip_settings.provider_auth_token';

describe('crypto-box', () => {
  it('round-trips a value and stores it as enc:v1 with the key id', async () => {
    const sealed = await encryptSecret(oldEnv, 'twilio-token-0123456789', AAD);
    expect(sealed.startsWith('enc:v1:a:')).toBe(true);
    expect(sealed).not.toContain('twilio-token');
    expect(isEncrypted(sealed)).toBe(true);
    expect(keyIdOf(sealed)).toBe('a');
    expect(await decryptSecret(oldEnv, sealed, AAD)).toEqual({ value: 'twilio-token-0123456789', legacy: false });
  });

  it('uses a fresh random IV per value', async () => {
    const one = await encryptSecret(oldEnv, 'same', AAD);
    const two = await encryptSecret(oldEnv, 'same', AAD);
    expect(one).not.toBe(two);
  });

  it('fails with a different binding (row or column)', async () => {
    const sealed = await encryptSecret(oldEnv, 'secret', AAD);
    await expect(decryptSecret(oldEnv, sealed, 'row-2:voip_settings.provider_auth_token')).rejects.toBeInstanceOf(CredentialDecryptError);
    await expect(decryptSecret(oldEnv, sealed, 'row-1:voip_settings.twilio_auth_token')).rejects.toBeInstanceOf(CredentialDecryptError);
  });

  it('fails when the ciphertext is tampered with', async () => {
    const sealed = await encryptSecret(oldEnv, 'secret', AAD);
    const parts = sealed.split(':');
    const data = parts[4];
    parts[4] = (data[0] === 'A' ? 'B' : 'A') + data.slice(1);
    await expect(decryptSecret(oldEnv, parts.join(':'), AAD)).rejects.toBeInstanceOf(CredentialDecryptError);
    await expect(decryptSecret(oldEnv, 'enc:v1:a:onlytwo', AAD)).rejects.toBeInstanceOf(CredentialDecryptError);
  });

  it('opens a value sealed with an old key after rotation, and seals new values with the new key', async () => {
    const sealedOld = await encryptSecret(oldEnv, 'before-rotation', AAD);
    expect(await decryptSecret(rotatedEnv, sealedOld, AAD)).toEqual({ value: 'before-rotation', legacy: false });
    const sealedNew = await encryptSecret(rotatedEnv, 'before-rotation', AAD);
    expect(keyIdOf(sealedNew)).toBe('b');
    // once the old key is removed, a value still sealed with it can no longer be opened
    const onlyB = { CREDENTIALS_KEYS: JSON.stringify({ b: KEY_B }), CREDENTIALS_ACTIVE_KEY_ID: 'b' };
    await expect(decryptSecret(onlyB, sealedOld, AAD)).rejects.toBeInstanceOf(CredentialsKeyMissing);
    expect((await decryptSecret(onlyB, sealedNew, AAD)).value).toBe('before-rotation');
  });

  it('returns legacy plaintext as is and flags it', async () => {
    expect(await decryptSecret({}, 'plain-old-token', AAD)).toEqual({ value: 'plain-old-token', legacy: true });
    expect(isEncrypted('plain-old-token')).toBe(false);
  });

  it('throws CredentialsKeyMissing when no key is configured outside test mode', async () => {
    await expect(encryptSecret({}, 'x', AAD)).rejects.toBeInstanceOf(CredentialsKeyMissing);
    await expect(encryptSecret({ ENVIRONMENT: 'production', TEST_MODE: 'true' }, 'x', AAD)).rejects.toBeInstanceOf(CredentialsKeyMissing);
    await expect(encryptSecret({ CREDENTIALS_KEYS: JSON.stringify({ a: KEY_A }) }, 'x', AAD)).rejects.toBeInstanceOf(CredentialsKeyMissing);
    await expect(encryptSecret({ CREDENTIALS_KEYS: 'not json', CREDENTIALS_ACTIVE_KEY_ID: 'a' }, 'x', AAD)).rejects.toBeInstanceOf(CredentialsKeyMissing);
    await expect(encryptSecret({ CREDENTIALS_KEYS: JSON.stringify({ a: 'c2hvcnQ=' }), CREDENTIALS_ACTIVE_KEY_ID: 'a' }, 'x', AAD)).rejects.toBeInstanceOf(CredentialsKeyMissing);
    const sealed = await encryptSecret(oldEnv, 'x', AAD);
    await expect(decryptSecret({}, sealed, AAD)).rejects.toBeInstanceOf(CredentialsKeyMissing);
  });

  it('derives a deterministic key in test mode when none is configured', async () => {
    const testEnv = { TEST_MODE: 'true' };
    const sealed = await encryptSecret(testEnv, 'dev-secret', AAD);
    expect(keyIdOf(sealed)).toBe('test');
    expect((await decryptSecret(testEnv, sealed, AAD)).value).toBe('dev-secret');
    expect((await decryptSecret({ TEST_MODE: 'true', ENVIRONMENT: 'staging' }, sealed, AAD)).value).toBe('dev-secret');
  });

  it('hashes API keys to stable lowercase hex SHA-256', async () => {
    const hash = await hashApiKey('tcrm_abc');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashApiKey('tcrm_abc')).toBe(hash);
    expect(await hashApiKey('tcrm_abd')).not.toBe(hash);
  });
});
