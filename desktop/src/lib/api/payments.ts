import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import type { Payment } from '@travelcrm/shared';

export interface CreatePaymentRequest {
  invoiceId: string;
  amount: number;
  method: string;
  reference?: string;
  notes?: string;
  date?: string;
  receiptUrl?: string;
  isAdvance?: boolean;
  leadId?: string;
}

export interface UpdatePaymentRequest {
  amount?: number;
  paymentDate?: string;
  paymentMethod?: 'cash' | 'check' | 'card' | 'transfer' | 'other';
  reference?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
}

export interface LinkInvoiceRequest {
  invoiceId: string;
  amount?: number;
}

/**
 * Backend returns payment rows as-is (snake_case, contact_name/invoice_number
 * from the join). Add the camelCase fields the pages read, keeping the raw ones.
 */
function normalizePayment<T>(raw: any): T {
  if (!raw || typeof raw !== 'object') return raw;
  return {
    ...raw,
    invoiceId: raw.invoiceId ?? raw.invoice_id ?? null,
    contactId: raw.contactId ?? raw.contact_id ?? null,
    invoiceNumber: raw.invoiceNumber ?? raw.invoice_number ?? null,
    clientName: raw.clientName ?? raw.contact_name ?? null,
    paidAt: raw.paidAt ?? raw.date ?? null,
    recordedBy: raw.recordedBy ?? raw.created_by ?? null,
    createdAt: raw.createdAt ?? raw.created_at ?? null,
  } as T;
}

export const paymentsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    paymentMethod?: string;
    method?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    // Backend expects 'method' not 'paymentMethod'
    const { paymentMethod, ...rest } = params ?? {};
    const apiParams = paymentMethod ? { ...rest, method: paymentMethod } : rest;
    return client
      .get<ApiResponse<PaginatedResponse<Payment>>>(API_ENDPOINTS.payments.list, { params: apiParams })
      .then((res: any) => ({
        ...res,
        data: Array.isArray(res?.data) ? res.data.map(normalizePayment) : res?.data,
      })) as Promise<ApiResponse<PaginatedResponse<Payment>>>;
  },

  getById: (id: string) =>
    client
      .get<ApiResponse<Payment>>(API_ENDPOINTS.payments.byId(id))
      .then((res: any) => ({ ...res, data: normalizePayment(res?.data) })) as Promise<ApiResponse<Payment>>,

  create: (data: CreatePaymentRequest) =>
    client.post<ApiResponse<Payment>>(API_ENDPOINTS.payments.create, data),

  update: (id: string, data: UpdatePaymentRequest) =>
    client.put<ApiResponse<Payment>>(API_ENDPOINTS.payments.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.payments.byId(id)),

  linkInvoice: (id: string, data: LinkInvoiceRequest) =>
    client.post<ApiResponse<Payment>>(API_ENDPOINTS.payments.linkInvoice(id), data),
};
