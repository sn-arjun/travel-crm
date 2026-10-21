import { ReportDefinition } from '../../types/report';
import { reportRegistry } from '../report-registry';

/**
 * Group tour reports (R146, design section 10): seats and load per departure, sales per tour, and extras sold. They belong to the
 * plan feature group_departures: the reports routes hide them and refuse them for an agency without it.
 * Money columns hold the amounts as invoiced (a tour that sells in another currency reports in that currency).
 */

const TOUR_ROLES = ['admin', 'sales_manager', 'operations', 'accountant'];

/** Invoiced and collected per departure, from the main invoice of each held or confirmed seat booking. */
const INVOICED_PER_DEPARTURE = `
      SELECT sb.departure_id AS departure_id, COALESCE(SUM(i.total), 0) AS invoiced, COALESCE(SUM(i.paid_amount), 0) AS collected
      FROM seat_bookings sb
      JOIN invoices i ON i.id = sb.invoice_id
      WHERE sb.status IN ('held', 'confirmed') AND i.status != 'cancelled'
      GROUP BY sb.departure_id`;

const tourReports: ReportDefinition[] = [
    {
        id: 'departure_seats',
        name: 'Departure Seats',
        category: 'tours',
        featureKey: 'group_departures',
        description: 'Capacity, held, confirmed and waitlisted seats, seats left, load and revenue per departure.',
        requiredRole: TOUR_ROLES,
        allowedFilters: ['tour_id', 'status'],
        allowedGroupBy: [],
        defaultSort: { column: 'start_date', order: 'asc' },
        dateColumn: 'start_date',
        dateColumnType: 'date',
        baseQuery: `
      SELECT * FROM (
        SELECT
          d.id AS departure_id,
          d.code,
          t.title AS tour,
          d.tour_id,
          d.start_date,
          d.status,
          d.capacity,
          COALESCE(s.held, 0) AS held,
          COALESCE(s.confirmed, 0) AS confirmed,
          COALESCE(s.waitlisted, 0) AS waitlisted,
          MAX(0, d.capacity - COALESCE(s.held, 0) - COALESCE(s.confirmed, 0)) AS seats_left,
          CASE WHEN d.capacity > 0 THEN ROUND(100.0 * (COALESCE(s.held, 0) + COALESCE(s.confirmed, 0)) / d.capacity, 1) ELSE 0 END AS load_pct,
          COALESCE(inv.invoiced, 0) AS revenue_invoiced,
          COALESCE(inv.collected, 0) AS revenue_collected
        FROM departures d
        JOIN tours t ON t.id = d.tour_id
        LEFT JOIN (
          SELECT departure_id,
                 SUM(CASE WHEN status = 'held' THEN seats ELSE 0 END) AS held,
                 SUM(CASE WHEN status = 'confirmed' THEN seats ELSE 0 END) AS confirmed,
                 SUM(CASE WHEN status = 'waitlisted' THEN seats ELSE 0 END) AS waitlisted
          FROM seat_bookings GROUP BY departure_id
        ) s ON s.departure_id = d.id
        LEFT JOIN (${INVOICED_PER_DEPARTURE}
        ) inv ON inv.departure_id = d.id
        WHERE d.is_deleted = 0
      ) r
      {ORDER_BY}
    `,
        columns: [
            { name: 'code', type: 'text' },
            { name: 'tour', type: 'text' },
            { name: 'start_date', type: 'date' },
            { name: 'status', type: 'status' },
            { name: 'capacity', type: 'number' },
            { name: 'held', type: 'number' },
            { name: 'confirmed', type: 'number' },
            { name: 'waitlisted', type: 'number' },
            { name: 'seats_left', type: 'number' },
            { name: 'load_pct', type: 'percentage' },
            { name: 'revenue_invoiced', type: 'currency' },
            { name: 'revenue_collected', type: 'currency' },
        ],
    },
    {
        id: 'tour_sales',
        name: 'Tour Sales',
        category: 'tours',
        featureKey: 'group_departures',
        description: 'Departures run, seats sold, average load and revenue per tour.',
        requiredRole: TOUR_ROLES,
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'revenue_invoiced', order: 'desc' },
        dateColumn: 'd.start_date',
        dateColumnType: 'date',
        baseQuery: `
      SELECT
        t.id AS tour_id,
        t.code AS tour_code,
        t.title AS tour,
        COUNT(DISTINCT d.id) AS departures_run,
        COALESCE(SUM(ds.sold), 0) AS seats_sold,
        COALESCE(ROUND(AVG(CASE WHEN d.capacity > 0 THEN 100.0 * COALESCE(ds.sold, 0) / d.capacity END), 1), 0) AS avg_load_pct,
        COALESCE(SUM(inv.invoiced), 0) AS revenue_invoiced,
        COALESCE(SUM(inv.collected), 0) AS revenue_collected
      FROM tours t
      JOIN departures d ON d.tour_id = t.id AND d.is_deleted = 0 AND d.status NOT IN ('draft', 'cancelled')
      LEFT JOIN (
        SELECT departure_id, SUM(seats) AS sold FROM seat_bookings WHERE status = 'confirmed' GROUP BY departure_id
      ) ds ON ds.departure_id = d.id
      LEFT JOIN (${INVOICED_PER_DEPARTURE}
      ) inv ON inv.departure_id = d.id
      WHERE t.is_deleted = 0
      GROUP BY t.id
      {ORDER_BY}
    `,
        columns: [
            { name: 'tour_code', type: 'text' },
            { name: 'tour', type: 'text' },
            { name: 'departures_run', type: 'number' },
            { name: 'seats_sold', type: 'number' },
            { name: 'avg_load_pct', type: 'percentage' },
            { name: 'revenue_invoiced', type: 'currency' },
            { name: 'revenue_collected', type: 'currency' },
        ],
    },
    {
        id: 'extras_sales',
        name: 'Extras Sales',
        category: 'tours',
        featureKey: 'group_departures',
        description: 'Quantity and revenue per extra chosen by passengers (empty until extras are sold).',
        requiredRole: TOUR_ROLES,
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'revenue', order: 'desc' },
        dateColumn: 'pe.created_at',
        baseQuery: `
      SELECT
        te.id AS extra_id,
        te.title AS extra,
        COALESCE(t.title, '') AS tour,
        COALESCE(SUM(pe.quantity), 0) AS quantity,
        COUNT(DISTINCT pe.seat_passenger_id) AS passengers,
        COALESCE(SUM(pe.quantity * pe.unit_price), 0) AS revenue
      FROM tour_extras te
      JOIN passenger_extras pe ON pe.tour_extra_id = te.id AND pe.status != 'cancelled'
      LEFT JOIN tours t ON t.id = te.tour_id
      GROUP BY te.id
      {ORDER_BY}
    `,
        columns: [
            { name: 'extra', type: 'text' },
            { name: 'tour', type: 'text' },
            { name: 'quantity', type: 'number' },
            { name: 'passengers', type: 'number' },
            { name: 'revenue', type: 'currency' },
        ],
    },
];

export function registerTourReports() {
    reportRegistry.registerMany(tourReports);
}
