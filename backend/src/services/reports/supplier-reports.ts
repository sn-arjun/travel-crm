import { ReportDefinition } from '../../types/report';
import { reportRegistry } from '../report-registry';

const supplierReports: ReportDefinition[] = [
    {
        id: 'supplier_usage',
        name: 'Supplier Usage & Bookings',
        category: 'supplier',
        description: 'Number of trips and total spend per supplier.',
        requiredRole: ['admin', 'manager', 'accountant'],
        allowedFilters: ['category'],
        allowedGroupBy: ['category'],
        defaultSort: { column: 'total_spend', order: 'desc' },
        dateColumn: 'p.created_at',
        baseQuery: `
      SELECT
        s.company_name as supplier_name,
        s.category,
        COUNT(v.id) as trips_booked,
        COALESCE(SUM(p.amount), 0) as total_spend
      FROM suppliers s
      LEFT JOIN vouchers v ON v.supplier_id = s.id
      LEFT JOIN payments p ON p.supplier_id = s.id
      WHERE s.is_deleted = 0 {DATE_FILTER}
      GROUP BY s.id
      {ORDER_BY}
    `,
        columns: [
            { name: 'supplier_name', type: 'text' },
            { name: 'category', type: 'text' },
            { name: 'trips_booked', type: 'number' },
            { name: 'total_spend', type: 'currency' },
        ],
    },
];

export function registerSupplierReports() {
    reportRegistry.registerMany(supplierReports);
}
