export interface ReportColumn {
    name: string;
    type: 'string' | 'text' | 'number' | 'currency' | 'date' | 'percentage' | 'status' | 'boolean';
    sortable?: boolean;
    drillDown?: {
        reportId: string;
        paramsMapping: Record<string, string>; // Maps target param name -> source column name
    };
}

export interface ReportResult {
    data: Record<string, any>[];
    columns: ReportColumn[];
    meta: {
        total: number;
        page: number;
        per_page: number;
    };
    previous_period?: Record<string, any>;
    changes?: Record<string, any>;
    cached_at?: string;
}

export interface ReportParams {
    date_from?: string;
    date_to?: string;
    date_column?: string;
    group_by?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    page?: number;
    per_page?: number;
    compare?: string; // e.g. 'true'
    // Support for arbitrary dynamic filters
    [key: string]: any;
}

export interface DrillDownConfig {
    field: string;
    entityType: string;
    query: string;
    columns: string[];
}

export interface ReportDefinition {
    id: string;
    name: string;
    category: 'sales' | 'leads' | 'financial' | 'team' | 'customer' | 'visa' | 'supplier' | 'fleet' | 'marketing';
    description: string;
    baseQuery: string;
    allowedFilters: string[];
    allowedGroupBy: string[];
    defaultSort: { column: string; order: 'asc' | 'desc' };
    requiredRole: string[];
    columns: ReportColumn[];
    dateColumn?: string; // Qualified column for date filtering (e.g. 's.created_at')
    drillDown?: DrillDownConfig[];
}
