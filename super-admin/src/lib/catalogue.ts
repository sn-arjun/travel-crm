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
