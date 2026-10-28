/**
 * Coach trips (R145, docs/readiness/TOUR-OPERATOR-DESIGN.md 3.3, 5.3, 6.2): the ordered stops of a trip, the passengers boarding at
 * them, the boarded / no-show tick, the documents-checked mark, the head count, and coach trips made from a departure.
 *
 * Used by the staff routes (/fleet/trips/:id/..., /departures/:id/trips) and the driver routes (/driver/trips/:id/...). `CoachCtx`
 * says who acts: a staff user or a crew member (driver or tour leader). Refusals are DepartureError, answered by `guarded`.
 *
 * Offline ticks: every tick carries an `opId` (a repeat is ignored) and the app's clock time `at`. Boarding and documents are
 * separate: a tick older than the one last applied to the same part is ignored, so a late offline write never undoes a newer one.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { broadcastToTenant } from '../../utils/realtime';
import { emitEvent } from '../automation/events';
import { getTenantTimeZone } from '../../utils/tz';
import { normalizePhone, tenantPhoneCountry } from '../../utils/phone';
import { chunk, DepartureError, fromBool, localDateTimeToUtcIso, nowIso, placeholders, toBool } from '../departures/common';

type Row = Record<string, any>;

export interface CoachCtx {
  env: Env;
  tenantId: string;
  db: D1Database;
  /** The staff user, when a staff route acts. */
  userId?: string | null;
  /** The crew member (drivers.id), when a driver route acts. */
  driverId?: string | null;
  waiter?: { waitUntil(promise: Promise<unknown>): void };
}

export type StopStatus = 'pending' | 'arrived' | 'departed' | 'skipped';
export type Boarding = 'pending' | 'boarded' | 'no_show';

export interface TripStop {
  id: string;
  tripId: string;
  departureStopId: string | null;
  sortOrder: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  scheduledAt: string | null;
  documentsCheck: boolean;
  status: StopStatus;
  arrivedAt: string | null;
  departedAt: string | null;
  arrivedLat: number | null;
  arrivedLng: number | null;
}

export interface TripPassenger {
  id: string;
  tripId: string;
  tripStopId: string | null;
  seatPassengerId: string | null;
  contactId: string | null;
  name: string;
  phone: string | null;
  seats: number;
  boarding: Boarding;
  boardedAt: string | null;
  documentsChecked: boolean;
  documentsCheckedAt: string | null;
  notes: string | null;
}

export interface StopInput {
  id?: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** UTC instant (with Z or an offset), or a local wall-clock time 'YYYY-MM-DDTHH:MM' read in the agency's zone. */
  scheduledAt?: string | null;
  documentsCheck?: boolean;
}

export interface PassengerInput {
  tripStopId?: string | null;
  name: string;
  phone?: string | null;
  seats?: number;
  contactId?: string | null;
  notes?: string | null;
}

export interface TickInput {
  boarding?: Boarding;
  documentsChecked?: boolean;
  opId: string;
  at?: string;
}

export interface Headcount {
  expected: number;
  boarded: number;
  noShow: number;
  pending: number;
  documentsChecked: number;
  byStop: Array<{ stopId: string | null; name: string | null; sortOrder: number; expected: number; boarded: number; noShow: number; pending: number }>;
}

// ---------------------------------------------------------------- mappers

export function rowToStop(r: Row): TripStop {
  return {
    id: r.id,
    tripId: r.trip_id,
    departureStopId: r.departure_stop_id ?? null,
    sortOrder: r.sort_order,
    name: r.name,
    address: r.address ?? null,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    scheduledAt: r.scheduled_at ?? null,
    documentsCheck: toBool(r.documents_check),
    status: r.status,
    arrivedAt: r.arrived_at ?? null,
    departedAt: r.departed_at ?? null,
    arrivedLat: r.arrived_lat ?? null,
    arrivedLng: r.arrived_lng ?? null,
  };
}

export function rowToPassenger(r: Row): TripPassenger {
  return {
    id: r.id,
    tripId: r.trip_id,
    tripStopId: r.trip_stop_id ?? null,
    seatPassengerId: r.seat_passenger_id ?? null,
    contactId: r.contact_id ?? null,
    name: r.name,
    phone: r.phone ?? null,
    seats: r.seats,
    boarding: r.boarding_status,
    boardedAt: r.boarded_at ?? null,
    documentsChecked: toBool(r.documents_checked),
    documentsCheckedAt: r.documents_checked_at ?? null,
    notes: r.notes ?? null,
  };
}

// ---------------------------------------------------------------- trips and permissions

export async function getTripRow(db: D1Database, tripId: string): Promise<Row | null> {
  return db.prepare('SELECT * FROM trip_assignments WHERE id = ? AND is_deleted = 0').bind(tripId).first<Row>();
}

/** The trip, or 404; a trip that is not a coach trip has no stops or passengers (409). */
export async function requireCoachTrip(db: D1Database, tripId: string): Promise<Row> {
  const trip = await getTripRow(db, tripId);
  if (!trip) throw new DepartureError(404, 'NOT_FOUND', 'Trip not found');
  if (trip.trip_kind !== 'coach') throw new DepartureError(409, 'NOT_COACH_TRIP', 'This trip is not a coach trip');
  return trip;
}

const isClosed = (trip: Row): boolean => trip.status === 'completed' || trip.status === 'cancelled';

function assertOpen(trip: Row): void {
  if (isClosed(trip)) throw new DepartureError(409, 'TRIP_CLOSED', 'The trip is completed or cancelled');
}

/** A UTC ISO string from a client time: an instant is kept, a wall-clock time is read in the agency's zone. */
export function toUtcIso(value: string, timeZone: string): string {
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new DepartureError(400, 'INVALID_TIME', 'The time is not valid', { value });
    return d.toISOString();
  }
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})/);
  if (!m) throw new DepartureError(400, 'INVALID_TIME', 'The time is not valid', { value });
  return localDateTimeToUtcIso(timeZone, m[1], m[2]);
}

// ---------------------------------------------------------------- realtime and events

async function announce(
  ctx: CoachCtx,
  type: 'stop_arrived' | 'stop_departed' | 'passenger_boarded' | 'passenger_no_show' | 'documents_checked' | 'headcount_complete' | 'passenger_reset',
  tripId: string,
  data: Record<string, unknown>,
  domain = true,
): Promise<void> {
  // Ids and counts only: the realtime room reaches every user of the agency, and the event log is exported on erasure.
  await broadcastToTenant(ctx.env, ctx.tenantId, { type: `trip:${type}`, data: { tripId, ...data } });
  if (!domain) return;
  await emitEvent(
    ctx.env,
    ctx.tenantId,
    ctx.db,
    { type: `trip.${type}`, entityType: 'trip', entityId: tripId, payload: { tripId, ...data }, actorId: ctx.userId ?? ctx.driverId ?? null },
    ctx.waiter,
  );
}

// ---------------------------------------------------------------- stops

export async function listStops(db: D1Database, tripId: string): Promise<TripStop[]> {
  const { results } = await db.prepare('SELECT * FROM trip_stops WHERE trip_id = ? ORDER BY sort_order, id').bind(tripId).all<Row>();
  return (results ?? []).map(rowToStop);
}

/**
 * Replaces the ordered stop list of a coach trip. A stop with an id is updated in place (its status and arrival stay), one without is
 * added, one left out is removed; the passengers of a removed stop stay on the trip without a stop.
 */
export async function replaceStops(ctx: CoachCtx, tripId: string, stops: StopInput[]): Promise<TripStop[]> {
  const { db } = ctx;
  const trip = await requireCoachTrip(db, tripId);
  assertOpen(trip);
  const { results } = await db.prepare('SELECT id FROM trip_stops WHERE trip_id = ?').bind(tripId).all<{ id: string }>();
  const existing = new Set((results ?? []).map((r) => r.id));
  const seen = new Set<string>();
  for (const s of stops) {
    if (!s.id) continue;
    if (!existing.has(s.id)) throw new DepartureError(400, 'UNKNOWN_STOP', 'A stop id does not belong to this trip', { id: s.id });
    if (seen.has(s.id)) throw new DepartureError(400, 'DUPLICATE_STOP', 'A stop id appears twice', { id: s.id });
    seen.add(s.id);
  }
  const removed = [...existing].filter((id) => !seen.has(id));
  const tz = await getTenantTimeZone(db);
  const now = nowIso();

  const statements: D1PreparedStatement[] = [];
  for (const part of chunk(removed)) {
    // Detach first: the passengers keep their tick and show up under "no stop".
    statements.push(db.prepare(`UPDATE trip_passengers SET trip_stop_id = NULL, updated_at = ? WHERE trip_stop_id IN (${placeholders(part.length)})`).bind(now, ...part));
    statements.push(db.prepare(`DELETE FROM trip_stops WHERE id IN (${placeholders(part.length)})`).bind(...part));
  }
  stops.forEach((s, i) => {
    const scheduled = s.scheduledAt ? toUtcIso(s.scheduledAt, tz) : null;
    if (s.id) {
      statements.push(
        db
          .prepare(`UPDATE trip_stops SET sort_order = ?, name = ?, address = ?, lat = ?, lng = ?, scheduled_at = ?, documents_check = ?, updated_at = ? WHERE id = ?`)
          .bind(i, s.name, s.address ?? null, s.lat ?? null, s.lng ?? null, scheduled, fromBool(s.documentsCheck), now, s.id),
      );
    } else {
      statements.push(
        db
          .prepare(
            `INSERT INTO trip_stops (id, trip_id, sort_order, name, address, lat, lng, scheduled_at, documents_check, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          )
          .bind(generateId(), tripId, i, s.name, s.address ?? null, s.lat ?? null, s.lng ?? null, scheduled, fromBool(s.documentsCheck), now, now),
      );
    }
  });
  for (const part of chunk(statements, 80)) await db.batch(part);
  return listStops(db, tripId);
}

/** Marks a stop arrived or departed. Repeating the same call changes nothing. */
export async function setStopStatus(
  ctx: CoachCtx,
  tripId: string,
  stopId: string,
  action: 'arrive' | 'depart',
  where?: { lat?: number | null; lng?: number | null },
): Promise<TripStop> {
  const { db } = ctx;
  const trip = await requireCoachTrip(db, tripId);
  assertOpen(trip);
  const stop = await db.prepare('SELECT * FROM trip_stops WHERE id = ? AND trip_id = ?').bind(stopId, tripId).first<Row>();
  if (!stop) throw new DepartureError(404, 'NOT_FOUND', 'Stop not found');
  const now = nowIso();
  if (action === 'arrive') {
    if (stop.status === 'arrived' || stop.status === 'departed') return rowToStop(stop);
    await db
      .prepare(`UPDATE trip_stops SET status = 'arrived', arrived_at = ?, arrived_lat = ?, arrived_lng = ?, updated_at = ? WHERE id = ?`)
      .bind(now, where?.lat ?? null, where?.lng ?? null, now, stopId)
      .run();
    await announce(ctx, 'stop_arrived', tripId, { stopId, at: now });
  } else {
    if (stop.status === 'departed') return rowToStop(stop);
    // Leaving a stop never reached still records the time; the arrival is kept as missing.
    await db.prepare(`UPDATE trip_stops SET status = 'departed', departed_at = ?, updated_at = ? WHERE id = ?`).bind(now, now, stopId).run();
    await announce(ctx, 'stop_departed', tripId, { stopId, at: now }, false);
  }
  return rowToStop((await db.prepare('SELECT * FROM trip_stops WHERE id = ?').bind(stopId).first<Row>())!);
}

// ---------------------------------------------------------------- passengers

export async function listPassengersFlat(db: D1Database, tripId: string): Promise<TripPassenger[]> {
  const { results } = await db
    .prepare(
      `SELECT tp.* FROM trip_passengers tp LEFT JOIN trip_stops ts ON ts.id = tp.trip_stop_id
       WHERE tp.trip_id = ? ORDER BY COALESCE(ts.sort_order, 1000000), tp.name COLLATE NOCASE, tp.id`,
    )
    .bind(tripId)
    .all<Row>();
  return (results ?? []).map(rowToPassenger);
}

/** Passengers grouped by stop, in stop order; those without a stop come last. */
export async function listPassengersGrouped(db: D1Database, tripId: string) {
  const [stops, passengers] = await Promise.all([listStops(db, tripId), listPassengersFlat(db, tripId)]);
  const byStop = new Map<string, TripPassenger[]>();
  const unassigned: TripPassenger[] = [];
  for (const p of passengers) {
    if (p.tripStopId && stops.some((s) => s.id === p.tripStopId)) {
      const list = byStop.get(p.tripStopId) ?? [];
      list.push(p);
      byStop.set(p.tripStopId, list);
    } else unassigned.push(p);
  }
  return { stops: stops.map((s) => ({ ...s, passengers: byStop.get(s.id) ?? [] })), unassigned };
}

export async function addPassenger(ctx: CoachCtx, tripId: string, input: PassengerInput): Promise<TripPassenger> {
  const { db } = ctx;
  const trip = await requireCoachTrip(db, tripId);
  assertOpen(trip);
  if (input.tripStopId && !(await db.prepare('SELECT id FROM trip_stops WHERE id = ? AND trip_id = ?').bind(input.tripStopId, tripId).first())) {
    throw new DepartureError(400, 'UNKNOWN_STOP', 'The stop does not belong to this trip', { id: input.tripStopId });
  }
  let contactId: string | null = null;
  if (input.contactId) {
    if (!(await db.prepare('SELECT id FROM contacts WHERE id = ? AND is_deleted = 0').bind(input.contactId).first())) {
      throw new DepartureError(400, 'NOT_FOUND_REFERENCE', 'The contact was not found', { id: input.contactId });
    }
    contactId = input.contactId;
  }
  const phone = input.phone ? normalizePhone(input.phone, await tenantPhoneCountry(db)) || input.phone : null;
  const id = generateId();
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO trip_passengers (id, trip_id, trip_stop_id, contact_id, name, phone, seats, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, tripId, input.tripStopId ?? null, contactId, input.name, phone, input.seats ?? 1, input.notes ?? null, now, now)
    .run();
  await broadcastToTenant(ctx.env, ctx.tenantId, { type: 'trip:passenger_added', data: { tripId, passengerId: id } });
  return rowToPassenger((await db.prepare('SELECT * FROM trip_passengers WHERE id = ?').bind(id).first<Row>())!);
}

export async function removePassenger(ctx: CoachCtx, tripId: string, passengerId: string): Promise<void> {
  const trip = await requireCoachTrip(ctx.db, tripId);
  assertOpen(trip);
  const res = await ctx.db.prepare('DELETE FROM trip_passengers WHERE id = ? AND trip_id = ?').bind(passengerId, tripId).run();
  if (!res.meta.changes) throw new DepartureError(404, 'NOT_FOUND', 'Passenger not found');
  await broadcastToTenant(ctx.env, ctx.tenantId, { type: 'trip:passenger_removed', data: { tripId, passengerId } });
}

export interface TickResult {
  passenger: TripPassenger;
  /** False when nothing changed: a repeated opId, or a tick older than the one already applied. */
  applied: boolean;
  duplicate: boolean;
  stale: boolean;
}

/** Ticks one passenger: boarded / no-show / pending, and the documents-checked mark. */
export async function tickPassenger(ctx: CoachCtx, tripId: string, passengerId: string, input: TickInput): Promise<TickResult> {
  const { db } = ctx;
  const trip = await requireCoachTrip(db, tripId);
  const before = await db.prepare('SELECT * FROM trip_passengers WHERE id = ? AND trip_id = ?').bind(passengerId, tripId).first<Row>();
  if (!before) throw new DepartureError(404, 'NOT_FOUND', 'Passenger not found');

  if (before.last_op_id && before.last_op_id === input.opId) {
    return { passenger: rowToPassenger(before), applied: false, duplicate: true, stale: false };
  }
  assertOpen(trip);

  const atDate = input.at ? new Date(input.at) : new Date();
  if (Number.isNaN(atDate.getTime())) throw new DepartureError(400, 'INVALID_TIME', 'The time is not valid', { value: input.at });
  const at = atDate.toISOString();
  const now = nowIso();
  const byDriver = ctx.driverId ?? null;
  const byUser = ctx.userId ?? null;

  const statements: D1PreparedStatement[] = [];
  // Each part is applied only if no newer tick reached it first: the condition is in the statement itself.
  if (input.boarding !== undefined) {
    statements.push(
      db
        .prepare(
          `UPDATE trip_passengers SET boarding_status = ?, boarded_at = ?, marked_by_driver_id = ?, marked_by_user_id = ?, boarding_op_at = ?, last_op_id = ?, updated_at = ?
           WHERE id = ? AND (boarding_op_at IS NULL OR boarding_op_at <= ?)`,
        )
        .bind(input.boarding, input.boarding === 'boarded' ? at : null, byDriver, byUser, at, input.opId, now, passengerId, at),
    );
  }
  if (input.documentsChecked !== undefined) {
    statements.push(
      db
        .prepare(
          `UPDATE trip_passengers SET documents_checked = ?, documents_checked_at = ?, documents_op_at = ?, last_op_id = ?, updated_at = ?
           WHERE id = ? AND (documents_op_at IS NULL OR documents_op_at <= ?)`,
        )
        .bind(fromBool(input.documentsChecked), input.documentsChecked ? at : null, at, input.opId, now, passengerId, at),
    );
  }
  if (!statements.length) {
    return { passenger: rowToPassenger(before), applied: false, duplicate: false, stale: false };
  }
  const results = await db.batch(statements);
  let index = 0;
  const boardingApplied = input.boarding !== undefined ? (results[index++].meta.changes ?? 0) > 0 : false;
  const documentsApplied = input.documentsChecked !== undefined ? (results[index++].meta.changes ?? 0) > 0 : false;
  const applied = boardingApplied || documentsApplied;

  if (documentsApplied && before.seat_passenger_id) await mirrorDocuments(db, before.seat_passenger_id, input.documentsChecked!, at, byDriver, byUser);

  const after = (await db.prepare('SELECT * FROM trip_passengers WHERE id = ?').bind(passengerId).first<Row>())!;
  if (applied) {
    const base = { passengerId, stopId: before.trip_stop_id ?? null, at };
    if (boardingApplied && before.boarding_status !== input.boarding) {
      if (input.boarding === 'boarded') await announce(ctx, 'passenger_boarded', tripId, base);
      else if (input.boarding === 'no_show') await announce(ctx, 'passenger_no_show', tripId, base);
      else await announce(ctx, 'passenger_reset', tripId, base, false);
      // Every passenger expected at the stop is now marked.
      if (before.trip_stop_id && before.boarding_status === 'pending' && input.boarding !== 'pending') {
        const left = await db
          .prepare(`SELECT COUNT(*) AS n FROM trip_passengers WHERE trip_stop_id = ? AND boarding_status = 'pending'`)
          .bind(before.trip_stop_id)
          .first<{ n: number }>();
        if ((left?.n ?? 0) === 0) await announce(ctx, 'headcount_complete', tripId, { stopId: before.trip_stop_id, at });
      }
    }
    if (documentsApplied && toBool(before.documents_checked) !== input.documentsChecked) {
      if (input.documentsChecked) await announce(ctx, 'documents_checked', tripId, base);
      else await announce(ctx, 'documents_checked', tripId, { ...base, checked: false }, false);
    }
  }
  const stale = !applied;
  return { passenger: rowToPassenger(after), applied, duplicate: false, stale };
}

/** "Documents checked" on a trip passenger from a manifest row is the manifest's documents status too (design 3.3). */
async function mirrorDocuments(db: D1Database, seatPassengerId: string, checked: boolean, at: string, driverId: string | null, userId: string | null): Promise<void> {
  const now = nowIso();
  if (checked) {
    await db
      .prepare(
        `UPDATE seat_passengers SET documents_status = 'checked', documents_checked_at = ?, documents_checked_by_driver_id = ?, documents_checked_by_user_id = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(at, driverId, userId, now, seatPassengerId)
      .run();
  } else {
    // Taking the tick back returns a checked passenger to "provided"; other statuses stay as they are.
    await db
      .prepare(
        `UPDATE seat_passengers SET documents_status = 'provided', documents_checked_at = NULL, documents_checked_by_driver_id = NULL, documents_checked_by_user_id = NULL, updated_at = ?
         WHERE id = ? AND documents_status = 'checked'`,
      )
      .bind(now, seatPassengerId)
      .run();
  }
}

// ---------------------------------------------------------------- head count

export async function headcountOf(db: D1Database, tripId: string): Promise<Headcount> {
  const [stops, rows] = await Promise.all([
    listStops(db, tripId),
    db
      .prepare(
        `SELECT trip_stop_id, boarding_status, COALESCE(SUM(seats), 0) AS seats, SUM(documents_checked) AS docs
         FROM trip_passengers WHERE trip_id = ? GROUP BY trip_stop_id, boarding_status`,
      )
      .bind(tripId)
      .all<Row>(),
  ]);
  const empty = () => ({ expected: 0, boarded: 0, noShow: 0, pending: 0 });
  const per = new Map<string | null, ReturnType<typeof empty>>();
  const total = { ...empty(), documentsChecked: 0 };
  const stopIds = new Set(stops.map((s) => s.id));
  for (const r of rows.results ?? []) {
    const key = r.trip_stop_id && stopIds.has(r.trip_stop_id) ? (r.trip_stop_id as string) : null;
    const slot = per.get(key) ?? empty();
    const n = Number(r.seats);
    slot.expected += n;
    total.expected += n;
    if (r.boarding_status === 'boarded') { slot.boarded += n; total.boarded += n; }
    else if (r.boarding_status === 'no_show') { slot.noShow += n; total.noShow += n; }
    else { slot.pending += n; total.pending += n; }
    total.documentsChecked += Number(r.docs ?? 0);
    per.set(key, slot);
  }
  const byStop: Headcount['byStop'] = stops.map((s) => ({ stopId: s.id, name: s.name, sortOrder: s.sortOrder, ...(per.get(s.id) ?? empty()) }));
  if (per.has(null)) byStop.push({ stopId: null, name: null, sortOrder: stops.length, ...per.get(null)! });
  return { ...total, byStop };
}

/** The head count of every coach trip of a departure, and their sum. */
export async function departureHeadcount(db: D1Database, departureId: string) {
  const { results } = await db
    .prepare(`SELECT id, vehicle_id, status FROM trip_assignments WHERE departure_id = ? AND is_deleted = 0 AND trip_kind = 'coach' ORDER BY created_at, id`)
    .bind(departureId)
    .all<Row>();
  const trips = [];
  const sum = { expected: 0, boarded: 0, noShow: 0, pending: 0, documentsChecked: 0 };
  for (const t of results ?? []) {
    const h = await headcountOf(db, t.id);
    trips.push({ tripId: t.id, vehicleId: t.vehicle_id ?? null, status: t.status, ...h });
    sum.expected += h.expected;
    sum.boarded += h.boarded;
    sum.noShow += h.noShow;
    sum.pending += h.pending;
    sum.documentsChecked += h.documentsChecked;
  }
  return { departureId, ...sum, trips };
}

// ---------------------------------------------------------------- trips from a departure

export interface FromDepartureResult {
  created: boolean;
  tripIds: string[];
}

/** True when a trip already has a tick (boarding, documents or a stop reached): it cannot be rebuilt without losing them. */
async function hasTicks(db: D1Database, tripId: string): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM trip_passengers WHERE trip_id = ?1 AND (boarding_status != 'pending' OR documents_checked = 1)) +
         (SELECT COUNT(*) FROM trip_stops WHERE trip_id = ?1 AND status != 'pending') AS n`,
    )
    .bind(tripId)
    .first<{ n: number }>();
  return (row?.n ?? 0) > 0;
}

/**
 * One coach trip per departure vehicle (one when it has none): stops copied from the departure's stops, passengers copied from its
 * active seat passengers by pickup stop, the driver of the vehicle and the departure's tour leader. A second call returns the
 * trips that exist; with `replace`, trips without ticks are rebuilt (a trip with ticks refuses, 409 TRIP_HAS_TICKS).
 */
export async function createTripsFromDeparture(
  ctx: CoachCtx,
  departureId: string,
  opts: { replace?: boolean } = {},
): Promise<FromDepartureResult> {
  const { db } = ctx;
  const dep = await db.prepare('SELECT * FROM departures WHERE id = ? AND is_deleted = 0').bind(departureId).first<Row>();
  if (!dep) throw new DepartureError(404, 'NOT_FOUND', 'Departure not found');
  if (dep.status === 'cancelled') throw new DepartureError(409, 'DEPARTURE_CANCELLED', 'The departure is cancelled');

  const existing = ((await db.prepare(`SELECT id FROM trip_assignments WHERE departure_id = ? AND is_deleted = 0 AND trip_kind = 'coach' ORDER BY created_at, id`).bind(departureId).all<{ id: string }>()).results ?? []).map((r) => r.id);
  if (existing.length && !opts.replace) return { created: false, tripIds: existing };
  if (existing.length) {
    for (const id of existing) {
      if (await hasTicks(db, id)) throw new DepartureError(409, 'TRIP_HAS_TICKS', 'A trip of this departure already has boarding ticks and cannot be rebuilt', { tripId: id });
    }
    const now = nowIso();
    await db.batch(existing.map((id) => db.prepare('UPDATE trip_assignments SET is_deleted = 1, updated_at = ? WHERE id = ?').bind(now, id)));
  }

  const tz = await getTenantTimeZone(db);
  const [vehicles, depStops, passengers] = await Promise.all([
    db.prepare('SELECT * FROM departure_vehicles WHERE departure_id = ? ORDER BY sort_order, id').bind(departureId).all<Row>(),
    db.prepare('SELECT * FROM departure_stops WHERE departure_id = ? ORDER BY sort_order, id').bind(departureId).all<Row>(),
    db
      .prepare(
        `SELECT sp.id, sp.first_name, sp.last_name, sp.pickup_stop_id, sp.documents_status, sb.contact_id, c.phone AS contact_phone
         FROM seat_passengers sp
         JOIN seat_bookings sb ON sb.id = sp.seat_booking_id
         LEFT JOIN contacts c ON c.id = sb.contact_id
         WHERE sp.departure_id = ? AND sp.status = 'active' AND sb.status IN ('held', 'confirmed')
         ORDER BY sb.created_at, sb.id, sp.created_at, sp.id`,
      )
      .bind(departureId)
      .all<Row>(),
  ]);
  const vehicleRows = vehicles.results ?? [];
  const stopRows = depStops.results ?? [];
  const paxRows = passengers.results ?? [];

  // The tour leader: the departure's crew member, or the crew member linked to its tour leader user.
  let tourLeaderId: string | null = dep.tour_leader_driver_id ?? null;
  if (!tourLeaderId && dep.tour_leader_user_id) {
    const linked = await db.prepare('SELECT id FROM drivers WHERE user_id = ? AND is_deleted = 0 ORDER BY created_at LIMIT 1').bind(dep.tour_leader_user_id).first<{ id: string }>();
    tourLeaderId = linked?.id ?? null;
  }

  // A manifest row has no coach of its own yet: coaches are filled in order, each up to its capacity, the last one takes the rest.
  const slots: Array<{ vehicle: Row | null; people: Row[] }> = (vehicleRows.length ? vehicleRows : [null]).map((v) => ({ vehicle: v, people: [] }));
  let slot = 0;
  for (const p of paxRows) {
    while (slot < slots.length - 1 && slots[slot].vehicle && slots[slot].people.length >= (slots[slot].vehicle!.capacity || Infinity)) slot += 1;
    slots[slot].people.push(p);
  }

  const startTime = dep.start_time as string | null;
  const startsAt = localDateTimeToUtcIso(tz, dep.start_date, startTime);
  const endsAt = localDateTimeToUtcIso(tz, dep.end_date, '23:59');
  const tourTitle = ((await db.prepare('SELECT title FROM tours WHERE id = ?').bind(dep.tour_id).first<{ title: string }>()))?.title ?? dep.code;
  const firstStop = stopRows[0];
  const lastStop = stopRows[stopRows.length - 1];
  const tripIds: string[] = [];

  for (const { vehicle, people } of slots) {
    const tripId = generateId();
    const now = nowIso();
    const pickupAt = (firstStop?.scheduled_at as string | null) ?? startsAt;
    const label = vehicle?.label ? ` (${vehicle.label})` : '';
    const statements: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO trip_assignments (id, tenant_id, vehicle_id, driver_id, tour_leader_id, departure_id, trip_kind, pickup_location, drop_location,
             pickup_datetime, drop_datetime, status, passenger_name, assigned_by, trip_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'coach', ?, ?, ?, ?, 'assigned', ?, ?, 'outstation', ?, ?)`,
        )
        .bind(
          tripId, ctx.tenantId, vehicle?.vehicle_id ?? null, vehicle?.driver_id ?? null, tourLeaderId, departureId,
          firstStop?.name ?? null, lastStop?.name ?? null, pickupAt, endsAt, `${tourTitle} ${dep.code}${label}`, ctx.userId ?? null, now, now,
        ),
      db
        .prepare(`INSERT INTO trip_timeline (id, trip_id, status, changed_by, notes, created_at) VALUES (?, ?, 'assigned', ?, ?, ?)`)
        .bind(generateId(), tripId, ctx.userId ?? null, `Coach trip created from departure ${dep.code}`, now),
    ];
    const tripStopOf = new Map<string, string>();
    stopRows.forEach((s, i) => {
      const id = generateId();
      tripStopOf.set(s.id, id);
      statements.push(
        db
          .prepare(
            `INSERT INTO trip_stops (id, trip_id, departure_stop_id, sort_order, name, address, lat, lng, scheduled_at, documents_check, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
          )
          .bind(id, tripId, s.id, i, s.name, s.address ?? null, s.lat ?? null, s.lng ?? null, s.scheduled_at ?? null, s.documents_check ?? 0, now, now),
      );
    });
    for (const p of people) {
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || '-';
      statements.push(
        db
          .prepare(
            `INSERT INTO trip_passengers (id, trip_id, trip_stop_id, seat_passenger_id, contact_id, name, phone, seats, documents_checked, documents_checked_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
          )
          .bind(
            generateId(), tripId, p.pickup_stop_id ? (tripStopOf.get(p.pickup_stop_id) ?? null) : null, p.id, p.contact_id ?? null, name, p.contact_phone ?? null,
            p.documents_status === 'checked' ? 1 : 0, p.documents_status === 'checked' ? now : null, now, now,
          ),
      );
    }
    // The first batch holds the trip, so a failure leaves no half-built trip behind; the children follow the parent in order.
    for (const part of chunk(statements, 80)) await db.batch(part);
    tripIds.push(tripId);
  }
  return { created: true, tripIds };
}
