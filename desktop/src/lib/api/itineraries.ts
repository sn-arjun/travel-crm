import type { DepartureSummary, QuoteSeats } from './departures';
import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import type { Itinerary } from '@travelcrm/shared';
import { unwrapEntity } from './envelope';

export interface ItineraryItem {
  id?: string;
  type: 'hotel' | 'transport' | 'activity' | 'meal' | 'flight';
  title: string;
  description?: string;
  supplierId?: string;
  rateCardId?: string;
  costPrice?: number;
  sellingPrice?: number;
  markupType?: 'percentage' | 'fixed';
  markupValue?: number;
  taxRate?: number;
  taxAmount?: number;
  quantity?: number;
  paxType?: 'adult' | 'child' | 'infant';
  timeStart?: string;
  timeEnd?: string;
  sortOrder?: number;
  detailsJson?: string;
  internalNotes?: string;
}

export interface ItineraryDay {
  id?: string;
  dayNumber: number;
  title?: string;
  description?: string;
  city?: string;
  overnightCity?: string;
  images?: string[];
  isFreeDay?: boolean;
  items?: ItineraryItem[];
}

export interface CreateItineraryRequest {
  leadId: string;
  title: string;
  validityDate?: string;
  notes?: string;
  inclusions?: string[];
  exclusions?: string[];
  termsConditions?: string;
  currency?: string;
  markupType?: 'percentage' | 'fixed';
  markupValue?: number;
  days: ItineraryDay[];
}

export interface UpdateItineraryRequest {
  title?: string;
  validityDate?: string;
  notes?: string;
  inclusions?: string[];
  exclusions?: string[];
  termsConditions?: string;
  currency?: string;
  markupType?: 'percentage' | 'fixed';
  markupValue?: number;
  status?: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired';
  days?: ItineraryDay[];
}

export interface CloneItineraryRequest {
  targetLeadId?: string;
}

export interface NewVersionRequest {
  changes?: string;
}

export interface ItineraryVersion {
  id: string;
  versionNumber: number;
  createdAt: string;
  createdBy: string;
  changes?: string;
}

export interface SendItineraryRequest {
  channel: 'email' | 'whatsapp';
  to: string;
  subject?: string;
  message?: string;
}

export interface ShareLinkRequest {
  expiryDays?: number;
  accessLevel?: 'view' | 'comment';
}

export interface ShareLinkResponse {
  link: string;
  expiresAt: string;
  accessLevel: string;
}

/** Contact summary the itinerary detail endpoint joins in. */
export interface ItineraryContact {
  id?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
}

/** Itinerary as returned by GET /itineraries/:id (days with items, joined lead and contact). */
export interface ItineraryDetail {
  id: string;
  leadId?: string;
  title: string;
  version?: number;
  status?: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired';
  validityDate?: string | null;
  notes?: string | null;
  inclusions?: string[];
  exclusions?: string[];
  termsConditions?: string | null;
  currency?: string;
  totalCost?: number;
  totalSelling?: number;
  totalTax?: number;
  grandTotal?: number;
  markupType?: 'percentage' | 'fixed' | null;
  markupValue?: number | null;
  shareLinkActive?: boolean;
  viewCount?: number;
  lastViewedAt?: string | null;
  createdAt?: string;
  days?: ItineraryDay[];
  lead?: { id?: string; title?: string; destination?: unknown } | null;
  contact?: ItineraryContact | null;
  /** The group departure the quote is for and its seats; null when none is linked (R146). */
  departure?: DepartureSummary | null;
  seats?: QuoteSeats | null;
}

/** Message of a thrown `ApiError` (a plain `{ status, message }` object) or `Error`; `fallback` otherwise. */
export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

/** Normalises a stored destination (array, JSON-array string or plain text) to "Goa, Kerala". */
export function formatDestination(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean).join(', ');
  }
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (text.startsWith('[')) {
    try {
      return formatDestination(JSON.parse(text) as unknown);
    } catch {
      return text;
    }
  }
  return text;
}

/** Entity from a GET /itineraries/:id response. */
export function toItineraryDetail(res: unknown): ItineraryDetail {
  return unwrapEntity<ItineraryDetail>(res);
}

export interface ItineraryTemplateDay {
  dayNumber?: number;
  title?: string;
  description?: string;
  city?: string;
  items?: ItineraryItem[];
}

export interface ItineraryTemplateData {
  days?: ItineraryTemplateDay[];
  inclusions?: string[];
  exclusions?: string[];
  termsConditions?: string;
}

export type ItineraryTemplateCategory =
  | 'beach' | 'mountain' | 'heritage' | 'adventure' | 'honeymoon'
  | 'family' | 'corporate' | 'pilgrimage' | 'custom';

export const ITINERARY_TEMPLATE_CATEGORIES: ItineraryTemplateCategory[] = [
  'beach', 'mountain', 'heritage', 'adventure', 'honeymoon', 'family', 'corporate', 'pilgrimage', 'custom',
];

export interface ItineraryTemplate {
  id: string;
  title: string;
  description?: string | null;
  destination?: string | null;
  durationDays?: number | null;
  category?: string | null;
  templateData?: ItineraryTemplateData | string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateItineraryTemplateRequest {
  title: string;
  description?: string | null;
  destination?: string | null;
  durationDays?: number | null;
  category?: ItineraryTemplateCategory | null;
  /** JSON snapshot: `{ days: [...] }` */
  templateData: string;
}

/** Day outline of a template; handles `templateData` arriving as a JSON string. */
export function templateDays(t: Pick<ItineraryTemplate, 'templateData'>): ItineraryTemplateDay[] {
  let data = t.templateData;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data) as ItineraryTemplateData;
    } catch {
      return [];
    }
  }
  return Array.isArray(data?.days) ? data.days : [];
}

export const itineraryTemplatesApi = {
  list: (params?: { page?: number; limit?: number; search?: string }) =>
    client.get<ApiResponse<PaginatedResponse<ItineraryTemplate>>>(API_ENDPOINTS.itineraryTemplates.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<ItineraryTemplate>>(API_ENDPOINTS.itineraryTemplates.byId(id)),

  create: (data: CreateItineraryTemplateRequest) =>
    client.post<ApiResponse<ItineraryTemplate>>(API_ENDPOINTS.itineraryTemplates.create, data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.itineraryTemplates.byId(id)),

  createFrom: (data: { templateId: string; leadId: string; title: string }) =>
    client.post<ApiResponse<{ id: string }>>(API_ENDPOINTS.itineraryTemplates.createFrom, data),
};

export const itinerariesApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    leadId?: string;
    destination?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Itinerary>>>(API_ENDPOINTS.itineraries.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<Itinerary>>(API_ENDPOINTS.itineraries.byId(id)),

  create: (data: CreateItineraryRequest) =>
    client.post<ApiResponse<Itinerary>>(API_ENDPOINTS.itineraries.create, data),

  update: (id: string, data: UpdateItineraryRequest) =>
    client.put<ApiResponse<Itinerary>>(API_ENDPOINTS.itineraries.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.itineraries.byId(id)),

  clone: (id: string, data?: CloneItineraryRequest) =>
    client.post<ApiResponse<Itinerary>>(API_ENDPOINTS.itineraries.clone(id), data),

  createNewVersion: (id: string, data?: NewVersionRequest) =>
    client.post<ApiResponse<Itinerary>>(API_ENDPOINTS.itineraries.newVersion(id), data),

  getVersions: (id: string, params?: { page?: number; limit?: number }) =>
    client.get<ApiResponse<PaginatedResponse<ItineraryVersion>>>(API_ENDPOINTS.itineraries.versions(id), { params }),

  send: (id: string, data: SendItineraryRequest) =>
    client.post<ApiResponse<{ sent: number }>>(API_ENDPOINTS.itineraries.send(id), data),

  createShareLink: (id: string, data?: ShareLinkRequest) =>
    client.post<ApiResponse<ShareLinkResponse>>(API_ENDPOINTS.itineraries.shareLink(id), data),

  revokeShareLink: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.itineraries.shareLink(id)),
};
