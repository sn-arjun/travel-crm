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
    {
        id: 'driver_performance',
        name: 'Driver Performance',
        category: 'fleet',
        description: 'Trip counts and ratings per driver.',
        requiredRole: ['admin', 'manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'trip_count', order: 'desc' },
        dateColumn: 't.created_at',
        baseQuery: `
      SELECT
        d.name as driver_name,
        d.license_number,
        COUNT(t.id) as trip_count,
        COALESCE(AVG(d.rating), 0) as avg_rating
      FROM drivers d
      LEFT JOIN trip_assignments t ON t.driver_id = d.id
      WHERE d.status = 'active' {DATE_FILTER}
      GROUP BY d.id
      {ORDER_BY}
    `,
        columns: [
            { name: 'driver_name', type: 'text' },
            { name: 'license_number', type: 'text' },
            { name: 'trip_count', type: 'number' },
            { name: 'avg_rating', type: 'number' },
        ],
    },
    {
        id: 'fleet_availability',
        name: 'Fleet Availability',
        category: 'fleet',
        description: 'Vehicle availability status and maintenance schedule.',
        requiredRole: ['admin', 'manager'],
        allowedFilters: ['status', 'type'],
        allowedGroupBy: ['status', 'type'],
        defaultSort: { column: 'type', order: 'asc' },
        baseQuery: `
      SELECT
        type,
        status,
        COUNT(id) as vehicle_count,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as in_maintenance,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive
      FROM vehicles
      WHERE 1 = 1 {DATE_FILTER}
      GROUP BY type, status
      {ORDER_BY}
    `,
        columns: [
            { name: 'type', type: 'text' },
            { name: 'status', type: 'status' },
            { name: 'vehicle_count', type: 'number' },
            { name: 'available', type: 'number' },
            { name: 'in_maintenance', type: 'number' },
            { name: 'inactive', type: 'number' },
        ],
    },
    {
        id: 'trip_cost_analysis',
        name: 'Trip Cost Analysis',
        category: 'fleet',
        description: 'Cost breakdown per trip type and route.',
        requiredRole: ['admin', 'manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'trip_count', order: 'desc' },
        dateColumn: 't.created_at',
        baseQuery: `
      SELECT
        t.trip_type,
        COUNT(t.id) as trip_count,
        COALESCE(AVG(t.distance_km), 0) as avg_distance_km,
        COALESCE(AVG(t.amount), 0) as avg_trip_cost,
        COALESCE(SUM(t.amount), 0) as total_cost
      FROM trip_assignments t
      WHERE 1 = 1 {DATE_FILTER}
      GROUP BY t.trip_type
      {ORDER_BY}
    `,
        columns: [
            { name: 'trip_type', type: 'text' },
            { name: 'trip_count', type: 'number' },
            { name: 'avg_distance_km', type: 'number' },
            { name: 'avg_trip_cost', type: 'currency' },
            { name: 'total_cost', type: 'currency' },
        ],
    },
];

export function registerFleetReports() {
    reportRegistry.registerMany(fleetReports);
}
