import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

// VisaRecord type not in shared package, define locally
export interface VisaRecord {
  id: string;
  travelerId?: string;
  travellerId?: string;
  passportNumber: string;
  travellerName: string;
  countryName: string;
  visaType?: string;
  applicationDate?: string;
  expiryDate?: string;
  status: 'not_started' | 'documents_collecting' | 'applied' | 'processing' | 'approved' | 'rejected';
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

// ---------------------------------------------------------------------------
// Backend-contract adapter
//
// The visa endpoints speak the DB contract (travellerId, destinationCountry,
// lowercase visaType enum, appliedDate / visaExpiryDate, snake_case rows with
// no traveller name). The pages work in a flat camelCase VisaRecord, so this
// layer translates both ways. The raw `visaApi` above stays a thin wire client.
// ---------------------------------------------------------------------------

export const VISA_TYPE_OPTIONS = [
  { value: 'tourist', label: 'Tourist' },
  { value: 'business', label: 'Business' },
  { value: 'transit', label: 'Transit' },
  { value: 'student', label: 'Student' },
  { value: 'work', label: 'Work' },
  { value: 'medical', label: 'Medical' },
] as const;

export function visaTypeLabel(value?: string | null): string {
  if (!value) return '';
  return VISA_TYPE_OPTIONS.find((o) => o.value === value.toLowerCase())?.label ?? value;
}

const TRAVELLER_TTL_MS = 30_000;
const travellerCache = new Map<string, { at: number; value: Promise<Traveller | null> }>();

function lookupTraveller(id: string): Promise<Traveller | null> {
  const hit = travellerCache.get(id);
  if (hit && Date.now() - hit.at < TRAVELLER_TTL_MS) return hit.value;
  const value = travellersApi
    .getById(id)
    .then((r) => normalizeTraveller((r as any)?.data))
    .catch(() => null);
  travellerCache.set(id, { at: Date.now(), value });
  return value;
}

export function normalizeVisa(v: any, traveller?: Traveller | null): VisaRecord {
  const travellerName = traveller
    ? `${traveller.firstName} ${traveller.lastName}`.trim()
    : (v.travellerName ?? '');
  return {
    ...v,
    id: v.id,
    travellerId: v.travellerId ?? v.traveller_id,
    travellerName,
    passportNumber: traveller?.passportNumber ?? v.passportNumber ?? '',
    countryName: v.countryName ?? v.destinationCountry ?? v.destination_country ?? v.country ?? '',
    visaType: v.visaType ?? v.visa_type ?? undefined,
    applicationDate: v.applicationDate ?? v.appliedDate ?? v.applied_date ?? undefined,
    expiryDate: v.expiryDate ?? v.visaExpiryDate ?? v.visa_expiry_date ?? undefined,
    status: v.status ?? 'not_started',
    notes: v.notes ?? undefined,
    createdBy: v.createdBy ?? v.created_by ?? '',
    createdAt: v.createdAt ?? v.created_at ?? '',
    updatedAt: v.updatedAt ?? v.updated_at ?? '',
  };
}

async function withTravellers(rows: any[]): Promise<VisaRecord[]> {
  const idOf = (r: any): string | undefined => r.travellerId ?? r.traveller_id;
  const ids = [...new Set(rows.map(idOf).filter(Boolean))] as string[];
  const found = new Map<string, Traveller | null>();
  await Promise.all(ids.map(async (id) => found.set(id, await lookupTraveller(id))));
  return rows.map((r) => normalizeVisa(r, found.get(idOf(r) ?? '')));
}

export interface CreateVisaApplicationInput {
  travellerId: string;
  destinationCountry: string;
  visaType: string;
  applicationDate?: string;
  expiryDate?: string;
  notes?: string;
}

export interface UpdateVisaApplicationInput {
  status?: VisaRecord['status'];
  applicationDate?: string;
  expiryDate?: string;
  notes?: string;
}

export const visaService = {
  /** Same envelope as visaApi.list, with rows normalised and traveller names resolved. */
  async list(params?: { page?: number; limit?: number; search?: string; status?: string; traveller_id?: string }) {
    const res = await visaApi.list(params);
    const inner = (res as any)?.data;
    const rows: any[] = Array.isArray(inner) ? inner : (inner?.data ?? []);
    const data = await withTravellers(rows);
    return { ...res, data: { data, pagination: inner?.pagination } };
  },

  async getById(id: string): Promise<VisaRecord> {
    const res: any = await visaApi.getById(id);
    const raw = res?.data;
    const traveller = raw?.traveller_id ? await lookupTraveller(raw.traveller_id) : null;
    // GET /visa/:id overwrites the `notes` column with the timeline-notes array, so the
    // application's own notes only come back from the list endpoint.
    let notes = raw?.notes;
    if (Array.isArray(notes)) {
      const list: any = await visaApi.list({ traveller_id: raw.traveller_id, limit: 100 }).catch(() => null);
      const rows: any[] = list?.data?.data ?? [];
      notes = rows.find((r) => r.id === raw.id)?.notes ?? undefined;
    }
    return normalizeVisa({ ...raw, notes }, traveller);
  },

  async getChecklist(id: string): Promise<VisaChecklistItem[]> {
    const res: any = await visaApi.getById(id);
    const items: any[] = res?.data?.checklist ?? [];
    return items.map((i) => ({
      id: i.id,
      item: i.document_name ?? i.item ?? '',
      completed: Boolean(i.is_received ?? i.completed),
      completedAt: i.received_date ?? undefined,
    }));
  },

  setChecklistItem: (id: string, itemId: string, isReceived: boolean) =>
    client.put<{ success: boolean }>(API_ENDPOINTS.visa.checklist(id, itemId), { isReceived }),

  /** Creates the application, then applies the fields the create endpoint does not accept. */
  async create(input: CreateVisaApplicationInput): Promise<{ id: string }> {
    const res: any = await client.post(API_ENDPOINTS.visa.create, {
      travellerId: input.travellerId,
      destinationCountry: input.destinationCountry,
      visaType: input.visaType,
      status: 'not_started',
    });
    const id: string = res?.data?.id;
    const extra: Record<string, string> = {};
    if (input.applicationDate) extra.appliedDate = input.applicationDate;
    if (input.expiryDate) extra.visaExpiryDate = input.expiryDate;
    if (input.notes) extra.notes = input.notes;
    if (id && Object.keys(extra).length > 0) {
      await client.put(API_ENDPOINTS.visa.byId(id), extra);
    }
    return { id };
  },

  update: (id: string, input: UpdateVisaApplicationInput) =>
    client.put(API_ENDPOINTS.visa.byId(id), {
      status: input.status,
      appliedDate: input.applicationDate,
      visaExpiryDate: input.expiryDate,
      notes: input.notes,
    }),

  async dashboard(): Promise<{ total: number; statusCounts: Record<string, number>; expiringSoon: number }> {
    const res: any = await client.get(`${API_ENDPOINTS.visa.list}/dashboard`);
    return {
      total: res?.data?.total ?? 0,
      statusCounts: res?.data?.statusCounts ?? {},
      expiringSoon: res?.data?.expiringSoon ?? 0,
    };
  },
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
