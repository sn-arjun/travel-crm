/**
 * Feature resolution (R127): the one function behind feature-gate, the login/settings summary and the console.
 *
 *   1. platform switch off  -> off for everyone               (source 'platform')
 *   2. agency override      -> on or off as set               (source 'override')
 *   3. the plan             -> on if the plan lists it        (source 'plan')
 *
 * The platform switches are read from MASTER_DB and cached in KV for 60 seconds (the KV minimum); every write deletes the cached copy, so a
 * change reaches every Worker within a minute (KV propagation) without a deploy.
 */

import { asCatalogueEnv, getCatalogue, planFeaturesFrom, type MasterRef } from '../plans/catalogue';

export type FeatureSource = 'platform' | 'override' | 'plan';

export interface ResolvedFeature {
  key: string;
  enabled: boolean;
  source: FeatureSource;
}

export const PLATFORM_SWITCH_CACHE_KEY = 'features:platform-off';
export const PLATFORM_SWITCH_TTL_SECONDS = 60;

/** Pure rule, shared by every caller. */
export function resolveFeatureState(input: { key: string; platformOff: boolean; override: boolean | undefined; inPlan: boolean }): ResolvedFeature {
  if (input.platformOff) return { key: input.key, enabled: false, source: 'platform' };
  if (input.override !== undefined) return { key: input.key, enabled: input.override, source: 'override' };
  return { key: input.key, enabled: input.inPlan, source: 'plan' };
}

/** Keys the platform has switched off. */
export async function getPlatformOffKeys(ref: MasterRef): Promise<Set<string>> {
  const env = asCatalogueEnv(ref);
  if (env.CACHE) {
    try {
      const hit = await env.CACHE.get(PLATFORM_SWITCH_CACHE_KEY, 'json');
      if (Array.isArray(hit)) return new Set(hit as string[]);
    } catch {
      // KV unavailable: read the database
    }
  }
  const rows = await env.MASTER_DB.prepare('SELECT feature_key FROM platform_feature_switches WHERE is_enabled = 0').all<{ feature_key: string }>();
  const keys = (rows.results ?? []).map((r) => r.feature_key);
  if (env.CACHE) {
    try {
      await env.CACHE.put(PLATFORM_SWITCH_CACHE_KEY, JSON.stringify(keys), { expirationTtl: PLATFORM_SWITCH_TTL_SECONDS });
    } catch {
      // the next read reloads
    }
  }
  return new Set(keys);
}

/** Every write to platform_feature_switches calls this. */
export async function invalidatePlatformSwitches(ref: MasterRef): Promise<void> {
  const cache = asCatalogueEnv(ref).CACHE;
  if (!cache) return;
  try {
    await cache.delete(PLATFORM_SWITCH_CACHE_KEY);
  } catch {
    // the cached copy expires on its own
  }
}

async function tenantInputs(ref: MasterRef, tenantId: string): Promise<{ plan: string; planFeatures: Set<string>; overrides: Map<string, boolean>; platformOff: Set<string> }> {
  const env = asCatalogueEnv(ref);
  const [tenant, overrideRows, catalogue, platformOff] = await Promise.all([
    env.MASTER_DB.prepare('SELECT plan FROM tenants WHERE id = ?').bind(tenantId).first<{ plan: string | null }>(),
    env.MASTER_DB.prepare('SELECT feature_key, is_enabled FROM tenant_feature_flags WHERE tenant_id = ?').bind(tenantId).all<{ feature_key: string; is_enabled: number }>(),
    getCatalogue(env),
    getPlatformOffKeys(env),
  ]);
  const plan = tenant?.plan || 'trial';
  const overrides = new Map<string, boolean>();
  for (const r of overrideRows.results ?? []) overrides.set(r.feature_key, !!r.is_enabled);
  return { plan, planFeatures: new Set(planFeaturesFrom(catalogue, plan)), overrides, platformOff };
}

/** One feature for one agency. */
export async function resolveFeature(ref: MasterRef, tenantId: string, key: string): Promise<ResolvedFeature & { plan: string }> {
  const t = await tenantInputs(ref, tenantId);
  return { ...resolveFeatureState({ key, platformOff: t.platformOff.has(key), override: t.overrides.get(key), inPlan: t.planFeatures.has(key) }), plan: t.plan };
}

/** Every feature that is in the plan, overridden, platform-switched or given in `extraKeys`. */
export async function resolveTenantFeatures(ref: MasterRef, tenantId: string, extraKeys: Iterable<string> = []): Promise<{ plan: string; features: ResolvedFeature[]; overrides: Record<string, boolean> }> {
  const t = await tenantInputs(ref, tenantId);
  const keys = new Set<string>([...t.planFeatures, ...t.overrides.keys(), ...t.platformOff, ...extraKeys]);
  const features = [...keys].sort().map((key) => resolveFeatureState({ key, platformOff: t.platformOff.has(key), override: t.overrides.get(key), inPlan: t.planFeatures.has(key) }));
  return { plan: t.plan, features, overrides: Object.fromEntries(t.overrides) };
}
