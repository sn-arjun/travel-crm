import { ReportDefinition } from '../../types/report';
import { reportRegistry } from '../report-registry';

const visaReports: ReportDefinition[] = [
    {
        id: 'visa_status_summary',
        name: 'Visa Status Summary',
        category: 'visa',
        description: 'Overview of active visa applications by status.',
        requiredRole: ['admin', 'manager', 'salesperson'],
        allowedFilters: ['status', 'country'],
        allowedGroupBy: ['country', 'status'],
        defaultSort: { column: 'application_count', order: 'desc' },
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
];

export function registerVisaReports() {
    reportRegistry.registerMany(visaReports);
}
