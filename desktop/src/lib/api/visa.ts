import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import { camelizeKeys, toApiResponse, unwrapEntity, unwrapList } from './envelope';

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
  /** GET /visa answers { data: { data, pagination } }; this resolves to a flat PaginatedResponse of normalised rows. */
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    countryName?: string;
    traveller_id?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<VisaRecord>> => {
    const res = await client.get<unknown>(API_ENDPOINTS.visa.list, { params });
    const list = unwrapList<unknown>(res, { page: params?.page, limit: params?.limit });
    return { ...list, data: list.data.map((row) => normalizeVisa(row)) };
  },

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
    return client.post<ApiResponse<VisaDocument>>(API_ENDPOINTS.visa.documents(id), formData);
  },

  downloadDocument: (visaId: string, docId: string) =>
    client.get<Blob>(API_ENDPOINTS.visa.documentDownload(visaId, docId), { responseType: 'blob' }),

  deleteDocument: (visaId: string, docId: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.visa.documentDelete(visaId, docId)),
};

export const travellersApi = {
  /** GET /travellers answers { data: { data: snake_case rows, pagination } }; this resolves to a flat PaginatedResponse of camelCase rows. */
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    leadId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Traveller>> => {
    const res = await client.get<unknown>(API_ENDPOINTS.travellers.list, { params });
    const list = unwrapList<unknown>(res, { page: params?.page, limit: params?.limit });
    return { ...list, data: list.data.map(normalizeTraveller) };
  },

  getById: async (id: string): Promise<ApiResponse<Traveller>> =>
    travellerEntity(await client.get<unknown>(API_ENDPOINTS.travellers.byId(id))),

  create: async (data: CreateTravellerRequest): Promise<ApiResponse<Traveller>> =>
    travellerEntity(await client.post<unknown>(API_ENDPOINTS.travellers.create, data)),

  update: async (id: string, data: UpdateTravellerRequest): Promise<ApiResponse<Traveller>> =>
    travellerEntity(await client.put<unknown>(API_ENDPOINTS.travellers.byId(id), data)),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.travellers.byId(id)),

  linkContact: async (id: string, contactId: string): Promise<ApiResponse<Traveller>> =>
    travellerEntity(await client.put<unknown>(`${API_ENDPOINTS.travellers.byId(id)}/link-contact`, { contactId })),

  unlinkContact: async (id: string): Promise<ApiResponse<Traveller>> =>
    travellerEntity(await client.put<unknown>(`${API_ENDPOINTS.travellers.byId(id)}/unlink-contact`, {})),
};

function travellerEntity(res: unknown): ApiResponse<Traveller> {
  const entity = unwrapEntity<unknown>(res);
  return toApiResponse(entity && typeof entity === 'object' ? normalizeTraveller(entity) : (entity as Traveller));
}

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
    .then((r) => r.data)
    .catch(() => null);
  travellerCache.set(id, { at: Date.now(), value });
  return value;
}

type Row = Record<string, unknown>;

/** Loose view of a (possibly snake_case) visa row, camelized by normalizeVisa. */
type RawVisa = Partial<VisaRecord> & {
  destinationCountry?: string;
  country?: string;
  appliedDate?: string;
  visaExpiryDate?: string;
  [key: string]: unknown;
};

export function normalizeVisa(raw: unknown, traveller?: Traveller | null): VisaRecord {
  const v: RawVisa = camelizeKeys<RawVisa | null>(raw) ?? {};
  const travellerName = traveller
    ? `${traveller.firstName} ${traveller.lastName}`.trim()
    : (v.travellerName ?? '');
  return {
    ...v,
    id: v.id as string,
    travellerId: v.travellerId,
    travellerName,
    passportNumber: traveller?.passportNumber ?? v.passportNumber ?? '',
    countryName: v.countryName ?? v.destinationCountry ?? v.country ?? '',
    visaType: v.visaType ?? undefined,
    applicationDate: v.applicationDate ?? v.appliedDate ?? undefined,
    expiryDate: v.expiryDate ?? v.visaExpiryDate ?? undefined,
    status: v.status ?? 'not_started',
    notes: v.notes ?? undefined,
    createdBy: v.createdBy ?? '',
    createdAt: v.createdAt ?? '',
    updatedAt: v.updatedAt ?? '',
  };
}

async function withTravellers(rows: VisaRecord[]): Promise<VisaRecord[]> {
  const idOf = (r: VisaRecord): string | undefined => r.travellerId ?? r.travelerId;
  const ids = [...new Set(rows.map(idOf).filter((id): id is string => Boolean(id)))];
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
  /** Same shape as visaApi.list (a PaginatedResponse), with traveller names resolved. */
  async list(params?: { page?: number; limit?: number; search?: string; status?: string; traveller_id?: string }): Promise<PaginatedResponse<VisaRecord>> {
    const res = await visaApi.list(params);
    return { ...res, data: await withTravellers(res.data) };
  },

  async getById(id: string): Promise<VisaRecord> {
    const res = await visaApi.getById(id);
    const raw = res.data as unknown as Row;
    const travellerId = (raw.traveller_id ?? raw.travellerId) as string | undefined;
    const traveller = travellerId ? await lookupTraveller(travellerId) : null;
    // GET /visa/:id overwrites the `notes` column with the timeline-notes array, so the
    // application's own notes only come back from the list endpoint.
    let notes = raw.notes;
    if (Array.isArray(notes)) {
      const list = await visaApi.list({ traveller_id: travellerId, limit: 100 }).catch(() => null);
      notes = list?.data.find((r) => r.id === raw.id)?.notes ?? undefined;
    }
    return normalizeVisa({ ...raw, notes }, traveller);
  },

  async getChecklist(id: string): Promise<VisaChecklistItem[]> {
    const res = await visaApi.getById(id);
    const items = ((res.data as unknown as Row).checklist ?? []) as Row[];
    return items.map((i) => ({
      id: i.id as string,
      item: (i.document_name ?? i.item ?? '') as string,
      completed: Boolean(i.is_received ?? i.completed),
      completedAt: (i.received_date ?? undefined) as string | undefined,
    }));
  },

  setChecklistItem: (id: string, itemId: string, isReceived: boolean) =>
    client.put<{ success: boolean }>(API_ENDPOINTS.visa.checklist(id, itemId), { isReceived }),

  /** Creates the application, then applies the fields the create endpoint does not accept. */
  async create(input: CreateVisaApplicationInput): Promise<{ id: string }> {
    const res = await client.post<{ data?: { id?: string } }>(API_ENDPOINTS.visa.create, {
      travellerId: input.travellerId,
      destinationCountry: input.destinationCountry,
      visaType: input.visaType,
      status: 'not_started',
    });
    const id = res?.data?.id as string;
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
    const res = await client.get<{ data?: { total?: number; statusCounts?: Record<string, number>; expiringSoon?: number } }>(
      `${API_ENDPOINTS.visa.list}/dashboard`,
    );
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
export function normalizeTraveller(raw: unknown): Traveller {
  const t = camelizeKeys<Partial<Traveller> | null>(raw) ?? {};
  return {
    ...t,
    id: t.id as string,
    firstName: t.firstName ?? '',
    lastName: t.lastName ?? '',
    passportNumber: t.passportNumber ?? '',
    createdBy: t.createdBy ?? '',
    createdAt: t.createdAt ?? '',
    updatedAt: t.updatedAt ?? '',
  };
}

/**
 * Traveller documents are stored through the documents endpoints, linked by
 * entity_type=traveller / entity_id=<travellerId>. (The generic documentsApi
 * helper only knows lead/itinerary links, and the backend ignores `tags`.)
 */
export const travellerDocumentsApi = {
  list: (travellerId: string) =>
    client.get<ApiResponse<PaginatedResponse<Record<string, unknown>>>>(API_ENDPOINTS.documents.list, {
      params: { entity_type: 'traveller', entity_id: travellerId, limit: 100 },
    }),

  upload: (travellerId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name);
    formData.append('category', 'traveller');
    formData.append('entity_type', 'traveller');
    formData.append('entity_id', travellerId);
    return client.post<ApiResponse<Record<string, unknown>>>(API_ENDPOINTS.documents.upload, formData);
  },
};
