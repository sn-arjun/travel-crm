import { client, type ApiResponse, type PaginatedResponse } from './client';

export type ExtractionSourceType = 'call' | 'email' | 'whatsapp' | 'document' | 'business_card';
export type ExtractionStatus = 'pending' | 'confirmed' | 'rejected';

export interface ExtractionField {
  key: string;
  label: string;
  value: string;
  confidence: number;
}

export interface AiExtraction {
  id: string;
  sourceType: ExtractionSourceType;
  sourceLabel?: string;
  status: ExtractionStatus;
  overallConfidence: number;
  fields: ExtractionField[];
  contactId?: string;
  contactName?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface AiExtractionUsageSummary {
  totalExtractions: number;
  pendingCount: number;
  confirmedCount: number;
  rejectedCount: number;
  avgConfidence: number;
}

export interface ListExtractionsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ExtractionStatus;
  sourceType?: ExtractionSourceType;
}

export interface ConfirmExtractionRequest {
  fields?: Record<string, string>;
}

export interface RejectExtractionRequest {
  reason?: string;
}

export interface ScheduleFollowupRequest {
  dueDate: string;
  note?: string;
}

export const aiExtractionsApi = {
  list: (params?: ListExtractionsParams) =>
    client.get<PaginatedResponse<AiExtraction>>('/ai/extractions', {
      params: params as unknown as Record<string, string | number | boolean | undefined>,
    }),

  getById: (id: string) => client.get<ApiResponse<AiExtraction>>(`/ai/extractions/${id}`),

  getPendingCount: () =>
    client.get<ApiResponse<{ count: number }>>('/ai/extractions/pending-count'),

  getUsageSummary: () =>
    client.get<ApiResponse<AiExtractionUsageSummary>>('/ai/extractions/usage/summary'),

  confirm: (id: string, data?: ConfirmExtractionRequest) =>
    client.post<ApiResponse<AiExtraction>>(`/ai/extractions/${id}/confirm`, data),

  reject: (id: string, data?: RejectExtractionRequest) =>
    client.post<ApiResponse<AiExtraction>>(`/ai/extractions/${id}/reject`, data),

  createInvoice: (id: string) =>
    client.post<ApiResponse<{ invoiceId: string }>>(`/ai/extractions/${id}/create-invoice`),

  createItinerary: (id: string) =>
    client.post<ApiResponse<{ itineraryId: string }>>(`/ai/extractions/${id}/create-itinerary`),

  scheduleFollowup: (id: string, data: ScheduleFollowupRequest) =>
    client.post<ApiResponse<{ followUpId: string }>>(`/ai/extractions/${id}/schedule-followup`, data),
};
