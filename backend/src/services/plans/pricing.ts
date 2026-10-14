/**
 * Prices derived from the catalogue. Nothing here is stored: a change to a unit cost, margin or plan price
 * changes every price shown or charged on the next read, with no code change.
 *
 * Communication pack price = units x unit_cost x (1 + margin_pct / 100), rounded UP to the currency's minor unit.
 */

import {
  DEFAULT_MARKET,
  activePriceFrom,
  getCatalogue,
  type AddonProduct,
  type Catalogue,
  type MasterRef,
  type UnitCost,
} from './catalogue';

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND']);

export function minorUnitDigits(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

/** Round up to the minor unit (paise, cents). The tiny offset absorbs binary floating-point noise. */
export function ceilToMinorUnit(amount: number, currency: string): number {
  const factor = 10 ** minorUnitDigits(currency);
  return Math.ceil(Math.round(amount * factor * 1e6) / 1e6) / factor;
}

/** The unit cost in force for a channel: active, started, newest; the default market is the fallback. */
export function activeUnitCost(catalogue: Catalogue, channel: string, market: string, now: Date = new Date()): UnitCost | null {
  const pick = (m: string) =>
    catalogue.unitCosts
      .filter((u) => u.channel === channel && u.market === m && u.isActive && u.effectiveFrom <= now.toISOString())
      .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0] ?? null;
  return pick(market) ?? (market === DEFAULT_MARKET ? null : pick(DEFAULT_MARKET));
}

export function commPackPriceFrom(catalogue: Catalogue, channel: string, market: string, units: number): { price: number; currency: string } | null {
  const cost = activeUnitCost(catalogue, channel, market);
  if (!cost || !(cost.unitCost > 0)) return null;
  return {
    price: ceilToMinorUnit(units * cost.unitCost * (1 + cost.marginPct / 100), cost.currency),
    currency: cost.currency,
  };
}

export async function commPackPrice(ref: MasterRef, channel: string, market: string, units: number): Promise<number | null> {
  return commPackPriceFrom(await getCatalogue(ref), channel, market, units)?.price ?? null;
}

export function extraUserPriceFrom(catalogue: Catalogue, planKey: string, market: string = DEFAULT_MARKET): { price: number; currency: string } | null {
  const row = activePriceFrom(catalogue, planKey, market);
  if (!row || row.extraUserYearlyPrice == null) return null;
  return { price: row.extraUserYearlyPrice, currency: row.currency };
}

export async function extraUserPrice(ref: MasterRef, planKey: string, market: string = DEFAULT_MARKET): Promise<number | null> {
  return extraUserPriceFrom(await getCatalogue(ref), planKey, market)?.price ?? null;
}

/**
 * Price of one add-on product: fixed_price when set, else computed from the provider unit cost.
 * An extra-user add-on has no price of its own; it takes the plan's extra-user price (pass planKey).
 */
export function addonPriceFrom(
  catalogue: Catalogue,
  product: AddonProduct,
  opts: { planKey?: string } = {},
): { price: number; currency: string } | null {
  if (product.kind === 'extra_user') {
    if (product.fixedPrice != null) return { price: product.fixedPrice, currency: product.currency };
    return opts.planKey ? extraUserPriceFrom(catalogue, opts.planKey, product.market) : null;
  }
  if (product.fixedPrice != null) return { price: product.fixedPrice, currency: product.currency };
  if (product.kind === 'comm_pack' && product.channel) {
    return commPackPriceFrom(catalogue, product.channel, product.market, product.units);
  }
  return null;
}

export async function addonPrice(ref: MasterRef, productKey: string, opts: { planKey?: string } = {}): Promise<number | null> {
  const catalogue = await getCatalogue(ref);
  const product = catalogue.addons.find((a) => a.key === productKey);
  return product ? addonPriceFrom(catalogue, product, opts)?.price ?? null : null;
}
