import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import type { FollowUp } from '@travelcrm/shared';

export interface CreateFollowUpRequest {
  leadId: string;
  scheduledAt: string;
  type: 'call' | 'email' | 'whatsapp' | 'visit' | 'sms';
  notes?: string;
}

export interface UpdateFollowUpRequest {
  title?: string;
  description?: string;
  dueDate?: string;
  type?: 'email' | 'call' | 'meeting' | 'task';
  priority?: 'low' | 'medium' | 'high';
  assignedTo?: string;
  customFields?: Record<string, unknown>;
}

export interface CompleteFollowUpRequest {
  completedAt?: string;
  notes?: string;
  outcome?: string;
}

export const followUpsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'pending' | 'completed' | 'overdue';
    type?: string;
    priority?: string;
    assignedTo?: string;
    leadId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<FollowUp>>>(API_ENDPOINTS.followUps.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<FollowUp>>(API_ENDPOINTS.followUps.byId(id)),

  create: (data: CreateFollowUpRequest) =>
    client.post<ApiResponse<FollowUp>>(API_ENDPOINTS.followUps.create, data),

  update: (id: string, data: UpdateFollowUpRequest) =>
    client.put<ApiResponse<FollowUp>>(API_ENDPOINTS.followUps.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.followUps.byId(id)),

  complete: (id: string, data?: CompleteFollowUpRequest) =>
    client.put<ApiResponse<FollowUp>>(API_ENDPOINTS.followUps.complete(id), data ?? {}),
};
