import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface MessageTemplate {
  id: string;
  channel: 'email' | 'sms' | 'whatsapp';
  name: string;
  subject?: string;
  content: string;
  variables?: string; // JSON array as text
  category?: string;
  language: string;
  isActive: number;
  createdAt?: string;
}

export interface CreateTemplateRequest {
  channel: 'email' | 'sms' | 'whatsapp';
  name: string;
  subject?: string;
  content: string;
  category?: string;
  language?: string;
}

export type UpdateTemplateRequest = Partial<CreateTemplateRequest>;

export const templatesApi = {
  list: (params?: {
    channel?: string;
    category?: string;
    language?: string;
    is_active?: number;
    search?: string;
    page?: number;
    limit?: number;
  }) =>
    client.get<ApiResponse<PaginatedResponse<MessageTemplate>>>(API_ENDPOINTS.templates.list, { params }),

  create: (data: CreateTemplateRequest) =>
    client.post<ApiResponse<MessageTemplate>>(API_ENDPOINTS.templates.create, data),

  getById: (id: string) =>
    client.get<ApiResponse<MessageTemplate>>(API_ENDPOINTS.templates.byId(id)),

  update: (id: string, data: UpdateTemplateRequest) =>
    client.put<ApiResponse<MessageTemplate>>(API_ENDPOINTS.templates.update(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<{ success: boolean }>>(API_ENDPOINTS.templates.delete(id)),
};
