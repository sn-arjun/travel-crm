import type { MiddlewareHandler } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { AppContext } from '../types';
import { tenants } from '../db/master-schema';
import { error } from '../utils/response';

const TENANT_CACHE_TTL = 300; // 5 minutes

interface TenantCacheEntry {
  d1DatabaseId: string | null;
  status: string;
}

export const tenantMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  const tenantId = c.get('tenantId');

  // Skip if no tenantId (public routes handled by auth middleware)
  if (!tenantId) {
    return next();
  }

  // Check cache first
  const cacheKey = `tenant:${tenantId}`;
  const cached = await c.env.CACHE.get(cacheKey, 'json') as TenantCacheEntry | null;

  let tenantInfo: TenantCacheEntry;

  if (cached) {
    tenantInfo = cached;
  } else {
    // Look up tenant in master DB
    const masterDb = drizzle(c.env.MASTER_DB);
    const [tenant] = await masterDb
      .select({
        d1DatabaseId: tenants.d1DatabaseId,
        status: tenants.status,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return error(c, 'Tenant not found', 404);
    }

    tenantInfo = {
      d1DatabaseId: tenant.d1DatabaseId,
      status: tenant.status,
    };

    // Cache tenant info
    await c.env.CACHE.put(cacheKey, JSON.stringify(tenantInfo), {
      expirationTtl: TENANT_CACHE_TTL,
    });
  }

  // Check tenant status
  if (tenantInfo.status === 'suspended') {
    return error(c, 'Tenant account is suspended', 403);
  }
  if (tenantInfo.status === 'expired') {
    return error(c, 'Tenant subscription has expired', 403);
  }

  // Resolve D1 binding for tenant
  let tenantDb: D1Database;

  if (tenantInfo.d1DatabaseId) {
    const bindingKey = `TENANT_DB_${tenantInfo.d1DatabaseId}` as `TENANT_DB_${string}`;
    const binding = c.env[bindingKey];
    if (binding) {
      tenantDb = binding;
    } else {
      // Fallback to MASTER_DB for dev/single-db setups
      tenantDb = c.env.MASTER_DB;
    }
  } else {
    // No dedicated DB — use master (dev mode)
    tenantDb = c.env.MASTER_DB;
  }

  c.set('tenantDb', tenantDb);
  return next();
};
