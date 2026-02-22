import { Hono } from 'hono';
import type { AppContext } from '../types';
import { requirePermission } from '../middleware/rbac';
import { success } from '../utils/response';

const reportsRoutes = new Hono<AppContext>();

// ============================================================
// GET /dashboard — Lead dashboard stats (TICKET-079)
// ============================================================

reportsRoutes.get('/dashboard', requirePermission('leads', 'view'), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const todayStart = `${today}T00:00:00.000Z`;
  const todayEnd = `${today}T23:59:59.999Z`;

  // Salesperson RBAC: only own leads
  const rbacFilter = role === 'salesperson' ? `AND l.assigned_to = '${userId}'` : '';

  const [
    pipelineResult,
    hotLeadsResult,
    todayFollowUpsResult,
    overdueFollowUpsResult,
    recentActivitiesResult,
  ] = await Promise.all([
    // Pipeline counts by status
    tenantDb.prepare(`
      SELECT status, COUNT(*) AS count
      FROM leads
      WHERE is_deleted = 0 ${rbacFilter.replace('l.', '')}
      GROUP BY status
    `).all(),

    // Hot leads (priority = 'hot', top 5 by updated_at)
    tenantDb.prepare(`
      SELECT l.*, c.name AS contact_name, u.name AS assigned_to_name,
             cb.name AS created_by_name
      FROM leads l
      JOIN contacts c ON c.id = l.contact_id
      LEFT JOIN users u ON u.id = l.assigned_to
      LEFT JOIN users cb ON cb.id = l.created_by
      WHERE l.is_deleted = 0 AND l.priority = 'hot'
            AND l.status NOT IN ('lost', 'completed')
            ${rbacFilter}
      ORDER BY l.updated_at DESC
      LIMIT 5
    `).all(),

    // Today's pending follow-ups count
    tenantDb.prepare(`
      SELECT COUNT(*) AS count
      FROM follow_ups f
      JOIN leads l ON l.id = f.lead_id
      WHERE f.status = 'pending'
            AND f.scheduled_at >= ?
            AND f.scheduled_at <= ?
            ${rbacFilter}
    `).bind(todayStart, todayEnd).all(),

    // Overdue follow-ups count
    tenantDb.prepare(`
      SELECT COUNT(*) AS count
      FROM follow_ups f
      JOIN leads l ON l.id = f.lead_id
      WHERE f.status = 'pending'
            AND f.scheduled_at < ?
            ${rbacFilter}
    `).bind(todayStart).all(),

    // Recent activities (last 10)
    tenantDb.prepare(`
      SELECT la.*, u.name AS created_by_name
      FROM lead_activities la
      JOIN leads l ON l.id = la.lead_id
      LEFT JOIN users u ON u.id = la.created_by
      WHERE l.is_deleted = 0 ${rbacFilter}
      ORDER BY la.created_at DESC
      LIMIT 10
    `).all(),
  ]);

  // Build pipeline counts map
  const pipelineCounts: Record<string, number> = {};
  for (const row of (pipelineResult.results ?? []) as Record<string, unknown>[]) {
    pipelineCounts[row.status as string] = row.count as number;
  }

  // Parse hot leads destinations
  const hotLeads = ((hotLeadsResult.results ?? []) as Record<string, unknown>[]).map((row) => {
    let destinations: string[] = [];
    if (row.destination && typeof row.destination === 'string') {
      try { destinations = JSON.parse(row.destination); } catch { /* ignore */ }
    }
    const { destination: _d, ...rest } = row;
    return { ...rest, destinations };
  });

  const todayFollowUpCount = ((todayFollowUpsResult.results?.[0] ?? { count: 0 }) as Record<string, unknown>).count as number;
  const overdueFollowUpCount = ((overdueFollowUpsResult.results?.[0] ?? { count: 0 }) as Record<string, unknown>).count as number;

  const recentActivities = (recentActivitiesResult.results ?? []) as Record<string, unknown>[];

  return success(c, {
    pipelineCounts,
    hotLeads,
    todayFollowUpCount,
    overdueFollowUpCount,
    recentActivities,
  });
});

// ============================================================
// GET /outstanding — Financial summary (receivables, payables, overdue)
// ============================================================

reportsRoutes.get('/outstanding', requirePermission('invoices', 'view'), async (c) => {
  const tenantDb = c.get('tenantDb');

  try {
    const [totalReceivableResult, totalPayableResult, overdueResult] = await Promise.all([
      // Total receivable (balance_due from unpaid/partially_paid invoices)
      tenantDb.prepare(`
        SELECT COALESCE(SUM(balance_due), 0) as total_receivable
        FROM invoices
        WHERE type IN ('tax_invoice', 'proforma', 'receipt')
        AND status IN ('sent', 'partially_paid', 'overdue')
      `).first(),

      // Total payable (balance from outgoing payments)
      tenantDb.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total_payable
        FROM payments
        WHERE type = 'outgoing' AND status IS NULL
      `).first(),

      // Overdue invoices (due_date < today)
      tenantDb.prepare(`
        SELECT COALESCE(SUM(balance_due), 0) as overdue_amount, COUNT(*) as overdue_count
        FROM invoices
        WHERE type IN ('tax_invoice', 'proforma', 'receipt')
        AND status IN ('sent', 'partially_paid', 'overdue')
        AND due_date < DATE('now')
      `).first(),
    ]);

    const totalReceivable = (totalReceivableResult as any)?.total_receivable || 0;
    const totalPayable = (totalPayableResult as any)?.total_payable || 0;
    const overdueAmount = (overdueResult as any)?.overdue_amount || 0;
    const overdueCount = (overdueResult as any)?.overdue_count || 0;

    return success(c, {
      totalReceivable,
      totalPayable,
      overdue: {
        amount: overdueAmount,
        count: overdueCount,
      },
    });
  } catch (err) {
    console.error('Error fetching outstanding amounts:', err);
    return success(c, {
      totalReceivable: 0,
      totalPayable: 0,
      overdue: { amount: 0, count: 0 },
    });
  }
});

// ============================================================
// GET /ageing — Invoice ageing breakdown by contact
// ============================================================

reportsRoutes.get('/ageing', requirePermission('invoices', 'view'), async (c) => {
  const tenantDb = c.get('tenantDb');
  const contactId = new URL(c.req.url).searchParams.get('contactId');

  try {
    let whereClause = "i.type IN ('tax_invoice', 'proforma', 'receipt') AND i.status IN ('sent', 'partially_paid', 'overdue')";
    const params: any[] = [];

    if (contactId) {
      whereClause += ' AND i.contact_id = ?';
      params.push(contactId);
    }

    const ageingData = await tenantDb.prepare(`
      SELECT
        c.id, c.name,
        COALESCE(SUM(CASE
          WHEN julianday('now') - julianday(i.due_date) <= 0 THEN i.balance_due
          ELSE 0
        END), 0) as current,
        COALESCE(SUM(CASE
          WHEN julianday('now') - julianday(i.due_date) > 0
          AND julianday('now') - julianday(i.due_date) <= 30 THEN i.balance_due
          ELSE 0
        END), 0) as days_30_60,
        COALESCE(SUM(CASE
          WHEN julianday('now') - julianday(i.due_date) > 30
          AND julianday('now') - julianday(i.due_date) <= 60 THEN i.balance_due
          ELSE 0
        END), 0) as days_60_90,
        COALESCE(SUM(CASE
          WHEN julianday('now') - julianday(i.due_date) > 90 THEN i.balance_due
          ELSE 0
        END), 0) as days_90_plus,
        COALESCE(SUM(i.balance_due), 0) as total
      FROM invoices i
      LEFT JOIN contacts c ON i.contact_id = c.id
      WHERE ${whereClause}
      GROUP BY c.id, c.name
      ORDER BY total DESC
    `).bind(...params).all();

    return success(c, ageingData.results || []);
  } catch (err) {
    console.error('Error calculating ageing:', err);
    return success(c, []);
  }
});

// ============================================================
// GET /dashboard/financial — Financial dashboard stats
// ============================================================

reportsRoutes.get('/dashboard/financial', requirePermission('invoices', 'view'), async (c) => {
  const tenantDb = c.get('tenantDb');
  const today = new Date().toISOString().split('T')[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .split('T')[0];

  try {
    const [
      revenueThisMonthResult,
      outstandingResult,
      overdueResult,
      collectionsThisMonthResult,
      invoiceCountResult,
      paymentCountResult,
    ] = await Promise.all([
      // Revenue this month (sum of total from paid invoices)
      tenantDb.prepare(`
        SELECT COALESCE(SUM(total), 0) as revenue
        FROM invoices
        WHERE type = 'tax_invoice'
        AND status = 'paid'
        AND DATE(created_at) >= DATE(?)
      `).bind(monthStart).first(),

      // Outstanding amount
      tenantDb.prepare(`
        SELECT COALESCE(SUM(balance_due), 0) as outstanding
        FROM invoices
        WHERE type IN ('tax_invoice', 'proforma')
        AND status IN ('sent', 'partially_paid', 'overdue')
      `).first(),

      // Overdue amount
      tenantDb.prepare(`
        SELECT COALESCE(SUM(balance_due), 0) as overdue, COUNT(*) as overdue_count
        FROM invoices
        WHERE type IN ('tax_invoice', 'proforma')
        AND status IN ('sent', 'partially_paid', 'overdue')
        AND due_date < DATE('now')
      `).first(),

      // Collections this month
      tenantDb.prepare(`
        SELECT COALESCE(SUM(amount), 0) as collections
        FROM payments
        WHERE type = 'incoming'
        AND DATE(date) >= DATE(?)
      `).bind(monthStart).first(),

      // Invoice count by status
      tenantDb.prepare(`
        SELECT status, COUNT(*) as count
        FROM invoices
        WHERE type IN ('tax_invoice', 'proforma')
        GROUP BY status
      `).all(),

      // Payment methods distribution
      tenantDb.prepare(`
        SELECT method, COUNT(*) as count, SUM(amount) as total_amount
        FROM payments
        WHERE type = 'incoming'
        AND DATE(date) >= DATE(?)
        GROUP BY method
      `).bind(monthStart).all(),
    ]);

    const invoiceStatusCounts: Record<string, number> = {};
    for (const row of (invoiceCountResult.results ?? []) as Record<string, unknown>[]) {
      invoiceStatusCounts[row.status as string] = row.count as number;
    }

    const paymentMethods: Record<string, any> = {};
    for (const row of (paymentCountResult.results ?? []) as Record<string, unknown>[]) {
      paymentMethods[row.method as string] = {
        count: row.count,
        totalAmount: row.total_amount,
      };
    }

    return success(c, {
      revenueThisMonth: (revenueThisMonthResult as any)?.revenue || 0,
      outstanding: (outstandingResult as any)?.outstanding || 0,
      overdue: {
        amount: (overdueResult as any)?.overdue || 0,
        count: (overdueResult as any)?.overdue_count || 0,
      },
      collectionsThisMonth: (collectionsThisMonthResult as any)?.collections || 0,
      invoiceStatusCounts,
      paymentMethods,
    });
  } catch (err) {
    console.error('Error fetching financial dashboard:', err);
    return success(c, {
      revenueThisMonth: 0,
      outstanding: 0,
      overdue: { amount: 0, count: 0 },
      collectionsThisMonth: 0,
      invoiceStatusCounts: {},
      paymentMethods: {},
    });
  }
});

export default reportsRoutes;
