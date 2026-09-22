import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface MarketingSegment {
  id: string;
  name: string;
  criteria: Record<string, unknown>;
  contactCount: number;
  createdAt: string;
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

export interface SocialContent {
  id: string;
  platform: 'facebook' | 'instagram' | 'twitter' | 'linkedin';
  content: string;
  imageUrl?: string;
  scheduledFor?: string;
  status: 'draft' | 'scheduled' | 'posted';
}

export interface CreateSegmentRequest {
  name: string;
  criteria: Record<string, unknown>;
}

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
  description?: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'push' | 'social';
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
  channel: 'email' | 'sms' | 'whatsapp' | 'push' | 'social';
  subject?: string;
  content?: string;
  flyerId?: string;
  segmentId?: string;
  scheduledFor?: string;
}

export type UpdateMarketingCampaignRequest = Partial<CreateMarketingCampaignRequest>;

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
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      channel?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<MarketingCampaign>>>(CAMPAIGNS_BASE, { params }),

    get: (id: string) =>
      client.get<ApiResponse<MarketingCampaign>>(`${CAMPAIGNS_BASE}/${id}`),

    create: (data: CreateMarketingCampaignRequest) =>
      client.post<ApiResponse<MarketingCampaign>>(CAMPAIGNS_BASE, data),

    update: (id: string, data: UpdateMarketingCampaignRequest) =>
      client.put<ApiResponse<MarketingCampaign>>(`${CAMPAIGNS_BASE}/${id}`, data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${CAMPAIGNS_BASE}/${id}`),

    send: (id: string) =>
      client.post<ApiResponse<MarketingCampaign>>(`${CAMPAIGNS_BASE}/${id}/send`, {}),

    cancel: (id: string) =>
      client.post<ApiResponse<MarketingCampaign>>(`${CAMPAIGNS_BASE}/${id}/cancel`, {}),

    analytics: (id: string) =>
      client.get<ApiResponse<MarketingCampaignAnalytics>>(`${CAMPAIGNS_BASE}/${id}/analytics`),

    recipients: (id: string, params?: { page?: number; limit?: number; status?: string }) =>
      client.get<ApiResponse<PaginatedResponse<MarketingCampaignRecipient>>>(
        `${CAMPAIGNS_BASE}/${id}/recipients`,
        { params },
      ),
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

    create: (data: CreateSegmentRequest) =>
      client.post<ApiResponse<MarketingSegment>>(API_ENDPOINTS.marketing.segments, data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.marketing.segments}/${id}`),
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

    create: (data: CreateFlyerRequest) =>
      client.post<ApiResponse<MarketingFlyer>>(API_ENDPOINTS.marketing.flyers, data),

    update: (id: string, data: UpdateFlyerRequest) =>
      client.put<ApiResponse<MarketingFlyer>>(`${API_ENDPOINTS.marketing.flyers}/${id}`, data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.marketing.flyers}/${id}`),
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

    create: (data: CreateSocialContentRequest) =>
      client.post<ApiResponse<SocialContent>>(API_ENDPOINTS.marketing.socialContent, data),

    update: (id: string, data: Partial<CreateSocialContentRequest>) =>
      client.put<ApiResponse<SocialContent>>(`${API_ENDPOINTS.marketing.socialContent}/${id}`, data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`${API_ENDPOINTS.marketing.socialContent}/${id}`),
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
      client.get<ApiResponse<PaginatedResponse<OptedOutContact>>>('/contacts', {
        params: { ...params, opted_out: true },
      }),

    resubscribe: (contactId: string) =>
      client.put<ApiResponse<{ message: string }>>(`/contacts/${contactId}`, {
        optedOut: 0,
        optedOutAt: null,
        optOutChannel: null,
        optOutReason: null,
      }),
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
