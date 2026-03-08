import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';
import type { User } from '@travelcrm/shared';

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  timezone?: string;
}

export const usersApi = {
  list: (params?: { page?: number; limit?: number; search?: string; role?: string; status?: string }) =>
    client.get<ApiResponse<PaginatedResponse<User>>>(API_ENDPOINTS.users.list, { params }),

  getMe: () =>
    client.get<ApiResponse<User>>(API_ENDPOINTS.users.me),

  getById: (id: string) =>
    client.get<ApiResponse<User>>(API_ENDPOINTS.users.byId(id)),

  update: (id: string, data: UpdateUserRequest) =>
    client.put<ApiResponse<User>>(API_ENDPOINTS.users.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.users.byId(id)),
};
