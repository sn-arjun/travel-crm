import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

/** A payment row as the pages read it (camelCase fields added on top of the raw row). */
export interface PaymentRecord {
  id: string;
  invoiceId: string | null;
  contactId: string | null;
  invoiceNumber: string | null;
  clientName: string | null;
  amount: number;
  currency?: string;
  method: string;
  reference?: string | null;
  notes?: string | null;
  type?: string | null;
  /** Date-only (YYYY-MM-DD) date the payment was received. */
  date: string | null;
  paidAt: string | null;
  recordedBy: string | null;
  createdAt: string | null;
}

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
type RawRow = Record<string, unknown>;

function normalizePayment<T>(raw: unknown): T {
  if (!raw || typeof raw !== 'object') return raw as T;
  const row = raw as RawRow;
  return {
    ...row,
    invoiceId: row.invoiceId ?? row.invoice_id ?? null,
    contactId: row.contactId ?? row.contact_id ?? null,
    invoiceNumber: row.invoiceNumber ?? row.invoice_number ?? null,
    clientName: row.clientName ?? row.contact_name ?? null,
    paidAt: row.paidAt ?? row.date ?? null,
    recordedBy: row.recordedBy ?? row.created_by ?? null,
    createdAt: row.createdAt ?? row.created_at ?? null,
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
      .get<ApiResponse<PaginatedResponse<PaymentRecord>>>(API_ENDPOINTS.payments.list, { params: apiParams })
      .then((res) => {
        const body = res as unknown as { data?: unknown };
        return {
          ...res,
          data: Array.isArray(body.data) ? body.data.map(normalizePayment) : body.data,
        };
      }) as Promise<ApiResponse<PaginatedResponse<PaymentRecord>>>;
  },

  getById: (id: string) =>
    client
      .get<ApiResponse<PaymentRecord>>(API_ENDPOINTS.payments.byId(id))
      .then((res) => ({ ...res, data: normalizePayment<PaymentRecord>(res?.data) })),

  create: (data: CreatePaymentRequest) =>
    client.post<ApiResponse<PaymentRecord>>(API_ENDPOINTS.payments.create, data),

  update: (id: string, data: UpdatePaymentRequest) =>
    client.put<ApiResponse<PaymentRecord>>(API_ENDPOINTS.payments.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.payments.byId(id)),

  linkInvoice: (id: string, data: LinkInvoiceRequest) =>
    client.post<ApiResponse<PaymentRecord>>(API_ENDPOINTS.payments.linkInvoice(id), data),
};
