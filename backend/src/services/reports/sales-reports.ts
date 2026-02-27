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
        // In our system destination is often JSON in leads, but let's assume standard extraction 
        // or string matching for simplicity in this report.
        // If it's a JSON string like ["Dubai"], doing GROUP BY on the raw string is okay for high level.
        defaultSort: { column: 'lead_count', order: 'desc' },
        baseQuery: `
      SELECT 
        destination,
        COUNT(id) as lead_count
      FROM leads
      WHERE is_deleted = 0 AND status = 'won' {DATE_FILTER}
      GROUP BY destination
      {ORDER_BY}
    `,
        columns: [
            { name: 'destination', type: 'text' },
            { name: 'lead_count', type: 'number' },
        ]
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
        COUNT(id) as count
      FROM leads
      WHERE is_deleted = 0 AND status IN ('won', 'lost') {DATE_FILTER}
      GROUP BY status
      {ORDER_BY}
    `,
        columns: [
            { name: 'status', type: 'status' },
            { name: 'count', type: 'number' },
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
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_leads
      FROM leads
      WHERE is_deleted = 0 {DATE_FILTER}
      GROUP BY source
      {ORDER_BY}
    `,
        columns: [
            { name: 'source', type: 'text' },
            { name: 'total_leads', type: 'number' },
            { name: 'won_leads', type: 'number' },
        ]
    }
];

export function registerSalesReports() {
    reportRegistry.registerMany(salesReports);
}
