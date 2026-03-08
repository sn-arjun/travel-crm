import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface ImportJob {
  id: string;
  type: string;
  fileName: string;
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
}

export interface ImportError {
  row: number;
  column: string;
  value: string;
  error: string;
}

export interface ImportTemplate {
  id: string;
  type: string;
  name: string;
  columns: Array<{
    name: string;
    required: boolean;
    dataType: string;
  }>;
}

export interface UploadImportRequest {
  file: File;
  type: string;
  mapping?: Record<string, string>;
  skipHeader?: boolean;
}

export interface ExecuteImportRequest {
  mapping: Record<string, string>;
  skipDuplicates?: boolean;
  updateExisting?: boolean;
}

export const importsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<ImportJob>>>(API_ENDPOINTS.imports.list, { params }),

  upload: async (data: UploadImportRequest) => {
    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('type', data.type);
    if (data.mapping) formData.append('mapping', JSON.stringify(data.mapping));
    if (data.skipHeader !== undefined) formData.append('skipHeader', String(data.skipHeader));

    return client.post<ApiResponse<ImportJob>>(API_ENDPOINTS.imports.upload, formData as unknown as Record<string, unknown>);
  },

  execute: (id: string, data: ExecuteImportRequest) =>
    client.post<ApiResponse<ImportJob>>(API_ENDPOINTS.imports.execute(id), data),

  getProgress: (id: string) =>
    client.get<ApiResponse<ImportJob>>(API_ENDPOINTS.imports.progress(id)),

  getErrors: (id: string, params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<ImportError>>>(API_ENDPOINTS.imports.errors(id), { params }),

  getTemplate: (type: string) =>
    client.get<ApiResponse<ImportTemplate>>(API_ENDPOINTS.imports.templates(type)),
};
