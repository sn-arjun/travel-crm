import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

// Voucher type not in shared package, define locally
export interface Voucher {
  id: string;
  voucherNumber: string;
  leadId?: string;
  contactId?: string;
  issueDate: string;
  validUntil: string;
  items: VoucherItem[];
  discount?: number;
  status: 'draft' | 'issued' | 'used' | 'expired' | 'cancelled';
  notes?: string;
  customFields?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface VoucherItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
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
  voucherNumber?: string;
  issueDate?: string;
  validUntil?: string;
  items?: VoucherItem[];
  discount?: number;
  notes?: string;
  status?: 'draft' | 'issued' | 'used' | 'expired' | 'cancelled';
  customFields?: Record<string, unknown>;
}

export interface SendVoucherRequest {
  to: string[];
  message?: string;
  sendMethod?: 'email' | 'sms' | 'whatsapp';
}

export const vouchersApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    leadId?: string;
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

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.vouchers.byId(id)),

  send: (id: string, data: SendVoucherRequest) =>
    client.post<ApiResponse<{ sent: number }>>(API_ENDPOINTS.vouchers.send(id), data),

  getPdf: (id: string) =>
    client.get<Blob>(API_ENDPOINTS.vouchers.pdf(id), { responseType: 'blob' }),
};
