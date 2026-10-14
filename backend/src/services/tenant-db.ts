import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import type { Env } from '../types';
import { tenants } from '../db/master-schema';

const TENANT_CACHE_TTL = 300; // 5 minutes

export interface TenantInfo {
  d1DatabaseId: string | null;
  /** Worker binding name of the tenant's own database, e.g. TENANT_DB_0190ab... */
  dbBinding: string | null;
  shard: string;
  status: string;
}

/** Raised in multi-tenant mode when a tenant has no usable database binding. Never falls back to MASTER_DB. */
export class TenantDbUnavailableError extends Error {
  constructor(public readonly tenantBinding: string | null) {
    super(`Tenant database binding unavailable${tenantBinding ? `: ${tenantBinding}` : ''}`);
    this.name = 'TenantDbUnavailableError';
  }
}

/** The one binding-name scheme: TENANT_DB_ + the tenant id without hyphens, lower case. */
export function bindingNameFor(tenantId: string): string {
  return `TENANT_DB_${tenantId.replace(/-/g, '').toLowerCase()}`;
}

/** 'single' only when TENANCY_MODE is exactly 'single'; anything else is multi-tenant and fails closed. */
export function tenancyMode(env: Env): 'single' | 'multi' {
  return env.TENANCY_MODE === 'single' ? 'single' : 'multi';
}

/**
 * Tenant registry lookup (KV-cached). Returns null when the tenant does not exist.
 */
export async function getTenantInfo(env: Env, tenantId: string): Promise<TenantInfo | null> {
  const cacheKey = `tenant:v2:${tenantId}`;
  const cached = await env.CACHE.get(cacheKey, 'json') as TenantInfo | null;
  if (cached) return cached;

  const masterDb = drizzle(env.MASTER_DB);
  const [tenant] = await masterDb
    .select({
      d1DatabaseId: tenants.d1DatabaseId,
      dbBinding: tenants.dbBinding,
      shard: tenants.shard,
      status: tenants.status,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) return null;

  const info: TenantInfo = {
    d1DatabaseId: tenant.d1DatabaseId,
    dbBinding: tenant.dbBinding ?? null,
    shard: tenant.shard ?? 's1',
    status: tenant.status,
  };
  await env.CACHE.put(cacheKey, JSON.stringify(info), { expirationTtl: TENANT_CACHE_TTL });
  return info;
}

/**
 * Pick the D1 binding for a tenant. Single mode: the shared MASTER_DB (local dev, tests).
 * Multi mode: the tenant's own binding, or TenantDbUnavailableError. Never MASTER_DB.
 */
export function tenantDbFor(env: Env, info: Pick<TenantInfo, 'dbBinding'>): D1Database {
  if (tenancyMode(env) === 'single') return env.MASTER_DB;
  const name = info.dbBinding;
  if (name && name.startsWith('TENANT_DB_')) {
    const binding = env[name as `TENANT_DB_${string}`];
    if (binding) return binding;
  }
  throw new TenantDbUnavailableError(name ?? null);
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
  if (seen.size === 0 && tenancyMode(env) === 'single') seen.add(env.MASTER_DB);
  return [...seen];
}

/**
 * Resolve a tenant's database outside the authenticated request path (public
 * webhooks, queues, cron). Returns null for unknown, suspended or expired tenants.
 */
export async function resolveTenantDb(env: Env, tenantId: string): Promise<D1Database | null> {
  const info = await getTenantInfo(env, tenantId);
  if (!info) return null;
  if (info.status === 'suspended' || info.status === 'expired' || info.status === 'cancelled') return null;
  try {
    return tenantDbFor(env, info);
  } catch (e) {
    if (e instanceof TenantDbUnavailableError) return null;
    throw e;
  }
}

/** Drop the KV-cached registry entry; call after any tenant status, binding or provisioning change. */
export async function invalidateTenantCache(env: Env, tenantId: string): Promise<void> {
  await env.CACHE.delete(`tenant:v2:${tenantId}`);
}
