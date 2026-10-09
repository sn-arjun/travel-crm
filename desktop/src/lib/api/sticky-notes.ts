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
    // keepalive: the note is saved on blur and shown at once, so a reload straight after must not cancel the save
    client.put<ApiResponse<StickyNote>>(API_ENDPOINTS.stickyNotes.byId(id), data, { keepalive: true }),

  delete: (id: string) =>
    // keepalive for the same reason as update: the note disappears from the board before the request lands
    client.delete<ApiResponse<void>>(API_ENDPOINTS.stickyNotes.byId(id), { keepalive: true }),
};
