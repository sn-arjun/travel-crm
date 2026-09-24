import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export type WhatsappCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled' | 'failed';

export interface WhatsappCampaign {
  id: string;
  name: string;
  templateId: string;
  templateName?: string;
  segmentId?: string | null;
  segmentName?: string | null;
  status: WhatsappCampaignStatus;
  scheduledFor?: string | null;
  sentCount?: number;
  deliveredCount?: number;
  readCount?: number;
  repliedCount?: number;
  failedCount?: number;
  recipientCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WhatsappCampaignAnalytics {
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  repliedCount: number;
  failedCount: number;
  deliveryRate: number;
  readRate: number;
  replyRate: number;
}

export interface WhatsappCampaignRecipient {
  id: string;
  contactId?: string;
  name: string;
  phone: string;
  status: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  repliedAt?: string | null;
  sentAt?: string | null;
  errorMessage?: string | null;
}

export interface CreateWhatsappCampaignRequest {
  name: string;
  templateId: string;
  segmentId?: string;
  scheduledFor?: string;
}

export type UpdateWhatsappCampaignRequest = Partial<CreateWhatsappCampaignRequest>;

export interface SendWhatsappCampaignRequest {
  sendImmediately?: boolean;
}

export const whatsappCampaignsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<WhatsappCampaign>>>(
      API_ENDPOINTS.whatsappCampaigns.list,
      { params },
    ),

  getById: (id: string) =>
    client.get<ApiResponse<WhatsappCampaign>>(API_ENDPOINTS.whatsappCampaigns.byId(id)),

  create: (data: CreateWhatsappCampaignRequest) =>
    client.post<ApiResponse<WhatsappCampaign>>(API_ENDPOINTS.whatsappCampaigns.create, data),

  update: (id: string, data: UpdateWhatsappCampaignRequest) =>
    client.put<ApiResponse<WhatsappCampaign>>(API_ENDPOINTS.whatsappCampaigns.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.whatsappCampaigns.byId(id)),

  send: (id: string, data?: SendWhatsappCampaignRequest) =>
    client.post<ApiResponse<WhatsappCampaign>>(API_ENDPOINTS.whatsappCampaigns.send(id), data),

  pause: (id: string) =>
    client.post<ApiResponse<WhatsappCampaign>>(API_ENDPOINTS.whatsappCampaigns.pause(id)),

  cancel: (id: string) =>
    client.post<ApiResponse<WhatsappCampaign>>(API_ENDPOINTS.whatsappCampaigns.cancel(id)),

  getAnalytics: (id: string) =>
    client.get<ApiResponse<WhatsappCampaignAnalytics>>(API_ENDPOINTS.whatsappCampaigns.analytics(id)),

  getRecipients: (id: string, params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<WhatsappCampaignRecipient>>>(
      API_ENDPOINTS.whatsappCampaigns.recipients(id),
      { params },
    ),
};
