/**
 * Departures (R139): one dated run of a tour, with its coaches, capacity, stops, price overrides and costs. Seat booking
 * behaviour is R143; here a departure only knows how many seats it has and reads how many are used.
 */

import { generateId } from '../../utils/uuid';
import { addDaysLocal, daysBetweenLocal, getTenantTimeZone } from '../../utils/tz';
import {
  chunk, DepartureError, decodeCursor, encodeCursor, fromBool, localDateTimeToUtcIso, nowIso, placeholders, toBool,
} from './common';
import {
  assertCapacityAllowed, seatsSummary, setCapacityStatement, type SeatsSummary,
} from './capacity';
import { removeDepartureEvent, syncDepartureEvent } from './calendar';
import {
  getTourRow, replacePrices, replaceStops, rowToStop, effectivePrices, type StopRow,
} from './tours';
import {
  effectiveSettings, getGroupToursSettings, type ConfirmMode, type GroupToursSettings, type ShowSeatsLeft,
} from './settings';
import type {
  CostInput, CreateDepartureInput, PriceInput, StopInput, UpdateDepartureInput, VehicleInput,
} from '../../validators/departures';

type Row = Record<string, any>;

export type DepartureStatus = 'draft' | 'open' | 'closed' | 'departed' | 'completed' | 'cancelled';

export interface Departure {
  id: string;
  tourId: string;
  tourCode?: string;
  tourTitle?: string;
  code: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  status: DepartureStatus;
  capacityMode: 'vehicles' | 'manual';
  capacity: number;
  bookingCutoffDate: string | null;
  extrasCutoffDate: string | null;
  holdExpiryHours: number | null;
  confirmMode: ConfirmMode | null;
  showSeatsLeft: ShowSeatsLeft | null;
  publicBookingEnabled: boolean;
  tourLeaderDriverId: string | null;
  tourLeaderUserId: string | null;
  calendarEventId: string | null;
  notes: string | null;
  cancelledReason: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  seats?: SeatsSummary;
}

export function rowToDeparture(r: Row): Departure {
  return {
    id: r.id,
    tourId: r.tour_id,
    ...(r.tour_code !== undefined && { tourCode: r.tour_code }),
    ...(r.tour_title !== undefined && { tourTitle: r.tour_title }),
    code: r.code,
    startDate: r.start_date,
    endDate: r.end_date,
    startTime: r.start_time ?? null,
    status: r.status,
    capacityMode: r.capacity_mode,
    capacity: r.capacity,
    bookingCutoffDate: r.booking_cutoff_date ?? null,
    extrasCutoffDate: r.extras_cutoff_date ?? null,
    holdExpiryHours: r.hold_expiry_hours ?? null,
    confirmMode: r.confirm_mode ?? null,
    showSeatsLeft: r.show_seats_left ?? null,
    publicBookingEnabled: toBool(r.public_booking_enabled),
    tourLeaderDriverId: r.tour_leader_driver_id ?? null,
    tourLeaderUserId: r.tour_leader_user_id ?? null,
    calendarEventId: r.calendar_event_id ?? null,
    notes: r.notes ?? null,
    cancelledReason: r.cancelled_reason ?? null,
    createdBy: r.created_by ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
  };
}

const isUniqueViolation = (e: unknown): boolean => /UNIQUE constraint/i.test(String((e as Error)?.message ?? e));

export async function getDepartureRow(db: D1Database, id: string): Promise<Row | null> {
  return db
    .prepare(
      `SELECT d.*, t.code AS tour_code, t.title AS tour_title FROM departures d JOIN tours t ON t.id = d.tour_id
       WHERE d.id = ? AND d.is_deleted = 0`,
    )
    .bind(id)
    .first<Row>();
}

/** The scheduled time (UTC) of a stop of a departure that starts on `startDate`. */
function stopSchedule(tz: string, startDate: string) {
  return (s: { localTime?: string | null; dayOffset?: number }): string | null =>
    s.localTime ? localDateTimeToUtcIso(tz, addDaysLocal(startDate, s.dayOffset ?? 0), s.localTime) : null;
}

// ---------------------------------------------------------------- list and read

export interface DepartureListFilters {
  tour?: string;
  status?: DepartureStatus;
  from?: string;
  to?: string;
  hasSeats?: 'true' | 'false' | '1' | '0';
  q?: string;
  /** Part of the tour's destination (the lead page offers departures that go where the enquiry wants to go). */
  destination?: string;
  cursor?: string;
  limit: number;
}

export async function listDepartures(db: D1Database, f: DepartureListFilters) {
  const where = ['d.is_deleted = 0'];
  const binds: unknown[] = [];
  if (f.tour) { where.push('d.tour_id = ?'); binds.push(f.tour); }
  if (f.status) { where.push('d.status = ?'); binds.push(f.status); }
  if (f.from) { where.push('d.start_date >= ?'); binds.push(f.from); }
  if (f.to) { where.push('d.start_date <= ?'); binds.push(f.to); }
  if (f.hasSeats) {
    const inUse = `COALESCE((SELECT SUM(sb.seats) FROM seat_bookings sb WHERE sb.departure_id = d.id AND sb.status IN ('held', 'confirmed')), 0)`;
    where.push(f.hasSeats === 'true' || f.hasSeats === '1' ? `d.capacity - ${inUse} > 0` : `d.capacity - ${inUse} <= 0`);
  }
  if (f.destination) { where.push('t.destination LIKE ?'); binds.push(`%${f.destination}%`); }
  if (f.q) {
    where.push('(d.code LIKE ? OR t.code LIKE ? OR t.title LIKE ?)');
    binds.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  const base = `FROM departures d JOIN tours t ON t.id = d.tour_id`;
  const total = (await db.prepare(`SELECT COUNT(*) AS n ${base} WHERE ${where.join(' AND ')}`).bind(...binds).first<{ n: number }>())?.n ?? 0;

  const pageWhere = [...where];
  const pageBinds = [...binds];
  const cursor = decodeCursor(f.cursor, 2);
  if (cursor) {
    pageWhere.push('(d.start_date > ? OR (d.start_date = ? AND d.id > ?))');
    pageBinds.push(cursor[0], cursor[0], cursor[1]);
  }
  const { results } = await db
    .prepare(
      `SELECT d.*, t.code AS tour_code, t.title AS tour_title ${base}
       WHERE ${pageWhere.join(' AND ')} ORDER BY d.start_date, d.id LIMIT ?`,
    )
    .bind(...pageBinds, f.limit + 1)
    .all<Row>();
  const rows = results ?? [];
  const hasMore = rows.length > f.limit;
  const page = rows.slice(0, f.limit).map(rowToDeparture);
  const seats = await seatsSummary(db, page);
  const items = page.map((d) => ({ ...d, seats: seats.get(d.id)! }));
  const last = items[items.length - 1];
  return { items, total, hasMore, nextCursor: hasMore && last ? encodeCursor(last.startDate, last.id) : null };
}

export async function getDepartureDetail(db: D1Database, id: string) {
  const row = await getDepartureRow(db, id);
  if (!row) return null;
  const departure = rowToDeparture(row);
  const [seats, vehicles, stops, tour, settings] = await Promise.all([
    seatsSummary(db, [departure]),
    getVehicles(db, id),
    getDepartureStops(db, id),
    getTourRow(db, row.tour_id),
    getGroupToursSettings(db),
  ]);
  const effective = effectiveSettings(
    departure,
    tour && {
      holdExpiryHours: tour.hold_expiry_hours, confirmMode: tour.confirm_mode, bookingCutoffDays: tour.booking_cutoff_days,
      extrasCutoffDays: tour.extras_cutoff_days, depositType: tour.deposit_type, depositValue: tour.deposit_value,
    },
    settings,
  );
  return {
    ...departure,
    seats: seats.get(id)!,
    vehicles,
    stops,
    effective: { holdExpiryHours: effective.holdExpiryHours, confirmMode: effective.confirmMode, showSeatsLeft: effective.showSeatsLeft, deposit: effective.deposit },
  };
}

// ---------------------------------------------------------------- vehicles

export interface VehicleRow {
  id: string;
  vehicleId: string | null;
  label: string | null;
  capacity: number;
  driverId: string | null;
  seatLayout: unknown;
  sortOrder: number;
  registrationNumber?: string | null;
}

export async function getVehicles(db: D1Database, departureId: string): Promise<VehicleRow[]> {
  const { results } = await db
    .prepare(
      `SELECT dv.*, v.registration_number FROM departure_vehicles dv LEFT JOIN vehicles v ON v.id = dv.vehicle_id
       WHERE dv.departure_id = ? ORDER BY dv.sort_order, dv.id`,
    )
    .bind(departureId)
    .all<Row>();
  return (results ?? []).map((r) => ({
    id: r.id,
    vehicleId: r.vehicle_id ?? null,
    label: r.label ?? null,
    capacity: r.capacity,
    driverId: r.driver_id ?? null,
    seatLayout: r.seat_layout ? safeJson(r.seat_layout) : null,
    sortOrder: r.sort_order,
    registrationNumber: r.registration_number ?? null,
  }));
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

interface ResolvedVehicle { id: string; vehicleId: string | null; label: string | null; capacity: number; driverId: string | null; seatLayout: string | null }

/** Capacity of each coach: the given value, else the vehicle's seating capacity, else the agency default. */
async function resolveVehicles(db: D1Database, settings: GroupToursSettings, items: VehicleInput[]): Promise<ResolvedVehicle[]> {
  const out: ResolvedVehicle[] = [];
  for (const item of items) {
    let label = item.label ?? null;
    let seating: number | null = null;
    if (item.vehicleId) {
      const v = await db.prepare('SELECT registration_number, make, model, seating_capacity FROM vehicles WHERE id = ? AND is_deleted = 0').bind(item.vehicleId).first<Row>();
      if (!v) throw new DepartureError(400, 'NOT_FOUND_REFERENCE', 'The vehicle was not found', { id: item.vehicleId });
      seating = v.seating_capacity ?? null;
      label = label ?? ([v.make, v.model].filter(Boolean).join(' ') || v.registration_number);
    }
    if (item.driverId && !(await db.prepare('SELECT id FROM drivers WHERE id = ? AND is_deleted = 0').bind(item.driverId).first())) {
      throw new DepartureError(400, 'NOT_FOUND_REFERENCE', 'The driver was not found', { id: item.driverId });
    }
    out.push({
      id: item.id ?? generateId(),
      vehicleId: item.vehicleId ?? null,
      label,
      capacity: item.capacity ?? seating ?? settings.defaultVehicleCapacity,
      driverId: item.driverId ?? null,
      seatLayout: item.seatLayout ? JSON.stringify(item.seatLayout) : null,
    });
  }
  return out;
}

const vehicleCapacity = (list: ResolvedVehicle[], tourDefault: number | null): number =>
  list.length ? list.reduce((n, v) => n + v.capacity, 0) : (tourDefault ?? 0);

function vehicleStatements(db: D1Database, departureId: string, list: ResolvedVehicle[]): D1PreparedStatement[] {
  return list.map((v, i) =>
    db
      .prepare(`INSERT INTO departure_vehicles (id, departure_id, vehicle_id, label, capacity, driver_id, seat_layout, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(v.id, departureId, v.vehicleId, v.label, v.capacity, v.driverId, v.seatLayout, i),
  );
}

export async function replaceVehicles(db: D1Database, departureId: string, items: VehicleInput[], userId: string): Promise<void> {
  const row = await getDepartureRow(db, departureId);
  if (!row) throw new DepartureError(404, 'NOT_FOUND', 'Departure not found');
  const settings = await getGroupToursSettings(db);
  const list = await resolveVehicles(db, settings, items);
  const statements: D1PreparedStatement[] = [db.prepare('DELETE FROM departure_vehicles WHERE departure_id = ?').bind(departureId), ...vehicleStatements(db, departureId, list)];
  if (row.capacity_mode === 'vehicles') {
    const tour = await getTourRow(db, row.tour_id);
    const capacity = vehicleCapacity(list, tour?.default_capacity ?? null);
    await assertCapacityAllowed(db, departureId, capacity);
    statements.push(setCapacityStatement(db, departureId, capacity));
  }
  await db.batch(statements);
  await syncDepartureEvent(db, departureId, userId);
}

// ---------------------------------------------------------------- stops

export async function getDepartureStops(db: D1Database, departureId: string): Promise<StopRow[]> {
  const { results } = await db.prepare('SELECT * FROM departure_stops WHERE departure_id = ? ORDER BY sort_order, id').bind(departureId).all<Row>();
  return (results ?? []).map(rowToStop);
}

export async function replaceDepartureStops(db: D1Database, departureId: string, stops: StopInput[]): Promise<void> {
  const row = await getDepartureRow(db, departureId);
  if (!row) throw new DepartureError(404, 'NOT_FOUND', 'Departure not found');
  const tz = await getTenantTimeZone(db);
  await replaceStops(db, { kind: 'departure', id: departureId }, stops, stopSchedule(tz, row.start_date));
}

// ---------------------------------------------------------------- prices and costs

export async function getDeparturePrices(db: D1Database, departureId: string) {
  const row = await getDepartureRow(db, departureId);
  if (!row) return null;
  return effectivePrices(db, row.tour_id, departureId);
}

export async function replaceDeparturePrices(db: D1Database, departureId: string, prices: PriceInput[]): Promise<void> {
  const row = await getDepartureRow(db, departureId);
  if (!row) throw new DepartureError(404, 'NOT_FOUND', 'Departure not found');
  await replacePrices(db, row.tour_id, departureId, prices);
}

export async function getCosts(db: D1Database, departureId: string) {
  const { results } = await db.prepare('SELECT * FROM departure_costs WHERE departure_id = ? ORDER BY created_at, id').bind(departureId).all<Row>();
  return (results ?? []).map((r) => ({
    id: r.id as string,
    supplierId: (r.supplier_id ?? null) as string | null,
    description: r.description as string,
    kind: r.kind as 'per_departure' | 'per_seat',
    amount: r.amount as number,
    currency: (r.currency ?? null) as string | null,
    createdBy: (r.created_by ?? null) as string | null,
    createdAt: (r.created_at ?? null) as string | null,
  }));
}

export async function replaceCosts(db: D1Database, departureId: string, costs: CostInput[], userId: string): Promise<void> {
  if (!(await getDepartureRow(db, departureId))) throw new DepartureError(404, 'NOT_FOUND', 'Departure not found');
  for (const c of costs) {
    if (c.supplierId && !(await db.prepare('SELECT id FROM suppliers WHERE id = ?').bind(c.supplierId).first())) {
      throw new DepartureError(400, 'NOT_FOUND_REFERENCE', 'The supplier was not found', { id: c.supplierId });
    }
  }
  const now = nowIso();
  await db.batch([
    db.prepare('DELETE FROM departure_costs WHERE departure_id = ?').bind(departureId),
    ...costs.map((c) =>
      db
        .prepare(`INSERT INTO departure_costs (id, departure_id, supplier_id, description, kind, amount, currency, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(c.id ?? generateId(), departureId, c.supplierId ?? null, c.description, c.kind ?? 'per_departure', c.amount, c.currency ? c.currency.toUpperCase() : null, userId, now),
    ),
  ]);
}

// ---------------------------------------------------------------- create

/** Creates one departure of a tour: stops copied from the tour, cut-off dates and capacity worked out, status draft. */
export async function createDeparture(db: D1Database, input: CreateDepartureInput, userId: string): Promise<string> {
  const tour = await getTourRow(db, input.tourId);
  if (!tour) throw new DepartureError(404, 'TOUR_NOT_FOUND', 'Tour not found');
  if (tour.status === 'archived') throw new DepartureError(409, 'TOUR_ARCHIVED', 'An archived tour cannot get new departures');

  const [tz, settings] = await Promise.all([getTenantTimeZone(db), getGroupToursSettings(db)]);
  const code = input.code ?? `${tour.code}-${input.startDate}`;
  if (await db.prepare('SELECT id FROM departures WHERE code = ?').bind(code).first()) {
    throw new DepartureError(409, 'CODE_TAKEN', `The departure code "${code}" is already in use`);
  }

  const endDate = input.endDate ?? addDaysLocal(input.startDate, Math.max(1, tour.duration_days ?? 1) - 1);
  if (endDate < input.startDate) throw new DepartureError(400, 'INVALID_DATES', 'The end date is before the start date');

  const eff = effectiveSettings(null, {
    bookingCutoffDays: tour.booking_cutoff_days, extrasCutoffDays: tour.extras_cutoff_days,
  }, settings);
  const bookingCutoff = input.bookingCutoffDate !== undefined ? input.bookingCutoffDate : addDaysLocal(input.startDate, -eff.bookingCutoffDays);
  const extrasCutoff = input.extrasCutoffDate !== undefined ? input.extrasCutoffDate : addDaysLocal(input.startDate, -eff.extrasCutoffDays);

  const vehicles = await resolveVehicles(db, settings, input.vehicles ?? []);
  const mode = input.capacityMode ?? (input.capacity !== undefined ? 'manual' : 'vehicles'); // coaches drive the capacity unless a number was given
  const capacity = mode === 'vehicles' ? vehicleCapacity(vehicles, tour.default_capacity ?? null) : (input.capacity ?? tour.default_capacity ?? 0);

  for (const [what, id, table] of [['driver', input.tourLeaderDriverId, 'drivers'], ['user', input.tourLeaderUserId, 'users']] as const) {
    if (id && !(await db.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id).first())) {
      throw new DepartureError(400, 'NOT_FOUND_REFERENCE', `The tour leader ${what} was not found`, { id });
    }
  }

  const id = generateId();
  const now = nowIso();
  const schedule = stopSchedule(tz, input.startDate);
  const { results: tourStops } = await db.prepare('SELECT * FROM tour_stops WHERE tour_id = ? ORDER BY sort_order, id').bind(tour.id).all<Row>();

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO departures (id, tour_id, code, start_date, end_date, start_time, status, capacity_mode, capacity, booking_cutoff_date, extras_cutoff_date,
           hold_expiry_hours, confirm_mode, show_seats_left, public_booking_enabled, tour_leader_driver_id, tour_leader_user_id, notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, tour.id, code, input.startDate, endDate, input.startTime ?? null, mode, capacity, bookingCutoff ?? null, extrasCutoff ?? null,
        input.holdExpiryHours ?? null, input.confirmMode ?? null, input.showSeatsLeft ?? null, fromBool(input.publicBookingEnabled),
        input.tourLeaderDriverId ?? null, input.tourLeaderUserId ?? null, input.notes ?? null, userId, now, now,
      ),
    ...(tourStops ?? []).map((s) =>
      db
        .prepare(`INSERT INTO departure_stops (id, departure_id, sort_order, name, address, lat, lng, local_time, day_offset, kind, documents_check, notes, scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(generateId(), id, s.sort_order, s.name, s.address ?? null, s.lat ?? null, s.lng ?? null, s.local_time ?? null, s.day_offset ?? 0, s.kind, s.documents_check ?? 0, s.notes ?? null,
          schedule({ localTime: s.local_time, dayOffset: s.day_offset })),
    ),
    ...vehicleStatements(db, id, vehicles),
  ];
  try {
    await db.batch(statements);
  } catch (e) {
    if (isUniqueViolation(e)) throw new DepartureError(409, 'CODE_TAKEN', `The departure code "${code}" is already in use`);
    throw e;
  }
  await syncDepartureEvent(db, id, userId);
  return id;
}

/** Several dates of one tour in one request. A date whose code is taken is reported and skipped, the rest are created. */
export async function createDeparturesBulk(
  db: D1Database,
  input: Omit<CreateDepartureInput, 'startDate' | 'endDate' | 'code'> & { dates: string[] },
  userId: string,
): Promise<{ created: string[]; skipped: Array<{ date: string; code: string; message: string }> }> {
  const { dates, ...rest } = input;
  const created: string[] = [];
  const skipped: Array<{ date: string; code: string; message: string }> = [];
  for (const date of [...new Set(dates)].sort()) {
    try {
      created.push(await createDeparture(db, { ...rest, startDate: date }, userId));
    } catch (e) {
      if (e instanceof DepartureError && e.code === 'CODE_TAKEN') skipped.push({ date, code: e.code, message: e.message });
      else throw e;
    }
  }
  return { created, skipped };
}

// ---------------------------------------------------------------- update

export async function updateDeparture(db: D1Database, id: string, input: UpdateDepartureInput, userId: string): Promise<boolean> {
  const row = await getDepartureRow(db, id);
  if (!row) return false;
  if (row.status === 'cancelled') throw new DepartureError(409, 'DEPARTURE_CANCELLED', 'A cancelled departure cannot be edited');

  const sets: string[] = [];
  const binds: unknown[] = [];
  const set = (column: string, value: unknown) => { sets.push(`${column} = ?`); binds.push(value); };

  if (input.code !== undefined && input.code !== row.code) {
    if (await db.prepare('SELECT id FROM departures WHERE code = ? AND id != ?').bind(input.code, id).first()) {
      throw new DepartureError(409, 'CODE_TAKEN', `The departure code "${input.code}" is already in use`);
    }
    set('code', input.code);
  }

  // A new start date moves the end date and the cut-off dates by the same number of days unless they are given.
  let startDate: string = row.start_date;
  let endDate: string = row.end_date;
  if (input.startDate !== undefined && input.startDate !== row.start_date) {
    const shift = daysBetweenLocal(row.start_date, input.startDate);
    startDate = input.startDate;
    endDate = input.endDate ?? addDaysLocal(row.end_date, shift);
    if (input.bookingCutoffDate === undefined && row.booking_cutoff_date) set('booking_cutoff_date', addDaysLocal(row.booking_cutoff_date, shift));
    if (input.extrasCutoffDate === undefined && row.extras_cutoff_date) set('extras_cutoff_date', addDaysLocal(row.extras_cutoff_date, shift));
  } else if (input.endDate !== undefined) {
    endDate = input.endDate;
  }
  if (endDate < startDate) throw new DepartureError(400, 'INVALID_DATES', 'The end date is before the start date');
  if (startDate !== row.start_date) set('start_date', startDate);
  if (endDate !== row.end_date) set('end_date', endDate);

  if (input.startTime !== undefined) set('start_time', input.startTime);
  if (input.bookingCutoffDate !== undefined) set('booking_cutoff_date', input.bookingCutoffDate);
  if (input.extrasCutoffDate !== undefined) set('extras_cutoff_date', input.extrasCutoffDate);
  if (input.holdExpiryHours !== undefined) set('hold_expiry_hours', input.holdExpiryHours);
  if (input.confirmMode !== undefined) set('confirm_mode', input.confirmMode);
  if (input.showSeatsLeft !== undefined) set('show_seats_left', input.showSeatsLeft);
  if (input.publicBookingEnabled !== undefined) set('public_booking_enabled', fromBool(input.publicBookingEnabled));
  if (input.notes !== undefined) set('notes', input.notes);
  for (const [field, column, table] of [['tourLeaderDriverId', 'tour_leader_driver_id', 'drivers'], ['tourLeaderUserId', 'tour_leader_user_id', 'users']] as const) {
    const value = input[field];
    if (value === undefined) continue;
    if (value && !(await db.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(value).first())) {
      throw new DepartureError(400, 'NOT_FOUND_REFERENCE', 'The tour leader was not found', { id: value });
    }
    set(column, value);
  }

  // Capacity: in vehicles mode it is the sum of the coaches; in manual mode it is the number given.
  const mode: 'vehicles' | 'manual' = input.capacityMode ?? row.capacity_mode;
  let capacity: number = row.capacity;
  if (mode === 'vehicles') {
    if (input.capacity !== undefined && input.capacityMode === undefined) {
      throw new DepartureError(400, 'CAPACITY_FROM_VEHICLES', 'The capacity follows the coaches; change the coaches or switch to manual capacity');
    }
    const tour = await getTourRow(db, row.tour_id);
    const coaches = await db.prepare('SELECT COALESCE(SUM(capacity), 0) AS n, COUNT(*) AS c FROM departure_vehicles WHERE departure_id = ?').bind(id).first<{ n: number; c: number }>();
    capacity = coaches && coaches.c > 0 ? coaches.n : (tour?.default_capacity ?? 0);
  } else if (input.capacity !== undefined) {
    capacity = input.capacity;
  }
  if (mode !== row.capacity_mode) set('capacity_mode', mode);
  if (capacity !== row.capacity) await assertCapacityAllowed(db, id, capacity);

  if (sets.length === 0 && capacity === row.capacity) return true;
  const statements: D1PreparedStatement[] = [];
  if (sets.length) statements.push(db.prepare(`UPDATE departures SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...binds, nowIso(), id));
  if (capacity !== row.capacity) statements.push(setCapacityStatement(db, id, capacity));
  try {
    const results = await db.batch(statements);
    if (capacity !== row.capacity && (results[results.length - 1].meta?.changes ?? 0) === 0) {
      throw new DepartureError(409, 'SEATS_IN_USE', 'Seats were held while the capacity changed; the capacity was not lowered');
    }
  } catch (e) {
    if (isUniqueViolation(e)) throw new DepartureError(409, 'CODE_TAKEN', 'That departure code is already in use');
    throw e;
  }

  if (startDate !== row.start_date) {
    const tz = await getTenantTimeZone(db);
    const schedule = stopSchedule(tz, startDate);
    const stops = await getDepartureStops(db, id);
    const moved = stops.map((s) => db.prepare('UPDATE departure_stops SET scheduled_at = ? WHERE id = ?').bind(schedule(s), s.id));
    for (const part of chunk(moved, 50)) if (part.length) await db.batch(part);
  }
  await syncDepartureEvent(db, id, userId);
  return true;
}

// ---------------------------------------------------------------- status

/** draft -> open -> closed -> departed -> completed; cancelled from any state before departed. */
export const STATUS_TRANSITIONS: Record<DepartureStatus, DepartureStatus[]> = {
  draft: ['open', 'cancelled'],
  open: ['closed', 'cancelled'],
  closed: ['departed', 'cancelled'],
  departed: ['completed'],
  completed: [],
  cancelled: [],
};

export async function changeDepartureStatus(db: D1Database, id: string, status: DepartureStatus, reason: string | undefined, userId: string): Promise<Departure | null> {
  const row = await getDepartureRow(db, id);
  if (!row) return null;
  const from = row.status as DepartureStatus;
  if (!STATUS_TRANSITIONS[from].includes(status)) {
    throw new DepartureError(409, 'ILLEGAL_TRANSITION', `A ${from} departure cannot become ${status}`, { from, to: status, allowed: STATUS_TRANSITIONS[from] });
  }
  if (status === 'cancelled' && !reason?.trim()) throw new DepartureError(400, 'REASON_REQUIRED', 'A reason is required to cancel a departure');
  await db
    .prepare(`UPDATE departures SET status = ?, cancelled_reason = ?, updated_at = ? WHERE id = ?`)
    .bind(status, status === 'cancelled' ? reason!.trim() : row.cancelled_reason ?? null, nowIso(), id)
    .run();
  await syncDepartureEvent(db, id, userId);
  const updated = await getDepartureRow(db, id);
  return updated ? rowToDeparture(updated) : null;
}

// ---------------------------------------------------------------- delete

/** A departure nobody booked or asked about can be deleted; otherwise cancel it (the history stays). */
export async function deleteDeparture(db: D1Database, id: string): Promise<boolean> {
  const row = await getDepartureRow(db, id);
  if (!row) return false;
  const [bookings, leads, quotes] = await Promise.all([
    db.prepare('SELECT 1 AS x FROM seat_bookings WHERE departure_id = ? LIMIT 1').bind(id).first(),
    db.prepare('SELECT 1 AS x FROM leads WHERE departure_id = ? LIMIT 1').bind(id).first(),
    db.prepare('SELECT 1 AS x FROM itineraries WHERE departure_id = ? LIMIT 1').bind(id).first(),
  ]);
  if (bookings || leads || quotes) {
    throw new DepartureError(409, 'HAS_BOOKINGS', 'Seats, enquiries or quotes refer to this departure; cancel it instead of deleting it');
  }
  await db.batch([
    db.prepare('DELETE FROM departure_message_sends WHERE departure_id = ?').bind(id),
    db.prepare('DELETE FROM tour_extras WHERE departure_id = ?').bind(id),
    db.prepare('DELETE FROM tour_prices WHERE departure_id = ?').bind(id),
    db.prepare('DELETE FROM departure_costs WHERE departure_id = ?').bind(id),
    db.prepare('DELETE FROM departure_stops WHERE departure_id = ?').bind(id),
    db.prepare('DELETE FROM departure_vehicles WHERE departure_id = ?').bind(id),
    db.prepare('DELETE FROM departures WHERE id = ?').bind(id),
  ]);
  await removeDepartureEvent(db, row.calendar_event_id);
  return true;
}
