import { D1Database } from '@cloudflare/workers-types';
import { ReportParams, ReportResult } from '../types/report';
import { reportRegistry } from './report-registry';
import {
    DEFAULT_TIMEZONE,
    getTenantTimeZone,
    localDateString,
    localDateStartUtcIso,
    addDaysLocal,
    sqlOffsetModifier,
} from '../utils/tz';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Express a report date bound for the column it filters.
 *  - date-only column ('YYYY-MM-DD' local dates): instants become the tenant-local date.
 *  - timestamp column (UTC ISO strings): a bare local date becomes the UTC instant of local midnight
 *    (start) or of the last millisecond of that local day (end).
 */
export function normalizeDateBound(
    value: string,
    which: 'from' | 'to',
    columnType: 'date' | 'timestamp',
    timeZone: string,
): string {
    if (columnType === 'date') {
        return DATE_ONLY.test(value) ? value : localDateString(timeZone, new Date(value));
    }
    if (!DATE_ONLY.test(value)) return value;
    if (which === 'from') return localDateStartUtcIso(timeZone, value);
    return new Date(new Date(localDateStartUtcIso(timeZone, addDaysLocal(value, 1))).getTime() - 1).toISOString();
}
// @ts-ignore
import { HonoRequest } from 'hono';

/** Roles whose report rows are restricted to records they own (see `_buildQuery`). */
export const OWNER_FILTERED_ROLES = ['salesperson'] as const;

export class ForbiddenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ForbiddenError';
    }
}

/**
 * Index of the first top-level tail clause (GROUP BY / HAVING / ORDER BY / LIMIT, or the
 * {GROUP_BY} / {ORDER_BY} placeholders that expand to them later). WHERE conditions must be
 * spliced in before it. Anything inside parentheses (subqueries) or string literals is ignored.
 */
function findTailIndex(query: string): number {
    let depth = 0;
    let quote = '';
    for (let i = 0; i < query.length; i++) {
        const ch = query[i];
        if (quote) {
            if (ch === quote) quote = '';
            continue;
        }
        if (ch === "'" || ch === '"') { quote = ch; continue; }
        if (ch === '(') { depth++; continue; }
        if (ch === ')') { depth--; continue; }
        if (depth !== 0) continue;
        const prev = i === 0 ? ' ' : query[i - 1];
        if (!/\s/.test(prev) && ch !== '{') continue;
        const rest = query.slice(i, i + 12);
        if (/^(GROUP\s+BY|ORDER\s+BY)\b/i.test(rest) || /^(HAVING|LIMIT)\b/i.test(rest)
            || rest.startsWith('{ORDER_BY}') || rest.startsWith('{GROUP_BY}')) {
            return i;
        }
    }
    return query.length;
}

/** True when the outermost SELECT already has a WHERE (a WHERE inside a subquery does not count). */
function hasTopLevelWhere(query: string): boolean {
    let depth = 0;
    let quote = '';
    for (let i = 0; i < query.length; i++) {
        const ch = query[i];
        if (quote) {
            if (ch === quote) quote = '';
            continue;
        }
        if (ch === "'" || ch === '"') { quote = ch; continue; }
        if (ch === '(') { depth++; continue; }
        if (ch === ')') { depth--; continue; }
        if (depth === 0 && /\s/.test(i === 0 ? ' ' : query[i - 1]) && /^WHERE\b/i.test(query.slice(i, i + 6))) return true;
    }
    return false;
}

/** Add `condition` to the outer WHERE clause (creating it if needed), ahead of GROUP BY / ORDER BY / LIMIT. */
function addWhereCondition(query: string, condition: string): string {
    const idx = findTailIndex(query);
    const joiner = hasTopLevelWhere(query) ? ' AND ' : ' WHERE ';
    return query.slice(0, idx) + joiner + condition + ' ' + query.slice(idx);
}

export class ReportEngine {

    private _buildQuery(
        report: any,
        params: ReportParams,
        userId: string,
        userRole: string,
        dateFrom?: string,
        dateTo?: string,
        timeZone: string = DEFAULT_TIMEZONE,
        now: Date = new Date()
    ): { query: string; bindings: any[] } {
        // Tenant-calendar tokens: {TODAY} local date, {NOW} current instant, {TZ} SQLite offset modifier
        let query: string = report.baseQuery
            .split('{TODAY}').join(localDateString(timeZone, now))
            .split('{NOW}').join(now.toISOString())
            .split('{TZ}').join(sqlOffsetModifier(timeZone, now));
        const bindings: any[] = [];

        // Date range filter
        if (dateFrom && dateTo && !report.ignoreDateRange) {
            const dateColumn = params.date_column || report.dateColumn || 'created_at';
            const columnType: 'date' | 'timestamp' = report.dateColumnType === 'date' ? 'date' : 'timestamp';
            const fromBound = normalizeDateBound(dateFrom, 'from', columnType, timeZone);
            const toBound = normalizeDateBound(dateTo, 'to', columnType, timeZone);
            if (query.includes('{DATE_FILTER}')) {
                query = query.replace('{DATE_FILTER}', ` AND ${dateColumn} BETWEEN ? AND ? `);
                bindings.push(fromBound, toBound);
            } else {
                query = addWhereCondition(query, `${dateColumn} BETWEEN ? AND ?`);
                bindings.push(fromBound, toBound);
            }
        } else if (query.includes('{DATE_FILTER}')) {
            // No dates provided — remove placeholder so query is valid
            query = query.replace('{DATE_FILTER}', '');
        }

        // Auto-filter for salesperson role
        // The condition goes into WHERE, ahead of GROUP BY / ORDER BY / LIMIT. `ownerColumn` lets a
        // report name the column that records ownership (its main table may not have assigned_to).
        if ((OWNER_FILTERED_ROLES as readonly string[]).includes(userRole)) {
            const ownerColumn = report.ownerColumn || 'assigned_to';
            query = addWhereCondition(query, `${ownerColumn} = ?`);
            bindings.push(userId);
        }

        // Dynamic filters based on allowedFilters
        for (const filter of report.allowedFilters) {
            if (params[filter] !== undefined && params[filter] !== null && params[filter] !== '') {
                query = addWhereCondition(query, `${filter} = ?`);
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

        // The tenant's calendar decides 'today', month buckets and date bounds (not the server's UTC clock)
        const timeZone = await getTenantTimeZone(db);
        const nowInstant = new Date();
        const currentReq = this._buildQuery(report, params, userId, userRole, params.date_from, params.date_to, timeZone, nowInstant);
        // stmts[0] = current rows, stmts[1] = real total row count (same query without LIMIT/OFFSET)
        const countSql = `SELECT COUNT(*) AS total FROM (${currentReq.query.replace(/\s*LIMIT \? OFFSET \?\s*$/, '')})`;
        const stmts: any[] = [
            db.prepare(currentReq.query).bind(...currentReq.bindings),
            db.prepare(countSql).bind(...currentReq.bindings.slice(0, -2)),
        ];

        let prevReq;
        if (params.compare === 'true' && params.date_from && params.date_to) {
            const dateFromMs = new Date(params.date_from).getTime();
            const dateToMs = new Date(params.date_to).getTime();
            const diff = dateToMs - dateFromMs;

            const prevToMs = dateFromMs - 86400000; // 1 day before
            const prevFromMs = prevToMs - diff;

            // previous period expressed as local calendar dates (normalised per column type in _buildQuery)
            const prevFrom = localDateString(timeZone, new Date(prevFromMs));
            const prevTo = localDateString(timeZone, new Date(prevToMs));

            prevReq = this._buildQuery(report, params, userId, userRole, prevFrom, prevTo, timeZone, nowInstant);
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
        const countRow = (results[1]?.results as Record<string, any>[] | undefined)?.[0];
        const totalRows = Number(countRow?.total);

        const page = params.page ? Number(params.page) : 1;
        let perPage = params.per_page ? Number(params.per_page) : 25;
        if (perPage > 500) perPage = 500;

        const response: ReportResult = {
            data: currentData,
            columns: report.columns,
            meta: {
                // Real row count (never -1); falls back to rows seen so far if the count is unavailable
                total: Number.isFinite(totalRows) ? totalRows : currentData.length + ((page - 1) * perPage),
                page,
                per_page: perPage,
                hasMore: (Number.isFinite(totalRows) ? totalRows : currentData.length + ((page - 1) * perPage)) > page * perPage
            }
        };

        if (report.summarize) {
            // Totals cover the whole period, not the page that was asked for
            const allSql = currentReq.query.replace(/\s*LIMIT \? OFFSET \?\s*$/, '');
            const all = await db.prepare(allSql).bind(...currentReq.bindings.slice(0, -2)).all<Record<string, any>>();
            const columnType: 'date' | 'timestamp' = report.dateColumnType === 'date' ? 'date' : 'timestamp';
            const bounds = params.date_from && params.date_to && !report.ignoreDateRange
                ? {
                    from: normalizeDateBound(params.date_from, 'from', columnType, timeZone),
                    to: normalizeDateBound(params.date_to, 'to', columnType, timeZone),
                }
                : null;
            response.summary = await report.summarize({ db, rows: all.results ?? [], params, bounds });
        }

        if (results.length > 2) {
            const prevData = results[2].results as Record<string, any>[];
            // Format prev data as a keyed map for easier lookup if grouped, or just single object if aggregated
            // Full previous-period row set, same shape as the current-period rows (additive)
            response.previous_period_rows = prevData;
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
