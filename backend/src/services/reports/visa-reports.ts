import { ReportDefinition } from '../../types/report';
import { reportRegistry } from '../report-registry';

const visaReports: ReportDefinition[] = [
    {
        id: 'visa_status_summary',
        name: 'Visa Status Summary',
        category: 'visa',
        description: 'Overview of active visa applications by status.',
        requiredRole: ['admin', 'sales_manager', 'salesperson'],
        allowedFilters: ['status', 'country'],
        allowedGroupBy: ['country', 'status'],
        defaultSort: { column: 'application_count', order: 'desc' },
        // visa_applications have no assigned_to; a salesperson sees the applications they created
        ownerColumn: 'created_by',
        baseQuery: `
      SELECT
        status,
        country,
        COUNT(id) as application_count
      FROM visa_applications
      WHERE 1 = 1 {DATE_FILTER}
      GROUP BY status, country
      {ORDER_BY}
    `,
        columns: [
            { name: 'status', type: 'status' },
            { name: 'country', type: 'text' },
            { name: 'application_count', type: 'number' },
        ],
    },
    {
        id: 'pending_documents',
        name: 'Pending Documents',
        category: 'visa',
        description: 'Visa applications with incomplete document submission.',
        requiredRole: ['admin', 'sales_manager', 'salesperson'],
        allowedFilters: ['country'],
        allowedGroupBy: ['country'],
        defaultSort: { column: 'va.created_at', order: 'asc' },
        dateColumn: 'va.created_at',
        ownerColumn: 'va.created_by',
        baseQuery: `
      SELECT
        va.id as application_id,
        va.country,
        va.status,
        va.created_at,
        ld.travel_date as travel_date,
        COUNT(vc.id) as total_checklist_items,
        SUM(CASE WHEN vc.is_received = 0 THEN 1 ELSE 0 END) as pending_items,
        CAST(julianday('now') - julianday(va.created_at) AS INTEGER) as age_days
      FROM visa_applications va
      LEFT JOIN leads ld ON ld.id = va.lead_id
      LEFT JOIN visa_checklist_items vc ON vc.visa_application_id = va.id
      WHERE va.is_deleted = 0 AND va.status NOT IN ('approved', 'rejected', 'cancelled') {DATE_FILTER}
      GROUP BY va.id
      HAVING SUM(CASE WHEN vc.is_received = 0 THEN 1 ELSE 0 END) > 0
      {ORDER_BY}
    `,
        columns: [
            { name: 'application_id', type: 'text' },
            { name: 'country', type: 'text' },
            { name: 'status', type: 'status' },
            { name: 'created_at', type: 'date' },
            { name: 'travel_date', type: 'date' },
            { name: 'total_checklist_items', type: 'number' },
            { name: 'pending_items', type: 'number' },
            { name: 'age_days', type: 'number' },
        ],
    },
    {
        id: 'visa_success_rate',
        name: 'Visa Success Rate',
        category: 'visa',
        description: 'Approval and rejection rates by country.',
        requiredRole: ['admin', 'sales_manager'],
        allowedFilters: ['country'],
        allowedGroupBy: ['country'],
        defaultSort: { column: 'success_rate', order: 'desc' },
        baseQuery: `
      SELECT
        country,
        COUNT(id) as total_applications,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN 1.0 ELSE 0.0 END) / NULLIF(
          SUM(CASE WHEN status IN ('approved', 'rejected') THEN 1 ELSE 0 END), 0
        ) * 100, 0) as success_rate,
        COALESCE(AVG(CASE WHEN status = 'approved' THEN
          CAST(julianday(updated_at) - julianday(created_at) AS REAL)
        END), 0) as avg_processing_days
      FROM visa_applications
      WHERE status IN ('approved', 'rejected') {DATE_FILTER}
      GROUP BY country
      {ORDER_BY}
    `,
        columns: [
            { name: 'country', type: 'text' },
            { name: 'total_applications', type: 'number' },
            { name: 'approved', type: 'number' },
            { name: 'rejected', type: 'number' },
            { name: 'success_rate', type: 'percentage' },
            { name: 'avg_processing_days', type: 'number' },
        ],
    },
];

export function registerVisaReports() {
    reportRegistry.registerMany(visaReports);
}
