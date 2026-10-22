/**
 * Trip Invoice Generator (M20)
 *
 * Automatically generates a draft invoice when a trip is completed.
 * Creates invoice line items from the trip cost breakdown.
 */

import { generateId } from '../utils/uuid';
import { getTenantTimeZone, localDateString, addDaysLocal } from '../utils/tz';
import { loadLocaleContext } from '../utils/money';
import { computeDocumentTotals, loadTaxBuyer, loadTaxSettings, taxColumns } from './tax-calculator';
import { loadInvoiceTaxContext, marginColumns, resolveMarginCost, type MarginCost } from './margin-scheme';
import type { Env } from '../types';
import { calculateTripCost, haversineDistance, type RateCard } from './trip-cost-calculator';

/**
 * Generate a draft invoice from a completed trip.
 * Returns the created invoice data.
 */
export async function generateTripInvoice(
  db: any,
  trip: Record<string, any>,
  userId: string,
  /** Needed to apply the margin scheme (feature switch); without it the invoice follows the ordinary tax regime. */
  tenant?: { env: Env; tenantId: string },
): Promise<Record<string, any>> {
  const now = new Date().toISOString();
  const contactId = trip.contact_id;

  if (!contactId) {
    throw new Error('Trip has no linked contact for invoicing');
  }

  // Calculate actual cost if not already done
  let actualCost = trip.actual_cost as number | null;
  let actualBreakdown = trip.actual_breakdown ? JSON.parse(trip.actual_breakdown as string) : null;

  if (actualCost == null && trip.rate_card_id) {
    const rateCardRow = await db.prepare('SELECT * FROM vehicle_rate_cards WHERE id = ?').bind(trip.rate_card_id).first();
    if (rateCardRow) {
      // Calculate actual distance from check-in/check-out GPS if available
      let actualDistanceKm = trip.actual_distance_km as number | null;
      let actualDurationMin = trip.actual_duration_min as number | null;

      if (actualDistanceKm == null && trip.check_in_lat && trip.check_out_lat) {
        actualDistanceKm = haversineDistance(
          trip.check_in_lat as number, trip.check_in_lng as number,
          trip.check_out_lat as number, trip.check_out_lng as number,
        ) * 1.3; // Road factor
      }

      // Use estimated values as fallback
      if (actualDistanceKm == null) actualDistanceKm = trip.estimated_distance_km as number ?? 0;
      if (actualDurationMin == null && trip.check_in_at && trip.check_out_at) {
        const start = new Date(trip.check_in_at as string).getTime();
        const end = new Date(trip.check_out_at as string).getTime();
        actualDurationMin = (end - start) / 60000;
      }
      if (actualDurationMin == null) actualDurationMin = trip.estimated_duration_min as number ?? 0;

      // Calculate days/nights for outstation/round trips
      let numDays = 1;
      let numNights = 0;
      if (trip.pickup_datetime && trip.drop_datetime) {
        const pickupDate = new Date(trip.pickup_datetime as string);
        const dropDate = new Date(trip.drop_datetime as string);
        numDays = Math.max(1, Math.ceil((dropDate.getTime() - pickupDate.getTime()) / 86400000));
        numNights = Math.max(0, numDays - 1);
      }

      const rc: RateCard = {
        flatRate: rateCardRow.flat_rate as number | null,
        baseFare: rateCardRow.base_fare as number,
        perKmRate: rateCardRow.per_km_rate as number,
        perHourRate: rateCardRow.per_hour_rate as number,
        minKm: rateCardRow.min_km as number,
        minHours: rateCardRow.min_hours as number,
        nightCharge: rateCardRow.night_charge as number,
        driverAllowance: rateCardRow.driver_allowance as number,
        extraKmRate: rateCardRow.extra_km_rate as number,
        extraHourRate: rateCardRow.extra_hour_rate as number,
        tollIncluded: rateCardRow.toll_included as number,
        parkingIncluded: rateCardRow.parking_included as number,
        tripType: rateCardRow.trip_type as string,
      };

      const result = calculateTripCost(rc, {
        distanceKm: actualDistanceKm,
        durationMinutes: actualDurationMin,
        numDays,
        numNights,
      });

      actualCost = result.total;
      actualBreakdown = result;

      // Store actual values on the trip
      await db.prepare(`
        UPDATE trip_assignments SET
          actual_distance_km = ?, actual_duration_min = ?,
          actual_cost = ?, actual_breakdown = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        actualDistanceKm, actualDurationMin,
        actualCost, JSON.stringify(actualBreakdown), now,
        trip.id,
      ).run();
    }
  }

  // Use cost override if set
  const finalCost = (trip.cost_override as number | null) ?? actualCost ?? (trip.estimated_cost as number ?? 0);
  // The invoice is in the rate card's currency when the trip has one, else the agency's.
  const rateCardCurrency = trip.rate_card_id
    ? (await db.prepare('SELECT currency FROM vehicle_rate_cards WHERE id = ?').bind(trip.rate_card_id).first() as { currency: string | null } | null)?.currency
    : null;
  const currency = (rateCardCurrency || (await loadLocaleContext(db)).currency).toUpperCase();

  // Tax follows the agency's own tax system (settings) and the contact, like every other invoice
  const taxCtx = tenant
    ? await loadInvoiceTaxContext(tenant.env, tenant.tenantId, db, { origin: 'trip' })
    : { ...(await loadTaxSettings(db)), margin: null, scheme: null };
  const { regime, seller } = taxCtx;
  let marginCost: MarginCost | null = null;
  if (regime === 'margin' && taxCtx.margin && taxCtx.scheme) {
    // A transport trip has no departure or itinerary behind it: the cost is typed on the invoice.
    marginCost = await resolveMarginCost(db, { scheme: taxCtx.scheme, currency });
    taxCtx.margin = { ...taxCtx.margin, cost: marginCost.cost };
  }
  const buyer = (await loadTaxBuyer(db, contactId)) ?? {};
  // GST: travel and transport services are typically 5% in India (SAC 996411). Other regimes use the
  // agency's configured rate (undefined here).
  const taxRate: number | undefined = regime === 'gst' ? 5 : undefined;

  // Build invoice line items from cost breakdown
  const items: Array<{ description: string; rate: number; taxRate: number | undefined; hsnCode: string }> = [];

  if (actualBreakdown && !actualBreakdown.isFlat) {
    if (actualBreakdown.baseFare > 0) {
      items.push({ description: 'Base Fare', rate: actualBreakdown.baseFare, taxRate, hsnCode: '996411' });
    }
    if (actualBreakdown.kmCharges > 0) {
      items.push({ description: `Distance Charges (${trip.actual_distance_km ?? trip.estimated_distance_km ?? 0} km)`, rate: actualBreakdown.kmCharges, taxRate, hsnCode: '996411' });
    }
    if (actualBreakdown.extraKmCharges > 0) {
      items.push({ description: 'Extra KM Charges', rate: actualBreakdown.extraKmCharges, taxRate, hsnCode: '996411' });
    }
    if (actualBreakdown.extraHourCharges > 0) {
      items.push({ description: 'Extra Hour Charges', rate: actualBreakdown.extraHourCharges, taxRate, hsnCode: '996411' });
    }
    if (actualBreakdown.nightCharge > 0) {
      items.push({ description: 'Night Charge', rate: actualBreakdown.nightCharge, taxRate, hsnCode: '996411' });
    }
    if (actualBreakdown.driverAllowance > 0) {
      items.push({ description: 'Driver Allowance', rate: actualBreakdown.driverAllowance, taxRate, hsnCode: '996411' });
    }
  } else {
    // Flat rate or no breakdown — single line item
    items.push({ description: `Transport Service (${trip.pickup_location ?? ''} → ${trip.drop_location ?? ''})`, rate: finalCost, taxRate, hsnCode: '996411' });
  }

  // Add trip costs (tolls, parking, etc.) if not included in rate card
  const tripCosts = await db.prepare('SELECT * FROM trip_costs WHERE trip_id = ?').bind(trip.id).all();
  for (const cost of (tripCosts.results || [])) {
    items.push({
      description: `${(cost.cost_type as string).replace(/_/g, ' ')}${cost.description ? ` - ${cost.description}` : ''}`,
      rate: cost.amount as number,
      taxRate: 0, // Trip costs like tolls are typically pass-through
      hsnCode: '',
    });
  }

  // Calculate totals
  const doc = computeDocumentTotals(
    items.map((i) => ({ rate: i.rate, quantity: 1, taxRate: i.taxRate })),
    undefined,
    0,
    { regime, seller, buyer, margin: taxCtx.margin },
  );
  const taxCols = taxColumns(doc.tax);
  const { subtotal, total } = doc;
  const totalTax = doc.tax.totalTax;
  const { cgst, sgst, igst, vatAmount } = doc.tax;

  // Generate invoice number
  const { generateInvoiceNumber } = await import('./numbering');
  const { invoiceNumber } = await generateInvoiceNumber(db, 'tax_invoice');

  const invoiceId = generateId();
  // due in 15 days, counted on the tenant's local calendar
  const dueDate = addDaysLocal(localDateString(await getTenantTimeZone(db)), 15);

  await db.prepare(`
    INSERT INTO invoices (
      id, contact_id, lead_id, invoice_number, type, subtotal,
      taxable_amount, tax_type, cgst, sgst, igst, vat_amount, total_tax, total,
      currency, status, due_date, paid_amount, balance_due, notes,
      created_by, created_at, updated_at,
      tax_regime, tax_breakdown, seller_tax_id, buyer_tax_id, place_of_supply, tax_notes
    ) VALUES (?, ?, ?, ?, 'tax_invoice', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    invoiceId, contactId, trip.lead_id ?? null, invoiceNumber,
    subtotal, subtotal, taxCols.tax_type, cgst, sgst, igst, vatAmount, totalTax, total, currency,
    dueDate, total,
    `Auto-generated from trip ${trip.id}`,
    userId, now, now,
    taxCols.tax_regime, taxCols.tax_breakdown, taxCols.seller_tax_id, taxCols.buyer_tax_id,
    taxCols.place_of_supply, taxCols.tax_notes,
  ).run();

  if (regime === 'margin') {
    const m = marginColumns(regime, taxCtx.margin, marginCost);
    await db.prepare('UPDATE invoices SET margin_cost = ?, margin_cost_source = ?, margin_vat_rate = ?, margin_wording = ? WHERE id = ?')
      .bind(m.margin_cost, m.margin_cost_source, m.margin_vat_rate, m.margin_wording, invoiceId).run();
  }

  // Create line items
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const calc = doc.items[i];
    await db.prepare(`
      INSERT INTO invoice_items (id, invoice_id, description, hsn_code, quantity, rate, discount_percent, taxable_amount, tax_rate, tax_amount, amount, sort_order)
      VALUES (?, ?, ?, ?, 1, ?, 0, ?, ?, ?, ?, ?)
    `).bind(
      generateId(), invoiceId, item.description, item.hsnCode || null,
      item.rate, calc.taxable, calc.taxRate, calc.tax, calc.amount, i,
    ).run();
  }

  // Link invoice to trip
  await db.prepare('UPDATE trip_assignments SET invoice_id = ?, updated_at = ? WHERE id = ?').bind(invoiceId, now, trip.id).run();

  return { invoiceId, invoiceNumber, total, status: 'draft', contactId, tripId: trip.id };
}
