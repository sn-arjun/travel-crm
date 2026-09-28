import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface CreditNote {
  id: string;
  invoiceNumber: string;
  type: 'credit_note' | 'debit_note';
  contactId: string;
  contactName?: string;
  subtotal: number;
  totalTax: number;
  total: number;
  currency: string;
  status: 'draft' | 'issued' | 'applied';
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface CreateCreditNoteRequest {
  invoiceId: string;
  reason: string;
  notes?: string;
  items: Array<{
    description: string;
    quantity: number;
    rate: number;
    taxRate?: number;
  }>;
}

export interface CreateDebitNoteRequest {
  invoiceId: string;
  reason: string;
  notes?: string;
  items: Array<{
    description: string;
    quantity: number;
    rate: number;
    taxRate?: number;
  }>;
}

// The raw HTTP body is `{ success, data: [...], pagination: {...} }` — `data` is
// itself the array (pagination is a sibling, not nested under data), which is why
// this file's ApiResponse<PaginatedResponse<T>> typing doesn't match the runtime
// shape. Cast through `any` to normalize both the envelope and each row's
// snake_case columns (invoice_number, contact_name, ...) into the CreditNote shape.
function normalizeNote(raw: any): CreditNote {
  return {
    ...raw,
    invoiceNumber: raw.invoiceNumber ?? raw.invoice_number,
    contactId: raw.contactId ?? raw.contact_id,
    contactName: raw.contactName ?? raw.contact_name,
    totalTax: raw.totalTax ?? raw.total_tax,
    createdBy: raw.createdBy ?? raw.created_by,
    createdAt: raw.createdAt ?? raw.created_at,
  };
}

export const creditNotesApi = {
  list: async (params?: { page?: number; limit?: number; search?: string; contactId?: string }) => {
    const res: any = await client.get<ApiResponse<PaginatedResponse<CreditNote>>>(API_ENDPOINTS.creditNotes.list, { params });
    res.data = res.data.map(normalizeNote);
    return res;
  },

  create: (data: CreateCreditNoteRequest) =>
    client.post<ApiResponse<CreditNote>>(API_ENDPOINTS.creditNotes.create, data),

  apply: (id: string, data: { amount: number }) =>
    client.post<ApiResponse<{ appliedAmount: number; balanceDue: number }>>(API_ENDPOINTS.creditNotes.apply(id), data),
};

export const debitNotesApi = {
  list: async (params?: { page?: number; limit?: number; search?: string; contactId?: string }) => {
    const res: any = await client.get<ApiResponse<PaginatedResponse<CreditNote>>>(API_ENDPOINTS.debitNotes.list, { params });
    res.data = res.data.map(normalizeNote);
    return res;
  },

  create: (data: CreateDebitNoteRequest) =>
    client.post<ApiResponse<CreditNote>>(API_ENDPOINTS.debitNotes.create, data),

  apply: (id: string, data: { amount: number }) =>
    client.post<ApiResponse<{ appliedAmount: number; balanceDue: number }>>(API_ENDPOINTS.debitNotes.apply(id), data),
};
