import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { AppContext } from '../types';
import { reportEngine } from '../services/report-engine';
import { reportRegistry } from '../services/report-registry';
import { success, error } from '../utils/response';
import { excelExportService } from '../services/exports/excel-export';
import { pdfExportService } from '../services/exports/pdf-export';

const reportRoutes = new Hono<AppContext>();

reportRoutes.use('*', authMiddleware);

// Existing routes ...
reportRoutes.get('/', async (c) => {
  const reports = reportRegistry.getAll();
  return success(c, reports);
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

    const sortOrder = query.sort_order || query.sortOrder;

    const result = await reportEngine.execute(tenantDb, id, {
      date_from: query.date_from || query.startDate,
      date_to: query.date_to || query.endDate,
      date_preset: query.date_preset || query.datePreset,
      group_by: query.group_by || query.groupBy,
      sort_by: query.sort_by || query.sortBy,
      sort_order: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : undefined,
      page: query.page ? parseInt(query.page) : undefined,
      per_page: (query.per_page || query.limit) ? parseInt(query.per_page || query.limit) : undefined,
      ...parsedFilters
    }, userId, role);

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

    // Export doesn't use pagination to get all data
    const result = await reportEngine.execute(tenantDb, id, {
      date_from: query.date_from || query.startDate,
      date_to: query.date_to || query.endDate,
      date_preset: query.date_preset || query.datePreset,
      group_by: query.group_by || query.groupBy,
      sort_by: query.sort_by || query.sortBy,
      sort_order: (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : undefined,
      page: 1,
      per_page: 10000,
      ...parsedFilters
    }, userId, role);

    const reportDef = reportRegistry.get(id);
    if (!reportDef) throw new Error('Report not found');

    if (format === 'excel') {
      const buffer = await excelExportService.generateExcel(reportDef, result.data);
      c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      c.header('Content-Disposition', `attachment; filename="${id}_export.xlsx"`);
      return c.body(buffer as any);
    } else if (format === 'pdf') {
      const buffer = await pdfExportService.generatePdf(reportDef, result.data);
      c.header('Content-Type', 'application/pdf');
      c.header('Content-Disposition', `attachment; filename="${id}_export.pdf"`);
      return c.body(buffer as any);
    } else {
      return error(c, 'Invalid export format. Supported: excel, pdf', 400);
    }
  } catch (err: any) {
    return error(c, err.message, 400);
  }
});

export default reportRoutes;
