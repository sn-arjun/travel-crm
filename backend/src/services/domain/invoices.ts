import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../../types';
import { notifications } from '../../db/tenant-schema';
import { generateId } from '../../utils/uuid';
import { logActivity } from '../../utils/activity-logger';
import { generateInvoiceNumber } from '../numbering';
import { computeDocumentTotals, loadTaxBuyer, taxColumns } from '../tax-calculator';
import { formatMoney, loadLocaleContext } from '../../utils/money';
import { getTenantTimeZone, localDateString } from '../../utils/tz';
import { loadAgencyBankDetails } from '../../utils/bank-details';
import { emitEvent } from '../automation/events';
import { loadInvoiceTaxContext, marginColumns, resolveMarginCost, type InvoiceOrigin, type MarginCost } from '../margin-scheme';

export interface CreateInvoiceItemInput {
  description: string;
  hsnCode?: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  taxRate?: number;
}

export interface CreateInvoiceInput {
  contactId: string;
  leadId?: string | null;
  type: 'tax_invoice' | 'proforma' | 'receipt';
  items: CreateInvoiceItemInput[];
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  dueDate?: string;
  issueDate?: string | null;
  terms?: string | null;
  notes?: string;
  bankDetails?: Record<string, unknown>;
  /** Omitted: the agency's currency setting applies. */
  currency?: string;
  gstRate?: number;
  /**
   * 'margin' puts the invoice under the margin scheme (refused with MarginSchemeError unless the agency switched it on);
   * 'standard' keeps the agency's ordinary regime. Omitted: the agency's settings decide (tax system, "start new invoices in").
   */
  taxRegime?: 'margin' | 'standard';
  /** Where the invoice comes from; a seat booking's invoice starts in margin mode when the setting says so. */
  origin?: InvoiceOrigin;
  /** Margin scheme: the seat booking whose departure costs are the cost of this invoice. */
  seatBookingId?: string | null;
  /** Margin scheme: the itinerary whose cost is the cost of this invoice. */
  itineraryId?: string | null;
  /** Margin scheme: a cost typed on the invoice (always a manual cost). */
  marginCost?: number | null;
}

export interface InvoiceActor {
  /** null when a public page creates the invoice (the booking page): no staff member did it, so no activity entry is written. */
  userId: string | null;
  /** Automation depth of whatever is creating the invoice (0 for a person). */
  depth?: number;
  /** Let follow-on automations run after the response instead of before it. */
  waiter?: { waitUntil(promise: Promise<unknown>): void };
}

/** Thrown when the invoice cannot be created because the contact does not exist. */
export class InvoiceContactNotFound extends Error {
  constructor() {
    super('Contact not found');
    this.name = 'InvoiceContactNotFound';
  }
}

const ITEM_HSN: Record<string, string> = {
  hotel: '996311',
  accommodation: '996311',
  transport: '996411',
  vehicle: '996411',
  activity: '998551',
  sightseeing: '998551',
  meal: '996331',
  food: '996331',
  flight: '997221',
  visa: '997121',
};

/**
 * The invoice lines of a quote: one per itinerary item, "Day N: title", in day order. A band line nobody falls in (quantity 0, R149)
 * is left out. `regime` is the agency's tax regime: under GST the lines carry the travel-services default of 18%; under any other
 * regime the rate is left to the tax calculator. Used by POST /invoices/from-itinerary and by quote acceptance (R155).
 */
export async function itineraryInvoiceItems(tenantDb: D1Database, itineraryId: string, regime: string): Promise<CreateInvoiceItemInput[]> {
  const days = await tenantDb.prepare('SELECT * FROM itinerary_days WHERE itinerary_id = ?1 ORDER BY day_number').bind(itineraryId).all<Record<string, any>>();
  const out: CreateInvoiceItemInput[] = [];
  for (const day of days.results || []) {
    const items = await tenantDb.prepare('SELECT * FROM itinerary_items WHERE day_id = ?1 ORDER BY sort_order').bind(day.id).all<Record<string, any>>();
    for (const item of items.results || []) {
      if (item.quantity === 0) continue;
      const itemType = ((item.type as string) || 'activity').toLowerCase();
      out.push({
        description: `Day ${day.day_number}: ${item.title || item.description || itemType}`,
        hsnCode: ITEM_HSN[itemType] || '999799',
        quantity: (item.quantity as number) || 1,
        rate: (item.selling_price as number) || (item.cost as number) || 0,
        discountPercent: 0,
        taxRate: regime === 'gst' ? 18 : undefined,
      });
    }
  }
  return out;
}

export type CreatedInvoice= Awaited<ReturnType<typeof createInvoice>>;

/**
 * Create an invoice: numbering, tax (agency regime and buyer), line items, bank snapshot, activity entry, lead-owner
 * notification and the invoice.created event. TaxConfigError and InvoiceContactNotFound are thrown for the caller to
 * answer; any other error is unexpected. Used by the invoices API; other flows (from itinerary, bookings) build on it.
 */
export async function createInvoice(
  env: Env,
  tenantId: string,
  tenantDb: D1Database,
  data: CreateInvoiceInput,
  actor: InvoiceActor,
) {
  const localeCtx = await loadLocaleContext(tenantDb);
  const currency = (data.currency ?? localeCtx.currency).toUpperCase();
  // Verify contact exists
  const buyer = await loadTaxBuyer(tenantDb, data.contactId);
  if (!buyer) throw new InvoiceContactNotFound();

  // Tax follows the agency's own tax system (settings) and the buyer, and is stored on the invoice
  const taxCtx = await loadInvoiceTaxContext(env, tenantId, tenantDb, { origin: data.origin ?? 'manual', request: data.taxRegime });
  const { regime, seller } = taxCtx;
  let marginCost: MarginCost | null = null;
  if (regime === 'margin' && taxCtx.margin) {
    marginCost = await resolveMarginCost(tenantDb, {
      scheme: taxCtx.scheme, currency, manualCost: data.marginCost, seatBookingId: data.seatBookingId, itineraryId: data.itineraryId,
    });
    taxCtx.margin = { ...taxCtx.margin, cost: marginCost.cost };
  }
  const doc = computeDocumentTotals(data.items, data.discountType, data.discountValue ?? 0, { regime, seller, buyer, gstDefaultRate: data.gstRate, margin: taxCtx.margin });
  const taxCols = taxColumns(doc.tax);
  const marginCols = marginColumns(regime, taxCtx.margin, marginCost);
  const totals = {
    subtotal: doc.subtotal,
    discountAmount: doc.discountAmount,
    taxableAmount: doc.taxableAmount,
    cgst: doc.tax.cgst,
    sgst: doc.tax.sgst,
    igst: doc.tax.igst,
    vatAmount: doc.tax.vatAmount,
    totalTax: doc.tax.totalTax,
    total: doc.total,
  };

  // Generate invoice number
  const { invoiceNumber } = await generateInvoiceNumber(tenantDb, data.type);

  const agencyBank = data.bankDetails ? null : await loadAgencyBankDetails(tenantDb);
  const bankSnapshot = data.bankDetails
    ? JSON.stringify(data.bankDetails)
    : agencyBank && Object.keys(agencyBank.details).length > 0
      ? JSON.stringify(agencyBank.details)
      : null;

  // Create invoice
  const invoiceId = generateId();
  const now = new Date().toISOString();
  const issueDate = data.issueDate || localDateString(await getTenantTimeZone(tenantDb));

  await tenantDb
    .prepare(
      `INSERT INTO invoices (
        id, contact_id, lead_id, invoice_number, type, subtotal,
        discount_type, discount_value, discount_amount, taxable_amount,
        tax_type, cgst, sgst, igst, vat_amount, total_tax, total,
        currency, status, due_date, paid_amount, balance_due, notes,
        bank_details, created_by, created_at, updated_at, issue_date, terms,
        tax_regime, tax_breakdown, seller_tax_id, buyer_tax_id, place_of_supply, tax_notes,
        margin_cost, margin_cost_source, margin_vat_rate, margin_wording
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
        ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
        ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29,
        ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39
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
      taxCols.tax_type,
      totals.cgst,
      totals.sgst,
      totals.igst,
      totals.vatAmount,
      totals.totalTax,
      totals.total,
      currency,
      'draft', // status
      data.dueDate || null,
      0, // paid_amount
      totals.total, // balance_due
      data.notes || null,
      // An invoice keeps the bank details it was issued with: the ones sent, else the agency's current ones.
      bankSnapshot,
      actor.userId,
      now,
      now,
      issueDate,
      data.terms || null,
      taxCols.tax_regime,
      taxCols.tax_breakdown,
      taxCols.seller_tax_id,
      taxCols.buyer_tax_id,
      taxCols.place_of_supply,
      taxCols.tax_notes,
      marginCols.margin_cost,
      marginCols.margin_cost_source,
      marginCols.margin_vat_rate,
      marginCols.margin_wording
    )
    .run();

  // Create line items
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

  // Log activity
  const db = drizzle(tenantDb);
  if (actor.userId) {
    await logActivity(db, {
      userId: actor.userId, action: 'invoice_created', entityType: 'invoice', entityId: invoiceId,
      details: JSON.stringify({ invoiceNumber, contactId: data.contactId }),
    });
  }

  // Notify lead owner if invoice is linked to a lead (TICKET-166)
  if (data.leadId) {
    try {
      const lead = await tenantDb
        .prepare('SELECT assigned_to, created_by FROM leads WHERE id = ? AND is_deleted = 0')
        .bind(data.leadId)
        .first<{ assigned_to: string | null; created_by: string }>();
      const notifyId = lead?.assigned_to ?? lead?.created_by;
      if (notifyId && notifyId !== actor.userId) {
        await db.insert(notifications).values({
          id: generateId(),
          userId: notifyId,
          title: 'Invoice created',
          message: `Invoice ${invoiceNumber} for ${formatMoney(totals.total, currency, localeCtx.locale)} has been created`,
          type: 'invoice_overdue',
          referenceType: 'invoice',
          referenceId: invoiceId,
        });
      }
    } catch (_) {
      // Non-critical
    }
  }

  await emitEvent(
    env,
    tenantId,
    tenantDb,
    {
      type: 'invoice.created',
      entityType: 'invoice',
      entityId: invoiceId,
      payload: { contactId: data.contactId, leadId: data.leadId ?? null },
      actorId: actor.userId,
      depth: actor.depth ?? 0,
    },
    actor.waiter,
  );

  return { id: invoiceId, invoiceNumber, currency, totals, doc, marginCost };
}
