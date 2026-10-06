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

/** One cell of a report row as the report engine returns it. */
export type ReportCell = string | number | boolean | null;

/** Loose row shape for callers that have no typed row interface. */
export type ReportRow = Record<string, ReportCell>;

export interface ReportColumn {
  name: string;
  type: string;
  label?: string;
}

export interface ReportMeta {
  /** Real row count for the whole report (not just this page). */
  total: number;
  page: number;
  per_page: number;
  /** True when more rows exist beyond this page. */
  hasMore?: boolean;
}

export interface ReportResult<T = ReportRow> {
  data: T[];
  columns: ReportColumn[];
  meta: ReportMeta;
  /** Ungrouped reports: one row. Grouped reports: rows keyed by the group value. */
  /** Full previous-period rows (same shape as `data`); present when `compare=true`. */
  previous_period_rows?: T[];
  previous_period?: Record<string, ReportCell | Record<string, ReportCell>>;
  cached_at?: string;
}

export interface DashboardPipelineRow {
  status: string;
  count: number;
  total_value: number;
}

export interface DashboardHotLead {
  id: string;
  title: string;
  destination?: string | null;
  budget?: number | null;
  status: string;
  priority?: string;
  createdAt: string;
  contactId?: string | null;
  travelDate?: string | null;
}

export interface DashboardActivity {
  id: string;
  leadId: string;
  type: string;
  description?: string | null;
  createdAt: string;
  createdBy?: string | null;
}

export interface DashboardResponse {
  pipeline: DashboardPipelineRow[];
  hotLeads: DashboardHotLead[];
  followUps: { total: number; overdue: number; pending: number };
  recentActivities: DashboardActivity[];
  financial: {
    revenueThisMonth: number;
    outstanding: number;
    overdue: number;
    invoicedThisMonth: number;
    collectionsThisMonth: number;
  };
}

export interface OutstandingInvoice {
  id: string;
  invoice_number: string;
  total: number;
  balance_due: number;
  due_date: string;
  contact_name: string | null;
}

export interface OutstandingResponse {
  totalReceivable: number;
  overdueReceivable: number;
  ageing: { current: number; days30: number; days60: number; days90Plus: number };
  topOverdueInvoices: OutstandingInvoice[];
}

export interface AgeingRow {
  contact_id: string;
  contact_name: string;
  total_outstanding: number;
  current_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
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

  /**
   * Execute a report from the report engine registry. `T` is the row shape of
   * that report, so pages read `unwrapReport<T>(res).data` without casting.
   */
  execute: <T = ReportRow>(reportId: string, params?: ReportExecuteParams) => {
    const queryParams: Record<string, string | number | boolean | undefined> = { ...params };
    if (params?.compare) queryParams.compare = 'true';
    return client.get<ApiResponse<ReportResult<T>>>(
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
    client.get<ApiResponse<DashboardResponse>>(API_ENDPOINTS.reports.dashboard),

  getOutstandingReport: (params?: { date_from?: string; date_to?: string }) =>
    client.get<ApiResponse<OutstandingResponse>>(API_ENDPOINTS.reports.outstanding, { params }),

  getAgeingReport: (params?: { date_from?: string; date_to?: string }) =>
    client.get<ApiResponse<AgeingRow[]>>(API_ENDPOINTS.reports.ageing, { params }),

  invalidateCache: (reportId?: string) =>
    reportId
      ? client.delete<ApiResponse<void>>(`${API_ENDPOINTS.reports.list}/${reportId}/cache`)
      : client.delete<ApiResponse<void>>(`${API_ENDPOINTS.reports.list}/cache`),
};
