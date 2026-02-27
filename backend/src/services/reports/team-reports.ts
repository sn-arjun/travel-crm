import { ReportDefinition } from '../../types/report';
import { reportRegistry } from '../report-registry';

const teamReports: ReportDefinition[] = [
    {
        id: 'team_dashboard',
        name: 'Team Performance Dashboard',
        category: 'team',
        description: 'Summary of completed activities and won deals per team member.',
        requiredRole: ['admin', 'manager'],
        allowedFilters: ['department'],
        allowedGroupBy: ['department'],
        dateColumn: 'u.created_at',
        defaultSort: { column: 'won_deals', order: 'desc' },
        baseQuery: `
      SELECT
        u.name as team_member,
        u.department,
        (SELECT COUNT(id) FROM leads WHERE assigned_to = u.id AND status = 'won' AND is_deleted = 0) as won_deals,
        (SELECT COUNT(id) FROM tasks WHERE assigned_to = u.id AND status = 'completed') as completed_tasks
      FROM users u
      WHERE u.is_active = 1 {DATE_FILTER}
      {ORDER_BY}
    `,
        columns: [
            { name: 'team_member', type: 'text' },
            { name: 'department', type: 'text' },
            { name: 'won_deals', type: 'number' },
            { name: 'completed_tasks', type: 'number' },
        ],
    },
];

export function registerTeamReports() {
    reportRegistry.registerMany(teamReports);
}
