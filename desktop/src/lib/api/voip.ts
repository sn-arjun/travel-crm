import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export type VoipProviderName = 'twilio' | 'plivo';
export type VoipRecordingPolicy = 'all' | 'inbound' | 'outbound' | 'none';
export type VoipRoutingStrategy = 'assigned' | 'round_robin' | 'least_recent';

/** Shape returned by GET /voip/settings — secrets come back masked (`****abcd`). */
export interface VoipSettings {
  id: string;
  voipProvider: VoipProviderName;
  providerAccountId?: string | null;
  providerAuthToken?: string | null;
  twilioAccountSid?: string | null;
  twilioAuthToken?: string | null;
  defaultCallerId?: string | null;
  recordingPolicy: VoipRecordingPolicy;
  ivrEnabled: boolean;
  businessHoursEnabled: boolean;
  voicemailEnabled: boolean;
  maxRingDuration: number;
  routingStrategy: VoipRoutingStrategy;
}

export interface VoipToken {
  token: string;
  expiresIn: number;
}

export interface VoipNumber {
  id: string;
  phoneNumber: string;
  friendlyName?: string | null;
  provider?: VoipProviderName;
  assignedTo?: string | null;
  assignedName?: string | null;
  purpose?: string | null;
  isDefault: boolean;
  monthlyCost?: number | null;
  capabilities?: { sms?: boolean; voice?: boolean } | null;
}

export interface AvailableNumber {
  phoneNumber: string;
  friendlyName?: string;
  region?: string;
  capabilities: { sms: boolean; voice: boolean };
  monthlyPrice?: number;
}

export interface SearchNumbersRequest {
  areaCode?: string;
  country?: string;
  contains?: string;
}

export interface PurchaseNumberRequest {
  phoneNumber: string;
  friendlyName?: string;
}

export interface UpdateNumberRequest {
  friendlyName?: string;
  assignedTo?: string;
  purpose?: string;
  isDefault?: boolean;
}

export interface CallerInfo {
  number: string;
  name?: string;
  contactId?: string;
  leadId?: string;
  carrier?: string;
  lineType?: string;
}

export type CallStatus = 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'no-answer' | 'canceled' | 'failed';
export type CallOutcome = 'interested' | 'not_interested' | 'follow_up_needed' | 'wrong_number' | 'no_answer' | 'voicemail';

export interface Call {
  id: string;
  contactId?: string | null;
  contactName?: string | null;
  leadId?: string | null;
  leadTitle?: string | null;
  direction: 'inbound' | 'outbound';
  fromNumber: string;
  toNumber: string;
  durationSeconds: number;
  status: CallStatus;
  outcome?: CallOutcome | null;
  providerCallId?: string | null;
  recordingUrl?: string | null;
  recordingDuration?: number | null;
  notes?: string | null;
  routedTo?: string | null;
  answeredBy?: string | null;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CallAnalytics {
  summary: {
    totalCalls: number;
    inboundCalls: number;
    outboundCalls: number;
    completedCalls: number;
    missedCalls: number;
    avgDurationSeconds: number;
    totalDurationSeconds: number;
    interestedCount: number;
    followUpCount: number;
    successRate: number;
  };
  dailyCalls: { date: string; total: number; inbound: number; outbound: number }[];
  topAgents: { userId: string; name: string; totalCalls: number; completed: number; avgDuration: number }[];
  outcomes: { outcome: string; count: number }[];
  hourlyDistribution: { hour: number; count: number }[];
}

/**
 * The calls/missed-calls endpoints return `{ success, data: T[], pagination }`
 * — pagination is a sibling of data, not nested inside it like the generic
 * `PaginatedResponse<T>` shape most other list endpoints use.
 */
export interface FlatPaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface MissedCall {
  id: string;
  from: string;
  to: string;
  missedAt: string;
  contactId?: string;
}

export interface Transcript {
  id: string;
  callLogId: string;
  fullTranscript: string;
  speakerSegments?: { speaker: string; text: string; start: number; end: number; confidence: number }[];
  language?: string;
  confidence?: number;
  wordCount?: number;
  durationSeconds?: number;
  isEdited?: boolean;
  editedByName?: string;
  editedAt?: string;
}

export interface TranscriptSearchResult {
  id: string;
  callId: string;
  snippet: string;
  language?: string;
  confidence?: number;
  wordCount?: number;
  durationSeconds?: number;
  direction?: 'inbound' | 'outbound';
  fromNumber?: string;
  toNumber?: string;
  callStatus?: string;
  contactName?: string;
  createdAt: string;
}

export interface UpdateVoipSettingsRequest {
  voipProvider?: VoipProviderName;
  providerAccountId?: string | null;
  providerAuthToken?: string | null;
  defaultCallerId?: string | null;
  recordingPolicy?: VoipRecordingPolicy;
  ivrEnabled?: boolean;
  businessHoursEnabled?: boolean;
  voicemailEnabled?: boolean;
  maxRingDuration?: number;
  routingStrategy?: VoipRoutingStrategy;
}

export interface CreateOutboundCallRequest {
  toNumber: string;
  leadId?: string | null;
  contactId?: string | null;
}

export interface UpdateCallRequest {
  outcome?: CallOutcome;
  notes?: string;
}

export interface TransferCallRequest {
  targetNumber: string;
}

export const voipApi = {
  settings: {
    get: () =>
      client.get<ApiResponse<VoipSettings>>(API_ENDPOINTS.voip.settings),

    update: (data: UpdateVoipSettingsRequest) =>
      client.put<ApiResponse<{ message: string }>>(API_ENDPOINTS.voip.settings, data),

    testConnection: () =>
      client.get<ApiResponse<{ connected: boolean; accountName?: string; error?: string }>>(API_ENDPOINTS.voip.testConnection),
  },

  token: {
    get: () =>
      client.get<ApiResponse<VoipToken>>(API_ENDPOINTS.voip.token),
  },

  numbers: {
    list: () =>
      client.get<ApiResponse<VoipNumber[]>>(API_ENDPOINTS.voip.numbers),

    search: (data: SearchNumbersRequest) =>
      client.post<ApiResponse<AvailableNumber[]>>(`${API_ENDPOINTS.voip.numbers}/search`, data),

    purchase: (data: PurchaseNumberRequest) =>
      client.post<ApiResponse<{ id: string; phoneNumber: string; providerNumberId: string }>>(`${API_ENDPOINTS.voip.numbers}/purchase`, data),

    update: (id: string, data: UpdateNumberRequest) =>
      client.put<ApiResponse<{ message: string }>>(`${API_ENDPOINTS.voip.numbers}/${id}`, data),

    remove: (id: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.voip.numbers}/${id}`),
  },

  callerInfo: {
    get: (number: string) =>
      client.get<ApiResponse<CallerInfo>>('/voip/caller-info', { params: { number } }),
  },

  calls: {
    list: (params?: {
      page?: number;
      limit?: number;
      direction?: 'inbound' | 'outbound';
      status?: string;
      search?: string;
      fromDate?: string;
      toDate?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<FlatPaginatedResponse<Call>>(API_ENDPOINTS.voip.calls, { params }),

    getById: (id: string) =>
      client.get<ApiResponse<Call>>(API_ENDPOINTS.voip.callById(id)),

    createOutbound: (data: CreateOutboundCallRequest) =>
      client.post<ApiResponse<{ callLogId: string; providerCallId: string; status: string }>>(API_ENDPOINTS.voip.outbound, data),

    update: (id: string, data: UpdateCallRequest) =>
      client.put<ApiResponse<{ message: string }>>(API_ENDPOINTS.voip.callById(id), data),

    remove: (id: string) =>
      client.delete<ApiResponse<{ message: string }>>(API_ENDPOINTS.voip.callById(id)),

    end: (id: string) =>
      client.post<ApiResponse<{ message: string }>>(`${API_ENDPOINTS.voip.callById(id)}/end`),

    transfer: (id: string, data: TransferCallRequest) =>
      client.post<ApiResponse<{ message: string }>>(`${API_ENDPOINTS.voip.callById(id)}/transfer`, data),

    getActions: (id: string) =>
      client.get<ApiResponse<{ id: string; label: string }[]>>(`${API_ENDPOINTS.voip.callById(id)}/actions`),
  },

  analytics: {
    get: (params?: { period?: string; fromDate?: string; toDate?: string }) =>
      client.get<ApiResponse<CallAnalytics>>(API_ENDPOINTS.voip.analytics, { params }),
  },

  missedCalls: {
    list: (params?: {
      page?: number;
      limit?: number;
      fromDate?: string;
      toDate?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<MissedCall>>>(API_ENDPOINTS.voip.missed, { params }),

    markReturned: (id: string) =>
      client.post<ApiResponse<MissedCall>>(`${API_ENDPOINTS.voip.missed}/${id}/mark-returned`),
  },

  transcripts: {
    /** Full-text search across transcripts. Backend requires a non-empty `q`. */
    search: (params: { q: string; page?: number; limit?: number }) =>
      client.get<ApiResponse<PaginatedResponse<TranscriptSearchResult>>>(API_ENDPOINTS.voip.transcripts, { params }),

    getByCall: (callId: string) =>
      client.get<ApiResponse<Transcript>>(`${API_ENDPOINTS.voip.transcripts}/${callId}`),

    update: (callLogId: string, data: { fullTranscript: string }) =>
      client.put<ApiResponse<{ message: string }>>(`${API_ENDPOINTS.voip.transcripts}/${callLogId}`, data),
  },
};
