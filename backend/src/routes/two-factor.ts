import { Hono } from 'hono';
import { z } from 'zod';
import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { tenants } from '../db/master-schema';
import { users, loginHistory, settings } from '../db/tenant-schema';
import { rbac } from '../middleware/rbac';
import { rateLimit } from '../middleware/rate-limiter';
import { limitMultiplier } from '../middleware/rate-limit';
import { comparePassword } from '../utils/password';
import { generateId } from '../utils/uuid';
import { parseUserAgent } from '../utils/user-agent-parser';
import { logActivity } from '../utils/activity-logger';
import { signAccessToken } from '../utils/jwt';
import { success, error } from '../utils/response';
import { sendTransactional } from '../services/mail/transactional';
import { isTrialExpired, trialExpiredResponse } from '../services/plans/trial';
import { tenantDbFor, TenantDbUnavailableError } from '../services/tenant-db';
import { CredentialsKeyMissing } from '../utils/crypto-box';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  otpauthUri,
  verifyTotp,
} from '../utils/totp';
import {
  CHALLENGE_MAX_ATTEMPTS,
  REQUIRE_2FA_KEY,
  TWO_FACTOR_ISSUER,
  isTwoFactorRequired,
  issueSignIn,
  openTotpSecret,
  sealTotpSecret,
  type Challenge,
} from '../services/two-factor';

/**
 * Two-factor sign-in with an authenticator app (R209).
 *
 *   POST /auth/2fa/verify              public   second sign-in step: challengeToken + TOTP or recovery code -> tokens
 *   GET  /auth/2fa/status              signed in
 *   POST /auth/2fa/setup               signed in  password -> secret + otpauth URI (shown once)
 *   POST /auth/2fa/enable              signed in  code from the app -> recovery codes (shown once)
 *   POST /auth/2fa/disable             signed in  password + code
 *   POST /auth/2fa/recovery-codes      signed in  password + code -> a new set of recovery codes
 *   GET  /auth/2fa/policy              signed in  is 2FA required for the agency
 *   PUT  /auth/2fa/policy              admin      require 2FA for every user
 */
const twoFactor = new Hono<AppContext>();

type Db = DrizzleD1Database<Record<string, never>>;
type UserRow = typeof users.$inferSelect;

const credentialsUnavailable = (c: any) =>
  c.json({ success: false, error: { code: 'CREDENTIALS_UNAVAILABLE', message: 'Two-factor sign-in is not available right now' } }, 503);

function parseHashes(stored: string | null): string[] {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === 'string') : [];
  } catch {
    return [];
  }
}

type SecondFactor = { ok: true; kind: 'totp' | 'recovery'; remaining: number } | { ok: false };

/**
 * Checks a TOTP code or a recovery code for an enrolled user and consumes it. A TOTP step is accepted once
 * (compare-and-set on totp_last_step); a recovery code is removed with a compare-and-set on the stored list.
 */
async function consumeSecondFactor(
  env: AppContext['Bindings'],
  tenantDb: D1Database,
  user: UserRow,
  code: string,
): Promise<SecondFactor> {
  const clean = code.trim();
  if (/^\d{6}$/.test(clean.replace(/\s/g, ''))) {
    if (!user.totpSecretEnc) return { ok: false };
    const secret = await openTotpSecret(env, user.id, user.totpSecretEnc);
    const step = await verifyTotp(secret, clean, { afterStep: user.totpLastStep });
    if (step === null) return { ok: false };
    const res = await tenantDb
      .prepare('UPDATE users SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)')
      .bind(step, user.id, step)
      .run();
    if ((res.meta?.changes ?? 0) !== 1) return { ok: false }; // the same code was used a moment ago
    return { ok: true, kind: 'totp', remaining: parseHashes(user.recoveryCodesHash).length };
  }

  if (looksLikeRecoveryCode(clean)) {
    const hash = await hashRecoveryCode(clean);
    const hashes = parseHashes(user.recoveryCodesHash);
    if (!hashes.includes(hash) || !user.recoveryCodesHash) return { ok: false };
    const left = hashes.filter((h) => h !== hash);
    const res = await tenantDb
      .prepare('UPDATE users SET recovery_codes_hash = ? WHERE id = ? AND recovery_codes_hash = ?')
      .bind(JSON.stringify(left), user.id, user.recoveryCodesHash)
      .run();
    if ((res.meta?.changes ?? 0) !== 1) return { ok: false };
    return { ok: true, kind: 'recovery', remaining: left.length };
  }
  return { ok: false };
}

/** The signed-in user's row plus the shared guards (rate limit, password) for the sensitive routes. */
async function sensitiveGuard(c: any, opts: { password?: string }): Promise<{ db: Db; tenantDb: D1Database; user: UserRow } | Response> {
  const userId = c.get('userId') as string;
  const tenantDb = c.get('tenantDb') as D1Database | undefined;
  if (!userId || !tenantDb) return error(c, 'Missing or invalid authorization header', 401);
  const rl = await rateLimit(c.env.CACHE, `rate:2fa-manage:${userId}`, 10 * limitMultiplier(c.env), 900);
  if (!rl.allowed) return error(c, `Too many attempts. Retry in ${rl.retryAfterSecs}s`, 429);
  const db = drizzle(tenantDb);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive) return error(c, 'User account is deactivated', 401);
  if (opts.password !== undefined && !(await comparePassword(opts.password, user.passwordHash))) {
    return error(c, 'Password is incorrect', 401);
  }
  return { db, tenantDb, user };
}

// ============================================================
// POST /verify — Second sign-in step
// ============================================================

const verifySchema = z.object({
  challengeToken: z.string().min(1).max(200),
  code: z.string().min(1).max(32),
});

twoFactor.post('/verify', zValidator('json', verifySchema), async (c) => {
  const { challengeToken, code } = c.req.valid('json');
  const ip = c.get('clientIp');
  const mult = limitMultiplier(c.env);

  const rlIp = await rateLimit(c.env.CACHE, `rate:2fa-verify-ip:${ip}`, 30 * mult, 900);
  if (!rlIp.allowed) return error(c, `Too many attempts. Retry in ${rlIp.retryAfterSecs}s`, 429);

  const key = `2fa_challenge:${challengeToken}`;
  const challenge = (await c.env.SESSIONS.get(key, 'json')) as Challenge | null;
  if (!challenge) return error(c, 'This sign-in has expired. Sign in again.', 401);

  // Across challenges too: someone who keeps asking for new challenges still gets a bounded number of guesses.
  const rlUser = await rateLimit(c.env.CACHE, `rate:2fa-verify-user:${challenge.userId}`, 15 * mult, 900);
  if (!rlUser.allowed) return error(c, `Too many attempts. Retry in ${rlUser.retryAfterSecs}s`, 429);

  const masterDb = drizzle(c.env.MASTER_DB);
  const [tenant] = await masterDb
    .select({ dbBinding: tenants.dbBinding, status: tenants.status, plan: tenants.plan, companyName: tenants.companyName })
    .from(tenants)
    .where(eq(tenants.id, challenge.tenantId))
    .limit(1);
  if (!tenant || (tenant.status !== 'active' && tenant.status !== 'trial')) return error(c, 'Invalid tenant', 400);
  if (await isTrialExpired(c.env.MASTER_DB, challenge.tenantId, tenant)) return trialExpiredResponse(c);

  let tenantDb: D1Database;
  try {
    tenantDb = tenantDbFor(c.env, tenant);
  } catch (e) {
    if (e instanceof TenantDbUnavailableError) {
      return c.json({ success: false, error: { code: 'TENANT_DB_UNAVAILABLE', message: 'Tenant database is not available' } }, 503);
    }
    throw e;
  }
  const db = drizzle(tenantDb);
  const [user] = await db.select().from(users).where(eq(users.id, challenge.userId)).limit(1);
  if (!user || !user.isActive || user.totpEnabled !== 1) {
    await c.env.SESSIONS.delete(key);
    return error(c, 'This sign-in has expired. Sign in again.', 401);
  }

  let result: SecondFactor;
  try {
    result = await consumeSecondFactor(c.env, tenantDb, user, code);
  } catch (e) {
    if (e instanceof CredentialsKeyMissing) return credentialsUnavailable(c);
    throw e;
  }

  if (!result.ok) {
    const attempts = challenge.attempts + 1;
    const ua = parseUserAgent(c.req.header('User-Agent'));
    if (attempts >= CHALLENGE_MAX_ATTEMPTS) {
      await c.env.SESSIONS.delete(key); // the challenge is spent: the password step must be repeated
      await db.insert(loginHistory).values({
        id: generateId(), userId: user.id, ipAddress: ip, browser: ua.browser, os: ua.os, device: ua.device, status: 'locked',
      });
      return error(c, 'Too many incorrect codes. Sign in again.', 429);
    }
    await c.env.SESSIONS.put(key, JSON.stringify({ ...challenge, attempts }), { expirationTtl: 300 });
    await db.insert(loginHistory).values({
      id: generateId(), userId: user.id, ipAddress: ip, browser: ua.browser, os: ua.os, device: ua.device, status: 'failed',
    });
    return error(c, `That code is not right. ${CHALLENGE_MAX_ATTEMPTS - attempts} attempts left.`, 401);
  }

  await c.env.SESSIONS.delete(key);
  const body = await issueSignIn(c, { db, tenantDb, tenantId: challenge.tenantId, tenant, user, action: 'login_2fa' });
  if (result.kind === 'recovery') {
    await logActivity(db, { userId: user.id, action: 'two_factor_recovery_used', entityType: 'user', entityId: user.id, ipAddress: ip });
  }
  return success(c, { ...body, usedRecoveryCode: result.kind === 'recovery', recoveryCodesRemaining: result.remaining });
});

// ============================================================
// GET /status
// ============================================================

twoFactor.get('/status', async (c) => {
  const userId = c.get('userId');
  const tenantDb = c.get('tenantDb');
  if (!userId || !tenantDb) return error(c, 'Missing or invalid authorization header', 401);
  const db = drizzle(tenantDb);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return error(c, 'User not found', 404);
  return success(c, {
    enabled: user.totpEnabled === 1,
    recoveryCodesRemaining: user.totpEnabled === 1 ? parseHashes(user.recoveryCodesHash).length : 0,
    required: await isTwoFactorRequired(db),
  });
});

// ============================================================
// POST /setup — Start enrolment (password re-check, secret shown once)
// ============================================================

twoFactor.post('/setup', zValidator('json', z.object({ password: z.string().min(1).max(256) })), async (c) => {
  const { password } = c.req.valid('json');
  const guard = await sensitiveGuard(c, { password });
  if (guard instanceof Response) return guard;
  const { db, user } = guard;
  if (user.totpEnabled === 1) return error(c, 'Two-factor sign-in is already on. Turn it off first to enrol a new device.', 409);

  const secret = generateTotpSecret();
  try {
    const sealed = await sealTotpSecret(c.env, user.id, secret);
    await db.update(users).set({ totpSecretEnc: sealed, totpLastStep: null, updatedAt: new Date().toISOString() }).where(eq(users.id, user.id));
  } catch (e) {
    if (e instanceof CredentialsKeyMissing) return credentialsUnavailable(c);
    throw e;
  }
  return success(c, { secret, otpauthUri: otpauthUri(secret, user.email, TWO_FACTOR_ISSUER), issuer: TWO_FACTOR_ISSUER, account: user.email });
});

// ============================================================
// POST /enable — Confirm with a code from the app
// ============================================================

twoFactor.post('/enable', zValidator('json', z.object({ code: z.string().min(1).max(16) })), async (c) => {
  const { code } = c.req.valid('json');
  const guard = await sensitiveGuard(c, {});
  if (guard instanceof Response) return guard;
  const { db, tenantDb, user } = guard;
  if (user.totpEnabled === 1) return error(c, 'Two-factor sign-in is already on', 409);
  if (!user.totpSecretEnc) return error(c, 'Start the setup first', 400);

  let step: number | null;
  try {
    step = await verifyTotp(await openTotpSecret(c.env, user.id, user.totpSecretEnc), code);
  } catch (e) {
    if (e instanceof CredentialsKeyMissing) return credentialsUnavailable(c);
    throw e;
  }
  if (step === null) return error(c, 'That code is not right. Check the time on your phone and try the next code.', 400);

  const recoveryCodes = generateRecoveryCodes();
  const hashes = await Promise.all(recoveryCodes.map(hashRecoveryCode));
  const res = await tenantDb
    .prepare('UPDATE users SET totp_enabled = 1, totp_last_step = ?, recovery_codes_hash = ?, updated_at = ? WHERE id = ? AND totp_enabled = 0')
    .bind(step, JSON.stringify(hashes), new Date().toISOString(), user.id)
    .run();
  if ((res.meta?.changes ?? 0) !== 1) return error(c, 'Two-factor sign-in is already on', 409);

  await logActivity(db, { userId: user.id, action: 'two_factor_enabled', entityType: 'user', entityId: user.id, ipAddress: c.get('clientIp') });
  await sendTransactional(c.env, { to: user.email, template: 'two_factor_enabled', tenantId: c.get('tenantId'), data: { name: user.name } });

  // A token issued under "setup required" is replaced by one without the restriction.
  const accessToken = await signAccessToken(
    { userId: user.id, tenantId: c.get('tenantId'), role: user.role, email: user.email, db: c.get('jwtPayload')?.db, mustChangePassword: user.mustChangePassword === 1 },
    c.env.JWT_SECRET,
  );
  return success(c, { enabled: true, recoveryCodes, accessToken });
});

// ============================================================
// POST /disable and POST /recovery-codes — password + a current code
// ============================================================

const passwordAndCode = z.object({ password: z.string().min(1).max(256), code: z.string().min(1).max(32) });

twoFactor.post('/disable', zValidator('json', passwordAndCode), async (c) => {
  const { password, code } = c.req.valid('json');
  const guard = await sensitiveGuard(c, { password });
  if (guard instanceof Response) return guard;
  const { db, tenantDb, user } = guard;
  if (user.totpEnabled !== 1) return error(c, 'Two-factor sign-in is not on', 409);
  if (await isTwoFactorRequired(db)) {
    return c.json({ success: false, error: { code: 'TWO_FACTOR_REQUIRED', message: 'Your agency requires two-factor sign-in, so it cannot be turned off' } }, 403);
  }

  let result: SecondFactor;
  try {
    result = await consumeSecondFactor(c.env, tenantDb, user, code);
  } catch (e) {
    if (e instanceof CredentialsKeyMissing) return credentialsUnavailable(c);
    throw e;
  }
  if (!result.ok) return error(c, 'That code is not right', 401);

  await tenantDb
    .prepare('UPDATE users SET totp_secret_enc = NULL, totp_enabled = 0, recovery_codes_hash = NULL, totp_last_step = NULL, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), user.id)
    .run();
  await logActivity(db, { userId: user.id, action: 'two_factor_disabled', entityType: 'user', entityId: user.id, ipAddress: c.get('clientIp') });
  await sendTransactional(c.env, { to: user.email, template: 'two_factor_disabled', tenantId: c.get('tenantId'), data: { name: user.name } });
  return success(c, { enabled: false });
});

twoFactor.post('/recovery-codes', zValidator('json', passwordAndCode), async (c) => {
  const { password, code } = c.req.valid('json');
  const guard = await sensitiveGuard(c, { password });
  if (guard instanceof Response) return guard;
  const { db, tenantDb, user } = guard;
  if (user.totpEnabled !== 1) return error(c, 'Two-factor sign-in is not on', 409);

  let result: SecondFactor;
  try {
    result = await consumeSecondFactor(c.env, tenantDb, user, code);
  } catch (e) {
    if (e instanceof CredentialsKeyMissing) return credentialsUnavailable(c);
    throw e;
  }
  if (!result.ok) return error(c, 'That code is not right', 401);

  const recoveryCodes = generateRecoveryCodes();
  const hashes = await Promise.all(recoveryCodes.map(hashRecoveryCode));
  await tenantDb
    .prepare('UPDATE users SET recovery_codes_hash = ?, updated_at = ? WHERE id = ?')
    .bind(JSON.stringify(hashes), new Date().toISOString(), user.id)
    .run();
  await logActivity(db, { userId: user.id, action: 'two_factor_recovery_regenerated', entityType: 'user', entityId: user.id, ipAddress: c.get('clientIp') });
  return success(c, { recoveryCodes });
});

// ============================================================
// GET / PUT /policy — require two-factor for every user of the agency
// ============================================================

twoFactor.get('/policy', async (c) => {
  const tenantDb = c.get('tenantDb');
  if (!tenantDb) return error(c, 'Missing or invalid authorization header', 401);
  return success(c, { required: await isTwoFactorRequired(drizzle(tenantDb)) });
});

twoFactor.put('/policy', rbac(['admin']), zValidator('json', z.object({ required: z.boolean() })), async (c) => {
  const { required } = c.req.valid('json');
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  if (!tenantDb) return error(c, 'Missing or invalid authorization header', 401);
  const db = drizzle(tenantDb);

  if (required) {
    // The admin who turns it on must be enrolled, or the next sign-in locks them into setup-only mode.
    const [me] = await db.select({ totpEnabled: users.totpEnabled }).from(users).where(eq(users.id, userId)).limit(1);
    if (me?.totpEnabled !== 1) return error(c, 'Turn on two-factor sign-in for your own account first', 409);
  }

  const now = new Date().toISOString();
  await db
    .insert(settings)
    .values({ key: REQUIRE_2FA_KEY, value: required ? 'true' : 'false', updatedBy: userId, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: required ? 'true' : 'false', updatedBy: userId, updatedAt: now } });
  await logActivity(db, {
    userId,
    action: required ? 'two_factor_required' : 'two_factor_not_required',
    entityType: 'setting',
    entityId: REQUIRE_2FA_KEY,
    ipAddress: c.get('clientIp'),
  });
  return success(c, { required });
});

export default twoFactor;
