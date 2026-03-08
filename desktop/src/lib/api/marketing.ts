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

export const marketingApi = {
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
};
