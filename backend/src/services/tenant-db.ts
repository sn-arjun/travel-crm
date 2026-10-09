import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { Env } from '../types';
import { tenants } from '../db/master-schema';

const TENANT_CACHE_TTL = 300; // 5 minutes

export interface TenantInfo {
  d1DatabaseId: string | null;
  status: string;
}

/**
 * Tenant registry lookup (KV-cached). Returns null when the tenant does not exist.
 */
export async function getTenantInfo(env: Env, tenantId: string): Promise<TenantInfo | null> {
  const cacheKey = `tenant:${tenantId}`;
  const cached = await env.CACHE.get(cacheKey, 'json') as TenantInfo | null;
  if (cached) return cached;

  const masterDb = drizzle(env.MASTER_DB);
  const [tenant] = await masterDb
    .select({
      d1DatabaseId: tenants.d1DatabaseId,
      status: tenants.status,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) return null;

  const info: TenantInfo = { d1DatabaseId: tenant.d1DatabaseId, status: tenant.status };
  await env.CACHE.put(cacheKey, JSON.stringify(info), { expirationTtl: TENANT_CACHE_TTL });
  return info;
}

/**
 * Pick the D1 binding for a tenant. Bindings are named after the D1 database id
 * (request path) or the tenant id (queues, cron); dev and single-db setups fall
 * back to MASTER_DB.
 */
export function tenantDbFor(env: Env, tenantId: string, info: TenantInfo): D1Database {
  if (info.d1DatabaseId) {
    const byDatabase = env[`TENANT_DB_${info.d1DatabaseId}` as `TENANT_DB_${string}`];
    if (byDatabase) return byDatabase;
  }
  const byTenant = env[`TENANT_DB_${tenantId}` as `TENANT_DB_${string}`];
  if (byTenant) return byTenant;
  return env.MASTER_DB;
}

/**
 * Every distinct workspace database, for callbacks that carry only a provider id (a delivery
 * receipt names the message, not the workspace). In single-database setups this is one entry.
 * An explicit tenant id, when the callback URL carries one, narrows it to that workspace.
 */
export async function candidateTenantDbs(env: Env, tenantId?: string | null, limit = 200): Promise<D1Database[]> {
  if (tenantId) {
    const db = await resolveTenantDb(env, tenantId);
    return db ? [db] : [];
  }
  const tenants = await env.MASTER_DB.prepare("SELECT id FROM tenants WHERE status = 'active' LIMIT ?").bind(limit).all<{ id: string }>();
  const seen = new Set<D1Database>();
  for (const tenant of tenants.results) {
    const db = await resolveTenantDb(env, tenant.id);
    if (db) seen.add(db);
  }
  if (seen.size === 0) seen.add(env.MASTER_DB);
  return [...seen];
}

/**
 * Resolve a tenant's database outside the authenticated request path (public
 * webhooks, queues, cron). Returns null for unknown, suspended or expired tenants.
 */
export async function resolveTenantDb(env: Env, tenantId: string): Promise<D1Database | null> {
  const info = await getTenantInfo(env, tenantId);
  if (!info) return null;
  if (info.status === 'suspended' || info.status === 'expired') return null;
  return tenantDbFor(env, tenantId, info);
}
