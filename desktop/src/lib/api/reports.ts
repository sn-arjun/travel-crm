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

export interface ReportExecuteParams {
  date_from?: string;
  date_to?: string;
  date_preset?: string;
  group_by?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
  compare?: boolean;
  [key: string]: string | number | boolean | undefined;
}

export interface ReportResult {
  data: Record<string, any>[];
  columns: Array<{ name: string; type: string }>;
  meta: { total: number; page: number; per_page: number };
  previous_period?: Record<string, any> | Record<string, Record<string, any>>;
  cached_at?: string;
}

// Map frontend date range labels to backend date_preset values
export function mapDateRangeToPreset(range: string): { date_preset?: string } {
  const map: Record<string, string> = {
    '7days': 'this_week',
    '30days': 'this_month',
    '90days': 'this_quarter',
    'thisMonth': 'this_month',
    'lastMonth': 'last_month',
    'thisQuarter': 'this_quarter',
    'thisYear': 'this_year',
    'lastYear': 'last_year',
  };
  if (map[range]) return { date_preset: map[range] };
  return {};
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

  // Execute a report from the report engine registry
  execute: (reportId: string, params?: ReportExecuteParams) => {
    const queryParams: Record<string, any> = { ...params };
    if (params?.compare) queryParams.compare = 'true';
    return client.get<ApiResponse<ReportResult>>(
      API_ENDPOINTS.reports.byId(reportId),
      { params: queryParams }
    );
  },

  export: (id: string, format?: 'pdf' | 'excel', params?: ReportExecuteParams) =>
    client.get<Blob>(API_ENDPOINTS.reports.export(id), {
      params: { format, ...params },
      responseType: 'blob',
    }),

  getDashboard: () =>
    client.get<ApiResponse<{
      pipeline: Array<{ status: string; count: number; total_value: number }>;
      hotLeads: Array<any>;
      followUps: { total: number; overdue: number; pending: number };
      recentActivities: Array<any>;
      financial: {
        revenueThisMonth: number;
        outstanding: number;
        overdue: number;
        invoicedThisMonth: number;
        collectionsThisMonth: number;
      };
    }>>(API_ENDPOINTS.reports.dashboard),

  getOutstandingReport: (params?: { date_from?: string; date_to?: string }) =>
    client.get<ApiResponse<any>>(API_ENDPOINTS.reports.outstanding, { params }),

  getAgeingReport: (params?: { date_from?: string; date_to?: string }) =>
    client.get<ApiResponse<any>>(API_ENDPOINTS.reports.ageing, { params }),

  invalidateCache: (reportId?: string) =>
    reportId
      ? client.delete<ApiResponse<void>>(`${API_ENDPOINTS.reports.list}/${reportId}/cache`)
      : client.delete<ApiResponse<void>>(`${API_ENDPOINTS.reports.list}/cache`),
};
