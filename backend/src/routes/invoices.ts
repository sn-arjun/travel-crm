import { Hono } from 'hono';
import { emitFromRequest, requestDepth } from '../services/automation/events';
import { createInvoice, InvoiceContactNotFound, itineraryInvoiceItems } from '../services/domain/invoices';
import { zValidator } from '../utils/validator';
import { z } from 'zod';
import type { AppContext } from '../types';
import { generateId } from '../utils/uuid';
import { success, created, paginated, error, notFound, forbidden } from '../utils/response';
import { generateInvoiceNumber } from '../services/numbering';
import {
  computeDocumentTotals, frozenRulesFromInvoice, loadTaxBuyer, loadTaxSettings, taxColumns, TaxConfigError,
  type MarginInput, type TaxRegime,
} from '../services/tax-calculator';
import { logActivity } from '../utils/activity-logger';
import { drizzle } from 'drizzle-orm/d1';
import { notifications } from '../db/tenant-schema';
import { broadcastToTenant } from '../utils/realtime';
import { tenantToday, tenantTimeZone, sqlOffsetModifier } from '../utils/tz';
import { formatMoney, loadLocaleContext } from '../utils/money';
import { agencyEmailHtml, escapeHtml, queueAgencyEmail, textToHtml } from '../services/mail/delivery';
import { cancelPaymentLink, createPaymentLink, stripeMethodsError, type AgencyGatewayId } from '../services/payments/agency-gateway';
import { depositAmount, isCredentialError, listAccounts, loadPaymentDefaults, openCredentials, webhookKeyFor, type AccountRow } from '../services/payments/accounts';
import { createMockPaymentLink } from '../services/payments/mock-agency';
import { GatewayError, mockAllowed } from '../services/billing/gateway';
import { loadAgencyBankDetails } from '../utils/bank-details';
import { hasPermission } from '../constants/permissions';
import {
  bookingOfInvoice, loadInvoiceTaxContext, loadMarginScheme, marginColumns, marginOf, MarginSchemeError, resolveMarginCost,
  stripMarginFigures, type MarginCost,
} from '../services/margin-scheme';

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
      // Omitted: GST lines default to 0, VAT / sales tax lines to the agency's rate.
      taxRate: z.number().min(0).max(100).optional(),
    })
  ).min(1),
  discountType: z.enum(['percentage', 'fixed']).optional(),
  discountValue: z.number().min(0).default(0),
  dueDate: z.string().optional(),
  issueDate: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  notes: z.string().optional(),
  bankDetails: z.record(z.string(), z.any()).optional(),
  // Omitted: the agency's currency setting applies (R202), not a fixed INR.
  currency: z.string().length(3).optional(),
  // GST only: rate for items that carry no taxRate (the form sends one rate for the whole invoice).
  // VAT and sales tax invoices use the agency's rate; 'none' charges no tax.
  gstRate: z.number().min(0).max(100).optional(),
  // R152: 'margin' = margin scheme (only when the agency switched it on), 'standard' = the agency's ordinary tax regime.
  // Omitted: the agency's settings decide for a new invoice and a draft keeps its regime.
  taxRegime: z.enum(['margin', 'standard']).optional(),
  // R152: the cost of the sold services, typed on a margin invoice (a manual cost). Staff with finance rights only.
  marginCost: z.number().min(0).nullable().optional(),
});

const updateInvoiceSchema = createInvoiceSchema.partial();

const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.string().min(1),
  reference: z.string().optional(),
  notes: z.string().optional(),
  date: z.string().optional(), // defaults to the tenant-local today in the handler
});

// ============================================================
// RBAC Check
// ============================================================

function checkInvoicePermission(role: string): boolean {
  return ['admin', 'sales_manager', 'accountant'].includes(role);
}

/** The cost and margin of a margin-scheme invoice are for staff who can edit invoices (R152). */
function canSeeMargin(role: string): boolean {
  return hasPermission(role as any, 'invoices', 'edit');
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
  if (type && type !== 'all') {
    whereClause += ' AND i.type = ?';
    params.push(type);
  } else if (!type) {
    // credit notes share the invoices table but have their own page: keep them out of the default list
    whereClause += " AND i.type != 'credit_note'";
  }
  if (contactId) {
    whereClause += ' AND i.contact_id = ?';
    params.push(contactId);
  }
  if (leadId) {
    whereClause += ' AND i.lead_id = ?';
    params.push(leadId);
  }
  // created_at is a UTC timestamp; dateFrom/dateTo are the tenant's local calendar days
  const listTzMod = sqlOffsetModifier(await tenantTimeZone(c));
  if (dateFrom) {
    whereClause += ` AND DATE(i.created_at, '${listTzMod}') >= DATE(?)`;
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ` AND DATE(i.created_at, '${listTzMod}') <= DATE(?)`;
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
        i.tax_regime, i.tax_breakdown, i.seller_tax_id, i.buyer_tax_id, i.place_of_supply, i.tax_notes,
        i.margin_cost, i.margin_cost_source, i.margin_vat_rate, i.margin_wording,
        i.total_tax, i.total, i.currency, i.status, i.due_date,
        i.issue_date, i.terms,
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

    const rows = canSeeMargin(role) ? invoices.results || [] : (invoices.results || []).map(stripMarginFigures);
    return paginated(c, rows, total, page, limit);
  } catch (err) {
    console.error('Error listing invoices:', err);
    return error(c, 'Failed to list invoices', 500);
  }
});

// ============================================================
// GET /summary — Invoice summary statistics
// ============================================================

invoiceRoutes.get('/summary', async (c) => {
  const tenantDb = c.get('tenantDb');

  try {
    const { timeZone: sumTz, today } = await tenantToday(c);
    const sumMod = sqlOffsetModifier(sumTz);
    const monthStart = today.substring(0, 7) + '-01';

    const result = await tenantDb
      .prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN status IN ('sent', 'partially_paid', 'overdue') THEN balance_due ELSE 0 END), 0) as outstanding,
          COALESCE(SUM(CASE WHEN status IN ('sent', 'partially_paid', 'overdue') AND due_date < ? THEN balance_due ELSE 0 END), 0) as overdue,
          COALESCE(SUM(CASE WHEN status = 'paid' AND DATE(updated_at, '${sumMod}') >= DATE(?) THEN total ELSE 0 END), 0) as paid_this_month,
          COALESCE(SUM(CASE WHEN DATE(created_at, '${sumMod}') >= DATE(?) THEN total ELSE 0 END), 0) as invoiced_this_month
        FROM invoices
        WHERE type IN ('tax_invoice', 'proforma') AND status != 'cancelled'
      `)
      .bind(today, monthStart, monthStart)
      .first<Record<string, number>>();

    return success(c, {
      outstanding: result?.outstanding || 0,
      overdue: result?.overdue || 0,
      paidThisMonth: result?.paid_this_month || 0,
      invoicedThisMonth: result?.invoiced_this_month || 0,
    });
  } catch (err) {
    console.error('Error fetching invoice summary:', err);
    return error(c, 'Failed to fetch invoice summary', 500);
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
    let waiter: { waitUntil(p: Promise<unknown>): void } | undefined;
    try { waiter = c.executionCtx; } catch { waiter = undefined; }
    // A cost can only be typed by staff who may see it (checkInvoicePermission already limits who creates at all).
    const { id: invoiceId, invoiceNumber, totals, doc, marginCost } = await createInvoice(c.env, c.get('tenantId'), tenantDb, data, {
      userId, depth: requestDepth(c), waiter,
    });

    return created(c, {
      id: invoiceId,
      invoiceNumber,
      ...data,
      ...totals,
      taxRegime: doc.tax.regime,
      taxType: doc.tax.treatment,
      taxBreakdown: doc.tax.taxLines,
      sellerTaxId: doc.tax.sellerTaxId,
      buyerTaxId: doc.tax.buyerTaxId,
      placeOfSupply: doc.tax.placeOfSupply,
      taxNotes: doc.tax.notes,
      ...(doc.tax.regime === 'margin'
        ? { marginCost: marginCost?.cost ?? null, marginCostSource: marginCost?.source ?? null, margin: marginOf(totals.total, marginCost?.cost) }
        : {}),
      status: 'draft',
      paidAmount: 0,
      balanceDue: totals.total,
    });
  } catch (err) {
    if (err instanceof InvoiceContactNotFound) return notFound(c, 'Contact');
    if (err instanceof TaxConfigError || err instanceof MarginSchemeError) return error(c, err.message, 400);
    console.error('Error creating invoice:', err);
    return error(c, 'Failed to create invoice', 500);
  }
});

// ============================================================
// POST /tax-preview — Tax the form should show for a contact and lines (nothing is saved)
// ============================================================

const taxPreviewSchema = z.object({
  contactId: z.string().min(1).optional().nullable(),
  items: z.array(z.object({
    rate: z.number().min(0),
    quantity: z.number().int().min(1).default(1),
    discountPercent: z.number().min(0).max(100).default(0),
    taxRate: z.number().min(0).max(100).optional(),
  })).default([]),
  discountType: z.enum(['percentage', 'fixed']).optional(),
  discountValue: z.number().min(0).default(0),
  gstRate: z.number().min(0).max(100).optional(),
  // Edit form: show the rules the invoice was issued under, not today's settings
  invoiceId: z.string().optional().nullable(),
  // R152: preview the margin scheme ('margin') or the ordinary regime ('standard') instead of what the settings pick.
  taxRegime: z.enum(['margin', 'standard']).optional(),
  marginCost: z.number().min(0).nullable().optional(),
  origin: z.enum(['booking', 'extras', 'itinerary', 'trip', 'manual']).optional(),
});

invoiceRoutes.post('/tax-preview', zValidator('json', taxPreviewSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const data = c.req.valid('json');
  try {
    const ctx = await loadInvoiceTaxContext(c.env, c.get('tenantId'), tenantDb, { origin: data.origin ?? 'manual', request: data.taxRegime });
    let { regime, margin } = ctx;
    const { seller } = ctx;
    let frozen = null;
    let contactId = data.contactId ?? null;
    let seatBookingId: string | null = null;
    if (data.invoiceId) {
      const inv = await tenantDb
        .prepare('SELECT contact_id, tax_regime, tax_type, tax_breakdown, tax_notes, place_of_supply, seller_tax_id, buyer_tax_id, cgst, currency, margin_cost, margin_cost_source, margin_vat_rate, margin_wording FROM invoices WHERE id = ?1')
        .bind(data.invoiceId)
        .first<Record<string, any>>();
      if (inv) {
        contactId = inv.contact_id;
        seatBookingId = await bookingOfInvoice(tenantDb, data.invoiceId);
        // The invoice keeps the rules it was issued under unless the form asks for another regime.
        if (!data.taxRegime || (data.taxRegime === 'margin') === (inv.tax_regime === 'margin')) {
          frozen = frozenRulesFromInvoice(inv);
          regime = frozen.regime;
          margin = inv.tax_regime === 'margin'
            ? { wording: inv.margin_wording, cost: inv.margin_cost, vatRate: inv.margin_vat_rate }
            : null;
        }
      }
    }
    const seesMargin = canSeeMargin(c.get('role'));
    let cost: MarginCost | null = null;
    if (regime === 'margin' && margin) {
      const scheme = await loadMarginScheme(tenantDb);
      const typed = seesMargin ? data.marginCost : undefined;
      const currency = (await loadLocaleContext(tenantDb)).currency;
      if (typed !== undefined && typed !== null) cost = await resolveMarginCost(tenantDb, { scheme, currency, manualCost: typed });
      else if (!frozen) cost = await resolveMarginCost(tenantDb, { scheme, currency, seatBookingId });
      else cost = { cost: margin.cost, source: null };
      margin = { ...margin, cost: cost.cost };
    }
    const buyer = (contactId ? await loadTaxBuyer(tenantDb, contactId) : null) ?? {};
    const doc = computeDocumentTotals(data.items, data.discountType, data.discountValue, { regime, seller, buyer, frozen, gstDefaultRate: data.gstRate, margin });
    return success(c, {
      ...(doc.tax.regime === 'margin' && seesMargin
        ? {
            marginCost: cost?.cost ?? null,
            marginCostSource: cost?.source ?? null,
            margin: marginOf(doc.total, cost?.cost),
            marginVatRate: margin?.vatRate ?? null,
            vatOnMargin: doc.tax.hiddenLines[0]?.amount ?? null,
          }
        : {}),
      regime: doc.tax.regime,
      treatment: doc.tax.treatment,
      taxLines: doc.tax.taxLines,
      notes: doc.tax.notes,
      placeOfSupply: doc.tax.placeOfSupply,
      sellerTaxId: doc.tax.sellerTaxId,
      buyerTaxId: doc.tax.buyerTaxId,
      subtotal: doc.subtotal,
      discountAmount: doc.discountAmount,
      taxableAmount: doc.taxableAmount,
      totalTax: doc.tax.totalTax,
      total: doc.total,
      // Rate a line gets when it carries none (VAT / sales tax); null for GST where the user picks it
      defaultRate: doc.tax.regime === 'vat' || doc.tax.regime === 'sales_tax' ? doc.tax.defaultRate : null,
    });
  } catch (e) {
    if (e instanceof TaxConfigError || e instanceof MarginSchemeError) return error(c, e.message, 400);
    console.error('Error previewing invoice tax:', e);
    return error(c, 'Failed to preview tax', 500);
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
          i.tax_regime, i.tax_breakdown, i.seller_tax_id, i.buyer_tax_id, i.place_of_supply, i.tax_notes,
          i.margin_cost, i.margin_cost_source, i.margin_vat_rate, i.margin_wording,
          i.total_tax, i.total, i.currency, i.status, i.due_date,
          i.issue_date, i.terms,
          i.paid_amount, i.balance_due, i.notes, i.bank_details, i.created_by,
          i.payment_link_id, i.payment_link_url, i.payment_link_status, i.payment_link_gateway,
          i.payment_link_amount, i.payment_link_purpose,
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

    // The invoice prints the bank details it was issued with; an older one that has none shows the agency's current
    // details. bank_country says which country's field set to print (R140).
    const agencyBank = await loadAgencyBankDetails(tenantDb);
    let bankDetails = invoice.bank_details;
    if (!bankDetails && Object.keys(agencyBank.details).length > 0) bankDetails = JSON.stringify(agencyBank.details);

    return success(c, {
      ...(canSeeMargin(c.get('role')) ? invoice : stripMarginFigures(invoice)),
      bank_details: bankDetails ?? null,
      bank_country: agencyBank.country,
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
      .prepare('SELECT id, contact_id, currency, discount_type, discount_value, status, invoice_number, tax_regime, tax_type, tax_breakdown, tax_notes, place_of_supply, seller_tax_id, buyer_tax_id, cgst, paid_amount, margin_cost, margin_cost_source, margin_vat_rate, margin_wording FROM invoices WHERE id = ?1')
      .bind(invoiceId)
      .first<{ id: string; contact_id: string; currency: string | null; discount_type: string | null; discount_value: number | null; status: string; invoice_number: string; tax_regime: string; tax_type: string; tax_breakdown: string | null; tax_notes: string | null; place_of_supply: string | null; seller_tax_id: string | null; buyer_tax_id: string | null; cgst: number | null; paid_amount: number; margin_cost: number | null; margin_cost_source: string | null; margin_vat_rate: number | null; margin_wording: string | null }>();

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
    if (data.issueDate) updateData.issue_date = data.issueDate;
    if (data.terms !== undefined) updateData.terms = data.terms;
    if (data.discountType !== undefined) updateData.discount_type = data.discountType;
    if (data.discountValue !== undefined) updateData.discount_value = data.discountValue;

    // R152: a draft can move into or out of the margin scheme, and a margin draft's cost can be typed (finance rights only).
    const wasMargin = invoice.tax_regime === 'margin';
    const switching = data.taxRegime !== undefined && (data.taxRegime === 'margin') !== wasMargin;
    const typedCost = data.marginCost;
    if (typedCost !== undefined && !canSeeMargin(role)) return forbidden(c, 'Only staff with finance rights can record the cost');
    if (typedCost !== undefined && !wasMargin && !(switching && data.taxRegime === 'margin')) {
      return error(c, 'The cost is recorded on margin-scheme invoices only', 400);
    }
    let lineItems = data.items && data.items.length > 0 ? data.items : null;
    if (!lineItems && (switching || (wasMargin && typedCost !== undefined))) {
      if (switching && data.taxRegime === 'standard') {
        return error(c, 'Send the lines again when leaving the margin scheme, so the tax can be worked out', 400);
      }
      const stored = await tenantDb
        .prepare('SELECT description, hsn_code, quantity, rate, discount_percent FROM invoice_items WHERE invoice_id = ?1 ORDER BY sort_order')
        .bind(invoiceId)
        .all<{ description: string; hsn_code: string | null; quantity: number; rate: number; discount_percent: number | null }>();
      lineItems = (stored.results ?? []).map((r) => ({
        description: r.description, hsnCode: r.hsn_code ?? undefined, quantity: r.quantity, rate: r.rate, discountPercent: r.discount_percent ?? 0,
      }));
    }
    const discountType = data.discountType ?? (data.items ? undefined : ((invoice.discount_type as 'percentage' | 'fixed' | null) ?? undefined));
    const discountValue = data.discountValue ?? (data.items ? 0 : invoice.discount_value ?? 0);

    // If items provided, recalculate totals
    if (lineItems && lineItems.length > 0) {
      // The invoice keeps the regime and rules it was issued under (settings may have changed since), unless the draft is moved.
      const buyer = await loadTaxBuyer(tenantDb, invoice.contact_id);
      let frozen: ReturnType<typeof frozenRulesFromInvoice> | null = null;
      let regime: TaxRegime;
      let seller;
      let margin: MarginInput | null = null;
      let marginCost: MarginCost | null = null;
      const currency = invoice.currency ?? (await loadLocaleContext(tenantDb)).currency;
      if (switching) {
        const ctx = await loadInvoiceTaxContext(c.env, c.get('tenantId'), tenantDb, { origin: 'manual', request: data.taxRegime });
        regime = ctx.regime;
        seller = ctx.seller;
        margin = ctx.margin;
        if (margin) {
          marginCost = await resolveMarginCost(tenantDb, {
            scheme: ctx.scheme, currency, manualCost: typedCost, seatBookingId: await bookingOfInvoice(tenantDb, invoiceId),
          });
          margin = { ...margin, cost: marginCost.cost };
        }
      } else {
        seller = (await loadTaxSettings(tenantDb)).seller;
        frozen = frozenRulesFromInvoice(invoice);
        regime = frozen.regime;
        if (wasMargin) {
          marginCost = typedCost !== undefined && typedCost !== null
            ? { cost: Math.round(typedCost * 100) / 100, source: 'manual' }
            : typedCost === null
              ? { cost: null, source: 'manual' }
              : { cost: invoice.margin_cost, source: invoice.margin_cost_source as MarginCost['source'] };
          margin = { wording: invoice.margin_wording, cost: marginCost.cost, vatRate: invoice.margin_vat_rate };
        }
      }
      const doc = computeDocumentTotals(lineItems, discountType, discountValue, {
        regime, seller, buyer: buyer ?? {}, frozen, gstDefaultRate: data.gstRate, margin,
      });
      if (switching) {
        // A new regime replaces everything the old one stored: breakdown, tax ids, place of supply, notes.
        Object.assign(updateData, taxColumns(doc.tax));
      }
      Object.assign(updateData, marginColumns(regime, margin, marginCost));
      data.items = lineItems;
      const totals = {
        subtotal: doc.subtotal, discountAmount: doc.discountAmount, taxableAmount: doc.taxableAmount,
        cgst: doc.tax.cgst, sgst: doc.tax.sgst, igst: doc.tax.igst, vatAmount: doc.tax.vatAmount,
        totalTax: doc.tax.totalTax, total: doc.total,
      };

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
      updateData.tax_type = doc.tax.treatment;
      updateData.tax_breakdown = JSON.stringify([...doc.tax.taxLines, ...doc.tax.hiddenLines]);

      // Delete existing items and create new ones
      await tenantDb
        .prepare('DELETE FROM invoice_items WHERE invoice_id = ?1')
        .bind(invoiceId)
        .run();

      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const calc = doc.items[i];

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
            calc.taxable,
            calc.taxRate,
            calc.tax,
            calc.amount,
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
    if (err instanceof TaxConfigError || err instanceof MarginSchemeError) return error(c, err.message, 400);
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
      .bind('void', now, invoiceId)
      .run();

    await logActivity(drizzle(tenantDb), {
      userId, action: 'invoice_voided', entityType: 'invoice', entityId: invoiceId,
      details: JSON.stringify({ invoiceNumber: invoice.invoice_number }),
    });

    return success(c, { id: invoiceId, status: 'void' });
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
          total, currency, notes, bank_details,
          tax_regime, tax_breakdown, seller_tax_id, buyer_tax_id, place_of_supply, tax_notes,
          margin_cost, margin_cost_source, margin_vat_rate, margin_wording
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
          created_by, created_at, updated_at,
          tax_regime, tax_breakdown, seller_tax_id, buyer_tax_id, place_of_supply, tax_notes,
          margin_cost, margin_cost_source, margin_vat_rate, margin_wording
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
          ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26,
          ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36
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
        now,
        invoice.tax_regime ?? 'gst',
        invoice.tax_breakdown ?? null,
        invoice.seller_tax_id ?? null,
        invoice.buyer_tax_id ?? null,
        invoice.place_of_supply ?? null,
        invoice.tax_notes ?? null,
        invoice.margin_cost ?? null,
        invoice.margin_cost_source ?? null,
        invoice.margin_vat_rate ?? null,
        invoice.margin_wording ?? null
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

// ============================================================
// POST /:id/send — Send invoice via email or WhatsApp
// ============================================================

const sendInvoiceSchema = z.object({
  channel: z.enum(['email', 'whatsapp']),
  to: z.string().min(1),
});

invoiceRoutes.post('/:id/send', zValidator('json', sendInvoiceSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const invoiceId = c.req.param('id');
  const data = c.req.valid('json');

  try {
    const invoice = await tenantDb
      .prepare(
        `SELECT i.id, i.invoice_number, i.status, i.total, i.due_date, i.currency, i.contact_id, i.balance_due,
                i.payment_link_url, i.payment_link_status,
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

    // R128: the email is really sent (queued with the invoice summary and, when the invoice has an open payment link, the
    // link to pay). A bounced address is refused before anything changes. The invoice PDF is built in the desktop app, so
    // the email carries the invoice as text and the payment link rather than an attachment.
    if (data.channel === 'email') {
      const lines = await tenantDb
        .prepare('SELECT description, quantity, rate, amount FROM invoice_items WHERE invoice_id = ?1 ORDER BY sort_order')
        .bind(invoiceId)
        .all<{ description: string; quantity: number; rate: number; amount: number }>();
      const locale = await loadLocaleContext(tenantDb);
      const currency = (invoice.currency as string) || locale.currency;
      const money = (n: number) => escapeHtml(formatMoney(Number(n) || 0, currency, locale.locale));
      const rowsHtml = (lines.results ?? [])
        .map((l) => `<tr><td style="padding:4px 12px 4px 0">${escapeHtml(l.description)}</td><td style="padding:4px 0;text-align:right">${money(l.amount)}</td></tr>`)
        .join('');
      const hasLink = !!invoice.payment_link_url && invoice.payment_link_status === 'created';
      const due = invoice.balance_due != null ? Number(invoice.balance_due) : Number(invoice.total);
      const queuedMail = await queueAgencyEmail(c.env, tenantDb, { tenantId: c.get('tenantId'), userId }, {
        to: data.to,
        subject: `Invoice ${invoice.invoice_number}`,
        contactId: (invoice.contact_id as string | null) ?? null,
        html: agencyEmailHtml({
          heading: `Invoice ${invoice.invoice_number}`,
          bodyHtml:
            textToHtml(`Hello ${invoice.contact_name ?? ''},

Please find your invoice below.`) +
            (rowsHtml ? `<table style="border-collapse:collapse;width:100%">${rowsHtml}</table>` : '') +
            `<p>Total: <strong>${money(Number(invoice.total))}</strong><br>Balance due: <strong>${money(due)}</strong>` +
            (invoice.due_date ? `<br>Due date: ${escapeHtml(String(invoice.due_date).slice(0, 10))}` : '') +
            '</p>',
          button: hasLink ? { label: 'Pay online', url: invoice.payment_link_url as string } : undefined,
        }),
      });
      if (!queuedMail.queued) {
        return error(c, 'This email address bounced earlier and is blocked. Correct the email address on the contact first.', 409);
      }
    }

    // Update status to 'sent' if currently draft
    const now = new Date().toISOString();
    if (invoice.status === 'draft') {
      await tenantDb
        .prepare('UPDATE invoices SET status = ?1, updated_at = ?2 WHERE id = ?3')
        .bind('sent', now, invoiceId)
        .run();
    }

    // Log activity
    await logActivity(drizzle(tenantDb), {
      userId,
      action: 'invoice_sent',
      entityType: 'invoice',
      entityId: invoiceId,
      details: JSON.stringify({ channel: data.channel, to: data.to, invoiceNumber: invoice.invoice_number }),
    });

    // Broadcast real-time event
    try {
      const tenantId = c.get('tenantId');
      if (invoice.status === 'draft') {
        await broadcastToTenant(c.env, tenantId, {
          type: 'invoice:status_changed',
          data: { invoiceId, oldStatus: 'draft', newStatus: 'sent', invoiceNumber: invoice.invoice_number },
        });
      }
    } catch {}

    return success(c, {
      id: invoiceId,
      invoiceNumber: invoice.invoice_number,
      status: invoice.status === 'draft' ? 'sent' : invoice.status,
      channel: data.channel,
      to: data.to,
      sentAt: now,
    });
  } catch (err) {
    console.error('Error sending invoice:', err);
    return error(c, 'Failed to send invoice', 500);
  }
});

// ============================================================
// POST /:id/payment-link — A link the customer pays through the AGENCY's own Razorpay or Stripe (R207)
// DELETE /:id/payment-link — Stop the current link
// ============================================================
// The link is for the balance due, in the invoice currency. The money goes straight to the agency's gateway
// account; a verified webhook (routes/payment-webhooks.ts) records the payment. Sharing the link with the
// customer goes through the Communication Hub (SendMessageDialog), never mailto: or wa.me.

const paymentLinkSchema = z.object({
  gateway: z.enum(['razorpay', 'stripe', 'mock']).optional(),
  // R142: omitted = the balance due. purpose 'deposit' uses the agency's deposit default (Settings > Invoice defaults)
  // unless an amount is given; 'custom' needs an amount.
  amount: z.number().positive().optional(),
  purpose: z.enum(['deposit', 'balance', 'custom']).optional(),
});

/** The gateway to use: the one asked for, else Razorpay for rupees and Stripe for everything else, else whatever is connected. */
function pickGateway(accounts: AccountRow[], currency: string, asked?: AgencyGatewayId, allowMock = false): AccountRow | null {
  // The test gateway is a candidate only where it is allowed, and only when asked for or when it is all that is connected.
  const active = accounts.filter((a) => a.is_active && (a.gateway === 'mock' ? allowMock : a.secret_enc));
  if (asked) return active.find((a) => a.gateway === asked) ?? null;
  const preferred = currency.toUpperCase() === 'INR' ? 'razorpay' : 'stripe';
  return active.find((a) => a.gateway === preferred) ?? active.find((a) => a.gateway !== 'mock') ?? active[0] ?? null;
}

invoiceRoutes.post('/:id/payment-link', zValidator('json', paymentLinkSchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const invoiceId = c.req.param('id');

  if (!checkInvoicePermission(c.get('role'))) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can create payment links');
  }

  const invoice = await tenantDb
    .prepare(
      `SELECT i.id, i.invoice_number, i.status, i.currency, i.total, i.balance_due, i.payment_link_id, i.payment_link_status, i.payment_link_gateway,
              c.name as contact_name, c.email as contact_email, c.phone as contact_phone
       FROM invoices i LEFT JOIN contacts c ON i.contact_id = c.id WHERE i.id = ?1`,
    )
    .bind(invoiceId)
    .first<{
      id: string; invoice_number: string; status: string; currency: string | null; total: number; balance_due: number;
      payment_link_id: string | null; payment_link_status: string | null; payment_link_gateway: string | null;
      contact_name: string | null; contact_email: string | null; contact_phone: string | null;
    }>();
  if (!invoice) return notFound(c, 'Invoice');
  if (['void', 'cancelled', 'paid'].includes(invoice.status) || !(invoice.balance_due > 0.01)) {
    return error(c, 'This invoice has nothing left to collect', 409, { code: 'NOTHING_DUE' });
  }

  const currency = invoice.currency || (await loadLocaleContext(tenantDb)).currency;
  const body = c.req.valid('json');
  if (body.gateway === 'mock' && !mockAllowed(c.env)) return error(c, 'The test gateway is not available in production', 400, { code: 'MOCK_NOT_ALLOWED' });

  // The amount this link collects (R142): a deposit, the balance or a custom amount, never more than is owed.
  const purpose = body.purpose ?? (body.amount !== undefined ? 'custom' : 'balance');
  const defaults = await loadPaymentDefaults(tenantDb);
  let linkAmount: number | null;
  if (body.amount !== undefined) linkAmount = body.amount;
  else if (purpose === 'deposit') linkAmount = depositAmount(defaults, invoice.total, invoice.balance_due);
  else if (purpose === 'custom') linkAmount = null;
  else linkAmount = invoice.balance_due;
  if (linkAmount === null) {
    return error(c, purpose === 'custom' ? 'Enter the amount to collect' : 'No deposit is set. Set one in Settings > Invoice defaults, or enter an amount', 400, { code: 'AMOUNT_REQUIRED' });
  }
  linkAmount = Math.round(linkAmount * 100) / 100;
  if (!(linkAmount > 0)) return error(c, 'The amount must be more than zero', 400, { code: 'AMOUNT_INVALID' });
  if (linkAmount > Math.round(invoice.balance_due * 100) / 100) {
    return error(c, 'The amount cannot be more than the balance due', 400, { code: 'AMOUNT_ABOVE_BALANCE' });
  }

  const accounts = await listAccounts(tenantDb);
  const account = pickGateway(accounts, currency, body.gateway, mockAllowed(c.env));
  if (!account) {
    return error(c, 'Connect Razorpay or Stripe in Settings > Integrations to create payment links', 409, { code: 'NO_GATEWAY' });
  }

  // Stripe: dynamic payment methods unless the agency chose a list; the list must fit the currency.
  const stripeMethods = account.gateway === 'stripe' ? defaults.stripeMethodTypes : null;
  if (stripeMethods) {
    const problem = stripeMethodsError(stripeMethods, currency);
    if (problem) return error(c, problem, 400, { code: 'PAYMENT_METHOD_CURRENCY' });
  }

  let creds = null;
  if (account.gateway !== 'mock') {
    try {
      creds = await openCredentials(c.env, account);
    } catch (e) {
      if (isCredentialError(e)) return error(c, 'Stored gateway keys cannot be opened; enter them again in Settings > Integrations', 503, { code: 'CREDENTIALS_UNAVAILABLE' });
      throw e;
    }
    if (!creds) return error(c, 'No gateway keys saved', 409, { code: 'NO_GATEWAY' });
  }

  // One live link per invoice: stop the previous one so it cannot be paid as well as the new one.
  if (invoice.payment_link_id && invoice.payment_link_status === 'created') {
    const previous = accounts.find((a) => a.gateway === invoice.payment_link_gateway);
    try {
      // A test-gateway link needs no cancelling at a provider: the new link id replaces it on the invoice.
      const old = previous && previous.gateway !== 'mock' ? await openCredentials(c.env, previous) : null;
      if (old) await cancelPaymentLink(old, invoice.payment_link_id);
    } catch {
      // keys unreadable: the new link still replaces it in the CRM
    }
  }

  let link;
  const linkParams = {
    linkRef: generateId(),
    invoiceId,
    invoiceNumber: invoice.invoice_number,
    amount: linkAmount,
    currency,
    customerName: invoice.contact_name,
    customerEmail: invoice.contact_email,
    customerPhone: invoice.contact_phone,
    purpose,
    ...(stripeMethods ? { paymentMethodTypes: stripeMethods } : {}),
  };
  try {
    if (account.gateway === 'mock') {
      // The link points at this API's own pay page, built from its public address like the subscription mock checkout.
      const tenantId = c.get('tenantId');
      const tenantKey = (await webhookKeyFor(c.env, tenantId, true))!;
      const base = c.env.API_PUBLIC_URL?.trim() || new URL(c.req.url).origin;
      link = await createMockPaymentLink(c.env, tenantId, tenantKey, base, linkParams);
    } else {
      link = await createPaymentLink(creds!, linkParams);
    }
  } catch (e) {
    if (e instanceof GatewayError) return error(c, `${account.gateway === 'razorpay' ? 'Razorpay' : 'Stripe'}: ${e.message}`, 502, { code: 'GATEWAY_ERROR' });
    throw e;
  }

  const now = new Date().toISOString();
  await tenantDb
    .prepare(
      `UPDATE invoices SET payment_link = ?1, payment_link_id = ?2, payment_link_url = ?1, payment_link_status = 'created', payment_link_gateway = ?5, payment_link_amount = ?6, payment_link_purpose = ?7, updated_at = ?3 WHERE id = ?4`,
    )
    .bind(link.url, link.id, now, invoiceId, account.gateway, linkAmount, purpose)
    .run();
  await logActivity(drizzle(tenantDb), {
    userId,
    action: 'payment_link_created',
    entityType: 'invoice',
    entityId: invoiceId,
    details: JSON.stringify({ gateway: account.gateway, mode: account.mode, linkId: link.id, amount: linkAmount, purpose, currency }),
  });

  return created(c, {
    invoiceId,
    gateway: account.gateway,
    mode: account.mode,
    linkId: link.id,
    url: link.url,
    status: 'created',
    amount: linkAmount,
    purpose,
    balanceDue: invoice.balance_due,
    currency,
  });
});

invoiceRoutes.delete('/:id/payment-link', async (c) => {
  const tenantDb = c.get('tenantDb');
  const invoiceId = c.req.param('id');
  if (!checkInvoicePermission(c.get('role'))) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can cancel payment links');
  }
  const invoice = await tenantDb
    .prepare('SELECT id, payment_link_id, payment_link_status, payment_link_gateway FROM invoices WHERE id = ?1')
    .bind(invoiceId)
    .first<{ id: string; payment_link_id: string | null; payment_link_status: string | null; payment_link_gateway: string | null }>();
  if (!invoice) return notFound(c, 'Invoice');
  if (!invoice.payment_link_id || invoice.payment_link_status !== 'created') return error(c, 'No open payment link on this invoice', 409);

  // Best effort at the gateway that issued it; the status below stops the CRM offering the link either way.
  const issuer = (await listAccounts(tenantDb)).find((a) => a.gateway === invoice.payment_link_gateway);
  try {
    const creds = issuer ? await openCredentials(c.env, issuer) : null;
    if (creds) await cancelPaymentLink(creds, invoice.payment_link_id);
  } catch {
    // keys unreadable
  }
  await tenantDb
    .prepare(`UPDATE invoices SET payment_link = NULL, payment_link_url = NULL, payment_link_status = 'cancelled', updated_at = ?1 WHERE id = ?2`)
    .bind(new Date().toISOString(), invoiceId)
    .run();
  return success(c, { invoiceId, status: 'cancelled' });
});

// ============================================================
// POST /from-itinerary — Generate invoice from itinerary
// ============================================================

const fromItinerarySchema = z.object({
  itineraryId: z.string().min(1),
});

invoiceRoutes.post('/from-itinerary', zValidator('json', fromItinerarySchema), async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const role = c.get('role');

  if (!checkInvoicePermission(role)) {
    return forbidden(c, 'Only admin, sales_manager, or accountant can create invoices');
  }

  const { itineraryId } = c.req.valid('json');

  try {
    // Check if invoice already exists for this itinerary
    const existing = await tenantDb
      .prepare('SELECT id, invoice_number FROM invoices WHERE lead_id = (SELECT lead_id FROM itineraries WHERE id = ?1) AND notes LIKE ?2')
      .bind(itineraryId, `%${itineraryId}%`)
      .first<{ id: string; invoice_number: string }>();

    // Fetch itinerary with lead context
    const itinerary = await tenantDb
      .prepare('SELECT i.*, l.contact_id FROM itineraries i JOIN leads l ON i.lead_id = l.id WHERE i.id = ?1')
      .bind(itineraryId)
      .first<Record<string, any>>();

    if (!itinerary) {
      return notFound(c, 'Itinerary');
    }

    // Tax follows the agency's own tax system. 18% is the GST default for travel services (India);
    // VAT and sales tax lines take the agency's configured rate, and a no-tax agency gets none.
    // R152: the margin scheme applies when the agency's settings say so (the cost is the itinerary's own cost).
    const taxCtx = await loadInvoiceTaxContext(c.env, c.get('tenantId'), tenantDb, { origin: 'itinerary' });
    const { regime, seller } = taxCtx;

    // A band line nobody falls in (quantity 0, R149) is not invoiced (R155: the lines are built by the shared helper).
    const invoiceItems = await itineraryInvoiceItems(tenantDb, itineraryId, regime);

    if (invoiceItems.length === 0) {
      return error(c, 'No items found in itinerary to generate invoice', 400);
    }

    const buyer = await loadTaxBuyer(tenantDb, itinerary.contact_id as string);
    if (!buyer) {
      return notFound(c, 'Contact');
    }

    const invoiceCurrency = (await loadLocaleContext(tenantDb)).currency;
    let marginCost: MarginCost | null = null;
    if (regime === 'margin' && taxCtx.margin) {
      marginCost = await resolveMarginCost(tenantDb, { scheme: taxCtx.scheme, currency: invoiceCurrency, itineraryId });
      taxCtx.margin = { ...taxCtx.margin, cost: marginCost.cost };
    }
    let doc;
    try {
      doc = computeDocumentTotals(invoiceItems.map((i) => ({ ...i, discountPercent: 0 })), undefined, 0, { regime, seller, buyer, margin: taxCtx.margin });
    } catch (e) {
      if (e instanceof TaxConfigError) return error(c, e.message, 400);
      throw e;
    }
    const taxCols = taxColumns(doc.tax);
    const totals = {
      subtotal: doc.subtotal, taxableAmount: doc.taxableAmount, cgst: doc.tax.cgst, sgst: doc.tax.sgst,
      igst: doc.tax.igst, vatAmount: doc.tax.vatAmount, totalTax: doc.tax.totalTax, total: doc.total,
    };
    const { invoiceNumber } = await generateInvoiceNumber(tenantDb, 'tax_invoice');

    const invoiceId = generateId();
    const now = new Date().toISOString();

    await tenantDb
      .prepare(
        `INSERT INTO invoices (
          id, contact_id, lead_id, invoice_number, type, subtotal,
          taxable_amount, tax_type, cgst, sgst, igst, vat_amount, total_tax, total,
          currency, status, paid_amount, balance_due, notes,
          created_by, created_at, updated_at,
          tax_regime, tax_breakdown, seller_tax_id, buyer_tax_id, place_of_supply, tax_notes
        ) VALUES (
          ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
          ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22,
          ?23, ?24, ?25, ?26, ?27, ?28
        )`
      )
      .bind(
        invoiceId, itinerary.contact_id, itinerary.lead_id, invoiceNumber, 'tax_invoice',
        totals.subtotal, totals.taxableAmount, taxCols.tax_type, totals.cgst, totals.sgst,
        totals.igst, totals.vatAmount, totals.totalTax, totals.total,
        invoiceCurrency, 'draft', 0, totals.total,
        JSON.stringify({ generatedFromItinerary: itineraryId }),
        userId, now, now,
        taxCols.tax_regime, taxCols.tax_breakdown, taxCols.seller_tax_id, taxCols.buyer_tax_id,
        taxCols.place_of_supply, taxCols.tax_notes
      )
      .run();

    if (regime === 'margin') {
      const m = marginColumns(regime, taxCtx.margin, marginCost);
      await tenantDb
        .prepare('UPDATE invoices SET margin_cost = ?1, margin_cost_source = ?2, margin_vat_rate = ?3, margin_wording = ?4 WHERE id = ?5')
        .bind(m.margin_cost, m.margin_cost_source, m.margin_vat_rate, m.margin_wording, invoiceId)
        .run();
    }

    // Create line items
    for (let i = 0; i < invoiceItems.length; i++) {
      const item = invoiceItems[i];
      const calc = doc.items[i];

      await tenantDb
        .prepare(
          `INSERT INTO invoice_items (
            id, invoice_id, description, hsn_code, quantity, rate,
            discount_percent, taxable_amount, tax_rate, tax_amount, amount, sort_order
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
        )
        .bind(
          generateId(), invoiceId, item.description, item.hsnCode,
          item.quantity, item.rate, 0, calc.taxable, calc.taxRate, calc.tax, calc.amount, i
        )
        .run();
    }

    await logActivity(drizzle(tenantDb), {
      userId, action: 'invoice_from_itinerary', entityType: 'invoice', entityId: invoiceId,
      details: JSON.stringify({ invoiceNumber, itineraryId }),
    });

    await emitFromRequest(c, { type: 'invoice.created', entityType: 'invoice', entityId: invoiceId, payload: { itineraryId } });

    return created(c, {
      id: invoiceId,
      invoiceNumber,
      itineraryId,
      existingInvoice: existing ? { id: existing.id, invoiceNumber: existing.invoice_number } : null,
      status: 'draft',
      total: totals.total,
      itemCount: invoiceItems.length,
    });
  } catch (err) {
    console.error('Error generating invoice from itinerary:', err);
    return error(c, 'Failed to generate invoice from itinerary', 500);
  }
});

export default invoiceRoutes;
