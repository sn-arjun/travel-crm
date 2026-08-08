import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import type { Lead } from '@travelcrm/shared';

export interface CreateLeadRequest {
  contactId: string;
  title: string;
  destinations: string[];
  travelDate: string;
  returnDate?: string;
  paxAdults?: number;
  paxChildren?: number;
  paxInfants?: number;
  budget?: number;
  currency?: string;
  tripType: 'domestic' | 'international' | 'honeymoon' | 'family' | 'group' | 'corporate' | 'adventure' | 'pilgrimage';
  source: 'manual' | 'website' | 'facebook' | 'google' | 'referral' | 'walkin';
  priority?: 'hot' | 'warm' | 'cold';
  assignedTo?: string;
  specialRequirements?: string;
  notes?: string;
}

export interface UpdateLeadRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  status?: string;
  assignedTo?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
}

export interface UpdateLeadStatusRequest {
  status: string;
  reason?: string;
}

export interface AssignLeadRequest {
  userId: string;
  note?: string;
}

export interface BulkAssignRequest {
  leadIds: string[];
  assignedTo: string;
}

export interface BulkStatusRequest {
  leadIds: string[];
  status: string;
  reason?: string;
}

export interface BulkDeleteRequest {
  leadIds: string[];
}

export interface LeadActivity {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  createdBy: string;
}

export interface LeadNote {
  id: string;
  content: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

export interface LeadFollowUp {
  id: string;
  title: string;
  dueDate: string;
  status: 'pending' | 'completed' | 'overdue';
  assignedTo: string;
}

export const leadsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    source?: string;
    assignedTo?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Lead>>>(API_ENDPOINTS.leads.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<Lead>>(API_ENDPOINTS.leads.byId(id)),

  create: (data: CreateLeadRequest) =>
    client.post<ApiResponse<Lead>>(API_ENDPOINTS.leads.create, data),

  update: (id: string, data: UpdateLeadRequest) =>
    client.put<ApiResponse<Lead>>(API_ENDPOINTS.leads.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.leads.byId(id)),

  updateStatus: (id: string, data: UpdateLeadStatusRequest) =>
    client.put<ApiResponse<Lead>>(API_ENDPOINTS.leads.status(id), data),

  assign: (id: string, data: AssignLeadRequest) =>
    client.post<ApiResponse<Lead>>(API_ENDPOINTS.leads.assign(id), data),

  getActivities: (id: string, params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<LeadActivity>>>(API_ENDPOINTS.leads.activities(id), { params }),

  getNotes: (id: string, params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<LeadNote>>>(API_ENDPOINTS.leads.notes(id), { params }),

  getFollowUps: (id: string, params?: { status?: string }) =>
    client.get<ApiResponse<LeadFollowUp[]>>(API_ENDPOINTS.leads.followUps(id), { params }),

  createNote: (id: string, data: { content: string }) =>
    client.post<ApiResponse<LeadNote>>(API_ENDPOINTS.leads.notes(id), data),

  updateNote: (id: string, noteId: string, data: { content: string }) =>
    client.put<ApiResponse<LeadNote>>(`${API_ENDPOINTS.leads.notes(id)}/${noteId}`, data),

  deleteNote: (id: string, noteId: string) =>
    client.delete<ApiResponse<void>>(`${API_ENDPOINTS.leads.notes(id)}/${noteId}`),

  createFollowUp: (id: string, data: { title: string; dueDate: string; type?: string; priority?: string; description?: string }) =>
    client.post<ApiResponse<LeadFollowUp>>(API_ENDPOINTS.leads.followUps(id), data),

  getFilterOptions: () =>
    client.get<ApiResponse<Record<string, unknown>>>(API_ENDPOINTS.leads.filterOptions),

  bulkAssign: (data: BulkAssignRequest) =>
    client.post<ApiResponse<{ updated: number }>>(API_ENDPOINTS.leads.bulkAssign, data),

  bulkUpdateStatus: (data: BulkStatusRequest) =>
    client.post<ApiResponse<{ updated: number }>>(API_ENDPOINTS.leads.bulkStatus, data),

  bulkDelete: (data: BulkDeleteRequest) =>
    client.post<ApiResponse<{ deleted: number }>>(API_ENDPOINTS.leads.bulkDelete, data),

  getUnassigned: (params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<Lead>>>(API_ENDPOINTS.leads.unassigned, { params }),
};
