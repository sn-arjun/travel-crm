import { D1Database } from '@cloudflare/workers-types';
import { ReportParams, ReportResult } from '../types/report';
import { reportRegistry } from './report-registry';
// @ts-ignore
import { HonoRequest } from 'hono';

export class ForbiddenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ForbiddenError';
    }
}

export class ReportEngine {

    private _buildQuery(
        report: any,
        params: ReportParams,
        userId: string,
        userRole: string,
        dateFrom?: string,
        dateTo?: string
    ): { query: string; bindings: any[] } {
        let query = report.baseQuery;
        const bindings: any[] = [];

        // Date range filter
        if (dateFrom && dateTo) {
            const dateColumn = params.date_column || report.dateColumn || 'created_at';
            const hasWhere = query.toUpperCase().includes(' WHERE ');
            const clause = hasWhere ? ' AND ' : ' WHERE ';

            if (query.includes('{DATE_FILTER}')) {
                query = query.replace('{DATE_FILTER}', ` AND ${dateColumn} BETWEEN ? AND ? `);
                bindings.push(dateFrom, dateTo);
            } else {
                const groupByIdx = query.toUpperCase().indexOf(' GROUP BY ');
                const orderByIdx = query.toUpperCase().indexOf(' ORDER BY ');
                const insertIdx = groupByIdx !== -1 ? groupByIdx : (orderByIdx !== -1 ? orderByIdx : query.length);

                const dateCondition = ` ${clause} ${dateColumn} BETWEEN ? AND ? `;
                query = query.slice(0, insertIdx) + dateCondition + query.slice(insertIdx);
                bindings.push(dateFrom, dateTo);
            }
        } else if (query.includes('{DATE_FILTER}')) {
            // No dates provided — remove placeholder so query is valid
            query = query.replace('{DATE_FILTER}', '');
        }

        // Auto-filter for salesperson role
        if (userRole === 'salesperson') {
            const hasWhere = query.toUpperCase().includes(' WHERE ');
            const clause = hasWhere ? ' AND ' : ' WHERE ';
            const assignedCondition = ` ${clause} assigned_to = ? `;

            const groupByIdx = query.toUpperCase().indexOf(' GROUP BY ');
            const orderByIdx = query.toUpperCase().indexOf(' ORDER BY ');
            const insertIdx = groupByIdx !== -1 ? groupByIdx : (orderByIdx !== -1 ? orderByIdx : query.length);

            query = query.slice(0, insertIdx) + assignedCondition + query.slice(insertIdx);
            bindings.push(userId);
        }

        // Dynamic filters based on allowedFilters
        for (const filter of report.allowedFilters) {
            if (params[filter] !== undefined && params[filter] !== null && params[filter] !== '') {
                const hasWhere = query.toUpperCase().includes(' WHERE ');
                const clause = hasWhere ? ' AND ' : ' WHERE ';
                const condition = ` ${clause} ${filter} = ? `;

                const groupByIdx = query.toUpperCase().indexOf(' GROUP BY ');
                const orderByIdx = query.toUpperCase().indexOf(' ORDER BY ');
                const insertIdx = groupByIdx !== -1 ? groupByIdx : (orderByIdx !== -1 ? orderByIdx : query.length);

                query = query.slice(0, insertIdx) + condition + query.slice(insertIdx);
                bindings.push(params[filter]);
            }
        }

        // Grouping
        if (params.group_by && report.allowedGroupBy.includes(params.group_by)) {
            if (query.includes('{GROUP_BY}')) {
                // Replace placeholder with requested GROUP BY
                query = query.replace('{GROUP_BY}', ` GROUP BY ${params.group_by} `);
            } else {
                // Replace existing hardcoded GROUP BY, or add one if none exists
                const groupByRegex = /\sGROUP BY\s+[\w.,\s]+?(?=\s*(?:HAVING|ORDER|LIMIT|\{ORDER_BY\}|$))/i;
                if (groupByRegex.test(query)) {
                    query = query.replace(groupByRegex, ` GROUP BY ${params.group_by} `);
                } else {
                    const orderByIdx = query.toUpperCase().indexOf(' ORDER BY ');
                    const insertIdx = orderByIdx !== -1 ? orderByIdx : query.length;
                    query = query.slice(0, insertIdx) + ` GROUP BY ${params.group_by} ` + query.slice(insertIdx);
                }
            }
        } else if (query.includes('{GROUP_BY}')) {
            query = query.replace('{GROUP_BY}', ' ');
        }

        // Sorting
        const sortCol = params.sort_by || report.defaultSort.column;
        const sortOrder = params.sort_order || report.defaultSort.order;

        if (query.includes('{ORDER_BY}')) {
            query = query.replace('{ORDER_BY}', ` ORDER BY ${sortCol} ${sortOrder} `);
        } else {
            const orderByIdx = query.toUpperCase().indexOf(' ORDER BY ');
            if (orderByIdx === -1) {
                query += ` ORDER BY ${sortCol} ${sortOrder} `;
            }
        }

        // Pagination
        const page = params.page ? Number(params.page) : 1;
        let perPage = params.per_page ? Number(params.per_page) : 25;
        if (perPage > 500) perPage = 500;

        query += ` LIMIT ? OFFSET ?`;
        bindings.push(perPage, (page - 1) * perPage);

        return { query, bindings };
    }

    async execute(
        db: D1Database,
        reportId: string,
        params: ReportParams,
        userId: string,
        userRole: string
    ): Promise<ReportResult> {
        const report = reportRegistry.get(reportId);
        if (!report) {
            throw new Error(`Report not found: ${reportId}`);
        }

        if (!report.requiredRole.includes(userRole as any)) {
            throw new ForbiddenError('Insufficient permissions for this report');
        }

        const currentReq = this._buildQuery(report, params, userId, userRole, params.date_from, params.date_to);
        const stmts: any[] = [db.prepare(currentReq.query).bind(...currentReq.bindings)];

        let prevReq;
        if (params.compare === 'true' && params.date_from && params.date_to) {
            const dateFromMs = new Date(params.date_from).getTime();
            const dateToMs = new Date(params.date_to).getTime();
            const diff = dateToMs - dateFromMs;

            const prevToMs = dateFromMs - 86400000; // 1 day before
            const prevFromMs = prevToMs - diff;

            const prevFrom = new Date(prevFromMs).toISOString().split('T')[0];
            const prevTo = new Date(prevToMs).toISOString().split('T')[0];

            prevReq = this._buildQuery(report, params, userId, userRole, prevFrom, prevTo);
            stmts.push(db.prepare(prevReq.query).bind(...prevReq.bindings));
        }

        console.log(`Executing Report: ${reportId}`);
        console.log(`Current Query: ${currentReq.query}`);
        console.log(`Bindings: ${JSON.stringify(currentReq.bindings)}`);

        let results;
        try {
            results = await db.batch(stmts);
        } catch (dbErr: any) {
            console.error(`SQL Error for report ${reportId}:`, dbErr.message || dbErr);
            throw new Error(`Report query failed: ${dbErr.message || 'Unknown database error'}`);
        }
        const currentData = results[0].results as Record<string, any>[];

        const page = params.page ? Number(params.page) : 1;
        let perPage = params.per_page ? Number(params.per_page) : 25;
        if (perPage > 500) perPage = 500;

        const response: ReportResult = {
            data: currentData,
            columns: report.columns,
            meta: {
                total: currentData.length === perPage ? -1 : currentData.length + ((page - 1) * perPage),
                page,
                per_page: perPage
            }
        };

        if (results.length > 1) {
            const prevData = results[1].results as Record<string, any>[];
            // Format prev data as a keyed map for easier lookup if grouped, or just single object if aggregated
            if (params.group_by) {
                const prevMap: Record<string, any> = {};
                for (const row of prevData) {
                    const key = row[params.group_by];
                    if (key) prevMap[key] = row;
                }
                response.previous_period = prevMap;
            } else {
                // Return the first row as an object if no grouping (e.g. summary reports)
                response.previous_period = prevData.length > 0 ? prevData[0] : {};
            }
        }

        return response;
    }
}

export const reportEngine = new ReportEngine();
