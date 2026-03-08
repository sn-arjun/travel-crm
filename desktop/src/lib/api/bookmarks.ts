import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface Bookmark {
  id: string;
  entityType: 'contact' | 'lead' | 'itinerary' | 'invoice' | 'task';
  entityId: string;
  entityName: string;
  createdAt: string;
}

export interface CreateBookmarkRequest {
  entityType: 'contact' | 'lead' | 'itinerary' | 'invoice' | 'task';
  entityId: string;
}

export interface CheckBookmarkRequest {
  entityType: 'contact' | 'lead' | 'itinerary' | 'invoice' | 'task';
  entityId: string;
}

export const bookmarksApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    entityType?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Bookmark>>>(API_ENDPOINTS.bookmarks.list, { params }),

  create: (data: CreateBookmarkRequest) =>
    client.post<ApiResponse<Bookmark>>(API_ENDPOINTS.bookmarks.create, data),

  check: (data: CheckBookmarkRequest) =>
    client.post<ApiResponse<{ bookmarked: boolean }>>(API_ENDPOINTS.bookmarks.check, data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.bookmarks.delete(id)),
};
