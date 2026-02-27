import { ReportDefinition } from '../../types/report';
import { reportRegistry } from '../report-registry';

const financialReports: ReportDefinition[] = [
    {
        id: 'revenue_summary',
        name: 'Revenue Summary',
        category: 'financial',
        description: 'Total invoiced revenue, paid amount, and outstanding balances.',
        requiredRole: ['admin', 'accountant'],
        allowedFilters: ['status', 'type'],
        allowedGroupBy: ['status', 'type'],
        defaultSort: { column: 'total_amount', order: 'desc' },
        baseQuery: `
      SELECT 
        status,
        type,
        COUNT(id) as invoice_count,
        SUM(total) as total_amount,
        SUM(balance_due) as total_outstanding
      FROM invoices
      WHERE 1 = 1 {DATE_FILTER}
      GROUP BY status, type
      {ORDER_BY}
    `,
        columns: [
            { name: 'status', type: 'status' },
            { name: 'type', type: 'text' },
            { name: 'invoice_count', type: 'number' },
            { name: 'total_amount', type: 'currency' },
            { name: 'total_outstanding', type: 'currency' },
        ],
    },
    {
        id: 'collections_report',
        name: 'Collections Report',
        category: 'financial',
        description: 'Incoming payments grouped by method.',
        requiredRole: ['admin', 'accountant'],
        allowedFilters: ['method'],
        allowedGroupBy: ['method'],
        // Use `date` column explicitly since payments use `date` instead of `created_at` in the UI usually, 
        // although they also have created_at. We'll rely on the engine's default injection or override date_column in the UI.
        defaultSort: { column: 'collected_amount', order: 'desc' },
        baseQuery: `
      SELECT 
        method,
        COUNT(id) as payment_count,
        SUM(amount) as collected_amount
      FROM payments
      WHERE type = 'incoming' {DATE_FILTER}
      GROUP BY method
      {ORDER_BY}
    `,
        columns: [
            { name: 'method', type: 'text' },
            { name: 'payment_count', type: 'number' },
            { name: 'collected_amount', type: 'currency' },
        ]
    },
    {
        id: 'tax_report',
        name: 'Tax Collection Report',
        category: 'financial',
        description: 'Summary of taxes invoiced.',
        requiredRole: ['admin', 'accountant'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'total_tax', order: 'desc' },
        baseQuery: `
      SELECT 
        SUM(total_tax) as total_tax,
        SUM(total) as total_revenue
      FROM invoices
      WHERE type = 'tax_invoice' AND status IN ('paid', 'partially_paid', 'sent') {DATE_FILTER}
      {ORDER_BY}
    `,
        columns: [
            { name: 'total_tax', type: 'currency' },
            { name: 'total_revenue', type: 'currency' },
        ]
    }
];

export function registerFinancialReports() {
    reportRegistry.registerMany(financialReports);
}
