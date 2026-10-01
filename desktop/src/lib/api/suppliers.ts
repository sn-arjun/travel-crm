import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import type { Supplier } from '@travelcrm/shared';

export interface CreateSupplierRequest {
  companyName: string;
  category: 'hotel' | 'transport' | 'airline' | 'activity_provider' | 'guide' | 'visa_agent' | 'insurance';
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  gstNumber?: string;
  taxId?: string;
  website?: string;
  notes?: string;
  isPreferred?: boolean;
}

export interface UpdateSupplierRequest {
  companyName?: string;
  category?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  gstNumber?: string;
  taxId?: string;
  contactPerson?: string;
  notes?: string;
  isPreferred?: boolean;
  status?: 'active' | 'inactive';
}

export interface TogglePreferredRequest {
  isPreferred: boolean;
}

export interface SupplierRateCard {
  id: string;
  name: string;
  category: string;
  description?: string;
  rates: Record<string, number>;
  validity: {
    from: string;
    to: string;
  };
}

export interface SupplierPayment {
  id: string;
  amount: number;
  date: string;
  method: string;
  reference?: string;
}

export interface SupplierLedger {
  id: string;
  date: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  runningBalance: number;
  entryType: string;
  isReconciled: number;
}

export interface CategorySummary {
  category: string;
  totalSuppliers: number;
  preferredCount: number;
}

export interface CompareRatesRequest {
  service_type: string;
  destination: string;
  season?: string;
  date?: string;
}

export interface RateComparison {
  supplierId: string;
  supplierName: string;
  rate: number;
  currency?: string;
}

export const suppliersApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    status?: string;
    isPreferred?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    // The backend list endpoint reads snake_case `is_preferred`.
    if (params?.isPreferred === undefined) {
      return client.get<ApiResponse<PaginatedResponse<Supplier>>>(API_ENDPOINTS.suppliers.list, { params });
    }
    const { isPreferred, ...rest } = params;
    return client.get<ApiResponse<PaginatedResponse<Supplier>>>(API_ENDPOINTS.suppliers.list, {
      params: { ...rest, is_preferred: isPreferred } as any,
    });
  },

  getById: (id: string) =>
    client.get<ApiResponse<Supplier>>(API_ENDPOINTS.suppliers.byId(id)),

  create: (data: CreateSupplierRequest) =>
    client.post<ApiResponse<Supplier>>(API_ENDPOINTS.suppliers.create, data),

  update: (id: string, data: UpdateSupplierRequest) =>
    client.put<ApiResponse<Supplier>>(API_ENDPOINTS.suppliers.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.suppliers.byId(id)),

  getRateCards: (id: string, params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<SupplierRateCard>>>(API_ENDPOINTS.suppliers.rateCards(id), { params }),

  getPayments: (id: string, params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<SupplierPayment>>>(API_ENDPOINTS.suppliers.payments(id), { params }),

  getLedger: (id: string, params?: { fromDate?: string; toDate?: string }) =>
    client.get<ApiResponse<SupplierLedger[]>>(API_ENDPOINTS.suppliers.ledger(id), { params }),

  togglePreferred: (id: string, data: TogglePreferredRequest) =>
    client.post<ApiResponse<Supplier>>(API_ENDPOINTS.suppliers.togglePreferred(id), data),

  rateSupplier: (id: string, data: { rating: number; comment?: string }) =>
    client.post<ApiResponse<{ message: string }>>(API_ENDPOINTS.suppliers.rate(id), data),

  getCategorySummary: () =>
    client.get<ApiResponse<CategorySummary[]>>(API_ENDPOINTS.suppliers.categorySummary),

  compareRates: (params: CompareRatesRequest) =>
    client.get<ApiResponse<RateComparison[]>>(API_ENDPOINTS.suppliers.compareRates, { params: params as any }),

  recordPayment: (id: string, data: { amount: number; method: string; reference_number?: string; payment_date: string; notes?: string }) =>
    client.post<ApiResponse<{ id: string }>>(API_ENDPOINTS.suppliers.payments(id), data),
};
