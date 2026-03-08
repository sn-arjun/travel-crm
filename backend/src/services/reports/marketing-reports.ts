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
        SUM(budget) as total_pipeline_value,
        COALESCE(SUM(CASE WHEN status = 'won' THEN 1.0 ELSE 0.0 END) / NULLIF(COUNT(id), 0) * 100, 0) as conversion_rate
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
            { name: 'conversion_rate', type: 'percentage' },
        ],
    },
    {
        id: 'lead_source_roi',
        name: 'Lead Source ROI',
        category: 'marketing',
        description: 'Return on investment per lead source channel.',
        requiredRole: ['admin', 'manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'total_revenue', order: 'desc' },
        baseQuery: `
      SELECT
        source,
        COUNT(id) as total_leads,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_leads,
        COALESCE(SUM(CASE WHEN status = 'won' THEN budget ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'won' THEN 1.0 ELSE 0.0 END) / NULLIF(COUNT(id), 0) * 100, 0) as conversion_rate,
        COALESCE(SUM(CASE WHEN status = 'won' THEN budget ELSE 0 END) / NULLIF(COUNT(id), 0), 0) as revenue_per_lead
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
            { name: 'revenue_per_lead', type: 'currency' },
        ],
    },
    {
        id: 'bulk_message_delivery',
        name: 'Bulk Message Delivery',
        category: 'marketing',
        description: 'Delivery and engagement stats for bulk campaigns.',
        requiredRole: ['admin', 'manager'],
        allowedFilters: ['status', 'channel'],
        allowedGroupBy: ['channel', 'status'],
        defaultSort: { column: 'sent_count', order: 'desc' },
        baseQuery: `
      SELECT
        channel,
        status,
        COUNT(id) as sent_count,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1.0 ELSE 0.0 END) / NULLIF(COUNT(id), 0) * 100, 0) as delivery_rate
      FROM communication_logs
      WHERE campaign_id IS NOT NULL {DATE_FILTER}
      GROUP BY channel, status
      {ORDER_BY}
    `,
        columns: [
            { name: 'channel', type: 'text' },
            { name: 'status', type: 'status' },
            { name: 'sent_count', type: 'number' },
            { name: 'delivered_count', type: 'number' },
            { name: 'failed_count', type: 'number' },
            { name: 'delivery_rate', type: 'percentage' },
        ],
    },
];

export function registerMarketingReports() {
    reportRegistry.registerMany(marketingReports);
}
