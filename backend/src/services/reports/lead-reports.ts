import { ReportDefinition } from '../../types/report';
import { reportRegistry } from '../report-registry';

const leadReports: ReportDefinition[] = [
    {
        id: 'pipeline_summary',
        name: 'Pipeline Summary',
        category: 'leads',
        description: 'Current active leads grouped by stage/status.',
        requiredRole: ['admin', 'sales_manager', 'salesperson'],
        allowedFilters: ['assigned_to', 'source'],
        allowedGroupBy: ['assigned_to', 'source'],
        defaultSort: { column: 'lead_count', order: 'desc' },
        baseQuery: `
      SELECT
        status,
        COUNT(id) as lead_count,
        SUM(budget) as total_budget_potential,
        AVG(CAST(julianday('now') - julianday(created_at) AS INTEGER)) as avg_days_in_stage
      FROM leads
      WHERE is_deleted = 0 AND status NOT IN ('won', 'lost') {DATE_FILTER}
      GROUP BY status
      {ORDER_BY}
    `,
        columns: [
            { name: 'status', type: 'status' },
            { name: 'lead_count', type: 'number' },
            { name: 'total_budget_potential', type: 'currency' },
            { name: 'avg_days_in_stage', type: 'number' },
        ],
    },
    {
        id: 'lead_ageing',
        name: 'Lead Ageing Report',
        category: 'leads',
        description: 'Individual leads with how long they have been in the pipeline.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: ['status', 'assigned_to'],
        allowedGroupBy: ['assigned_to', 'status'],
        defaultSort: { column: 'days_in_pipeline', order: 'desc' },
        baseQuery: `
      SELECT
        id as lead_id,
        title,
        status,
        assigned_to,
        priority,
        budget,
        CAST(julianday('now') - julianday(created_at) AS INTEGER) as days_in_pipeline,
        CASE
          WHEN CAST(julianday('now') - julianday(created_at) AS INTEGER) < 7 THEN 'green'
          WHEN CAST(julianday('now') - julianday(created_at) AS INTEGER) < 14 THEN 'yellow'
          ELSE 'red'
        END as health_color
      FROM leads
      WHERE is_deleted = 0 AND status NOT IN ('won', 'lost') {DATE_FILTER}
      {ORDER_BY}
    `,
        columns: [
            { name: 'lead_id', type: 'text' },
            { name: 'title', type: 'text' },
            { name: 'status', type: 'status' },
            { name: 'assigned_to', type: 'text' },
            { name: 'priority', type: 'text' },
            { name: 'budget', type: 'currency' },
            { name: 'days_in_pipeline', type: 'number' },
            { name: 'health_color', type: 'text' },
        ]
    },
    {
        id: 'lead_velocity',
        name: 'Lead Velocity Rate',
        category: 'leads',
        description: 'Average days from lead creation to close (won).',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'month', order: 'desc' },
        baseQuery: `
      SELECT
        strftime('%Y-%m', created_at, '{TZ}') as month,
        COUNT(id) as new_leads,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as qualified_won_leads,
        COALESCE(AVG(CASE WHEN status = 'won' THEN CAST(julianday(updated_at) - julianday(created_at) AS INTEGER) END), 0) as avg_days_to_close
      FROM leads
      WHERE is_deleted = 0 {DATE_FILTER}
      GROUP BY strftime('%Y-%m', created_at, '{TZ}')
      {ORDER_BY}
    `,
        columns: [
            { name: 'month', type: 'text' },
            { name: 'new_leads', type: 'number' },
            { name: 'qualified_won_leads', type: 'number' },
            { name: 'avg_days_to_close', type: 'number' },
        ]
    },
    {
        id: 'lead_source_analysis',
        name: 'Lead Source Analysis',
        category: 'leads',
        description: 'Lead volume, quality, and conversion by source channel.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'total_leads', order: 'desc' },
        baseQuery: `
      SELECT
        source,
        COUNT(id) as total_leads,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_leads,
        SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost_leads,
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
            { name: 'lost_leads', type: 'number' },
            { name: 'total_revenue', type: 'currency' },
            { name: 'conversion_rate', type: 'percentage' },
        ],
    },
    {
        id: 'lead_response_time',
        name: 'Lead Response Time',
        category: 'leads',
        description: 'Average time to first activity/follow-up after lead creation.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: ['assigned_to'],
        allowedGroupBy: ['assigned_to'],
        defaultSort: { column: 'avg_response_hours', order: 'asc' },
        dateColumn: 'l.created_at',
        baseQuery: `
      SELECT
        l.assigned_to,
        COUNT(l.id) as total_leads,
        COALESCE(AVG(CAST((julianday(f.created_at) - julianday(l.created_at)) * 24 AS REAL)), 0) as avg_response_hours
      FROM leads l
      LEFT JOIN follow_ups f ON f.lead_id = l.id
        AND f.id = (SELECT id FROM follow_ups WHERE lead_id = l.id ORDER BY created_at ASC LIMIT 1)
      WHERE l.is_deleted = 0 {DATE_FILTER}
      GROUP BY l.assigned_to
      {ORDER_BY}
    `,
        columns: [
            { name: 'assigned_to', type: 'text' },
            { name: 'total_leads', type: 'number' },
            { name: 'avg_response_hours', type: 'number' },
        ],
    },
    {
        id: 'followup_compliance',
        name: 'Follow-Up Compliance',
        category: 'leads',
        description: 'Percentage of leads that received timely follow-up actions.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: ['assigned_to'],
        allowedGroupBy: ['assigned_to'],
        defaultSort: { column: 'compliance_rate', order: 'desc' },
        dateColumn: 'l.created_at',
        baseQuery: `
      SELECT
        l.assigned_to,
        COUNT(l.id) as total_leads,
        COUNT(DISTINCT f.lead_id) as leads_with_followup,
        COALESCE(COUNT(DISTINCT f.lead_id) * 100.0 / NULLIF(COUNT(l.id), 0), 0) as compliance_rate,
        COUNT(CASE WHEN f.completed_at IS NULL AND f.scheduled_at < '{NOW}' THEN 1 END) as overdue_followups
      FROM leads l
      LEFT JOIN follow_ups f ON f.lead_id = l.id
      WHERE l.is_deleted = 0 AND l.status NOT IN ('won', 'lost') {DATE_FILTER}
      GROUP BY l.assigned_to
      {ORDER_BY}
    `,
        columns: [
            { name: 'assigned_to', type: 'text' },
            { name: 'total_leads', type: 'number' },
            { name: 'leads_with_followup', type: 'number' },
            { name: 'compliance_rate', type: 'percentage' },
            { name: 'overdue_followups', type: 'number' },
        ],
    },
    {
        id: 'hot_leads',
        name: 'Hot Leads Report',
        category: 'leads',
        description: 'High-priority leads requiring immediate attention.',
        requiredRole: ['admin', 'sales_manager', 'salesperson'],
        allowedFilters: ['assigned_to'],
        allowedGroupBy: [],
        defaultSort: { column: 'created_at', order: 'desc' },
        baseQuery: `
      SELECT
        id as lead_id,
        title,
        destination,
        budget,
        status,
        assigned_to,
        created_at,
        CAST(julianday('now') - julianday(created_at) AS INTEGER) as age_days
      FROM leads
      WHERE is_deleted = 0 AND priority = 'hot' AND status NOT IN ('won', 'lost') {DATE_FILTER}
      {ORDER_BY}
    `,
        columns: [
            { name: 'lead_id', type: 'text' },
            { name: 'title', type: 'text' },
            { name: 'destination', type: 'text' },
            { name: 'budget', type: 'currency' },
            { name: 'status', type: 'status' },
            { name: 'assigned_to', type: 'text' },
            { name: 'created_at', type: 'date' },
            { name: 'age_days', type: 'number' },
        ],
    },
    {
        id: 'lost_analysis',
        name: 'Lost Leads Analysis',
        category: 'leads',
        description: 'Reasons and patterns for lost leads.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: ['assigned_to'],
        allowedGroupBy: [],
        defaultSort: { column: 'count', order: 'desc' },
        baseQuery: `
      SELECT
        lost_reason,
        assigned_to,
        COUNT(id) as count,
        COALESCE(SUM(budget), 0) as lost_value,
        COALESCE(AVG(budget), 0) as avg_lost_deal_size
      FROM leads
      WHERE is_deleted = 0 AND status = 'lost' {DATE_FILTER}
      GROUP BY lost_reason, assigned_to
      {ORDER_BY}
    `,
        columns: [
            { name: 'lost_reason', type: 'text' },
            { name: 'assigned_to', type: 'text' },
            { name: 'count', type: 'number' },
            { name: 'lost_value', type: 'currency' },
            { name: 'avg_lost_deal_size', type: 'currency' },
        ],
    },
    {
        id: 'unassigned_leads',
        name: 'Unassigned Leads',
        category: 'leads',
        description: 'Leads with no assigned owner.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: ['source'],
        allowedGroupBy: [],
        defaultSort: { column: 'created_at', order: 'asc' },
        baseQuery: `
      SELECT
        id as lead_id,
        title,
        source,
        budget,
        status,
        created_at,
        CAST(julianday('now') - julianday(created_at) AS INTEGER) as age_days
      FROM leads
      WHERE is_deleted = 0 AND (assigned_to IS NULL OR assigned_to = '') AND status NOT IN ('won', 'lost') {DATE_FILTER}
      {ORDER_BY}
    `,
        columns: [
            { name: 'lead_id', type: 'text' },
            { name: 'title', type: 'text' },
            { name: 'source', type: 'text' },
            { name: 'budget', type: 'currency' },
            { name: 'status', type: 'status' },
            { name: 'created_at', type: 'date' },
            { name: 'age_days', type: 'number' },
        ],
    },
    {
        id: 'duplicate_leads',
        name: 'Duplicate Leads',
        category: 'leads',
        description: 'Potential duplicate leads by contact.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'lead_count', order: 'desc' },
        baseQuery: `
      SELECT
        contact_id,
        destination,
        COUNT(id) as lead_count,
        MIN(created_at) as first_created,
        MAX(created_at) as last_created
      FROM leads
      WHERE is_deleted = 0 AND contact_id IS NOT NULL AND status NOT IN ('won', 'lost') {DATE_FILTER}
      GROUP BY contact_id, destination
      HAVING COUNT(id) > 1
      {ORDER_BY}
    `,
        columns: [
            { name: 'contact_id', type: 'text' },
            { name: 'destination', type: 'text' },
            { name: 'lead_count', type: 'number' },
            { name: 'first_created', type: 'date' },
            { name: 'last_created', type: 'date' },
        ],
    },
];

export function registerLeadReports() {
    reportRegistry.registerMany(leadReports);
}
