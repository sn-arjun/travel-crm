import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { error } from '../utils/response';
import { getTenantInfo, tenantDbFor, TenantDbUnavailableError } from '../services/tenant-db';

const CHANGE_PASSWORD_ALLOWED = ['/auth/change-password', '/auth/logout'];

/** Paths (with or without the /v1 prefix) a must-change-password token may reach. */
export function passwordChangeAllowed(method: string, path: string): boolean {
  const p = path.replace(/\/+$/, '').replace(/^\/api(\/v1)?/, '');
  if (CHANGE_PASSWORD_ALLOWED.includes(p)) return true;
  return p === '/users/me' && method.toUpperCase() === 'GET';
}

/** Paths a two-factor-setup-required token (R209) may reach: the 2FA enrolment routes, logout and the profile read. */
export function twoFactorSetupAllowed(method: string, path: string): boolean {
  const p = path.replace(/\/+$/, '').replace(/^\/api(\/v1)?/, '');
  if (p === '/auth/logout' || p.startsWith('/auth/2fa/')) return true;
  return p === '/users/me' && method.toUpperCase() === 'GET';
}

export const tenantMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  const tenantId = c.get('tenantId');

  // Skip if no tenantId (public routes handled by auth middleware)
  if (!tenantId) {
    return next();
  }

  // R113: a token issued for a first login (temporary password) may only change the password, log out or read the profile.
  if (c.get('jwtPayload')?.mcp === true && !passwordChangeAllowed(c.req.method, c.req.path)) {
    return c.json(
      { success: false, error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'You must change your temporary password before continuing' } },
      403,
    );
  }

  // R209: the agency requires two-factor sign-in and this user has not enrolled yet.
  if (c.get('jwtPayload')?.tfs === true && !twoFactorSetupAllowed(c.req.method, c.req.path)) {
    return c.json(
      { success: false, error: { code: 'TWO_FACTOR_SETUP_REQUIRED', message: 'Set up two-factor sign-in before continuing' } },
      403,
    );
  }

  const tenantInfo = await getTenantInfo(c.env, tenantId);
  if (!tenantInfo) {
    return error(c, 'Tenant not found', 404);
  }

  // Check tenant status
  if (tenantInfo.status === 'suspended') {
    return error(c, 'Tenant account is suspended', 403);
  }
  if (tenantInfo.status === 'expired') {
    // R205: an agency whose paid subscription lapsed (failed renewal past the grace period, or ended) is read-only:
    // it can still sign in, read everything and reach billing to pay, but cannot change data. Nothing is deleted.
    // An expired trial has no paid plan to fall back on and stays blocked except for billing and sign-out.
    const path = c.req.path.replace(/\/+$/, '').replace(/^\/api(\/v1)?/, '');
    const method = c.req.method.toUpperCase();
    const alwaysAllowed =
      path === '/billing' || path.startsWith('/billing/') || path === '/auth/logout' || (path === '/users/me' && method === 'GET');
    if (!alwaysAllowed) {
      const row = await c.env.MASTER_DB.prepare('SELECT plan FROM tenants WHERE id = ?').bind(tenantId).first<{ plan: string | null }>();
      if (!row?.plan || row.plan === 'trial') return error(c, 'Tenant subscription has expired', 403);
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
        const message = 'Your subscription has expired and the workspace is read-only. Pay under Settings > Billing to continue.';
        return c.json({ success: false, code: 'SUBSCRIPTION_EXPIRED', message, error: { code: 'SUBSCRIPTION_EXPIRED', message } }, 402);
      }
    }
  }
  if (tenantInfo.status === 'cancelled') {
    return error(c, 'Tenant account has been cancelled', 403);
  }

  try {
    c.set('tenantDb', tenantDbFor(c.env, tenantInfo));
  } catch (e) {
    if (e instanceof TenantDbUnavailableError) {
      console.error(JSON.stringify({ event: 'tenant_db_unavailable', tenantId, binding: e.tenantBinding }));
      return c.json(
        { success: false, error: { code: 'TENANT_DB_UNAVAILABLE', message: 'Tenant database is not available' } },
        503,
      );
    }
    throw e;
  }
  return next();
};
