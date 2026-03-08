import { client, type ApiResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface ExportJob {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  downloadUrl?: string;
}

export interface ExportContactsRequest {
  filters?: Record<string, unknown>;
  format?: 'csv' | 'xlsx';
  includeFields?: string[];
}

export interface ExportLeadsRequest {
  filters?: Record<string, unknown>;
  format?: 'csv' | 'xlsx';
  includeFields?: string[];
}

export interface ExportInvoicesPdfRequest {
  invoiceIds: string[];
  combineIntoSinglePdf?: boolean;
}

export interface ExportFullRequest {
  includeContacts?: boolean;
  includeLeads?: boolean;
  includeInvoices?: boolean;
  includeTasks?: boolean;
  filters?: Record<string, unknown>;
}

export const exportsApi = {
  contacts: (data?: ExportContactsRequest) =>
    client.get<Blob>(API_ENDPOINTS.exports.contacts, { params: data as unknown as Record<string, string | number | boolean | undefined>, responseType: 'blob' }),

  leads: (data?: ExportLeadsRequest) =>
    client.get<Blob>(API_ENDPOINTS.exports.leads, { params: data as unknown as Record<string, string | number | boolean | undefined>, responseType: 'blob' }),

  invoicesBulkPdf: (data: ExportInvoicesPdfRequest) =>
    client.post<Blob>(API_ENDPOINTS.exports.invoicesBulkPdf, data, { responseType: 'blob' }),

  full: (data?: ExportFullRequest) =>
    client.post<ApiResponse<ExportJob>>(API_ENDPOINTS.exports.full, data),

  getJobStatus: (id: string) =>
    client.get<ApiResponse<ExportJob>>(API_ENDPOINTS.exports.jobStatus(id)),

  downloadJob: (id: string) =>
    client.get<Blob>(API_ENDPOINTS.exports.jobDownload(id), { responseType: 'blob' }),
};
