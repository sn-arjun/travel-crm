import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import { unwrapList } from './envelope';
import type { User } from '@travelcrm/shared';

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  timezone?: string;
}

export interface InviteUserRequest {
  email: string;
  name: string;
  role: 'admin' | 'sales_manager' | 'salesperson' | 'operations' | 'accountant' | 'view_only';
  phone?: string;
  department?: string;
}

export interface InviteUserResponse {
  inviteToken: string;
  inviteUrl: string;
  email: string;
  role: string;
}

export interface LoginHistoryEntry {
  id: string;
  userId: string;
  createdAt: string;
  ipAddress?: string;
  browser?: string;
  os?: string;
  device?: string;
  status: 'success' | 'failed' | 'locked';
  country?: string;
  city?: string;
  failureReason?: string;
}

export interface ActivityLogEntry {
  id: string;
  userId: string;
  userName?: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  details?: string;
  ipAddress?: string;
  createdAt: string;
}

function userMatches(
  u: User,
  { search, role, status }: { search?: string; role?: string; status?: string },
): boolean {
  const term = search?.trim().toLowerCase();
  if (term) {
    const haystack = [u.name, u.email, u.role].map((v) => String(v ?? '').toLowerCase());
    if (!haystack.some((v) => v.includes(term))) return false;
  }
  if (role && u.role !== role) return false;
  if (status) {
    const row = u as unknown as { isActive?: boolean | number; inviteStatus?: string };
    const active = row.isActive !== false && row.isActive !== 0;
    if (status === 'active') return active;
    if (status === 'inactive') return !active;
    return row.inviteStatus === status;
  }
  return true;
}

export const usersApi = {
  /**
   * GET /users returns every user and ignores paging and filters, so search, role,
   * status and pagination are applied here. Always resolves to a PaginatedResponse.
   */
  list: async (params?: { page?: number; limit?: number; search?: string; role?: string; status?: string }): Promise<PaginatedResponse<User>> => {
    const res = await client.get<unknown>(API_ENDPOINTS.users.list, { params });
    return unwrapList<User>(res, {
      page: params?.page ?? (params?.limit ? 1 : undefined),
      limit: params?.limit,
      clientPaginate: true,
      filter: (u) => userMatches(u, params ?? {}),
    });
  },

  getMe: () =>
    client.get<ApiResponse<User>>(API_ENDPOINTS.users.me),

  getById: (id: string) =>
    client.get<ApiResponse<User>>(API_ENDPOINTS.users.byId(id)),

  update: (id: string, data: UpdateUserRequest) =>
    client.put<ApiResponse<User>>(API_ENDPOINTS.users.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.users.byId(id)),

  invite: (data: InviteUserRequest) =>
    client.post<ApiResponse<InviteUserResponse>>(API_ENDPOINTS.users.list, data),

  activate: (id: string) =>
    client.put<ApiResponse<{ message: string }>>(`${API_ENDPOINTS.users.byId(id)}/activate`, {}),

  deactivate: (id: string) =>
    client.put<ApiResponse<{ message: string }>>(`${API_ENDPOINTS.users.byId(id)}/deactivate`, {}),

  unlock: (id: string) =>
    client.post<ApiResponse<{ message: string }>>(`${API_ENDPOINTS.users.byId(id)}/unlock`, {}),

  /** Admin only: turn off a user's two-factor sign-in (lost phone, no recovery codes). They are signed out everywhere and emailed. */
  resetTwoFactor: (id: string) =>
    client.post<ApiResponse<{ message: string }>>(`${API_ENDPOINTS.users.byId(id)}/two-factor/reset`, {}),

  getLoginHistory: (id: string) =>
    client.get<ApiResponse<LoginHistoryEntry[]>>(`${API_ENDPOINTS.users.byId(id)}/login-history`),

  getMyLoginHistory: () =>
    client.get<ApiResponse<LoginHistoryEntry[]>>(`${API_ENDPOINTS.users.me}/login-history`),

  getSignature: () =>
    client.get<ApiResponse<{ signature: string }>>(`${API_ENDPOINTS.users.me}/signature`),

  updateSignature: (signature: string) =>
    client.put<ApiResponse<{ signature: string }>>(`${API_ENDPOINTS.users.me}/signature`, { signature }),
};

export const activityLogsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    action?: string;
    entityType?: string;
    userId?: string;
  }) =>
    client.get<ApiResponse<PaginatedResponse<ActivityLogEntry>>>('/activity-logs', { params }),

  byUser: (id: string, params?: { limit?: number }) =>
    client.get<ApiResponse<ActivityLogEntry[]>>(`/activity-logs/user/${id}`, { params }),

  byEntity: (type: string, id: string, params?: { limit?: number }) =>
    client.get<ApiResponse<ActivityLogEntry[]>>(`/activity-logs/entity/${type}/${id}`, { params }),
};
