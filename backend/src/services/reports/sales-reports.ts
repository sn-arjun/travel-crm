import { ReportDefinition } from '../../types/report';
import { reportRegistry } from '../report-registry';

const salesReports: ReportDefinition[] = [
    {
        id: 'sales_summary',
        name: 'Sales Summary',
        category: 'sales',
        description: 'High level summary of sales performance and conversion rates.',
        requiredRole: ['admin', 'sales_manager', 'salesperson'],
        allowedFilters: ['status', 'priority'],
        allowedGroupBy: ['assigned_to', 'status', 'created_by'],
        defaultSort: { column: 'total_leads', order: 'desc' },
        baseQuery: `
      SELECT
        assigned_to,
        COUNT(id) as total_leads,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_leads,
        SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost_leads,
        COALESCE(SUM(CASE WHEN status = 'won' THEN budget ELSE 0 END), 0) as total_revenue,
        COALESCE(AVG(CASE WHEN status = 'won' THEN budget END), 0) as avg_deal_size,
        COALESCE(SUM(CASE WHEN status = 'won' THEN 1.0 ELSE 0.0 END) / NULLIF(COUNT(id), 0) * 100, 0) as conversion_rate
      FROM leads
      WHERE is_deleted = 0 {DATE_FILTER}
      GROUP BY assigned_to
      {ORDER_BY}
    `,
        columns: [
            { name: 'assigned_to', type: 'text' },
            { name: 'total_leads', type: 'number' },
            { name: 'won_leads', type: 'number' },
            { name: 'lost_leads', type: 'number' },
            { name: 'total_revenue', type: 'currency' },
            { name: 'avg_deal_size', type: 'currency' },
            { name: 'conversion_rate', type: 'percentage' },
        ],
    },
    {
        id: 'sales_by_destination',
        name: 'Sales By Destination',
        category: 'sales',
        description: 'Total won sales broken down by travel destination.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'lead_count', order: 'desc' },
        baseQuery: `
      SELECT
        destination,
        COUNT(id) as lead_count,
        COALESCE(SUM(budget), 0) as total_revenue
      FROM leads
      WHERE is_deleted = 0 AND status = 'won' {DATE_FILTER}
      GROUP BY destination
      {ORDER_BY}
    `,
        columns: [
            { name: 'destination', type: 'text' },
            { name: 'lead_count', type: 'number' },
            { name: 'total_revenue', type: 'currency' },
        ]
    },
    {
        id: 'sales_by_salesperson',
        name: 'Sales By Salesperson',
        category: 'sales',
        description: 'Revenue and conversion rates broken down by salesperson.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: ['assigned_to'],
        allowedGroupBy: [],
        defaultSort: { column: 'total_revenue', order: 'desc' },
        baseQuery: `
      SELECT
        assigned_to as salesperson,
        COUNT(id) as total_leads,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_deals,
        SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost_deals,
        COALESCE(SUM(CASE WHEN status = 'won' THEN budget ELSE 0 END), 0) as total_revenue,
        COALESCE(AVG(CASE WHEN status = 'won' THEN budget END), 0) as avg_deal_size,
        COALESCE(SUM(CASE WHEN status = 'won' THEN 1.0 ELSE 0.0 END) / NULLIF(COUNT(id), 0) * 100, 0) as conversion_rate
      FROM leads
      WHERE is_deleted = 0 {DATE_FILTER}
      GROUP BY assigned_to
      {ORDER_BY}
    `,
        columns: [
            { name: 'salesperson', type: 'text' },
            { name: 'total_leads', type: 'number' },
            { name: 'won_deals', type: 'number' },
            { name: 'lost_deals', type: 'number' },
            { name: 'total_revenue', type: 'currency' },
            { name: 'avg_deal_size', type: 'currency' },
            { name: 'conversion_rate', type: 'percentage' },
        ],
    },
    {
        id: 'sales_by_trip_type',
        name: 'Sales By Trip Type',
        category: 'sales',
        description: 'Revenue and bookings broken down by trip type.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'total_revenue', order: 'desc' },
        baseQuery: `
      SELECT
        trip_type,
        COUNT(id) as bookings,
        COALESCE(SUM(CASE WHEN status = 'won' THEN budget ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'won' THEN 1.0 ELSE 0.0 END) / NULLIF(COUNT(id), 0) * 100, 0) as conversion_rate
      FROM leads
      WHERE is_deleted = 0 {DATE_FILTER}
      GROUP BY trip_type
      {ORDER_BY}
    `,
        columns: [
            { name: 'trip_type', type: 'text' },
            { name: 'bookings', type: 'number' },
            { name: 'total_revenue', type: 'currency' },
            { name: 'conversion_rate', type: 'percentage' },
        ],
    },
    {
        id: 'win_loss_analysis',
        name: 'Win/Loss Analysis',
        category: 'sales',
        description: 'Breakdown of won vs lost leads and reasons for loss.',
        requiredRole: ['admin', 'sales_manager', 'salesperson'],
        allowedFilters: ['assigned_to'],
        allowedGroupBy: [],
        defaultSort: { column: 'count', order: 'desc' },
        baseQuery: `
      SELECT
        status,
        lost_reason,
        COUNT(id) as count,
        COALESCE(SUM(budget), 0) as total_value
      FROM leads
      WHERE is_deleted = 0 AND status IN ('won', 'lost') {DATE_FILTER}
      GROUP BY status, lost_reason
      {ORDER_BY}
    `,
        columns: [
            { name: 'status', type: 'status' },
            { name: 'lost_reason', type: 'text' },
            { name: 'count', type: 'number' },
            { name: 'total_value', type: 'currency' },
        ]
    },
    {
        id: 'sales_by_source',
        name: 'Sales by Lead Source',
        category: 'sales',
        description: 'Lead generation and conversion by source.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'total_leads', order: 'desc' },
        baseQuery: `
      SELECT
        source,
        COUNT(id) as total_leads,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_leads,
        COALESCE(SUM(CASE WHEN status = 'won' THEN budget ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'won' THEN 1.0 ELSE 0.0 END) / NULLIF(COUNT(id), 0) * 100, 0) as conversion_rate
      FROM leads
      WHERE is_deleted = 0 {DATE_FILTER}
      GROUP BY source
      {ORDER_BY}
    `,
        columns: [
            { name: 'source', type: 'text' },
            { name: 'total_leads', type: 'number' },
            { name: 'won_leads', type: 'number' },
            { name: 'total_revenue', type: 'currency' },
            { name: 'conversion_rate', type: 'percentage' },
        ]
    },
    {
        id: 'avg_deal_size',
        name: 'Average Deal Size Trend',
        category: 'sales',
        description: 'Monthly trend of average deal size for won leads.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'month', order: 'asc' },
        baseQuery: `
      SELECT
        strftime('%Y-%m', created_at, '{TZ}') as month,
        COUNT(id) as won_deals,
        COALESCE(AVG(budget), 0) as avg_deal_size,
        COALESCE(SUM(budget), 0) as total_revenue
      FROM leads
      WHERE is_deleted = 0 AND status = 'won' {DATE_FILTER}
      GROUP BY strftime('%Y-%m', created_at, '{TZ}')
      {ORDER_BY}
    `,
        columns: [
            { name: 'month', type: 'text' },
            { name: 'won_deals', type: 'number' },
            { name: 'avg_deal_size', type: 'currency' },
            { name: 'total_revenue', type: 'currency' },
        ],
    },
    {
        id: 'revenue_forecast',
        name: 'Revenue Forecast',
        category: 'sales',
        description: 'Pipeline value and projected revenue from active leads.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: ['priority'],
        allowedGroupBy: ['assigned_to'],
        defaultSort: { column: 'pipeline_value', order: 'desc' },
        baseQuery: `
      SELECT
        strftime('%Y-%m', travel_date) as expected_close_month,
        COUNT(id) as active_leads,
        COALESCE(SUM(budget), 0) as pipeline_value,
        COALESCE(SUM(budget) * 0.3, 0) as projected_revenue
      FROM leads
      WHERE is_deleted = 0 AND status NOT IN ('won', 'lost') AND travel_date IS NOT NULL {DATE_FILTER}
      GROUP BY strftime('%Y-%m', travel_date)
      {ORDER_BY}
    `,
        columns: [
            { name: 'expected_close_month', type: 'text' },
            { name: 'active_leads', type: 'number' },
            { name: 'pipeline_value', type: 'currency' },
            { name: 'projected_revenue', type: 'currency' },
        ],
    },
    {
        id: 'conversion_rate',
        name: 'Conversion Rate Analysis',
        category: 'sales',
        description: 'Monthly conversion rate trends.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'month', order: 'asc' },
        baseQuery: `
      SELECT
        strftime('%Y-%m', created_at, '{TZ}') as month,
        COUNT(id) as total_leads,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_leads,
        COALESCE(SUM(CASE WHEN status = 'won' THEN 1.0 ELSE 0.0 END) / NULLIF(COUNT(id), 0) * 100, 0) as conversion_rate
      FROM leads
      WHERE is_deleted = 0 {DATE_FILTER}
      GROUP BY strftime('%Y-%m', created_at, '{TZ}')
      {ORDER_BY}
    `,
        columns: [
            { name: 'month', type: 'text' },
            { name: 'total_leads', type: 'number' },
            { name: 'won_leads', type: 'number' },
            { name: 'conversion_rate', type: 'percentage' },
        ],
    },
    {
        id: 'monthly_comparison',
        name: 'Monthly Sales Comparison',
        category: 'sales',
        description: 'Side-by-side comparison of monthly sales across years.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'month_num ASC, year', order: 'asc' },
        baseQuery: `
      SELECT
        strftime('%m', created_at, '{TZ}') as month_num,
        strftime('%Y', created_at, '{TZ}') as year,
        COUNT(id) as total_leads,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_leads,
        COALESCE(SUM(CASE WHEN status = 'won' THEN budget ELSE 0 END), 0) as total_revenue
      FROM leads
      WHERE is_deleted = 0 {DATE_FILTER}
      GROUP BY strftime('%Y-%m', created_at, '{TZ}')
      {ORDER_BY}
    `,
        columns: [
            { name: 'month_num', type: 'text' },
            { name: 'year', type: 'text' },
            { name: 'total_leads', type: 'number' },
            { name: 'won_leads', type: 'number' },
            { name: 'total_revenue', type: 'currency' },
        ],
    },
];

export function registerSalesReports() {
    reportRegistry.registerMany(salesReports);
}
