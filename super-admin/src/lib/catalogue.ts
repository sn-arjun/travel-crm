/** Shapes of GET /admin/catalogue (backend/src/services/plans/catalogue.ts and view.ts). */

export interface CataloguePrice {
  id: string;
  planKey: string;
  market: string;
  currency: string;
  yearlyPrice: number;
  includedUsers: number;
  extraUserYearlyPrice: number | null;
  isActive: boolean;
  /** When this row starts to apply (ISO). */
  validFrom: string;
  /** 'founder' rows are the launch discount (24-month lock); 'list' rows the standing price. */
  priceKind: 'list' | 'founder';
}

/**
 * The price row in force for a market: active, started, newest start date; before the first row has started, the first
 * row (the same rule the backend applies). Null when the market has no active row.
 */
export function priceInForce(prices: CataloguePrice[], market: string, now: Date = new Date()): CataloguePrice | null {
  const rows = prices.filter((p) => p.isActive && p.market === market);
  const at = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const started = rows.filter((p) => p.validFrom <= at).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
  return started[0] ?? [...rows].sort((a, b) => (a.validFrom < b.validFrom ? -1 : 1))[0] ?? null;
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
  prices: CataloguePrice[];
}

export interface CatalogueUnitCost {
  id: string;
  channel: string;
  market: string;
  provider: string;
  unitCost: number;
  currency: string;
  marginPct: number;
  isActive: boolean;
}

export interface CatalogueAddon {
  key: string;
  name: string;
  kind: 'extra_user' | 'ai_credit_pack' | 'comm_pack';
  channel: string | null;
  units: number;
  fixedPrice: number | null;
  currency: string;
  market: string;
  isActive: boolean;
  price: number | null;
}

export interface CatalogueData {
  version: string;
  plans: CataloguePlan[];
  unitCosts: CatalogueUnitCost[];
  addons: CatalogueAddon[];
  notes: string | null;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}
