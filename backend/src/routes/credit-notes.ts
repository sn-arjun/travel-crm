import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, created, paginated, error, notFound, forbidden } from '../utils/response';
import { generateInvoiceNumber } from '../services/numbering';
import { logActivity } from '../utils/activity-logger';

const creditNoteRoutes = new Hono<AppContext>();
const debitNoteRoutes = new Hono<AppContext>();

// ============================================================
// Zod Schemas
// ============================================================

const createCreditNoteSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      description: z.string().min(1),
      quantity: z.number().int().min(1),
      rate: z.number().positive(),
      taxRate: z.number().min(0).max(100).default(0),
    })
  ).min(1),
});

const createDebitNoteSchema = z.object({
  invoiceId: z.string().min(1),
  reason: z.string().min(1),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      description: z.string().min(1),
      quantity: z.number().int().min(1),
      rate: z.number().positive(),
      taxRate: z.number().min(0).max(100).default(0),
    })
  ).min(1),
});

const applyNoteSchema = z.object({
  amount: z.number().positive(),
});

// ============================================================
// RBAC Check
// ============================================================

function checkCreditNotePermission(role: string): boolean {
  return ['admin', 'sales_manager', 'accountant'].includes(role);
}

// ============================================================
// CREDIT NOTES
// ============================================================

// POST /credit-notes — Create credit note
creditNoteRoutes.post('/', zValidator('json', createCreditNoteSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');

  if (!checkCreditNotePermission(role)) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can create credit notes');
  }

  const data = c.req.valid('json');

  try {
    // Verify invoice exists
    const invoice = await tenantDb
      .prepare(
        `SELECT id, contact_id, invoice_number, total FROM invoices WHERE id = ?1`
      )
      .bind(data.invoiceId)
      .first<{ id: string; contact_id: string; invoice_number: string; total: number }>();

    if (!invoice) {
      return notFound(c, 'Invoice');
    }

    // Calculate credit note total
    let subtotal = 0;
    let totalTax = 0;

    for (const item of data.items) {
      const itemSubtotal = item.rate * item.quantity;
      const itemTax = (itemSubtotal * item.taxRate) / 100;
      subtotal += itemSubtotal;
      totalTax += itemTax;
    }

    const total = subtotal + totalTax;

    // Generate credit note number
    const { invoiceNumber: creditNoteNumber } = await generateInvoiceNumber(tenantDb, 'credit_note');

    // Create credit note
    const creditNoteId = generateId();
    const now = new Date().toISOString();

    await tenantDb
      .prepare(
        `INSERT INTO invoices (
          id, contact_id, lead_id, invoice_number, type, subtotal,
          taxable_amount, total_tax, total, currency, status, notes,
          created_by, created_at, updated_at
        ) VALUES (
          ?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
        )`
      )
      .bind(
        creditNoteId,
        invoice.contact_id,
        creditNoteNumber,
        'credit_note',
        subtotal,
        subtotal,
        totalTax,
        total,
        'INR',
        'draft',
        JSON.stringify({ reason: data.reason, appliedTo: data.invoiceId, notes: data.notes }),
        userId,
        now,
        now
      )
      .run();

    // Create line items
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const itemSubtotal = item.rate * item.quantity;
      const itemTax = (itemSubtotal * item.taxRate) / 100;
      const itemTotal = itemSubtotal + itemTax;

      await tenantDb
        .prepare(
          `INSERT INTO invoice_items (
            id, invoice_id, description, quantity, rate,
            tax_rate, tax_amount, amount, sort_order
          ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
          )`
        )
        .bind(
          generateId(),
          creditNoteId,
          item.description,
          item.quantity,
          item.rate,
          item.taxRate,
          itemTax,
          itemTotal,
          i
        )
        .run();
    }

    // Log activity
    await logActivity(tenantDb, userId, 'credit_note_created', `Credit note ${creditNoteNumber} created`, {
      creditNoteId,
      creditNoteNumber,
      invoiceId: data.invoiceId,
      amount: total,
    });

    return created(c, {
      id: creditNoteId,
      invoiceNumber: creditNoteNumber,
      type: 'credit_note',
      status: 'draft',
      total,
      items: data.items,
    });
  } catch (err) {
    console.error('Error creating credit note:', err);
    return error(c, 'Failed to create credit note', 500);
  }
});

// GET /credit-notes — List credit notes
creditNoteRoutes.get('/', async (c) => {
  const tenantDb = c.get('tenantDb');

  const url = new URL(c.req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  const contactId = url.searchParams.get('contactId');

  try {
    let whereClause = "i.type = 'credit_note'";
    const params: any[] = [];

    if (contactId) {
      whereClause += ' AND i.contact_id = ?';
      params.push(contactId);
    }

    // Get total count
    const countResult = await tenantDb
      .prepare(`SELECT COUNT(*) as count FROM invoices i WHERE ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();
    const total = countResult?.count || 0;

    // Get paginated results
    const query = `
      SELECT
        i.id, i.invoice_number, i.type, i.contact_id, i.subtotal,
        i.total_tax, i.total, i.currency, i.status, i.notes, i.created_by, i.created_at,
        c.name as contact_name
      FROM invoices i
      LEFT JOIN contacts c ON i.contact_id = c.id
      WHERE ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const notes = await tenantDb
      .prepare(query)
      .bind(...params, limit, offset)
      .all<Record<string, unknown>>();

    return paginated(c, notes.results || [], total, page, limit);
  } catch (err) {
    console.error('Error listing credit notes:', err);
    return error(c, 'Failed to list credit notes', 500);
  }
});

// POST /credit-notes/:id/apply — Apply credit note to invoice
creditNoteRoutes.post('/:id/apply', zValidator('json', applyNoteSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const creditNoteId = c.req.param('id');

  if (!checkCreditNotePermission(role)) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can apply credit notes');
  }

  const data = c.req.valid('json');

  try {
    // Get credit note details
    const creditNote = await tenantDb
      .prepare(
        `SELECT id, notes, total FROM invoices WHERE id = ?1 AND type = 'credit_note'`
      )
      .bind(creditNoteId)
      .first<{ id: string; notes: string; total: number }>();

    if (!creditNote) {
      return notFound(c, 'Credit Note');
    }

    let invoiceId = null;
    try {
      const notes = JSON.parse(creditNote.notes || '{}');
      invoiceId = notes.appliedTo;
    } catch (_) {}

    if (!invoiceId) {
      return error(c, 'Credit note does not have associated invoice', 400);
    }

    // Get invoice
    const invoice = await tenantDb
      .prepare(
        `SELECT id, balance_due, paid_amount, total, status FROM invoices WHERE id = ?1`
      )
      .bind(invoiceId)
      .first<{
        id: string;
        balance_due: number;
        paid_amount: number;
        total: number;
        status: string;
      }>();

    if (!invoice) {
      return notFound(c, 'Invoice');
    }

    // Apply credit (reduce balance due)
    const applyAmount = Math.min(data.amount, creditNote.total);
    const newBalanceDue = Math.max(0, invoice.balance_due - applyAmount);
    const newStatus =
      newBalanceDue <= 0.01
        ? 'paid'
        : invoice.paid_amount > 0
          ? 'partially_paid'
          : 'draft';

    const now = new Date().toISOString();

    await tenantDb
      .prepare(
        `UPDATE invoices SET balance_due = ?1, status = ?2, updated_at = ?3 WHERE id = ?4`
      )
      .bind(newBalanceDue, newStatus, now, invoiceId)
      .run();

    // Mark credit note as applied
    await tenantDb
      .prepare(`UPDATE invoices SET status = 'applied', updated_at = ?1 WHERE id = ?2`)
      .bind(now, creditNoteId)
      .run();

    // Log activity
    await logActivity(tenantDb, userId, 'credit_note_applied', `Credit note applied to invoice`, {
      creditNoteId,
      invoiceId,
      appliedAmount: applyAmount,
    });

    return success(c, {
      id: creditNoteId,
      appliedAmount: applyAmount,
      invoiceStatus: newStatus,
      balanceDue: newBalanceDue,
    });
  } catch (err) {
    console.error('Error applying credit note:', err);
    return error(c, 'Failed to apply credit note', 500);
  }
});

// ============================================================
// DEBIT NOTES
// ============================================================

// POST /debit-notes — Create debit note
debitNoteRoutes.post('/', zValidator('json', createDebitNoteSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');

  if (!checkCreditNotePermission(role)) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can create debit notes');
  }

  const data = c.req.valid('json');

  try {
    // Verify invoice exists
    const invoice = await tenantDb
      .prepare(
        `SELECT id, contact_id, invoice_number, total FROM invoices WHERE id = ?1`
      )
      .bind(data.invoiceId)
      .first<{ id: string; contact_id: string; invoice_number: string; total: number }>();

    if (!invoice) {
      return notFound(c, 'Invoice');
    }

    // Calculate debit note total
    let subtotal = 0;
    let totalTax = 0;

    for (const item of data.items) {
      const itemSubtotal = item.rate * item.quantity;
      const itemTax = (itemSubtotal * item.taxRate) / 100;
      subtotal += itemSubtotal;
      totalTax += itemTax;
    }

    const total = subtotal + totalTax;

    // Generate debit note number
    const { invoiceNumber: debitNoteNumber } = await generateInvoiceNumber(tenantDb, 'debit_note');

    // Create debit note
    const debitNoteId = generateId();
    const now = new Date().toISOString();

    await tenantDb
      .prepare(
        `INSERT INTO invoices (
          id, contact_id, lead_id, invoice_number, type, subtotal,
          taxable_amount, total_tax, total, currency, status, notes,
          created_by, created_at, updated_at
        ) VALUES (
          ?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
        )`
      )
      .bind(
        debitNoteId,
        invoice.contact_id,
        debitNoteNumber,
        'debit_note',
        subtotal,
        subtotal,
        totalTax,
        total,
        'INR',
        'draft',
        JSON.stringify({ reason: data.reason, appliedTo: data.invoiceId, notes: data.notes }),
        userId,
        now,
        now
      )
      .run();

    // Create line items
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const itemSubtotal = item.rate * item.quantity;
      const itemTax = (itemSubtotal * item.taxRate) / 100;
      const itemTotal = itemSubtotal + itemTax;

      await tenantDb
        .prepare(
          `INSERT INTO invoice_items (
            id, invoice_id, description, quantity, rate,
            tax_rate, tax_amount, amount, sort_order
          ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9
          )`
        )
        .bind(
          generateId(),
          debitNoteId,
          item.description,
          item.quantity,
          item.rate,
          item.taxRate,
          itemTax,
          itemTotal,
          i
        )
        .run();
    }

    // Log activity
    await logActivity(tenantDb, userId, 'debit_note_created', `Debit note ${debitNoteNumber} created`, {
      debitNoteId,
      debitNoteNumber,
      invoiceId: data.invoiceId,
      amount: total,
    });

    return created(c, {
      id: debitNoteId,
      invoiceNumber: debitNoteNumber,
      type: 'debit_note',
      status: 'draft',
      total,
      items: data.items,
    });
  } catch (err) {
    console.error('Error creating debit note:', err);
    return error(c, 'Failed to create debit note', 500);
  }
});

// GET /debit-notes — List debit notes
debitNoteRoutes.get('/', async (c) => {
  const tenantDb = c.get('tenantDb');

  const url = new URL(c.req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  const contactId = url.searchParams.get('contactId');

  try {
    let whereClause = "i.type = 'debit_note'";
    const params: any[] = [];

    if (contactId) {
      whereClause += ' AND i.contact_id = ?';
      params.push(contactId);
    }

    // Get total count
    const countResult = await tenantDb
      .prepare(`SELECT COUNT(*) as count FROM invoices i WHERE ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();
    const total = countResult?.count || 0;

    // Get paginated results
    const query = `
      SELECT
        i.id, i.invoice_number, i.type, i.contact_id, i.subtotal,
        i.total_tax, i.total, i.currency, i.status, i.notes, i.created_by, i.created_at,
        c.name as contact_name
      FROM invoices i
      LEFT JOIN contacts c ON i.contact_id = c.id
      WHERE ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const notes = await tenantDb
      .prepare(query)
      .bind(...params, limit, offset)
      .all<Record<string, unknown>>();

    return paginated(c, notes.results || [], total, page, limit);
  } catch (err) {
    console.error('Error listing debit notes:', err);
    return error(c, 'Failed to list debit notes', 500);
  }
});

// POST /debit-notes/:id/apply — Apply debit note to invoice
debitNoteRoutes.post('/:id/apply', zValidator('json', applyNoteSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const debitNoteId = c.req.param('id');

  if (!checkCreditNotePermission(role)) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can apply debit notes');
  }

  const data = c.req.valid('json');

  try {
    // Get debit note details
    const debitNote = await tenantDb
      .prepare(
        `SELECT id, notes, total FROM invoices WHERE id = ?1 AND type = 'debit_note'`
      )
      .bind(debitNoteId)
      .first<{ id: string; notes: string; total: number }>();

    if (!debitNote) {
      return notFound(c, 'Debit Note');
    }

    let invoiceId = null;
    try {
      const notes = JSON.parse(debitNote.notes || '{}');
      invoiceId = notes.appliedTo;
    } catch (_) {}

    if (!invoiceId) {
      return error(c, 'Debit note does not have associated invoice', 400);
    }

    // Get invoice
    const invoice = await tenantDb
      .prepare(
        `SELECT id, balance_due, paid_amount, total, status FROM invoices WHERE id = ?1`
      )
      .bind(invoiceId)
      .first<{
        id: string;
        balance_due: number;
        paid_amount: number;
        total: number;
        status: string;
      }>();

    if (!invoice) {
      return notFound(c, 'Invoice');
    }

    // Apply debit (increase balance due)
    const applyAmount = data.amount;
    const newBalanceDue = invoice.balance_due + applyAmount;

    const now = new Date().toISOString();

    await tenantDb
      .prepare(
        `UPDATE invoices SET balance_due = ?1, updated_at = ?2 WHERE id = ?3`
      )
      .bind(newBalanceDue, now, invoiceId)
      .run();

    // Mark debit note as applied
    await tenantDb
      .prepare(`UPDATE invoices SET status = 'applied', updated_at = ?1 WHERE id = ?2`)
      .bind(now, debitNoteId)
      .run();

    // Log activity
    await logActivity(tenantDb, userId, 'debit_note_applied', `Debit note applied to invoice`, {
      debitNoteId,
      invoiceId,
      appliedAmount: applyAmount,
    });

    return success(c, {
      id: debitNoteId,
      appliedAmount: applyAmount,
      balanceDue: newBalanceDue,
    });
  } catch (err) {
    console.error('Error applying debit note:', err);
    return error(c, 'Failed to apply debit note', 500);
  }
});

export default creditNoteRoutes;
export { debitNoteRoutes };
