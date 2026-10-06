import { ReportDefinition } from '../../types/report';
import { reportRegistry } from '../report-registry';

const customerReports: ReportDefinition[] = [
    {
        id: 'repeat_customers',
        name: 'Repeat Customers',
        category: 'customer',
        description: 'Customers with more than one won lead/booking.',
        requiredRole: ['admin', 'manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        dateColumn: 'l.created_at',
        defaultSort: { column: 'booking_count', order: 'desc' },
        baseQuery: `
      SELECT
        c.name as customer_name,
        c.email,
        COUNT(l.id) as booking_count,
        SUM(l.budget) as total_spent
      FROM contacts c
      JOIN leads l ON c.id = l.contact_id
      WHERE c.is_deleted = 0 AND l.is_deleted = 0 AND l.status = 'won' {DATE_FILTER}
      GROUP BY c.id
      HAVING COUNT(l.id) > 1
      {ORDER_BY}
    `,
        columns: [
            { name: 'customer_name', type: 'text' },
            { name: 'email', type: 'text' },
            { name: 'booking_count', type: 'number' },
            { name: 'total_spent', type: 'currency' },
        ],
    },
    {
        id: 'customer_ltv',
        name: 'Customer Lifetime Value (LTV)',
        category: 'customer',
        description: 'Total historical value generated per customer.',
        requiredRole: ['admin', 'manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        dateColumn: 'l.created_at',
        defaultSort: { column: 'total_ltv', order: 'desc' },
        baseQuery: `
      SELECT
        c.name as customer_name,
        COUNT(l.id) as total_bookings,
        SUM(l.budget) as total_ltv
      FROM contacts c
      LEFT JOIN leads l ON c.id = l.contact_id AND l.status = 'won' AND l.is_deleted = 0
      WHERE c.is_deleted = 0 {DATE_FILTER}
      GROUP BY c.id
      {ORDER_BY}
    `,
        columns: [
            { name: 'customer_name', type: 'text' },
            { name: 'total_bookings', type: 'number' },
            { name: 'total_ltv', type: 'currency' },
        ]
    },
    {
        id: 'birthday_upcoming',
        name: 'Upcoming Birthdays',
        category: 'customer',
        description: 'Customers with birthdays in the next 30 days for personalized outreach.',
        requiredRole: ['admin', 'manager', 'salesperson'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'days_until_birthday', order: 'asc' },
        // An "as of today" report: the date range never narrows it, so bind the filter to today.
        ignoreDateRange: true,
        // contacts have no assigned_to; a salesperson sees the customers they created
        ownerColumn: 'c.created_by',
        baseQuery: `
      SELECT
        c.name as customer_name,
        c.email,
        c.phone,
        c.birthday as date_of_birth,
        CAST(
          julianday(
            CASE WHEN strftime('%m-%d', c.birthday) >= strftime('%m-%d', 'now')
              THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', c.birthday)
              ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', c.birthday)
            END
          ) - julianday(date('now'))
        AS INTEGER) as days_until_birthday
      FROM contacts c
      WHERE c.is_deleted = 0 AND c.birthday IS NOT NULL AND c.birthday != ''
        AND CAST(
          julianday(
            CASE WHEN strftime('%m-%d', c.birthday) >= strftime('%m-%d', 'now')
              THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', c.birthday)
              ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', c.birthday)
            END
          ) - julianday(date('now'))
        AS INTEGER) <= 30
      {DATE_FILTER}
      {ORDER_BY}
    `,
        columns: [
            { name: 'customer_name', type: 'text' },
            { name: 'email', type: 'text' },
            { name: 'phone', type: 'text' },
            { name: 'date_of_birth', type: 'date' },
            { name: 'days_until_birthday', type: 'number' },
        ],
    },
    {
        id: 'dormant_customers',
        name: 'Dormant Customers',
        category: 'customer',
        description: 'Customers with no bookings in the last 6 months.',
        requiredRole: ['admin', 'manager'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'last_booking_date', order: 'asc' },
        // An "as of today" report: the date range never narrows it, so bind the filter to today.
        ignoreDateRange: true,
        baseQuery: `
      SELECT
        c.name as customer_name,
        c.email,
        c.phone,
        MAX(l.created_at) as last_booking_date,
        COUNT(l.id) as total_past_bookings,
        CAST(julianday('now') - julianday(MAX(l.created_at)) AS INTEGER) as days_since_last_booking
      FROM contacts c
      LEFT JOIN leads l ON c.id = l.contact_id AND l.status = 'won' AND l.is_deleted = 0
      WHERE c.is_deleted = 0 {DATE_FILTER}
      GROUP BY c.id
      HAVING MAX(l.created_at) IS NULL
        OR CAST(julianday('now') - julianday(MAX(l.created_at)) AS INTEGER) > 180
      {ORDER_BY}
    `,
        columns: [
            { name: 'customer_name', type: 'text' },
            { name: 'email', type: 'text' },
            { name: 'phone', type: 'text' },
            { name: 'last_booking_date', type: 'date' },
            { name: 'total_past_bookings', type: 'number' },
            { name: 'days_since_last_booking', type: 'number' },
        ],
    },
];

export function registerCustomerReports() {
    reportRegistry.registerMany(customerReports);
}
