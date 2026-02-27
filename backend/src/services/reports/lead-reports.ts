import { ReportDefinition } from '../../types/report';
import { reportRegistry } from '../report-registry';

const leadReports: ReportDefinition[] = [
    {
        id: 'pipeline_summary',
        name: 'Pipeline Summary',
        category: 'leads',
        description: 'Current active leads grouped by stage/status.',
        requiredRole: ['admin', 'manager', 'salesperson'],
        allowedFilters: ['assigned_to', 'source'],
        allowedGroupBy: ['assigned_to', 'source'],
        defaultSort: { column: 'lead_count', order: 'desc' },
        baseQuery: `
      SELECT 
        status,
        COUNT(id) as lead_count,
        SUM(budget) as total_budget_potential
      FROM leads
      WHERE is_deleted = 0 AND status NOT IN ('won', 'lost') {DATE_FILTER}
      GROUP BY status
      {ORDER_BY}
    `,
        columns: [
            { name: 'status', type: 'status' },
            { name: 'lead_count', type: 'number' },
            { name: 'total_budget_potential', type: 'currency' },
        ],
    },
    {
        id: 'lead_ageing',
        name: 'Lead Ageing Report',
        category: 'leads',
        description: 'Analysis of how long leads have been sitting in the pipeline.',
        requiredRole: ['admin', 'manager'],
        allowedFilters: ['status', 'assigned_to'],
        allowedGroupBy: ['assigned_to', 'status'],
        defaultSort: { column: 'avg_days_open', order: 'desc' },
        baseQuery: `
      SELECT
        assigned_to,
        COUNT(id) as total_leads,
        AVG(CAST(julianday('now') - julianday(created_at) AS INTEGER)) as avg_days_open
      FROM leads
      WHERE is_deleted = 0 AND status NOT IN ('won', 'lost') {DATE_FILTER}
      GROUP BY assigned_to
      {ORDER_BY}
    `,
        columns: [
            { name: 'assigned_to', type: 'text' },
            { name: 'total_leads', type: 'number' },
            { name: 'avg_days_open', type: 'number' },
        ]
    },
    {
        id: 'lead_velocity',
        name: 'Lead Velocity Rate',
        category: 'leads',
        description: 'Growth in qualified leads month over month.',
        requiredRole: ['admin', 'manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'month', order: 'desc' },
        baseQuery: `
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(id) as new_leads,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as qualified_won_leads
      FROM leads
      WHERE is_deleted = 0 {DATE_FILTER}
      GROUP BY strftime('%Y-%m', created_at)
      {ORDER_BY}
    `,
        columns: [
            { name: 'month', type: 'text' },
            { name: 'new_leads', type: 'number' },
            { name: 'qualified_won_leads', type: 'number' },
        ]
    }
];

export function registerLeadReports() {
    reportRegistry.registerMany(leadReports);
}
