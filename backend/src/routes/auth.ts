import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import type { AppContext } from '../types';
import { tenantUsers, tenants } from '../db/master-schema';
import { users, loginHistory } from '../db/tenant-schema';
import { signAccessToken } from '../utils/jwt';
import { comparePassword, hashPassword } from '../utils/password';
import { generateId } from '../utils/uuid';
import { parseUserAgent } from '../utils/user-agent-parser';
import { logActivity } from '../utils/activity-logger';
import { rateLimit } from '../middleware/rate-limiter';
import { sendVerifyOtp, checkVerifyOtp } from '../services/twilio';
import { sendEmail } from '../services/email';
import { resetPasswordEmailHtml, accountLockedEmailHtml } from '../templates/reset-email';
import { success, created, error } from '../utils/response';

const auth = new Hono<AppContext>();

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

    // Rate limit: 1000 attempts per 15 minutes per IP+email (relaxed for local dev/testing)
    const rl = await rateLimit(c.env.CACHE, `rate:login:${ip}:${email}`, 1000, 900);
    c.header('X-RateLimit-Remaining', String(rl.remaining));
    if (!rl.allowed) {
      c.header('X-RateLimit-Reset', String(Math.ceil(Date.now() / 1000) + (rl.retryAfterSecs ?? 0)));
      return error(c, `Too many login attempts. Retry in ${rl.retryAfterSecs}s`, 429);
    }

    // Check brute force lockout
    const lockKey = `failed_login:${tenantId}:${email.toLowerCase()}`;
    const lockEntry = await c.env.CACHE.get(lockKey, 'json') as { count: number; lastAt?: number } | null;
    if (lockEntry && lockEntry.count >= 50) {
      return error(c, 'Account temporarily locked due to too many failed attempts. Try again in 30 minutes.', 423);
    }

    // Resolve tenant DB
    const masterDb = drizzle(c.env.MASTER_DB);
    const [tenant] = await masterDb
      .select({ d1DatabaseId: tenants.d1DatabaseId, status: tenants.status, companyName: tenants.companyName })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant || (tenant.status !== 'active' && tenant.status !== 'trial')) {
      return error(c, 'Invalid tenant', 400);
    }

    // Get tenant DB binding
    let tenantDb: D1Database;
    if (tenant.d1DatabaseId) {
      const bindingKey = `TENANT_DB_${tenant.d1DatabaseId}` as `TENANT_DB_${string}`;
      tenantDb = c.env[bindingKey] || c.env.MASTER_DB;
    } else {
      tenantDb = c.env.MASTER_DB;
    }

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

    // Generate tokens
    const accessToken = await signAccessToken(
      { userId: user.id, tenantId, role: user.role, email: user.email },
      c.env.JWT_SECRET
    );

    const refreshToken = generateId();
    const sessionId = generateId();

    // Store session in SESSIONS KV
    await c.env.SESSIONS.put(
      `refresh:${refreshToken}`,
      JSON.stringify({ sessionId, userId: user.id, tenantId, device: ua.device, ip, loginAt: new Date().toISOString() }),
      { expirationTtl: 604800 } // 7 days
    );

    await c.env.SESSIONS.put(
      `session:${sessionId}`,
      JSON.stringify({ refreshToken, userId: user.id, device: ua.device, browser: ua.browser, os: ua.os, ip, userAgent: c.req.header('User-Agent'), loginAt: new Date().toISOString() }),
      { expirationTtl: 604800 }
    );

    // Update sessions index
    const indexKey = `sessions_index:${user.id}`;
    const existingIndex = await c.env.SESSIONS.get(indexKey, 'json') as string[] | null;
    const sessionIds = existingIndex ? [...existingIndex, sessionId] : [sessionId];
    await c.env.SESSIONS.put(indexKey, JSON.stringify(sessionIds));

    // Update last_login_at
    await db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id));

    // Record login history
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

    // Log activity
    await logActivity(db, {
      userId: user.id,
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      ipAddress: ip,
    });

    return success(c, {
      accessToken,
      refreshToken,
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
    });
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

    // Verify user exists with this phone in tenant
    const masterDb = drizzle(c.env.MASTER_DB);
    const [tenantUser] = await masterDb
      .select()
      .from(tenantUsers)
      .where(and(eq(tenantUsers.phone, phone), eq(tenantUsers.tenantId, tenantId)))
      .limit(1);

    if (!tenantUser) {
      return error(c, 'No account found with this phone number', 404);
    }

    const result = await sendVerifyOtp(c.env, phone);
    if (!result.success) {
      return error(c, result.error || 'Failed to send OTP', 500);
    }

    return success(c, { message: 'OTP sent successfully' });
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
      .select({ d1DatabaseId: tenants.d1DatabaseId })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    let tenantDb: D1Database;
    if (tenant?.d1DatabaseId) {
      const bindingKey = `TENANT_DB_${tenant.d1DatabaseId}` as `TENANT_DB_${string}`;
      tenantDb = c.env[bindingKey] || c.env.MASTER_DB;
    } else {
      tenantDb = c.env.MASTER_DB;
    }

    const db = drizzle(tenantDb);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, tenantUser.userId))
      .limit(1);

    if (!user || !user.isActive) {
      return error(c, 'Account is deactivated', 403);
    }

    const ua = parseUserAgent(c.req.header('User-Agent'));

    // Generate tokens
    const accessToken = await signAccessToken(
      { userId: user.id, tenantId, role: user.role, email: user.email },
      c.env.JWT_SECRET
    );

    const refreshToken = generateId();
    const sessionId = generateId();

    await c.env.SESSIONS.put(
      `refresh:${refreshToken}`,
      JSON.stringify({ sessionId, userId: user.id, tenantId, device: ua.device, ip, loginAt: new Date().toISOString() }),
      { expirationTtl: 604800 }
    );

    await c.env.SESSIONS.put(
      `session:${sessionId}`,
      JSON.stringify({ refreshToken, userId: user.id, device: ua.device, browser: ua.browser, os: ua.os, ip, userAgent: c.req.header('User-Agent'), loginAt: new Date().toISOString() }),
      { expirationTtl: 604800 }
    );

    const indexKey = `sessions_index:${user.id}`;
    const existingIndex = await c.env.SESSIONS.get(indexKey, 'json') as string[] | null;
    const sessionIds = existingIndex ? [...existingIndex, sessionId] : [sessionId];
    await c.env.SESSIONS.put(indexKey, JSON.stringify(sessionIds));

    await db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, user.id));

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

    await logActivity(db, {
      userId: user.id,
      action: 'login_otp',
      entityType: 'user',
      entityId: user.id,
      ipAddress: ip,
    });

    return success(c, {
      accessToken,
      refreshToken,
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
    });
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
      .select({ d1DatabaseId: tenants.d1DatabaseId })
      .from(tenants)
      .where(eq(tenants.id, tokenData.tenantId))
      .limit(1);

    let tenantDb: D1Database;
    if (tenant?.d1DatabaseId) {
      const bindingKey = `TENANT_DB_${tenant.d1DatabaseId}` as `TENANT_DB_${string}`;
      tenantDb = c.env[bindingKey] || c.env.MASTER_DB;
    } else {
      tenantDb = c.env.MASTER_DB;
    }

    const db = drizzle(tenantDb);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, tokenData.userId))
      .limit(1);

    if (!user || !user.isActive) {
      return error(c, 'User account is deactivated', 401);
    }

    // Generate new tokens
    const newAccessToken = await signAccessToken(
      { userId: user.id, tenantId: tokenData.tenantId, role: user.role, email: user.email },
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

      const resetUrl = `https://app.travelcrm.pro/reset-password?token=${resetToken}`;
      const html = resetPasswordEmailHtml(resetUrl, email);

      await sendEmail(c.env, {
        to: email,
        subject: 'Reset your TravelCRM Pro password',
        html,
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
  password: z.string().min(8),
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

    // Delete the token (single use)
    await c.env.SESSIONS.delete(`reset:${token}`);

    // Resolve tenant DB
    const masterDb = drizzle(c.env.MASTER_DB);
    const [tenant] = await masterDb
      .select({ d1DatabaseId: tenants.d1DatabaseId })
      .from(tenants)
      .where(eq(tenants.id, tokenData.tenantId))
      .limit(1);

    let tenantDb: D1Database;
    if (tenant?.d1DatabaseId) {
      const bindingKey = `TENANT_DB_${tenant.d1DatabaseId}` as `TENANT_DB_${string}`;
      tenantDb = c.env[bindingKey] || c.env.MASTER_DB;
    } else {
      tenantDb = c.env.MASTER_DB;
    }

    const db = drizzle(tenantDb);

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
  password: z.string().min(8),
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

    // Delete invite token (single use)
    await c.env.SESSIONS.delete(`invite:${token}`);

    // Resolve tenant DB
    const masterDb = drizzle(c.env.MASTER_DB);
    const [tenant] = await masterDb
      .select({ d1DatabaseId: tenants.d1DatabaseId })
      .from(tenants)
      .where(eq(tenants.id, inviteData.tenantId))
      .limit(1);

    let tenantDb: D1Database;
    if (tenant?.d1DatabaseId) {
      const bindingKey = `TENANT_DB_${tenant.d1DatabaseId}` as `TENANT_DB_${string}`;
      tenantDb = c.env[bindingKey] || c.env.MASTER_DB;
    } else {
      tenantDb = c.env.MASTER_DB;
    }

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
    { expirationTtl: 1800 } // 30 minutes
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
      });
    } catch {
      // Non-critical — don't fail the request
    }
  }
}

export default auth;
