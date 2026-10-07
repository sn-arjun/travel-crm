import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { AppContext } from '../types';
import { reportEngine, ForbiddenError } from '../services/report-engine';
import { reportRegistry } from '../services/report-registry';
import { ReportCache, reportCacheScope } from '../services/report-cache';
import { resolveDateRange } from '../utils/date-range';
import { tenantToday, sqlOffsetModifier } from '../utils/tz';
import { success, error } from '../utils/response';
import { excelExportService } from '../services/exports/excel-export';
import { pdfExportService } from '../services/exports/pdf-export';

const reportRoutes = new Hono<AppContext>();

reportRoutes.use('*', authMiddleware);

// Dashboard endpoint — aggregated lead stats for widgets
reportRoutes.get('/dashboard', async (c) => {
  try {
    const tenantDb = c.get('tenantDb') as any;
    const userId = c.get('userId') as string;

    const { timeZone: tz, today } = await tenantToday(c);
    const tzMod = sqlOffsetModifier(tz);
    const nowIso = new Date().toISOString();
    const monthStart = today.substring(0, 7) + '-01';

    // Optional date range (date_from/date_to or a date_preset). When omitted the behaviour is
    // unchanged: lists are unfiltered and the "this month" figures run from the 1st of the month.
    const dq = c.req.query();
    const dPreset = dq.date_preset || dq.datePreset;
    let rFrom: string | undefined = dq.date_from || dq.startDate;
    let rTo: string | undefined = dq.date_to || dq.endDate;
    if (dPreset && !rFrom && !rTo) {
      try {
        // presets resolve in the tenant's calendar; use the local dates (not the UTC instants' dates)
        const resolved = resolveDateRange(dPreset, undefined, undefined, tz);
        rFrom = resolved.fromDate;
        rTo = resolved.toDate;
      } catch { /* invalid preset -> no range */ }
    }
    const dayOf = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
    const from = dayOf(rFrom);
    const to = dayOf(rTo);
    // Range clause for list-style figures (only filters when a range was supplied)
    const rangeClause = (col: string): { sql: string; params: string[] } => {
      const parts: string[] = [];
      const params: string[] = [];
      // timestamps are UTC: shift to the tenant's local calendar day before comparing dates
      if (from) { parts.push(`DATE(${col}, '${tzMod}') >= DATE(?)`); params.push(from); }
      if (to) { parts.push(`DATE(${col}, '${tzMod}') <= DATE(?)`); params.push(to); }
      return { sql: parts.length ? ' AND ' + parts.join(' AND ') : '', params };
    };
    const leadRange = rangeClause('created_at');
    const hotRange = rangeClause('l.created_at');
    const actRange = rangeClause('created_at');
    const fuRange = rangeClause('scheduled_at');
    // Financial window: default = month to date
    const finFrom = from ?? monthStart;
    const finTo = to ?? '9999-12-31';

    const [pipelineResult, hotLeadsResult, followUpResult, recentActivitiesResult, financialResult, collectionsResult] = await Promise.all([
      // 1. Pipeline summary
      tenantDb.prepare(
        `SELECT status, COUNT(*) as count, COALESCE(SUM(budget), 0) as total_value
         FROM leads WHERE is_deleted = 0${leadRange.sql}
         GROUP BY status`
      ).bind(...leadRange.params).all(),
      // 2. Hot leads (top 5)
      tenantDb.prepare(
        `SELECT l.id, l.title, l.destination, l.budget, l.status, l.priority, l.created_at as createdAt,
                l.contact_id as contactId, l.travel_date as travelDate
         FROM leads l
         WHERE l.priority = 'hot' AND l.status NOT IN ('won', 'lost') AND l.is_deleted = 0${hotRange.sql}
         ORDER BY l.created_at DESC LIMIT 5`
      ).bind(...hotRange.params).all(),
      // 3. Follow-up counts
      tenantDb.prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN scheduled_at < ? AND completed_at IS NULL THEN 1 ELSE 0 END) as overdue,
                SUM(CASE WHEN completed_at IS NULL THEN 1 ELSE 0 END) as pending
         FROM follow_ups WHERE created_by = ?${fuRange.sql}`
      ).bind(nowIso, userId, ...fuRange.params).all(),
      // 4. Recent activities
      tenantDb.prepare(
        `SELECT id, lead_id as leadId, type, content as description, created_at as createdAt, created_by as createdBy
         FROM lead_activities
         WHERE 1 = 1${actRange.sql}
         ORDER BY created_at DESC LIMIT 10`
      ).bind(...actRange.params).all(),
      // 5. Financial summary
      tenantDb.prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN status = 'paid' AND DATE(updated_at, '${tzMod}') >= DATE(?) AND DATE(updated_at, '${tzMod}') <= DATE(?) THEN total ELSE 0 END), 0) as revenue_this_month,
          COALESCE(SUM(CASE WHEN status IN ('sent', 'partially_paid', 'overdue') THEN balance_due ELSE 0 END), 0) as outstanding,
          COALESCE(SUM(CASE WHEN status IN ('sent', 'partially_paid', 'overdue') AND due_date < ? THEN balance_due ELSE 0 END), 0) as overdue,
          COALESCE(SUM(CASE WHEN DATE(created_at, '${tzMod}') >= DATE(?) AND DATE(created_at, '${tzMod}') <= DATE(?) THEN total ELSE 0 END), 0) as invoiced_this_month
         FROM invoices
         WHERE type IN ('tax_invoice', 'proforma') AND status != 'cancelled'`
      ).bind(finFrom, finTo, today, finFrom, finTo).first(),
      // 6. Collections in the window
      tenantDb.prepare(
        `SELECT COALESCE(SUM(amount), 0) as collections
         FROM payments
         WHERE type = 'incoming' AND DATE(date) >= DATE(?) AND DATE(date) <= DATE(?)`
      ).bind(finFrom, finTo).first(),
    ]);

    return success(c, {
      pipeline: pipelineResult.results ?? [],
      hotLeads: hotLeadsResult.results ?? [],
      followUps: (followUpResult.results ?? [])[0] ?? { total: 0, overdue: 0, pending: 0 },
      recentActivities: recentActivitiesResult.results ?? [],
      financial: {
        revenueThisMonth: financialResult?.revenue_this_month || 0,
        outstanding: financialResult?.outstanding || 0,
        overdue: financialResult?.overdue || 0,
        invoicedThisMonth: financialResult?.invoiced_this_month || 0,
        collectionsThisMonth: collectionsResult?.collections || 0,
      },
    });
  } catch (err: any) {
    return error(c, err.message, 500);
  }
});

// Existing routes ...
reportRoutes.get('/', async (c) => {
  const reports = reportRegistry.getAll();
  return success(c, reports);
});

// ============================================================
// GET /outstanding — Outstanding receivables/payables dashboard
// ============================================================

reportRoutes.get('/outstanding', async (c) => {
  try {
    const tenantDb = c.get('tenantDb') as any;
    const { today } = await tenantToday(c);

    const result = await tenantDb
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN type IN ('tax_invoice', 'proforma') AND status IN ('sent', 'partially_paid', 'overdue') THEN balance_due ELSE 0 END), 0) as total_receivable,
          COALESCE(SUM(CASE WHEN type IN ('tax_invoice', 'proforma') AND status IN ('sent', 'partially_paid', 'overdue') AND due_date < ? THEN balance_due ELSE 0 END), 0) as overdue_receivable,
          COALESCE(SUM(CASE WHEN status IN ('sent', 'partially_paid', 'overdue') AND due_date >= ? AND (julianday(?) - julianday(due_date)) <= 30 THEN balance_due ELSE 0 END), 0) as current_30,
          COALESCE(SUM(CASE WHEN status IN ('sent', 'partially_paid', 'overdue') AND (julianday(?) - julianday(due_date)) BETWEEN 31 AND 60 THEN balance_due ELSE 0 END), 0) as days_31_60,
          COALESCE(SUM(CASE WHEN status IN ('sent', 'partially_paid', 'overdue') AND (julianday(?) - julianday(due_date)) BETWEEN 61 AND 90 THEN balance_due ELSE 0 END), 0) as days_61_90,
          COALESCE(SUM(CASE WHEN status IN ('sent', 'partially_paid', 'overdue') AND (julianday(?) - julianday(due_date)) > 90 THEN balance_due ELSE 0 END), 0) as days_90_plus
        FROM invoices
        WHERE status != 'cancelled'
      `)
      .bind(today, today, today, today, today, today)
      .first();

    // Top overdue invoices
    const topOverdue = await tenantDb
      .prepare(`
        SELECT i.id, i.invoice_number, i.total, i.balance_due, i.due_date, c.name as contact_name
        FROM invoices i
        LEFT JOIN contacts c ON i.contact_id = c.id
        WHERE i.status IN ('sent', 'partially_paid', 'overdue') AND i.due_date < ? AND i.status != 'cancelled'
        ORDER BY i.balance_due DESC
        LIMIT 10
      `)
      .bind(today)
      .all();

    return success(c, {
      totalReceivable: (result as any)?.total_receivable || 0,
      overdueReceivable: (result as any)?.overdue_receivable || 0,
      ageing: {
        current: (result as any)?.current_30 || 0,
        days30: (result as any)?.days_31_60 || 0,
        days60: (result as any)?.days_61_90 || 0,
        days90Plus: (result as any)?.days_90_plus || 0,
      },
      topOverdueInvoices: topOverdue.results || [],
    });
  } catch (err: any) {
    return error(c, err.message || 'Failed to fetch outstanding data', 500);
  }
});

// ============================================================
// GET /ageing — Detailed ageing report by contact
// ============================================================

reportRoutes.get('/ageing', async (c) => {
  try {
    const tenantDb = c.get('tenantDb') as any;
    const { today } = await tenantToday(c);

    const ageingData = await tenantDb
      .prepare(`
        SELECT
          c.id as contact_id,
          c.name as contact_name,
          COALESCE(SUM(i.balance_due), 0) as total_outstanding,
          COALESCE(SUM(CASE WHEN julianday(?) - julianday(i.due_date) <= 30 THEN i.balance_due ELSE 0 END), 0) as current_30,
          COALESCE(SUM(CASE WHEN julianday(?) - julianday(i.due_date) BETWEEN 31 AND 60 THEN i.balance_due ELSE 0 END), 0) as days_31_60,
          COALESCE(SUM(CASE WHEN julianday(?) - julianday(i.due_date) BETWEEN 61 AND 90 THEN i.balance_due ELSE 0 END), 0) as days_61_90,
          COALESCE(SUM(CASE WHEN julianday(?) - julianday(i.due_date) > 90 THEN i.balance_due ELSE 0 END), 0) as days_90_plus
        FROM invoices i
        JOIN contacts c ON i.contact_id = c.id
        WHERE i.status IN ('sent', 'partially_paid', 'overdue')
          AND i.status != 'cancelled'
        GROUP BY c.id
        ORDER BY total_outstanding DESC
      `)
      .bind(today, today, today, today)
      .all();

    return success(c, ageingData.results || []);
  } catch (err: any) {
    return error(c, err.message || 'Failed to fetch ageing data', 500);
  }
});

// DELETE /cache — invalidate all report caches for tenant
reportRoutes.delete('/cache', async (c) => {
  try {
    const kv = (c.env as any).REPORT_CACHE;
    const tenantId = c.get('tenantId') as string;
    if (kv && tenantId) {
      const cache = new ReportCache(kv);
      await cache.invalidate(tenantId);
    }
    return success(c, { invalidated: true });
  } catch (err: any) {
    return error(c, err.message, 500);
  }
});

// DELETE /:id/cache — invalidate cache for a specific report
reportRoutes.delete('/:id/cache', async (c) => {
  try {
    const id = c.req.param('id');
    const kv = (c.env as any).REPORT_CACHE;
    const tenantId = c.get('tenantId') as string;
    if (kv && tenantId) {
      const cache = new ReportCache(kv);
      await cache.invalidate(tenantId, id);
    }
    return success(c, { invalidated: true, reportId: id });
  } catch (err: any) {
    return error(c, err.message, 500);
  }
});

reportRoutes.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const query = c.req.query();

    let parsedFilters: any = {};
    if (query.filters) {
      try { parsedFilters = JSON.parse(query.filters); } catch (e) { }
    }

    const tenantDb = c.get('tenantDb') as any;
    const userId = c.get('userId') as string;
    const role = c.get('role') as string;
    const tenantId = c.get('tenantId') as string;

    const sortOrder = query.sort_order || query.sortOrder;
    const datePreset = query.date_preset || query.datePreset;
    let dateFrom = query.date_from || query.startDate;
    let dateTo = query.date_to || query.endDate;
    const { timeZone: tz } = await tenantToday(c);

    // Resolve preset to concrete date range if provided (in the tenant's calendar)
    if (datePreset && !dateFrom && !dateTo) {
      try {
        const resolved = resolveDateRange(datePreset, dateFrom, dateTo, tz);
        dateFrom = resolved.from;
        dateTo = resolved.to;
      } catch (e) { /* ignore invalid presets — engine handles no-date case */ }
    }

    const params = {
      date_from: dateFrom,
      date_to: dateTo,
      date_preset: datePreset,
      group_by: query.group_by || query.groupBy,
      sort_by: query.sort_by || query.sortBy,
      sort_order: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : undefined,
      page: query.page ? parseInt(query.page) : undefined,
      per_page: (query.per_page || query.limit) ? parseInt(query.per_page || query.limit) : undefined,
      compare: query.compare,
      ...parsedFilters
    };

    // Try cache first (keyed by the caller's data-visibility scope, never shared across scopes)
    const cacheScope = reportCacheScope(role, userId);
    const kv = (c.env as any).REPORT_CACHE;
    if (kv && tenantId) {
      const cache = new ReportCache(kv);
      const cached = await cache.get(tenantId, id, params, cacheScope);
      if (cached) {
        c.header('X-Cache', 'HIT');
        return success(c, cached);
      }
    }

    const result = await reportEngine.execute(tenantDb, id, params, userId, role);

    // Store in cache
    if (kv && tenantId) {
      const cache = new ReportCache(kv);
      await cache.set(tenantId, id, params, cacheScope, result);
    }
    c.header('X-Cache', 'MISS');

    return success(c, result);
  } catch (err: any) {
    if (err instanceof ForbiddenError) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: err.message } }, 403);
    }
    if (err.message.includes('not found')) {
      return error(c, err.message, 404, { code: 'NOT_FOUND' });
    }
    return error(c, err.message, 400);
  }
});

// NEW EXPORT ROUTE
reportRoutes.get('/:id/export', async (c) => {
  try {
    const id = c.req.param('id');
    const query = c.req.query();
    const format = query.format || 'excel';

    let parsedFilters: any = {};
    if (query.filters) {
      try { parsedFilters = JSON.parse(query.filters); } catch (e) { }
    }

    const tenantDb = c.get('tenantDb') as any;
    const userId = c.get('userId') as string;
    const role = c.get('role') as string;

    const sortOrder = query.sort_order || query.sortOrder;
    const exportDatePreset = query.date_preset || query.datePreset;
    let exportDateFrom = query.date_from || query.startDate;
    let exportDateTo = query.date_to || query.endDate;
    const { timeZone: exportTz } = await tenantToday(c);

    if (exportDatePreset && !exportDateFrom && !exportDateTo) {
      try {
        const resolved = resolveDateRange(exportDatePreset, exportDateFrom, exportDateTo, exportTz);
        exportDateFrom = resolved.from;
        exportDateTo = resolved.to;
      } catch (e) { /* ignore */ }
    }

    const reportDef = reportRegistry.get(id);
    if (!reportDef) throw new Error('Report not found');

    // Export doesn't use pagination to get all data
    const result = await reportEngine.execute(tenantDb, id, {
      date_from: exportDateFrom,
      date_to: exportDateTo,
      date_preset: exportDatePreset,
      group_by: query.group_by || query.groupBy,
      sort_by: query.sort_by || query.sortBy,
      sort_order: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : undefined,
      page: 1,
      per_page: 10000,
      ...parsedFilters
    }, userId, role);

    const dateLabel = exportDatePreset || (exportDateFrom ? `${exportDateFrom.split('T')[0]}_to_${exportDateTo?.split('T')[0]}` : 'all');
    const fileName = `${id}_${dateLabel}`;

    if (format === 'excel') {
      const buffer = await excelExportService.generateExcel(reportDef, result.data);
      c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      c.header('Content-Disposition', `attachment; filename="${fileName}.xlsx"`);
      return c.body(buffer as any);
    } else if (format === 'pdf') {
      const buffer = await pdfExportService.generatePdf(reportDef, result.data, exportTz);
      c.header('Content-Type', 'application/pdf');
      c.header('Content-Disposition', `attachment; filename="${fileName}.pdf"`);
      return c.body(buffer as any);
    } else {
      return error(c, 'Invalid export format. Supported: excel, pdf', 400);
    }
  } catch (err: any) {
    return error(c, err.message, 400);
  }
});

export default reportRoutes;
