import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { error } from '../utils/response';

/**
 * Super-admin registry check shared by the platform administration gate and
 * `GET /admin/whoami`.
 *
 * The signal is an email matched against the `super_admins` table in
 * MASTER_DB — the same registry the standalone super-admin app seeds and
 * authenticates against. A tenant `role` claim is deliberately NOT accepted:
 * tenant admins carry role='admin' and must never reach platform-wide data.
 *
 * `SUPER_ADMIN_EMAIL` is honoured as a bootstrap fallback so a freshly
 * provisioned environment is reachable before the registry is seeded.
 */
export async function isSuperAdminEmail(
  env: { MASTER_DB: D1Database; SUPER_ADMIN_EMAIL?: string },
  email: string | undefined | null,
): Promise<boolean> {
  if (!email) return false;

  const bootstrapEmail = env.SUPER_ADMIN_EMAIL;
  if (bootstrapEmail && bootstrapEmail.toLowerCase() === email.toLowerCase()) {
    return true;
  }

  const admin = await env.MASTER_DB.prepare(
    `SELECT id FROM super_admins WHERE lower(email) = lower(?) AND is_active = 1 LIMIT 1`
  )
    .bind(email)
    .first<{ id: string }>();

  return !!admin;
}

/**
 * Super-admin gate for the platform administration routes.
 */
export const requireSuperAdmin: MiddlewareHandler<AppContext> = async (c, next) => {
  const email = c.get('jwtPayload')?.email;

  if (!email) {
    return error(c, 'Missing or invalid authorization header', 401);
  }

  const env = c.env as unknown as { MASTER_DB: D1Database; SUPER_ADMIN_EMAIL?: string };
  if (!(await isSuperAdminEmail(env, email))) {
    return error(c, 'Insufficient permissions', 403);
  }

  return next();
};
