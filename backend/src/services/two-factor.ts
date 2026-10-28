import type { Context } from 'hono';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { AppContext } from '../types';
import { settings, users, loginHistory } from '../db/tenant-schema';
import { signAccessToken } from '../utils/jwt';
import { generateId } from '../utils/uuid';
import { parseUserAgent } from '../utils/user-agent-parser';
import { logActivity } from '../utils/activity-logger';
import { getTenantSummary } from '../utils/tenant-summary';
import { decryptSecret, encryptSecret } from '../utils/crypto-box';

type Db = DrizzleD1Database<Record<string, never>>;
type UserRow = typeof users.$inferSelect;

/** Tenant setting that makes two-factor sign-in mandatory for every user of the agency. */
export const REQUIRE_2FA_KEY = 'require_2fa';
export const CHALLENGE_TTL_SECONDS = 300;
export const CHALLENGE_MAX_ATTEMPTS = 5;
export const TWO_FACTOR_ISSUER = 'TravelCRM Pro';

export interface Challenge {
  userId: string;
  tenantId: string;
  method: 'password' | 'otp';
  attempts: number;
  ip: string;
}

/** The secret is bound to its user row, so a ciphertext copied to another user does not open. */
export function totpAad(userId: string): string {
  return `users:totp_secret_enc:${userId}`;
}

export function sealTotpSecret(env: AppContext['Bindings'], userId: string, secret: string): Promise<string> {
  return encryptSecret(env, secret, totpAad(userId));
}

export async function openTotpSecret(env: AppContext['Bindings'], userId: string, stored: string): Promise<string> {
  return (await decryptSecret(env, stored, totpAad(userId))).value;
}

export async function isTwoFactorRequired(db: Db): Promise<boolean> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, REQUIRE_2FA_KEY)).limit(1);
  return row?.value === 'true';
}

/** 256-bit unguessable token; the challenge itself lives in KV for five minutes. */
export async function createChallenge(
  env: AppContext['Bindings'],
  data: Omit<Challenge, 'attempts'>,
): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await env.SESSIONS.put(`2fa_challenge:${token}`, JSON.stringify({ ...data, attempts: 0 } satisfies Challenge), {
    expirationTtl: CHALLENGE_TTL_SECONDS,
  });
  return token;
}

/** Drops every refresh token and session of a user (password reset, admin 2FA reset). */
export async function revokeAllSessions(env: AppContext['Bindings'], userId: string): Promise<void> {
  const indexKey = `sessions_index:${userId}`;
  const sessionIds = (await env.SESSIONS.get(indexKey, 'json')) as string[] | null;
  if (sessionIds) {
    for (const sid of sessionIds) {
      const sessionData = (await env.SESSIONS.get(`session:${sid}`, 'json')) as { refreshToken?: string } | null;
      if (sessionData?.refreshToken) await env.SESSIONS.delete(`refresh:${sessionData.refreshToken}`);
      await env.SESSIONS.delete(`session:${sid}`);
    }
    await env.SESSIONS.delete(indexKey);
  }
}

export function publicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    department: user.department,
    language: user.language,
  };
}

/**
 * Open a session for a user whose credentials (and, when enrolled, second step) have been checked:
 * tokens, session records, last-login, history and activity. Returns the body of a sign-in response.
 */
export async function issueSignIn(
  c: Context<AppContext>,
  p: {
    db: Db;
    tenantDb: D1Database;
    tenantId: string;
    tenant: { dbBinding: string | null; companyName?: string };
    user: UserRow;
    action: 'login' | 'login_otp' | 'login_2fa';
  },
) {
  const { db, tenantDb, tenantId, tenant, user } = p;
  const ip = c.get('clientIp');
  const ua = parseUserAgent(c.req.header('User-Agent'));
  const setupRequired = user.totpEnabled !== 1 && (await isTwoFactorRequired(db));

  const accessToken = await signAccessToken(
    {
      userId: user.id,
      tenantId,
      role: user.role,
      email: user.email,
      db: tenant.dbBinding,
      mustChangePassword: user.mustChangePassword === 1,
      twoFactorSetupRequired: setupRequired,
    },
    c.env.JWT_SECRET,
  );

  const refreshToken = generateId();
  const sessionId = generateId();
  const loginAt = new Date().toISOString();

  await c.env.SESSIONS.put(
    `refresh:${refreshToken}`,
    JSON.stringify({ sessionId, userId: user.id, tenantId, device: ua.device, ip, loginAt }),
    { expirationTtl: 604800 }, // 7 days
  );
  await c.env.SESSIONS.put(
    `session:${sessionId}`,
    JSON.stringify({ refreshToken, userId: user.id, device: ua.device, browser: ua.browser, os: ua.os, ip, userAgent: c.req.header('User-Agent'), loginAt }),
    { expirationTtl: 604800 },
  );
  const indexKey = `sessions_index:${user.id}`;
  const existingIndex = (await c.env.SESSIONS.get(indexKey, 'json')) as string[] | null;
  await c.env.SESSIONS.put(indexKey, JSON.stringify(existingIndex ? [...existingIndex, sessionId] : [sessionId]));

  await db.update(users).set({ lastLoginAt: loginAt }).where(eq(users.id, user.id));
  await db.insert(loginHistory).values({
    id: generateId(),
    userId: user.id,
    ipAddress: ip,
    country: c.req.header('CF-IPCountry') || null,
    city: (c.req.raw as unknown as { cf?: { city?: string } }).cf?.city || null,
    browser: ua.browser,
    os: ua.os,
    device: ua.device,
    userAgent: c.req.header('User-Agent') || null,
    status: 'success',
  });
  await logActivity(db, { userId: user.id, action: p.action, entityType: 'user', entityId: user.id, ipAddress: ip });

  return {
    accessToken,
    refreshToken,
    user: publicUser(user),
    tenant: await getTenantSummary(tenantDb, tenantId, tenant.companyName, c.env, user.id),
    mustChangePassword: user.mustChangePassword === 1,
    twoFactorSetupRequired: setupRequired,
  };
}
