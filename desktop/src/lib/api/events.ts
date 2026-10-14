import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export type EventType =
  | 'trip_departure'
  | 'trip_return'
  | 'meeting'
  | 'follow_up'
  | 'deadline'
  | 'reminder'
  | 'holiday'
  | 'call'
  | 'other';

// CalendarEvent type not in shared package, define locally
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  event_type: EventType;
  type?: EventType; // alias used by UI
  startTime?: string;
  endTime?: string;
  start_at?: string;
  end_at?: string;
  all_day?: boolean;
  location?: string;
  color?: string;
  recurrence_rule?: string | null;
  recurrence_parent_id?: string | null;
  related_lead_id?: string | null;
  leadId?: string | null;
  lead_title?: string | null;
  related_task_id?: string | null;
  assigned_to?: string | null;
  assignee_name?: string | null;
  created_by: string;
  createdBy?: string;
  timezone?: string;
  is_recurring?: boolean;
  attendees?: string[];
  customFields?: Record<string, unknown>;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

/**
 * The API stores flags as 0/1 (SQLite). Turn them into real booleans so JSX such as an
 * all-day check can never print a stray "0".
 */
export function normalizeEventFlags<T extends object>(
  e: T & { all_day?: unknown; is_recurring?: unknown },
): Omit<T, 'all_day' | 'is_recurring'> & { all_day: boolean; is_recurring: boolean } {
  return { ...e, all_day: Boolean(e.all_day), is_recurring: Boolean(e.is_recurring) };
}

export interface CreateEventRequest {
  title: string;
  description?: string;
  event_type?: EventType;
  type?: EventType;
  startTime?: string;
  start_at?: string;
  endTime?: string;
  end_at?: string;
  all_day?: boolean;
  location?: string;
  color?: string;
  recurrence_rule?: string;
  related_lead_id?: string;
  assigned_to?: string;
  timezone?: string;
}

export interface UpdateEventRequest {
  title?: string;
  description?: string;
  event_type?: EventType;
  start_at?: string;
  end_at?: string;
  all_day?: boolean;
  location?: string;
  color?: string;
  recurrence_rule?: string;
  related_lead_id?: string;
  assigned_to?: string;
  timezone?: string;
  update_scope?: 'this' | 'this_and_future' | 'all';
}

export interface RescheduleEventRequest {
  start_at: string;
  end_at?: string;
}

export const eventsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    event_type?: string;
    related_lead_id?: string;
    start_date?: string;
    end_date?: string;
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
      event_type: data.event_type || data.type || 'meeting',
      start_at: data.start_at || data.startTime,
      end_at: data.end_at || data.endTime,
      all_day: data.all_day,
      location: data.location,
      color: data.color,
      recurrence_rule: data.recurrence_rule,
      related_lead_id: data.related_lead_id,
      assigned_to: data.assigned_to,
      timezone: data.timezone,
    }),

  update: (id: string, data: UpdateEventRequest) =>
    client.put<ApiResponse<CalendarEvent>>(API_ENDPOINTS.events.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.events.byId(id)),

  reschedule: (id: string, data: RescheduleEventRequest) =>
    client.patch<ApiResponse<CalendarEvent>>(API_ENDPOINTS.events.reschedule(id), data),
};
