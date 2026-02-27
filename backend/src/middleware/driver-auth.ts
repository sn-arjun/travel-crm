import type { MiddlewareHandler } from 'hono';
import { jwtVerify } from 'jose';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { AppContext } from '../types';
import { tenants } from '../db/master-schema';
import { error } from '../utils/response';

const TENANT_CACHE_TTL = 300; // 5 minutes

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

    // Resolve tenant DB (same logic as tenant middleware)
    const cacheKey = `tenant:${tenantId}`;
    const cached = await c.env.CACHE.get(cacheKey, 'json') as { d1DatabaseId: string | null; status: string } | null;

    let tenantInfo: { d1DatabaseId: string | null; status: string };

    if (cached) {
      tenantInfo = cached;
    } else {
      const masterDb = drizzle(c.env.MASTER_DB);
      const [tenant] = await masterDb
        .select({ d1DatabaseId: tenants.d1DatabaseId, status: tenants.status })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant) {
        return error(c, 'Tenant not found', 404);
      }

      tenantInfo = { d1DatabaseId: tenant.d1DatabaseId, status: tenant.status };
      await c.env.CACHE.put(cacheKey, JSON.stringify(tenantInfo), { expirationTtl: TENANT_CACHE_TTL });
    }

    if (tenantInfo.status === 'suspended') return error(c, 'Tenant account is suspended', 403);
    if (tenantInfo.status === 'expired') return error(c, 'Tenant subscription has expired', 403);

    let tenantDb: D1Database;
    if (tenantInfo.d1DatabaseId) {
      const bindingKey = `TENANT_DB_${tenantInfo.d1DatabaseId}` as `TENANT_DB_${string}`;
      const binding = c.env[bindingKey];
      tenantDb = binding ? binding : c.env.MASTER_DB;
    } else {
      tenantDb = c.env.MASTER_DB;
    }

    c.set('tenantDb', tenantDb);

    return next();
  } catch {
    return error(c, 'Invalid or expired token', 401);
  }
};
