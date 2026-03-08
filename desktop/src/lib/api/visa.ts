import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

// VisaRecord type not in shared package, define locally
export interface VisaRecord {
  id: string;
  travelerId?: string;
  passportNumber: string;
  travellerName: string;
  countryName: string;
  visaType?: string;
  applicationDate?: string;
  expiryDate?: string;
  status: 'applied' | 'approved' | 'rejected' | 'processing';
  notes?: string;
  customFields?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Traveller type not in shared package, define locally
export interface Traveller {
  id: string;
  firstName: string;
  lastName: string;
  passportNumber: string;
  dateOfBirth?: string;
  nationality?: string;
  email?: string;
  phone?: string;
  leadId?: string;
  customFields?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVisaRequest {
  passportNumber: string;
  travellerName: string;
  countryName: string;
  visaType?: string;
  applicationDate?: string;
  expiryDate?: string;
  status?: 'not_started' | 'documents_collecting' | 'applied' | 'approved' | 'rejected' | 'processing';
  notes?: string;
  customFields?: Record<string, unknown>;
}

export interface UpdateVisaRequest {
  visaType?: string;
  applicationDate?: string;
  expiryDate?: string;
  status?: 'not_started' | 'documents_collecting' | 'applied' | 'approved' | 'rejected' | 'processing';
  notes?: string;
  customFields?: Record<string, unknown>;
}

export interface VisaChecklistItem {
  id: string;
  item: string;
  completed: boolean;
  completedAt?: string;
}

export interface CreateTravellerRequest {
  firstName: string;
  lastName: string;
  passportNumber: string;
  dateOfBirth?: string;
  nationality?: string;
  email?: string;
  phone?: string;
  leadId?: string;
  contactId?: string;
  customFields?: Record<string, unknown>;
}

export interface UpdateTravellerRequest {
  firstName?: string;
  lastName?: string;
  passportNumber?: string;
  dateOfBirth?: string;
  nationality?: string;
  email?: string;
  phone?: string;
  customFields?: Record<string, unknown>;
}

export const visaApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    countryName?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<VisaRecord>>>(API_ENDPOINTS.visa.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<VisaRecord>>(API_ENDPOINTS.visa.byId(id)),

  create: (data: CreateVisaRequest) =>
    client.post<ApiResponse<VisaRecord>>(API_ENDPOINTS.visa.create, data),

  update: (id: string, data: UpdateVisaRequest) =>
    client.put<ApiResponse<VisaRecord>>(API_ENDPOINTS.visa.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.visa.byId(id)),

  getChecklist: (id: string) =>
    client.get<ApiResponse<VisaChecklistItem[]>>(API_ENDPOINTS.visa.checklist(id, ''), { params: {} }),

  updateChecklistItem: (id: string, itemId: string, data: { completed: boolean }) =>
    client.patch<ApiResponse<VisaChecklistItem>>(API_ENDPOINTS.visa.checklist(id, itemId), data),

  getNotes: (id: string) =>
    client.get<ApiResponse<{ notes: string }>>(API_ENDPOINTS.visa.notes(id)),

  updateNotes: (id: string, data: { notes: string }) =>
    client.put<ApiResponse<{ notes: string }>>(API_ENDPOINTS.visa.notes(id), data),
};

export const travellersApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    leadId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Traveller>>>(API_ENDPOINTS.travellers.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<Traveller>>(API_ENDPOINTS.travellers.byId(id)),

  create: (data: CreateTravellerRequest) =>
    client.post<ApiResponse<Traveller>>(API_ENDPOINTS.travellers.create, data),

  update: (id: string, data: UpdateTravellerRequest) =>
    client.put<ApiResponse<Traveller>>(API_ENDPOINTS.travellers.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.travellers.byId(id)),
};
