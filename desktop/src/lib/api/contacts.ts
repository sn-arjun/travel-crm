import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import type { Contact } from '@travelcrm/shared';

export interface CreateContactRequest {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  type: 'customer' | 'supplier' | 'agent' | 'partner';
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  tags?: string[];
  notes?: string;
  source?: string;
  birthday?: string;
  anniversary?: string;
  preferredLanguage?: string;
  customFields?: Record<string, unknown>;
}

export interface UpdateContactRequest {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  type?: 'customer' | 'supplier' | 'agent' | 'partner';
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  tags?: string[];
  notes?: string;
  source?: string;
  customFields?: Record<string, unknown>;
}

export interface CheckDuplicateRequest {
  email?: string;
  phone?: string;
  name?: string;
}

export interface DuplicateContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  matchScore: number;
}

export interface MergeContactRequest {
  primaryId: string;
  secondaryId: string;
  mergeFields?: Record<string, 'primary' | 'secondary'>;
}

export interface ShareContactRequest {
  userId: string;
  note?: string;
}

export interface ContactTimeline {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  createdBy: string;
}

export const contactsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    tag?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Contact>>>(API_ENDPOINTS.contacts.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<Contact>>(API_ENDPOINTS.contacts.byId(id)),

  create: (data: CreateContactRequest) =>
    client.post<ApiResponse<Contact>>(API_ENDPOINTS.contacts.create, data),

  update: (id: string, data: UpdateContactRequest) =>
    client.put<ApiResponse<Contact>>(API_ENDPOINTS.contacts.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.contacts.byId(id)),

  getTimeline: (id: string) =>
    client.get<ApiResponse<ContactTimeline[]>>(API_ENDPOINTS.contacts.timeline(id)),

  getTags: () =>
    client.get<ApiResponse<string[]>>(API_ENDPOINTS.contacts.tags),

  getFilterOptions: () =>
    client.get<ApiResponse<Record<string, unknown>>>(API_ENDPOINTS.contacts.filterOptions),

  checkDuplicate: (data: CheckDuplicateRequest) =>
    client.post<ApiResponse<DuplicateContact[]>>(API_ENDPOINTS.contacts.checkDuplicate, data),

  merge: (data: MergeContactRequest) =>
    client.post<ApiResponse<Contact>>(API_ENDPOINTS.contacts.merge, data),

  getMergePreview: (primaryId: string, secondaryId: string) =>
    client.get<ApiResponse<Record<string, unknown>>>(API_ENDPOINTS.contacts.mergePreview, {
      params: { primaryId, secondaryId },
    }),

  share: (id: string, data: ShareContactRequest) =>
    client.post<ApiResponse<{ message: string }>>(API_ENDPOINTS.contacts.share(id), data),

  getUpcomingOccasions: (params?: { days?: number; limit?: number }) =>
    client.get<ApiResponse<Contact[]>>(API_ENDPOINTS.contacts.upcomingOccasions, { params }),

  getCustomFields: () =>
    client.get<ApiResponse<Record<string, unknown>>>(API_ENDPOINTS.contacts.customFields),

  export: (params?: { filters?: Record<string, unknown>; format?: 'csv' | 'xlsx' }) =>
    client.get<Blob>(API_ENDPOINTS.contacts.export, { params: params as Record<string, string | number | boolean>, responseType: 'blob' }),
};
