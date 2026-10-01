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
  contactId?: string;
  contactName?: string;
  passportExpiryDate?: string;
  passportIssuingCountry?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  mealPreference?: string;
  seatPreference?: string;
  medicalNotes?: string;
  frequentFlyerNumbers?: string;
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
  passportExpiryDate?: string;
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
  passportExpiryDate?: string;
  customFields?: Record<string, unknown>;
}

export interface VisaDocument {
  id: string;
  visa_application_id: string;
  document_type: string;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  uploader_name?: string;
  created_at: string;
}

export const visaApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    countryName?: string;
    traveller_id?: string;
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

  // Document management
  getDocuments: (id: string) =>
    client.get<ApiResponse<VisaDocument[]>>(API_ENDPOINTS.visa.documents(id)),

  uploadDocument: async (id: string, file: File, documentType: string = 'other') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', documentType);
    return client.post<ApiResponse<VisaDocument>>(API_ENDPOINTS.visa.documents(id), formData as any);
  },

  downloadDocument: (visaId: string, docId: string) =>
    client.get<Blob>(API_ENDPOINTS.visa.documentDownload(visaId, docId), { responseType: 'blob' }),

  deleteDocument: (visaId: string, docId: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.visa.documentDelete(visaId, docId)),
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

  linkContact: (id: string, contactId: string) =>
    client.put<ApiResponse<Traveller>>(`${API_ENDPOINTS.travellers.byId(id)}/link-contact`, { contactId }),

  unlinkContact: (id: string) =>
    client.put<ApiResponse<Traveller>>(`${API_ENDPOINTS.travellers.byId(id)}/unlink-contact`, {}),
};

/** Formats a Date as YYYY-MM-DD in local time (toISOString would shift the day for UTC+ zones). */
export function toDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses a YYYY-MM-DD (or ISO) string as a local calendar date, avoiding UTC day shifts. */
export function parseDateOnly(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

/** The travellers endpoints return snake_case rows; the UI works in camelCase. */
export function normalizeTraveller(t: any): Traveller {
  return {
    ...t,
    firstName: t.firstName ?? t.first_name ?? '',
    lastName: t.lastName ?? t.last_name ?? '',
    passportNumber: t.passportNumber ?? t.passport_number ?? '',
    dateOfBirth: t.dateOfBirth ?? t.date_of_birth,
    nationality: t.nationality,
    email: t.email,
    phone: t.phone,
    passportExpiryDate: t.passportExpiryDate ?? t.passport_expiry_date,
    contactId: t.contactId ?? t.contact_id,
    contactName: t.contactName ?? t.contact_name,
    createdBy: t.createdBy ?? t.created_by ?? '',
    createdAt: t.createdAt ?? t.created_at ?? '',
    updatedAt: t.updatedAt ?? t.updated_at ?? '',
  };
}

/**
 * Traveller documents are stored through the documents endpoints, linked by
 * entity_type=traveller / entity_id=<travellerId>. (The generic documentsApi
 * helper only knows lead/itinerary links, and the backend ignores `tags`.)
 */
export const travellerDocumentsApi = {
  list: (travellerId: string) =>
    client.get<ApiResponse<PaginatedResponse<any>>>(API_ENDPOINTS.documents.list, {
      params: { entity_type: 'traveller', entity_id: travellerId, limit: 100 },
    }),

  upload: (travellerId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name);
    formData.append('category', 'traveller');
    formData.append('entity_type', 'traveller');
    formData.append('entity_id', travellerId);
    return client.post<ApiResponse<any>>(API_ENDPOINTS.documents.upload, formData as any);
  },
};
