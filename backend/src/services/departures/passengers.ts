/**
 * Passengers of a seat booking (R143, design 5.1 and 3.1): validation against the agency's passenger fields, age band, pickup
 * stop and room type checks, linking or creating travellers, and the rule that the seats follow the count of active passengers.
 */

import { generateId } from '../../utils/uuid';
import { chunk, DepartureError, nowIso, parseJson, placeholders, fromBool, toBool } from './common';
import {
  fitsSql, loadDepartureContext, requireBookingRow, type DepartureContext, type SeatCtx,
} from './seat-support';
import { seatsInUse } from './capacity';
import { ageOn, bandForAge, loadBandsForTour } from '../pricing/age-bands';
import type { PassengerInput } from '../../validators/seat-bookings';

type Row = Record<string, any>;

export interface PassengerDto {
  id: string;
  seatBookingId: string;
  departureId: string;
  travellerId: string | null;
  firstName: string;
  lastName: string;
  gender: string | null;
  dateOfBirth: string | null;
  ageYears: number | null;
  bandKey: string | null;
  pickupStopId: string | null;
  roomType: string | null;
  shareOk: boolean;
  shareGender: boolean;
  roomGroup: string | null;
  seatNumber: string | null;
  seatSurcharge: number | null;
  mealPreference: string | null;
  documentsStatus: 'unknown' | 'provided' | 'checked' | 'problem';
  extraFields: Record<string, unknown> | null;
  status: 'active' | 'cancelled';
}

export function rowToPassenger(r: Row): PassengerDto {
  return {
    id: r.id,
    seatBookingId: r.seat_booking_id,
    departureId: r.departure_id,
    travellerId: r.traveller_id ?? null,
    firstName: r.first_name,
    lastName: r.last_name,
    gender: r.gender ?? null,
    dateOfBirth: r.date_of_birth ?? null,
    ageYears: r.age_years ?? null,
    bandKey: r.band_key ?? null,
    pickupStopId: r.pickup_stop_id ?? null,
    roomType: r.room_type ?? null,
    shareOk: toBool(r.share_ok),
    shareGender: toBool(r.share_gender),
    roomGroup: r.room_group ?? null,
    seatNumber: r.seat_number ?? null,
    seatSurcharge: r.seat_surcharge ?? null,
    mealPreference: r.meal_preference ?? null,
    documentsStatus: r.documents_status,
    extraFields: parseJson<Record<string, unknown> | null>(r.extra_fields, null),
    status: r.status,
  };
}

export async function getPassengers(db: D1Database, bookingId: string): Promise<PassengerDto[]> {
  const { results } = await db
    .prepare(`SELECT * FROM seat_passengers WHERE seat_booking_id = ? AND status = 'active' ORDER BY created_at, id`)
    .bind(bookingId)
    .all<Row>();
  return (results ?? []).map(rowToPassenger);
}

// ---------------------------------------------------------------- age bands

// The resolver is shared with templates and quotes (R149); these names stay for the callers and tests that already use them.
export { ageOn, bandForAge as bandFor };

// ---------------------------------------------------------------- validation

export interface PreparedPassenger {
  id: string;
  existing: boolean;
  travellerId: string | null;
  firstName: string;
  lastName: string;
  gender: string | null;
  dateOfBirth: string | null;
  ageYears: number | null;
  bandKey: string | null;
  pickupStopId: string | null;
  roomType: string | null;
  shareOk: boolean;
  shareGender: boolean;
  mealPreference: string | null;
  extraFields: Record<string, unknown> | null;
  /** Staff-side details: undefined leaves the saved value alone, null clears it. */
  seatNumber?: string | null;
  roomGroup?: string | null;
  documentsStatus?: 'unknown' | 'provided' | 'checked' | 'problem';
}

const present = (v: unknown): boolean => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');

/** The value a passenger field key stands for on the input, so "required" can be checked the same way for built-in and custom fields. */
function fieldValue(p: PassengerInput, key: string): unknown {
  switch (key) {
    case 'name': return p.firstName;
    case 'gender': return p.gender;
    case 'dateOfBirth': return p.dateOfBirth ?? p.ageYears;
    case 'pickupPoint': return p.pickupStopId;
    case 'roomType': return p.roomType;
    case 'meal': return p.mealPreference;
    default: return p.extraFields?.[key];
  }
}

/**
 * Checks the passengers against the departure's effective passenger fields and returns them ready to write. Fields collected on
 * the booking or by staff and marked required must be present; fields the traveller fills in later (collectOn self_service) are
 * not demanded here. Throws 400 PASSENGER_INVALID with every problem found, INVALID_PICKUP_STOP for a stop of another departure.
 */
export async function preparePassengers(db: D1Database, dep: DepartureContext, inputs: PassengerInput[], bookingId: string | null): Promise<PreparedPassenger[]> {
  const errors: Array<{ index: number; field: string; message: string }> = [];
  const startDate: string = dep.row.start_date;
  const required = dep.effective.passengerFields.filter((f) => f.required && f.collectOn !== 'self_service');
  const roomKeys = new Set(dep.effective.roomTypes.map((r) => r.key));
  const customByKey = new Map(dep.effective.passengerFields.filter((f) => f.custom).map((f) => [f.key, f]));

  const [{ results: stopRows }, bands, ownRows, { results: takenSeats }] = await Promise.all([
    db.prepare('SELECT id FROM departure_stops WHERE departure_id = ?').bind(dep.row.id).all<{ id: string }>(),
    loadBandsForTour(db, dep.row.tour_id),
    bookingId ? db.prepare('SELECT id FROM seat_passengers WHERE seat_booking_id = ?').bind(bookingId).all<{ id: string }>() : Promise.resolve({ results: [] as Array<{ id: string }> }),
    db
      .prepare(`SELECT seat_number FROM seat_passengers WHERE departure_id = ? AND status = 'active' AND seat_number IS NOT NULL AND seat_booking_id != ?`)
      .bind(dep.row.id, bookingId ?? '')
      .all<{ seat_number: string }>(),
  ]);
  const stops = new Set((stopRows ?? []).map((s) => s.id));
  const own = new Set((ownRows.results ?? []).map((s) => s.id));
  const seatNumbersUsed = new Set((takenSeats ?? []).map((r) => r.seat_number.toLowerCase()));
  const seatNumbersInList = new Set<string>();

  const travellerIds = [...new Set(inputs.map((p) => p.travellerId).filter((v): v is string => !!v))];
  const knownTravellers = new Set<string>();
  for (const part of chunk(travellerIds)) {
    const { results } = await db.prepare(`SELECT id FROM travellers WHERE COALESCE(is_deleted, 0) = 0 AND id IN (${placeholders(part.length)})`).bind(...part).all<{ id: string }>();
    for (const r of results ?? []) knownTravellers.add(r.id);
  }

  const seenIds = new Set<string>();
  const out: PreparedPassenger[] = [];
  inputs.forEach((p, index) => {
    const fail = (field: string, message: string) => errors.push({ index, field, message });
    for (const f of required) {
      if (f.key === 'pickupPoint' && stops.size === 0) continue; // nothing to pick from on a departure without stops
      if (!present(fieldValue(p, f.key))) fail(f.key, `${f.label} is required`);
    }
    if (p.id) {
      if (!own.has(p.id)) fail('id', 'This passenger does not belong to the booking');
      else if (seenIds.has(p.id)) fail('id', 'This passenger is listed twice');
      seenIds.add(p.id);
    }
    if (p.dateOfBirth && p.dateOfBirth > startDate) fail('dateOfBirth', 'The date of birth is after the departure date');
    if (p.roomType && !roomKeys.has(p.roomType)) fail('roomType', 'This room type is not offered on the departure');
    if (p.seatNumber) {
      const key = p.seatNumber.toLowerCase();
      if (seatNumbersUsed.has(key) || seatNumbersInList.has(key)) fail('seatNumber', 'This seat number is already given to another passenger of the departure');
      seatNumbersInList.add(key);
    }
    if (p.travellerId && !knownTravellers.has(p.travellerId)) fail('travellerId', 'The traveller was not found');
    for (const [key, value] of Object.entries(p.extraFields ?? {})) {
      const def = customByKey.get(key);
      if (def?.type === 'select' && present(value) && def.options && !def.options.includes(String(value))) fail(key, `${def.label} must be one of the listed options`);
    }
    if (p.pickupStopId && !stops.has(p.pickupStopId)) {
      throw new DepartureError(400, 'INVALID_PICKUP_STOP', 'The pickup stop does not belong to this departure', { index, pickupStopId: p.pickupStopId });
    }

    const age = p.dateOfBirth ? ageOn(p.dateOfBirth, startDate) : (p.ageYears ?? null);
    out.push({
      id: p.id ?? generateId(),
      existing: !!p.id,
      travellerId: p.travellerId ?? null,
      firstName: p.firstName,
      lastName: p.lastName,
      gender: p.gender ?? null,
      dateOfBirth: p.dateOfBirth ?? null,
      ageYears: p.dateOfBirth ? null : (p.ageYears ?? null),
      bandKey: bandForAge(bands, age),
      pickupStopId: p.pickupStopId ?? null,
      roomType: p.roomType ?? null,
      shareOk: !!p.shareOk,
      shareGender: !!p.shareGender,
      mealPreference: p.mealPreference ?? null,
      extraFields: p.extraFields && Object.keys(p.extraFields).length ? p.extraFields : null,
      seatNumber: p.seatNumber === undefined ? undefined : p.seatNumber || null,
      roomGroup: p.roomGroup === undefined ? undefined : p.roomGroup || null,
      documentsStatus: p.documentsStatus,
    });
  });
  if (errors.length) throw new DepartureError(400, 'PASSENGER_INVALID', 'Some passenger details are missing or not valid', { errors });
  return out;
}

export function insertPassengerStatement(db: D1Database, bookingId: string, departureId: string, p: PreparedPassenger): D1PreparedStatement {
  const now = nowIso();
  return db
    .prepare(
      `INSERT INTO seat_passengers (id, seat_booking_id, departure_id, traveller_id, first_name, last_name, gender, date_of_birth, age_years, band_key,
         pickup_stop_id, room_type, share_ok, share_gender, meal_preference, extra_fields, seat_number, room_group, documents_status, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .bind(
      p.id, bookingId, departureId, p.travellerId, p.firstName, p.lastName, p.gender, p.dateOfBirth, p.ageYears, p.bandKey,
      p.pickupStopId, p.roomType, fromBool(p.shareOk), fromBool(p.shareGender), p.mealPreference, p.extraFields ? JSON.stringify(p.extraFields) : null,
      p.seatNumber ?? null, p.roomGroup ?? null, p.documentsStatus ?? 'unknown', now, now,
    );
}

/** The staff-side columns (seat number, room, documents) change only when the input carried them; a documents status of checked stamps who and when. */
function updatePassengerStatement(db: D1Database, p: PreparedPassenger, userId: string | null): D1PreparedStatement {
  const now = nowIso();
  const sets = [
    'traveller_id = ?', 'first_name = ?', 'last_name = ?', 'gender = ?', 'date_of_birth = ?', 'age_years = ?', 'band_key = ?', 'pickup_stop_id = ?', 'room_type = ?',
    'share_ok = ?', 'share_gender = ?', 'meal_preference = ?', 'extra_fields = ?', "status = 'active'", 'updated_at = ?',
  ];
  const binds: unknown[] = [
    p.travellerId, p.firstName, p.lastName, p.gender, p.dateOfBirth, p.ageYears, p.bandKey, p.pickupStopId, p.roomType,
    fromBool(p.shareOk), fromBool(p.shareGender), p.mealPreference, p.extraFields ? JSON.stringify(p.extraFields) : null, now,
  ];
  if (p.seatNumber !== undefined) { sets.push('seat_number = ?'); binds.push(p.seatNumber); }
  if (p.roomGroup !== undefined) { sets.push('room_group = ?'); binds.push(p.roomGroup); }
  if (p.documentsStatus !== undefined) {
    // Stamps are written first: the SET clauses read the old status.
    if (p.documentsStatus === 'checked') {
      sets.unshift("documents_checked_at = CASE WHEN documents_status = 'checked' THEN documents_checked_at ELSE ? END", "documents_checked_by_user_id = CASE WHEN documents_status = 'checked' THEN documents_checked_by_user_id ELSE ? END");
      binds.unshift(now, userId);
    }
    sets.push('documents_status = ?');
    binds.push(p.documentsStatus);
  }
  return db.prepare(`UPDATE seat_passengers SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, p.id);
}

// ---------------------------------------------------------------- travellers

/** Creates a travellers row under the booking contact for every passenger without one and links it. Returns the ids by passenger id. */
async function createTravellersFor(ctx: SeatCtx, contactId: string, list: PreparedPassenger[]): Promise<void> {
  const now = nowIso();
  const statements: D1PreparedStatement[] = [];
  for (const p of list) {
    if (p.travellerId) continue;
    const id = generateId();
    const f = p.extraFields ?? {};
    const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const docType = text(f.documentType)?.toLowerCase();
    const passport = !docType || docType === 'passport';
    statements.push(
      ctx.db
        .prepare(
          `INSERT INTO travellers (id, tenant_id, contact_id, first_name, last_name, full_name_passport, date_of_birth, gender, nationality, passport_number,
             passport_expiry_date, meal_preference, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id, ctx.tenantId, contactId, p.firstName, p.lastName, `${p.firstName} ${p.lastName}`.trim(), p.dateOfBirth, p.gender, text(f.nationality),
          passport ? text(f.documentNumber) : null, passport ? text(f.documentExpiry) : null, p.mealPreference, ctx.userId, now, now,
        ),
    );
    p.travellerId = id;
  }
  for (const part of chunk(statements, 50)) if (part.length) await ctx.db.batch(part);
}

// ---------------------------------------------------------------- replace

/**
 * Replaces the passenger list of a held, confirmed or waitlisted booking. Passengers carrying an id are updated in place; the ones
 * left out are removed (kept as cancelled when they already chose extras). Once the list is not empty the seats equal its length;
 * growing a held or confirmed booking goes through the capacity condition and answers 409 SEATS_UNAVAILABLE when it does not fit.
 * Returns the seats the booking gained (capacity events) or gave back (waitlist step).
 */
export async function replacePassengers(
  ctx: SeatCtx,
  bookingId: string,
  inputs: PassengerInput[],
  opts: { createTravellers?: boolean } = {},
): Promise<{ seatsAdded: number; seatsFreed: number }> {
  const booking = await requireBookingRow(ctx.db, bookingId);
  if (!['held', 'confirmed', 'waitlisted'].includes(booking.status)) {
    throw new DepartureError(409, 'ILLEGAL_TRANSITION', `A ${booking.status} booking has no passengers to edit`, { status: booking.status });
  }
  const dep = await loadDepartureContext(ctx.db, booking.departure_id);
  const prepared = await preparePassengers(ctx.db, dep, inputs, bookingId);

  let seatsAdded = 0;
  let seatsFreed = 0;
  const n = prepared.length;
  if (n > 0 && n !== booking.seats) {
    if (booking.status === 'waitlisted') {
      await ctx.db.prepare('UPDATE seat_bookings SET seats = ?, updated_at = ? WHERE id = ?').bind(n, nowIso(), bookingId).run();
    } else {
      const res = await ctx.db
        .prepare(
          `UPDATE seat_bookings SET seats = ?, updated_at = ? WHERE id = ? AND status IN ('held', 'confirmed')
             AND ${fitsSql({ departureExpr: 'seat_bookings.departure_id', seatsExpr: '?', excludeSelfId: 'seat_bookings.id' })}`,
        )
        .bind(n, nowIso(), bookingId, n)
        .run();
      if ((res.meta?.changes ?? 0) === 0) {
        const left = Math.max(0, dep.row.capacity - (await seatsInUse(ctx.db, dep.row.id)) + booking.seats);
        throw new DepartureError(409, 'SEATS_UNAVAILABLE', `Only ${left} seats are available for this booking`, { seatsLeft: left });
      }
      seatsAdded = Math.max(0, n - booking.seats);
      seatsFreed = Math.max(0, booking.seats - n);
    }
  }

  if (opts.createTravellers) await createTravellersFor(ctx, booking.contact_id, prepared);

  const { results: current } = await ctx.db.prepare('SELECT id FROM seat_passengers WHERE seat_booking_id = ?').bind(bookingId).all<{ id: string }>();
  const keep = new Set(prepared.map((p) => p.id));
  const statements: D1PreparedStatement[] = [];
  for (const row of current ?? []) {
    if (keep.has(row.id)) continue;
    statements.push(
      ctx.db.prepare('DELETE FROM seat_passengers WHERE id = ? AND NOT EXISTS (SELECT 1 FROM passenger_extras pe WHERE pe.seat_passenger_id = seat_passengers.id)').bind(row.id),
      ctx.db.prepare(`UPDATE seat_passengers SET status = 'cancelled', updated_at = ? WHERE id = ?`).bind(nowIso(), row.id),
    );
  }
  for (const p of prepared) statements.push(p.existing ? updatePassengerStatement(ctx.db, p, ctx.userId) : insertPassengerStatement(ctx.db, bookingId, dep.row.id, p));
  for (const part of chunk(statements, 80)) if (part.length) await ctx.db.batch(part);
  return { seatsAdded, seatsFreed };
}
