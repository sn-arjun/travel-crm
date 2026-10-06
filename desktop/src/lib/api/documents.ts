import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

// Document type not in shared package, define locally
export interface Document {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags: string[];
  leadId?: string;
  itineraryId?: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadDocumentRequest {
  file: File;
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  leadId?: string;
  itineraryId?: string;
}

export interface CreateDocumentRequest {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  leadId?: string;
  itineraryId?: string;
  mimeType?: string;
  size?: number;
}

export interface UpdateDocumentRequest {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
}

export const documentsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    leadId?: string;
    itineraryId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Document>>>(API_ENDPOINTS.documents.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<Document>>(API_ENDPOINTS.documents.byId(id)),

  upload: async (data: UploadDocumentRequest) => {
    const formData = new FormData();
    formData.append('file', data.file);
    if (data.name) formData.append('name', data.name);
    if (data.description) formData.append('description', data.description);
    if (data.category) formData.append('category', data.category);
    if (data.tags) formData.append('tags', JSON.stringify(data.tags));
    if (data.leadId) formData.append('leadId', data.leadId);
    if (data.itineraryId) formData.append('itineraryId', data.itineraryId);

    return client.post<ApiResponse<Document>>(API_ENDPOINTS.documents.upload, formData);
  },

  update: (id: string, data: UpdateDocumentRequest) =>
    client.put<ApiResponse<Document>>(API_ENDPOINTS.documents.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.documents.byId(id)),

  download: (id: string) =>
    client.get<Blob>(API_ENDPOINTS.documents.download(id), { responseType: 'blob' }),
};
