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
];

export function registerCustomerReports() {
    reportRegistry.registerMany(customerReports);
}
