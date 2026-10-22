/**
 * The invoice of a seat booking (R148, design 8.4) and its deposit payment link.
 *
 * Lines: one per age band (count x price), a room supplement per passenger whose room type has one, and the preferred-seat
 * surcharge. The invoice is made by the shared createInvoice (numbering, tax regime, events), in the departure's currency, linked to the
 * lead and to seat_bookings.invoice_id. While the invoice is still a draft with nothing paid, creating it again refreshes the lines
 * from the current passengers; once it is sent or paid it is left alone (409 INVOICE_LOCKED).
 *
 * The deposit link follows the rules of the invoice route (R142): the agency's gateway (or the local test gateway where it is
 * allowed), never more than the balance, one live link per invoice. When no gateway can issue a link the caller shows the bank
 * details with the invoice number as the reference.
 */

import type { Env } from '../../types';
import { createInvoice, InvoiceContactNotFound, type CreateInvoiceItemInput } from '../domain/invoices';
import { computeDocumentTotals, loadTaxBuyer, loadTaxSettings, taxColumns, TaxConfigError } from '../tax-calculator';
import { loadLocaleContext } from '../../utils/money';
import { generateId } from '../../utils/uuid';
import { logActivity } from '../../utils/activity-logger';
import { bankPrintLines, loadAgencyBankDetails } from '../../utils/bank-details';
import { agencyDefaultLanguage, t, type TextLanguage } from '../../i18n';
import { GatewayError, mockAllowed } from '../billing/gateway';
import { createPaymentLink, stripeMethodsError, type AgencyGatewayId } from '../payments/agency-gateway';
import {
  isCredentialError, listAccounts, loadPaymentDefaults, openCredentials, webhookKeyFor, type AccountRow,
} from '../payments/accounts';
import { createMockPaymentLink } from '../payments/mock-agency';
import { DepartureError, nowIso } from './common';
import { getPassengers, type PassengerDto } from './passengers';
import { loadDepartureContext, requireBookingRow, type DepartureContext } from './seat-support';
import { effectivePrices, type PriceRow } from './tours';

export interface BookingInvoiceLine {
  kind: 'band' | 'room' | 'seat';
  /** The band, room type or surcharge this line is for. */
  key: string;
  description: string;
  quantity: number;
  rate: number;
}

/** Texts the lines are written with, in the agency's language. */
export interface LineTexts {
  band(label: string): string;
  room(label: string): string;
  seat(): string;
}

const bySort = (a: PriceRow, b: PriceRow) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key);

/**
 * The lines for a set of passengers. Pure, so the totals can be checked without a database.
 * A passenger without a band is charged the highest band that has a price (the adult fare); bands without a price (or priced 0)
 * produce no line. `preferredSeat` says whether a seat number on a passenger earns the surcharge.
 */
export function buildBookingLines(input: {
  passengers: Array<Pick<PassengerDto, 'bandKey' | 'roomType' | 'seatNumber'>>;
  prices: PriceRow[];
  roomLabels: Record<string, string>;
  preferredSeat: boolean;
  texts: LineTexts;
}): BookingInvoiceLine[] {
  const { passengers, prices, roomLabels, preferredSeat, texts } = input;
  const lines: BookingInvoiceLine[] = [];

  const bandPrices = prices.filter((p) => p.kind === 'age_band').sort(bySort);
  const priced = new Set(bandPrices.map((p) => p.key));
  const fallbackBand = bandPrices[0]?.key ?? null;
  const counts = new Map<string, number>();
  for (const p of passengers) {
    const key = p.bandKey && priced.has(p.bandKey) ? p.bandKey : p.bandKey ? null : fallbackBand;
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const price of bandPrices) {
    const quantity = counts.get(price.key) ?? 0;
    if (quantity > 0 && price.amount > 0) lines.push({ kind: 'band', key: price.key, description: texts.band(price.label || price.key), quantity, rate: price.amount });
  }

  for (const price of prices.filter((p) => p.kind === 'room_supplement').sort(bySort)) {
    const quantity = passengers.filter((p) => p.roomType === price.key).length;
    if (quantity > 0 && price.amount > 0) lines.push({ kind: 'room', key: price.key, description: texts.room(price.label || roomLabels[price.key] || price.key), quantity, rate: price.amount });
  }

  const seat = prices.filter((p) => p.kind === 'seat_surcharge').sort(bySort)[0];
  if (seat && seat.amount > 0 && preferredSeat) {
    const quantity = passengers.filter((p) => !!p.seatNumber).length;
    if (quantity > 0) lines.push({ kind: 'seat', key: seat.key, description: texts.seat(), quantity, rate: seat.amount });
  }
  return lines;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The deposit a booking owes up front (design 4.1): a percent of the total, per seat, a fixed sum, or 0 for none. Never more than the total. */
export function bookingDeposit(deposit: { type: string; value: number | null }, seats: number, total: number): number {
  const v = deposit.value ?? 0;
  if (!(v > 0)) return 0;
  const raw = deposit.type === 'percent' ? (total * v) / 100 : deposit.type === 'per_seat' ? v * seats : deposit.type === 'fixed' ? v : 0;
  return Math.min(round2(raw), round2(total));
}

export interface BookingInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  total: number;
  /** True when the invoice was made now; false when an existing draft was refreshed. */
  created: boolean;
}

export interface InvoiceActorLike {
  userId: string | null;
  depth?: number;
  waiter?: { waitUntil(promise: Promise<unknown>): void };
}

async function linesFor(db: D1Database, dep: DepartureContext, passengers: PassengerDto[]): Promise<{ lines: BookingInvoiceLine[]; currency: string; lang: TextLanguage }> {
  const lang = await agencyDefaultLanguage(db);
  const prices = await effectivePrices(db, dep.row.tour_id, dep.row.id);
  const when = dep.row.start_date as string;
  const tour = dep.tour.title as string;
  const lines = buildBookingLines({
    passengers,
    prices,
    roomLabels: Object.fromEntries(dep.effective.roomTypes.map((r) => [r.key, r.label])),
    preferredSeat: dep.settings.preferredSeat.enabled,
    texts: {
      band: (label) => t(lang, 'booking.invoice.band', { tour, date: when, band: label }),
      room: (label) => t(lang, 'booking.invoice.room', { room: label }),
      seat: () => t(lang, 'booking.invoice.seat'),
    },
  });
  const currency = ((dep.tour.currency as string | null) ?? (await loadLocaleContext(db)).currency).toUpperCase();
  return { lines, currency, lang };
}

const toItem = (l: BookingInvoiceLine): CreateInvoiceItemInput => ({ description: l.description, quantity: l.quantity, rate: l.rate, discountPercent: 0 });

/**
 * Creates the invoice of a held or confirmed booking, or refreshes its draft invoice from the current passengers.
 * Throws DepartureError: 404 NOT_FOUND, 409 BOOKING_NOT_INVOICEABLE (waitlisted, cancelled, expired), 409 NOTHING_TO_INVOICE
 * (no prices on the tour), 409 INVOICE_LOCKED (the invoice is no longer a draft), 409 TAX_CONFIG.
 */
export async function createBookingInvoice(env: Env, tenantId: string, db: D1Database, seatBookingId: string, actor: InvoiceActorLike): Promise<BookingInvoiceResult> {
  const booking = await requireBookingRow(db, seatBookingId);
  if (!['held', 'confirmed'].includes(booking.status)) {
    throw new DepartureError(409, 'BOOKING_NOT_INVOICEABLE', `A ${booking.status} booking cannot be invoiced`, { status: booking.status });
  }
  const dep = await loadDepartureContext(db, booking.departure_id);
  const passengers = await getPassengers(db, seatBookingId);
  const { lines, currency, lang } = await linesFor(db, dep, passengers);
  if (!lines.length) throw new DepartureError(409, 'NOTHING_TO_INVOICE', 'The tour has no prices for these passengers, so there is nothing to invoice');

  // Passengers with a preferred seat carry the surcharge, so the manifest shows what they pay for it.
  const seatLine = lines.find((l) => l.kind === 'seat');
  await db
    .prepare(`UPDATE seat_passengers SET seat_surcharge = ?, updated_at = ? WHERE seat_booking_id = ? AND status = 'active' AND seat_number IS NOT NULL`)
    .bind(seatLine ? seatLine.rate : null, nowIso(), seatBookingId)
    .run();

  if (booking.invoice_id) {
    const invoice = await db
      .prepare('SELECT id, invoice_number, status, paid_amount, currency FROM invoices WHERE id = ?')
      .bind(booking.invoice_id)
      .first<{ id: string; invoice_number: string; status: string; paid_amount: number | null; currency: string | null }>();
    if (invoice) {
      if (invoice.status !== 'draft' || (invoice.paid_amount ?? 0) > 0) {
        throw new DepartureError(409, 'INVOICE_LOCKED', 'The invoice has been sent or paid, so it is no longer changed from the passengers', { invoiceNumber: invoice.invoice_number });
      }
      const total = await refreshDraft(db, invoice.id, booking.contact_id, lines.map(toItem));
      await db.prepare('UPDATE invoices SET currency = ?, updated_at = ? WHERE id = ?').bind(currency, nowIso(), invoice.id).run();
      return { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, currency, total, created: false };
    }
  }

  let made;
  try {
    made = await createInvoice(
      env, tenantId, db,
      {
        contactId: booking.contact_id,
        leadId: booking.lead_id,
        type: 'tax_invoice',
        items: lines.map(toItem),
        currency,
        notes: t(lang, 'booking.invoice.notes', { tour: dep.tour.title, code: dep.row.code }),
      },
      { userId: actor.userId, depth: actor.depth, waiter: actor.waiter },
    );
  } catch (e) {
    if (e instanceof TaxConfigError) throw new DepartureError(409, 'TAX_CONFIG', e.message);
    if (e instanceof InvoiceContactNotFound) throw new DepartureError(404, 'CONTACT_NOT_FOUND', 'Contact not found');
    throw e;
  }
  // Only the first invoice claims the booking: a second request that raced this one leaves the first link in place.
  await db.prepare('UPDATE seat_bookings SET invoice_id = ?, updated_at = ? WHERE id = ? AND invoice_id IS NULL').bind(made.id, nowIso(), seatBookingId).run();
  return { invoiceId: made.id, invoiceNumber: made.invoiceNumber, currency: made.currency, total: made.totals.total, created: true };
}

/** Recomputes a draft invoice from new lines: totals, tax and items, in one batch. Returns the new total. */
export async function refreshDraft(db: D1Database, invoiceId: string, contactId: string, items: CreateInvoiceItemInput[]): Promise<number> {
  const buyer = await loadTaxBuyer(db, contactId);
  if (!buyer) throw new DepartureError(404, 'CONTACT_NOT_FOUND', 'Contact not found');
  const { regime, seller } = await loadTaxSettings(db);
  let doc;
  try {
    doc = computeDocumentTotals(items, undefined, 0, { regime, seller, buyer });
  } catch (e) {
    if (e instanceof TaxConfigError) throw new DepartureError(409, 'TAX_CONFIG', e.message);
    throw e;
  }
  const cols = taxColumns(doc.tax);
  const now = nowIso();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE invoices SET subtotal = ?, discount_type = NULL, discount_value = NULL, discount_amount = ?, taxable_amount = ?, tax_type = ?,
           cgst = ?, sgst = ?, igst = ?, vat_amount = ?, total_tax = ?, total = ?, balance_due = ?, tax_regime = ?, tax_breakdown = ?,
           seller_tax_id = ?, buyer_tax_id = ?, place_of_supply = ?, tax_notes = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(
        doc.subtotal, doc.discountAmount, doc.taxableAmount, cols.tax_type,
        doc.tax.cgst, doc.tax.sgst, doc.tax.igst, doc.tax.vatAmount, doc.tax.totalTax, doc.total, doc.total, cols.tax_regime, cols.tax_breakdown,
        cols.seller_tax_id, cols.buyer_tax_id, cols.place_of_supply, cols.tax_notes, now, invoiceId,
      ),
    db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').bind(invoiceId),
  ];
  items.forEach((item, i) => {
    const calc = doc.items[i];
    statements.push(
      db
        .prepare(
          `INSERT INTO invoice_items (id, invoice_id, description, hsn_code, quantity, rate, discount_percent, taxable_amount, tax_rate, tax_amount, amount, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(generateId(), invoiceId, item.description, item.hsnCode || null, item.quantity, item.rate, item.discountPercent, calc.taxable, calc.taxRate, calc.tax, calc.amount, i),
    );
  });
  await db.batch(statements);
  return doc.total;
}

// ---------------------------------------------------------------- the deposit link

export interface DepositLink {
  url: string;
  gateway: AgencyGatewayId;
  amount: number;
  currency: string;
}

/** The gateway to use: Razorpay for rupees and Stripe for everything else, else whatever is connected (the test gateway last). */
function pickAccount(accounts: AccountRow[], currency: string, allowMock: boolean): AccountRow | null {
  const active = accounts.filter((a) => a.is_active && (a.gateway === 'mock' ? allowMock : a.secret_enc));
  const preferred = currency.toUpperCase() === 'INR' ? 'razorpay' : 'stripe';
  return active.find((a) => a.gateway === preferred) ?? active.find((a) => a.gateway !== 'mock') ?? active[0] ?? null;
}

/**
 * A payment link for `amount` of the invoice, from the agency's connected gateway. Returns null when there is none that can issue
 * one (nothing connected, keys unreadable, the provider refused): the caller falls back to the bank details. The link is stored on
 * the invoice as a deposit link, replacing any earlier open one.
 */
export async function createDepositLink(
  env: Env,
  tenantId: string,
  db: D1Database,
  invoice: { id: string; invoiceNumber: string; currency: string },
  amount: number,
  contact: { name: string | null; email: string | null; phone: string | null },
  apiBase: string,
  purpose: 'deposit' | 'balance' | 'custom' = 'deposit',
): Promise<DepositLink | null> {
  const value = round2(amount);
  if (!(value > 0)) return null;
  const accounts = await listAccounts(db);
  const account = pickAccount(accounts, invoice.currency, mockAllowed(env));
  if (!account) return null;

  const defaults = await loadPaymentDefaults(db);
  const stripeMethods = account.gateway === 'stripe' ? defaults.stripeMethodTypes : null;
  if (stripeMethods && stripeMethodsError(stripeMethods, invoice.currency)) return null;

  const params = {
    linkRef: generateId(),
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amount: value,
    currency: invoice.currency,
    customerName: contact.name,
    customerEmail: contact.email,
    customerPhone: contact.phone,
    purpose,
    ...(stripeMethods ? { paymentMethodTypes: stripeMethods } : {}),
  };
  let link;
  try {
    if (account.gateway === 'mock') {
      const tenantKey = (await webhookKeyFor(env, tenantId, true))!;
      link = await createMockPaymentLink(env, tenantId, tenantKey, apiBase, params);
    } else {
      const creds = await openCredentials(env, account);
      if (!creds) return null;
      link = await createPaymentLink(creds, params);
    }
  } catch (e) {
    if (e instanceof GatewayError || isCredentialError(e)) {
      console.error('[public-booking] deposit link not created:', account.gateway, e instanceof Error ? e.message : e);
      return null;
    }
    throw e;
  }

  await db
    .prepare(
      `UPDATE invoices SET payment_link = ?1, payment_link_id = ?2, payment_link_url = ?1, payment_link_status = 'created', payment_link_gateway = ?5,
         payment_link_amount = ?6, payment_link_purpose = ?7, updated_at = ?3 WHERE id = ?4`,
    )
    .bind(link.url, link.id, nowIso(), invoice.id, account.gateway, value, purpose)
    .run();
  return { url: link.url, gateway: account.gateway, amount: value, currency: invoice.currency };
}

/** Records a link made for a person (the staff route) in the activity log; kept next to the link code. */
export async function logDepositLink(db: D1Database, userId: string, invoiceId: string, link: DepositLink): Promise<void> {
  await logActivity(db, { userId, action: 'payment_link_created', entityType: 'invoice', entityId: invoiceId, details: JSON.stringify({ gateway: link.gateway, amount: link.amount, purpose: 'deposit' }) });
}

// ---------------------------------------------------------------- bank transfer fallback

export interface BankInstructions {
  lines: Array<{ field: string; label: string; value: string }>;
  reference: string;
}

/** The agency's bank details (country-shaped) and the reference to put on the transfer, or null when no bank details are saved. */
export async function bankInstructions(db: D1Database, invoiceNumber: string): Promise<BankInstructions | null> {
  const { country, details } = await loadAgencyBankDetails(db);
  const lines = bankPrintLines(country, details);
  if (!lines.length) return null;
  const defaults = await loadPaymentDefaults(db);
  return { lines, reference: defaults.bankReference.replace(/\{invoice_number\}/g, invoiceNumber) };
}
