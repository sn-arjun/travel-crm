import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface MarketingSegment {
  id: string;
  name: string;
  description?: string;
  criteria: Record<string, unknown>;
  contactCount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface SegmentContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface CompanyBranding {
  id: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  customCss?: string;
}

export interface FlyerTemplate {
  id: string;
  name: string;
  category?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  createdAt?: string;
}

export interface FlyerTemplateAsset {
  id: string;
  templateId: string;
  url: string;
  kind?: string;
  createdAt?: string;
}

export interface MarketingFlyer {
  id: string;
  templateId: string;
  title: string;
  content?: Record<string, unknown>;
  imageUrl?: string;
  status: 'draft' | 'published';
  createdAt: string;
}

export interface MarketingImage {
  id: string;
  url: string;
  title?: string;
  category?: string;
  uploadedAt: string;
}

export interface CreateFlyerTemplateRequest {
  name: string;
  category?: string;
  thumbnailUrl?: string;
  previewUrl?: string;
}

export type UpdateFlyerTemplateRequest = Partial<CreateFlyerTemplateRequest>;

export interface ShareFlyerRequest {
  flyerId: string;
  segmentId?: string;
  contactIds?: string[];
  channel: 'email' | 'sms' | 'whatsapp';
}

export interface SocialContent {
  id: string;
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
  content: string;
  imageUrl?: string;
  scheduledFor?: string;
  status: 'draft' | 'scheduled' | 'posted';
  createdAt?: string;
}

export interface GenerateSocialContentRequest {
  topic: string;
  destination?: string;
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
  tone?: 'professional' | 'casual' | 'exciting' | 'informative';
}

export interface GenerateSocialContentBatchRequest {
  topic: string;
  destination?: string;
  platforms: ('facebook' | 'instagram' | 'twitter' | 'linkedin')[];
  tone?: 'professional' | 'casual' | 'exciting' | 'informative';
  count?: number;
}

export interface MarketingSuggestion {
  id: string;
  type: string;
  title: string;
  description: string;
  status: 'pending' | 'accepted' | 'dismissed';
  festivalName?: string;
  suggestedDate?: string;
  createdAt: string;
}

export interface CreateSegmentRequest {
  name: string;
  description?: string;
  criteria: Record<string, unknown>;
}

export type UpdateSegmentRequest = Partial<CreateSegmentRequest>;

export interface UpdateBrandingRequest {
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  fontFamily?: string;
  customCss?: string;
}

export interface CreateFlyerRequest {
  templateId: string;
  title: string;
  content?: Record<string, unknown>;
  imageUrl?: string;
}

export interface UpdateFlyerRequest {
  title?: string;
  content?: Record<string, unknown>;
  imageUrl?: string;
  status?: 'draft' | 'published';
}

export interface UploadImageRequest {
  file: File;
  title?: string;
  category?: string;
}

export interface CreateSocialContentRequest {
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
  content: string;
  imageUrl?: string;
  scheduledFor?: string;
}

export interface OptOutRequest {
  email?: string;
  phone?: string;
  reason?: string;
}

export interface OptedOutContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  optedOut: number;
  optedOutAt?: string;
  optOutChannel?: string;
  optOutReason?: string;
}

export interface ResubscribeRequest {
  contactId: string;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  /** No description column on the backend; always undefined until added. */
  description?: string;
  channel: 'email' | 'sms' | 'whatsapp';
  subject?: string;
  content?: string;
  flyerId?: string;
  segmentId?: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled' | 'failed';
  scheduledFor?: string;
  sentCount?: number;
  deliveredCount?: number;
  openedCount?: number;
  clickedCount?: number;
  failedCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateMarketingCampaignRequest {
  name: string;
  description?: string;
  channel: 'email' | 'sms' | 'whatsapp';
  subject?: string;
  content?: string;
  flyerId?: string;
  segmentId?: string;
  scheduledFor?: string;
}

export type UpdateMarketingCampaignRequest = Partial<CreateMarketingCampaignRequest>;

/** Raw wire shape from /marketing/campaigns/* — backend returns SQLite rows as-is (snake_case, campaign-router field names), not the camelCase MarketingCampaign the UI works with. */
interface RawMarketingCampaign {
  id: string;
  name: string;
  type: 'email' | 'sms' | 'whatsapp';
  segment_id?: string | null;
  message_body?: string | null;
  email_subject?: string | null;
  status: MarketingCampaign['status'];
  scheduled_at?: string | null;
  sent_count?: number | null;
  delivered_count?: number | null;
  opened_count?: number | null;
  clicked_count?: number | null;
  failed_count?: number | null;
  created_at: string;
  updated_at?: string | null;
}

function fromRawCampaign(raw: RawMarketingCampaign): MarketingCampaign {
  return {
    id: raw.id,
    name: raw.name,
    channel: raw.type,
    subject: raw.email_subject ?? undefined,
    content: raw.message_body ?? undefined,
    segmentId: raw.segment_id ?? undefined,
    status: raw.status,
    scheduledFor: raw.scheduled_at ?? undefined,
    sentCount: raw.sent_count ?? 0,
    deliveredCount: raw.delivered_count ?? 0,
    openedCount: raw.opened_count ?? 0,
    clickedCount: raw.clicked_count ?? 0,
    failedCount: raw.failed_count ?? 0,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at ?? undefined,
  };
}

function toRawCreate(data: CreateMarketingCampaignRequest) {
  return {
    name: data.name,
    type: data.channel,
    segmentId: data.segmentId || undefined,
    messageBody: data.content || undefined,
    emailSubject: data.subject || undefined,
    scheduledAt: data.scheduledFor || undefined,
  };
}

function extractList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  return (data as { data?: T[] })?.data ?? [];
}

function extractTotal(data: unknown, fallback: number): number {
  if (Array.isArray(data)) return fallback;
  return (data as { pagination?: { total?: number } })?.pagination?.total ?? fallback;
}

export interface MarketingCampaignAnalytics {
  id: string;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  failedCount: number;
  optedOutCount: number;
  openRate: number;
  clickRate: number;
  deliveryRate: number;
  timeline?: { date: string; sent: number; opened: number; clicked: number }[];
}

export interface MarketingCampaignRecipient {
  id: string;
  contactId?: string;
  name: string;
  email?: string;
  phone?: string;
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'failed' | 'opted_out';
  sentAt?: string;
  openedAt?: string;
  clickedAt?: string;
  errorMessage?: string;
}

export interface FestivalCampaign {
  id: string;
  name: string;
  festivalName: string;
  festivalDate: string;
  daysBefore: number;
  campaignType: string;
  isActive: boolean;
  messageBody?: string;
  lastRunAt?: string;
  createdAt: string;
}

const CAMPAIGNS_BASE = '/marketing/campaigns';

export const marketingApi = {
  campaigns: {
    list: async (params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      channel?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) => {
      const res = await client.get<{ success: boolean; data: RawMarketingCampaign[] | { data: RawMarketingCampaign[] }; pagination?: { total: number } }>(
        CAMPAIGNS_BASE,
        { params: { ...params, type: params?.channel, channel: undefined } },
      );
      const rows = extractList<RawMarketingCampaign>(res.data);
      const total = extractTotal(res.data, res.pagination?.total ?? rows.length);
      return {
        data: {
          data: rows.map(fromRawCampaign),
          pagination: { page: params?.page ?? 1, limit: params?.limit ?? rows.length, total, totalPages: Math.ceil(total / ((params?.limit ?? rows.length) || 1)) },
        },
      } as ApiResponse<PaginatedResponse<MarketingCampaign>>;
    },

    get: async (id: string) => {
      const res = await client.get<ApiResponse<RawMarketingCampaign>>(`${CAMPAIGNS_BASE}/${id}`);
      return { data: fromRawCampaign(res.data) } as ApiResponse<MarketingCampaign>;
    },

    create: async (data: CreateMarketingCampaignRequest) => {
      const res = await client.post<ApiResponse<RawMarketingCampaign>>(CAMPAIGNS_BASE, toRawCreate(data));
      return { data: fromRawCampaign(res.data) } as ApiResponse<MarketingCampaign>;
    },

    update: async (id: string, data: UpdateMarketingCampaignRequest) => {
      const res = await client.put<ApiResponse<RawMarketingCampaign>>(`${CAMPAIGNS_BASE}/${id}`, toRawCreate(data as CreateMarketingCampaignRequest));
      return { data: fromRawCampaign(res.data) } as ApiResponse<MarketingCampaign>;
    },

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${CAMPAIGNS_BASE}/${id}`),

    send: (id: string) =>
      client.post<ApiResponse<{ message: string; total_recipients: number }>>(`${CAMPAIGNS_BASE}/${id}/send`, {}),

    cancel: (id: string) =>
      client.post<ApiResponse<{ cancelled: boolean }>>(`${CAMPAIGNS_BASE}/${id}/cancel`, {}),

    analytics: async (id: string) => {
      const res = await client.get<ApiResponse<{
        sent: number; delivered: number; failed: number; opted_out: number; pending: number;
        total_recipients: number; delivery_rate: string; opened: number; clicked: number;
      }>>(`${CAMPAIGNS_BASE}/${id}/analytics`);
      const r = res.data;
      const sentCount = Number(r.sent) || 0;
      return {
        data: {
          id,
          sentCount,
          deliveredCount: Number(r.delivered) || 0,
          openedCount: Number(r.opened) || 0,
          clickedCount: Number(r.clicked) || 0,
          failedCount: Number(r.failed) || 0,
          optedOutCount: Number(r.opted_out) || 0,
          openRate: sentCount > 0 ? Math.round(((Number(r.opened) || 0) / sentCount) * 1000) / 10 : 0,
          clickRate: sentCount > 0 ? Math.round(((Number(r.clicked) || 0) / sentCount) * 1000) / 10 : 0,
          deliveryRate: Number(r.delivery_rate) || 0,
        },
      } as ApiResponse<MarketingCampaignAnalytics>;
    },

    recipients: async (id: string, params?: { page?: number; limit?: number; status?: string }) => {
      const res = await client.get<{ success: boolean; data: any[] | { data: any[] }; pagination?: { total: number } }>(
        `${CAMPAIGNS_BASE}/${id}/recipients`,
        { params },
      );
      const rows = extractList<any>(res.data);
      const total = extractTotal(res.data, res.pagination?.total ?? rows.length);
      const items: MarketingCampaignRecipient[] = rows.map((r) => ({
        id: r.id,
        contactId: r.contact_id ?? undefined,
        name: r.contact_name ?? r.name ?? '—',
        email: r.email ?? undefined,
        phone: r.phone ?? undefined,
        status: r.status,
        sentAt: r.sent_at ?? undefined,
        openedAt: r.opened_at ?? undefined,
        clickedAt: r.clicked_at ?? undefined,
        errorMessage: r.error_message ?? undefined,
      }));
      return {
        data: {
          data: items,
          pagination: { page: params?.page ?? 1, limit: params?.limit ?? items.length, total, totalPages: Math.ceil(total / ((params?.limit ?? items.length) || 1)) },
        },
      } as ApiResponse<PaginatedResponse<MarketingCampaignRecipient>>;
    },
  },

  segments: {
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<MarketingSegment>>>(API_ENDPOINTS.marketing.segments, { params }),

    get: (id: string) =>
      client.get<ApiResponse<MarketingSegment>>(`${API_ENDPOINTS.marketing.segments}/${id}`),

    create: (data: CreateSegmentRequest) =>
      client.post<ApiResponse<MarketingSegment>>(API_ENDPOINTS.marketing.segments, data),

    update: (id: string, data: UpdateSegmentRequest) =>
      client.put<ApiResponse<MarketingSegment>>(`${API_ENDPOINTS.marketing.segments}/${id}`, data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.marketing.segments}/${id}`),

    contacts: (id: string, params?: { page?: number; limit?: number }) =>
      client.get<ApiResponse<PaginatedResponse<SegmentContact>>>(
        `${API_ENDPOINTS.marketing.segments}/${id}/contacts`,
        { params },
      ),

    refreshCount: (id: string) =>
      client.post<ApiResponse<MarketingSegment>>(`${API_ENDPOINTS.marketing.segments}/${id}/refresh-count`, {}),
  },

  branding: {
    get: () =>
      client.get<ApiResponse<CompanyBranding>>(API_ENDPOINTS.marketing.branding),

    update: (data: UpdateBrandingRequest) =>
      client.put<ApiResponse<CompanyBranding>>(API_ENDPOINTS.marketing.branding, data),
  },

  flyerTemplates: {
    list: (params?: {
      page?: number;
      limit?: number;
      category?: string;
      search?: string;
    }) =>
      client.get<ApiResponse<PaginatedResponse<FlyerTemplate>>>(API_ENDPOINTS.marketing.flyerTemplates, { params }),

    get: (id: string) =>
      client.get<ApiResponse<FlyerTemplate>>(`${API_ENDPOINTS.marketing.flyerTemplates}/${id}`),

    create: (data: CreateFlyerTemplateRequest) =>
      client.post<ApiResponse<FlyerTemplate>>(API_ENDPOINTS.marketing.flyerTemplates, data),

    update: (id: string, data: UpdateFlyerTemplateRequest) =>
      client.put<ApiResponse<FlyerTemplate>>(`${API_ENDPOINTS.marketing.flyerTemplates}/${id}`, data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.marketing.flyerTemplates}/${id}`),

    addAsset: async (templateId: string, file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return client.post<ApiResponse<FlyerTemplateAsset>>(
        `${API_ENDPOINTS.marketing.flyerTemplates}/${templateId}/assets`,
        formData as unknown as Record<string, unknown>,
      );
    },

    deleteAsset: (templateId: string, assetId: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.marketing.flyerTemplates}/${templateId}/assets/${assetId}`),
  },

  flyers: {
    list: (params?: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<MarketingFlyer>>>(API_ENDPOINTS.marketing.flyers, { params }),

    get: (id: string) =>
      client.get<ApiResponse<MarketingFlyer>>(`${API_ENDPOINTS.marketing.flyers}/${id}`),

    create: (data: CreateFlyerRequest) =>
      client.post<ApiResponse<MarketingFlyer>>(API_ENDPOINTS.marketing.flyers, data),

    update: (id: string, data: UpdateFlyerRequest) =>
      client.put<ApiResponse<MarketingFlyer>>(`${API_ENDPOINTS.marketing.flyers}/${id}`, data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.marketing.flyers}/${id}`),

    upload: async (id: string, file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return client.post<ApiResponse<MarketingFlyer>>(
        `${API_ENDPOINTS.marketing.flyers}/${id}/upload`,
        formData as unknown as Record<string, unknown>,
      );
    },

    share: (data: ShareFlyerRequest) =>
      client.post<ApiResponse<{ message: string }>>(`${API_ENDPOINTS.marketing.flyers}/share`, data),
  },

  images: {
    list: (params?: {
      page?: number;
      limit?: number;
      category?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<MarketingImage>>>(API_ENDPOINTS.marketing.images, { params }),

    upload: async (data: UploadImageRequest) => {
      const formData = new FormData();
      formData.append('file', data.file);
      if (data.title) formData.append('title', data.title);
      if (data.category) formData.append('category', data.category);

      return client.post<ApiResponse<MarketingImage>>(API_ENDPOINTS.marketing.images, formData as unknown as Record<string, unknown>);
    },

    uploadLogo: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return client.post<ApiResponse<MarketingImage>>(
        `${API_ENDPOINTS.marketing.images}/upload-logo`,
        formData as unknown as Record<string, unknown>,
      );
    },

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.marketing.images}/${id}`),
  },

  socialContent: {
    list: (params?: {
      page?: number;
      limit?: number;
      platform?: string;
      status?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<SocialContent>>>(API_ENDPOINTS.marketing.socialContent, { params }),

    get: (id: string) =>
      client.get<ApiResponse<SocialContent>>(`${API_ENDPOINTS.marketing.socialContent}/${id}`),

    create: (data: CreateSocialContentRequest) =>
      client.post<ApiResponse<SocialContent>>(API_ENDPOINTS.marketing.socialContent, data),

    update: (id: string, data: Partial<CreateSocialContentRequest>) =>
      client.put<ApiResponse<SocialContent>>(`${API_ENDPOINTS.marketing.socialContent}/${id}`, data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.marketing.socialContent}/${id}`),

    generate: (data: GenerateSocialContentRequest) =>
      client.post<ApiResponse<SocialContent>>(`${API_ENDPOINTS.marketing.socialContent}/generate`, data),

    generateBatch: (data: GenerateSocialContentBatchRequest) =>
      client.post<ApiResponse<SocialContent[]>>(`${API_ENDPOINTS.marketing.socialContent}/generate-batch`, data),
  },

  suggestions: {
    list: (params?: { page?: number; limit?: number; status?: string }) =>
      client.get<ApiResponse<PaginatedResponse<MarketingSuggestion>>>('/marketing/suggestions', { params }),

    generate: () =>
      client.post<ApiResponse<MarketingSuggestion[]>>('/marketing/suggestions/generate', {}),

    accept: (id: string) =>
      client.put<ApiResponse<MarketingSuggestion>>(`/marketing/suggestions/${id}/accept`, {}),

    dismiss: (id: string) =>
      client.put<ApiResponse<MarketingSuggestion>>(`/marketing/suggestions/${id}/dismiss`, {}),
  },

  optOut: (data: OptOutRequest) =>
    client.post<ApiResponse<{ message: string }>>(API_ENDPOINTS.marketing.optOut, data),

  optedOut: {
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      channel?: string;
    }) =>
      client.get<PaginatedResponse<OptedOutContact>>(API_ENDPOINTS.marketing.optOut, {
        params,
      }),

    optOutContact: (contactId: string, data?: OptOutRequest) =>
      client.post<ApiResponse<{ message: string }>>(
        `${API_ENDPOINTS.marketing.optOut}/${contactId}`,
        data ?? {},
      ),

    resubscribe: (contactId: string) =>
      client.post<ApiResponse<{ message: string }>>(
        `${API_ENDPOINTS.marketing.optOut}/${contactId}/opt-in`,
        {},
      ),
  },

  festivals: {
    list: (params?: { page?: number; limit?: number; search?: string }) =>
      client.get<ApiResponse<PaginatedResponse<FestivalCampaign>>>(API_ENDPOINTS.marketing.festivals, { params }),

    activate: (id: string) =>
      client.put<ApiResponse<FestivalCampaign>>(`${API_ENDPOINTS.marketing.festivals}/${id}/activate`, {}),

    deactivate: (id: string) =>
      client.put<ApiResponse<FestivalCampaign>>(`${API_ENDPOINTS.marketing.festivals}/${id}/deactivate`, {}),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.marketing.festivals}/${id}`),
  },
};
