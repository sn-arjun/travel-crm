/**
 * Seat bookings (R143, design 5.1): request (hold or waitlist), confirm, cancel, change seats and move between departures.
 *
 * Capacity is never checked by reading and then writing. Every statement that takes seats (the hold INSERT, a seat change, an offer,
 * a move) carries the rule in its own WHERE clause (`fitsSql`), and D1 runs one statement atomically, so two requests can never
 * oversell. Nothing here is permission-aware; the routes decide who may call it.
 */

import { drizzle } from 'drizzle-orm/d1';
import { generateId } from '../../utils/uuid';
import { loadLocaleContext } from '../../utils/money';
import { logLeadActivity } from '../../utils/lead-activity-logger';
import { broadcastToTenant } from '../../utils/realtime';
import { findOrCreateContact } from '../domain/contacts';
import { createLead } from '../domain/leads';
import { automationsPaused } from '../automation/engine';
import { emitEvent } from '../automation/events';
import { chunk, decodeCursor, DepartureError, encodeCursor, nowIso } from './common';
import { seatsInUse } from './capacity';
import {
  addHoursIso, bookingPayload, cancelPassengersStatement, emit, emitCapacityEvents, fitsSql, getBookingRow, loadDepartureContext, nowOf,
  requireBookingRow, rowToBooking, seatsLeft, type DepartureContext, type SeatBookingDto, type SeatBookingSource, type SeatCtx,
} from './seat-support';
import {
  getPassengers, insertPassengerStatement, preparePassengers, type PassengerDto, type PreparedPassenger,
} from './passengers';
import { runWaitlistStep } from './waitlist';
import type { PassengerInput } from '../../validators/seat-bookings';

type Row = Record<string, any>;

const ACTIVE = ['held', 'confirmed', 'waitlisted'];
const isUniqueViolation = (e: unknown): boolean => /UNIQUE constraint/i.test(String((e as Error)?.message ?? e));

/** Staff, the assistant and imports may add seats to a closed departure; the public page and accepted quotes need it open. */
const STAFF_SOURCES: SeatBookingSource[] = ['staff', 'assistant', 'import'];
const LEAD_SOURCE: Record<SeatBookingSource, string> = { staff: 'manual', assistant: 'manual', import: 'manual', public_page: 'website', quote_accept: 'website' };

/** Pipeline stages before `won`: a confirmed seat booking moves a lead from one of these to won. */
const EARLIER_THAN_WON = ['new', 'contacted', 'qualified', 'requirement_gathered', 'proposal_sent', 'negotiation'];

export interface SeatBookingDetail extends SeatBookingDto {
  passengers: PassengerDto[];
}

export interface RequestSeatsInput {
  departureId: string;
  /** Needed unless passengers are given (then the seats are their number). */
  seats?: number;
  leadId?: string;
  contact?: { contactId?: string; name?: string; phone?: string; email?: string };
  passengers?: PassengerInput[];
  createTravellers?: boolean;
  source: SeatBookingSource;
  notes?: string | null;
}

// ---------------------------------------------------------------- read

const BOOKING_SELECT = `SELECT sb.*, c.name AS contact_name, l.title AS lead_title, d.code AS departure_code,
    (SELECT COUNT(*) FROM seat_passengers sp WHERE sp.seat_booking_id = sb.id AND sp.status = 'active') AS passengers_count
  FROM seat_bookings sb JOIN contacts c ON c.id = sb.contact_id JOIN leads l ON l.id = sb.lead_id JOIN departures d ON d.id = sb.departure_id`;

export async function getBookingDetail(db: D1Database, id: string): Promise<SeatBookingDetail | null> {
  const row = await db.prepare(`${BOOKING_SELECT} WHERE sb.id = ?`).bind(id).first<Row>();
  if (!row) return null;
  return { ...rowToBooking(row), passengers: await getPassengers(db, id) };
}

export interface BookingListFilters {
  status?: string;
  cursor?: string;
  limit: number;
}

/** Bookings of a departure, oldest first, with the number of passengers; `status` may list several (held,confirmed). */
export async function listBookings(db: D1Database, departureId: string, f: BookingListFilters) {
  const where = ['sb.departure_id = ?'];
  const binds: unknown[] = [departureId];
  const statuses = (f.status ?? '').split(',').map((s) => s.trim()).filter((s) => ['held', 'confirmed', 'waitlisted', 'cancelled', 'expired'].includes(s));
  if (statuses.length) {
    where.push(`sb.status IN (${statuses.map(() => '?').join(',')})`);
    binds.push(...statuses);
  }
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM seat_bookings sb WHERE ${where.join(' AND ')}`).bind(...binds).first<{ n: number }>())?.n ?? 0;
  const cursor = decodeCursor(f.cursor, 2);
  const pageWhere = [...where];
  const pageBinds = [...binds];
  if (cursor) {
    pageWhere.push('(sb.created_at > ? OR (sb.created_at = ? AND sb.id > ?))');
    pageBinds.push(cursor[0], cursor[0], cursor[1]);
  }
  const { results } = await db
    .prepare(`${BOOKING_SELECT} WHERE ${pageWhere.join(' AND ')} ORDER BY sb.created_at, sb.id LIMIT ?`)
    .bind(...pageBinds, f.limit + 1)
    .all<Row>();
  const rows = results ?? [];
  const hasMore = rows.length > f.limit;
  const page = rows.slice(0, f.limit);
  const last = page[page.length - 1];
  return { items: page.map(rowToBooking), total, hasMore, nextCursor: hasMore && last ? encodeCursor(last.created_at ?? '', last.id) : null };
}

/** Every seat booking of a lead (newest first) with a line about its departure, for the lead page. */
export async function listLeadBookings(db: D1Database, leadId: string) {
  const { results } = await db
    .prepare(
      `SELECT sb.*, d.code AS departure_code, d.start_date AS departure_start_date, d.end_date AS departure_end_date, d.status AS departure_status,
         t.title AS tour_title, (SELECT COUNT(*) FROM seat_passengers sp WHERE sp.seat_booking_id = sb.id AND sp.status = 'active') AS passengers_count
       FROM seat_bookings sb JOIN departures d ON d.id = sb.departure_id JOIN tours t ON t.id = d.tour_id
       WHERE sb.lead_id = ? ORDER BY sb.created_at DESC, sb.id DESC`,
    )
    .bind(leadId)
    .all<Row>();
  return (results ?? []).map((r) => ({
    ...rowToBooking(r),
    departureStartDate: r.departure_start_date as string,
    departureEndDate: r.departure_end_date as string,
    departureStatus: r.departure_status as string,
    tourTitle: r.tour_title as string,
  }));
}

// ---------------------------------------------------------------- the lead follows the booking

async function linkLeadToDeparture(ctx: SeatCtx, dep: DepartureContext, leadId: string): Promise<void> {
  await ctx.db
    .prepare(`UPDATE leads SET departure_id = ?, travel_date = CASE WHEN travel_date IS NULL OR travel_date = '' THEN ? ELSE travel_date END, updated_at = ? WHERE id = ?`)
    .bind(dep.row.id, dep.row.start_date, nowIso(), leadId)
    .run();
}

/** On confirm: the lead moves to won when the setting is on and it is earlier in the pipeline (lead.status_changed is emitted as for a click). */
async function moveLeadToWon(ctx: SeatCtx, dep: DepartureContext, booking: Row): Promise<void> {
  if (!dep.settings.markLeadWonOnConfirm) return;
  const lead = await ctx.db.prepare('SELECT id, status FROM leads WHERE id = ? AND COALESCE(is_deleted, 0) = 0').bind(booking.lead_id).first<{ id: string; status: string }>();
  if (!lead || !EARLIER_THAN_WON.includes(lead.status)) return;
  const res = await ctx.db
    .prepare(`UPDATE leads SET status = 'won', updated_at = ? WHERE id = ? AND status = ?`)
    .bind(nowIso(), lead.id, lead.status)
    .run();
  if ((res.meta?.changes ?? 0) === 0) return;
  await logLeadActivity(drizzle(ctx.db), {
    leadId: lead.id, type: 'status_change', content: `Seats confirmed on departure ${dep.row.code}`,
    metadata: { old_status: lead.status, new_status: 'won', departure_id: dep.row.id }, userId: ctx.userId,
  });
  await emitEvent(
    ctx.env, ctx.tenantId, ctx.db,
    { type: 'lead.status_changed', entityType: 'lead', entityId: lead.id, payload: { from: lead.status, to: 'won' }, actorId: ctx.userId, depth: ctx.depth ?? 0 },
    ctx.waiter,
  );
}

/** After the last active booking of a lead is cancelled: one "Mark as lost?" suggestion for the lead's owner. */
async function suggestMarkLost(ctx: SeatCtx, booking: Row, reason: string | null): Promise<void> {
  const other = await ctx.db
    .prepare(`SELECT 1 AS x FROM seat_bookings WHERE lead_id = ? AND id != ? AND status IN ('held', 'confirmed', 'waitlisted') LIMIT 1`)
    .bind(booking.lead_id, booking.id)
    .first();
  if (other || (await automationsPaused(ctx.db))) return;
  const lead = await ctx.db
    .prepare('SELECT id, title, status, contact_id, assigned_to FROM leads WHERE id = ? AND COALESCE(is_deleted, 0) = 0')
    .bind(booking.lead_id)
    .first<Row>();
  if (!lead || ['lost', 'completed'].includes(lead.status)) return;
  const id = generateId();
  const inserted = await ctx.db
    .prepare(
      `INSERT OR IGNORE INTO assistant_suggestions
         (id, rule_key, origin, source_type, source_id, entity_type, entity_id, contact_id, lead_id, action_type, params, title, reason, risk, status, dedupe_key, assigned_to)
       VALUES (?, 'departures.cancelled_last_booking', 'rule', 'seat_booking', ?, 'lead', ?, ?, ?, 'mark_lead_lost', ?, ?, ?, 'medium', 'pending', ?, ?)`,
    )
    .bind(
      id, booking.id, lead.id, lead.contact_id, lead.id,
      JSON.stringify({ leadId: lead.id, reason: reason?.trim() || 'Seat booking cancelled' }),
      `Mark "${lead.title}" as lost?`,
      'The last seat booking of this lead was cancelled',
      `lead-lost:${booking.id}`, lead.assigned_to ?? null,
    )
    .run();
  if ((inserted.meta?.changes ?? 0) > 0) {
    try {
      await broadcastToTenant(ctx.env, ctx.tenantId, { type: 'assistant:suggestion', data: { id, entityType: 'lead', entityId: lead.id, contactId: lead.contact_id, leadId: lead.id, status: 'pending' } });
    } catch {
      /* the suggestion is stored; the realtime push is only a nicety */
    }
  }
}

// ---------------------------------------------------------------- request

async function resolveLead(ctx: SeatCtx, dep: DepartureContext, input: RequestSeatsInput, seats: number): Promise<{ leadId: string; contactId: string; created: boolean }> {
  if (input.leadId) {
    const lead = await ctx.db.prepare('SELECT id, contact_id FROM leads WHERE id = ? AND COALESCE(is_deleted, 0) = 0').bind(input.leadId).first<{ id: string; contact_id: string }>();
    if (!lead) throw new DepartureError(404, 'LEAD_NOT_FOUND', 'Lead not found');
    return { leadId: lead.id, contactId: lead.contact_id, created: false };
  }
  const c = input.contact ?? {};
  let contactId: string;
  if (c.contactId) {
    if (!(await ctx.db.prepare('SELECT id FROM contacts WHERE id = ? AND COALESCE(is_deleted, 0) = 0').bind(c.contactId).first())) {
      throw new DepartureError(404, 'CONTACT_NOT_FOUND', 'Contact not found');
    }
    contactId = c.contactId;
  } else {
    const found = await findOrCreateContact(ctx.db, { name: c.name, phone: c.phone, email: c.email, source: LEAD_SOURCE[input.source], createdBy: ctx.userId });
    if (!found) throw new DepartureError(400, 'CONTACT_REQUIRED', 'A name, phone number or email is needed to create the contact');
    contactId = found.id;
  }
  // Currency: the tour's, else the agency's (design 7); the travel date is the departure's start.
  const currency = dep.tour.currency ?? (await loadLocaleContext(ctx.db)).currency;
  const lead = await createLead(
    ctx.env, ctx.tenantId, ctx.db,
    {
      contactId,
      title: `${dep.tour.title} ${dep.row.start_date}`.slice(0, 200),
      destinations: dep.tour.destination ? [dep.tour.destination] : [],
      travelDate: dep.row.start_date,
      returnDate: dep.row.end_date,
      paxAdults: seats,
      currency,
      tripType: 'group',
      source: LEAD_SOURCE[input.source],
    },
    { userId: ctx.userId, activityNote: `Lead created for departure ${dep.row.code}`, depth: ctx.depth ?? 0, waiter: ctx.waiter },
  );
  return { leadId: lead.id, contactId, created: true };
}

/**
 * Holds seats on a departure for a lead (given, or created from contact details). When the departure cannot take them the party goes
 * on the waitlist (if the agency has it on) or the request is refused with 409 SEATS_UNAVAILABLE {seatsLeft}. In confirm mode
 * auto_when_available a held booking is confirmed in the same request.
 */
export async function requestSeats(ctx: SeatCtx, input: RequestSeatsInput): Promise<SeatBookingDetail> {
  const dep = await loadDepartureContext(ctx.db, input.departureId);
  const status = dep.row.status as string;
  if (status !== 'open' && !(status === 'closed' && STAFF_SOURCES.includes(input.source))) {
    throw new DepartureError(409, 'DEPARTURE_NOT_OPEN', `The departure is ${status} and does not take seat requests`, { status });
  }

  let prepared: PreparedPassenger[] | null = null;
  if (input.passengers?.length) prepared = await preparePassengers(ctx.db, dep, input.passengers, null);
  const seats = prepared ? prepared.length : input.seats ?? 0;
  if (seats < 1) throw new DepartureError(400, 'SEATS_REQUIRED', 'Give the number of seats or the passengers');

  const waitlistOn = dep.settings.waitlist.enabled;
  const left = await seatsLeft(ctx.db, dep.row.id, dep.row.capacity);
  if (seats > dep.row.capacity || (seats > left && !waitlistOn)) {
    throw new DepartureError(409, 'SEATS_UNAVAILABLE', `Only ${left} seats are left on this departure`, { seatsLeft: left });
  }

  const { leadId, contactId, created } = await resolveLead(ctx, dep, input, seats);
  const discardLead = async () => {
    if (created) await ctx.db.prepare('UPDATE leads SET is_deleted = 1, updated_at = ? WHERE id = ?').bind(nowIso(), leadId).run();
  };

  const id = generateId();
  const now = nowOf(ctx);
  const nowText = now.toISOString();
  const holdUntil = addHoursIso(now, dep.effective.holdExpiryHours);
  let outcome: 'held' | 'waitlisted';
  try {
    const held = await ctx.db
      .prepare(
        `INSERT INTO seat_bookings (id, departure_id, lead_id, contact_id, status, seats, hold_expires_at, source, notes, created_by, created_at, updated_at)
         SELECT ?, ?, ?, ?, 'held', ?, ?, ?, ?, ?, ?, ? WHERE ${fitsSql({ departureExpr: '?', seatsExpr: '?' })}`,
      )
      .bind(id, dep.row.id, leadId, contactId, seats, holdUntil, input.source, input.notes ?? null, ctx.userId, nowText, nowText, dep.row.id, dep.row.id, seats)
      .run();
    if ((held.meta?.changes ?? 0) > 0) {
      outcome = 'held';
    } else if (waitlistOn) {
      await ctx.db
        .prepare(
          `INSERT INTO seat_bookings (id, departure_id, lead_id, contact_id, status, seats, waitlist_position, source, notes, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'waitlisted', ?, (SELECT COALESCE(MAX(waitlist_position), 0) + 1 FROM seat_bookings WHERE departure_id = ? AND status = 'waitlisted'), ?, ?, ?, ?, ?)`,
        )
        .bind(id, dep.row.id, leadId, contactId, seats, dep.row.id, input.source, input.notes ?? null, ctx.userId, nowText, nowText)
        .run();
      outcome = 'waitlisted';
    } else {
      await discardLead();
      throw new DepartureError(409, 'SEATS_UNAVAILABLE', `Only ${await seatsLeft(ctx.db, dep.row.id, dep.row.capacity)} seats are left on this departure`, {
        seatsLeft: await seatsLeft(ctx.db, dep.row.id, dep.row.capacity),
      });
    }
  } catch (e) {
    if (isUniqueViolation(e)) {
      await discardLead();
      const existing = await ctx.db
        .prepare(`SELECT id FROM seat_bookings WHERE departure_id = ? AND lead_id = ? AND status IN ('held', 'confirmed', 'waitlisted')`)
        .bind(dep.row.id, leadId)
        .first<{ id: string }>();
      throw new DepartureError(409, 'ALREADY_BOOKED', 'This lead already has seats on this departure', { seatBookingId: existing?.id ?? null });
    }
    throw e;
  }

  if (prepared) {
    for (const part of chunk(prepared.map((p) => insertPassengerStatement(ctx.db, id, dep.row.id, p)), 80)) await ctx.db.batch(part);
  }
  await linkLeadToDeparture(ctx, dep, leadId);

  const row = (await getBookingRow(ctx.db, id))!;
  await emit(ctx, outcome === 'held' ? 'seat_booking.held' : 'seat_booking.waitlisted', 'seat_booking', id, bookingPayload(row, { departureCode: dep.row.code, confirmMode: dep.effective.confirmMode }));
  if (outcome === 'held') {
    await emitCapacityEvents(ctx, dep, seats);
    if (dep.effective.confirmMode === 'auto_when_available') await confirmBooking(ctx, id, 'auto');
  }
  return (await getBookingDetail(ctx.db, id))!;
}

// ---------------------------------------------------------------- confirm, cancel

/**
 * Confirms a held booking. `by` is 'deposit' or 'quote_accept' for the automatic paths, 'auto' for confirm mode
 * auto_when_available, otherwise the person (ctx.userId) is recorded. 409 ILLEGAL_TRANSITION unless the booking is held.
 */
export async function confirmBooking(ctx: SeatCtx, bookingId: string, by?: 'auto' | 'deposit' | 'quote_accept'): Promise<SeatBookingDetail> {
  const booking = await requireBookingRow(ctx.db, bookingId);
  if (booking.status !== 'held') {
    throw new DepartureError(409, 'ILLEGAL_TRANSITION', `A ${booking.status} booking cannot be confirmed`, { from: booking.status, to: 'confirmed' });
  }
  const dep = await loadDepartureContext(ctx.db, booking.departure_id);
  if (dep.row.status === 'cancelled') throw new DepartureError(409, 'DEPARTURE_NOT_OPEN', 'The departure is cancelled', { status: 'cancelled' });
  const now = nowIso();
  const res = await ctx.db
    .prepare(`UPDATE seat_bookings SET status = 'confirmed', confirmed_at = ?, confirmed_by = ?, hold_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'held'`)
    .bind(now, by ?? ctx.userId ?? 'auto', now, bookingId)
    .run();
  if ((res.meta?.changes ?? 0) === 0) {
    const fresh = await requireBookingRow(ctx.db, bookingId);
    throw new DepartureError(409, 'ILLEGAL_TRANSITION', `A ${fresh.status} booking cannot be confirmed`, { from: fresh.status, to: 'confirmed' });
  }
  const row = await requireBookingRow(ctx.db, bookingId);
  await moveLeadToWon(ctx, dep, row);
  await emit(ctx, 'seat_booking.confirmed', 'seat_booking', bookingId, bookingPayload(row, { confirmedBy: row.confirmed_by, departureCode: dep.row.code }));
  return (await getBookingDetail(ctx.db, bookingId))!;
}

export async function bulkConfirm(ctx: SeatCtx, ids: string[]): Promise<Array<{ id: string; ok: boolean; code?: string; message?: string }>> {
  const out: Array<{ id: string; ok: boolean; code?: string; message?: string }> = [];
  for (const id of [...new Set(ids)]) {
    try {
      await confirmBooking(ctx, id);
      out.push({ id, ok: true });
    } catch (e) {
      if (!(e instanceof DepartureError)) throw e;
      out.push({ id, ok: false, code: e.code, message: e.message });
    }
  }
  return out;
}

/** Cancels a held, confirmed or waitlisted booking. Seats it held go to the waitlist step; the lead gets a "mark lost?" suggestion when this was its last active booking. */
export async function cancelBooking(ctx: SeatCtx, bookingId: string, reason?: string | null): Promise<SeatBookingDetail> {
  const booking = await requireBookingRow(ctx.db, bookingId);
  if (!ACTIVE.includes(booking.status)) {
    throw new DepartureError(409, 'ILLEGAL_TRANSITION', `A ${booking.status} booking cannot be cancelled`, { from: booking.status, to: 'cancelled' });
  }
  const now = nowIso();
  const res = await ctx.db
    .prepare(`UPDATE seat_bookings SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, waitlist_position = NULL, updated_at = ? WHERE id = ? AND status = ?`)
    .bind(now, reason?.trim() || null, now, bookingId, booking.status)
    .run();
  if ((res.meta?.changes ?? 0) === 0) {
    const fresh = await requireBookingRow(ctx.db, bookingId);
    throw new DepartureError(409, 'ILLEGAL_TRANSITION', `A ${fresh.status} booking cannot be cancelled`, { from: fresh.status, to: 'cancelled' });
  }
  await cancelPassengersStatement(ctx.db, bookingId).run();
  const row = await requireBookingRow(ctx.db, bookingId);
  await emit(ctx, 'seat_booking.cancelled', 'seat_booking', bookingId, bookingPayload(row, { previousStatus: booking.status, reason: row.cancel_reason }));
  if (booking.status !== 'waitlisted') await runWaitlistStep(ctx, booking.departure_id);
  await suggestMarkLost(ctx, row, row.cancel_reason);
  return (await getBookingDetail(ctx.db, bookingId))!;
}

// ---------------------------------------------------------------- seats, move

/** Sets the number of seats of a held, confirmed or waitlisted booking. Growing goes through the capacity condition; shrinking runs the waitlist step. */
export async function changeSeats(ctx: SeatCtx, bookingId: string, seats: number): Promise<SeatBookingDetail> {
  const booking = await requireBookingRow(ctx.db, bookingId);
  if (!ACTIVE.includes(booking.status)) {
    throw new DepartureError(409, 'ILLEGAL_TRANSITION', `A ${booking.status} booking cannot change its seats`, { from: booking.status });
  }
  const passengers = (await ctx.db.prepare(`SELECT COUNT(*) AS n FROM seat_passengers WHERE seat_booking_id = ? AND status = 'active'`).bind(bookingId).first<{ n: number }>())?.n ?? 0;
  if (passengers > 0 && passengers !== seats) {
    throw new DepartureError(409, 'SEATS_FOLLOW_PASSENGERS', 'The seats follow the passengers; change the passenger list instead', { passengers });
  }
  if (seats === booking.seats) return (await getBookingDetail(ctx.db, bookingId))!;
  const dep = await loadDepartureContext(ctx.db, booking.departure_id);
  if (booking.status === 'waitlisted') {
    await ctx.db.prepare('UPDATE seat_bookings SET seats = ?, updated_at = ? WHERE id = ?').bind(seats, nowIso(), bookingId).run();
  } else {
    const res = await ctx.db
      .prepare(
        `UPDATE seat_bookings SET seats = ?, updated_at = ? WHERE id = ? AND status IN ('held', 'confirmed')
           AND ${fitsSql({ departureExpr: 'seat_bookings.departure_id', seatsExpr: '?', excludeSelfId: 'seat_bookings.id' })}`,
      )
      .bind(seats, nowIso(), bookingId, seats)
      .run();
    if ((res.meta?.changes ?? 0) === 0) {
      const available = Math.max(0, dep.row.capacity - (await seatsInUse(ctx.db, dep.row.id)) + booking.seats);
      throw new DepartureError(409, 'SEATS_UNAVAILABLE', `Only ${available} seats are available for this booking`, { seatsLeft: available });
    }
    if (seats < booking.seats) await runWaitlistStep(ctx, dep.row.id);
    else await emitCapacityEvents(ctx, dep, seats - booking.seats);
  }
  return (await getBookingDetail(ctx.db, bookingId))!;
}

/**
 * Moves a booking to another departure in one batch: the same party takes the same kind of place (held, confirmed or waitlisted) on
 * the target through a conditional insert, and the source is cancelled with reason 'moved' only if that insert happened. Passengers
 * follow; their pickup stops belong to the old departure and are cleared. Returns the new booking.
 */
export async function moveBooking(ctx: SeatCtx, bookingId: string, toDepartureId: string): Promise<SeatBookingDetail> {
  const booking = await requireBookingRow(ctx.db, bookingId);
  if (!ACTIVE.includes(booking.status)) {
    throw new DepartureError(409, 'ILLEGAL_TRANSITION', `A ${booking.status} booking cannot be moved`, { from: booking.status });
  }
  if (toDepartureId === booking.departure_id) throw new DepartureError(400, 'SAME_DEPARTURE', 'The booking is already on this departure');
  const target = await loadDepartureContext(ctx.db, toDepartureId);
  if (!['open', 'closed'].includes(target.row.status)) {
    throw new DepartureError(409, 'DEPARTURE_NOT_OPEN', `The target departure is ${target.row.status}`, { status: target.row.status });
  }
  const source = await loadDepartureContext(ctx.db, booking.departure_id);

  const newId = generateId();
  const now = nowIso();
  const common = [booking.lead_id, booking.contact_id, booking.itinerary_id ?? null, booking.invoice_id ?? null];
  const stillThere = `EXISTS (SELECT 1 FROM seat_bookings WHERE id = ? AND status = ?)`;
  const insert =
    booking.status === 'waitlisted'
      ? ctx.db
          .prepare(
            `INSERT INTO seat_bookings (id, departure_id, lead_id, contact_id, itinerary_id, invoice_id, status, seats, waitlist_position, source, notes, room_notes, created_by, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, 'waitlisted', ?, (SELECT COALESCE(MAX(waitlist_position), 0) + 1 FROM seat_bookings WHERE departure_id = ? AND status = 'waitlisted'), ?, ?, ?, ?, ?, ?
             WHERE ${stillThere}`,
          )
          .bind(newId, toDepartureId, ...common, booking.seats, toDepartureId, booking.source, booking.notes ?? null, booking.room_notes ?? null, ctx.userId, now, now, bookingId, booking.status)
      : ctx.db
          .prepare(
            `INSERT INTO seat_bookings (id, departure_id, lead_id, contact_id, itinerary_id, invoice_id, status, seats, hold_expires_at, confirmed_at, confirmed_by, source, notes, room_notes, created_by, created_at, updated_at)
             SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${stillThere} AND ${fitsSql({ departureExpr: '?', seatsExpr: '?' })}`,
          )
          .bind(
            newId, toDepartureId, ...common, booking.status, booking.seats, booking.hold_expires_at ?? null, booking.confirmed_at ?? null, booking.confirmed_by ?? null,
            booking.source, booking.notes ?? null, booking.room_notes ?? null, ctx.userId, now, now, bookingId, booking.status, toDepartureId, toDepartureId, booking.seats,
          );
  const created = `EXISTS (SELECT 1 FROM seat_bookings WHERE id = '${newId}')`;
  let results: D1Result[];
  try {
    results = await ctx.db.batch([
      insert,
      ctx.db.prepare(`UPDATE seat_passengers SET seat_booking_id = ?, departure_id = ?, pickup_stop_id = NULL, updated_at = ? WHERE seat_booking_id = ? AND ${created}`).bind(newId, toDepartureId, now, bookingId),
      ctx.db
        .prepare(`UPDATE seat_bookings SET status = 'cancelled', cancelled_at = ?, cancel_reason = 'moved', waitlist_position = NULL, updated_at = ? WHERE id = ? AND status = ? AND ${created}`)
        .bind(now, now, bookingId, booking.status),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) throw new DepartureError(409, 'ALREADY_BOOKED', 'This lead already has seats on the target departure');
    throw e;
  }
  if ((results[0].meta?.changes ?? 0) === 0) {
    const fresh = await requireBookingRow(ctx.db, bookingId);
    if (fresh.status !== booking.status) throw new DepartureError(409, 'ILLEGAL_TRANSITION', `A ${fresh.status} booking cannot be moved`, { from: fresh.status });
    const left = await seatsLeft(ctx.db, toDepartureId, target.row.capacity);
    throw new DepartureError(409, 'SEATS_UNAVAILABLE', `Only ${left} seats are left on the target departure`, { seatsLeft: left });
  }

  // The lead now belongs to the target departure; a travel date that was the old start date follows.
  await ctx.db
    .prepare(`UPDATE leads SET departure_id = ?, travel_date = CASE WHEN substr(travel_date, 1, 10) = ? THEN ? ELSE travel_date END, updated_at = ? WHERE id = ?`)
    .bind(toDepartureId, source.row.start_date, target.row.start_date, now, booking.lead_id)
    .run();

  const old = await requireBookingRow(ctx.db, bookingId);
  await emit(ctx, 'seat_booking.cancelled', 'seat_booking', bookingId, bookingPayload(old, { previousStatus: booking.status, reason: 'moved', movedTo: newId }));
  if (booking.status !== 'waitlisted') await runWaitlistStep(ctx, booking.departure_id);
  if (booking.status !== 'waitlisted') await emitCapacityEvents(ctx, target, booking.seats);
  return (await getBookingDetail(ctx.db, newId))!;
}
