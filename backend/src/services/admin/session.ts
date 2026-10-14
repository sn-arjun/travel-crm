import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import type { Env } from '../../types';
import { isTestMode } from '../../utils/test-mode';
import { generateId } from '../../utils/uuid';

/**
 * Super admin identity (R111). Separate from tenant auth on every axis: its own signing secret
 * (SUPER_ADMIN_JWT_SECRET), its own audience claim, a 2 hour lifetime, no refresh token, and a
 * revocation entry in KV on logout. A tenant access token can never satisfy these checks, and a
 * super admin token is never accepted on tenant routes (it has no tenantId and a different signature).
 */

export const SUPER_ADMIN_AUDIENCE = 'super-admin';
export const SUPER_ADMIN_ISSUER = 'travelcrm-super-admin';
export const SUPER_ADMIN_TOKEN_TTL_SECONDS = 2 * 60 * 60;
export const MIN_SECRET_LENGTH = 32;

export interface SuperAdminIdentity {
  id: string;
  email: string;
  name: string;
  role: string;
  /** Token id (jti): used for logout revocation. */
  tokenId: string;
}

/**
 * The signing secret. Production must set SUPER_ADMIN_JWT_SECRET (the login route answers 503 without it).
 * Only test mode derives one from JWT_SECRET so the suites need no extra binding; it still differs from the
 * tenant secret, so tenant tokens stay useless here.
 */
export function superAdminSecret(env: Pick<Env, 'SUPER_ADMIN_JWT_SECRET' | 'JWT_SECRET' | 'TEST_MODE' | 'ENVIRONMENT'>): string | null {
  const configured = env.SUPER_ADMIN_JWT_SECRET;
  if (configured && configured.length >= MIN_SECRET_LENGTH) return configured;
  if (isTestMode(env) && env.JWT_SECRET) return `${env.JWT_SECRET}:super-admin-test-only`;
  return null;
}

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSuperAdminToken(
  env: Env,
  admin: { id: string; email: string; name: string; role: string },
): Promise<{ token: string; expiresAt: string; tokenId: string } | null> {
  const secret = superAdminSecret(env);
  if (!secret) return null;
  const tokenId = generateId();
  const exp = Math.floor(Date.now() / 1000) + SUPER_ADMIN_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({ email: admin.email, name: admin.name, role: admin.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(SUPER_ADMIN_ISSUER)
    .setAudience(SUPER_ADMIN_AUDIENCE)
    .setSubject(admin.id)
    .setJti(tokenId)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key(secret));
  return { token, expiresAt: new Date(exp * 1000).toISOString(), tokenId };
}

/** Verify signature, audience, issuer and expiry; then re-read the registry row so a deactivated admin is cut off at once. */
export async function authenticateSuperAdminToken(env: Env, token: string): Promise<SuperAdminIdentity | null> {
  const secret = superAdminSecret(env);
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      audience: SUPER_ADMIN_AUDIENCE,
      issuer: SUPER_ADMIN_ISSUER,
      algorithms: ['HS256'],
    });
    if (!payload.sub || !payload.jti) return null;
    if (await env.CACHE.get(revokedKey(payload.jti))) return null;
    const row = await env.MASTER_DB
      .prepare(`SELECT id, email, name, role FROM super_admins WHERE id = ? AND is_active = 1`)
      .bind(payload.sub)
      .first<{ id: string; email: string; name: string; role: string }>();
    if (!row) return null;
    return { id: row.id, email: row.email, name: row.name, role: row.role, tokenId: payload.jti };
  } catch {
    return null;
  }
}

export const revokedKey = (tokenId: string) => `sa:revoked:${tokenId}`;

export async function revokeSuperAdminToken(env: Env, tokenId: string): Promise<void> {
  await env.CACHE.put(revokedKey(tokenId), '1', { expirationTtl: SUPER_ADMIN_TOKEN_TTL_SECONDS + 60 });
}

// ── Passwords ────────────────────────────────────────────────────────────────

/** A real bcrypt hash of a throwaway string, built once; compared against when the email is unknown so timing does not reveal it. */
let dummyHash: Promise<string> | null = null;
const dummyBcrypt = () => (dummyHash ??= bcrypt.hash(generateId(), 10));

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array((hex.match(/.{2}/g) || []).map((b) => parseInt(b, 16)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Legacy hashes made by the standalone console (super-admin/src/lib/auth.ts): "<saltHex>:<hashHex>",
 * PBKDF2-HMAC-SHA256, 100000 iterations, 256 bits, 16-byte salt. Compared in constant time.
 */
async function verifyLegacyPbkdf2(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: 100000, hash: 'SHA-256' },
    material,
    256,
  );
  return timingSafeEqual(new Uint8Array(bits), hexToBytes(hashHex));
}

export type PasswordCheck = { ok: boolean; needsRehash: boolean };

/** bcrypt ($2...) is the format written from now on; the legacy PBKDF2 form still verifies and is upgraded at login. */
export async function verifySuperAdminPassword(password: string, stored: string | null): Promise<PasswordCheck> {
  if (!stored) {
    await bcrypt.compare(password, await dummyBcrypt()).catch(() => false);
    return { ok: false, needsRehash: false };
  }
  if (stored.startsWith('$2')) {
    return { ok: await bcrypt.compare(password, stored).catch(() => false), needsRehash: false };
  }
  const ok = await verifyLegacyPbkdf2(password, stored).catch(() => false);
  return { ok, needsRehash: ok };
}

export const MIN_PASSWORD_LENGTH = 12;
