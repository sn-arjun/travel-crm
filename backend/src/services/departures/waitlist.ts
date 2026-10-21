/**
 * Waitlist, hold expiry and the departure lifecycle (R143, design 5.1 and 5.2).
 *
 * - After seats are freed the waitlist step offers them: in `auto_hold` mode the first waitlisted parties that fit are held at once
 *   (event waitlist.offered); in `suggest` mode nothing is changed here, the recipe departures.waitlist_offer proposes it to staff
 *   from the same list (`nextFittingWaitlist`).
 * - Held bookings past hold_expires_at expire in the 5-minute job departures.expire-holds.
 * - The local-day job departures.lifecycle closes, departs and completes departures by their dates.
 */

import type { Env } from '../../types';
import { localDateString, getTenantTimeZone } from '../../utils/tz';
import { DepartureError } from './common';
import { changeDepartureStatus, type DepartureStatus } from './departures';
import {
  addHoursIso, bookingPayload, cancelPassengersStatement, emit, emitCapacityEvents, fitsSql, loadDepartureContext, nowOf, requireBookingRow,
  seatsLeft, type SeatCtx,
} from './seat-support';

type Row = Record<string, any>;

const OPEN_STATES = ['open', 'closed'];

/** Offers a waitlisted booking its seats: it becomes held with offered_at and a hold of offerHoldHours. 409 when the seats are not free. */
export async function offerBooking(ctx: SeatCtx, bookingId: string): Promise<Row> {
  const booking = await requireBookingRow(ctx.db, bookingId);
  if (booking.status !== 'waitlisted') {
    throw new DepartureError(409, 'ILLEGAL_TRANSITION', `A ${booking.status} booking cannot be offered seats`, { from: booking.status, to: 'held' });
  }
  const dep = await loadDepartureContext(ctx.db, booking.departure_id);
  if (!OPEN_STATES.includes(dep.row.status)) {
    throw new DepartureError(409, 'DEPARTURE_NOT_OPEN', `The departure is ${dep.row.status}`, { status: dep.row.status });
  }
  const now = nowOf(ctx);
  const until = addHoursIso(now, dep.settings.waitlist.offerHoldHours);
  const res = await ctx.db
    .prepare(
      `UPDATE seat_bookings SET status = 'held', offered_at = ?, hold_expires_at = ?, waitlist_position = NULL, updated_at = ?
       WHERE id = ? AND status = 'waitlisted' AND ${fitsSql({ departureExpr: 'seat_bookings.departure_id', seatsExpr: 'seat_bookings.seats' })}`,
    )
    .bind(now.toISOString(), until, now.toISOString(), bookingId)
    .run();
  if ((res.meta?.changes ?? 0) === 0) {
    const fresh = await requireBookingRow(ctx.db, bookingId);
    if (fresh.status !== 'waitlisted') throw new DepartureError(409, 'ILLEGAL_TRANSITION', `A ${fresh.status} booking cannot be offered seats`, { from: fresh.status, to: 'held' });
    const left = await seatsLeft(ctx.db, dep.row.id, dep.row.capacity);
    throw new DepartureError(409, 'SEATS_UNAVAILABLE', `Only ${left} seats are free`, { seatsLeft: left });
  }
  const held = await requireBookingRow(ctx.db, bookingId);
  await emit(ctx, 'waitlist.offered', 'seat_booking', bookingId, bookingPayload(held, { offeredUntil: until, departureCode: dep.row.code }));
  await emitCapacityEvents(ctx, dep, held.seats);
  return held;
}

/** Waitlisted bookings that fit the free seats, in waitlist order (a party that does not fit is skipped, the next one may). */
export async function nextFittingWaitlist(db: D1Database, departureId: string): Promise<Row[]> {
  let dep;
  try {
    dep = await loadDepartureContext(db, departureId);
  } catch {
    return [];
  }
  if (!dep.settings.waitlist.enabled || !OPEN_STATES.includes(dep.row.status)) return [];
  let left = await seatsLeft(db, departureId, dep.row.capacity);
  if (left <= 0) return [];
  const { results } = await db
    .prepare(`SELECT * FROM seat_bookings WHERE departure_id = ? AND status = 'waitlisted' ORDER BY COALESCE(waitlist_position, 1000000), created_at, id`)
    .bind(departureId)
    .all<Row>();
  const fit: Row[] = [];
  for (const b of results ?? []) {
    if (b.seats <= left) {
      fit.push(b);
      left -= b.seats;
    }
  }
  return fit;
}

/**
 * Runs after seats were freed (cancel, expiry, seats reduced, capacity raised). In auto_hold mode the next fitting parties are held
 * and told through the waitlist.offered event; in suggest mode this does nothing, staff get the suggestion from the recipe.
 */
export async function runWaitlistStep(ctx: SeatCtx, departureId: string): Promise<string[]> {
  let dep;
  try {
    dep = await loadDepartureContext(ctx.db, departureId);
  } catch {
    return [];
  }
  if (!dep.settings.waitlist.enabled || dep.settings.waitlist.offerMode !== 'auto_hold') return [];
  const offered: string[] = [];
  for (const b of await nextFittingWaitlist(ctx.db, departureId)) {
    try {
      await offerBooking(ctx, b.id);
      offered.push(b.id);
    } catch (e) {
      if (!(e instanceof DepartureError)) throw e; // seats taken by someone else meanwhile: leave the party on the list
    }
  }
  return offered;
}

// ---------------------------------------------------------------- expiry

/** Expires one held booking whose hold has run out. False when it is not (or no longer) an expired hold. */
export async function expireBooking(ctx: SeatCtx, bookingId: string): Promise<boolean> {
  const now = nowOf(ctx).toISOString();
  const res = await ctx.db
    .prepare(`UPDATE seat_bookings SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'held' AND hold_expires_at IS NOT NULL AND hold_expires_at <= ?`)
    .bind(now, bookingId, now)
    .run();
  if ((res.meta?.changes ?? 0) === 0) return false;
  await cancelPassengersStatement(ctx.db, bookingId).run();
  const row = await requireBookingRow(ctx.db, bookingId);
  await emit(ctx, 'seat_booking.expired', 'seat_booking', bookingId, bookingPayload(row));
  await runWaitlistStep(ctx, row.departure_id);
  return true;
}

/** The job departures.expire-holds: every held booking past its hold expires, then the waitlist gets the freed seats. Returns how many expired. */
export async function expireHoldsForTenant(env: Env, tenantId: string, db: D1Database, now: Date = new Date()): Promise<number> {
  const { results } = await db
    .prepare(`SELECT id FROM seat_bookings WHERE status = 'held' AND hold_expires_at IS NOT NULL AND hold_expires_at <= ? ORDER BY hold_expires_at LIMIT 200`)
    .bind(now.toISOString())
    .all<{ id: string }>();
  let expired = 0;
  for (const r of results ?? []) {
    if (await expireBooking({ env, tenantId, db, userId: null, now }, r.id)) expired += 1;
  }
  return expired;
}

// ---------------------------------------------------------------- lifecycle

const PATH: DepartureStatus[] = ['open', 'closed', 'departed', 'completed'];

/**
 * The status a departure should have today: closed from its booking cut-off date, departed from its start date, completed the day
 * after its end date. Draft and cancelled departures are left alone. Returns the status it should be, or null for "leave it".
 */
export function lifecycleTarget(d: { status: string; start_date: string; end_date: string; booking_cutoff_date: string | null }, today: string): DepartureStatus | null {
  if (!PATH.includes(d.status as DepartureStatus)) return null;
  let target: DepartureStatus = d.status as DepartureStatus;
  const wanted: DepartureStatus | null =
    d.end_date < today ? 'completed' : d.start_date <= today ? 'departed' : d.booking_cutoff_date && d.booking_cutoff_date <= today ? 'closed' : null;
  if (wanted && PATH.indexOf(wanted) > PATH.indexOf(target)) target = wanted;
  return target === d.status ? null : target;
}

/** The job departures.lifecycle (once per local day). Returns how many status changes it made. */
export async function runDepartureLifecycle(env: Env, tenantId: string, db: D1Database, now: Date = new Date()): Promise<number> {
  const today = localDateString(await getTenantTimeZone(db), now);
  const { results } = await db
    .prepare(
      `SELECT id, status, start_date, end_date, booking_cutoff_date, created_by FROM departures
       WHERE is_deleted = 0 AND status IN ('open', 'closed', 'departed')
         AND (end_date < ? OR start_date <= ? OR (booking_cutoff_date IS NOT NULL AND booking_cutoff_date <= ?))
       ORDER BY start_date LIMIT 500`,
    )
    .bind(today, today, today)
    .all<Row>();
  let changes = 0;
  const ctx: SeatCtx = { env, tenantId, db, userId: null, now };
  for (const d of results ?? []) {
    const target = lifecycleTarget(d as any, today);
    if (!target) continue;
    let from = d.status as DepartureStatus;
    for (const step of PATH.slice(PATH.indexOf(from) + 1, PATH.indexOf(target) + 1)) {
      await changeDepartureStatus(db, d.id, step, undefined, d.created_by ?? 'system');
      await emit(ctx, 'departure.status_changed', 'departure', d.id, { departureId: d.id, from, to: step, automatic: true });
      from = step;
      changes += 1;
    }
  }
  return changes;
}
