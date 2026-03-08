import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface Report {
  id: string;
  name: string;
  description?: string;
  type: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReportRequest {
  name: string;
  description?: string;
  type: string;
  config: Record<string, unknown>;
}

export interface UpdateReportRequest {
  name?: string;
  description?: string;
  type?: string;
  config?: Record<string, unknown>;
}

export const reportsApi = {
  list: (params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) =>
    client.get<ApiResponse<PaginatedResponse<Report>>>(API_ENDPOINTS.reports.list, { params }),

  getById: (id: string) =>
    client.get<ApiResponse<Report>>(API_ENDPOINTS.reports.byId(id)),

  create: (data: CreateReportRequest) =>
    client.post<ApiResponse<Report>>(API_ENDPOINTS.reports.list, data),

  update: (id: string, data: UpdateReportRequest) =>
    client.put<ApiResponse<Report>>(API_ENDPOINTS.reports.byId(id), data),

  delete: (id: string) =>
    client.delete<ApiResponse<void>>(API_ENDPOINTS.reports.byId(id)),

  export: (id: string, format?: 'pdf' | 'xlsx' | 'csv') =>
    client.get<Blob>(API_ENDPOINTS.reports.export(id), { params: { format }, responseType: 'blob' }),

  getDashboard: () =>
    client.get<ApiResponse<{
      pipeline: Array<{ status: string; count: number; total_value: number }>;
      hotLeads: Array<any>;
      followUps: { total: number; overdue: number; pending: number };
      recentActivities: Array<any>;
    }>>(API_ENDPOINTS.reports.dashboard),

  // Report-specific methods
  getSalesReport: async (params?: { dateRange?: string; startDate?: string; endDate?: string }) =>
    client.get<ApiResponse<any>>(`${API_ENDPOINTS.reports.list}/sales`, { params }),

  getLeadReport: async (params?: { dateRange?: string; startDate?: string; endDate?: string }) =>
    client.get<ApiResponse<any>>(`${API_ENDPOINTS.reports.list}/leads`, { params }),

  getFinancialReport: async (params?: { dateRange?: string; startDate?: string; endDate?: string }) =>
    client.get<ApiResponse<any>>(`${API_ENDPOINTS.reports.list}/financial`, { params }),

  getTeamReport: async (params?: { dateRange?: string; startDate?: string; endDate?: string }) =>
    client.get<ApiResponse<any>>(`${API_ENDPOINTS.reports.list}/team`, { params }),

  getCustomerReport: async (params?: { dateRange?: string; startDate?: string; endDate?: string }) =>
    client.get<ApiResponse<any>>(`${API_ENDPOINTS.reports.list}/customer`, { params }),

  getVisaReport: async (params?: { dateRange?: string; startDate?: string; endDate?: string }) =>
    client.get<ApiResponse<any>>(`${API_ENDPOINTS.reports.list}/visa`, { params }),

  getSupplierReport: async (params?: { dateRange?: string; startDate?: string; endDate?: string }) =>
    client.get<ApiResponse<any>>(`${API_ENDPOINTS.reports.list}/supplier`, { params }),

  getMarketingReport: async (params?: { dateRange?: string; startDate?: string; endDate?: string }) =>
    client.get<ApiResponse<any>>(`${API_ENDPOINTS.reports.list}/marketing`, { params }),

  getRevenueReport: async (params?: { dateRange?: string; startDate?: string; endDate?: string }) =>
    client.get<ApiResponse<any>>(`${API_ENDPOINTS.reports.list}/revenue`, { params }),

  getFleetReport: async (params?: { dateRange?: string; startDate?: string; endDate?: string }) =>
    client.get<ApiResponse<any>>(`${API_ENDPOINTS.reports.list}/fleet`, { params }),

  getOutstandingReport: async (params?: { dateRange?: string; startDate?: string; endDate?: string; contactId?: string }) =>
    client.get<ApiResponse<any>>(API_ENDPOINTS.reports.outstanding, { params }),

  getAgeingReport: async (params?: { dateRange?: string; startDate?: string; endDate?: string; contactId?: string }) =>
    client.get<ApiResponse<any>>(API_ENDPOINTS.reports.ageing, { params }),
};
