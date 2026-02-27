import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, created, paginated, error, notFound, forbidden } from '../utils/response';
import { generateInvoiceNumber } from '../services/numbering';
import { calculateInvoiceTotals, detectTaxType } from '../services/tax-calculator';
import { logActivity } from '../utils/activity-logger';
import { drizzle } from 'drizzle-orm/d1';

const invoiceRoutes = new Hono<AppContext>();

// ============================================================
// Zod Schemas
// ============================================================

const createInvoiceSchema = z.object({
  contactId: z.string().min(1),
  leadId: z.string().optional().nullable(),
  type: z.enum(['tax_invoice', 'proforma', 'receipt']).default('tax_invoice'),
  items: z.array(
    z.object({
      description: z.string().min(1),
      hsnCode: z.string().optional(),
      quantity: z.number().int().min(1).default(1),
      rate: z.number().positive(),
      discountPercent: z.number().min(0).max(100).default(0),
      taxRate: z.number().min(0).max(100).default(0),
    })
  ).min(1),
  discountType: z.enum(['percentage', 'fixed']).optional(),
  discountValue: z.number().min(0).default(0),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  bankDetails: z.record(z.string(), z.any()).optional(),
  currency: z.string().default('INR'),
});

const updateInvoiceSchema = createInvoiceSchema.partial();

const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.string().min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
  date: z.string().default(() => new Date().toISOString().split('T')[0]),
});

// ============================================================
// RBAC Check
// ============================================================

function checkInvoicePermission(role: string): boolean {
  return ['admin', 'sales_manager', 'accountant'].includes(role);
}

// ============================================================
// GET / — List invoices with filtering and pagination
// ============================================================

invoiceRoutes.get('/', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const userName = c.get('userName');

  const url = new URL(c.req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  // Filters
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');
  const contactId = url.searchParams.get('contactId');
  const leadId = url.searchParams.get('leadId');
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');
  const search = url.searchParams.get('search') || '';

  // Build WHERE clause
  let whereClause = '1=1';
  const params: any[] = [];

  if (status) {
    whereClause += ' AND i.status = ?';
    params.push(status);
  }
  if (type) {
    whereClause += ' AND i.type = ?';
    params.push(type);
  }
  if (contactId) {
    whereClause += ' AND i.contact_id = ?';
    params.push(contactId);
  }
  if (leadId) {
    whereClause += ' AND i.lead_id = ?';
    params.push(leadId);
  }
  if (dateFrom) {
    whereClause += ' AND DATE(i.created_at) >= DATE(?)';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND DATE(i.created_at) <= DATE(?)';
    params.push(dateTo);
  }
  if (search) {
    whereClause += ' AND (i.invoice_number LIKE ? OR c.name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  try {
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as count FROM invoices i
      LEFT JOIN contacts c ON i.contact_id = c.id
      WHERE ${whereClause}
    `;
    const countResult = await tenantDb
      .prepare(countQuery)
      .bind(...params)
      .first<{ count: number}>();
    const total = countResult?.count || 0;

    // Get paginated results
    const query = `
      SELECT
        i.id, i.invoice_number, i.type, i.contact_id, i.lead_id,
        i.subtotal, i.discount_type, i.discount_value, i.discount_amount,
        i.taxable_amount, i.tax_type, i.cgst, i.sgst, i.igst, i.vat_amount,
        i.total_tax, i.total, i.currency, i.status, i.due_date,
        i.paid_amount, i.balance_due, i.notes, i.created_by, i.created_at, i.updated_at,
        c.name as contact_name, c.email as contact_email, c.phone as contact_phone
      FROM invoices i
      LEFT JOIN contacts c ON i.contact_id = c.id
      WHERE ${whereClause}
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const invoices = await tenantDb
      .prepare(query)
      .bind(...params, limit, offset)
      .all<Record<string, unknown>>();

    return paginated(c, invoices.results || [], total, page, limit);
  } catch (err) {
    console.error('Error listing invoices:', err);
    return error(c, 'Failed to list invoices', 500);
  }
});

// ============================================================
// POST / — Create invoice
// ============================================================

invoiceRoutes.post('/', zValidator('json', createInvoiceSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');

  if (!checkInvoicePermission(role)) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can create invoices');
  }

  const data = c.req.valid('json');

  try {
    // Verify contact exists
    const contact = await tenantDb
      .prepare('SELECT id, name, state FROM contacts WHERE id = ?1')
      .bind(data.contactId)
      .first<{ id: string; name: string; state: string | null }>();

    if (!contact) {
      return notFound(c, 'Contact');
    }

    // Get company state from settings (or use contact's state)
    const companyStateResult = await tenantDb
      .prepare("SELECT value FROM settings WHERE key = 'company_state'")
      .first<{ value: string }>();
    const companyState = companyStateResult?.value;

    // Calculate totals
    const taxType = detectTaxType(companyState, contact.state);
    const totals = calculateInvoiceTotals(data.items, data.discountType, data.discountValue, taxType);

    // Generate invoice number
    const { invoiceNumber } = await generateInvoiceNumber(tenantDb, data.type);

    // Create invoice
    const invoiceId = generateId();
    const now = new Date().toISOString();

    await tenantDb
      .prepare(
        `INSERT INTO invoices (
          id, contact_id, lead_id, invoice_number, type, subtotal,
          discount_type, discount_value, discount_amount, taxable_amount,
          tax_type, cgst, sgst, igst, vat_amount, total_tax, total,
          currency, status, due_date, paid_amount, balance_due, notes,
          bank_details, created_by, created_at, updated_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
          ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
          ?21, ?22, ?23, ?24, ?25, ?26, ?27
        )`
      )
      .bind(
        invoiceId,
        data.contactId,
        data.leadId || null,
        invoiceNumber,
        data.type,
        totals.subtotal,
        data.discountType || null,
        data.discountValue || null,
        totals.discountAmount,
        totals.taxableAmount,
        'gst', // tax_type
        totals.cgst,
        totals.sgst,
        totals.igst,
        totals.vatAmount,
        totals.totalTax,
        totals.total,
        data.currency,
        'draft', // status
        data.dueDate || null,
        0, // paid_amount
        totals.total, // balance_due
        data.notes || null,
        data.bankDetails ? JSON.stringify(data.bankDetails) : null,
        userId,
        now,
        now
      )
      .run();

    // Create line items
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const itemSubtotal = item.rate * item.quantity;
      const itemDiscount = (itemSubtotal * item.discountPercent) / 100;
      const itemTaxable = itemSubtotal - itemDiscount;
      const itemTax = (itemTaxable * item.taxRate) / 100;
      const itemTotal = itemTaxable + itemTax;

      await tenantDb
        .prepare(
          `INSERT INTO invoice_items (
            id, invoice_id, description, hsn_code, quantity, rate,
            discount_percent, taxable_amount, tax_rate, tax_amount, amount, sort_order
          ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12
          )`
        )
        .bind(
          generateId(),
          invoiceId,
          item.description,
          item.hsnCode || null,
          item.quantity,
          item.rate,
          item.discountPercent,
          itemTaxable,
          item.taxRate,
          itemTax,
          itemTotal,
          i
        )
        .run();
    }

    // Log activity
    await logActivity(drizzle(tenantDb), {
      userId, action: 'invoice_created', entityType: 'invoice', entityId: invoiceId,
      details: JSON.stringify({ invoiceNumber, contactId: data.contactId }),
    });

    return created(c, {
      id: invoiceId,
      invoiceNumber,
      ...data,
      ...totals,
      status: 'draft',
      paidAmount: 0,
      balanceDue: totals.total,
    });
  } catch (err) {
    console.error('Error creating invoice:', err);
    return error(c, 'Failed to create invoice', 500);
  }
});

// ============================================================
// GET /:id — Get invoice detail with items and payments
// ============================================================

invoiceRoutes.get('/:id', async (c) => {
  const tenantDb = c.get('tenantDb');
  const invoiceId = c.req.param('id');

  try {
    const invoice = await tenantDb
      .prepare(
        `SELECT
          i.id, i.invoice_number, i.type, i.contact_id, i.lead_id,
          i.subtotal, i.discount_type, i.discount_value, i.discount_amount,
          i.taxable_amount, i.tax_type, i.cgst, i.sgst, i.igst, i.vat_amount,
          i.total_tax, i.total, i.currency, i.status, i.due_date,
          i.paid_amount, i.balance_due, i.notes, i.bank_details, i.created_by,
          i.created_at, i.updated_at,
          c.name as contact_name, c.email as contact_email, c.phone as contact_phone
        FROM invoices i
        LEFT JOIN contacts c ON i.contact_id = c.id
        WHERE i.id = ?1`
      )
      .bind(invoiceId)
      .first<Record<string, unknown>>();

    if (!invoice) {
      return notFound(c, 'Invoice');
    }

    // Get line items
    const items = await tenantDb
      .prepare(
        `SELECT
          id, description, hsn_code, quantity, rate, discount_percent,
          taxable_amount, tax_rate, tax_amount, amount, sort_order
        FROM invoice_items
        WHERE invoice_id = ?1
        ORDER BY sort_order`
      )
      .bind(invoiceId)
      .all<Record<string, unknown>>();

    // Get payments
    const payments = await tenantDb
      .prepare(
        `SELECT
          id, amount, currency, method, reference, type, date, notes, created_by, created_at
        FROM payments
        WHERE invoice_id = ?1
        ORDER BY date DESC`
      )
      .bind(invoiceId)
      .all<Record<string, unknown>>();

    return success(c, {
      ...invoice,
      items: items.results || [],
      payments: payments.results || [],
    });
  } catch (err) {
    console.error('Error fetching invoice:', err);
    return error(c, 'Failed to fetch invoice', 500);
  }
});

// ============================================================
// GET /:id/payments — Get payments for an invoice
// ============================================================

invoiceRoutes.get('/:id/payments', async (c) => {
  const tenantDb = c.get('tenantDb');
  const invoiceId = c.req.param('id');

  try {
    const payments = await tenantDb
      .prepare(
        `SELECT
          id, amount, currency, method, reference, type, date, notes, created_by, created_at
        FROM payments
        WHERE invoice_id = ?1
        ORDER BY date DESC`
      )
      .bind(invoiceId)
      .all<Record<string, unknown>>();

    return success(c, payments.results || []);
  } catch (err) {
    console.error('Error fetching invoice payments:', err);
    return error(c, 'Failed to fetch invoice payments', 500);
  }
});

// ============================================================
// PUT /:id — Update invoice (draft only)
// ============================================================

invoiceRoutes.put('/:id', zValidator('json', updateInvoiceSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const invoiceId = c.req.param('id');

  if (!checkInvoicePermission(role)) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can update invoices');
  }

  const data = c.req.valid('json');

  try {
    // Verify invoice exists and is draft
    const invoice = await tenantDb
      .prepare('SELECT id, status, invoice_number, tax_type, paid_amount FROM invoices WHERE id = ?1')
      .bind(invoiceId)
      .first<{ id: string; status: string; invoice_number: string; tax_type: string; paid_amount: number }>();

    if (!invoice) {
      return notFound(c, 'Invoice');
    }

    if (invoice.status !== 'draft') {
      return error(c, 'Only draft invoices can be updated', 400);
    }

    // Prepare update data
    const updateData: Record<string, any> = {};
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.dueDate !== undefined) updateData.due_date = data.dueDate;
    if (data.discountType !== undefined) updateData.discount_type = data.discountType;
    if (data.discountValue !== undefined) updateData.discount_value = data.discountValue;

    // If items provided, recalculate totals
    if (data.items && data.items.length > 0) {
      const totals = calculateInvoiceTotals(
        data.items,
        data.discountType,
        data.discountValue,
        (invoice.tax_type as any) || 'igst'
      );

      updateData.subtotal = totals.subtotal;
      updateData.discount_amount = totals.discountAmount;
      updateData.taxable_amount = totals.taxableAmount;
      updateData.cgst = totals.cgst;
      updateData.sgst = totals.sgst;
      updateData.igst = totals.igst;
      updateData.vat_amount = totals.vatAmount;
      updateData.total_tax = totals.totalTax;
      updateData.total = totals.total;
      updateData.balance_due = totals.total - (invoice.paid_amount || 0);

      // Delete existing items and create new ones
      await tenantDb
        .prepare('DELETE FROM invoice_items WHERE invoice_id = ?1')
        .bind(invoiceId)
        .run();

      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const itemSubtotal = item.rate * item.quantity;
        const itemDiscount = (itemSubtotal * item.discountPercent) / 100;
        const itemTaxable = itemSubtotal - itemDiscount;
        const itemTax = (itemTaxable * item.taxRate) / 100;
        const itemTotal = itemTaxable + itemTax;

        await tenantDb
          .prepare(
            `INSERT INTO invoice_items (
              id, invoice_id, description, hsn_code, quantity, rate,
              discount_percent, taxable_amount, tax_rate, tax_amount, amount, sort_order
            ) VALUES (
              ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12
            )`
          )
          .bind(
            generateId(),
            invoiceId,
            item.description,
            item.hsnCode || null,
            item.quantity,
            item.rate,
            item.discountPercent,
            itemTaxable,
            item.taxRate,
            itemTax,
            itemTotal,
            i
          )
          .run();
      }
    }

    updateData.updated_at = new Date().toISOString();

    // Build SET clause
    const setClause = Object.keys(updateData)
      .map((key, i) => `${key} = ?${i + 1}`)
      .join(', ');

    const updateQuery = `UPDATE invoices SET ${setClause} WHERE id = ?${Object.keys(updateData).length + 1}`;

    await tenantDb
      .prepare(updateQuery)
      .bind(...Object.values(updateData), invoiceId)
      .run();

    // Log activity
    await logActivity(drizzle(tenantDb), {
      userId, action: 'invoice_updated', entityType: 'invoice', entityId: invoiceId,
      details: JSON.stringify({ invoiceNumber: invoice.invoice_number }),
    });

    return success(c, { id: invoiceId, ...updateData });
  } catch (err) {
    console.error('Error updating invoice:', err);
    return error(c, 'Failed to update invoice', 500);
  }
});

// ============================================================
// DELETE /:id — Soft delete invoice (set status to cancelled)
// ============================================================

invoiceRoutes.delete('/:id', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const invoiceId = c.req.param('id');

  if (!checkInvoicePermission(role)) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can delete invoices');
  }

  try {
    const invoice = await tenantDb
      .prepare('SELECT id, invoice_number FROM invoices WHERE id = ?1')
      .bind(invoiceId)
      .first<{ id: string; invoice_number: string }>();

    if (!invoice) {
      return notFound(c, 'Invoice');
    }

    const now = new Date().toISOString();
    await tenantDb
      .prepare('UPDATE invoices SET status = ?1, updated_at = ?2 WHERE id = ?3')
      .bind('cancelled', now, invoiceId)
      .run();

    await logActivity(drizzle(tenantDb), {
      userId, action: 'invoice_deleted', entityType: 'invoice', entityId: invoiceId,
      details: JSON.stringify({ invoiceNumber: invoice.invoice_number }),
    });

    return success(c, { id: invoiceId, status: 'cancelled' });
  } catch (err) {
    console.error('Error deleting invoice:', err);
    return error(c, 'Failed to delete invoice', 500);
  }
});

// ============================================================
// POST /:id/void — Void invoice
// ============================================================

invoiceRoutes.post('/:id/void', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const invoiceId = c.req.param('id');

  if (!checkInvoicePermission(role)) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can void invoices');
  }

  try {
    const invoice = await tenantDb
      .prepare('SELECT id, invoice_number, status FROM invoices WHERE id = ?1')
      .bind(invoiceId)
      .first<{ id: string; invoice_number: string; status: string }>();

    if (!invoice) {
      return notFound(c, 'Invoice');
    }

    const now = new Date().toISOString();
    await tenantDb
      .prepare('UPDATE invoices SET status = ?1, updated_at = ?2 WHERE id = ?3')
      .bind('cancelled', now, invoiceId)
      .run();

    await logActivity(drizzle(tenantDb), {
      userId, action: 'invoice_voided', entityType: 'invoice', entityId: invoiceId,
      details: JSON.stringify({ invoiceNumber: invoice.invoice_number }),
    });

    return success(c, { id: invoiceId, status: 'cancelled' });
  } catch (err) {
    console.error('Error voiding invoice:', err);
    return error(c, 'Failed to void invoice', 500);
  }
});

// ============================================================
// POST /:id/duplicate — Duplicate invoice
// ============================================================

invoiceRoutes.post('/:id/duplicate', async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');
  const invoiceId = c.req.param('id');

  if (!checkInvoicePermission(role)) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can duplicate invoices');
  }

  try {
    const invoice = await tenantDb
      .prepare(
        `SELECT
          contact_id, lead_id, type, subtotal, discount_type, discount_value,
          taxable_amount, tax_type, cgst, sgst, igst, vat_amount, total_tax,
          total, currency, notes, bank_details
        FROM invoices WHERE id = ?1`
      )
      .bind(invoiceId)
      .first<Record<string, unknown>>();

    if (!invoice) {
      return notFound(c, 'Invoice');
    }

    // Get items
    const items = await tenantDb
      .prepare(
        `SELECT description, hsn_code, quantity, rate, discount_percent, tax_rate
        FROM invoice_items
        WHERE invoice_id = ?1
        ORDER BY sort_order`
      )
      .bind(invoiceId)
      .all<Record<string, unknown>>();

    // Generate new invoice number
    const { invoiceNumber } = await generateInvoiceNumber(tenantDb, invoice.type as any);

    // Create new invoice
    const newInvoiceId = generateId();
    const now = new Date().toISOString();

    await tenantDb
      .prepare(
        `INSERT INTO invoices (
          id, contact_id, lead_id, invoice_number, type, subtotal,
          discount_type, discount_value, discount_amount, taxable_amount,
          tax_type, cgst, sgst, igst, vat_amount, total_tax, total,
          currency, status, paid_amount, balance_due, notes, bank_details,
          created_by, created_at, updated_at
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
          ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26
        )`
      )
      .bind(
        newInvoiceId,
        invoice.contact_id,
        invoice.lead_id,
        invoiceNumber,
        invoice.type,
        invoice.subtotal,
        invoice.discount_type,
        invoice.discount_value,
        (invoice.subtotal as number) - ((invoice.discount_type === 'percentage' ? ((invoice.subtotal as number) * (invoice.discount_value as number)) / 100 : invoice.discount_value as number) || 0),
        invoice.taxable_amount,
        invoice.tax_type,
        invoice.cgst,
        invoice.sgst,
        invoice.igst,
        invoice.vat_amount,
        invoice.total_tax,
        invoice.total,
        invoice.currency,
        'draft',
        0,
        invoice.total,
        invoice.notes,
        invoice.bank_details,
        userId,
        now,
        now
      )
      .run();

    // Copy items
    for (let i = 0; i < (items.results?.length || 0); i++) {
      const item = items.results[i];
      await tenantDb
        .prepare(
          `INSERT INTO invoice_items (
            id, invoice_id, description, hsn_code, quantity, rate,
            discount_percent, tax_rate, amount, sort_order
          ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
          )`
        )
        .bind(
          generateId(),
          newInvoiceId,
          item.description,
          item.hsn_code,
          item.quantity,
          item.rate,
          item.discount_percent,
          item.tax_rate,
          (item.rate as number) * (item.quantity as number),
          i
        )
        .run();
    }

    await logActivity(drizzle(tenantDb), {
      userId, action: 'invoice_duplicated', entityType: 'invoice', entityId: newInvoiceId,
      details: JSON.stringify({ invoiceNumber, sourceInvoiceId: invoiceId }),
    });

    return created(c, {
      id: newInvoiceId,
      invoiceNumber,
      status: 'draft',
    });
  } catch (err) {
    console.error('Error duplicating invoice:', err);
    return error(c, 'Failed to duplicate invoice', 500);
  }
});

export default invoiceRoutes;
