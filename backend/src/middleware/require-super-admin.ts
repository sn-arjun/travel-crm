import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { error } from '../utils/response';

/**
 * Super-admin gate for the platform administration routes.
 *
 * The signal is the authenticated user's email matched against the
 * `super_admins` table in MASTER_DB — the same registry the standalone
 * super-admin app seeds and authenticates against. A tenant `role` claim
 * is deliberately NOT accepted: tenant admins carry role='admin' and must
 * never reach platform-wide data.
 *
 * `SUPER_ADMIN_EMAIL` is honoured as a bootstrap fallback so a freshly
 * provisioned environment is reachable before the registry is seeded.
 */
export const requireSuperAdmin: MiddlewareHandler<AppContext> = async (c, next) => {
  const email = c.get('jwtPayload')?.email;

  if (!email) {
    return error(c, 'Missing or invalid authorization header', 401);
  }

  const bootstrapEmail = (c.env as any).SUPER_ADMIN_EMAIL as string | undefined;
  if (bootstrapEmail && bootstrapEmail.toLowerCase() === email.toLowerCase()) {
    return next();
  }

  const admin = await c.env.MASTER_DB.prepare(
    `SELECT id FROM super_admins WHERE lower(email) = lower(?) AND is_active = 1 LIMIT 1`
  )
    .bind(email)
    .first<{ id: string }>();

  if (!admin) {
    return error(c, 'Insufficient permissions', 403);
  }

  return next();
};
