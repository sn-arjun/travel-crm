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

export const creditNotesApi = {
  list: (params?: { page?: number; limit?: number; contactId?: string }) =>
    client.get<ApiResponse<PaginatedResponse<CreditNote>>>(API_ENDPOINTS.creditNotes.list, { params }),

  create: (data: CreateCreditNoteRequest) =>
    client.post<ApiResponse<CreditNote>>(API_ENDPOINTS.creditNotes.create, data),

  apply: (id: string, data: { amount: number }) =>
    client.post<ApiResponse<{ appliedAmount: number; balanceDue: number }>>(API_ENDPOINTS.creditNotes.apply(id), data),
};

export const debitNotesApi = {
  list: (params?: { page?: number; limit?: number; contactId?: string }) =>
    client.get<ApiResponse<PaginatedResponse<CreditNote>>>(API_ENDPOINTS.debitNotes.list, { params }),

  create: (data: CreateDebitNoteRequest) =>
    client.post<ApiResponse<CreditNote>>(API_ENDPOINTS.debitNotes.create, data),

  apply: (id: string, data: { amount: number }) =>
    client.post<ApiResponse<{ appliedAmount: number; balanceDue: number }>>(API_ENDPOINTS.debitNotes.apply(id), data),
};
