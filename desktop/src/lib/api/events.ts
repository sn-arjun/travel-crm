import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

// CalendarEvent type not in shared package, define locally
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendees: string[];
  leadId?: string;
  type: 'meeting' | 'call' | 'task' | 'other';
  status?: 'scheduled' | 'completed' | 'cancelled';
  customFields?: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventRequest {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendees?: string[];
  leadId?: string;
  type?: 'meeting' | 'call' | 'task' | 'other';
  customFields?: Record<string, unknown>;
}

export interface UpdateEventRequest {
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  attendees?: string[];
  type?: 'meeting' | 'call' | 'task' | 'other';
  customFields?: Record<string, unknown>;
}

export interface RescheduleEventRequest {
  startTime: string;
  endTime: string;
  reason?: string;
  notifyAttendees?: boolean;
}

export const eventsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    leadId?: string;
    start_date?: string;
    end_date?: string;
    event_type?: string;
    assigned_to?: string;
    view?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<CalendarEvent>>>(API_ENDPOINTS.events.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<CalendarEvent>>(API_ENDPOINTS.events.byId(id)),

  create: (data: CreateEventRequest) =>
    client.post<ApiResponse<CalendarEvent>>(API_ENDPOINTS.events.create, {
      title: data.title,
      description: data.description,
      event_type: data.type || 'meeting',
      start_at: data.startTime,
      end_at: data.endTime,
      location: data.location,
    }),

  update: (id: string, data: UpdateEventRequest) =>
    client.put<ApiResponse<CalendarEvent>>(API_ENDPOINTS.events.byId(id), {
      title: data.title,
      description: data.description,
      event_type: data.type,
      start_at: data.startTime,
      end_at: data.endTime,
      location: data.location,
    }),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.events.byId(id)),

  reschedule: (id: string, data: RescheduleEventRequest) =>
    client.post<ApiResponse<CalendarEvent>>(API_ENDPOINTS.events.reschedule(id), data),
};
