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
        SUM(total) as total_revenue,
        COALESCE(SUM(total_tax) * 100.0 / NULLIF(SUM(total), 0), 0) as effective_tax_rate
      FROM invoices
      WHERE type = 'tax_invoice' AND status IN ('paid', 'partially_paid', 'sent') AND COALESCE(tax_regime, 'gst') != 'margin' {DATE_FILTER}
      {ORDER_BY}
    `,
        columns: [
            { name: 'total_tax', type: 'currency' },
            { name: 'total_revenue', type: 'currency' },
            { name: 'effective_tax_rate', type: 'percentage' },
        ],
        // Margin-scheme invoices carry no tax line: they are left out above and pointed to here (R152).
        summarize: async ({ db, bounds }) => {
            const range = bounds ? ' AND created_at BETWEEN ? AND ?' : '';
            const row = await db
                .prepare(`SELECT COUNT(*) AS n FROM invoices WHERE type = 'tax_invoice' AND tax_regime = 'margin' AND status IN ('paid', 'partially_paid', 'sent')${range}`)
                .bind(...(bounds ? [bounds.from, bounds.to] : []))
                .first<{ n: number }>();
            const n = row?.n ?? 0;
            return n > 0 ? { pointer: { reportId: 'margin_scheme_report', invoices: n } } : {};
        },
    },
    {
        id: 'margin_scheme_report',
        name: 'Margin Scheme Report',
        category: 'financial',
        description: 'Invoices issued under the margin scheme: total, cost, margin and, when your VAT rate is set, the VAT on the margin.',
        featureKey: 'margin_scheme',
        noCache: true,
        requiredRole: ['admin', 'accountant'],
        allowedFilters: [],
        allowedGroupBy: [],
        dateColumn: "COALESCE(i.issue_date, SUBSTR(i.created_at, 1, 10))",
        dateColumnType: 'date',
        defaultSort: { column: 'invoice_date', order: 'desc' },
        // The VAT rate is the one stored on the invoice, else the agency's current rate; never a default.
        baseQuery: `
      SELECT
        i.id as invoice_id,
        i.invoice_number,
        c.name as contact_name,
        COALESCE(i.issue_date, SUBSTR(i.created_at, 1, 10)) as invoice_date,
        i.currency,
        i.status,
        i.total as total_amount,
        i.margin_cost as cost,
        CASE WHEN i.margin_cost IS NULL THEN NULL ELSE ROUND(i.total - i.margin_cost, 2) END as margin,
        COALESCE(i.margin_vat_rate, ms.rate) as vat_rate,
        CASE
          WHEN i.margin_cost IS NULL OR COALESCE(i.margin_vat_rate, ms.rate) IS NULL THEN NULL
          WHEN i.total - i.margin_cost <= 0 THEN 0
          ELSE ROUND(ROUND((i.total - i.margin_cost) * 100) * COALESCE(i.margin_vat_rate, ms.rate) / (100 + COALESCE(i.margin_vat_rate, ms.rate))) / 100.0
        END as vat_on_margin,
        CASE WHEN i.margin_cost IS NULL THEN 'costs_missing' ELSE 'complete' END as completeness
      FROM invoices i
      LEFT JOIN contacts c ON i.contact_id = c.id
      LEFT JOIN (
        SELECT CASE WHEN json_valid(value) THEN CAST(json_extract(value, '$.vatRate') AS REAL) END as rate
        FROM settings WHERE key = 'margin_scheme'
      ) ms ON 1 = 1
      WHERE i.tax_regime = 'margin' AND i.type = 'tax_invoice' AND i.status NOT IN ('draft', 'cancelled', 'void') {DATE_FILTER}
      {ORDER_BY}
    `,
        columns: [
            { name: 'invoice_number', type: 'text' },
            { name: 'contact_name', type: 'text' },
            { name: 'invoice_date', type: 'date' },
            { name: 'total_amount', type: 'currency' },
            { name: 'cost', type: 'currency' },
            { name: 'margin', type: 'currency' },
            { name: 'vat_rate', type: 'percentage' },
            { name: 'vat_on_margin', type: 'currency' },
            { name: 'completeness', type: 'status' },
        ],
        summarize: async ({ db, rows, bounds }) => {
            // Totals cover complete rows only (cost recorded), per currency; the incomplete ones are counted, not guessed.
            const minor = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
            const byCurrency = new Map<string, { currency: string; invoices: number; total: number; cost: number; margin: number; vatOnMargin: number | null }>();
            let incomplete = 0;
            let rateMissing = 0;
            for (const r of rows) {
                if (r.cost === null || r.cost === undefined) { incomplete += 1; continue; }
                if (r.vat_on_margin === null || r.vat_on_margin === undefined) rateMissing += 1;
                const cur = String(r.currency ?? '');
                const t = byCurrency.get(cur) ?? { currency: cur, invoices: 0, total: 0, cost: 0, margin: 0, vatOnMargin: 0 };
                t.invoices += 1;
                t.total += minor(r.total_amount);
                t.cost += minor(r.cost);
                t.margin += minor(r.margin ?? 0);
                if (r.vat_on_margin === null || r.vat_on_margin === undefined) t.vatOnMargin = null;
                else if (t.vatOnMargin !== null) t.vatOnMargin += minor(r.vat_on_margin);
                byCurrency.set(cur, t);
            }
            const totals = [...byCurrency.values()].map((t) => ({
                currency: t.currency, invoices: t.invoices, total: t.total / 100, cost: t.cost / 100, margin: t.margin / 100,
                vatOnMargin: t.vatOnMargin === null ? null : t.vatOnMargin / 100,
            }));
            // Credit notes against margin invoices are listed, not netted: the accountant decides how they reduce the margin.
            const range = bounds ? " AND COALESCE(issue_date, SUBSTR(created_at, 1, 10)) BETWEEN ?1 AND ?2" : '';
            const cn = await db
                .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS total FROM invoices WHERE type = 'credit_note' AND tax_regime = 'margin' AND status NOT IN ('draft', 'cancelled', 'void')${range}`)
                .bind(...(bounds ? [bounds.from, bounds.to] : []))
                .first<{ n: number; total: number }>();
            return {
                notice: 'For your accountant: figures are computed from the costs recorded in TravelCRM',
                complete: rows.length - incomplete,
                incomplete,
                // Complete rows whose VAT is blank because the agency has not entered its VAT rate
                rateMissing,
                totals,
                creditNotes: { count: cn?.n ?? 0, total: cn?.total ?? 0 },
            };
        },
    },
    {
        id: 'outstanding_receivables',
        name: 'Outstanding Receivables',
        category: 'financial',
        description: 'Unpaid invoices grouped by ageing bucket.',
        requiredRole: ['admin', 'accountant'],
        allowedFilters: [],
        allowedGroupBy: [],
        dateColumn: 'due_date',
        dateColumnType: 'date',
        defaultSort: { column: 'balance_due', order: 'desc' },
        baseQuery: `
      SELECT
        i.invoice_number,
        c.name as contact_name,
        i.total,
        i.balance_due,
        i.due_date,
        i.status,
        CAST(julianday('{TODAY}') - julianday(i.due_date) AS INTEGER) as days_overdue,
        CASE
          WHEN julianday('{TODAY}') - julianday(i.due_date) <= 0 THEN 'current'
          WHEN julianday('{TODAY}') - julianday(i.due_date) <= 30 THEN '1-30 days'
          WHEN julianday('{TODAY}') - julianday(i.due_date) <= 60 THEN '31-60 days'
          WHEN julianday('{TODAY}') - julianday(i.due_date) <= 90 THEN '61-90 days'
          ELSE '90+ days'
        END as ageing_bucket
      FROM invoices i
      LEFT JOIN contacts c ON i.contact_id = c.id
      WHERE i.status IN ('sent', 'partially_paid', 'overdue') AND i.status != 'cancelled' {DATE_FILTER}
      {ORDER_BY}
    `,
        columns: [
            { name: 'invoice_number', type: 'text' },
            { name: 'contact_name', type: 'text' },
            { name: 'total', type: 'currency' },
            { name: 'balance_due', type: 'currency' },
            { name: 'due_date', type: 'date' },
            { name: 'status', type: 'status' },
            { name: 'days_overdue', type: 'number' },
            { name: 'ageing_bucket', type: 'text' },
        ],
    },
    {
        id: 'outstanding_payables',
        name: 'Outstanding Payables',
        category: 'financial',
        description: 'Outgoing payments due to suppliers.',
        requiredRole: ['admin', 'accountant'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'total_spend', order: 'desc' },
        dateColumn: 'p.created_at',
        baseQuery: `
      SELECT
        s.company_name as supplier_name,
        COUNT(p.id) as payment_count,
        COALESCE(SUM(p.amount), 0) as total_spend,
        MIN(p.created_at) as earliest_payment
      FROM payments p
      JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.type = 'outgoing' {DATE_FILTER}
      GROUP BY s.id
      {ORDER_BY}
    `,
        columns: [
            { name: 'supplier_name', type: 'text' },
            { name: 'payment_count', type: 'number' },
            { name: 'total_spend', type: 'currency' },
            { name: 'earliest_payment', type: 'date' },
        ],
    },
    {
        id: 'pnl_by_lead',
        name: 'P&L By Lead',
        category: 'financial',
        description: 'Profit and loss analysis per won lead.',
        requiredRole: ['admin', 'accountant'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'gross_profit', order: 'desc' },
        dateColumn: 'l.updated_at',
        baseQuery: `
      SELECT
        l.title as lead_title,
        l.destination,
        l.assigned_to,
        COALESCE(SUM(DISTINCT i.total), 0) as total_invoiced,
        COALESCE(SUM(p_out.amount), 0) as total_costs,
        COALESCE(SUM(DISTINCT i.total) - COALESCE(SUM(p_out.amount), 0), 0) as gross_profit,
        CASE WHEN COALESCE(SUM(DISTINCT i.total), 0) > 0
          THEN COALESCE((SUM(DISTINCT i.total) - COALESCE(SUM(p_out.amount), 0)) * 100.0 / SUM(DISTINCT i.total), 0)
          ELSE 0
        END as margin_pct
      FROM leads l
      LEFT JOIN invoices i ON i.lead_id = l.id AND i.status != 'cancelled'
      LEFT JOIN payments p_out ON p_out.lead_id = l.id AND p_out.type = 'outgoing'
      WHERE l.is_deleted = 0 AND l.status = 'won' {DATE_FILTER}
      GROUP BY l.id
      {ORDER_BY}
    `,
        columns: [
            { name: 'lead_title', type: 'text' },
            { name: 'destination', type: 'text' },
            { name: 'assigned_to', type: 'text' },
            { name: 'total_invoiced', type: 'currency' },
            { name: 'total_costs', type: 'currency' },
            { name: 'gross_profit', type: 'currency' },
            { name: 'margin_pct', type: 'percentage' },
        ],
    },
    {
        id: 'payment_method_breakdown',
        name: 'Payment Method Breakdown',
        category: 'financial',
        description: 'Revenue collected broken down by payment method.',
        requiredRole: ['admin', 'accountant'],
        allowedFilters: ['method'],
        allowedGroupBy: ['method'],
        defaultSort: { column: 'total_collected', order: 'desc' },
        baseQuery: `
      SELECT
        method,
        COUNT(id) as transaction_count,
        SUM(amount) as total_collected,
        COALESCE(SUM(amount) * 100.0 / NULLIF((SELECT SUM(amount) FROM payments WHERE type = 'incoming'), 0), 0) as pct_of_total
      FROM payments
      WHERE type = 'incoming' {DATE_FILTER}
      GROUP BY method
      {ORDER_BY}
    `,
        columns: [
            { name: 'method', type: 'text' },
            { name: 'transaction_count', type: 'number' },
            { name: 'total_collected', type: 'currency' },
            { name: 'pct_of_total', type: 'percentage' },
        ],
    },
    {
        id: 'refund_report',
        name: 'Refund Report',
        category: 'financial',
        description: 'Outgoing refunds and credit notes issued.',
        requiredRole: ['admin', 'accountant'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'refund_amount', order: 'desc' },
        baseQuery: `
      SELECT
        method,
        COUNT(id) as refund_count,
        SUM(amount) as refund_amount
      FROM payments
      WHERE type = 'refund' {DATE_FILTER}
      GROUP BY method
      {ORDER_BY}
    `,
        columns: [
            { name: 'method', type: 'text' },
            { name: 'refund_count', type: 'number' },
            { name: 'refund_amount', type: 'currency' },
        ],
    },
    {
        id: 'advance_payments',
        name: 'Advance Payments',
        category: 'financial',
        description: 'Advance payments received before invoice issuance.',
        requiredRole: ['admin', 'accountant'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'total_advance', order: 'desc' },
        baseQuery: `
      SELECT
        strftime('%Y-%m', date) as month,
        COUNT(id) as payment_count,
        SUM(amount) as total_advance
      FROM payments
      WHERE type = 'advance' {DATE_FILTER}
      GROUP BY strftime('%Y-%m', date)
      {ORDER_BY}
    `,
        columns: [
            { name: 'month', type: 'text' },
            { name: 'payment_count', type: 'number' },
            { name: 'total_advance', type: 'currency' },
        ],
    },
    {
        id: 'daily_cash',
        name: 'Daily Cash Flow',
        category: 'financial',
        description: 'Day-by-day cash inflows and outflows.',
        requiredRole: ['admin', 'accountant'],
        allowedFilters: [],
        allowedGroupBy: [],
        defaultSort: { column: 'payment_date', order: 'asc' },
        baseQuery: `
      SELECT
        date as payment_date,
        SUM(CASE WHEN type = 'incoming' THEN amount ELSE 0 END) as inflow,
        SUM(CASE WHEN type = 'outgoing' THEN amount ELSE 0 END) as outflow,
        SUM(CASE WHEN type = 'incoming' THEN amount ELSE -amount END) as net_cash
      FROM payments
      WHERE 1 = 1 {DATE_FILTER}
      GROUP BY date
      {ORDER_BY}
    `,
        columns: [
            { name: 'payment_date', type: 'date' },
            { name: 'inflow', type: 'currency' },
            { name: 'outflow', type: 'currency' },
            { name: 'net_cash', type: 'currency' },
        ],
    },
];

export function registerFinancialReports() {
    reportRegistry.registerMany(financialReports);
}
