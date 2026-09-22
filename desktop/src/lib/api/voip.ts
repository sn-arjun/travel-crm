import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface VoipSettings {
  id: string;
  provider: 'twilio' | 'vonage' | 'other';
  accountSid?: string;
  apiKey?: string;
  connected: boolean;
  features: {
    inboundCalls: boolean;
    outboundCalls: boolean;
    voicemail: boolean;
    transcription: boolean;
    recording: boolean;
  };
}

export interface VoipToken {
  token: string;
  expiresIn: number;
}

export interface VoipNumber {
  id: string;
  number: string;
  friendly_name?: string;
  status: 'active' | 'inactive';
  type: 'local' | 'toll_free';
  capabilities: {
    sms: boolean;
    voice: boolean;
    fax: boolean;
  };
}

export interface Call {
  id: string;
  from: string;
  to: string;
  status: 'initiated' | 'ringing' | 'in_progress' | 'completed' | 'failed' | 'no_answer';
  direction: 'inbound' | 'outbound';
  startTime: string;
  endTime?: string;
  duration: number;
  recordingUrl?: string;
  transcriptUrl?: string;
  notes?: string;
  contactId?: string;
  leadId?: string;
}

export interface CallAnalytics {
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  completedCalls: number;
  missedCalls: number;
  totalDuration: number;
  avgDuration: number;
  avgWaitTime?: number;
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
  callId: string;
  text: string;
  language?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  keywords?: string[];
}

export interface UpdateVoipSettingsRequest {
  provider?: 'twilio' | 'vonage' | 'other';
  accountSid?: string;
  apiKey?: string;
  features?: {
    inboundCalls?: boolean;
    outboundCalls?: boolean;
    voicemail?: boolean;
    transcription?: boolean;
    recording?: boolean;
  };
}

export interface CreateOutboundCallRequest {
  to: string;
  from?: string;
  message?: string;
  leadId?: string;
  contactId?: string;
}

export interface UpdateCallRequest {
  notes?: string;
  contactId?: string;
  leadId?: string;
}

export interface TransferCallRequest {
  to: string;
}

export const voipApi = {
  settings: {
    get: () =>
      client.get<ApiResponse<VoipSettings>>(API_ENDPOINTS.voip.settings),

    update: (data: UpdateVoipSettingsRequest) =>
      client.put<ApiResponse<VoipSettings>>(API_ENDPOINTS.voip.settings, data),

    testConnection: () =>
      client.post<ApiResponse<{ connected: boolean; message: string }>>(API_ENDPOINTS.voip.testConnection),
  },

  token: {
    get: () =>
      client.get<ApiResponse<VoipToken>>(API_ENDPOINTS.voip.token),
  },

  numbers: {
    list: () =>
      client.get<ApiResponse<VoipNumber[]>>(API_ENDPOINTS.voip.numbers),
  },

  calls: {
    list: (params?: {
      page?: number;
      limit?: number;
      direction?: 'inbound' | 'outbound';
      status?: string;
      fromDate?: string;
      toDate?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<Call>>>(API_ENDPOINTS.voip.calls, { params }),

    getById: (id: string) =>
      client.get<ApiResponse<Call>>(API_ENDPOINTS.voip.callById(id)),

    createOutbound: (data: CreateOutboundCallRequest) =>
      client.post<ApiResponse<Call>>(API_ENDPOINTS.voip.outbound, data),

    update: (id: string, data: UpdateCallRequest) =>
      client.put<ApiResponse<Call>>(API_ENDPOINTS.voip.callById(id), data),

    remove: (id: string) =>
      client.delete<ApiResponse<void>>(API_ENDPOINTS.voip.callById(id)),

    end: (id: string) =>
      client.post<ApiResponse<Call>>(`${API_ENDPOINTS.voip.callById(id)}/end`),

    transfer: (id: string, data: TransferCallRequest) =>
      client.post<ApiResponse<Call>>(`${API_ENDPOINTS.voip.callById(id)}/transfer`, data),

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
    list: (params?: {
      page?: number;
      limit?: number;
      callId?: string;
      sentiment?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<Transcript>>>(API_ENDPOINTS.voip.transcripts, { params }),

    getByCall: (callId: string) =>
      client.get<ApiResponse<Transcript>>(`${API_ENDPOINTS.voip.transcripts}/${callId}`),

    update: (callLogId: string, data: { text?: string; sentiment?: Transcript['sentiment']; keywords?: string[] }) =>
      client.put<ApiResponse<Transcript>>(`${API_ENDPOINTS.voip.transcripts}/${callLogId}`, data),
  },
};
