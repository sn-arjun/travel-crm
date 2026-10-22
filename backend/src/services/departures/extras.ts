/**
 * Extras of a departure (R150, design 3.1, 5.4 and 8.4): the optional paid items of a tour (an excursion, an upgrade, a dinner),
 * what a passenger chose, and the invoice for the choices.
 *
 * The catalogue a departure sells is the tour-wide rows, then the tour's rows, then the departure's own rows; a later row with the
 * same title and day replaces an earlier one (an inactive replacement hides it). A choice is a passenger_extras row: it moves
 * selected -> invoiced (it is on an extras invoice) -> paid (the invoice is paid) or cancelled. Customers change their choices until
 * the extras cut-off; after that only staff can. One extras invoice per seat booking is kept up to date while nothing is paid on it;
 * once money is on it, new choices make a further invoice.
 */

import { generateId } from '../../utils/uuid';
import { addDaysLocal, getTenantTimeZone, localDateString } from '../../utils/tz';
import { agencyDefaultLanguage, t } from '../../i18n';
import { loadLocaleContext } from '../../utils/money';
import {
  chunk, DepartureError, jsonOrNull, localDateTimeToUtcIso, nowIso, placeholders,
} from './common';
import { getPassengers } from './passengers';
import { loadDepartureContext, requireBookingRow, type DepartureContext } from './seat-support';
import { rowToExtra } from './tours';
import { refreshDraft, type InvoiceActorLike } from './booking-invoice';
import { createInvoice, InvoiceContactNotFound, type CreateInvoiceItemInput } from '../domain/invoices';
import { TaxConfigError } from '../tax-calculator';
import type { Env } from '../../types';
import type { ExtraInput } from '../../validators/departures';

type Row = Record<string, any>;

export type ExtraRowDto = ReturnType<typeof rowToExtra>;
export type ExtraSource = 'tour_wide' | 'tour' | 'departure';
export interface EffectiveExtra extends ExtraRowDto {
  source: ExtraSource;
}

export const MAX_EXTRA_QUANTITY = 20;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- the catalogue

export function sourceOf(r: Pick<ExtraRowDto, 'tourId' | 'departureId'>): ExtraSource {
  if (r.departureId) return 'departure';
  return r.tourId ? 'tour' : 'tour_wide';
}

const mergeKey = (e: Pick<ExtraRowDto, 'title' | 'dayNumber'>): string => `${e.title.trim().toLowerCase()}|${e.dayNumber ?? 0}`;

/**
 * Tour-wide rows, then the tour's, then the departure's; the same title and day later in that order replaces the earlier row.
 * Inactive rows take part in the replacing (so a departure can switch an extra off) and are dropped from the answer unless asked for.
 * Sorted by day (the whole trip first), then the order set on the tour, then title.
 */
export function mergeExtras(rows: ExtraRowDto[], opts: { includeInactive?: boolean } = {}): EffectiveExtra[] {
  const layers: ExtraSource[] = ['tour_wide', 'tour', 'departure'];
  const merged = new Map<string, EffectiveExtra>();
  for (const layer of layers) {
    for (const r of rows) {
      if (sourceOf(r) === layer) merged.set(mergeKey(r), { ...r, source: layer });
    }
  }
  return [...merged.values()]
    .filter((e) => opts.includeInactive || e.isActive)
    .sort((a, b) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0) || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

export async function loadEffectiveExtras(db: D1Database, tourId: string, departureId: string, opts: { includeInactive?: boolean } = {}): Promise<EffectiveExtra[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM tour_extras WHERE (departure_id IS NULL AND (tour_id IS NULL OR tour_id = ?)) OR departure_id = ? ORDER BY sort_order, id`,
    )
    .bind(tourId, departureId)
    .all<Row>();
  return mergeExtras((results ?? []).map(rowToExtra), opts);
}

/** The departure's own rows (what the departure Extras tab edits). */
export async function getDepartureOwnExtras(db: D1Database, departureId: string): Promise<ExtraRowDto[]> {
  const { results } = await db.prepare('SELECT * FROM tour_extras WHERE departure_id = ? ORDER BY sort_order, id').bind(departureId).all<Row>();
  return (results ?? []).map(rowToExtra);
}

/**
 * Replaces the departure's own extras (overrides and additions). A row with an id is updated, one without is added, one left out is
 * deleted, or switched off when passengers already chose it.
 */
export async function replaceDepartureExtras(db: D1Database, tourId: string, departureId: string, extras: ExtraInput[]): Promise<void> {
  const existing = new Set((await getDepartureOwnExtras(db, departureId)).map((e) => e.id));
  const seen = new Set<string>();
  for (const e of extras) {
    if (e.id) {
      if (!existing.has(e.id)) throw new DepartureError(400, 'UNKNOWN_EXTRA', 'An extra id does not belong to this departure', { id: e.id });
      if (seen.has(e.id)) throw new DepartureError(400, 'DUPLICATE_EXTRA', 'An extra id appears twice', { id: e.id });
      seen.add(e.id);
    }
    if (e.rateCardId && !(await db.prepare('SELECT id FROM rate_cards WHERE id = ?').bind(e.rateCardId).first())) throw new DepartureError(404, 'NOT_FOUND', 'The rate card was not found');
    if (e.supplierId && !(await db.prepare('SELECT id FROM suppliers WHERE id = ?').bind(e.supplierId).first())) throw new DepartureError(404, 'NOT_FOUND', 'The supplier was not found');
  }
  const removed = [...existing].filter((id) => !seen.has(id));
  const statements: D1PreparedStatement[] = [];
  for (const part of chunk(removed)) {
    statements.push(
      db.prepare(`DELETE FROM tour_extras WHERE id IN (${placeholders(part.length)}) AND id NOT IN (SELECT tour_extra_id FROM passenger_extras)`).bind(...part),
      db.prepare(`UPDATE tour_extras SET is_active = 0, updated_at = ? WHERE id IN (${placeholders(part.length)})`).bind(nowIso(), ...part),
    );
  }
  const now = nowIso();
  extras.forEach((e, i) => {
    const values = [
      e.dayNumber ?? null, e.title, e.description ?? null, e.price, e.currency ? e.currency.toUpperCase() : null, jsonOrNull(e.bandPrices),
      e.rateCardId ?? null, e.supplierId ?? null, e.capacity ?? null, e.cutoffHoursBefore ?? null, e.refundableUntilHours ?? null, e.isActive === false ? 0 : 1, i,
    ];
    statements.push(
      e.id
        ? db.prepare(`UPDATE tour_extras SET day_number = ?, title = ?, description = ?, price = ?, currency = ?, band_prices = ?, rate_card_id = ?, supplier_id = ?, capacity = ?, cutoff_hours_before = ?, refundable_until_hours = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?`).bind(...values, now, e.id)
        : db.prepare(`INSERT INTO tour_extras (id, tour_id, departure_id, day_number, title, description, price, currency, band_prices, rate_card_id, supplier_id, capacity, cutoff_hours_before, refundable_until_hours, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(generateId(), tourId, departureId, ...values, now, now),
    );
  });
  if (statements.length) await db.batch(statements);
}

// ---------------------------------------------------------------- prices

/** The selling price of each linked rate card that is active and valid on `today`; cards without a usable price are absent. */
export async function rateCardPrices(db: D1Database, ids: string[], today: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unique = [...new Set(ids)];
  for (const part of chunk(unique)) {
    const { results } = await db
      .prepare(`SELECT id, selling_price, valid_from, valid_to, is_active FROM rate_cards WHERE id IN (${placeholders(part.length)})`)
      .bind(...part)
      .all<Row>();
    for (const r of results ?? []) {
      if (r.is_active === 0 || r.selling_price === null || r.selling_price === undefined) continue;
      if (r.valid_from && String(r.valid_from).slice(0, 10) > today) continue;
      if (r.valid_to && String(r.valid_to).slice(0, 10) < today) continue;
      out.set(r.id, Number(r.selling_price));
    }
  }
  return out;
}

/**
 * What one passenger pays for one unit: the price set for the passenger's age band, else the extra's price, else the selling price
 * of its linked rate card. A band price of 0 is a real price (free for infants); an extra price of 0 means "not set".
 */
export function unitPrice(extra: Pick<ExtraRowDto, 'price' | 'bandPrices'>, bandKey: string | null, rateCardPrice: number | null | undefined): number {
  const forBand = bandKey && extra.bandPrices && Object.prototype.hasOwnProperty.call(extra.bandPrices, bandKey) ? extra.bandPrices[bandKey] : undefined;
  if (typeof forBand === 'number' && Number.isFinite(forBand) && forBand >= 0) return round2(forBand);
  if (extra.price > 0) return round2(extra.price);
  return round2(rateCardPrice ?? 0);
}

/** The price shown for an extra before a band is known: its own price, else the rate card's. */
export function listPrice(extra: Pick<ExtraRowDto, 'price' | 'bandPrices'>, rateCardPrice: number | null | undefined): number {
  return unitPrice({ price: extra.price, bandPrices: null }, null, rateCardPrice);
}

// ---------------------------------------------------------------- cut-off

export interface DepartureTimes {
  start_date: string;
  start_time?: string | null;
  extras_cutoff_date?: string | null;
}

export function departureStartIso(dep: DepartureTimes, tz: string): string {
  return localDateTimeToUtcIso(tz, dep.start_date, dep.start_time);
}

/** The instant after which customers can no longer change this extra: hours before the start when the extra has them, else the end of the departure's cut-off day. */
export function extraCutoffIso(extra: Pick<ExtraRowDto, 'cutoffHoursBefore'>, dep: DepartureTimes, tz: string): string | null {
  if (extra.cutoffHoursBefore !== null && extra.cutoffHoursBefore !== undefined) {
    return new Date(Date.parse(departureStartIso(dep, tz)) - extra.cutoffHoursBefore * 3_600_000).toISOString();
  }
  if (dep.extras_cutoff_date) return localDateTimeToUtcIso(tz, addDaysLocal(dep.extras_cutoff_date, 1), '00:00');
  return null;
}

/** Customers can choose until the cut-off, and never once the departure has started. */
export function isExtraOpen(cutoffIso: string | null, startIso: string, now: Date): boolean {
  const t0 = now.getTime();
  if (t0 >= Date.parse(startIso)) return false;
  return !(cutoffIso && t0 >= Date.parse(cutoffIso));
}

/** A paid choice can be refunded until this many hours before the departure; null hours means it is not refundable. */
export function refundWindowOpen(extra: Pick<ExtraRowDto, 'refundableUntilHours'>, dep: DepartureTimes, tz: string, now: Date): boolean {
  if (extra.refundableUntilHours === null || extra.refundableUntilHours === undefined) return false;
  return now.getTime() < Date.parse(departureStartIso(dep, tz)) - extra.refundableUntilHours * 3_600_000;
}

// ---------------------------------------------------------------- what was chosen

export interface PassengerChoice {
  id: string;
  seatPassengerId: string;
  tourExtraId: string;
  title: string;
  dayNumber: number | null;
  quantity: number;
  unitPrice: number;
  currency: string | null;
  status: 'selected' | 'invoiced' | 'paid' | 'cancelled';
  invoiceId: string | null;
  selectedVia: 'staff' | 'self_service';
}

function rowToChoice(r: Row): PassengerChoice {
  return {
    id: r.id, seatPassengerId: r.seat_passenger_id, tourExtraId: r.tour_extra_id, title: r.title, dayNumber: r.day_number ?? null,
    quantity: r.quantity, unitPrice: r.unit_price, currency: r.currency ?? null, status: r.status, invoiceId: r.invoice_id ?? null, selectedVia: r.selected_via,
  };
}

const CHOICE_SQL = `SELECT pe.*, te.title, te.day_number FROM passenger_extras pe JOIN tour_extras te ON te.id = pe.tour_extra_id`;

/** The live (not cancelled) choices of the passengers of one booking. */
export async function getBookingChoices(db: D1Database, bookingId: string): Promise<PassengerChoice[]> {
  const { results } = await db
    .prepare(`${CHOICE_SQL} JOIN seat_passengers sp ON sp.id = pe.seat_passenger_id WHERE sp.seat_booking_id = ? AND sp.status = 'active' AND pe.status != 'cancelled' ORDER BY pe.created_at, pe.id`)
    .bind(bookingId)
    .all<Row>();
  return (results ?? []).map(rowToChoice);
}

/** How many of each extra are taken: selected, invoiced and paid choices of active passengers on held and confirmed bookings. */
export async function takenByExtra(db: D1Database, departureId: string): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT pe.tour_extra_id AS id, COALESCE(SUM(pe.quantity), 0) AS n
       FROM passenger_extras pe
       JOIN seat_passengers sp ON sp.id = pe.seat_passenger_id AND sp.status = 'active'
       JOIN seat_bookings sb ON sb.id = sp.seat_booking_id AND sb.status IN ('held', 'confirmed')
       WHERE pe.departure_id = ? AND pe.status IN ('selected', 'invoiced', 'paid')
       GROUP BY pe.tour_extra_id`,
    )
    .bind(departureId)
    .all<{ id: string; n: number }>();
  return new Map((results ?? []).map((r) => [r.id, r.n]));
}

export interface RefundSuggestion {
  passengerExtraId: string;
  seatPassengerId: string;
  title: string;
  quantity: number;
  amount: number;
  currency: string | null;
  invoiceId: string | null;
}

export interface ChoiceInput {
  passengerId: string;
  extraId: string;
  quantity: number;
}

export interface SetChoicesOptions {
  via: 'staff' | 'self_service';
  /** Customers are held to the cut-off; staff are not. */
  enforceCutoff: boolean;
  /** The passengers whose choices are replaced; the others are left alone. */
  passengerIds?: string[];
  now?: Date;
}

export interface SetChoicesResult {
  /** Pairs of passenger and extra whose quantity changed. */
  changed: number;
  /** Paid choices that were reduced or removed inside the refund window: the money to give back. */
  refunds: RefundSuggestion[];
}

/**
 * Sets what the passengers of a booking have chosen. `choices` is the whole wanted state for the passengers in scope: a pair that
 * is not listed becomes 0 (listed or not, only extras of the departure's catalogue are touched). Quantities above what is chosen
 * add to an unpaid choice or make a new one; below, unpaid choices go first, then paid ones (which can ask for a refund).
 * Throws 409 EXTRAS_CLOSED, 409 EXTRA_FULL, 400 INVALID_EXTRA, 400 INVALID_PASSENGER, 409 BOOKING_NOT_EDITABLE.
 */
export async function setChoices(db: D1Database, bookingId: string, choices: ChoiceInput[], opts: SetChoicesOptions): Promise<SetChoicesResult> {
  const now = opts.now ?? new Date();
  const booking = await requireBookingRow(db, bookingId);
  if (!['held', 'confirmed'].includes(booking.status)) {
    throw new DepartureError(409, 'BOOKING_NOT_EDITABLE', `A ${booking.status} booking cannot take extras`, { status: booking.status });
  }
  const dep = await loadDepartureContext(db, booking.departure_id);
  const tz = await getTenantTimeZone(db);
  const today = localDateString(tz, now);
  const catalogue = await loadEffectiveExtras(db, dep.row.tour_id, dep.row.id);
  const byId = new Map(catalogue.map((e) => [e.id, e]));
  const prices = await rateCardPrices(db, catalogue.map((e) => e.rateCardId).filter((v): v is string => !!v), today);

  const everyone = await getPassengers(db, bookingId);
  const scopeIds = opts.passengerIds ? new Set(opts.passengerIds) : new Set(everyone.map((p) => p.id));
  const scope = everyone.filter((p) => scopeIds.has(p.id));
  const passengerById = new Map(scope.map((p) => [p.id, p]));

  // The wanted quantity per pair.
  const wanted = new Map<string, number>();
  const errors: Array<{ index: number; field: string }> = [];
  choices.forEach((c, index) => {
    if (!passengerById.has(c.passengerId)) return void errors.push({ index, field: 'passengerId' });
    if (!byId.has(c.extraId)) return void errors.push({ index, field: 'extraId' });
    if (!Number.isInteger(c.quantity) || c.quantity < 0 || c.quantity > MAX_EXTRA_QUANTITY) return void errors.push({ index, field: 'quantity' });
    const key = `${c.passengerId}|${c.extraId}`;
    wanted.set(key, (wanted.get(key) ?? 0) + c.quantity);
  });
  if (errors.length) throw new DepartureError(400, 'INVALID_EXTRA', 'Some extras could not be chosen', { errors });

  // What is chosen now, for the pairs the catalogue still sells.
  const scopeList = [...scopeIds].filter((id) => passengerById.has(id));
  const current: Row[] = [];
  for (const part of chunk(scopeList)) {
    const { results } = await db
      .prepare(`SELECT * FROM passenger_extras WHERE seat_passenger_id IN (${placeholders(part.length)}) AND status != 'cancelled' ORDER BY created_at, id`)
      .bind(...part)
      .all<Row>();
    current.push(...(results ?? []).filter((r) => byId.has(r.tour_extra_id)));
  }
  const have = new Map<string, number>();
  for (const r of current) have.set(`${r.seat_passenger_id}|${r.tour_extra_id}`, (have.get(`${r.seat_passenger_id}|${r.tour_extra_id}`) ?? 0) + r.quantity);

  const deltas = new Map<string, number>();
  for (const key of new Set([...wanted.keys(), ...have.keys()])) {
    const delta = (wanted.get(key) ?? 0) - (have.get(key) ?? 0);
    if (delta !== 0) deltas.set(key, delta);
  }
  if (deltas.size === 0) return { changed: 0, refunds: [] };

  // Cut-off and capacity.
  const startIso = departureStartIso(dep.row as DepartureTimes, tz);
  const netByExtra = new Map<string, number>();
  for (const [key, delta] of deltas) {
    const extra = byId.get(key.split('|')[1])!;
    if (opts.enforceCutoff && !isExtraOpen(extraCutoffIso(extra, dep.row as DepartureTimes, tz), startIso, now)) {
      throw new DepartureError(409, 'EXTRAS_CLOSED', `The cut-off for ${extra.title} has passed`, { extra: extra.title });
    }
    netByExtra.set(extra.id, (netByExtra.get(extra.id) ?? 0) + delta);
  }
  const taken = await takenByExtra(db, dep.row.id);
  for (const [id, net] of netByExtra) {
    const extra = byId.get(id)!;
    if (net > 0 && extra.capacity !== null && (taken.get(id) ?? 0) + net > extra.capacity) {
      throw new DepartureError(409, 'EXTRA_FULL', `${extra.title} is fully booked`, { extra: extra.title, left: Math.max(0, extra.capacity - (taken.get(id) ?? 0)) });
    }
  }

  // Apply.
  const stamp = nowIso();
  const statements: D1PreparedStatement[] = [];
  const refunds: RefundSuggestion[] = [];
  for (const [key, delta] of deltas) {
    const [passengerId, extraId] = key.split('|');
    const extra = byId.get(extraId)!;
    const passenger = passengerById.get(passengerId)!;
    const rows = current.filter((r) => r.seat_passenger_id === passengerId && r.tour_extra_id === extraId);
    if (delta > 0) {
      const open = rows.find((r) => r.status === 'selected' || r.status === 'invoiced');
      if (open) {
        statements.push(db.prepare('UPDATE passenger_extras SET quantity = ?, updated_at = ? WHERE id = ?').bind(open.quantity + delta, stamp, open.id));
      } else {
        const rateCard = extra.rateCardId ? prices.get(extra.rateCardId) : undefined;
        statements.push(
          db
            .prepare(`INSERT INTO passenger_extras (id, seat_passenger_id, tour_extra_id, departure_id, quantity, unit_price, currency, status, selected_via, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'selected', ?, ?, ?)`)
            .bind(generateId(), passengerId, extraId, dep.row.id, delta, unitPrice(extra, passenger.bandKey, rateCard), extra.currency ?? dep.tour.currency ?? null, opts.via, stamp, stamp),
        );
      }
      continue;
    }
    let remaining = -delta;
    // Unpaid first (newest first), then paid.
    const order = [...rows].sort((a, b) => Number(a.status === 'paid') - Number(b.status === 'paid') || String(b.created_at).localeCompare(String(a.created_at)));
    for (const r of order) {
      if (remaining <= 0) break;
      const take = Math.min(r.quantity, remaining);
      remaining -= take;
      statements.push(
        take === r.quantity
          ? db.prepare(`UPDATE passenger_extras SET status = 'cancelled', updated_at = ? WHERE id = ?`).bind(stamp, r.id)
          : db.prepare('UPDATE passenger_extras SET quantity = ?, updated_at = ? WHERE id = ?').bind(r.quantity - take, stamp, r.id),
      );
      if (r.status === 'paid' && refundWindowOpen(extra, dep.row as DepartureTimes, tz, now)) {
        refunds.push({
          passengerExtraId: r.id, seatPassengerId: passengerId, title: extra.title, quantity: take, amount: round2(take * r.unit_price),
          currency: r.currency ?? null, invoiceId: r.invoice_id ?? null,
        });
      }
    }
  }
  for (const part of chunk(statements, 80)) if (part.length) await db.batch(part);
  return { changed: deltas.size, refunds };
}

// ---------------------------------------------------------------- the extras invoice

export interface ExtrasInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  total: number;
  /** True when the invoice was made now; false when the open one was refreshed. */
  created: boolean;
}

interface InvoiceState {
  id: string;
  invoice_number: string;
  status: string;
  paid_amount: number | null;
  total: number;
}

/** An extras invoice that nothing has been paid on and that is still live: the one new choices are added to. */
const isOpenInvoice = (i: InvoiceState): boolean => !['paid', 'partially_paid', 'cancelled'].includes(i.status) && (i.paid_amount ?? 0) <= 0;

/**
 * Makes or refreshes the extras invoice of a booking: one line per passenger per extra (selected choices and the choices already on
 * the open invoice). Nothing to invoice returns null (and cancels an open invoice whose choices were all removed). Choices on an
 * invoice that has had money paid on it are left alone: new choices go on a further invoice.
 * Throws 409 BOOKING_NOT_EDITABLE, 409 TAX_CONFIG, 404 CONTACT_NOT_FOUND.
 */
export async function invoiceExtras(env: Env, tenantId: string, db: D1Database, bookingId: string, actor: InvoiceActorLike): Promise<ExtrasInvoiceResult | null> {
  const booking = await requireBookingRow(db, bookingId);
  if (!['held', 'confirmed'].includes(booking.status)) {
    throw new DepartureError(409, 'BOOKING_NOT_EDITABLE', `A ${booking.status} booking cannot be invoiced for extras`, { status: booking.status });
  }
  const dep = await loadDepartureContext(db, booking.departure_id);
  const { results } = await db
    .prepare(
      `SELECT pe.*, te.title, te.day_number, sp.first_name, sp.last_name
       FROM passenger_extras pe
       JOIN tour_extras te ON te.id = pe.tour_extra_id
       JOIN seat_passengers sp ON sp.id = pe.seat_passenger_id
       WHERE sp.seat_booking_id = ? AND sp.status = 'active' AND pe.status IN ('selected', 'invoiced')
       ORDER BY COALESCE(te.day_number, 0), sp.created_at, sp.id, te.title, pe.created_at, pe.id`,
    )
    .bind(bookingId)
    .all<Row>();
  const rows = results ?? [];

  // Which invoice is still open? A fully paid one settles its choices instead (a payment can have been recorded without a webhook).
  // Choices that were removed still name their invoice, so an open invoice whose choices are all gone is found and cancelled.
  const { results: named } = await db
    .prepare(`SELECT DISTINCT pe.invoice_id FROM passenger_extras pe JOIN seat_passengers sp ON sp.id = pe.seat_passenger_id WHERE sp.seat_booking_id = ? AND pe.invoice_id IS NOT NULL`)
    .bind(bookingId)
    .all<{ invoice_id: string }>();
  const invoiceIds = (named ?? []).map((r) => r.invoice_id);
  let openId: string | null = null;
  for (const id of invoiceIds) {
    const inv = await db.prepare('SELECT id, invoice_number, status, paid_amount, total FROM invoices WHERE id = ?').bind(id).first<InvoiceState>();
    if (!inv) {
      await db.prepare(`UPDATE passenger_extras SET status = 'selected', invoice_id = NULL, invoice_item_id = NULL WHERE invoice_id = ? AND status = 'invoiced'`).bind(id).run();
      for (const r of rows) if (r.invoice_id === id) { r.status = 'selected'; r.invoice_id = null; }
    } else if (inv.status === 'paid') {
      await markExtrasPaid(db, id);
      for (const r of rows) if (r.invoice_id === id) r.status = 'paid';
    } else if (isOpenInvoice(inv)) {
      openId = inv.id;
    }
  }
  const lines = rows.filter((r) => r.status === 'selected' || (r.status === 'invoiced' && r.invoice_id === openId));

  if (lines.length === 0) {
    if (openId) {
      await db.prepare(`UPDATE invoices SET status = 'cancelled', updated_at = ? WHERE id = ?`).bind(nowIso(), openId).run();
    }
    return null;
  }

  const lang = await agencyDefaultLanguage(db);
  const items: CreateInvoiceItemInput[] = lines.map((r) => {
    const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
    return {
      description: r.day_number
        ? t(lang, 'extras.invoice.lineDay', { extra: r.title, day: r.day_number, name })
        : t(lang, 'extras.invoice.line', { extra: r.title, name }),
      quantity: r.quantity,
      rate: r.unit_price,
      discountPercent: 0,
    };
  });
  const currency = ((dep.tour.currency as string | null) ?? (await loadLocaleContext(db)).currency).toUpperCase();

  let invoiceId: string;
  let invoiceNumber: string;
  let total: number;
  let createdNow = false;
  try {
    if (openId) {
      total = await refreshDraft(db, openId, booking.contact_id, items);
      // A link made for the old amount must not be reused.
      await db
        .prepare(
          `UPDATE invoices SET currency = ?, payment_link = NULL, payment_link_id = NULL, payment_link_url = NULL, payment_link_status = NULL,
             payment_link_amount = NULL, payment_link_purpose = NULL, updated_at = ? WHERE id = ?`,
        )
        .bind(currency, nowIso(), openId)
        .run();
      invoiceId = openId;
      invoiceNumber = (await db.prepare('SELECT invoice_number FROM invoices WHERE id = ?').bind(openId).first<{ invoice_number: string }>())!.invoice_number;
    } else {
      const made = await createInvoice(
        env, tenantId, db,
        {
          contactId: booking.contact_id,
          leadId: booking.lead_id,
          type: 'tax_invoice',
          items,
          currency,
          notes: t(lang, 'extras.invoice.notes', { tour: dep.tour.title, code: dep.row.code }),
        },
        { userId: actor.userId, depth: actor.depth, waiter: actor.waiter },
      );
      invoiceId = made.id;
      invoiceNumber = made.invoiceNumber;
      total = made.totals.total;
      createdNow = true;
    }
  } catch (e) {
    if (e instanceof TaxConfigError) throw new DepartureError(409, 'TAX_CONFIG', e.message);
    if (e instanceof InvoiceContactNotFound) throw new DepartureError(404, 'CONTACT_NOT_FOUND', 'Contact not found');
    throw e;
  }

  // Each choice points at its invoice line (the lines are written in the same order as `lines`).
  const { results: itemRows } = await db.prepare('SELECT id FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, rowid').bind(invoiceId).all<{ id: string }>();
  const statements = lines.map((r, i) =>
    db
      .prepare(`UPDATE passenger_extras SET status = 'invoiced', invoice_id = ?, invoice_item_id = ?, currency = ?, updated_at = ? WHERE id = ?`)
      .bind(invoiceId, itemRows?.[i]?.id ?? null, currency, nowIso(), r.id),
  );
  for (const part of chunk(statements, 80)) if (part.length) await db.batch(part);
  return { invoiceId, invoiceNumber, currency, total, created: createdNow };
}

/** The choices on an invoice are paid when the invoice is. */
export async function markExtrasPaid(db: D1Database, invoiceId: string): Promise<number> {
  const res = await db.prepare(`UPDATE passenger_extras SET status = 'paid', updated_at = ? WHERE invoice_id = ? AND status = 'invoiced'`).bind(nowIso(), invoiceId).run();
  return res.meta?.changes ?? 0;
}

/** The extras invoices of a booking that still have something to pay, oldest first. */
export async function openExtrasInvoices(db: D1Database, bookingId: string): Promise<Array<{ id: string; number: string; total: number; balanceDue: number; currency: string; status: string }>> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT i.id, i.invoice_number, i.total, i.balance_due, i.currency, i.status, i.created_at
       FROM passenger_extras pe
       JOIN seat_passengers sp ON sp.id = pe.seat_passenger_id
       JOIN invoices i ON i.id = pe.invoice_id
       WHERE sp.seat_booking_id = ? AND pe.status = 'invoiced' AND i.status NOT IN ('paid', 'cancelled') AND COALESCE(i.balance_due, i.total) > 0.005
       ORDER BY i.created_at, i.id`,
    )
    .bind(bookingId)
    .all<Row>();
  return (results ?? []).map((r) => ({ id: r.id, number: r.invoice_number, total: r.total, balanceDue: r.balance_due ?? r.total, currency: r.currency, status: r.status }));
}

// ---------------------------------------------------------------- staff overview of a departure

export interface ExtrasOverviewExtra extends EffectiveExtra {
  sold: number;
  left: number | null;
  revenue: number;
  paid: number;
  cutoffAt: string | null;
  open: boolean;
  /** The price a passenger of no particular band pays (the rate card's when the extra has none of its own). */
  listPrice: number;
}

export interface ExtrasOverview {
  currency: string;
  extras: ExtrasOverviewExtra[];
  /** The departure's own rows, as the tab edits them. */
  own: ExtraRowDto[];
  passengers: Array<{
    id: string;
    bookingId: string;
    name: string;
    bandKey: string | null;
    contactName: string | null;
    choices: PassengerChoice[];
  }>;
}

/** The Extras tab of a departure: what it sells, how much is sold, and what each passenger chose. */
export async function extrasOverview(db: D1Database, ctx: DepartureContext, now = new Date()): Promise<ExtrasOverview> {
  const tz = await getTenantTimeZone(db);
  const today = localDateString(tz, now);
  const [catalogue, own, taken] = await Promise.all([
    loadEffectiveExtras(db, ctx.row.tour_id, ctx.row.id),
    getDepartureOwnExtras(db, ctx.row.id),
    takenByExtra(db, ctx.row.id),
  ]);
  const cards = await rateCardPrices(db, catalogue.map((e) => e.rateCardId).filter((v): v is string => !!v), today);
  const { results: sums } = await db
    .prepare(
      `SELECT pe.tour_extra_id AS id, COALESCE(SUM(pe.quantity * pe.unit_price), 0) AS revenue,
              COALESCE(SUM(CASE WHEN pe.status = 'paid' THEN pe.quantity * pe.unit_price ELSE 0 END), 0) AS paid
       FROM passenger_extras pe
       JOIN seat_passengers sp ON sp.id = pe.seat_passenger_id AND sp.status = 'active'
       JOIN seat_bookings sb ON sb.id = sp.seat_booking_id AND sb.status IN ('held', 'confirmed')
       WHERE pe.departure_id = ? AND pe.status != 'cancelled' GROUP BY pe.tour_extra_id`,
    )
    .bind(ctx.row.id)
    .all<{ id: string; revenue: number; paid: number }>();
  const money = new Map((sums ?? []).map((r) => [r.id, r]));
  const startIso = departureStartIso(ctx.row as DepartureTimes, tz);
  const extras: ExtrasOverviewExtra[] = catalogue.map((e) => {
    const sold = taken.get(e.id) ?? 0;
    const cutoffAt = extraCutoffIso(e, ctx.row as DepartureTimes, tz);
    return {
      ...e,
      sold,
      left: e.capacity === null ? null : Math.max(0, e.capacity - sold),
      revenue: round2(money.get(e.id)?.revenue ?? 0),
      paid: round2(money.get(e.id)?.paid ?? 0),
      cutoffAt,
      open: isExtraOpen(cutoffAt, startIso, now),
      listPrice: listPrice(e, e.rateCardId ? cards.get(e.rateCardId) : undefined),
    };
  });

  const { results: pax } = await db
    .prepare(
      `SELECT sp.id, sp.seat_booking_id, sp.first_name, sp.last_name, sp.band_key, c.name AS contact_name
       FROM seat_passengers sp
       JOIN seat_bookings sb ON sb.id = sp.seat_booking_id AND sb.status IN ('held', 'confirmed')
       LEFT JOIN contacts c ON c.id = sb.contact_id
       WHERE sp.departure_id = ? AND sp.status = 'active' ORDER BY sb.created_at, sp.created_at, sp.id`,
    )
    .bind(ctx.row.id)
    .all<Row>();
  const { results: choiceRows } = await db
    .prepare(`${CHOICE_SQL} WHERE pe.departure_id = ? AND pe.status != 'cancelled' ORDER BY pe.created_at, pe.id`)
    .bind(ctx.row.id)
    .all<Row>();
  const byPassenger = new Map<string, PassengerChoice[]>();
  for (const r of choiceRows ?? []) byPassenger.set(r.seat_passenger_id, [...(byPassenger.get(r.seat_passenger_id) ?? []), rowToChoice(r)]);

  return {
    currency: ((ctx.tour.currency as string | null) ?? (await loadLocaleContext(db)).currency).toUpperCase(),
    extras,
    own,
    passengers: (pax ?? []).map((p) => ({
      id: p.id, bookingId: p.seat_booking_id, name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(), bandKey: p.band_key ?? null,
      contactName: p.contact_name ?? null, choices: byPassenger.get(p.id) ?? [],
    })),
  };
}

/** Short text for the manifest: "Gondola ride x2 (day 2); Dinner". Paid choices carry no mark, unpaid ones are marked. */
export function choicesText(choices: Array<Pick<PassengerChoice, 'title' | 'quantity' | 'dayNumber' | 'status'>>, unpaidMark: string): string {
  return choices
    .map((c) => `${c.title}${c.quantity > 1 ? ` x${c.quantity}` : ''}${c.dayNumber ? ` (${c.dayNumber})` : ''}${c.status === 'paid' ? '' : ` ${unpaidMark}`}`.trim())
    .join('; ');
}

