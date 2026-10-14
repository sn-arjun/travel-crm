import { SignJWT } from 'jose';
import type { MiddlewareHandler } from 'hono';
import type { AppContext, Env } from '../../types';
import { logActivity } from '../../utils/activity-logger';

/**
 * Impersonation (R111): a super admin acts inside one agency for support.
 *
 * The token is an ordinary tenant access token (same secret, so every tenant route accepts it) for the agency's
 * first active admin, plus claims that make it visibly different and harmless to the platform:
 *   imp  = the super admin id           (authMiddleware turns this into c.var.impersonatedBy)
 *   impName = the super admin's name    (for display only; the name used in logs is read from the registry)
 *   sid  = impersonation_sessions.id    (the session row can be ended early; expiry is enforced from the row too)
 * It lives 30 minutes, has no refresh token, cannot reach /admin/* (wrong secret and audience), cannot call
 * non-GET /auth/* (no password or session changes), and every request is written to the agency's activity log.
 */

export const IMPERSONATION_TTL_SECONDS = 30 * 60;

export async function signImpersonationToken(
  env: Env,
  p: { userId: string; tenantId: string; role: string; email: string; db: string | null; superAdminId: string; superAdminName: string; sessionId: string },
): Promise<{ token: string; expiresAt: string }> {
  const exp = Math.floor(Date.now() / 1000) + IMPERSONATION_TTL_SECONDS;
  const token = await new SignJWT({
    userId: p.userId,
    tenantId: p.tenantId,
    role: p.role,
    email: p.email,
    ...(p.db ? { db: p.db } : {}),
    imp: p.superAdminId,
    impName: p.superAdminName,
    sid: p.sessionId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .setSubject(p.userId)
    .sign(new TextEncoder().encode(env.JWT_SECRET));
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

/**
 * Writes one activity-log row in the agency's own database for every request made with an impersonation token.
 * Mounted after the tenant middleware (which provides tenantDb). The actor is "Support (<super admin name>)";
 * `userId` is the impersonated user because activity_logs.user_id must reference a real user.
 */
export const impersonationActivityLog: MiddlewareHandler<AppContext> = async (c, next) => {
  const who = c.get('impersonatedBy');
  if (!who) return next();

  await next();

  const db = c.get('tenantDb');
  if (!db) return;
  const url = new URL(c.req.url);
  await logActivity(db, {
    userId: c.get('userId'),
    action: 'support_request',
    entityType: 'support_session',
    entityId: who.sessionId,
    details: JSON.stringify({
      actor: `Support (${who.name})`,
      superAdminId: who.superAdminId,
      sessionId: who.sessionId,
      method: c.req.method,
      path: url.pathname,
      status: c.res.status,
    }),
    ipAddress: c.get('clientIp'),
  });
};
