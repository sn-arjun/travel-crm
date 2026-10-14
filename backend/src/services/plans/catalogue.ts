/**
 * The plan catalogue (R109): the one place plans, prices, included users, allowances and add-ons are defined.
 *
 * Everything lives in MASTER_DB (migration 0015) and is edited by the super admin. Readers go through
 * getCatalogue(), which caches the whole catalogue in KV under `plans:v<version>` for 300 seconds. Every admin
 * write calls bumpCatalogueVersion(), so the next read misses the old key and reloads.
 *
 * Allowance for a period = the plan's monthly amount + units granted by add-on packs for that period.
 * Seat limit = users included in the plan's price + extra-user add-ons (which do not expire).
 */

export interface CatalogueEnv {
  MASTER_DB: D1Database;
  CACHE?: KVNamespace;
}

/** Callers that only hold the database (AI credit metering) may pass it directly; no cache is used then. */
export type MasterRef = D1Database | CatalogueEnv;

export function asCatalogueEnv(ref: MasterRef): CatalogueEnv {
  return typeof (ref as D1Database).prepare === 'function' ? { MASTER_DB: ref as D1Database } : (ref as CatalogueEnv);
}

export const ALLOWANCE_KEYS = ['ai_credits', 'sms', 'whatsapp', 'otp', 'call_minutes', 'email'] as const;
export type AllowanceKey = (typeof ALLOWANCE_KEYS)[number];

export const DEFAULT_MARKET = 'IN';
export const CATALOGUE_CACHE_TTL_SECONDS = 300;

export interface PlanPrice {
  id: string;
  planKey: string;
  market: string;
  currency: string;
  yearlyPrice: number;
  includedUsers: number;
  extraUserYearlyPrice: number | null;
  isActive: boolean;
  validFrom: string;
}

export interface CataloguePlan {
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isPublic: boolean;
  trialDays: number;
  isActive: boolean;
  features: string[];
  allowances: Record<string, number>;
  prices: PlanPrice[];
}

export interface UnitCost {
  id: string;
  channel: string;
  market: string;
  provider: string;
  unitCost: number;
  currency: string;
  marginPct: number;
  effectiveFrom: string;
  isActive: boolean;
}

export interface AddonProduct {
  key: string;
  name: string;
  kind: 'extra_user' | 'ai_credit_pack' | 'comm_pack';
  channel: string | null;
  units: number;
  fixedPrice: number | null;
  currency: string;
  market: string;
  isActive: boolean;
}

export interface Catalogue {
  version: string;
  plans: CataloguePlan[];
  unitCosts: UnitCost[];
  addons: AddonProduct[];
}

const VERSION_KEY = 'plans:version';

async function loadCatalogue(db: D1Database, version: string): Promise<Catalogue> {
  const [plans, prices, features, allowances, costs, addons] = await db.batch([
    db.prepare('SELECT * FROM plans ORDER BY sort_order, key'),
    db.prepare('SELECT * FROM plan_prices ORDER BY plan_key, market, valid_from'),
    db.prepare('SELECT plan_key, feature_key FROM plan_features ORDER BY plan_key, feature_key'),
    db.prepare('SELECT plan_key, allowance_key, monthly_amount FROM plan_allowances'),
    db.prepare('SELECT * FROM comm_unit_costs ORDER BY channel, market, effective_from'),
    db.prepare('SELECT * FROM addon_products ORDER BY kind, key'),
  ]);

  const rows = (r: D1Result) => (r.results ?? []) as Array<Record<string, any>>;

  const pricesByPlan = new Map<string, PlanPrice[]>();
  for (const p of rows(prices)) {
    const list = pricesByPlan.get(p.plan_key) ?? [];
    list.push({
      id: p.id,
      planKey: p.plan_key,
      market: p.market,
      currency: p.currency,
      yearlyPrice: Number(p.yearly_price),
      includedUsers: Number(p.included_users),
      extraUserYearlyPrice: p.extra_user_yearly_price == null ? null : Number(p.extra_user_yearly_price),
      isActive: !!p.is_active,
      validFrom: p.valid_from,
    });
    pricesByPlan.set(p.plan_key, list);
  }
  const featuresByPlan = new Map<string, string[]>();
  for (const f of rows(features)) {
    const list = featuresByPlan.get(f.plan_key) ?? [];
    list.push(f.feature_key);
    featuresByPlan.set(f.plan_key, list);
  }
  const allowancesByPlan = new Map<string, Record<string, number>>();
  for (const a of rows(allowances)) {
    const map = allowancesByPlan.get(a.plan_key) ?? {};
    map[a.allowance_key] = Number(a.monthly_amount);
    allowancesByPlan.set(a.plan_key, map);
  }

  return {
    version,
    plans: rows(plans).map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description ?? null,
      sortOrder: Number(p.sort_order),
      isPublic: !!p.is_public,
      trialDays: Number(p.trial_days),
      isActive: !!p.is_active,
      features: featuresByPlan.get(p.key) ?? [],
      allowances: allowancesByPlan.get(p.key) ?? {},
      prices: pricesByPlan.get(p.key) ?? [],
    })),
    unitCosts: rows(costs).map((c) => ({
      id: c.id,
      channel: c.channel,
      market: c.market,
      provider: c.provider,
      unitCost: Number(c.unit_cost),
      currency: c.currency,
      marginPct: Number(c.margin_pct),
      effectiveFrom: c.effective_from,
      isActive: !!c.is_active,
    })),
    addons: rows(addons).map((a) => ({
      key: a.key,
      name: a.name,
      kind: a.kind,
      channel: a.channel ?? null,
      units: Number(a.units),
      fixedPrice: a.fixed_price == null ? null : Number(a.fixed_price),
      currency: a.currency,
      market: a.market,
      isActive: !!a.is_active,
    })),
  };
}

export async function getCatalogue(ref: MasterRef): Promise<Catalogue> {
  const env = asCatalogueEnv(ref);
  const cache = env.CACHE;
  let version = '0';
  if (cache) {
    try {
      version = (await cache.get(VERSION_KEY)) ?? '0';
      const hit = await cache.get(`plans:v${version}`, 'json');
      if (hit) return hit as Catalogue;
    } catch {
      // KV unavailable: read the database
    }
  }
  const catalogue = await loadCatalogue(env.MASTER_DB, version);
  if (cache) {
    try {
      await cache.put(`plans:v${version}`, JSON.stringify(catalogue), { expirationTtl: CATALOGUE_CACHE_TTL_SECONDS });
    } catch {
      // the next read reloads
    }
  }
  return catalogue;
}

/** Every admin write calls this so readers drop the cached catalogue straight away. */
export async function bumpCatalogueVersion(ref: MasterRef): Promise<void> {
  const cache = asCatalogueEnv(ref).CACHE;
  if (!cache) return;
  try {
    await cache.put(VERSION_KEY, `${Date.now()}${Math.floor(Math.random() * 1000)}`);
  } catch {
    // cached copies expire within 300 seconds anyway
  }
}

export function planFeaturesFrom(catalogue: Catalogue, planKey: string): string[] {
  const plan = catalogue.plans.find((p) => p.key === planKey) ?? catalogue.plans.find((p) => p.key === 'trial');
  return plan?.features ?? [];
}

export async function getPlanFeatures(ref: MasterRef, planKey: string): Promise<string[]> {
  return planFeaturesFrom(await getCatalogue(ref), planKey);
}

/** The price row in force: active, started, newest start date; the default market is the fallback. */
export function activePriceFrom(catalogue: Catalogue, planKey: string, market: string = DEFAULT_MARKET, now: Date = new Date()): PlanPrice | null {
  const plan = catalogue.plans.find((p) => p.key === planKey);
  if (!plan) return null;
  const pick = (m: string) =>
    plan.prices
      .filter((p) => p.market === m && p.isActive && p.validFrom <= now.toISOString())
      .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0] ?? null;
  return pick(market) ?? (market === DEFAULT_MARKET ? null : pick(DEFAULT_MARKET));
}

export async function getActivePrice(ref: MasterRef, planKey: string, market: string = DEFAULT_MARKET): Promise<PlanPrice | null> {
  return activePriceFrom(await getCatalogue(ref), planKey, market);
}

/** UTC month key, the same shape the usage-cap reset uses. */
export function currentPeriodKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** The comm_unit_costs / addon_products channel an allowance key is bought with. */
export function allowanceChannel(key: string): string | null {
  switch (key) {
    case 'sms': return 'sms';
    case 'whatsapp': return 'whatsapp';
    case 'otp': return 'otp';
    case 'call_minutes': return 'call_minute';
    default: return null;
  }
}

export async function tenantPlanKey(ref: MasterRef, tenantId: string): Promise<string> {
  const row = await asCatalogueEnv(ref).MASTER_DB
    .prepare('SELECT plan FROM tenants WHERE id = ?')
    .bind(tenantId)
    .first<{ plan: string | null }>();
  return row?.plan || 'trial';
}

/** Units that add-on packs granted to this agency for one month. */
export async function packUnitsForPeriod(ref: MasterRef, tenantId: string, allowanceKey: string, periodKey: string): Promise<number> {
  const db = asCatalogueEnv(ref).MASTER_DB;
  const channel = allowanceChannel(allowanceKey);
  let row: { total: number | null } | null;
  if (allowanceKey === 'ai_credits') {
    row = await db
      .prepare(
        `SELECT SUM(ta.units_granted) AS total FROM tenant_addons ta
           JOIN addon_products ap ON ap.key = ta.product_key
          WHERE ta.tenant_id = ? AND ta.period_key = ? AND ap.kind = 'ai_credit_pack'`,
      )
      .bind(tenantId, periodKey)
      .first();
  } else if (channel) {
    row = await db
      .prepare(
        `SELECT SUM(ta.units_granted) AS total FROM tenant_addons ta
           JOIN addon_products ap ON ap.key = ta.product_key
          WHERE ta.tenant_id = ? AND ta.period_key = ? AND ap.kind = 'comm_pack' AND ap.channel = ?`,
      )
      .bind(tenantId, periodKey, channel)
      .first();
  } else {
    return 0;
  }
  return Number(row?.total ?? 0);
}

/** Monthly allowance for one key: the plan's amount plus packs granted for that month (packs do not carry over). */
export async function getAllowance(
  ref: MasterRef,
  tenantId: string,
  allowanceKey: string,
  periodKey: string = currentPeriodKey(),
): Promise<number> {
  const [catalogue, planKey] = await Promise.all([getCatalogue(ref), tenantPlanKey(ref, tenantId)]);
  const plan = catalogue.plans.find((p) => p.key === planKey);
  const base = plan?.allowances[allowanceKey] ?? 0;
  return base + (await packUnitsForPeriod(ref, tenantId, allowanceKey, periodKey));
}

/** Users the agency may have: included users in its plan price + extra-user add-ons. */
export async function seatLimit(ref: MasterRef, tenantId: string, market: string = DEFAULT_MARKET): Promise<number> {
  const env = asCatalogueEnv(ref);
  const [catalogue, tenant] = await Promise.all([
    getCatalogue(env),
    env.MASTER_DB.prepare('SELECT plan, max_users FROM tenants WHERE id = ?').bind(tenantId).first<{ plan: string | null; max_users: number | null }>(),
  ]);
  const price = activePriceFrom(catalogue, tenant?.plan || 'trial', market);
  const included = price?.includedUsers ?? tenant?.max_users ?? 1;
  const extra = await env.MASTER_DB
    .prepare(
      `SELECT SUM(ta.quantity) AS total FROM tenant_addons ta
         JOIN addon_products ap ON ap.key = ta.product_key
        WHERE ta.tenant_id = ? AND ap.kind = 'extra_user'`,
    )
    .bind(tenantId)
    .first<{ total: number | null }>();
  return included + Number(extra?.total ?? 0);
}
