import { Hono } from 'hono';
import { zValidator } from '../utils/validator';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, created, paginated, error, notFound, forbidden } from '../utils/response';
import { logActivity } from '../utils/activity-logger';
import { notifications } from '../db/tenant-schema';
import { broadcastToTenant } from '../utils/realtime';
import { tenantToday } from '../utils/tz';

const paymentRoutes = new Hono<AppContext>();

// ============================================================
// Zod Schemas
// ============================================================

const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  method: z.string().min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
  date: z.string().optional(), // defaults to the tenant-local today in the handler
  receiptUrl: z.string().optional(),
});

const linkAdvancePaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
});

// ============================================================
// RBAC Check
// ============================================================

function checkPaymentPermission(role: string): boolean {
  return ['admin', 'sales_manager', 'accountant'].includes(role);
}

// ============================================================
// POST / — Record payment
// ============================================================

paymentRoutes.post('/', zValidator('json', recordPaymentSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');

  if (!checkPaymentPermission(role)) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can record payments');
  }

  const data = c.req.valid('json');

  try {
    // Verify invoice exists
    const invoice = await tenantDb
      .prepare(
        `SELECT id, contact_id, total, paid_amount, balance_due, status
         FROM invoices WHERE id = ?1`
      )
      .bind(data.invoiceId)
      .first<{
        id: string;
        contact_id: string;
        total: number;
        paid_amount: number;
        balance_due: number;
        status: string;
      }>();

    if (!invoice) {
      return notFound(c, 'Invoice');
    }

    // Validate payment amount (should not exceed balance due)
    if (data.amount > invoice.balance_due + 0.01) {
      // +0.01 for floating point tolerance
      return error(c, `Payment amount exceeds balance due (${invoice.balance_due})`, 400);
    }

    // Create payment record
    const paymentId = generateId();
    const now = new Date().toISOString();

    await tenantDb
      .prepare(
        `INSERT INTO payments (
          id, invoice_id, contact_id, amount, currency, method, reference,
          type, date, notes, receipt_url, created_by, created_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
        )`
      )
      .bind(
        paymentId,
        data.invoiceId,
        invoice.contact_id,
        data.amount,
        'INR',
        data.method,
        data.reference || null,
        'incoming',
        data.date || (await tenantToday(c)).today,
        data.notes || null,
        data.receiptUrl || null,
        userId,
        now
      )
      .run();

    // Update invoice amounts
    const newPaidAmount = invoice.paid_amount + data.amount;
    const newBalanceDue = invoice.total - newPaidAmount;
    const newStatus =
      newBalanceDue <= 0.01
        ? 'paid'
        : newPaidAmount > 0
          ? 'partially_paid'
          : invoice.status;

    await tenantDb
      .prepare(
        `UPDATE invoices SET
         paid_amount = ?1, balance_due = ?2, status = ?3, updated_at = ?4
         WHERE id = ?5`
      )
      .bind(newPaidAmount, Math.max(0, newBalanceDue), newStatus, now, data.invoiceId)
      .run();

    // Log activity
    const db = drizzle(tenantDb);
    await logActivity(db, {
      userId,
      action: 'payment_recorded',
      entityType: 'payment',
      entityId: paymentId,
      details: JSON.stringify({ invoiceId: data.invoiceId, amount: data.amount }),
    });

    // Notify invoice creator (lead owner) of payment received (TICKET-166)
    try {
      const invoiceCreator = await tenantDb
        .prepare('SELECT created_by FROM invoices WHERE id = ?')
        .bind(data.invoiceId)
        .first<{ created_by: string }>();
      if (invoiceCreator?.created_by && invoiceCreator.created_by !== userId) {
        await db.insert(notifications).values({
          id: generateId(),
          userId: invoiceCreator.created_by,
          title: 'Payment received',
          message: `₹${data.amount.toLocaleString('en-IN')} recorded against invoice`,
          type: 'payment_received',
          referenceType: 'payment',
          referenceId: paymentId,
        });
      }
    } catch (_) {
      // Non-critical
    }

    // Broadcast real-time events
    try {
      const tenantId = c.get('tenantId');
      await broadcastToTenant(c.env, tenantId, {
        type: 'payment:received',
        data: { paymentId, invoiceId: data.invoiceId, amount: data.amount, invoiceStatus: newStatus },
      });
      if (invoice.status !== newStatus) {
        await broadcastToTenant(c.env, tenantId, {
          type: 'invoice:status_changed',
          data: { invoiceId: data.invoiceId, oldStatus: invoice.status, newStatus },
        });
      }
    } catch {}

    return created(c, {
      id: paymentId,
      ...data,
      invoiceStatus: newStatus,
      paidAmount: newPaidAmount,
      balanceDue: Math.max(0, newBalanceDue),
    });
  } catch (err) {
    console.error('Error recording payment:', err);
    return error(c, 'Failed to record payment', 500);
  }
});

// ============================================================
// GET / — List payments with filtering
// ============================================================

paymentRoutes.get('/', async (c) => {
  const tenantDb = c.get('tenantDb');

  const url = new URL(c.req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  // Filters
  const type = url.searchParams.get('type');
  const contactId = url.searchParams.get('contactId');
  const invoiceId = url.searchParams.get('invoiceId');
  const method = url.searchParams.get('method');
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');

  const search = url.searchParams.get('search')?.trim();

  // Build WHERE clause (columns are qualified: contacts/invoices share names like type, contact_id)
  let whereClause = '1=1';
  const params: any[] = [];

  if (type) {
    whereClause += ' AND p.type = ?';
    params.push(type);
  }
  if (contactId) {
    whereClause += ' AND p.contact_id = ?';
    params.push(contactId);
  }
  if (invoiceId) {
    whereClause += ' AND p.invoice_id = ?';
    params.push(invoiceId);
  }
  if (method) {
    whereClause += ' AND p.method = ?';
    params.push(method);
  }
  if (dateFrom) {
    whereClause += ' AND DATE(p.date) >= DATE(?)';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND DATE(p.date) <= DATE(?)';
    params.push(dateTo);
  }
  if (search) {
    whereClause += ' AND (p.reference LIKE ? OR c.name LIKE ? OR i.invoice_number LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const fromClause = `FROM payments p
      LEFT JOIN contacts c ON p.contact_id = c.id
      LEFT JOIN invoices i ON p.invoice_id = i.id`;

  try {
    // Get total count
    const countResult = await tenantDb
      .prepare(`SELECT COUNT(*) as count ${fromClause} WHERE ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();
    const total = countResult?.count || 0;

    // Get paginated results
    const query = `
      SELECT
        p.id, p.invoice_id, p.contact_id, p.amount, p.currency, p.method,
        p.reference, p.type, p.date, p.notes, p.receipt_url, p.created_by, p.created_at,
        c.name as contact_name, i.invoice_number
      ${fromClause}
      WHERE ${whereClause}
      ORDER BY p.date DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const payments = await tenantDb
      .prepare(query)
      .bind(...params, limit, offset)
      .all<Record<string, unknown>>();

    return paginated(c, payments.results || [], total, page, limit);
  } catch (err) {
    console.error('Error listing payments:', err);
    return error(c, 'Failed to list payments', 500);
  }
});

// ============================================================
// GET /:id — Get payment detail
// ============================================================

paymentRoutes.get('/:id', async (c) => {
  const tenantDb = c.get('tenantDb');
  const paymentId = c.req.param('id');

  try {
    const payment = await tenantDb
      .prepare(
        `SELECT
          p.id, p.invoice_id, p.contact_id, p.supplier_id, p.amount, p.currency,
          p.method, p.reference, p.type, p.date, p.notes, p.receipt_url, p.created_by, p.created_at,
          c.name as contact_name, i.invoice_number
        FROM payments p
        LEFT JOIN contacts c ON p.contact_id = c.id
        LEFT JOIN invoices i ON p.invoice_id = i.id
        WHERE p.id = ?1`
      )
      .bind(paymentId)
      .first<Record<string, unknown>>();

    if (!payment) {
      return notFound(c, 'Payment');
    }

    return success(c, payment);
  } catch (err) {
    console.error('Error fetching payment:', err);
    return error(c, 'Failed to fetch payment', 500);
  }
});

// ============================================================
// DELETE /:id — Delete payment (reverse amounts)
// ============================================================

paymentRoutes.delete('/:id', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const paymentId = c.req.param('id');

  if (!checkPaymentPermission(role)) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can delete payments');
  }

  try {
    // Get payment details
    const payment = await tenantDb
      .prepare(
        `SELECT id, invoice_id, amount FROM payments WHERE id = ?1`
      )
      .bind(paymentId)
      .first<{ id: string; invoice_id: string; amount: number }>();

    if (!payment) {
      return notFound(c, 'Payment');
    }

    // Get current invoice state
    const invoice = await tenantDb
      .prepare(
        `SELECT id, paid_amount, balance_due, total FROM invoices WHERE id = ?1`
      )
      .bind(payment.invoice_id)
      .first<{
        id: string;
        paid_amount: number;
        balance_due: number;
        total: number;
      }>();

    if (!invoice) {
      return notFound(c, 'Invoice');
    }

    // Delete payment
    await tenantDb
      .prepare('DELETE FROM payments WHERE id = ?1')
      .bind(paymentId)
      .run();

    // Reverse invoice amounts
    const newPaidAmount = Math.max(0, invoice.paid_amount - payment.amount);
    const newBalanceDue = invoice.total - newPaidAmount;
    const now = new Date().toISOString();

    let newStatus = 'draft';
    if (newPaidAmount >= invoice.total - 0.01) {
      newStatus = 'paid';
    } else if (newPaidAmount > 0) {
      newStatus = 'partially_paid';
    }

    await tenantDb
      .prepare(
        `UPDATE invoices SET
         paid_amount = ?1, balance_due = ?2, status = ?3, updated_at = ?4
         WHERE id = ?5`
      )
      .bind(newPaidAmount, newBalanceDue, newStatus, now, payment.invoice_id)
      .run();

    // Log activity
    await logActivity(drizzle(tenantDb), {
      userId,
      action: 'payment_deleted',
      entityType: 'payment',
      entityId: paymentId,
      details: JSON.stringify({ invoiceId: payment.invoice_id, amount: payment.amount }),
    });

    return success(c, { id: paymentId, deleted: true });
  } catch (err) {
    console.error('Error deleting payment:', err);
    return error(c, 'Failed to delete payment', 500);
  }
});

// ============================================================
// POST /:id/link-invoice — Link advance payment to invoice
// ============================================================

paymentRoutes.post('/:id/link-invoice', zValidator('json', linkAdvancePaymentSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const paymentId = c.req.param('id');

  if (!checkPaymentPermission(role)) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can link payments');
  }

  const data = c.req.valid('json');

  try {
    // Get payment
    const payment = await tenantDb
      .prepare(
        `SELECT id, invoice_id, contact_id, amount FROM payments WHERE id = ?1`
      )
      .bind(paymentId)
      .first<{
        id: string;
        invoice_id: string | null;
        contact_id: string;
        amount: number;
      }>();

    if (!payment) {
      return notFound(c, 'Payment');
    }

    // Verify target invoice exists
    const targetInvoice = await tenantDb
      .prepare(
        `SELECT id, contact_id, total, paid_amount, balance_due
         FROM invoices WHERE id = ?1 AND contact_id = ?2`
      )
      .bind(data.invoiceId, payment.contact_id)
      .first<{
        id: string;
        contact_id: string;
        total: number;
        paid_amount: number;
        balance_due: number;
      }>();

    if (!targetInvoice) {
      return notFound(c, 'Invoice');
    }

    // Link payment to invoice
    const now = new Date().toISOString();
    await tenantDb
      .prepare(
        `UPDATE payments SET invoice_id = ?1, updated_at = ?2 WHERE id = ?3`
      )
      .bind(data.invoiceId, now, paymentId)
      .run();

    // Update invoice
    const newPaidAmount = targetInvoice.paid_amount + data.amount;
    const newBalanceDue = targetInvoice.total - newPaidAmount;
    const newStatus =
      newBalanceDue <= 0.01
        ? 'paid'
        : newPaidAmount > 0
          ? 'partially_paid'
          : 'draft';

    await tenantDb
      .prepare(
        `UPDATE invoices SET
         paid_amount = ?1, balance_due = ?2, status = ?3, updated_at = ?4
         WHERE id = ?5`
      )
      .bind(newPaidAmount, Math.max(0, newBalanceDue), newStatus, now, data.invoiceId)
      .run();

    // Log activity
    await logActivity(drizzle(tenantDb), {
      userId,
      action: 'advance_payment_linked',
      entityType: 'payment',
      entityId: paymentId,
      details: JSON.stringify({ invoiceId: data.invoiceId, amount: data.amount }),
    });

    return success(c, {
      id: paymentId,
      invoiceId: data.invoiceId,
      paidAmount: newPaidAmount,
      balanceDue: Math.max(0, newBalanceDue),
      status: newStatus,
    });
  } catch (err) {
    console.error('Error linking payment:', err);
    return error(c, 'Failed to link payment', 500);
  }
});

export default paymentRoutes;
