/**
 * Calendar sync (R139): every departure has one `events` row (event_type trip_departure, related_departure_id) that is created,
 * updated and removed with the departure. The planner reads it like any other event; planner.ts is not touched here.
 */

import { generateId } from '../../utils/uuid';
import { getTenantTimeZone } from '../../utils/tz';
import { chunk, localDateTimeToUtcIso, nowIso, placeholders } from './common';
import { seatsSummary } from './capacity';

type Row = Record<string, any>;

/**
 * Brings the departure's calendar event in line with the departure. A cancelled departure marks the event deleted; any other
 * state creates the event (the first time) or updates it. `actorUserId` owns the event when the departure has no tour leader
 * user and no creator.
 */
export async function syncDepartureEvent(db: D1Database, departureId: string, actorUserId: string): Promise<void> {
  const d = await db
    .prepare(
      `SELECT d.*, t.title AS tour_title, t.destination AS tour_destination
       FROM departures d JOIN tours t ON t.id = d.tour_id WHERE d.id = ?`,
    )
    .bind(departureId)
    .first<Row>();
  if (!d) return;

  const now = nowIso();
  if (d.status === 'cancelled' || d.is_deleted) {
    if (d.calendar_event_id) {
      await db.prepare('UPDATE events SET is_deleted = 1, updated_at = ? WHERE id = ?').bind(now, d.calendar_event_id).run();
    }
    return;
  }

  const tz = await getTenantTimeZone(db);
  const allDay = d.start_time ? 0 : 1;
  const startAt = localDateTimeToUtcIso(tz, d.start_date, d.start_time ?? '00:00');
  const endAt = localDateTimeToUtcIso(tz, d.end_date, '23:59');
  const title = `${d.tour_title} (${d.code})`;
  const owner = d.tour_leader_user_id ?? d.created_by ?? actorUserId;

  const existing = d.calendar_event_id
    ? await db.prepare('SELECT id FROM events WHERE id = ?').bind(d.calendar_event_id).first<{ id: string }>()
    : null;

  if (existing) {
    await db
      .prepare(
        `UPDATE events SET title = ?, description = ?, event_type = 'trip_departure', start_at = ?, end_at = ?, all_day = ?, location = ?,
           timezone = ?, assigned_to = ?, related_departure_id = ?, is_deleted = 0, updated_at = ? WHERE id = ?`,
      )
      .bind(title, d.notes ?? null, startAt, endAt, allDay, d.tour_destination ?? null, tz, owner, departureId, now, existing.id)
      .run();
    return;
  }

  const eventId = generateId();
  await db.batch([
    db
      .prepare(
        `INSERT INTO events (id, title, description, event_type, start_at, end_at, all_day, location, assigned_to, created_by, timezone, related_departure_id)
         VALUES (?, ?, ?, 'trip_departure', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(eventId, title, d.notes ?? null, startAt, endAt, allDay, d.tour_destination ?? null, owner, d.created_by ?? actorUserId, tz, departureId),
    db.prepare('UPDATE departures SET calendar_event_id = ? WHERE id = ?').bind(eventId, departureId),
  ]);
}

/** Marks the calendar event of a departure that is being removed as deleted. */
export async function removeDepartureEvent(db: D1Database, eventId: string | null | undefined): Promise<void> {
  if (!eventId) return;
  await db.prepare('UPDATE events SET is_deleted = 1, updated_at = ? WHERE id = ?').bind(nowIso(), eventId).run();
}

/**
 * Adds `departure: {id, code, status, tourTitle, startDate, seats}` to the calendar events that belong to a departure
 * (related_departure_id), from one aggregate query for all of them (R146). Events of other kinds are left as they are.
 */
export async function attachDepartureSummaries(db: D1Database, events: Array<Record<string, any>>): Promise<void> {
  const ids = [...new Set(events.map((e) => e.related_departure_id).filter((v): v is string => typeof v === 'string' && v !== ''))];
  if (!ids.length) return;
  const rows: Row[] = [];
  for (const part of chunk(ids)) {
    const { results } = await db
      .prepare(
        `SELECT d.id, d.code, d.status, d.capacity, d.start_date, t.title AS tour_title
         FROM departures d JOIN tours t ON t.id = d.tour_id
         WHERE d.id IN (${placeholders(part.length)}) AND d.is_deleted = 0`,
      )
      .bind(...part)
      .all<Row>();
    rows.push(...(results ?? []));
  }
  const seats = await seatsSummary(db, rows.map((r) => ({ id: r.id, capacity: r.capacity })));
  const byId = new Map(rows.map((r) => [r.id as string, { id: r.id, code: r.code, status: r.status, tourTitle: r.tour_title, startDate: r.start_date, seats: seats.get(r.id)! }]));
  for (const e of events) {
    const summary = e.related_departure_id ? byId.get(e.related_departure_id) : undefined;
    if (summary) e.departure = summary;
  }
}
