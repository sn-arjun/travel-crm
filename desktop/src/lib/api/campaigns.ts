import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import type { Campaign } from '@travelcrm/shared';

export interface CreateCampaignRequest {
  name: string;
  description?: string;
  type?: 'email' | 'sms' | 'social' | 'push';
  status?: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed';
  subject?: string;
  content: string;
  targetSegment?: string;
  startDate?: string;
  endDate?: string;
  customFields?: Record<string, unknown>;
}

export interface UpdateCampaignRequest {
  name?: string;
  description?: string;
  type?: 'email' | 'sms' | 'social' | 'push';
  status?: 'draft' | 'scheduled' | 'running' | 'paused' | 'completed';
  subject?: string;
  content?: string;
  targetSegment?: string;
  startDate?: string;
  endDate?: string;
  customFields?: Record<string, unknown>;
}

export interface SendCampaignRequest {
  sendImmediately?: boolean;
  scheduleFor?: string;
  targets?: string[];
}

export interface ScheduleCampaignRequest {
  scheduledFor: string;
  timezone?: string;
  recurringPattern?: 'once' | 'daily' | 'weekly' | 'monthly';
}

export interface CampaignMetrics {
  id: string;
  name: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  converted: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
}

export const campaignsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Campaign>>>(API_ENDPOINTS.campaigns.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<Campaign>>(API_ENDPOINTS.campaigns.byId(id)),

  create: (data: CreateCampaignRequest) =>
    client.post<ApiResponse<Campaign>>(API_ENDPOINTS.campaigns.create, data),

  update: (id: string, data: UpdateCampaignRequest) =>
    client.put<ApiResponse<Campaign>>(API_ENDPOINTS.campaigns.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.campaigns.byId(id)),

  send: (id: string, data?: SendCampaignRequest) =>
    client.post<ApiResponse<{ sent: number }>>(API_ENDPOINTS.campaigns.send(id), data),

  schedule: (id: string, data: ScheduleCampaignRequest) =>
    client.post<ApiResponse<Campaign>>(API_ENDPOINTS.campaigns.schedule(id), data),

  cancel: (id: string, data?: { reason?: string }) =>
    client.post<ApiResponse<Campaign>>(API_ENDPOINTS.campaigns.cancel(id), data),
};
