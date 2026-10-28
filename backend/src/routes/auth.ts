import { Hono } from 'hono';
import { zValidator } from '../utils/validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import type { AppContext } from '../types';
import { tenantUsers, tenants } from '../db/master-schema';
import { users, loginHistory } from '../db/tenant-schema';
import { signAccessToken } from '../utils/jwt';
import { comparePassword, hashPassword, validatePassword, PASSWORD_MAX_LENGTH } from '../utils/password';
import { generateId } from '../utils/uuid';
import { parseUserAgent } from '../utils/user-agent-parser';
import { logActivity } from '../utils/activity-logger';
import { rateLimit } from '../middleware/rate-limiter';
import { limitMultiplier } from '../middleware/rate-limit';
import { sendVerifyOtp, checkVerifyOtp } from '../services/twilio';
import { isTestMode } from '../utils/test-mode';
import { AllowanceExhausted, assertAllowance, meterUsage, refundUsage } from '../services/metering/meter';
import { OTP_CAP_MESSAGE, checkAndRecordOtpRequest, checkMobileNumber } from '../services/metering/otp-limits';
import { sendEmail } from '../services/email';
import { accountLockedEmailHtml } from '../templates/reset-email';
import { appUrl } from '../utils/app-urls';
import { sendTransactional } from '../services/mail/transactional';
import { success, created, error } from '../utils/response';
import { getTenantSummary } from '../utils/tenant-summary';
import { isTrialExpired, trialExpiredResponse } from '../services/plans/trial';
import { tenantDbFor, TenantDbUnavailableError } from '../services/tenant-db';
import { createChallenge, isTwoFactorRequired, issueSignIn } from '../services/two-factor';
import twoFactorRoutes from './two-factor';

const auth = new Hono<AppContext>();

// R209: two-factor enrolment, the second sign-in step, recovery and the agency policy.
auth.route('/2fa', twoFactorRoutes);

/** The tenant's own database via the single resolver; null when its binding is missing (never MASTER_DB in multi mode). */
function authTenantDb(env: AppContext['Bindings'], tenant: { dbBinding: string | null }): D1Database | null {
  try {
    return tenantDbFor(env, tenant);
  } catch (e) {
    if (e instanceof TenantDbUnavailableError) return null;
    throw e;
  }
}

function tenantDbUnavailable(c: any) {
  return c.json({ success: false, error: { code: 'TENANT_DB_UNAVAILABLE', message: 'Tenant database is not available' } }, 503);
}

// ============================================================
// POST /resolve-tenant — Look up tenants by email
// ============================================================

const resolveTenantSchema = z.object({
  email: z.string().email(),
});

auth.post(
  '/resolve-tenant',
  zValidator('json', resolveTenantSchema),
  async (c) => {
    const { email } = c.req.valid('json');
    const masterDb = drizzle(c.env.MASTER_DB);

    // Check cache
    const cacheKey = `resolve:${email.toLowerCase()}`;
    const cached = await c.env.CACHE.get(cacheKey, 'json');
    if (cached) {
      return success(c, cached);
    }

    const results = await masterDb
      .select({
        tenantId: tenantUsers.tenantId,
        role: tenantUsers.role,
        companyName: tenants.companyName,
        logoUrl: tenants.logoUrl,
        status: tenants.status,
      })
      .from(tenantUsers)
      .innerJoin(tenants, eq(tenantUsers.tenantId, tenants.id))
      .where(
        and(
          eq(tenantUsers.email, email.toLowerCase()),
          eq(tenantUsers.isActive, 1)
        )
      );

    // Filter out suspended/expired tenants
    const activeTenants = results
      .filter((r) => r.status === 'active' || r.status === 'trial')
      .map((r) => ({
        id: r.tenantId,
        companyName: r.companyName,
        logoUrl: r.logoUrl,
        role: r.role,
      }));

    if (activeTenants.length === 0) {
      return error(c, 'No account found with this email', 404);
    }

    const data = { tenants: activeTenants };

    // Cache for 5 minutes
    await c.env.CACHE.put(cacheKey, JSON.stringify(data), {
      expirationTtl: 300,
    });

    return success(c, data);
  }
);

// ============================================================
// POST /login — Email + password authentication
// ============================================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantId: z.string().min(1),
});

auth.post(
  '/login',
  zValidator('json', loginSchema),
  async (c) => {
    const { email, password, tenantId } = c.req.valid('json');
    const ip = c.get('clientIp');

    // Rate limits: 10 attempts per 15 minutes per IP+email, and 50 per hour per IP.
    const mult = limitMultiplier(c.env);
    const rl = await rateLimit(c.env.CACHE, `rate:login:${ip}:${email.toLowerCase()}`, 10 * mult, 900);
    c.header('X-RateLimit-Remaining', String(rl.remaining));
    if (!rl.allowed) {
      c.header('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + (rl.retryAfterSecs ?? 0)));
      return error(c, `Too many login attempts. Retry in ${rl.retryAfterSecs}s`, 429);
    }
    const rlIp = await rateLimit(c.env.CACHE, `rate:login-ip:${ip}`, 50 * mult, 3600);
    if (!rlIp.allowed) {
      c.header('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + (rlIp.retryAfterSecs ?? 0)));
      return error(c, `Too many login attempts. Retry in ${rlIp.retryAfterSecs}s`, 429);
    }

    // Brute force lockout: 10 consecutive failures lock the account for 15 minutes
    const lockKey = `failed_login:${tenantId}:${email.toLowerCase()}`;
    const lockEntry = await c.env.CACHE.get(lockKey, 'json') as { count: number; lastAt?: number } | null;
    if (lockEntry && lockEntry.count >= 10 * mult) {
      return error(c, 'Account temporarily locked due to too many failed attempts. Try again in 15 minutes.', 423);
    }

    // Resolve tenant DB
    const masterDb = drizzle(c.env.MASTER_DB);
    const [tenant] = await masterDb
      .select({ dbBinding: tenants.dbBinding, status: tenants.status, plan: tenants.plan, companyName: tenants.companyName })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (tenant && (await isTrialExpired(c.env.MASTER_DB, tenantId, tenant))) return trialExpiredResponse(c);
    if (!tenant || (tenant.status !== 'active' && tenant.status !== 'trial')) {
      return error(c, 'Invalid tenant', 400);
    }

    const tenantDb = authTenantDb(c.env, tenant);
    if (!tenantDb) return tenantDbUnavailable(c);

    const db = drizzle(tenantDb);
    const ua = parseUserAgent(c.req.header('User-Agent'));

    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user || !user.isActive) {
      await recordFailedLogin(c.env, db, lockKey, lockEntry, user?.id, ip, ua, email);
      return error(c, 'Invalid email or password', 401);
    }

    // Compare password
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      await recordFailedLogin(c.env, db, lockKey, lockEntry, user.id, ip, ua, email);
      return error(c, 'Invalid email or password', 401);
    }

    // Clear failed login counter
    await c.env.CACHE.delete(lockKey);

    // R209: with two-factor sign-in on, no token is issued until the second step succeeds.
    if (user.totpEnabled === 1) {
      const challengeToken = await createChallenge(c.env, { userId: user.id, tenantId, method: 'password', ip });
      return success(c, { requires2fa: true, challengeToken, methods: ['totp', 'recovery_code'] });
    }

    return success(c, await issueSignIn(c, { db, tenantDb, tenantId, tenant, user, action: 'login' }));
  }
);

// ============================================================
// POST /send-otp — Send OTP via Twilio
// ============================================================

const sendOtpSchema = z.object({
  phone: z.string().min(10),
  tenantId: z.string().min(1),
});

auth.post(
  '/send-otp',
  zValidator('json', sendOtpSchema),
  async (c) => {
    const { phone, tenantId } = c.req.valid('json');
    const ip = c.get('clientIp');

    // Rate limit: 3 sends per 10 minutes
    const rl = await rateLimit(c.env.CACHE, `rate:otp:${ip}:${phone}`, 3, 600);
    c.header('X-RateLimit-Remaining', String(rl.remaining));
    if (!rl.allowed) {
      c.header('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + (rl.retryAfterSecs ?? 0)));
      return error(c, `Too many OTP requests. Retry in ${rl.retryAfterSecs}s`, 429);
    }

    // Only mobile numbers (no landlines, no premium-rate numbers); the same answer whatever the reason.
    const mobile = checkMobileNumber(phone);
    if (!mobile.ok) return error(c, mobile.message, 400);

    // Abuse limits per number and per IP, identical whether or not the account exists (R110).
    const hit = await checkAndRecordOtpRequest(c.env, { tenantId, e164: mobile.e164, ip, purpose: 'login' });
    if (hit) {
      c.header('Retry-After', String(hit.retryAfterSecs));
      return error(c, hit.message, 429);
    }

    const capRefusal = () =>
      c.json(
        {
          success: false,
          code: 'ALLOWANCE_EXHAUSTED',
          message: OTP_CAP_MESSAGE,
          channel: 'otp',
          passwordLogin: true,
          error: { code: 'ALLOWANCE_EXHAUSTED', message: OTP_CAP_MESSAGE },
        },
        402,
      );

    // The agency's monthly login-code allowance. At the cap the person is told to use the password and the
    // agency admins are alerted (usage-alerts). The check comes before the account lookup so both answers match.
    try {
      await assertAllowance(c.env, tenantId, 'otp');
    } catch (err) {
      if (err instanceof AllowanceExhausted) return capRefusal();
      throw err;
    }

    // Verify user exists with this phone in tenant
    const masterDb = drizzle(c.env.MASTER_DB);
    const [tenantUser] = await masterDb
      .select()
      .from(tenantUsers)
      .where(and(eq(tenantUsers.phone, phone), eq(tenantUsers.tenantId, tenantId)))
      .limit(1);

    // Never reveal whether a phone exists: an unknown number gets the same answer and no code is sent.
    const generic = { message: 'If this number belongs to an account, a login code has been sent.' };
    if (!tenantUser) return success(c, generic);

    try {
      await meterUsage(c.env, tenantId, 'otp');
    } catch (err) {
      if (err instanceof AllowanceExhausted) return capRefusal();
      throw err;
    }

    // Local / e2e: the provider is never called under TEST_MODE.
    if (isTestMode(c.env)) return success(c, generic);

    const result = await sendVerifyOtp(c.env, phone);
    if (!result.success) {
      await refundUsage(c.env, tenantId, 'otp'); // a code that was not sent does not use the allowance
      console.error('[auth] login code could not be sent');
      return error(c, 'Failed to send OTP', 500);
    }

    return success(c, generic);
  }
);

// ============================================================
// POST /verify-otp — Verify OTP and authenticate
// ============================================================

const verifyOtpSchema = z.object({
  phone: z.string().min(10),
  otp: z.string().length(6),
  tenantId: z.string().min(1),
});

auth.post(
  '/verify-otp',
  zValidator('json', verifyOtpSchema),
  async (c) => {
    const { phone, otp, tenantId } = c.req.valid('json');
    const ip = c.get('clientIp');

    // Rate limit: 5 verifies per 15 minutes
    const rl = await rateLimit(c.env.CACHE, `rate:otp-verify:${ip}:${phone}`, 5, 900);
    c.header('X-RateLimit-Remaining', String(rl.remaining));
    if (!rl.allowed) {
      c.header('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + (rl.retryAfterSecs ?? 0)));
      return error(c, `Too many attempts. Retry in ${rl.retryAfterSecs}s`, 429);
    }

    const result = await checkVerifyOtp(c.env, phone, otp);
    if (!result.valid) {
      return error(c, 'Invalid or expired OTP', 401);
    }

    // Find user by phone in tenant
    const masterDb = drizzle(c.env.MASTER_DB);
    const [tenantUser] = await masterDb
      .select()
      .from(tenantUsers)
      .where(and(eq(tenantUsers.phone, phone), eq(tenantUsers.tenantId, tenantId)))
      .limit(1);

    if (!tenantUser) {
      return error(c, 'User not found', 404);
    }

    // Resolve tenant DB
    const [tenant] = await masterDb
      .select({ dbBinding: tenants.dbBinding, status: tenants.status, plan: tenants.plan })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) return error(c, 'Invalid tenant', 400);
    if (await isTrialExpired(c.env.MASTER_DB, tenantId, tenant)) return trialExpiredResponse(c);
    const tenantDb = authTenantDb(c.env, tenant);
    if (!tenantDb) return tenantDbUnavailable(c);

    const db = drizzle(tenantDb);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, tenantUser.userId))
      .limit(1);

    if (!user || !user.isActive) {
      return error(c, 'Account is deactivated', 403);
    }

    // R209: the phone code is the first step; an enrolled user still owes the authenticator code.
    if (user.totpEnabled === 1) {
      const challengeToken = await createChallenge(c.env, { userId: user.id, tenantId, method: 'otp', ip });
      return success(c, { requires2fa: true, challengeToken, methods: ['totp', 'recovery_code'] });
    }

    return success(c, await issueSignIn(c, { db, tenantDb, tenantId, tenant, user, action: 'login_otp' }));
  }
);

// ============================================================
// POST /refresh-token — Rotate tokens
// ============================================================

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

auth.post(
  '/refresh-token',
  zValidator('json', refreshTokenSchema),
  async (c) => {
    const { refreshToken } = c.req.valid('json');

    // Check replay
    const usedKey = `used_refresh:${refreshToken}`;
    const used = await c.env.SESSIONS.get(usedKey);
    if (used) {
      return error(c, 'Token has already been used (possible replay attack)', 401);
    }

    // Validate refresh token
    const tokenData = await c.env.SESSIONS.get(`refresh:${refreshToken}`, 'json') as {
      sessionId: string;
      userId: string;
      tenantId: string;
      device: string;
      ip: string;
    } | null;

    if (!tokenData) {
      return error(c, 'Invalid or expired refresh token', 401);
    }

    // Mark old token as used (replay detection)
    await c.env.SESSIONS.put(usedKey, '1', { expirationTtl: 3600 });
    await c.env.SESSIONS.delete(`refresh:${refreshToken}`);

    // Resolve tenant DB and get user
    const masterDb = drizzle(c.env.MASTER_DB);
    const [tenant] = await masterDb
      .select({ dbBinding: tenants.dbBinding, status: tenants.status, plan: tenants.plan })
      .from(tenants)
      .where(eq(tenants.id, tokenData.tenantId))
      .limit(1);

    if (!tenant) return error(c, 'Invalid tenant', 400);
    if (await isTrialExpired(c.env.MASTER_DB, tokenData.tenantId, tenant)) return trialExpiredResponse(c);
    if (tenant.status !== 'active' && tenant.status !== 'trial') {
      return c.json({ success: false, error: { code: 'TENANT_INACTIVE', message: 'Tenant account is not active' } }, 403);
    }
    const tenantDb = authTenantDb(c.env, tenant);
    if (!tenantDb) return tenantDbUnavailable(c);

    const db = drizzle(tenantDb);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, tokenData.userId))
      .limit(1);

    if (!user || !user.isActive) {
      return error(c, 'User account is deactivated', 401);
    }

    // Generate new tokens. A refresh token only exists after a complete sign-in (second step included), and a
    // user the agency now requires to enrol keeps the setup-only restriction (R209).
    const setupRequired = user.totpEnabled !== 1 && (await isTwoFactorRequired(db));
    const newAccessToken = await signAccessToken(
      { userId: user.id, tenantId: tokenData.tenantId, role: user.role, email: user.email, db: tenant.dbBinding, mustChangePassword: user.mustChangePassword === 1, twoFactorSetupRequired: setupRequired },
      c.env.JWT_SECRET
    );

    const newRefreshToken = generateId();

    // Store new refresh token under same session
    await c.env.SESSIONS.put(
      `refresh:${newRefreshToken}`,
      JSON.stringify({ ...tokenData }),
      { expirationTtl: 604800 }
    );

    // Update session record
    await c.env.SESSIONS.put(
      `session:${tokenData.sessionId}`,
      JSON.stringify({
        refreshToken: newRefreshToken,
        userId: user.id,
        device: tokenData.device,
        ip: tokenData.ip,
        loginAt: new Date().toISOString(),
      }),
      { expirationTtl: 604800 }
    );

    return success(c, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        phone: user.phone,
        department: user.department,
        language: user.language,
      },
      tenant: await getTenantSummary(tenantDb, tokenData.tenantId, undefined, c.env, user.id),
      mustChangePassword: user.mustChangePassword === 1,
      twoFactorSetupRequired: setupRequired,
    });
  }
);

// ============================================================
// POST /forgot-password — Send reset email
// ============================================================

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

auth.post(
  '/forgot-password',
  zValidator('json', forgotPasswordSchema),
  async (c) => {
    const { email } = c.req.valid('json');
    const ip = c.get('clientIp');

    // Rate limit: 3 attempts per email per hour
    const rl = await rateLimit(c.env.CACHE, `rate:forgot:${ip}:${email}`, 3, 3600);
    if (!rl.allowed) {
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + (rl.retryAfterSecs ?? 0)));
      return error(c, `Too many password reset requests. Retry in ${rl.retryAfterSecs}s`, 429);
    }
    c.header('X-RateLimit-Remaining', String(rl.remaining));

    // Always return success to prevent email enumeration
    const masterDb = drizzle(c.env.MASTER_DB);
    const results = await masterDb
      .select({ tenantId: tenantUsers.tenantId, userId: tenantUsers.userId })
      .from(tenantUsers)
      .where(eq(tenantUsers.email, email.toLowerCase()))
      .limit(1);

    if (results.length > 0) {
      const resetToken = generateId();

      await c.env.SESSIONS.put(
        `reset:${resetToken}`,
        JSON.stringify({ userId: results[0].userId, tenantId: results[0].tenantId }),
        { expirationTtl: 3600 } // 1 hour
      );

      const resetUrl = `${appUrl(c.env)}/reset-password?token=${resetToken}`;

      await sendTransactional(c.env, {
        to: email,
        template: 'reset_password',
        tenantId: results[0].tenantId,
        data: { resetUrl, name: email },
      });
    }

    return success(c, { message: 'If an account exists, a reset link has been sent' });
  }
);

// ============================================================
// POST /reset-password — Reset password with token
// ============================================================

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

auth.post(
  '/reset-password',
  zValidator('json', resetPasswordSchema),
  async (c) => {
    const { token, password } = c.req.valid('json');

    const tokenData = await c.env.SESSIONS.get(`reset:${token}`, 'json') as {
      userId: string;
      tenantId: string;
    } | null;

    if (!tokenData) {
      return error(c, 'Invalid or expired reset token', 400);
    }

    // Resolve tenant DB
    const masterDb = drizzle(c.env.MASTER_DB);
    const [tenant] = await masterDb
      .select({ dbBinding: tenants.dbBinding, status: tenants.status, plan: tenants.plan })
      .from(tenants)
      .where(eq(tenants.id, tokenData.tenantId))
      .limit(1);

    if (!tenant) return error(c, 'Invalid tenant', 400);
    const tenantDb = authTenantDb(c.env, tenant);
    if (!tenantDb) return tenantDbUnavailable(c);

    const db = drizzle(tenantDb);

    // R209: the password policy, checked before the link is spent so a rejected password can be retried.
    const [target] = await db.select({ email: users.email }).from(users).where(eq(users.id, tokenData.userId)).limit(1);
    const policyError = validatePassword(password, { email: target?.email });
    if (policyError) return error(c, policyError, 400);

    // Delete the token (single use)
    await c.env.SESSIONS.delete(`reset:${token}`);

    // Hash and update password
    const passwordHash = await hashPassword(password);
    await db.update(users).set({ passwordHash, updatedAt: new Date().toISOString() }).where(eq(users.id, tokenData.userId));

    // Clear brute force lockout counter
    const [resetUser] = await db.select({ email: users.email }).from(users).where(eq(users.id, tokenData.userId)).limit(1);
    if (resetUser) {
      const lockKey = `failed_login:${tokenData.tenantId}:${resetUser.email}`;
      await c.env.CACHE.delete(lockKey);
    }

    // Invalidate all sessions for this user
    const indexKey = `sessions_index:${tokenData.userId}`;
    const sessionIds = await c.env.SESSIONS.get(indexKey, 'json') as string[] | null;
    if (sessionIds) {
      for (const sid of sessionIds) {
        const sessionData = await c.env.SESSIONS.get(`session:${sid}`, 'json') as { refreshToken?: string } | null;
        if (sessionData?.refreshToken) {
          await c.env.SESSIONS.delete(`refresh:${sessionData.refreshToken}`);
        }
        await c.env.SESSIONS.delete(`session:${sid}`);
      }
      await c.env.SESSIONS.delete(indexKey);
    }

    await logActivity(db, {
      userId: tokenData.userId,
      action: 'password_reset',
      entityType: 'user',
      entityId: tokenData.userId,
      ipAddress: c.get('clientIp'),
    });

    return success(c, { message: 'Password has been reset successfully' });
  }
);

// ============================================================
// POST /setup-account — Accept invitation and create account
// ============================================================

const setupAccountSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  phone: z.string().optional(),
});

auth.post(
  '/setup-account',
  zValidator('json', setupAccountSchema),
  async (c) => {
    const { token, name, password, phone } = c.req.valid('json');
    const ip = c.get('clientIp');

    const inviteData = await c.env.SESSIONS.get(`invite:${token}`, 'json') as {
      tenantId: string;
      email: string;
      role: string;
    } | null;

    if (!inviteData) {
      return error(c, 'Invalid or expired invitation', 400);
    }

    // R209: the password policy, checked before the invitation is spent so a rejected password can be retried.
    const policyError = validatePassword(password, { email: inviteData.email });
    if (policyError) return error(c, policyError, 400);

    // Delete invite token (single use)
    await c.env.SESSIONS.delete(`invite:${token}`);

    // Resolve tenant DB
    const masterDb = drizzle(c.env.MASTER_DB);
    const [tenant] = await masterDb
      .select({ dbBinding: tenants.dbBinding, status: tenants.status, plan: tenants.plan })
      .from(tenants)
      .where(eq(tenants.id, inviteData.tenantId))
      .limit(1);

    if (!tenant) return error(c, 'Invalid tenant', 400);
    const tenantDb = authTenantDb(c.env, tenant);
    if (!tenantDb) return tenantDbUnavailable(c);

    const db = drizzle(tenantDb);

    // Activate the pending user in tenant DB (created during invite)
    const passwordHash = await hashPassword(password);
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, inviteData.email.toLowerCase()))
      .limit(1);

    let userId: string;
    if (existingUser) {
      // Update existing pending user
      userId = existingUser.id;
      await db.update(users).set({
        name,
        phone: phone || null,
        passwordHash,
        inviteStatus: 'active',
        updatedAt: new Date().toISOString(),
      }).where(eq(users.id, userId));
    } else {
      // Fallback: insert new user (for backward compatibility)
      userId = generateId();
      await db.insert(users).values({
        id: userId,
        email: inviteData.email.toLowerCase(),
        phone: phone || null,
        name,
        passwordHash,
        role: inviteData.role,
        inviteStatus: 'active',
      });
    }

    // Update master tenant_users with userId
    await masterDb
      .update(tenantUsers)
      .set({ userId, phone: phone || null })
      .where(
        and(
          eq(tenantUsers.email, inviteData.email.toLowerCase()),
          eq(tenantUsers.tenantId, inviteData.tenantId)
        )
      );

    // Auto-login: generate tokens
    const ua = parseUserAgent(c.req.header('User-Agent'));
    const accessToken = await signAccessToken(
      { userId, tenantId: inviteData.tenantId, role: inviteData.role, email: inviteData.email },
      c.env.JWT_SECRET
    );

    const refreshToken = generateId();
    const sessionId = generateId();

    await c.env.SESSIONS.put(
      `refresh:${refreshToken}`,
      JSON.stringify({ sessionId, userId, tenantId: inviteData.tenantId, device: ua.device, ip, loginAt: new Date().toISOString() }),
      { expirationTtl: 604800 }
    );

    await c.env.SESSIONS.put(
      `session:${sessionId}`,
      JSON.stringify({ refreshToken, userId, device: ua.device, browser: ua.browser, os: ua.os, ip, userAgent: c.req.header('User-Agent'), loginAt: new Date().toISOString() }),
      { expirationTtl: 604800 }
    );

    await c.env.SESSIONS.put(`sessions_index:${userId}`, JSON.stringify([sessionId]));

    await logActivity(db, {
      userId,
      action: 'account_setup',
      entityType: 'user',
      entityId: userId,
      ipAddress: ip,
    });

    return created(c, {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        email: inviteData.email,
        name,
        role: inviteData.role,
        avatarUrl: null,
        phone: phone || null,
        department: null,
        language: 'en',
      },
      tenant: await getTenantSummary(tenantDb, inviteData.tenantId, undefined, c.env, userId),
    });
  }
);

// ============================================================
// GET /sessions — List active sessions
// ============================================================

auth.get('/sessions', async (c) => {
  const userId = c.get('userId');
  const indexKey = `sessions_index:${userId}`;
  const sessionIds = await c.env.SESSIONS.get(indexKey, 'json') as string[] | null;

  if (!sessionIds || sessionIds.length === 0) {
    return success(c, []);
  }

  // Get current session from auth header
  const authHeader = c.req.header('Authorization');
  const currentRefreshToken = c.req.header('X-Refresh-Token');

  const sessions = [];
  const validIds: string[] = [];

  for (const sid of sessionIds) {
    const sessionData = await c.env.SESSIONS.get(`session:${sid}`, 'json') as {
      refreshToken: string;
      userId: string;
      device: string;
      browser: string;
      os: string;
      ip: string;
      userAgent: string;
      loginAt: string;
    } | null;

    if (sessionData) {
      validIds.push(sid);
      sessions.push({
        id: sid,
        device: sessionData.device,
        browser: sessionData.browser,
        os: sessionData.os,
        ipAddress: sessionData.ip,
        loginAt: sessionData.loginAt,
        isCurrent: currentRefreshToken === sessionData.refreshToken,
      });
    }
  }

  // Clean up stale sessions from index
  if (validIds.length !== sessionIds.length) {
    await c.env.SESSIONS.put(indexKey, JSON.stringify(validIds));
  }

  return success(c, sessions);
});

// ============================================================
// DELETE /sessions/:id — Revoke a specific session
// ============================================================

auth.delete('/sessions/:id', async (c) => {
  const sessionId = c.req.param('id');
  const userId = c.get('userId');

  const sessionData = await c.env.SESSIONS.get(`session:${sessionId}`, 'json') as {
    refreshToken: string;
    userId: string;
  } | null;

  if (!sessionData || sessionData.userId !== userId) {
    return error(c, 'Session not found', 404);
  }

  // Delete session and refresh token
  await c.env.SESSIONS.delete(`refresh:${sessionData.refreshToken}`);
  await c.env.SESSIONS.delete(`session:${sessionId}`);

  // Update index
  const indexKey = `sessions_index:${userId}`;
  const sessionIds = await c.env.SESSIONS.get(indexKey, 'json') as string[] | null;
  if (sessionIds) {
    const updated = sessionIds.filter((id) => id !== sessionId);
    await c.env.SESSIONS.put(indexKey, JSON.stringify(updated));
  }

  return success(c, { message: 'Session revoked' });
});

// ============================================================
// DELETE /sessions — Revoke all sessions except current
// ============================================================

auth.delete('/sessions', async (c) => {
  const userId = c.get('userId');
  const currentRefreshToken = c.req.header('X-Refresh-Token');
  const indexKey = `sessions_index:${userId}`;
  const sessionIds = await c.env.SESSIONS.get(indexKey, 'json') as string[] | null;

  if (!sessionIds) {
    return success(c, { message: 'No sessions to revoke' });
  }

  let currentSessionId: string | null = null;

  for (const sid of sessionIds) {
    const sessionData = await c.env.SESSIONS.get(`session:${sid}`, 'json') as {
      refreshToken: string;
    } | null;

    if (sessionData) {
      if (currentRefreshToken && sessionData.refreshToken === currentRefreshToken) {
        currentSessionId = sid;
      } else {
        await c.env.SESSIONS.delete(`refresh:${sessionData.refreshToken}`);
        await c.env.SESSIONS.delete(`session:${sid}`);
      }
    }
  }

  // Keep only current session in index
  await c.env.SESSIONS.put(
    indexKey,
    JSON.stringify(currentSessionId ? [currentSessionId] : [])
  );

  return success(c, { message: 'All other sessions revoked' });
});

// ============================================================
// POST /change-password — Signed-in user chooses a new password (R113)
// Also the only way out of a first login with a temporary password (must_change_password).
// ============================================================

// The full policy (utils/password.ts validatePassword) runs in the handler once the user's email is known.
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: z.string().min(1, 'Enter a new password').max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`),
});

auth.post(
  '/change-password',
  zValidator('json', changePasswordSchema),
  async (c) => {
    const { currentPassword, newPassword } = c.req.valid('json');
    const userId = c.get('userId');
    const tenantId = c.get('tenantId');
    const tenantDb = c.get('tenantDb');
    if (!userId || !tenantDb) return error(c, 'Missing or invalid authorization header', 401);

    // The current password is checkable with a stolen token, so bound the guesses per user.
    const mult = limitMultiplier(c.env);
    const rl = await rateLimit(c.env.CACHE, `rate:change-password:${userId}`, 10 * mult, 900);
    if (!rl.allowed) return error(c, `Too many attempts. Retry in ${rl.retryAfterSecs}s`, 429);

    const db = drizzle(tenantDb);
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || !user.isActive) return error(c, 'User account is deactivated', 401);

    if (!(await comparePassword(currentPassword, user.passwordHash))) {
      return error(c, 'Current password is incorrect', 401);
    }
    if (currentPassword === newPassword) {
      return error(c, 'New password must be different from the current password', 400);
    }
    const policyError = validatePassword(newPassword, { email: user.email });
    if (policyError) return error(c, policyError, 400);

    const passwordHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash, mustChangePassword: 0, updatedAt: new Date().toISOString() })
      .where(eq(users.id, userId));

    await c.env.CACHE.delete(`failed_login:${tenantId}:${user.email.toLowerCase()}`);

    // Revoke every other session: keep only the one the caller's refresh token belongs to.
    const keepRefresh = c.req.header('X-Refresh-Token');
    const kept = keepRefresh
      ? ((await c.env.SESSIONS.get(`refresh:${keepRefresh}`, 'json')) as { sessionId?: string; userId?: string } | null)
      : null;
    const keepSessionId = kept?.userId === userId ? kept.sessionId : undefined;
    const indexKey = `sessions_index:${userId}`;
    const sessionIds = ((await c.env.SESSIONS.get(indexKey, 'json')) as string[] | null) ?? [];
    for (const sid of sessionIds) {
      if (sid === keepSessionId) continue;
      const sessionData = (await c.env.SESSIONS.get(`session:${sid}`, 'json')) as { refreshToken?: string } | null;
      if (sessionData?.refreshToken) await c.env.SESSIONS.delete(`refresh:${sessionData.refreshToken}`);
      await c.env.SESSIONS.delete(`session:${sid}`);
    }
    if (keepSessionId) await c.env.SESSIONS.put(indexKey, JSON.stringify([keepSessionId]));
    else await c.env.SESSIONS.delete(indexKey);

    await logActivity(db, {
      userId,
      action: 'password_changed',
      entityType: 'user',
      entityId: userId,
      ipAddress: c.get('clientIp'),
    });

    await sendTransactional(c.env, {
      to: user.email,
      template: 'password_changed',
      tenantId,
      data: { name: user.name },
    });

    // The caller's old access token still says "must change"; hand back one that does not.
    const accessToken = await signAccessToken(
      { userId: user.id, tenantId, role: user.role, email: user.email, db: c.get('jwtPayload')?.db },
      c.env.JWT_SECRET,
    );
    return success(c, { message: 'Password changed', accessToken, mustChangePassword: false });
  }
);

// ============================================================
// POST /logout — Logout current session
// ============================================================

auth.post('/logout', async (c) => {
  const userId = c.get('userId');
  const currentRefreshToken = c.req.header('X-Refresh-Token');

  if (currentRefreshToken) {
    const tokenData = await c.env.SESSIONS.get(`refresh:${currentRefreshToken}`, 'json') as {
      sessionId: string;
    } | null;

    if (tokenData) {
      await c.env.SESSIONS.delete(`refresh:${currentRefreshToken}`);
      await c.env.SESSIONS.delete(`session:${tokenData.sessionId}`);

      // Update index
      const indexKey = `sessions_index:${userId}`;
      const sessionIds = await c.env.SESSIONS.get(indexKey, 'json') as string[] | null;
      if (sessionIds) {
        const updated = sessionIds.filter((id) => id !== tokenData.sessionId);
        await c.env.SESSIONS.put(indexKey, JSON.stringify(updated));
      }
    }
  }

  const tenantDb = c.get('tenantDb');
  if (tenantDb) {
    const db = drizzle(tenantDb);
    await logActivity(db, {
      userId,
      action: 'logout',
      entityType: 'user',
      entityId: userId,
      ipAddress: c.get('clientIp'),
    });
  }

  return success(c, { message: 'Logged out successfully' });
});

// ============================================================
// Helper: Record failed login attempt
// ============================================================

async function recordFailedLogin(
  env: AppContext['Bindings'],
  db: ReturnType<typeof drizzle>,
  lockKey: string,
  lockEntry: { count: number; lastAt?: number } | null,
  userId: string | undefined,
  ip: string,
  ua: { browser: string; os: string; device: string },
  email: string
): Promise<void> {
  // Increment failed count
  const newCount = (lockEntry?.count || 0) + 1;
  await env.CACHE.put(
    lockKey,
    JSON.stringify({ count: newCount, lastAt: Date.now() }),
    { expirationTtl: 900 } // 15 minutes
  );

  // Record login history if user exists
  if (userId) {
    await db.insert(loginHistory).values({
      id: generateId(),
      userId,
      ipAddress: ip,
      browser: ua.browser,
      os: ua.os,
      device: ua.device,
      status: newCount >= 5 ? 'locked' : 'failed',
    });
  }

  // If now locked (5+ failures), send notification
  if (newCount >= 5) {
    try {
      await sendEmail(env, {
        to: email,
        subject: 'Account Locked - TravelCRM Pro',
        html: accountLockedEmailHtml(email),
      }, 'platform_system');
    } catch {
      // Non-critical — don't fail the request
    }
  }
}

export default auth;
