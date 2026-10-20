/**
 * Read models built from the catalogue: the super admin view (with provider costs and margins) and the
 * public view (prices and allowances only, never provider cost or margin). Add-on prices are computed here.
 */

import { FOUNDER_LOCK_MONTHS, activePriceFrom, DEFAULT_MARKET, founderTermsFrom, type AddonProduct, type Catalogue } from './catalogue';
import { addonPriceFrom, packSalePriceFrom } from './pricing';

export interface AddonView extends AddonProduct {
  price: number | null;
}

export function catalogueView(catalogue: Catalogue) {
  const addons: AddonView[] = catalogue.addons.map((a) => ({
    ...a,
    price: addonPriceFrom(catalogue, a)?.price ?? null,
  }));
  return { version: catalogue.version, plans: catalogue.plans, unitCosts: catalogue.unitCosts, addons };
}

export function publicPlansView(catalogue: Catalogue, market: string = DEFAULT_MARKET, now: Date = new Date()) {
  const plans = catalogue.plans
    .filter((p) => p.isActive && p.isPublic)
    .map((p) => {
      const price = activePriceFrom(catalogue, p.key, market, now);
      if (!price) return null;
      const founder = founderTermsFrom(catalogue, p.key, market, now);
      return {
        key: p.key,
        name: p.name,
        description: p.description,
        billingCycle: 'yearly' as const,
        currency: price.currency,
        yearlyPrice: price.yearlyPrice,
        includedUsers: price.includedUsers,
        extraUserYearlyPrice: price.extraUserYearlyPrice,
        /** 'founder' while the launch discount is in force; the list price then starts on founderEndsAt. */
        priceKind: price.priceKind,
        founderEndsAt: founder?.endsAt ?? null,
        listYearlyPrice: founder?.list?.yearlyPrice ?? null,
        founderLockMonths: founder ? FOUNDER_LOCK_MONTHS : null,
        features: p.features,
        allowances: p.allowances,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const addons = catalogue.addons
    .filter((a) => a.isActive && a.market === market)
    .filter((a) => a.kind !== 'extra_user')
    .map((a) => {
      const priced = packSalePriceFrom(catalogue, a, now);
      return { key: a.key, name: a.name, kind: a.kind, channel: a.channel, units: a.units, price: priced?.price ?? null, currency: priced?.currency ?? a.currency };
    })
    .filter((a) => a.price !== null);

  return { market, plans, addons };
}
