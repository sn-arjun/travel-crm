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

import { normalizeCountry } from '../tax-calculator';

export interface CatalogueEnv {
  MASTER_DB: D1Database;
  CACHE?: KVNamespace;
}

/** Callers that only hold the database (AI credit metering) may pass it directly; no cache is used then. */
export type MasterRef = D1Database | CatalogueEnv;

export function asCatalogueEnv(ref: MasterRef): CatalogueEnv {
  return typeof (ref as D1Database).prepare === 'function' ? { MASTER_DB: ref as D1Database } : (ref as CatalogueEnv);
}

export const ALLOWANCE_KEYS = ['ai_credits', 'sms', 'whatsapp', 'whatsapp_marketing', 'otp', 'call_minutes', 'email', 'storage_gb', 'websites'] as const;
export type AllowanceKey = (typeof ALLOWANCE_KEYS)[number];

export const DEFAULT_MARKET = 'IN';
export const CATALOGUE_CACHE_TTL_SECONDS = 300;

const GULF_COUNTRIES = new Set(['AE', 'SA', 'QA', 'OM', 'KW', 'BH']);
const MY_TH_COUNTRIES = new Set(['MY', 'TH']);
const LK_NP_BD_COUNTRIES = new Set(['LK', 'NP', 'BD', 'BT', 'MV']);
const ANZ_COUNTRIES = new Set(['AU', 'NZ']);
/** EU member states, the other EEA countries (IS, LI, NO) and Switzerland: billed in EUR (PRICING.md 2.1). */
const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH',
]);

/**
 * The catalogue market (plan_prices.market) an agency's country is priced in; no country means the default (IN).
 * IN -> IN (INR), GB -> UK (GBP), EU/EEA + CH -> EU (EUR), AU + NZ -> ANZ (AUD), the Gulf -> GULF, SG, MY/TH -> MY_TH,
 * LK/NP/BD/BT/MV -> LK_NP_BD, everything else (US, CA, ...) -> WEST (USD).
 */
export function marketForCountry(country: string | null | undefined): string {
  const code = normalizeCountry(country);
  if (!code || code === 'IN') return DEFAULT_MARKET;
  if (code === 'GB' || code === 'UK') return 'UK';
  if (EU_COUNTRIES.has(code)) return 'EU';
  if (ANZ_COUNTRIES.has(code)) return 'ANZ';
  if (GULF_COUNTRIES.has(code)) return 'GULF';
  if (code === 'SG') return 'SG';
  if (MY_TH_COUNTRIES.has(code)) return 'MY_TH';
  if (LK_NP_BD_COUNTRIES.has(code)) return 'LK_NP_BD';
  return 'WEST';
}

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
  /** 'founder' rows are the launch discount (PRICING.md 2.2): a list row with a later validFrom takes over after them. */
  priceKind: 'list' | 'founder';
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
  /** The amounts that hold in every market (plan_allowances rows with market NULL). */
  allowances: Record<string, number>;
  /**
   * R130: amounts that differ in one market (plan_allowances rows with a market), by market then allowance key. Only the
   * keys that differ are listed; every other key falls back to `allowances`. Use planAllowance(), never read both by hand.
   */
  marketAllowances?: Record<string, Record<string, number>>;
  prices: PlanPrice[];
}

/** One allowance of a plan in one market: the market's own row when there is one, else the all-markets row, else 0. */
export function planAllowance(plan: Pick<CataloguePlan, 'allowances' | 'marketAllowances'> | undefined | null, key: string, market?: string | null): number {
  if (!plan) return 0;
  const own = market ? plan.marketAllowances?.[market]?.[key] : undefined;
  return own ?? plan.allowances[key] ?? 0;
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
    db.prepare('SELECT plan_key, allowance_key, monthly_amount, market FROM plan_allowances'),
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
      priceKind: p.price_kind === 'founder' ? 'founder' : 'list',
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
  const marketAllowancesByPlan = new Map<string, Record<string, Record<string, number>>>();
  for (const a of rows(allowances)) {
    if (a.market) {
      const byMarket = marketAllowancesByPlan.get(a.plan_key) ?? {};
      (byMarket[a.market] ??= {})[a.allowance_key] = Number(a.monthly_amount);
      marketAllowancesByPlan.set(a.plan_key, byMarket);
      continue;
    }
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
      marketAllowances: marketAllowancesByPlan.get(p.key) ?? {},
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

/**
 * The price row in force: active, started, newest start date; the default market is the fallback.
 *
 * Before the FIRST row of a plan in a market has started (the approved prices open on 2026-11-01), that first row is
 * used, so staging, test and pre-launch environments quote the launch price instead of having no price at all. Once
 * any row has started, rows that start later are ignored until their date, as before.
 */
export function activePriceFrom(catalogue: Catalogue, planKey: string, market: string = DEFAULT_MARKET, now: Date = new Date()): PlanPrice | null {
  const plan = catalogue.plans.find((p) => p.key === planKey);
  if (!plan) return null;
  const at = now.toISOString().replace(/\.\d{3}Z$/, 'Z'); // whole seconds, like the stored dates
  const pick = (m: string) => {
    const rows = plan.prices.filter((p) => p.market === m && p.isActive);
    return (
      rows.filter((p) => p.validFrom <= at).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0] ??
      rows.sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1))[0] ??
      null
    );
  };
  return pick(market) ?? (market === DEFAULT_MARKET ? null : pick(DEFAULT_MARKET));
}

/** Months a founder price is locked for an agency that signed inside the founder window (PRICING.md section 6). */
export const FOUNDER_LOCK_MONTHS = 24;

export function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

/**
 * The founder terms in force at `at` for a plan in a market, or null when the price in force is a list price.
 * `endsAt` is when the next price row of the plan and market starts (the list price takes over then).
 */
export function founderTermsFrom(
  catalogue: Catalogue,
  planKey: string,
  market: string,
  at: Date = new Date(),
): { founder: PlanPrice; list: PlanPrice | null; endsAt: string | null } | null {
  const founder = activePriceFrom(catalogue, planKey, market, at);
  if (!founder || founder.priceKind !== 'founder') return null;
  const plan = catalogue.plans.find((p) => p.key === planKey);
  const list =
    plan?.prices
      .filter((p) => p.market === founder.market && p.isActive && p.priceKind === 'list' && p.validFrom > founder.validFrom)
      .sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1))[0] ?? null;
  return { founder, list, endsAt: list?.validFrom ?? null };
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
    case 'whatsapp_marketing': return 'whatsapp_marketing';
    case 'otp': return 'otp';
    case 'call_minutes': return 'call_minute';
    case 'email': return 'email';
    default: return null;
  }
}

/** The tenant_usage_caps.cap_key that counts an allowance key's monthly usage (R110): sms -> sms_per_month, ... */
export function capKeyForAllowance(allowanceKey: string): string {
  return `${allowanceKey}_per_month`;
}

/** 'YYYY-MM' of the month before `periodKey`. */
export function previousPeriodKey(periodKey: string): string {
  const year = Number(periodKey.slice(0, 4));
  const month = Number(periodKey.slice(5, 7));
  const d = new Date(Date.UTC(year, month - 2, 1));
  return d.toISOString().slice(0, 7);
}

export async function tenantPlanKey(ref: MasterRef, tenantId: string): Promise<string> {
  const row = await asCatalogueEnv(ref).MASTER_DB
    .prepare('SELECT plan FROM tenants WHERE id = ?')
    .bind(tenantId)
    .first<{ plan: string | null }>();
  return row?.plan || 'trial';
}

/** The catalogue market of an agency (its country decides it; no country means India). */
export async function tenantMarket(ref: MasterRef, tenantId: string): Promise<string> {
  const row = await asCatalogueEnv(ref).MASTER_DB
    .prepare('SELECT country FROM tenants WHERE id = ?')
    .bind(tenantId)
    .first<{ country: string | null }>();
  return marketForCountry(row?.country);
}

/** Units that add-on packs were granted to this agency in one month (not counting what carries in from the month before). */
async function packUnitsBoughtIn(
  db: D1Database,
  tenantId: string,
  allowanceKey: string,
  periodKey: string,
  onlyPurchases = false,
): Promise<number> {
  const channel = allowanceChannel(allowanceKey);
  const source = onlyPurchases ? ` AND ta.source = 'purchase'` : '';
  let row: { total: number | null } | null;
  if (allowanceKey === 'ai_credits') {
    row = await db
      .prepare(
        `SELECT SUM(ta.units_granted) AS total FROM tenant_addons ta
           JOIN addon_products ap ON ap.key = ta.product_key
          WHERE ta.tenant_id = ? AND ta.period_key = ? AND ap.kind = 'ai_credit_pack'${source}`,
      )
      .bind(tenantId, periodKey)
      .first();
  } else if (channel) {
    row = await db
      .prepare(
        `SELECT SUM(ta.units_granted) AS total FROM tenant_addons ta
           JOIN addon_products ap ON ap.key = ta.product_key
          WHERE ta.tenant_id = ? AND ta.period_key = ? AND ap.kind = 'comm_pack' AND ap.channel = ?${source}`,
      )
      .bind(tenantId, periodKey, channel)
      .first();
  } else {
    return 0;
  }
  return Number(row?.total ?? 0);
}

/**
 * Pack validity (PRICING.md section 6/8): a pack BOUGHT online is good for the month it was paid in and the month
 * after. What is left of it at the end of the month it was bought in carries into the next month; it is computed
 * here, never stored. Usage takes the plan's own amount first and the packs after it, so
 *   left over = min(bought, max(0, plan amount + all packs of that month - used in that month)).
 * The month's usage comes from usage_period_history (written by a trigger when a usage counter moves to a new
 * month) or, when the counter has not moved yet, from the live counter. Packs granted by a super admin stay
 * month-only. Only one month carries: a unit never lives past the end of the month after its purchase.
 */
export async function packUnitsCarriedIn(ref: MasterRef, tenantId: string, allowanceKey: string, periodKey: string): Promise<number> {
  const db = asCatalogueEnv(ref).MASTER_DB;
  const prev = previousPeriodKey(periodKey);
  const bought = await packUnitsBoughtIn(db, tenantId, allowanceKey, prev, true);
  if (bought <= 0) return 0;
  const capKey = capKeyForAllowance(allowanceKey);
  const history = await db
    .prepare('SELECT used FROM usage_period_history WHERE tenant_id = ? AND cap_key = ? AND period_key = ?')
    .bind(tenantId, capKey, prev)
    .first<{ used: number }>();
  let used = history ? Number(history.used) : 0;
  if (!history) {
    const live = await db
      .prepare('SELECT current_usage, period_key FROM tenant_usage_caps WHERE tenant_id = ? AND cap_key = ?')
      .bind(tenantId, capKey)
      .first<{ current_usage: number | null; period_key: string | null }>();
    if (live && live.period_key === prev) used = Number(live.current_usage ?? 0);
  }
  const [catalogue, planKey, market, allPacks] = await Promise.all([
    getCatalogue(ref),
    tenantPlanKey(ref, tenantId),
    tenantMarket(ref, tenantId),
    packUnitsBoughtIn(db, tenantId, allowanceKey, prev),
  ]);
  const base = planAllowance(catalogue.plans.find((x) => x.key === planKey), allowanceKey, market);
  return Math.min(bought, Math.max(0, base + allPacks - used));
}

/** Units that add-on packs give this agency for one month: bought in it, plus what carries in from the month before. */
export async function packUnitsForPeriod(ref: MasterRef, tenantId: string, allowanceKey: string, periodKey: string): Promise<number> {
  const db = asCatalogueEnv(ref).MASTER_DB;
  const own = await packUnitsBoughtIn(db, tenantId, allowanceKey, periodKey);
  return own + (await packUnitsCarriedIn(ref, tenantId, allowanceKey, periodKey));
}

/** Monthly allowance for one key: the plan's amount plus packs for that month (bought in it, or bought last month and not used up). */
export async function getAllowance(
  ref: MasterRef,
  tenantId: string,
  allowanceKey: string,
  periodKey: string = currentPeriodKey(),
): Promise<number> {
  const [catalogue, planKey, market] = await Promise.all([getCatalogue(ref), tenantPlanKey(ref, tenantId), tenantMarket(ref, tenantId)]);
  const plan = catalogue.plans.find((p) => p.key === planKey);
  const base = planAllowance(plan, allowanceKey, market);
  return base + (await packUnitsForPeriod(ref, tenantId, allowanceKey, periodKey));
}

/** Users the agency may have: included users in its plan price + extra-user add-ons. */
export async function seatLimit(ref: MasterRef, tenantId: string, marketOverride?: string): Promise<number> {
  const env = asCatalogueEnv(ref);
  const [catalogue, tenant] = await Promise.all([
    getCatalogue(env),
    env.MASTER_DB.prepare('SELECT plan, max_users, country FROM tenants WHERE id = ?').bind(tenantId).first<{ plan: string | null; max_users: number | null; country: string | null }>(),
  ]);
  const price = activePriceFrom(catalogue, tenant?.plan || 'trial', marketOverride ?? marketForCountry(tenant?.country));
  const included = price?.includedUsers ?? tenant?.max_users ?? 1;
  const extra = await env.MASTER_DB
    .prepare(
      `SELECT SUM(ta.quantity) AS total FROM tenant_addons ta
         JOIN addon_products ap ON ap.key = ta.product_key
        WHERE ta.tenant_id = ? AND ap.kind = 'extra_user' AND (ta.expires_at IS NULL OR ta.expires_at > ?)`,
    )
    .bind(tenantId, new Date().toISOString())
    .first<{ total: number | null }>();
  return included + Number(extra?.total ?? 0);
}
