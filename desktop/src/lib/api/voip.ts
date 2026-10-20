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

/** GET /voip/token: a short-lived softphone token (R307). provider is 'twilio' or, on local stacks, 'mock'. */
export interface VoipToken {
  token: string;
  expiresIn: number;
  identity?: string;
  expiresAt?: string;
  provider?: string;
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
  /** Rent state of a number the platform rents for the agency (R304). */
  rental?: {
    status: 'active' | 'release_scheduled';
    paidThrough: string | null;
    releaseAt: string | null;
    releaseReason: string | null;
    currency: string | null;
    monthlyPrice: number | null;
  } | null;
}

/** GET /voip/account: whether calling is on for the agency and what its sub-account looks like (never a secret). */
export interface VoipAccountState {
  available: boolean;
  reason: string | null;
  message: string | null;
  country: string;
  position: 'resell' | 'bridge' | 'own_account' | 'not_offered' | null;
  notes: string | null;
  account: { status: 'pending' | 'active' | 'suspended' | 'closed'; provider: string; subAccountId: string | null } | null;
}

export type KycStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface NumberKycDocument {
  id: string;
  country: string;
  status: Exclude<KycStatus, 'none'>;
  details: { businessName?: string; address?: string; registrationNumber?: string; contactName?: string } | null;
  files: { name: string; url: string }[];
  reviewNote: string | null;
  submittedAt: string;
}

/** GET /voip/number-offer: the price of a number and what is needed before buying one. */
export interface NumberOffer {
  calling: { allowed: boolean; reason: string | null; message: string | null; country: string; position: string | null };
  account: { status: string; provider: string } | null;
  /** Null when the market has no price yet (priceReason says why). */
  price: { productKey: string; monthly: number; tax: number; total: number; currency: string; includesMarginPct: number } | null;
  priceReason: string | null;
  kyc: { required: boolean; status: KycStatus; document: NumberKycDocument | null };
  addon: { freeThisMonth: number; productKey: string | null };
}

export interface SubmitKycRequest {
  details: { businessName: string; address: string; registrationNumber?: string };
  files: { name: string; url: string }[];
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

/** GET /voip/caller-info?phone=: who a number belongs to, and their open lead. */
export interface CallerInfo {
  isKnown: boolean;
  contact: { id: string; name: string; company: string | null; type: string; phone: string | null; email: string | null; lastInteraction: string | null } | null;
  lead: { id: string; title: string; status: string; value: number | null } | null;
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
  /** True once the recording is in our own storage and can be played. */
  hasRecording?: boolean;
  /** provider (being copied), stored, failed, expired (deleted after the retention period). */
  recordingState?: 'provider' | 'stored' | 'failed' | 'expired' | null;
  recordingBytes?: number | null;
  recordingExpiresAt?: string | null;
  /** announced: the caller heard the announcement; given: the agent ticked consent. */
  recordingConsent?: 'announced' | 'given' | 'none' | null;
  aiStatus?: 'queued' | 'transcribed' | 'summarised' | 'skipped' | 'failed' | null;
  aiStatusReason?: string | null;
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

/** GET /calls/:id/recording: a short-lived, signed link (about 5 minutes) bound to the person who asked. */
export interface RecordingLink {
  url: string;
  /** The same link in parts: the file path under the API and its query, for the authenticated client. */
  filePath: string;
  exp: number;
  sig: string;
  expiresAt: string;
  contentType: string;
  bytes: number | null;
  durationSeconds: number | null;
  retentionExpiresAt: string | null;
}

export interface CallSummary {
  aiStatus: Call['aiStatus'];
  aiStatusReason: string | null;
  summary: {
    extractionId: string;
    bullets: string[];
    keyTopics: string[];
    actionItems: { text: string; assignee?: string; dueDate?: string }[];
    sentiment: string | null;
    dealLikelihood: number | null;
    status: string;
    model: string | null;
    createdAt: string;
  } | null;
}

export type RecordingConsentMode = 'announce' | 'off' | 'on_request';

/** Per-agency recording, retention and call AI settings. */
export interface RecordingSettings {
  configured: boolean;
  consentMode: RecordingConsentMode;
  /** The agency's own announcement wording; null means the default. */
  announcement: string | null;
  defaultAnnouncement: string;
  effectiveAnnouncement: string;
  retentionDays: number;
  callAiEnabled: boolean;
  callAiEngine: 'standard' | 'premium';
  premiumAvailable: boolean;
  aiIncluded: boolean;
}

export type UpdateRecordingSettingsRequest = Partial<
  Pick<RecordingSettings, 'consentMode' | 'retentionDays' | 'callAiEnabled' | 'callAiEngine'> & { announcement: string | null }
>;

export const voipApi = {
  recordingSettings: {
    get: () => client.get<ApiResponse<RecordingSettings>>('/calls/recording-settings'),
    update: (data: UpdateRecordingSettingsRequest) => client.put<ApiResponse<RecordingSettings>>('/calls/recording-settings', data),
  },

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

  account: {
    get: () => client.get<ApiResponse<VoipAccountState>>('/voip/account'),
    enable: () => client.post<ApiResponse<{ created: boolean; account: VoipAccountState['account'] }>>('/voip/account/enable', {}),
  },

  numberOffer: {
    get: () => client.get<ApiResponse<NumberOffer>>('/voip/number-offer'),
  },

  kyc: {
    submit: (data: SubmitKycRequest) => client.post<ApiResponse<{ document: NumberKycDocument }>>('/voip/kyc', data),
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
      client.get<ApiResponse<CallerInfo>>('/voip/caller-info', { params: { phone: number } }),
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

    /** A signed link to the recording. 403 without access, 409 while the copy is pending, 410 after the retention period. */
    recording: (id: string) =>
      client.get<ApiResponse<RecordingLink>>(`${API_ENDPOINTS.voip.callById(id)}/recording`),

    /** The audio itself, fetched with the user's login and the signed link. */
    recordingAudio: (link: Pick<RecordingLink, 'filePath' | 'exp' | 'sig'>) =>
      client.get<Blob>(link.filePath, { params: { exp: link.exp, sig: link.sig }, responseType: 'blob' }),

    /** The agent has the caller's consent. In "on request" agencies this starts the recording. */
    recordingConsent: (id: string) =>
      client.post<ApiResponse<{ consent: 'given'; recording: boolean }>>(`${API_ENDPOINTS.voip.callById(id)}/recording/consent`, {}),

    summary: (id: string) =>
      client.get<ApiResponse<CallSummary>>(`${API_ENDPOINTS.voip.callById(id)}/summary`),

    /** "Summarise now" / "Try again": 429 when AI credits are used up, 409 when call AI is switched off. */
    summarise: (id: string) =>
      client.post<ApiResponse<{ status: string }>>(`${API_ENDPOINTS.voip.callById(id)}/summarise`, {}),
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
