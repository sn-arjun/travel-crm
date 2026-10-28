import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import { suppliersApi } from './suppliers';
import type { Supplier } from '@travelcrm/shared';

export type RateCardServiceType = 'hotel' | 'transport' | 'activity' | 'meal' | 'flight';
export type RateCardSeason = 'peak' | 'off_peak' | 'shoulder';
export type RateCardUnit = 'per_person' | 'per_room' | 'per_vehicle' | 'per_day';

export interface RateCard {
  id: string;
  supplierId?: string | null;
  supplierName?: string;
  serviceType: RateCardServiceType;
  destination?: string | null;
  name: string;
  description?: string | null;
  season?: RateCardSeason | null;
  costPrice: number;
  sellingPrice?: number | null;
  currency: string;
  unit?: RateCardUnit | null;
  validFrom?: string | null;
  validTo?: string | null;
  childPricePercent?: number | null;
  groupDiscountJson?: unknown;
  detailsJson?: unknown;
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateRateCardRequest {
  supplierId?: string | null;
  serviceType: RateCardServiceType;
  destination?: string | null;
  name: string;
  description?: string | null;
  season?: RateCardSeason | null;
  costPrice: number;
  sellingPrice?: number | null;
  currency?: string;
  unit?: RateCardUnit | null;
  validFrom?: string | null;
  validTo?: string | null;
  childPricePercent?: number | null;
  groupDiscountJson?: string | null;
  detailsJson?: string | null;
}

export type UpdateRateCardRequest = Partial<CreateRateCardRequest>;

export interface RateCardListParams {
  page?: number;
  limit?: number;
  search?: string;
  serviceType?: string;
  destination?: string;
  season?: string;
  supplierId?: string;
  isActive?: boolean;
}

export interface RateCardLookupParams {
  type?: string;
  destination?: string;
  season?: string;
}

export const rateCardsApi = {
  list: (params?: RateCardListParams) =>
    client.get<ApiResponse<PaginatedResponse<RateCard>>>(API_ENDPOINTS.rateCards.list, {
      params: params as Record<string, string | number | boolean | undefined> | undefined,
    }),

  getById: (id: string) =>
    client.get<ApiResponse<RateCard>>(API_ENDPOINTS.rateCards.byId(id)),

  create: (data: CreateRateCardRequest) =>
    client.post<ApiResponse<RateCard>>(API_ENDPOINTS.rateCards.create, data),

  update: (id: string, data: UpdateRateCardRequest) =>
    client.put<ApiResponse<RateCard>>(API_ENDPOINTS.rateCards.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<{ message: string }>>(API_ENDPOINTS.rateCards.byId(id)),

  lookup: (params?: RateCardLookupParams) =>
    client.get<ApiResponse<RateCard[]>>(API_ENDPOINTS.rateCards.lookup, {
      params: params as Record<string, string | number | boolean | undefined> | undefined,
    }),
};

/** Local-calendar YYYY-MM-DD; toISOString() would shift a local-midnight pick back a day east of UTC. */
export function toDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses the date part of a stored value as a local-calendar date. */
export function fromDateOnly(value: string): Date {
  const [y = 0, m = 1, d = 1] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The suppliers endpoint returns raw snake_case rows, so the display name may live under any of these keys. */
export function supplierLabel(s: { name?: string; companyName?: string; company_name?: string }): string {
  return s.companyName ?? s.company_name ?? s.name ?? '';
}

/**
 * One page of supplier options for the relation combobox. The suppliers endpoint returns
 * `{ data: Supplier[], pagination }` while the client types it as a nested paginated body,
 * so accept both shapes.
 */
export async function fetchSupplierOptions(query: string, page: number): Promise<{ items: Supplier[]; total: number }> {
  const res = (await suppliersApi.list({ search: query || undefined, page, limit: 20 })) as unknown as {
    data?: Supplier[] | { data?: Supplier[]; pagination?: { total?: number } };
    pagination?: { total?: number };
  };
  const body = res?.data;
  const items = Array.isArray(body) ? body : (body?.data ?? []);
  const total = res?.pagination?.total ?? (Array.isArray(body) ? undefined : body?.pagination?.total) ?? items.length;
  return { items, total };
}
