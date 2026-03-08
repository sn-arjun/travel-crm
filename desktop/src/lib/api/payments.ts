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

export const paymentsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    paymentMethod?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Payment>>>(API_ENDPOINTS.payments.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<Payment>>(API_ENDPOINTS.payments.byId(id)),

  create: (data: CreatePaymentRequest) =>
    client.post<ApiResponse<Payment>>(API_ENDPOINTS.payments.create, data),

  update: (id: string, data: UpdatePaymentRequest) =>
    client.put<ApiResponse<Payment>>(API_ENDPOINTS.payments.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.payments.byId(id)),

  linkInvoice: (id: string, data: LinkInvoiceRequest) =>
    client.post<ApiResponse<Payment>>(API_ENDPOINTS.payments.linkInvoice(id), data),
};
