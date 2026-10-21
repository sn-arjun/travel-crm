import { ReportDefinition } from '../../types/report';
import { reportRegistry } from '../report-registry';

const teamReports: ReportDefinition[] = [
    {
        id: 'team_dashboard',
        name: 'Team Performance Dashboard',
        category: 'team',
        description: 'Summary of completed activities and won deals per team member.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: ['department'],
        allowedGroupBy: ['department'],
        dateColumn: 'u.created_at',
        defaultSort: { column: 'total_revenue', order: 'desc' },
        baseQuery: `
      SELECT
        u.name as team_member,
        u.department,
        (SELECT COUNT(id) FROM leads WHERE assigned_to = u.id AND is_deleted = 0) as total_leads,
        (SELECT COUNT(id) FROM leads WHERE assigned_to = u.id AND status = 'won' AND is_deleted = 0) as won_deals,
        (SELECT COUNT(id) FROM leads WHERE assigned_to = u.id AND status = 'lost' AND is_deleted = 0) as lost_deals,
        (SELECT COALESCE(SUM(budget), 0) FROM leads WHERE assigned_to = u.id AND status = 'won' AND is_deleted = 0) as total_revenue,
        (SELECT COUNT(id) FROM tasks WHERE assigned_to = u.id AND status = 'completed') as completed_tasks,
        COALESCE(
          (SELECT COUNT(id) FROM leads WHERE assigned_to = u.id AND status = 'won' AND is_deleted = 0) * 100.0 /
          NULLIF((SELECT COUNT(id) FROM leads WHERE assigned_to = u.id AND is_deleted = 0), 0), 0
        ) as conversion_rate
      FROM users u
      WHERE u.is_active = 1 {DATE_FILTER}
      {ORDER_BY}
    `,
        columns: [
            { name: 'team_member', type: 'text' },
            { name: 'department', type: 'text' },
            { name: 'total_leads', type: 'number' },
            { name: 'won_deals', type: 'number' },
            { name: 'lost_deals', type: 'number' },
            { name: 'total_revenue', type: 'currency' },
            { name: 'completed_tasks', type: 'number' },
            { name: 'conversion_rate', type: 'percentage' },
        ],
    },
    {
        id: 'individual_performance',
        name: 'Individual Performance Report',
        category: 'team',
        description: 'Deep-dive performance metrics per team member.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: ['assigned_to'],
        allowedGroupBy: [],
        defaultSort: { column: 'won_deals', order: 'desc' },
        baseQuery: `
      SELECT
        l.assigned_to,
        strftime('%Y-%m', l.created_at, '{TZ}') as month,
        COUNT(l.id) as total_leads,
        SUM(CASE WHEN l.status = 'won' THEN 1 ELSE 0 END) as won_deals,
        COALESCE(SUM(CASE WHEN l.status = 'won' THEN l.budget ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN l.status = 'won' THEN 1.0 ELSE 0.0 END) / NULLIF(COUNT(l.id), 0) * 100, 0) as conversion_rate,
        COALESCE(AVG(CASE WHEN l.status = 'won' THEN CAST(julianday(l.updated_at) - julianday(l.created_at) AS REAL) END), 0) as avg_days_to_close
      FROM leads l
      WHERE l.is_deleted = 0 {DATE_FILTER}
      GROUP BY l.assigned_to, strftime('%Y-%m', l.created_at, '{TZ}')
      {ORDER_BY}
    `,
        columns: [
            { name: 'assigned_to', type: 'text' },
            { name: 'month', type: 'text' },
            { name: 'total_leads', type: 'number' },
            { name: 'won_deals', type: 'number' },
            { name: 'revenue', type: 'currency' },
            { name: 'conversion_rate', type: 'percentage' },
            { name: 'avg_days_to_close', type: 'number' },
        ],
    },
    {
        id: 'response_time_by_user',
        name: 'Response Time by User',
        category: 'team',
        description: 'Average response time to new leads per team member.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'avg_response_hours', order: 'asc' },
        dateColumn: 'l.created_at',
        baseQuery: `
      SELECT
        l.assigned_to,
        COUNT(l.id) as total_leads,
        COALESCE(AVG(
          CAST((julianday(f.created_at) - julianday(l.created_at)) * 24 AS REAL)
        ), 0) as avg_response_hours
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
        id: 'activity_report',
        name: 'Team Activity Report',
        category: 'team',
        description: 'Activities logged by each team member.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: ['type'],
        allowedGroupBy: ['type'],
        defaultSort: { column: 'activity_count', order: 'desc' },
        dateColumn: 'la.created_at',
        baseQuery: `
      SELECT
        la.created_by as team_member,
        la.type,
        COUNT(la.id) as activity_count
      FROM lead_activities la
      WHERE 1 = 1 {DATE_FILTER}
      GROUP BY la.created_by, la.type
      {ORDER_BY}
    `,
        columns: [
            { name: 'team_member', type: 'text' },
            { name: 'type', type: 'text' },
            { name: 'activity_count', type: 'number' },
        ],
    },
    {
        id: 'task_completion',
        name: 'Task Completion Report',
        category: 'team',
        description: 'Task completion rates per team member.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: ['assigned_to'],
        allowedGroupBy: ['assigned_to'],
        defaultSort: { column: 'completion_rate', order: 'desc' },
        baseQuery: `
      SELECT
        assigned_to,
        COUNT(id) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
        SUM(CASE WHEN status = 'pending' OR status = 'in_progress' THEN 1 ELSE 0 END) as pending_tasks,
        SUM(CASE WHEN due_date < '{TODAY}' AND status != 'completed' THEN 1 ELSE 0 END) as overdue_tasks,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1.0 ELSE 0.0 END) / NULLIF(COUNT(id), 0) * 100, 0) as completion_rate
      FROM tasks
      WHERE 1 = 1 {DATE_FILTER}
      GROUP BY assigned_to
      {ORDER_BY}
    `,
        columns: [
            { name: 'assigned_to', type: 'text' },
            { name: 'total_tasks', type: 'number' },
            { name: 'completed_tasks', type: 'number' },
            { name: 'pending_tasks', type: 'number' },
            { name: 'overdue_tasks', type: 'number' },
            { name: 'completion_rate', type: 'percentage' },
        ],
    },
];

export function registerTeamReports() {
    reportRegistry.registerMany(teamReports);
}
