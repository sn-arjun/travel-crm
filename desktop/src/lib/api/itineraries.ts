import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import type { Itinerary } from '@travelcrm/shared';

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
  status?: 'draft' | 'pending' | 'approved' | 'sent' | 'rejected';
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
