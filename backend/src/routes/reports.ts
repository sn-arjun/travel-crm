import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { AppContext } from '../types';
import { reportEngine } from '../services/report-engine';
import { reportRegistry } from '../services/report-registry';
import { ReportCache } from '../services/report-cache';
import { resolveDateRange } from '../utils/date-range';
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

    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.substring(0, 7) + '-01';

    const [pipelineResult, hotLeadsResult, followUpResult, recentActivitiesResult, financialResult, collectionsResult] = await Promise.all([
      // 1. Pipeline summary
      tenantDb.prepare(
        `SELECT status, COUNT(*) as count, COALESCE(SUM(budget), 0) as total_value
         FROM leads WHERE is_deleted = 0
         GROUP BY status`
      ).all(),
      // 2. Hot leads (top 5)
      tenantDb.prepare(
        `SELECT l.id, l.title, l.destination, l.budget, l.status, l.priority, l.created_at as createdAt,
                l.contact_id as contactId, l.travel_date as travelDate
         FROM leads l
         WHERE l.priority = 'hot' AND l.status NOT IN ('won', 'lost') AND l.is_deleted = 0
         ORDER BY l.created_at DESC LIMIT 5`
      ).all(),
      // 3. Follow-up counts
      tenantDb.prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN scheduled_at < datetime('now') AND completed_at IS NULL THEN 1 ELSE 0 END) as overdue,
                SUM(CASE WHEN completed_at IS NULL THEN 1 ELSE 0 END) as pending
         FROM follow_ups WHERE created_by = ?`
      ).bind(userId).all(),
      // 4. Recent activities
      tenantDb.prepare(
        `SELECT id, lead_id as leadId, type, description, created_at as createdAt, created_by as createdBy
         FROM lead_activities
         ORDER BY created_at DESC LIMIT 10`
      ).all(),
      // 5. Financial summary
      tenantDb.prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN status = 'paid' AND DATE(updated_at) >= DATE(?) THEN total ELSE 0 END), 0) as revenue_this_month,
          COALESCE(SUM(CASE WHEN status IN ('sent', 'partially_paid', 'overdue') THEN balance_due ELSE 0 END), 0) as outstanding,
          COALESCE(SUM(CASE WHEN status IN ('sent', 'partially_paid', 'overdue') AND due_date < ? THEN balance_due ELSE 0 END), 0) as overdue,
          COALESCE(SUM(CASE WHEN DATE(created_at) >= DATE(?) THEN total ELSE 0 END), 0) as invoiced_this_month
         FROM invoices
         WHERE type IN ('tax_invoice', 'proforma') AND status != 'cancelled'`
      ).bind(monthStart, today, monthStart).first(),
      // 6. Collections this month
      tenantDb.prepare(
        `SELECT COALESCE(SUM(amount), 0) as collections
         FROM payments
         WHERE type = 'incoming' AND DATE(date) >= DATE(?)`
      ).bind(monthStart).first(),
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
    const today = new Date().toISOString().split('T')[0];

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
    const today = new Date().toISOString().split('T')[0];

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

    // Resolve preset to concrete date range if provided
    if (datePreset && !dateFrom && !dateTo) {
      try {
        const resolved = resolveDateRange(datePreset, dateFrom, dateTo);
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

    // Try cache first
    const kv = (c.env as any).REPORT_CACHE;
    if (kv && tenantId) {
      const cache = new ReportCache(kv);
      const cached = await cache.get(tenantId, id, params);
      if (cached) {
        c.header('X-Cache', 'HIT');
        return success(c, cached);
      }
    }

    const result = await reportEngine.execute(tenantDb, id, params, userId, role);

    // Store in cache
    if (kv && tenantId) {
      const cache = new ReportCache(kv);
      await cache.set(tenantId, id, params, result);
    }
    c.header('X-Cache', 'MISS');

    return success(c, result);
  } catch (err: any) {
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

    if (exportDatePreset && !exportDateFrom && !exportDateTo) {
      try {
        const resolved = resolveDateRange(exportDatePreset, exportDateFrom, exportDateTo);
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
      const buffer = await pdfExportService.generatePdf(reportDef, result.data);
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
