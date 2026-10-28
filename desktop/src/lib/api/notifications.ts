import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import { camelizeKeys, unwrapList } from './envelope';

// Notification type not in shared package, define locally
export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  readAt?: string;
  actionUrl?: string;
  referenceType?: string;
  referenceId?: string;
  icon?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationData {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
  icon?: string;
}

export interface UnreadCount {
  total: number;
  byType?: Record<string, number>;
}

export interface BadgeCounts {
  notifications: number;
  tasks: number;
  followUps: number;
  messages: number;
}

/**
 * Notification rows come back with a mix of snake_case (reference_type, is_read)
 * and camelCase; this maps them onto the Notification contract.
 */
export function normalizeNotification(raw: unknown): Notification {
  const n = camelizeKeys<Record<string, unknown>>(raw) ?? {};
  const { isRead, body, ...rest } = n as Record<string, unknown>;
  const read = typeof rest.read === 'boolean' ? rest.read : isRead === true || isRead === 1 || isRead === '1';
  return {
    ...rest,
    message: (rest.message ?? body ?? '') as string,
    read,
  } as unknown as Notification;
}

export const notificationsApi = {
  list: async (params?: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
    type?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<PaginatedResponse<Notification>> => {
    const res = await client.get<unknown>(API_ENDPOINTS.notifications.list, { params });
    const list = unwrapList<unknown>(res, { page: params?.page, limit: params?.limit });
    return { ...list, data: list.data.map(normalizeNotification) };
  },

  getUnreadCount: () =>
    client.get<ApiResponse<UnreadCount>>(API_ENDPOINTS.notifications.unreadCount),

  markAllAsRead: () =>
    client.post<ApiResponse<{ updated: number }>>(API_ENDPOINTS.notifications.readAll),

  markAsRead: (id: string) =>
    client.post<ApiResponse<Notification>>(API_ENDPOINTS.notifications.read(id)),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.notifications.delete(id)),

  getBadgeCounts: () =>
    client.get<ApiResponse<BadgeCounts>>(API_ENDPOINTS.notifications.badgeCounts),

  announce: (data: { title: string; body: string; targetRole?: string; userIds?: string[] }) =>
    client.post<ApiResponse<{ sent: number }>>(API_ENDPOINTS.notifications.announce, data),
};
