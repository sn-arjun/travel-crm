import { client, type ApiResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface HsnCode {
  code: string;
  description: string;
  category?: string;
  isCustom?: boolean;
}

export const hsnCodesApi = {
  list: (params?: { search?: string }) =>
    client.get<ApiResponse<HsnCode[]>>(API_ENDPOINTS.hsnCodes.list, { params }),

  create: (data: { code: string; description: string; category?: string }) =>
    client.post<ApiResponse<HsnCode>>(API_ENDPOINTS.hsnCodes.create, data),
};
