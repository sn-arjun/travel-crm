import { ReportDefinition } from '../../types/report';
import { reportRegistry } from '../report-registry';

const marketingReports: ReportDefinition[] = [
    {
        id: 'campaign_performance',
        name: 'Campaign Performance',
        category: 'marketing',
        description: 'Leads generated and won per marketing campaign.',
        requiredRole: ['admin', 'manager', 'salesperson'],
        allowedFilters: ['source'],
        allowedGroupBy: ['source', 'assigned_to'],
        defaultSort: { column: 'total_leads', order: 'desc' },
        baseQuery: `
      SELECT 
        source as campaign_name,
        COUNT(id) as total_leads,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_leads,
        SUM(budget) as total_pipeline_value
      FROM leads
      WHERE is_deleted = 0 {DATE_FILTER}
      GROUP BY source
      {ORDER_BY}
    `,
        columns: [
            { name: 'campaign_name', type: 'text' },
            { name: 'total_leads', type: 'number' },
            { name: 'won_leads', type: 'number' },
            { name: 'total_pipeline_value', type: 'currency' },
        ],
    },
];

export function registerMarketingReports() {
    reportRegistry.registerMany(marketingReports);
}
