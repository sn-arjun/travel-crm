/**
 * Seats of a departure (R139): the summary every list row carries and the rule that capacity never drops below the seats in use.
 * Seat booking behaviour itself (holds, confirm, waitlist) is R143; this file only reads seat_bookings.
 */

import { chunk, DepartureError, placeholders } from './common';

export interface SeatsSummary {
  capacity: number;
  held: number;
  confirmed: number;
  waitlisted: number;
  /** capacity - held - confirmed, never below 0 (a waitlisted party holds nothing). */
  left: number;
}

export function seatsFrom(capacity: number, held: number, confirmed: number, waitlisted: number): SeatsSummary {
  return { capacity, held, confirmed, waitlisted, left: Math.max(0, capacity - held - confirmed) };
}

/** Seats of many departures in one aggregate query per 50 ids (no query per row). */
export async function seatsSummary(db: D1Database, departures: Array<{ id: string; capacity: number }>): Promise<Map<string, SeatsSummary>> {
  const counts = new Map<string, { held: number; confirmed: number; waitlisted: number }>();
  for (const part of chunk(departures.map((d) => d.id))) {
    const { results } = await db
      .prepare(
        `SELECT departure_id, status, COALESCE(SUM(seats), 0) AS seats FROM seat_bookings
         WHERE departure_id IN (${placeholders(part.length)}) AND status IN ('held', 'confirmed', 'waitlisted')
         GROUP BY departure_id, status`,
      )
      .bind(...part)
      .all<{ departure_id: string; status: 'held' | 'confirmed' | 'waitlisted'; seats: number }>();
    for (const r of results ?? []) {
      const entry = counts.get(r.departure_id) ?? { held: 0, confirmed: 0, waitlisted: 0 };
      entry[r.status] = r.seats;
      counts.set(r.departure_id, entry);
    }
  }
  const out = new Map<string, SeatsSummary>();
  for (const d of departures) {
    const c = counts.get(d.id);
    out.set(d.id, seatsFrom(d.capacity, c?.held ?? 0, c?.confirmed ?? 0, c?.waitlisted ?? 0));
  }
  return out;
}

/** Seats held or confirmed on a departure. */
export async function seatsInUse(db: D1Database, departureId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COALESCE(SUM(seats), 0) AS n FROM seat_bookings WHERE departure_id = ? AND status IN ('held', 'confirmed')`)
    .bind(departureId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Throws 409 SEATS_IN_USE when `capacity` would leave fewer seats than held + confirmed. */
export async function assertCapacityAllowed(db: D1Database, departureId: string, capacity: number): Promise<void> {
  const inUse = await seatsInUse(db, departureId);
  if (capacity < inUse) {
    throw new DepartureError(409, 'SEATS_IN_USE', `${inUse} seats are held or confirmed; the capacity cannot go below that`, { seatsInUse: inUse, requested: capacity });
  }
}

/**
 * The statement that sets the capacity only while it stays at or above the seats in use. Putting the condition in the UPDATE
 * keeps the rule true even if a seat is held between the check above and the write.
 */
export function setCapacityStatement(db: D1Database, departureId: string, capacity: number): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE departures SET capacity = ?, updated_at = ? WHERE id = ?
         AND ? >= (SELECT COALESCE(SUM(seats), 0) FROM seat_bookings WHERE departure_id = ? AND status IN ('held', 'confirmed'))`,
    )
    .bind(capacity, new Date().toISOString(), departureId, capacity, departureId);
}

export interface DepartureSummary {
  id: string;
  code: string;
  status: string;
  tourTitle: string;
  startDate: string;
  endDate: string;
  seats: SeatsSummary;
}

/** One departure with its tour title and seats, for the cards on a lead and a quote (R146). Null when it is gone. */
export async function getDepartureSummary(db: D1Database, departureId: string): Promise<DepartureSummary | null> {
  const r = await db
    .prepare(
      `SELECT d.id, d.code, d.status, d.capacity, d.start_date, d.end_date, t.title AS tour_title
       FROM departures d JOIN tours t ON t.id = d.tour_id WHERE d.id = ? AND d.is_deleted = 0`,
    )
    .bind(departureId)
    .first<{ id: string; code: string; status: string; capacity: number; start_date: string; end_date: string; tour_title: string }>();
  if (!r) return null;
  const seats = (await seatsSummary(db, [{ id: r.id, capacity: r.capacity }])).get(r.id)!;
  return { id: r.id, code: r.code, status: r.status, tourTitle: r.tour_title, startDate: r.start_date, endDate: r.end_date, seats };
}
