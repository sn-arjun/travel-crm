import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import { camelizeKeys, toApiResponse, unwrapEntity, unwrapList } from './envelope';
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
  assignedTo?: string | null;
  specialRequirements?: string;
  notes?: string;
}

export interface UpdateLeadRequest {
  contactId?: string;
  title?: string;
  destinations?: string[];
  travelDate?: string;
  returnDate?: string;
  paxAdults?: number;
  paxChildren?: number;
  paxInfants?: number;
  budget?: number;
  currency?: string;
  tripType?: CreateLeadRequest['tripType'];
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  status?: string;
  priority?: CreateLeadRequest['priority'];
  /** null marks the lead unassigned. */
  assignedTo?: string | null;
  specialRequirements?: string;
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
  /** User id of the author. */
  createdBy: string;
  /** Display name of the author (joined by the backend as created_by_name). */
  createdByName?: string;
  updatedAt: string;
}

/** Notes come back as snake_case activity rows (created_by_name, created_at). */
export function normalizeLeadNote(raw: unknown): LeadNote {
  const n = camelizeKeys<Record<string, unknown>>(raw) ?? {};
  return {
    ...n,
    createdBy: (n.createdBy ?? '') as string,
    createdAt: (n.createdAt ?? '') as string,
    updatedAt: (n.updatedAt ?? n.createdAt ?? '') as string,
  } as unknown as LeadNote;
}

function noteEntity(res: unknown): ApiResponse<LeadNote> {
  const entity = unwrapEntity<unknown>(res);
  return toApiResponse(entity && typeof entity === 'object' ? normalizeLeadNote(entity) : (entity as LeadNote));
}

export interface LeadFollowUp {
  id: string;
  title: string;
  dueDate: string;
  status: 'pending' | 'completed' | 'overdue';
  assignedTo: string;
}

/** Columns of the Leads page board (design 4.7); admins and sales managers change them. */
export interface LeadBoardSettings {
  columns: string[];
  showValue: boolean;
  /** Every status a column can show. */
  available?: string[];
}

export interface LeadBoardParams {
  search?: string;
  status?: string;
  priority?: string;
  assignedTo?: string;
  unassigned?: string;
  source?: string;
  destination?: string;
  travelDateFrom?: string;
  travelDateTo?: string;
  /** Page of one column when `status` names a single column ("load more"). */
  page?: number;
  limit?: number;
}

export const leadsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    source?: string;
    assignedTo?: string;
    priority?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Lead>>>(API_ENDPOINTS.leads.list, { params }),

  /** The pipeline board: a column per status with its count, value and first leads. Raw envelope; read with boardFromResponse. */
  board: (params?: LeadBoardParams | Record<string, string | number | boolean>) =>
    client.get<unknown>(`${API_ENDPOINTS.leads.list}/board`, { params: params as Record<string, string | number | boolean | undefined> }),

  getBoardSettings: () =>
    client.get<ApiResponse<LeadBoardSettings>>(`${API_ENDPOINTS.leads.list}/board-settings`),

  saveBoardSettings: (data: { columns: string[]; showValue?: boolean }) =>
    client.put<ApiResponse<LeadBoardSettings>>(`${API_ENDPOINTS.leads.list}/board-settings`, data),

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

  getNotes: async (id: string, params?: { page?: number; limit?: number }): Promise<PaginatedResponse<LeadNote>> => {
    const res = await client.get<unknown>(API_ENDPOINTS.leads.notes(id), { params });
    const list = unwrapList<unknown>(res, { page: params?.page, limit: params?.limit });
    return { ...list, data: list.data.map(normalizeLeadNote) };
  },

  getFollowUps: (id: string, params?: { status?: string }) =>
    client.get<ApiResponse<LeadFollowUp[]>>(API_ENDPOINTS.leads.followUps(id), { params }),

  createNote: async (id: string, data: { content: string }): Promise<ApiResponse<LeadNote>> =>
    noteEntity(await client.post<unknown>(API_ENDPOINTS.leads.notes(id), data)),

  updateNote: async (id: string, noteId: string, data: { content: string }): Promise<ApiResponse<LeadNote>> =>
    noteEntity(await client.put<unknown>(`${API_ENDPOINTS.leads.notes(id)}/${noteId}`, data)),

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
