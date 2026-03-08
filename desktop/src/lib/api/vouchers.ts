import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface Voucher {
  id: string;
  leadId: string;
  leadName?: string;
  supplierId?: string;
  supplierName?: string;
  type: 'hotel' | 'transport' | 'flight' | 'activity';
  title: string;
  details: Record<string, any>;
  status: 'draft' | 'sent' | 'confirmed';
  language: string;
  itineraryItemId?: string;
  pdfR2Key?: string;
  sentVia?: string;
  sentAt?: string;
  confirmedAt?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVoucherRequest {
  leadId: string;
  type: 'hotel' | 'transport' | 'flight' | 'activity';
  supplierId?: string;
  title: string;
  details: Record<string, any>;
  language?: string;
  notes?: string;
}

export interface UpdateVoucherRequest {
  title?: string;
  supplierId?: string;
  details?: Record<string, any>;
  language?: string;
  notes?: string;
}

export interface UpdateVoucherStatusRequest {
  status: 'sent' | 'confirmed';
}

export interface SendVoucherRequest {
  channel: 'email' | 'whatsapp' | 'both';
  to: string;
}

export interface BulkSendVoucherRequest {
  leadId: string;
  voucherIds: string[];
  channel: 'email' | 'whatsapp';
  to: string;
}

export const vouchersApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    type?: string;
    leadId?: string;
    supplierId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Voucher>>>(API_ENDPOINTS.vouchers.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<Voucher>>(API_ENDPOINTS.vouchers.byId(id)),

  create: (data: CreateVoucherRequest) =>
    client.post<ApiResponse<Voucher>>(API_ENDPOINTS.vouchers.create, data),

  update: (id: string, data: UpdateVoucherRequest) =>
    client.put<ApiResponse<Voucher>>(API_ENDPOINTS.vouchers.byId(id), data),

  updateStatus: (id: string, data: UpdateVoucherStatusRequest) =>
    client.patch<ApiResponse<Voucher>>(API_ENDPOINTS.vouchers.status(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.vouchers.byId(id)),

  send: (id: string, data: SendVoucherRequest) =>
    client.post<ApiResponse<{ sent: number }>>(API_ENDPOINTS.vouchers.send(id), data),

  getPdf: (id: string) =>
    client.get<Blob>(API_ENDPOINTS.vouchers.pdf(id), { responseType: 'blob' }),

  getByLead: (leadId: string) =>
    client.get<ApiResponse<{ type: string; vouchers: Voucher[] }[]>>(
      API_ENDPOINTS.vouchers.byLead(leadId),
    ),

  bulkSend: (data: BulkSendVoucherRequest) =>
    client.post<ApiResponse<{ sent: number }>>(API_ENDPOINTS.vouchers.bulkSend, data),

  fromItineraryItem: (data: { itineraryItemId: string }) =>
    client.post<ApiResponse<Voucher>>(API_ENDPOINTS.vouchers.fromItineraryItem, data),
};
