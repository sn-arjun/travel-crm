import { ReportDefinition } from '../../types/report';
import { reportRegistry } from '../report-registry';

const fleetReports: ReportDefinition[] = [
    {
        id: 'fleet_utilization',
        name: 'Fleet Utilization',
        category: 'fleet',
        description: 'Vehicle active trips and utilization over time.',
        requiredRole: ['admin', 'manager'],
        allowedFilters: ['type'],
        allowedGroupBy: ['type'],
        defaultSort: { column: 'trip_count', order: 'desc' },
        dateColumn: 't.created_at',
        baseQuery: `
      SELECT
        v.registration_no as vehicle_reg,
        v.type,
        COUNT(t.id) as trip_count,
        0 as estimated_revenue
      FROM vehicles v
      LEFT JOIN trip_assignments t ON t.vehicle_id = v.id
      WHERE v.status = 'active' {DATE_FILTER}
      GROUP BY v.id
      {ORDER_BY}
    `,
        columns: [
            { name: 'vehicle_reg', type: 'text' },
            { name: 'type', type: 'text' },
            { name: 'trip_count', type: 'number' },
            { name: 'estimated_revenue', type: 'currency' },
        ],
    },
];

export function registerFleetReports() {
    reportRegistry.registerMany(fleetReports);
}
