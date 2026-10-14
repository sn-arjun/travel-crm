import type { MiddlewareHandler } from 'hono';
import type { AppContext } from '../types';
import { error } from '../utils/response';
import { getTenantInfo, tenantDbFor, TenantDbUnavailableError } from '../services/tenant-db';

export const tenantMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  const tenantId = c.get('tenantId');

  // Skip if no tenantId (public routes handled by auth middleware)
  if (!tenantId) {
    return next();
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
    return error(c, 'Tenant subscription has expired', 403);
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
