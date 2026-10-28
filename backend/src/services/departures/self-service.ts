/**
 * The traveller self-service page (R150, design sections 5.4, 7 and 8.4): one link per booking (or per traveller) where a party
 * enters the details of every traveller as on the travel document, picks extras per person per day and pays.
 *
 * This file is everything behind the public routes of routes/public-booking.ts that is not HTTP: the staff side that makes the
 * link, the loading of what a link may see (the booking's own passengers, or one passenger), the page projection (ids are replaced
 * by opaque references, document numbers are masked), saving the travellers (and the travellers rows the visa and passport-expiry
 * alerts read), and the payment link or bank details for the extras invoice, the balance or the deposit.
 */

import type { Env } from '../../types';
import { createLink, type PublicLinkKind } from '../public-links';
import { sha256Hex } from '../billing/gateway';
import { tripUrl } from '../../utils/app-urls';
import { getTenantTimeZone, localDateString } from '../../utils/tz';
import { ageOn, bandForAge, loadBandsForTour } from '../pricing/age-bands';
import { generateId } from '../../utils/uuid';
import { parseJson, DepartureError, nowIso } from './common';
import { getBookingRow, loadDepartureContext, announceSeats, type DepartureContext } from './seat-support';
import type { PassengerFieldDef } from './settings';
import {
  departureStartIso, extraCutoffIso, invoiceExtras, isExtraOpen, listPrice, loadEffectiveExtras, openExtrasInvoices, rateCardPrices,
  takenByExtra, type DepartureTimes,
} from './extras';
import {
  bankInstructions, bookingDeposit, createBookingInvoice, createDepositLink, type BankInstructions, type InvoiceActorLike,
} from './booking-invoice';
import { loadLocaleContext } from '../../utils/money';

type Row = Record<string, any>;

export type LinkScope = 'booking' | 'passenger';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Passenger fields the page asks for itself; every other field the agency collects "on self service" is a document or custom field. */
const CORE_KEYS = new Set(['name', 'gender', 'dateOfBirth', 'pickupPoint', 'roomType', 'meal']);
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
/** Days after the departure ends that the link keeps working. */
const LINK_GRACE_DAYS = 30;

// ---------------------------------------------------------------- staff: making the link

export interface SelfServiceLink {
  scope: LinkScope;
  token: string;
  tripUrl: string;
  detailsLink: string;
  extrasLink: string;
}

/** `?step=` opens the page on that step. */
export function linksFor(env: Pick<Env, 'APP_URL' | 'QUOTES_URL' | 'PUBLIC_PAGES_URL' | 'EMAIL_FROM' | 'EMAIL_FROM_NAME' | 'PLATFORM_SUPPORT_EMAIL'>, token: string): Omit<SelfServiceLink, 'scope'> {
  const base = tripUrl(env, token);
  return { token, tripUrl: base, detailsLink: `${base}?step=travellers`, extrasLink: `${base}?step=extras` };
}

/**
 * The self-service link of a booking (or of one of its passengers). The same address comes back while the link stays active.
 * Throws 404 NOT_FOUND, 409 BOOKING_NOT_EDITABLE (cancelled, expired or waitlisted bookings have no page).
 */
export async function createSelfServiceLink(env: Env, tenantId: string, db: D1Database, bookingId: string, scope: LinkScope, passengerId?: string | null): Promise<SelfServiceLink> {
  const booking = await getBookingRow(db, bookingId);
  if (!booking) throw new DepartureError(404, 'NOT_FOUND', 'Seat booking not found');
  if (!['held', 'confirmed'].includes(booking.status)) {
    throw new DepartureError(409, 'BOOKING_NOT_EDITABLE', `A ${booking.status} booking has no self-service page`, { status: booking.status });
  }
  const dep = await loadDepartureContext(db, booking.departure_id);
  const end = new Date(`${String(dep.row.end_date).slice(0, 10)}T00:00:00Z`);
  const expiresAt = new Date(end.getTime() + LINK_GRACE_DAYS * 86_400_000).toISOString();

  let kind: PublicLinkKind = 'booking_self_service';
  let entityId = bookingId;
  if (scope === 'passenger') {
    const pax = passengerId
      ? await db.prepare(`SELECT id FROM seat_passengers WHERE id = ? AND seat_booking_id = ? AND status = 'active'`).bind(passengerId, bookingId).first<{ id: string }>()
      : null;
    if (!pax) throw new DepartureError(404, 'NOT_FOUND', 'Passenger not found on this booking');
    kind = 'passenger_self_service';
    entityId = pax.id;
  }
  const token = await createLink(env, kind, entityId, tenantId, { expiresAt });
  return { scope, ...linksFor(env, token) };
}

// ---------------------------------------------------------------- what a link may see

export interface TripCtx {
  tenantId: string;
  db: D1Database;
  scope: LinkScope;
  booking: Row;
  dep: DepartureContext;
  /** The passengers the link covers: all of the booking's, or the one of a passenger link. */
  passengers: Row[];
}

/**
 * Loads the booking behind a verified link. null for everything that is not an open page: a booking that is not held or confirmed,
 * a passenger that left the booking, a departure that is not open or closed, group tours switched off.
 */
export async function loadTrip(db: D1Database, tenantId: string, scope: LinkScope, entityId: string): Promise<TripCtx | null> {
  let bookingId = entityId;
  let only: string | null = null;
  if (scope === 'passenger') {
    const pax = await db.prepare(`SELECT id, seat_booking_id FROM seat_passengers WHERE id = ? AND status = 'active'`).bind(entityId).first<{ id: string; seat_booking_id: string }>();
    if (!pax) return null;
    bookingId = pax.seat_booking_id;
    only = pax.id;
  }
  const booking = await getBookingRow(db, bookingId);
  if (!booking || !['held', 'confirmed'].includes(booking.status)) return null;
  let dep: DepartureContext;
  try {
    dep = await loadDepartureContext(db, booking.departure_id);
  } catch (e) {
    if (e instanceof DepartureError) return null;
    throw e;
  }
  if (!dep.settings.enabled || !['open', 'closed'].includes(dep.row.status)) return null;
  const { results } = await db
    .prepare(
      `SELECT sp.*, tr.passport_number AS tr_passport_number, tr.passport_expiry_date AS tr_passport_expiry, tr.nationality AS tr_nationality
       FROM seat_passengers sp LEFT JOIN travellers tr ON tr.id = sp.traveller_id
       WHERE sp.seat_booking_id = ? AND sp.status = 'active' ORDER BY sp.created_at, sp.id`,
    )
    .bind(bookingId)
    .all<Row>();
  const passengers = (results ?? []).filter((p) => !only || p.id === only);
  if (only && passengers.length === 0) return null;
  return { tenantId, db, scope, booking, dep, passengers };
}

/** An opaque, stable reference, so the page never holds a row id. */
export async function refOf(kind: 'passenger' | 'extra', id: string): Promise<string> {
  return (await sha256Hex(`${kind}:${id}`)).slice(0, 16);
}

/** Document numbers are shown by their last three characters only. */
export function maskDocument(value: string): string {
  const v = value.trim();
  if (v.length <= 3) return '*'.repeat(v.length);
  return `${'*'.repeat(Math.min(v.length - 3, 8))}${v.slice(-3)}`;
}

const DOCUMENT_NUMBER = 'documentNumber';

/** Which fields the page asks for: the three built-in details the agency collects, and the document and custom fields set to "self service". */
export function selfServiceFields(dep: Pick<DepartureContext, 'effective'>): { core: { gender: boolean; dateOfBirth: boolean; meal: boolean }; fields: PassengerFieldDef[] } {
  const defs = dep.effective.passengerFields;
  const collected = (key: string) => defs.some((f) => f.key === key && f.collectOn !== 'staff_only');
  return {
    core: { gender: collected('gender'), dateOfBirth: collected('dateOfBirth'), meal: collected('meal') },
    fields: defs.filter((f) => !CORE_KEYS.has(f.key) && f.collectOn === 'self_service'),
  };
}

/** The value a field holds for a passenger: what the booking saved, else what the linked traveller record has. */
function storedValue(p: Row, key: string, saved: Record<string, unknown>): unknown {
  const v = saved[key];
  if (v !== undefined && v !== null && v !== '') return v;
  if (key === 'documentNumber') return p.tr_passport_number ?? null;
  if (key === 'documentExpiry') return p.tr_passport_expiry ?? null;
  if (key === 'nationality') return p.tr_nationality ?? null;
  return null;
}

const present = (v: unknown): boolean => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');

// ---------------------------------------------------------------- the page

export interface TripView {
  scope: LinkScope;
  state: 'open' | 'closed';
  reference: string;
  status: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  currency: string;
  tour: { title: string; destination: string | null; durationDays: number | null };
  fields: Array<{ key: string; label: string; required: boolean; type: string; options: string[] | null; custom: boolean }>;
  collects: { gender: boolean; dateOfBirth: boolean; meal: boolean };
  passengers: Array<{
    ref: string;
    firstName: string;
    lastName: string;
    gender: string | null;
    dateOfBirth: string | null;
    bandKey: string | null;
    bandLabel: string | null;
    mealPreference: string | null;
    values: Record<string, string | boolean | null>;
    extras: Array<{ extraRef: string; quantity: number; status: string }>;
  }>;
  extras: Array<{
    ref: string;
    title: string;
    description: string | null;
    day: number | null;
    price: number;
    bandPrices: Record<string, number> | null;
    open: boolean;
    cutoffAt: string | null;
    soldOut: boolean;
    left: number | null;
  }>;
  extrasOpen: boolean;
  invoice: { number: string; total: number; paid: number; balance: number; status: string } | null;
  extrasMoney: { total: number; paid: number; unpaid: number };
  deposit: { amount: number; due: number } | null;
}

/** The fixed projection the page receives. Never ids, never other bookings, document numbers masked. */
export async function buildTripView(trip: TripCtx, now = new Date()): Promise<TripView> {
  const { db, dep, booking, passengers } = trip;
  const tz = await getTenantTimeZone(db);
  const today = localDateString(tz, now);
  const { core, fields } = selfServiceFields(dep);
  const [bands, catalogue, taken, locale] = await Promise.all([
    loadBandsForTour(db, dep.row.tour_id),
    loadEffectiveExtras(db, dep.row.tour_id, dep.row.id),
    takenByExtra(db, dep.row.id),
    loadLocaleContext(db),
  ]);
  const cards = await rateCardPrices(db, catalogue.map((e) => e.rateCardId).filter((v): v is string => !!v), today);
  const startIso = departureStartIso(dep.row as DepartureTimes, tz);

  const ids = passengers.map((p) => p.id as string);
  const choiceRows: Row[] = [];
  if (ids.length) {
    const { results } = await db
      .prepare(`SELECT * FROM passenger_extras WHERE seat_passenger_id IN (${ids.map(() => '?').join(',')}) AND status != 'cancelled' ORDER BY created_at, id`)
      .bind(...ids)
      .all<Row>();
    choiceRows.push(...(results ?? []));
  }
  const extraRefs = new Map<string, string>();
  for (const e of catalogue) extraRefs.set(e.id, await refOf('extra', e.id));

  const outPassengers: TripView['passengers'] = [];
  for (const p of passengers) {
    const saved = parseJson<Record<string, unknown>>(p.extra_fields, {});
    const values: Record<string, string | boolean | null> = {};
    for (const f of fields) {
      const v = storedValue(p, f.key, saved);
      if (f.key === DOCUMENT_NUMBER) values[f.key] = present(v) ? maskDocument(String(v)) : null;
      else if (f.type === 'boolean') values[f.key] = v === true || v === '1' || v === 1 || v === 'true';
      else values[f.key] = present(v) ? String(v) : null;
    }
    // Quantities per extra (several rows of one pair add up).
    const per = new Map<string, { quantity: number; status: string }>();
    for (const r of choiceRows.filter((c) => c.seat_passenger_id === p.id && extraRefs.has(c.tour_extra_id))) {
      const prior = per.get(r.tour_extra_id);
      per.set(r.tour_extra_id, { quantity: (prior?.quantity ?? 0) + r.quantity, status: prior && prior.status !== r.status ? 'mixed' : r.status });
    }
    outPassengers.push({
      ref: await refOf('passenger', p.id),
      firstName: p.first_name ?? '',
      lastName: p.last_name ?? '',
      gender: p.gender ?? null,
      dateOfBirth: p.date_of_birth ?? null,
      bandKey: p.band_key ?? null,
      bandLabel: bands.find((b) => b.key === p.band_key)?.label ?? null,
      mealPreference: p.meal_preference ?? null,
      values,
      extras: [...per.entries()].map(([extraId, v]) => ({ extraRef: extraRefs.get(extraId)!, quantity: v.quantity, status: v.status })),
    });
  }

  const outExtras: TripView['extras'] = catalogue.map((e) => {
    const cutoffAt = extraCutoffIso(e, dep.row as DepartureTimes, tz);
    const left = e.capacity === null ? null : Math.max(0, e.capacity - (taken.get(e.id) ?? 0));
    return {
      ref: extraRefs.get(e.id)!,
      title: e.title,
      description: e.description,
      day: e.dayNumber,
      price: listPrice(e, e.rateCardId ? cards.get(e.rateCardId) : undefined),
      bandPrices: e.bandPrices,
      open: isExtraOpen(cutoffAt, startIso, now),
      cutoffAt,
      soldOut: left === 0,
      left: left !== null && left <= 10 ? left : null,
    };
  });

  // Money. The booking invoice, then what the extras come to. A passenger's own link sees what that person chose and nothing of the booking.
  const personal = trip.scope === 'passenger';
  const invoice = booking.invoice_id && !personal
    ? await db.prepare('SELECT invoice_number, total, paid_amount, balance_due, status, currency FROM invoices WHERE id = ?').bind(booking.invoice_id).first<Row>()
    : null;
  // The choices of the people in this link (a passenger link: that one person).
  const scopeIds = passengers.map((p) => p.id as string);
  const { results: moneyRows } = scopeIds.length
    ? await db
        .prepare(
          `SELECT pe.status, COALESCE(SUM(pe.quantity * pe.unit_price), 0) AS amount
           FROM passenger_extras pe WHERE pe.seat_passenger_id IN (${scopeIds.map(() => '?').join(',')}) AND pe.status != 'cancelled' GROUP BY pe.status`,
        )
        .bind(...scopeIds)
        .all<{ status: string; amount: number }>()
    : { results: [] as Array<{ status: string; amount: number }> };
  const byStatus = new Map((moneyRows ?? []).map((r) => [r.status, r.amount]));
  const extrasPaid = round2(byStatus.get('paid') ?? 0);
  const extrasUnpaid = round2((byStatus.get('selected') ?? 0) + (byStatus.get('invoiced') ?? 0));

  const deposit = dep.effective.deposit;
  let depositOut: TripView['deposit'] = null;
  if (invoice && deposit.type !== 'none' && (deposit.value ?? 0) > 0) {
    const amount = bookingDeposit(deposit, booking.seats, invoice.total);
    depositOut = { amount, due: Math.max(0, round2(Math.min(amount - (invoice.paid_amount ?? 0), invoice.balance_due ?? invoice.total))) };
  }

  return {
    scope: trip.scope,
    state: dep.row.status === 'open' ? 'open' : 'closed',
    reference: invoice?.invoice_number ?? `BK-${String(booking.id).replace(/-/g, '').slice(-8).toUpperCase()}`,
    status: booking.status,
    startDate: dep.row.start_date,
    endDate: dep.row.end_date,
    startTime: dep.row.start_time ?? null,
    currency: ((dep.tour.currency as string | null) ?? locale.currency).toUpperCase(),
    tour: { title: dep.tour.title, destination: dep.tour.destination ?? null, durationDays: dep.tour.duration_days ?? null },
    fields: fields.map((f) => ({ key: f.key, label: f.label, required: !!f.required, type: f.type ?? 'text', options: f.options ?? null, custom: !!f.custom })),
    collects: core,
    passengers: outPassengers,
    extras: outExtras,
    extrasOpen: outExtras.some((e) => e.open),
    invoice: invoice
      ? { number: invoice.invoice_number, total: invoice.total, paid: invoice.paid_amount ?? 0, balance: invoice.balance_due ?? invoice.total, status: invoice.status }
      : null,
    extrasMoney: { total: round2(extrasPaid + extrasUnpaid), paid: extrasPaid, unpaid: extrasUnpaid },
    deposit: depositOut,
  };
}

// ---------------------------------------------------------------- saving the travellers

export interface TravellerInput {
  ref: string;
  firstName?: string;
  lastName?: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  mealPreference?: string | null;
  /** Values of the fields the agency collects here, by key. Undefined leaves a value alone, an empty string clears it. */
  values?: Record<string, string | boolean | null | undefined>;
}

export interface TravellerProblem {
  ref: string;
  field: string;
}

const validDate = (v: string): boolean => {
  if (!DATE_SHAPE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/**
 * Saves the details of the passengers the link covers and keeps their travellers records in step (created under the booking contact
 * when a passenger has none), so passport-expiry and visa alerts see them. A document number that comes back masked is left as it is.
 * Throws 400 PASSENGER_INVALID with every problem found, and saves nothing then.
 */
export async function saveTravellers(env: Env, trip: TripCtx, input: TravellerInput[]): Promise<{ saved: number }> {
  const { db, dep, booking, passengers, tenantId } = trip;
  const { core, fields } = selfServiceFields(dep);
  const byRef = new Map<string, Row>();
  for (const p of passengers) byRef.set(await refOf('passenger', p.id), p);
  const problems: TravellerProblem[] = [];
  const bands = await loadBandsForTour(db, dep.row.tour_id);
  const startDate: string = dep.row.start_date;

  interface Plan { p: Row; first: string; last: string; gender: string | null; dob: string | null; band: string | null; meal: string | null; saved: Record<string, unknown>; docNumber: string | null; docExpiry: string | null; docType: string | null; nationality: string | null }
  const plans: Plan[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    const p = byRef.get(item.ref);
    if (!p || seen.has(item.ref)) {
      problems.push({ ref: item.ref, field: 'ref' });
      continue;
    }
    seen.add(item.ref);
    const bad = (field: string) => problems.push({ ref: item.ref, field });
    const first = (item.firstName ?? p.first_name ?? '').trim().slice(0, 80);
    const last = (item.lastName ?? p.last_name ?? '').trim().slice(0, 80);
    if (!first) bad('firstName');

    let gender: string | null = p.gender ?? null;
    if (core.gender && item.gender !== undefined) {
      if (item.gender === null || item.gender === '') gender = null;
      else if (['male', 'female', 'other'].includes(item.gender)) gender = item.gender;
      else bad('gender');
    }
    // A date of birth already on the booking decides the price: only an empty one can be filled in here.
    let dob: string | null = p.date_of_birth ?? null;
    let band: string | null = p.band_key ?? null;
    if (core.dateOfBirth && !dob && item.dateOfBirth) {
      if (!validDate(item.dateOfBirth) || item.dateOfBirth > startDate) bad('dateOfBirth');
      else {
        dob = item.dateOfBirth;
        if (!band) band = bandForAge(bands, ageOn(dob, startDate));
      }
    }
    let meal: string | null = p.meal_preference ?? null;
    if (core.meal && item.mealPreference !== undefined) meal = item.mealPreference?.trim() ? item.mealPreference.trim().slice(0, 60) : null;

    const saved = parseJson<Record<string, unknown>>(p.extra_fields, {});
    for (const f of fields) {
      const incoming = item.values?.[f.key];
      if (incoming !== undefined) {
        if (typeof incoming === 'boolean') saved[f.key] = incoming;
        else if (incoming === null || incoming === '') delete saved[f.key];
        else {
          const text = String(incoming).trim().slice(0, 300);
          const type = f.type ?? 'text';
          if (type === 'date' && !validDate(text)) bad(f.key);
          else if (type === 'select' && f.options && !f.options.includes(text)) bad(f.key);
          // The page shows the number masked and sends it back unchanged when the traveller does not touch it.
          else if (f.key === DOCUMENT_NUMBER && present(storedValue(p, f.key, saved)) && text === maskDocument(String(storedValue(p, f.key, saved)))) continue;
          else saved[f.key] = text;
        }
      }
      if (f.required && !present(storedValue(p, f.key, saved)) && f.type !== 'boolean') bad(f.key);
    }
    const str = (key: string): string | null => {
      const v = storedValue(p, key, saved);
      return present(v) ? String(v) : null;
    };
    plans.push({ p, first, last, gender, dob, band, meal, saved, docNumber: str('documentNumber'), docExpiry: str('documentExpiry'), docType: str('documentType'), nationality: str('nationality') });
  }
  if (problems.length) throw new DepartureError(400, 'PASSENGER_INVALID', 'Some traveller details are missing or not valid', { errors: problems });

  const now = nowIso();
  const statements: D1PreparedStatement[] = [];
  for (const x of plans) {
    let travellerId: string | null = x.p.traveller_id ?? null;
    const docType = x.docType?.toLowerCase();
    const passport = !docType || docType === 'passport';
    const fullName = `${x.first} ${x.last}`.trim();
    if (travellerId) {
      statements.push(
        db
          .prepare(
            `UPDATE travellers SET first_name = ?, last_name = ?, full_name_passport = ?, date_of_birth = COALESCE(?, date_of_birth), gender = COALESCE(?, gender),
               nationality = COALESCE(?, nationality), passport_number = COALESCE(?, passport_number), passport_expiry_date = COALESCE(?, passport_expiry_date),
               meal_preference = COALESCE(?, meal_preference), updated_at = ? WHERE id = ?`,
          )
          .bind(x.first, x.last, fullName, x.dob, x.gender, x.nationality, passport ? x.docNumber : null, passport ? x.docExpiry : null, x.meal, now, travellerId),
      );
    } else {
      travellerId = generateId();
      statements.push(
        db
          .prepare(
            `INSERT INTO travellers (id, tenant_id, contact_id, first_name, last_name, full_name_passport, date_of_birth, gender, nationality, passport_number,
               passport_expiry_date, meal_preference, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          )
          .bind(travellerId, tenantId, booking.contact_id, x.first, x.last, fullName, x.dob, x.gender, x.nationality, passport ? x.docNumber : null, passport ? x.docExpiry : null, x.meal, now, now),
      );
    }
    const documentsStatus = x.p.documents_status === 'unknown' && x.docNumber ? 'provided' : x.p.documents_status;
    statements.push(
      db
        .prepare(
          `UPDATE seat_passengers SET traveller_id = ?, first_name = ?, last_name = ?, gender = ?, date_of_birth = ?, band_key = ?, meal_preference = ?,
             extra_fields = ?, documents_status = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(travellerId, x.first, x.last, x.gender, x.dob, x.band, x.meal, Object.keys(x.saved).length ? JSON.stringify(x.saved) : null, documentsStatus, now, x.p.id),
    );
  }
  for (let i = 0; i < statements.length; i += 80) await db.batch(statements.slice(i, i + 80));
  if (plans.length) await announceSeats({ env, tenantId, db }, booking.departure_id, 'seat_booking.passengers_changed');
  return { saved: plans.length };
}

// ---------------------------------------------------------------- paying

export type PayWhat = 'extras' | 'balance' | 'deposit';

export type PayResult =
  | { kind: 'link'; url: string; amount: number; currency: string; invoiceNumber: string; gateway: string }
  | { kind: 'bank'; bank: BankInstructions; amount: number; currency: string; invoiceNumber: string }
  | { kind: 'unavailable'; amount: number; currency: string; invoiceNumber: string };

/**
 * A payment link for what the customer chose to pay now, or the bank details when no gateway can issue one. An open link for the
 * same amount is reused. Throws 409 NOTHING_DUE when there is nothing to pay.
 */
export async function payFor(env: Env, trip: TripCtx, what: PayWhat, apiBase: string, actor: InvoiceActorLike): Promise<PayResult> {
  const { db, booking, dep, tenantId } = trip;
  let invoiceId: string | null = null;
  let purpose: 'deposit' | 'balance' = 'balance';

  if (what === 'extras') {
    await invoiceExtras(env, tenantId, db, booking.id, actor);
    invoiceId = (await openExtrasInvoices(db, booking.id))[0]?.id ?? null;
  } else {
    invoiceId = booking.invoice_id ?? null;
    if (!invoiceId) {
      try {
        invoiceId = (await createBookingInvoice(env, tenantId, db, booking.id, actor)).invoiceId;
      } catch (e) {
        if (!(e instanceof DepartureError)) throw e;
      }
    }
    purpose = what === 'deposit' ? 'deposit' : 'balance';
  }
  const invoice = invoiceId
    ? await db
        .prepare('SELECT id, invoice_number, total, paid_amount, balance_due, currency, status, payment_link_url, payment_link_status, payment_link_amount, payment_link_purpose FROM invoices WHERE id = ?')
        .bind(invoiceId)
        .first<Row>()
    : null;
  if (!invoice || invoice.status === 'cancelled') throw new DepartureError(409, 'NOTHING_DUE', 'There is nothing to pay');

  const balance = round2(invoice.balance_due ?? invoice.total - (invoice.paid_amount ?? 0));
  let amount = balance;
  if (what === 'deposit') {
    const deposit = dep.effective.deposit;
    amount = Math.min(balance, round2(bookingDeposit(deposit, booking.seats, invoice.total) - (invoice.paid_amount ?? 0)));
  }
  if (!(amount > 0.005)) throw new DepartureError(409, 'NOTHING_DUE', 'There is nothing to pay');
  const currency = String(invoice.currency).toUpperCase();

  if (invoice.payment_link_url && invoice.payment_link_status === 'created' && Math.abs((invoice.payment_link_amount ?? 0) - amount) < 0.01 && invoice.payment_link_purpose === purpose) {
    return { kind: 'link', url: invoice.payment_link_url, amount, currency, invoiceNumber: invoice.invoice_number, gateway: 'existing' };
  }
  const contact = await db.prepare('SELECT name, email, phone FROM contacts WHERE id = ?').bind(booking.contact_id).first<{ name: string | null; email: string | null; phone: string | null }>();
  const link = await createDepositLink(
    env, tenantId, db, { id: invoice.id, invoiceNumber: invoice.invoice_number, currency }, amount,
    { name: contact?.name ?? null, email: contact?.email ?? null, phone: contact?.phone ?? null }, apiBase, purpose,
  );
  if (link) return { kind: 'link', url: link.url, amount: link.amount, currency, invoiceNumber: invoice.invoice_number, gateway: link.gateway };
  const bank = await bankInstructions(db, invoice.invoice_number);
  if (bank) return { kind: 'bank', bank, amount, currency, invoiceNumber: invoice.invoice_number };
  return { kind: 'unavailable', amount, currency, invoiceNumber: invoice.invoice_number };
}
