import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext, Env } from '../types';
import { success, error } from '../utils/response';
import { generateId } from '../utils/uuid';
import { hashPassword } from '../utils/password';
import { rateLimit } from '../middleware/rate-limiter';
import { limitMultiplier } from '../middleware/rate-limit';
import { logAdminAction } from '../services/admin/audit';
import {
  revokeSuperAdminToken,
  signSuperAdminToken,
  superAdminSecret,
  verifySuperAdminPassword,
} from '../services/admin/session';

/**
 * Super admin authentication (R111). Mounted at /api/v1/admin/auth.
 *
 *   POST /login   public   email + password -> 2 hour super admin token (aud "super-admin", SUPER_ADMIN_JWT_SECRET)
 *   POST /logout  token    revokes the token (KV) and records the logout
 *   GET  /me      token    who am I
 *
 * Login is limited to 5 attempts per 15 minutes per IP (KV) and locks an email for 15 minutes after 5 failed
 * attempts in a row (counted in super_admin_login_log, so unknown emails lock too and nothing is revealed).
 * There is no route that creates a super admin: the first one is made with backend/scripts/create-super-admin.mjs.
 * Super admin tokens are never accepted on tenant routes and tenant tokens are never accepted here.
 */
const app = new Hono<AppContext>();

const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 5;

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(500),
});

async function logAttempt(
  env: Env,
  c: { ip: string; ua: string | null },
  email: string,
  adminId: string | null,
  success: boolean,
  event: 'login' | 'logout' = 'login',
): Promise<void> {
  await env.MASTER_DB
    .prepare(
      `INSERT INTO super_admin_login_log (id, admin_id, ip_address, user_agent, success, created_at, email, event)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(generateId(), adminId, c.ip, c.ua, success ? 1 : 0, new Date().toISOString(), email, event)
    .run();
}

/** Seconds until the email may try again, or 0. Failures since the last success inside the window count. */
async function lockoutSeconds(env: Env, email: string): Promise<number> {
  const cutoff = new Date(Date.now() - LOGIN_WINDOW_SECONDS * 1000).toISOString();
  const row = await env.MASTER_DB
    .prepare(
      `SELECT COUNT(*) AS failures, MAX(created_at) AS last_at
         FROM super_admin_login_log
        WHERE email = ? AND event = 'login' AND success = 0 AND created_at > ?
          AND created_at > COALESCE((SELECT MAX(created_at) FROM super_admin_login_log WHERE email = ? AND event = 'login' AND success = 1), '')`,
    )
    .bind(email, cutoff, email)
    .first<{ failures: number; last_at: string | null }>();
  if (!row || row.failures < MAX_FAILURES || !row.last_at) return 0;
  const until = Date.parse(row.last_at) + LOGIN_WINDOW_SECONDS * 1000;
  return Math.max(1, Math.ceil((until - Date.now()) / 1000));
}

app.post('/login', zValidator('json', loginSchema), async (c) => {
  const env = c.env;
  const { password } = c.req.valid('json');
  const email = c.req.valid('json').email.toLowerCase();
  const ip = c.get('clientIp') ?? 'unknown';
  const ua = c.req.header('User-Agent') ?? null;

  if (!superAdminSecret(env)) {
    console.error('SUPER_ADMIN_JWT_SECRET is not set (32+ characters); super admin login is disabled');
    return error(c, 'Super admin login is not configured', 503);
  }

  const mult = limitMultiplier(env);
  const rl = await rateLimit(env.CACHE, `rate:sa-login:${ip}`, 5 * mult, LOGIN_WINDOW_SECONDS);
  if (!rl.allowed) {
    c.header('Retry-After', String(rl.retryAfterSecs ?? LOGIN_WINDOW_SECONDS));
    return error(c, `Too many login attempts. Retry in ${rl.retryAfterSecs}s`, 429);
  }

  const wait = await lockoutSeconds(env, email);
  if (wait > 0) {
    c.header('Retry-After', String(wait));
    return error(c, `Too many failed attempts. Retry in ${wait}s`, 429);
  }

  const admin = await env.MASTER_DB
    .prepare(`SELECT id, email, name, role, password_hash, is_active FROM super_admins WHERE lower(email) = ? LIMIT 1`)
    .bind(email)
    .first<{ id: string; email: string; name: string; role: string; password_hash: string; is_active: number }>();

  const check = await verifySuperAdminPassword(password, admin?.password_hash ?? null);
  if (!admin || !admin.is_active || !check.ok) {
    await logAttempt(env, { ip, ua }, email, admin?.id ?? null, false);
    return error(c, 'Invalid email or password', 401);
  }

  if (check.needsRehash) {
    // Legacy PBKDF2 hash from the standalone console: upgrade to bcrypt now that the password is known.
    await env.MASTER_DB.prepare(`UPDATE super_admins SET password_hash = ? WHERE id = ?`).bind(await hashPassword(password), admin.id).run();
  }

  const issued = await signSuperAdminToken(env, admin);
  if (!issued) return error(c, 'Super admin login is not configured', 503);

  await env.MASTER_DB.prepare(`UPDATE super_admins SET last_login_at = ? WHERE id = ?`).bind(new Date().toISOString(), admin.id).run();
  await logAttempt(env, { ip, ua }, email, admin.id, true);
  await logAdminAction(env, { id: admin.id, email: admin.email, name: admin.name, ip, userAgent: ua }, 'auth.login', null, null, { tokenExpiresAt: issued.expiresAt }, {
    entityType: 'super_admin',
    entityId: admin.id,
  });

  return success(c, {
    token: issued.token,
    expiresAt: issued.expiresAt,
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
  });
});

app.post('/logout', async (c) => {
  const admin = c.get('superAdmin');
  if (!admin) return error(c, 'Missing or invalid authorization header', 401);
  const ip = c.get('clientIp') ?? 'unknown';
  const ua = c.req.header('User-Agent') ?? null;
  await revokeSuperAdminToken(c.env, admin.tokenId);
  await logAttempt(c.env, { ip, ua }, admin.email.toLowerCase(), admin.id, true, 'logout');
  await logAdminAction(c.env, { id: admin.id, email: admin.email, name: admin.name, ip, userAgent: ua }, 'auth.logout', null, null, null, {
    entityType: 'super_admin',
    entityId: admin.id,
  });
  return success(c, { loggedOut: true });
});

app.get('/me', async (c) => {
  const admin = c.get('superAdmin');
  if (!admin) return error(c, 'Missing or invalid authorization header', 401);
  return success(c, { id: admin.id, email: admin.email, name: admin.name, role: admin.role });
});

export default app;
