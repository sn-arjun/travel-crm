import type { Context, MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { error } from '../utils/response';
import { verifyAccessToken } from '../utils/jwt';
import { authenticateSuperAdminToken } from '../services/admin/session';

/**
 * Super admin gate (R111). The only credential accepted is a super admin token (audience "super-admin",
 * signed with SUPER_ADMIN_JWT_SECRET, issued by POST /admin/auth/login). A tenant access token is recognised
 * only to answer 403 instead of 401; it never grants anything, and neither does an impersonation token
 * (a tenant token with an `imp` claim).
 */

/** /api/v1/admin/... and /api/admin/... */
export function isAdminPath(path: string): boolean {
  return /^\/api(\/v1)?\/admin(\/|$)/.test(path);
}

/** Roles in super_admins.role: super_admin may do everything, support may only read and start impersonation, viewer only reads. */
export function roleMayWrite(role: string, method: string, path: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (role === 'super_admin') return true;
  if (role === 'support' && /\/impersonat(e|ion)(\/|$)/.test(path)) return true;
  if (/\/admin\/auth\/logout$/.test(path)) return true;
  return false;
}

/** Authenticate the Authorization header as a super admin. Returns a failing Response, or null with c.var.superAdmin set. */
export async function authenticateSuperAdmin(c: Context<AppContext>): Promise<Response | null> {
  if (c.get('superAdmin')) return null;

  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return error(c, 'Missing or invalid authorization header', 401);
  const token = header.slice(7);

  const admin = await authenticateSuperAdminToken(c.env, token);
  if (admin) {
    c.set('superAdmin', admin);
    return null;
  }

  // A valid tenant token is an authenticated user without platform access: 403. Anything else: 401.
  try {
    await verifyAccessToken(token, c.env.JWT_SECRET);
    return error(c, 'Insufficient permissions', 403);
  } catch {
    return error(c, 'Invalid or expired token', 401);
  }
}

export const requireSuperAdmin: MiddlewareHandler<AppContext> = async (c, next) => {
  const failure = await authenticateSuperAdmin(c);
  if (failure) return failure;

  const admin = c.get('superAdmin');
  const path = new URL(c.req.url).pathname;
  if (!roleMayWrite(admin.role, c.req.method, path)) {
    return error(c, 'Your role is read-only for this action', 403);
  }
  return next();
};
