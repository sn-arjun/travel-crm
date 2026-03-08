import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface StickyNote {
  id: string;
  title?: string;
  content: string;
  color?: string;
  position?: {
    x: number;
    y: number;
  };
  pinned?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStickyNoteRequest {
  title?: string;
  content: string;
  color?: string;
  position?: {
    x: number;
    y: number;
  };
  pinned?: boolean;
}

export interface UpdateStickyNoteRequest {
  title?: string;
  content?: string;
  color?: string;
  position?: {
    x: number;
    y: number;
  };
  pinned?: boolean;
}

export const stickyNotesApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<StickyNote>>>(API_ENDPOINTS.stickyNotes.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<StickyNote>>(API_ENDPOINTS.stickyNotes.byId(id)),

  create: (data: CreateStickyNoteRequest) =>
    client.post<ApiResponse<StickyNote>>(API_ENDPOINTS.stickyNotes.create, data),

  update: (id: string, data: UpdateStickyNoteRequest) =>
    client.put<ApiResponse<StickyNote>>(API_ENDPOINTS.stickyNotes.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.stickyNotes.byId(id)),
};
