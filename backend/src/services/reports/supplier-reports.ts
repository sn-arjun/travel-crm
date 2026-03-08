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
    {
        id: 'supplier_payment_summary',
        name: 'Supplier Payment Summary',
        category: 'supplier',
        description: 'Payment history and outstanding balances per supplier.',
        requiredRole: ['admin', 'accountant'],
        allowedFilters: ['category'],
        allowedGroupBy: ['category'],
        defaultSort: { column: 'total_paid', order: 'desc' },
        dateColumn: 'p.created_at',
        baseQuery: `
      SELECT
        s.company_name as supplier_name,
        s.category,
        COUNT(p.id) as payment_count,
        COALESCE(SUM(p.amount), 0) as total_paid,
        COALESCE(SUM(CASE WHEN p.method = 'bank_transfer' THEN p.amount ELSE 0 END), 0) as bank_transfers,
        COALESCE(SUM(CASE WHEN p.method = 'cash' THEN p.amount ELSE 0 END), 0) as cash_payments
      FROM suppliers s
      LEFT JOIN payments p ON p.supplier_id = s.id AND p.type = 'outgoing'
      WHERE s.is_deleted = 0 {DATE_FILTER}
      GROUP BY s.id
      {ORDER_BY}
    `,
        columns: [
            { name: 'supplier_name', type: 'text' },
            { name: 'category', type: 'text' },
            { name: 'payment_count', type: 'number' },
            { name: 'total_paid', type: 'currency' },
            { name: 'bank_transfers', type: 'currency' },
            { name: 'cash_payments', type: 'currency' },
        ],
    },
    {
        id: 'supplier_outstanding',
        name: 'Supplier Outstanding Balances',
        category: 'supplier',
        description: 'Suppliers with unpaid or partially paid vouchers.',
        requiredRole: ['admin', 'accountant'],
        allowedFilters: ['category'],
        allowedGroupBy: ['category'],
        defaultSort: { column: 'outstanding_balance', order: 'desc' },
        dateColumn: 'v.created_at',
        baseQuery: `
      SELECT
        s.company_name as supplier_name,
        s.category,
        COUNT(v.id) as total_vouchers,
        COALESCE(SUM(v.amount), 0) as total_voucher_value,
        COALESCE(SUM(p.amount), 0) as total_paid,
        COALESCE(SUM(v.amount) - COALESCE(SUM(p.amount), 0), 0) as outstanding_balance
      FROM suppliers s
      LEFT JOIN vouchers v ON v.supplier_id = s.id
      LEFT JOIN payments p ON p.supplier_id = s.id AND p.type = 'outgoing'
      WHERE s.is_deleted = 0 {DATE_FILTER}
      GROUP BY s.id
      HAVING COALESCE(SUM(v.amount) - COALESCE(SUM(p.amount), 0), 0) > 0
      {ORDER_BY}
    `,
        columns: [
            { name: 'supplier_name', type: 'text' },
            { name: 'category', type: 'text' },
            { name: 'total_vouchers', type: 'number' },
            { name: 'total_voucher_value', type: 'currency' },
            { name: 'total_paid', type: 'currency' },
            { name: 'outstanding_balance', type: 'currency' },
        ],
    },
];

export function registerSupplierReports() {
    reportRegistry.registerMany(supplierReports);
}
