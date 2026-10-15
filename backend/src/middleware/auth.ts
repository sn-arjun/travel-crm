import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { error } from '../utils/response';
import { authenticateSuperAdmin, isAdminPath } from './require-super-admin';
import { SUPER_ADMIN_AUDIENCE } from '../services/admin/session';

const PUBLIC_PATHS = [
  '/api/v1/health',
  '/api/v1/auth/resolve-tenant',
  '/api/v1/auth/login',
  '/api/v1/auth/send-otp',
  '/api/v1/auth/verify-otp',
  '/api/v1/auth/refresh-token',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/setup-account',
  '/api/v1/auth/2fa/verify',
  // Super admin login (R111): the only public route under /admin; it has its own rate limit and lockout
  '/api/v1/admin/auth/login',
  '/api/admin/auth/login',
  // Alias paths (no /v1/)
  '/api/health',
  '/api/auth/resolve-tenant',
  '/api/auth/login',
  '/api/auth/send-otp',
  '/api/auth/verify-otp',
  '/api/auth/refresh-token',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/setup-account',
  '/api/auth/2fa/verify',
];

export const authMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  // Always extract client IP (available for all routes including public ones)
  const clientIp = c.req.header('CF-Connecting-IP')
    || c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
    || c.req.header('X-Real-IP')
    || 'unknown';
  c.set('clientIp', clientIp);

  const path = new URL(c.req.url).pathname;

  // Skip auth for public paths
  if (PUBLIC_PATHS.includes(path)) {
    return next();
  }

  // /admin/* is the operator surface (R111): only a super admin token passes. whoami stays on tenant auth so the
  // desktop can ask "am I a super admin?" with an ordinary session and get a plain false.
  if (isAdminPath(path) && !path.endsWith('/admin/whoami')) {
    const failure = await authenticateSuperAdmin(c);
    return failure ?? next();
  }

  // Skip auth for WebSocket upgrade and webhook paths
  if (path === '/api/v1/ws' || path === '/api/ws' || path.startsWith('/api/v1/webhooks') || path.startsWith('/api/webhooks')) {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return error(c, 'Missing or invalid authorization header', 401);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyAccessToken(token, c.env.JWT_SECRET);

    // A super admin token is never a tenant session (different secret, but be explicit).
    if (payload.aud === SUPER_ADMIN_AUDIENCE || (Array.isArray(payload.aud) && payload.aud.includes(SUPER_ADMIN_AUDIENCE))) {
      return error(c, 'Invalid or expired token', 401);
    }

    // Impersonation (R111): a tenant token carrying imp/sid claims. It is honoured only while its session row is
    // open, unexpired and its super admin is still active; it can never change credentials.
    if (payload.imp) {
      const sid = typeof payload.sid === 'string' ? payload.sid : '';
      const session = sid
        ? await c.env.MASTER_DB
            .prepare(
              `SELECT s.ended_at, s.expires_at, s.tenant_id, a.is_active, a.name
                 FROM impersonation_sessions s JOIN super_admins a ON a.id = s.super_admin_id
                WHERE s.id = ?`,
            )
            .bind(sid)
            .first<{ ended_at: string | null; expires_at: string; tenant_id: string; is_active: number; name: string }>()
        : null;
      if (!session || session.ended_at || !session.is_active || session.tenant_id !== payload.tenantId || Date.parse(session.expires_at) <= Date.now()) {
        return error(c, 'Impersonation session has ended', 401);
      }
      if (c.req.method !== 'GET' && /^\/api(\/v1)?\/auth\//.test(path)) {
        return error(c, 'Not allowed while impersonating', 403);
      }
      c.set('impersonatedBy', { superAdminId: String(payload.imp), name: session.name, sessionId: sid });
    }

    c.set('userId', payload.userId);
    c.set('tenantId', payload.tenantId);
    c.set('role', payload.role);
    c.set('userName', payload.email);
    c.set('jwtPayload', payload);

    return next();
  } catch {
    return error(c, 'Invalid or expired token', 401);
  }
};
