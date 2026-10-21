/**
 * Shared pieces of the seat booking services (R143): the context every operation runs in, event emission, the departure with
 * the settings that apply to it, the capacity condition in SQL, and the row mappers. No service in this folder imports a
 * sibling that imports it back: seats.ts uses waitlist.ts and passengers.ts, and both use this file.
 */

import type { Context } from 'hono';
import type { AppContext, Env } from '../../types';
import { emitEvent, requestDepth } from '../automation/events';
import { DepartureError, nowIso, parseJson } from './common';
import { getDepartureRow } from './departures';
import { getTourRow } from './tours';
import {
  effectiveSettings, getGroupToursSettings, type GroupToursSettings, type PassengerFieldDef, type RoomTypeDef,
} from './settings';
import { seatsInUse } from './capacity';

type Row = Record<string, any>;

export type SeatBookingStatus = 'held' | 'confirmed' | 'waitlisted' | 'cancelled' | 'expired';
export type SeatBookingSource = 'staff' | 'public_page' | 'quote_accept' | 'assistant' | 'import';

/** Everything an operation needs besides its own arguments. `now` is for tests and the cron; `waiter` defers automations past the response. */
export interface SeatCtx {
  env: Env;
  tenantId: string;
  db: D1Database;
  userId: string | null;
  depth?: number;
  waiter?: { waitUntil(promise: Promise<unknown>): void };
  now?: Date;
}

export const nowOf = (ctx: SeatCtx): Date => ctx.now ?? new Date();

export const addHoursIso = (from: Date, hours: number): string => new Date(from.getTime() + hours * 3_600_000).toISOString();

export async function emit(ctx: SeatCtx, type: string, entityType: string, entityId: string, payload: Record<string, unknown>): Promise<void> {
  await emitEvent(ctx.env, ctx.tenantId, ctx.db, { type, entityType, entityId, payload, actorId: ctx.userId, depth: ctx.depth ?? 0 }, ctx.waiter);
}

export interface DepartureContext {
  row: Row;
  tour: Row;
  settings: GroupToursSettings;
  effective: ReturnType<typeof effectiveSettings> & { passengerFields: PassengerFieldDef[]; roomTypes: RoomTypeDef[] };
}

/** The departure, its tour and the settings that apply to it (departure, then tour, then agency). Throws 404. */
export async function loadDepartureContext(db: D1Database, departureId: string): Promise<DepartureContext> {
  const row = await getDepartureRow(db, departureId);
  if (!row) throw new DepartureError(404, 'NOT_FOUND', 'Departure not found');
  const [tour, settings] = await Promise.all([getTourRow(db, row.tour_id), getGroupToursSettings(db)]);
  if (!tour) throw new DepartureError(404, 'TOUR_NOT_FOUND', 'Tour not found');
  const effective = effectiveSettings(
    {
      holdExpiryHours: row.hold_expiry_hours, confirmMode: row.confirm_mode, showSeatsLeft: row.show_seats_left,
    },
    {
      holdExpiryHours: tour.hold_expiry_hours, confirmMode: tour.confirm_mode, bookingCutoffDays: tour.booking_cutoff_days,
      extrasCutoffDays: tour.extras_cutoff_days, depositType: tour.deposit_type, depositValue: tour.deposit_value,
      passengerFields: parseJson<PassengerFieldDef[] | null>(tour.passenger_fields, null),
      roomTypes: parseJson<RoomTypeDef[] | null>(tour.room_types, null),
    },
    settings,
  );
  return { row, tour, settings, effective };
}

export async function seatsLeft(db: D1Database, departureId: string, capacity: number): Promise<number> {
  return Math.max(0, capacity - (await seatsInUse(db, departureId)));
}

/**
 * The capacity rule as SQL. `seatsExpr` is the number of seats the statement wants to add to its departure and `excludeSelf`
 * leaves the booking's own seats out of the sum (UPDATE of an existing booking). Written in the statement itself, so two
 * concurrent requests can never both pass it.
 */
export const fitsSql = (opts: { departureExpr: string; seatsExpr: string; excludeSelfId?: string }): string =>
  `(SELECT d.capacity FROM departures d WHERE d.id = ${opts.departureExpr})
   - (SELECT COALESCE(SUM(sb.seats), 0) FROM seat_bookings sb WHERE sb.departure_id = ${opts.departureExpr} AND sb.status IN ('held', 'confirmed')${
     opts.excludeSelfId ? ` AND sb.id != ${opts.excludeSelfId}` : ''
   }) >= ${opts.seatsExpr}`;

/**
 * Fires departure.seats_low and departure.full on the transition only: the seats left crossed the line with the seats this
 * operation just took (`added`). Reads the figure after the write, so a burst of parallel holds may report a crossing twice.
 */
export async function emitCapacityEvents(ctx: SeatCtx, dep: DepartureContext, added: number): Promise<void> {
  if (added <= 0) return;
  const left = await seatsLeft(ctx.db, dep.row.id, dep.row.capacity);
  const before = left + added;
  const payload = { departureId: dep.row.id, tourId: dep.row.tour_id, code: dep.row.code, startDate: dep.row.start_date, left, capacity: dep.row.capacity, threshold: dep.settings.seatsLeftThreshold };
  if (left <= dep.settings.seatsLeftThreshold && before > dep.settings.seatsLeftThreshold) await emit(ctx, 'departure.seats_low', 'departure', dep.row.id, payload);
  if (left === 0 && before > 0) await emit(ctx, 'departure.full', 'departure', dep.row.id, payload);
}

// ---------------------------------------------------------------- shapes

export interface SeatBookingDto {
  id: string;
  departureId: string;
  leadId: string;
  contactId: string;
  itineraryId: string | null;
  invoiceId: string | null;
  status: SeatBookingStatus;
  seats: number;
  holdExpiresAt: string | null;
  waitlistPosition: number | null;
  offeredAt: string | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  source: SeatBookingSource;
  roomNotes: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  contactName?: string | null;
  leadTitle?: string | null;
  departureCode?: string | null;
  passengersCount?: number;
}

export function rowToBooking(r: Row): SeatBookingDto {
  return {
    id: r.id,
    departureId: r.departure_id,
    leadId: r.lead_id,
    contactId: r.contact_id,
    itineraryId: r.itinerary_id ?? null,
    invoiceId: r.invoice_id ?? null,
    status: r.status,
    seats: r.seats,
    holdExpiresAt: r.hold_expires_at ?? null,
    waitlistPosition: r.waitlist_position ?? null,
    offeredAt: r.offered_at ?? null,
    confirmedAt: r.confirmed_at ?? null,
    confirmedBy: r.confirmed_by ?? null,
    cancelledAt: r.cancelled_at ?? null,
    cancelReason: r.cancel_reason ?? null,
    source: r.source,
    roomNotes: r.room_notes ?? null,
    notes: r.notes ?? null,
    createdBy: r.created_by ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    ...(r.contact_name !== undefined && { contactName: r.contact_name }),
    ...(r.lead_title !== undefined && { leadTitle: r.lead_title }),
    ...(r.departure_code !== undefined && { departureCode: r.departure_code }),
    ...(r.passengers_count !== undefined && { passengersCount: r.passengers_count }),
  };
}

export async function getBookingRow(db: D1Database, id: string): Promise<Row | null> {
  return db.prepare('SELECT * FROM seat_bookings WHERE id = ?').bind(id).first<Row>();
}

export async function requireBookingRow(db: D1Database, id: string): Promise<Row> {
  const row = await getBookingRow(db, id);
  if (!row) throw new DepartureError(404, 'NOT_FOUND', 'Seat booking not found');
  return row;
}

/** What the events and recipes need to know about a booking. Never personal details beyond ids. */
export function bookingPayload(row: Row, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    seatBookingId: row.id, departureId: row.departure_id, leadId: row.lead_id, contactId: row.contact_id,
    seats: row.seats, status: row.status, source: row.source, ...extra,
  };
}

/** Marks the booking's passengers cancelled, so manifest queries by departure and status no longer see them. */
export function cancelPassengersStatement(db: D1Database, bookingId: string): D1PreparedStatement {
  return db.prepare(`UPDATE seat_passengers SET status = 'cancelled', updated_at = ? WHERE seat_booking_id = ? AND status = 'active'`).bind(nowIso(), bookingId);
}

/** The context of a request: who acts, the automation depth of the call and the execution context that defers automations. */
export function seatCtxFromRequest(c: Context<AppContext>): SeatCtx {
  let waiter: SeatCtx['waiter'];
  try {
    waiter = c.executionCtx;
  } catch {
    waiter = undefined; // no execution context (tests that call the app directly)
  }
  return { env: c.env, tenantId: c.get('tenantId'), db: c.get('tenantDb'), userId: c.get('userId') ?? null, depth: requestDepth(c), waiter };
}
