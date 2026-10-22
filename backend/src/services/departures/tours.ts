/**
 * Tours (R139): the product that departures are runs of. A tour carries its default stops, its prices (age band, room
 * supplement, seat surcharge) and its extras catalogue. Departures read these; they never write them back.
 */

import { generateId } from '../../utils/uuid';
import {
  chunk, DepartureError, decodeCursor, encodeCursor, fromBool, jsonOrNull, nowIso, parseJson, placeholders, toBool,
} from './common';
import type {
  CreateTourInput, ExtraInput, PriceInput, StopInput, UpdateTourInput,
} from '../../validators/departures';
import type { ConfirmMode, DepositType, PassengerFieldDef, RoomTypeDef } from './settings';

type Row = Record<string, any>;

export interface Tour {
  id: string;
  code: string;
  title: string;
  description: string | null;
  destination: string | null;
  itineraryTemplateId: string | null;
  durationDays: number | null;
  currency: string | null;
  defaultCapacity: number | null;
  bookingCutoffDays: number | null;
  extrasCutoffDays: number | null;
  holdExpiryHours: number | null;
  confirmMode: ConfirmMode | null;
  depositType: DepositType | null;
  depositValue: number | null;
  passengerFields: PassengerFieldDef[] | null;
  roomTypes: RoomTypeDef[] | null;
  terms: string | null;
  status: 'active' | 'archived';
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  departuresCount?: number;
}

export function rowToTour(r: Row): Tour {
  return {
    id: r.id,
    code: r.code,
    title: r.title,
    description: r.description ?? null,
    destination: r.destination ?? null,
    itineraryTemplateId: r.itinerary_template_id ?? null,
    durationDays: r.duration_days ?? null,
    currency: r.currency ?? null,
    defaultCapacity: r.default_capacity ?? null,
    bookingCutoffDays: r.booking_cutoff_days ?? null,
    extrasCutoffDays: r.extras_cutoff_days ?? null,
    holdExpiryHours: r.hold_expiry_hours ?? null,
    confirmMode: r.confirm_mode ?? null,
    depositType: r.deposit_type ?? null,
    depositValue: r.deposit_value ?? null,
    passengerFields: r.passenger_fields ? parseJson<PassengerFieldDef[] | null>(r.passenger_fields, null) : null,
    roomTypes: r.room_types ? parseJson<RoomTypeDef[] | null>(r.room_types, null) : null,
    terms: r.terms ?? null,
    status: r.status,
    createdBy: r.created_by ?? null,
    createdAt: r.created_at ?? null,
    updatedAt: r.updated_at ?? null,
    ...(r.departures_count !== undefined && { departuresCount: r.departures_count }),
  };
}

export interface StopRow {
  id: string;
  sortOrder: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  localTime: string | null;
  dayOffset: number;
  kind: 'pickup' | 'dropoff' | 'both' | 'waypoint';
  documentsCheck: boolean;
  notes: string | null;
  scheduledAt?: string | null;
}

export function rowToStop(r: Row): StopRow {
  return {
    id: r.id,
    sortOrder: r.sort_order,
    name: r.name,
    address: r.address ?? null,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    localTime: r.local_time ?? null,
    dayOffset: r.day_offset ?? 0,
    kind: r.kind,
    documentsCheck: toBool(r.documents_check),
    notes: r.notes ?? null,
    ...(r.scheduled_at !== undefined && { scheduledAt: r.scheduled_at ?? null }),
  };
}

export interface PriceRow {
  id: string;
  departureId: string | null;
  kind: 'age_band' | 'room_supplement' | 'seat_surcharge' | 'other';
  key: string;
  label: string | null;
  amount: number;
  currency: string | null;
  sortOrder: number;
}

export function rowToPrice(r: Row): PriceRow {
  return {
    id: r.id,
    departureId: r.departure_id ?? null,
    kind: r.kind,
    key: r.key,
    label: r.label ?? null,
    amount: r.amount,
    currency: r.currency ?? null,
    sortOrder: r.sort_order,
  };
}

export function rowToExtra(r: Row) {
  return {
    id: r.id as string,
    tourId: (r.tour_id ?? null) as string | null,
    departureId: (r.departure_id ?? null) as string | null,
    dayNumber: (r.day_number ?? null) as number | null,
    title: r.title as string,
    description: (r.description ?? null) as string | null,
    price: r.price as number,
    currency: (r.currency ?? null) as string | null,
    bandPrices: r.band_prices ? parseJson<Record<string, number> | null>(r.band_prices, null) : null,
    rateCardId: (r.rate_card_id ?? null) as string | null,
    supplierId: (r.supplier_id ?? null) as string | null,
    capacity: (r.capacity ?? null) as number | null,
    cutoffHoursBefore: (r.cutoff_hours_before ?? null) as number | null,
    refundableUntilHours: (r.refundable_until_hours ?? null) as number | null,
    isActive: toBool(r.is_active),
    sortOrder: r.sort_order as number,
  };
}

const isUniqueViolation = (e: unknown): boolean => /UNIQUE constraint/i.test(String((e as Error)?.message ?? e));

async function assertExists(db: D1Database, table: string, id: string | null | undefined, what: string, extraWhere = ''): Promise<void> {
  if (!id) return;
  const row = await db.prepare(`SELECT id FROM ${table} WHERE id = ? ${extraWhere}`).bind(id).first();
  if (!row) throw new DepartureError(400, 'NOT_FOUND_REFERENCE', `${what} not found`, { id });
}

// ---------------------------------------------------------------- tours

export interface TourListFilters {
  q?: string;
  status?: 'active' | 'archived' | 'all';
  destination?: string;
  cursor?: string;
  limit: number;
}

export async function listTours(db: D1Database, f: TourListFilters): Promise<{ items: Tour[]; total: number; hasMore: boolean; nextCursor: string | null }> {
  const where = ['t.is_deleted = 0'];
  const binds: unknown[] = [];
  if (f.status && f.status !== 'all') { where.push('t.status = ?'); binds.push(f.status); }
  if (f.destination) { where.push('t.destination LIKE ?'); binds.push(`%${f.destination}%`); }
  if (f.q) {
    where.push('(t.code LIKE ? OR t.title LIKE ? OR t.destination LIKE ?)');
    binds.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`);
  }
  const total = (await db.prepare(`SELECT COUNT(*) AS n FROM tours t WHERE ${where.join(' AND ')}`).bind(...binds).first<{ n: number }>())?.n ?? 0;

  const cursor = decodeCursor(f.cursor, 1);
  const pageWhere = [...where];
  const pageBinds = [...binds];
  if (cursor) { pageWhere.push('t.id < ?'); pageBinds.push(cursor[0]); }
  const { results } = await db
    .prepare(
      `SELECT t.*, (SELECT COUNT(*) FROM departures d WHERE d.tour_id = t.id AND d.is_deleted = 0) AS departures_count
       FROM tours t WHERE ${pageWhere.join(' AND ')} ORDER BY t.id DESC LIMIT ?`,
    )
    .bind(...pageBinds, f.limit + 1)
    .all<Row>();
  const rows = results ?? [];
  const hasMore = rows.length > f.limit;
  const items = rows.slice(0, f.limit).map(rowToTour);
  return { items, total, hasMore, nextCursor: hasMore ? encodeCursor(items[items.length - 1].id) : null };
}

export async function getTourRow(db: D1Database, id: string): Promise<Row | null> {
  return db.prepare('SELECT * FROM tours WHERE id = ? AND is_deleted = 0').bind(id).first<Row>();
}

export async function getTourDetail(db: D1Database, id: string) {
  const row = await getTourRow(db, id);
  if (!row) return null;
  const [stops, prices, extras, count] = await Promise.all([
    getTourStops(db, id),
    getTourPrices(db, id),
    getTourExtras(db, id),
    db.prepare('SELECT COUNT(*) AS n FROM departures WHERE tour_id = ? AND is_deleted = 0').bind(id).first<{ n: number }>(),
  ]);
  return { ...rowToTour({ ...row, departures_count: count?.n ?? 0 }), stops, prices, extras };
}

export async function createTour(db: D1Database, input: CreateTourInput, userId: string): Promise<string> {
  const code = input.code.trim();
  if (await db.prepare('SELECT id FROM tours WHERE code = ?').bind(code).first()) {
    throw new DepartureError(409, 'CODE_TAKEN', `The tour code "${code}" is already in use`);
  }
  await assertExists(db, 'itinerary_templates', input.itineraryTemplateId, 'The itinerary template');
  const id = generateId();
  const now = nowIso();
  try {
    await db
      .prepare(
        `INSERT INTO tours (id, code, title, description, destination, itinerary_template_id, duration_days, currency, default_capacity,
           booking_cutoff_days, extras_cutoff_days, hold_expiry_hours, confirm_mode, deposit_type, deposit_value, passenger_fields,
           room_types, terms, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id, code, input.title, input.description ?? null, input.destination ?? null, input.itineraryTemplateId ?? null,
        input.durationDays ?? null, input.currency ? input.currency.toUpperCase() : null, input.defaultCapacity ?? null,
        input.bookingCutoffDays ?? null, input.extrasCutoffDays ?? null, input.holdExpiryHours ?? null, input.confirmMode ?? null,
        input.depositType ?? null, input.depositValue ?? null, jsonOrNull(input.passengerFields), jsonOrNull(input.roomTypes),
        input.terms ?? null, input.status ?? 'active', userId, now, now,
      )
      .run();
  } catch (e) {
    if (isUniqueViolation(e)) throw new DepartureError(409, 'CODE_TAKEN', `The tour code "${code}" is already in use`);
    throw e;
  }
  return id;
}

const TOUR_COLUMNS: Record<string, string> = {
  code: 'code', title: 'title', description: 'description', destination: 'destination', itineraryTemplateId: 'itinerary_template_id',
  durationDays: 'duration_days', currency: 'currency', defaultCapacity: 'default_capacity', bookingCutoffDays: 'booking_cutoff_days',
  extrasCutoffDays: 'extras_cutoff_days', holdExpiryHours: 'hold_expiry_hours', confirmMode: 'confirm_mode', depositType: 'deposit_type',
  depositValue: 'deposit_value', passengerFields: 'passenger_fields', roomTypes: 'room_types', terms: 'terms', status: 'status',
};

export async function updateTour(db: D1Database, id: string, input: UpdateTourInput): Promise<boolean> {
  const existing = await getTourRow(db, id);
  if (!existing) return false;
  if (input.code !== undefined && input.code.trim() !== existing.code) {
    if (await db.prepare('SELECT id FROM tours WHERE code = ? AND id != ?').bind(input.code.trim(), id).first()) {
      throw new DepartureError(409, 'CODE_TAKEN', `The tour code "${input.code.trim()}" is already in use`);
    }
  }
  if (input.itineraryTemplateId) await assertExists(db, 'itinerary_templates', input.itineraryTemplateId, 'The itinerary template');

  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    const column = TOUR_COLUMNS[key];
    if (!column || value === undefined) continue;
    sets.push(`${column} = ?`);
    if (key === 'passengerFields' || key === 'roomTypes') binds.push(jsonOrNull(value));
    else if (key === 'code') binds.push((value as string).trim());
    else if (key === 'currency') binds.push(value ? String(value).toUpperCase() : null);
    else binds.push(value);
  }
  if (sets.length === 0) return true;
  try {
    await db.prepare(`UPDATE tours SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).bind(...binds, nowIso(), id).run();
  } catch (e) {
    if (isUniqueViolation(e)) throw new DepartureError(409, 'CODE_TAKEN', 'That tour code is already in use');
    throw e;
  }
  return true;
}

/** A tour with any departure is archived (its history stays); one that never had a departure is deleted. */
export async function removeTour(db: D1Database, id: string): Promise<{ archived: boolean } | null> {
  const existing = await getTourRow(db, id);
  if (!existing) return null;
  const used = await db.prepare('SELECT 1 AS x FROM departures WHERE tour_id = ? LIMIT 1').bind(id).first();
  if (used) {
    await db.prepare(`UPDATE tours SET status = 'archived', updated_at = ? WHERE id = ?`).bind(nowIso(), id).run();
    return { archived: true };
  }
  await db.batch([
    db.prepare('DELETE FROM tour_extras WHERE tour_id = ?').bind(id),
    db.prepare('DELETE FROM tour_prices WHERE tour_id = ?').bind(id),
    db.prepare('DELETE FROM tour_stops WHERE tour_id = ?').bind(id),
    db.prepare('DELETE FROM departure_message_rules WHERE tour_id = ?').bind(id),
    db.prepare('DELETE FROM tours WHERE id = ?').bind(id),
  ]);
  return { archived: false };
}

// ---------------------------------------------------------------- stops

export async function getTourStops(db: D1Database, tourId: string): Promise<StopRow[]> {
  const { results } = await db.prepare('SELECT * FROM tour_stops WHERE tour_id = ? ORDER BY sort_order, id').bind(tourId).all<Row>();
  return (results ?? []).map(rowToStop);
}

/**
 * Replaces the ordered stop list of a tour or a departure. A stop with an id is updated in place, one without is added, one left
 * out is removed. A departure stop that a passenger picked up at cannot be removed (409 STOP_IN_USE).
 * `scheduledAt` computes the UTC time of a departure stop; tour stops have none.
 */
export async function replaceStops(
  db: D1Database,
  owner: { kind: 'tour' | 'departure'; id: string },
  stops: StopInput[],
  scheduledAt?: (stop: StopInput) => string | null,
): Promise<void> {
  const table = owner.kind === 'tour' ? 'tour_stops' : 'departure_stops';
  const column = owner.kind === 'tour' ? 'tour_id' : 'departure_id';
  const { results } = await db.prepare(`SELECT id FROM ${table} WHERE ${column} = ?`).bind(owner.id).all<{ id: string }>();
  const existing = new Set((results ?? []).map((r) => r.id));

  const seen = new Set<string>();
  for (const s of stops) {
    if (!s.id) continue;
    if (!existing.has(s.id)) throw new DepartureError(400, 'UNKNOWN_STOP', 'A stop id does not belong to this list', { id: s.id });
    if (seen.has(s.id)) throw new DepartureError(400, 'DUPLICATE_STOP', 'A stop id appears twice', { id: s.id });
    seen.add(s.id);
  }
  const removed = [...existing].filter((id) => !seen.has(id));
  if (owner.kind === 'departure' && removed.length) {
    const used: string[] = [];
    for (const part of chunk(removed)) {
      const { results: refs } = await db
        .prepare(`SELECT DISTINCT pickup_stop_id FROM seat_passengers WHERE pickup_stop_id IN (${placeholders(part.length)})`)
        .bind(...part)
        .all<{ pickup_stop_id: string }>();
      used.push(...(refs ?? []).map((r) => r.pickup_stop_id));
    }
    if (used.length) throw new DepartureError(409, 'STOP_IN_USE', 'A passenger is picked up at a stop you removed', { stopIds: used });
  }

  const statements: D1PreparedStatement[] = [];
  for (const part of chunk(removed)) statements.push(db.prepare(`DELETE FROM ${table} WHERE id IN (${placeholders(part.length)})`).bind(...part));
  stops.forEach((s, i) => {
    const common = [i, s.name, s.address ?? null, s.lat ?? null, s.lng ?? null, s.localTime ?? null, s.dayOffset ?? 0, s.kind ?? 'pickup', fromBool(s.documentsCheck), s.notes ?? null];
    if (s.id) {
      statements.push(
        owner.kind === 'tour'
          ? db.prepare(`UPDATE tour_stops SET sort_order = ?, name = ?, address = ?, lat = ?, lng = ?, local_time = ?, day_offset = ?, kind = ?, documents_check = ?, notes = ? WHERE id = ?`).bind(...common, s.id)
          : db.prepare(`UPDATE departure_stops SET sort_order = ?, name = ?, address = ?, lat = ?, lng = ?, local_time = ?, day_offset = ?, kind = ?, documents_check = ?, notes = ?, scheduled_at = ? WHERE id = ?`).bind(...common, scheduledAt?.(s) ?? null, s.id),
      );
    } else {
      statements.push(
        owner.kind === 'tour'
          ? db.prepare(`INSERT INTO tour_stops (id, tour_id, sort_order, name, address, lat, lng, local_time, day_offset, kind, documents_check, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(generateId(), owner.id, ...common)
          : db.prepare(`INSERT INTO departure_stops (id, departure_id, sort_order, name, address, lat, lng, local_time, day_offset, kind, documents_check, notes, scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(generateId(), owner.id, ...common, scheduledAt?.(s) ?? null),
      );
    }
  });
  if (statements.length) await db.batch(statements);
}

// ---------------------------------------------------------------- prices

export async function getTourPrices(db: D1Database, tourId: string): Promise<PriceRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM tour_prices WHERE tour_id = ? AND departure_id IS NULL ORDER BY sort_order, id')
    .bind(tourId)
    .all<Row>();
  return (results ?? []).map(rowToPrice);
}

/** Replaces the prices of a tour (departureId null) or the overrides of one departure. */
export async function replacePrices(db: D1Database, tourId: string, departureId: string | null, prices: PriceInput[]): Promise<void> {
  const keys = new Set<string>();
  for (const p of prices) {
    const k = `${p.kind}:${p.key}`;
    if (keys.has(k)) throw new DepartureError(400, 'DUPLICATE_PRICE', `The price ${p.kind} / ${p.key} appears twice`, { kind: p.kind, key: p.key });
    keys.add(k);
  }
  const statements: D1PreparedStatement[] = [
    departureId
      ? db.prepare('DELETE FROM tour_prices WHERE departure_id = ?').bind(departureId)
      : db.prepare('DELETE FROM tour_prices WHERE tour_id = ? AND departure_id IS NULL').bind(tourId),
  ];
  prices.forEach((p, i) => {
    statements.push(
      db
        .prepare(`INSERT INTO tour_prices (id, tour_id, departure_id, kind, key, label, amount, currency, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(p.id ?? generateId(), tourId, departureId, p.kind, p.key, p.label ?? null, p.amount, p.currency ? p.currency.toUpperCase() : null, i),
    );
  });
  await db.batch(statements);
}

/** What a departure charges: the tour's rows, each replaced by the departure's own row of the same kind and key. */
export async function effectivePrices(db: D1Database, tourId: string, departureId: string): Promise<Array<PriceRow & { source: 'tour' | 'departure' }>> {
  const { results } = await db
    .prepare('SELECT * FROM tour_prices WHERE tour_id = ? AND (departure_id IS NULL OR departure_id = ?) ORDER BY sort_order, id')
    .bind(tourId, departureId)
    .all<Row>();
  const merged = new Map<string, PriceRow & { source: 'tour' | 'departure' }>();
  for (const r of (results ?? []).filter((x) => !x.departure_id)) merged.set(`${r.kind}:${r.key}`, { ...rowToPrice(r), source: 'tour' });
  for (const r of (results ?? []).filter((x) => x.departure_id)) merged.set(`${r.kind}:${r.key}`, { ...rowToPrice(r), source: 'departure' });
  return [...merged.values()];
}

// ---------------------------------------------------------------- extras

export async function getTourExtras(db: D1Database, tourId: string) {
  const { results } = await db.prepare('SELECT * FROM tour_extras WHERE tour_id = ? ORDER BY sort_order, id').bind(tourId).all<Row>();
  return (results ?? []).map(rowToExtra);
}

/**
 * Replaces the extras catalogue of a tour. An extra with an id is updated, one without is added. An extra left out is deleted, or
 * switched off when passengers already chose it (their choices keep pointing at it).
 */
export async function replaceTourExtras(db: D1Database, tourId: string, extras: ExtraInput[]): Promise<void> {
  const { results } = await db.prepare('SELECT id, departure_id FROM tour_extras WHERE tour_id = ?').bind(tourId).all<{ id: string; departure_id: string | null }>();
  const existing = new Set((results ?? []).map((r) => r.id));
  // Rows of a departure belong to that departure's Extras tab (R150): leaving them out of this list does not remove them.
  const departureRows = new Set((results ?? []).filter((r) => r.departure_id).map((r) => r.id));
  const seen = new Set<string>();
  for (const e of extras) {
    if (e.id) {
      if (!existing.has(e.id)) throw new DepartureError(400, 'UNKNOWN_EXTRA', 'An extra id does not belong to this tour', { id: e.id });
      if (seen.has(e.id)) throw new DepartureError(400, 'DUPLICATE_EXTRA', 'An extra id appears twice', { id: e.id });
      seen.add(e.id);
    }
    if (e.departureId) await assertExists(db, 'departures', e.departureId, 'The departure', `AND tour_id = '${tourId.replace(/'/g, '')}'`);
    await assertExists(db, 'rate_cards', e.rateCardId, 'The rate card');
    await assertExists(db, 'suppliers', e.supplierId, 'The supplier');
  }
  const removed = [...existing].filter((id) => !seen.has(id) && !departureRows.has(id));
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
      e.departureId ?? null, e.dayNumber ?? null, e.title, e.description ?? null, e.price, e.currency ? e.currency.toUpperCase() : null,
      jsonOrNull(e.bandPrices), e.rateCardId ?? null, e.supplierId ?? null, e.capacity ?? null, e.cutoffHoursBefore ?? null,
      e.refundableUntilHours ?? null, e.isActive === false ? 0 : 1, i,
    ];
    statements.push(
      e.id
        ? db.prepare(`UPDATE tour_extras SET departure_id = ?, day_number = ?, title = ?, description = ?, price = ?, currency = ?, band_prices = ?, rate_card_id = ?, supplier_id = ?, capacity = ?, cutoff_hours_before = ?, refundable_until_hours = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?`).bind(...values, now, e.id)
        : db.prepare(`INSERT INTO tour_extras (id, tour_id, departure_id, day_number, title, description, price, currency, band_prices, rate_card_id, supplier_id, capacity, cutoff_hours_before, refundable_until_hours, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(generateId(), tourId, ...values, now, now),
    );
  });
  if (statements.length) await db.batch(statements);
}
