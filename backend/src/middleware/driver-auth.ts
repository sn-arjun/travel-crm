import type { MiddlewareHandler } from 'hono';
import { jwtVerify } from 'jose';
import type { AppContext } from '../types';
import { getTenantInfo, tenantDbFor, TenantDbUnavailableError } from '../services/tenant-db';
import { error } from '../utils/response';

function getSecretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/**
 * Driver authentication middleware.
 * Validates driver JWT, sets driverId/tenantId, and resolves tenant DB.
 * Separate from CRM auth — drivers are not users.
 */
export const driverAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return error(c, 'Missing or invalid authorization header', 401);
  }

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, getSecretKey(c.env.JWT_SECRET));

    if (payload.type !== 'driver') {
      return error(c, 'Invalid token type', 403);
    }

    const driverId = payload.driverId as string;
    const tenantId = payload.tenantId as string;

    if (!driverId || !tenantId) {
      return error(c, 'Invalid token payload', 401);
    }

    // Set context variables
    c.set('userId', driverId); // Reuse userId slot for driverId in driver context
    c.set('tenantId', tenantId);
    c.set('role', 'driver');
    c.set('userName', (payload.phone as string) || '');

    // Resolve tenant DB through the single resolver (fails closed in multi-tenant mode)
    const tenantInfo = await getTenantInfo(c.env, tenantId);
    if (!tenantInfo) {
      return error(c, 'Tenant not found', 404);
    }

    if (tenantInfo.status === 'suspended') return error(c, 'Tenant account is suspended', 403);
    if (tenantInfo.status === 'expired') return error(c, 'Tenant subscription has expired', 403);
    if (tenantInfo.status === 'cancelled') return error(c, 'Tenant account has been cancelled', 403);

    let tenantDb: D1Database;
    try {
      tenantDb = tenantDbFor(c.env, tenantInfo);
    } catch (e) {
      if (e instanceof TenantDbUnavailableError) {
        return c.json({ success: false, error: { code: 'TENANT_DB_UNAVAILABLE', message: 'Tenant database is not available' } }, 503);
      }
      throw e;
    }

    c.set('tenantDb', tenantDb);

    return next();
  } catch {
    return error(c, 'Invalid or expired token', 401);
  }
};
