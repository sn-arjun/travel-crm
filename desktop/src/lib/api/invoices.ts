import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import type { Invoice } from '@travelcrm/shared';

export interface InvoiceLineItem {
  description: string;
  hsnCode?: string;
  quantity: number;
  rate: number;
  discountPercent?: number;
  taxRate?: number;
}

export interface CreateInvoiceRequest {
  contactId: string;
  leadId?: string;
  type?: 'tax_invoice' | 'proforma' | 'receipt';
  items: InvoiceLineItem[];
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  dueDate?: string;
  notes?: string;
  bankDetails?: Record<string, unknown>;
  currency?: string;
}

export interface UpdateInvoiceRequest {
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  items?: InvoiceLineItem[];
  discount?: number;
  notes?: string;
  terms?: string;
  customFields?: Record<string, unknown>;
}

export interface InvoicePayment {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  reference?: string;
  notes?: string;
}

export interface DuplicateInvoiceRequest {
  newInvoiceNumber?: string;
  newIssueDate?: string;
}

export const invoicesApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    leadId?: string;
    contactId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Invoice>>>(API_ENDPOINTS.invoices.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.byId(id)),

  create: (data: CreateInvoiceRequest) =>
    client.post<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.create, data),

  update: (id: string, data: UpdateInvoiceRequest) =>
    client.put<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.invoices.byId(id)),

  getPayments: (id: string, params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<InvoicePayment>>>(API_ENDPOINTS.invoices.payments(id), { params }),

  void: (id: string, data?: { reason?: string }) =>
    client.post<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.void(id), data),

  duplicate: (id: string, data?: DuplicateInvoiceRequest) =>
    client.post<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.duplicate(id), data),

  send: (id: string, data: { channel: 'email' | 'whatsapp'; to: string }) =>
    client.post<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.send(id), data),

  summary: () =>
    client.get<ApiResponse<{ outstanding: number; overdue: number; paidThisMonth: number; invoicedThisMonth: number }>>(API_ENDPOINTS.invoices.summary),

  fromItinerary: (data: { itineraryId: string }) =>
    client.post<ApiResponse<Invoice>>(API_ENDPOINTS.invoices.fromItinerary, data),
};
