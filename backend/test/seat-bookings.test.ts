import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import worker from '../src/index';
import { signAccessToken } from '../src/utils/jwt';
import { JOB_SETS } from '../src/cron/dispatch';
import { expireHoldsForTenant, lifecycleTarget, runDepartureLifecycle } from '../src/services/departures/waitlist';
import { ageOn, bandFor } from '../src/services/departures/passengers';
import { defaultPassengerFields } from '../src/services/departures/settings';

// R143: seat holds, confirmation, waitlist and offers, hold expiry, passengers, lead link, events.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const ACCOUNTANT_ID = '0196c143-0000-7000-8000-000000000a01';

let admin = '';
let sales = '';
let accountant = '';
let seq = 0;

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}
const json = async (res: Response): Promise<any> => res.json();
const rows = async <T = any>(sql: string, ...b: unknown[]): Promise<T[]> => ((await DB.prepare(sql).bind(...b).all()).results ?? []) as T[];

async function login(email: string): Promise<string> {
  const res = await call('POST', '/auth/login', null, { email, password: 'password123', tenantId: TENANT_ID });
  return (await json(res)).data.accessToken;
}

async function setSettings(patch: Record<string, unknown>) {
  const res = await call('PUT', '/departures/settings', admin, patch);
  expect(res.status).toBe(200);
}

const DEFAULT_SETTINGS = {
  holdExpiryHours: 48,
  confirmMode: 'manual',
  markLeadWonOnConfirm: true,
  waitlist: { enabled: true, offerMode: 'suggest', offerHoldHours: 24 },
  seatsLeftThreshold: 10,
  passengerFields: defaultPassengerFields(),
};

interface DepOpts { capacity: number; start?: string; status?: string; confirmMode?: string; holdExpiryHours?: number }

/** A tour with one open (by default) manual-capacity departure; returns the departure id. */
async function makeDeparture(o: DepOpts): Promise<string> {
  seq += 1;
  const tourRes = await call('POST', '/tours', admin, { code: `SB${seq}`, title: `Seat tour ${seq}`, destination: 'Switzerland', durationDays: 5, defaultCapacity: 49 });
  expect(tourRes.status).toBe(201);
  const tour = (await json(tourRes)).data;
  const body: Record<string, unknown> = { tourId: tour.id, startDate: o.start ?? `2032-0${(seq % 9) + 1}-15`, capacityMode: 'manual', capacity: o.capacity };
  if (o.confirmMode) body.confirmMode = o.confirmMode;
  if (o.holdExpiryHours) body.holdExpiryHours = o.holdExpiryHours;
  const dep = await call('POST', '/departures', admin, body);
  expect(dep.status).toBe(201);
  const id = (await json(dep)).data.id;
  const status = o.status ?? 'open';
  if (status !== 'draft') {
    expect((await call('POST', `/departures/${id}/status`, admin, { status: 'open' })).status).toBe(200);
    if (status === 'closed') expect((await call('POST', `/departures/${id}/status`, admin, { status: 'closed' })).status).toBe(200);
  }
  return id;
}

/** Holds seats for a new party (contact and lead are created from the name). */
async function hold(depId: string, name: string, seats: number, token = admin, extra: Record<string, unknown> = {}): Promise<Response> {
  return call('POST', `/departures/${depId}/bookings`, token, { contact: { name, email: `${name.toLowerCase().replace(/\W+/g, '.')}.${depId.slice(-6)}@sb.test` }, seats, ...extra });
}
const holdOk = async (depId: string, name: string, seats: number, extra: Record<string, unknown> = {}) => {
  const res = await hold(depId, name, seats, admin, extra);
  expect(res.status, name).toBe(201);
  return (await json(res)).data;
};
const eventCount = async (type: string, entityId: string) =>
  (await rows(`SELECT COUNT(*) AS n FROM domain_events WHERE type = ? AND entity_id = ?`, type, entityId))[0].n as number;
const bookingRow = async (id: string) => (await rows('SELECT * FROM seat_bookings WHERE id = ?', id))[0];
const depSeats = async (id: string) => (await json(await call('GET', `/departures/${id}`, admin))).data.seats;

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  admin = await login('admin@e2e.test');
  sales = await login('sales@e2e.test');
  await DB.prepare(`INSERT OR REPLACE INTO users (id, email, name, password_hash, role, is_active) VALUES (?, 'acc@r143.test', 'R143 Accountant', 'x', 'accountant', 1)`).bind(ACCOUNTANT_ID).run();
  accountant = await signAccessToken({ userId: ACCOUNTANT_ID, tenantId: TENANT_ID, role: 'accountant', email: 'acc@r143.test' }, testEnv.JWT_SECRET);
  await DB.prepare(`INSERT INTO settings (key, value) VALUES ('timezone', 'Europe/Amsterdam') ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run();
  // Recipes are tested in departure-recipes.test.ts; here they would only add noise.
  expect((await call('PUT', '/automations/pause', admin, { paused: true })).status).toBe(200);
});

beforeEach(async () => {
  await setSettings(DEFAULT_SETTINGS);
});

afterAll(async () => {
  await DB.prepare("DELETE FROM users WHERE email LIKE '%@r143.test'").run();
  await DB.prepare(`UPDATE tenants SET plan = 'pro' WHERE id = ?`).bind(TENANT_ID).run();
});

describe('pure rules', () => {
  it('works out the age on the departure date and the band', () => {
    expect(ageOn('2020-07-11', '2032-07-10')).toBe(11);
    expect(ageOn('2020-07-10', '2032-07-10')).toBe(12);
    const bands = [{ key: 'adult', minAge: 12 }, { key: 'child', minAge: 2 }, { key: 'infant', minAge: 0 }].sort((a, b) => b.minAge - a.minAge);
    expect(bandFor(bands, 30)).toBe('adult');
    expect(bandFor(bands, 11)).toBe('child');
    expect(bandFor(bands, 1)).toBe('infant');
    expect(bandFor(bands, null)).toBeNull();
  });

  it('the lifecycle target follows the dates and never goes backwards', () => {
    const d = { status: 'open', start_date: '2030-05-10', end_date: '2030-05-14', booking_cutoff_date: '2030-05-07' };
    expect(lifecycleTarget(d, '2030-05-06')).toBeNull();
    expect(lifecycleTarget(d, '2030-05-07')).toBe('closed');
    expect(lifecycleTarget(d, '2030-05-10')).toBe('departed');
    expect(lifecycleTarget(d, '2030-05-14')).toBe('departed');
    expect(lifecycleTarget(d, '2030-05-15')).toBe('completed');
    expect(lifecycleTarget({ ...d, status: 'closed' }, '2030-05-08')).toBeNull();
    expect(lifecycleTarget({ ...d, status: 'draft' }, '2030-06-01')).toBeNull();
    expect(lifecycleTarget({ ...d, status: 'cancelled' }, '2030-06-01')).toBeNull();
  });
});

describe('holding seats', () => {
  it('holds within capacity, sets the hold expiry, creates the lead and links it to the departure', async () => {
    const dep = await makeDeparture({ capacity: 10 });
    const before = Date.now();
    const b = await holdOk(dep, 'Anna Holder', 3);
    expect(b).toMatchObject({ status: 'held', seats: 3, departureId: dep, source: 'staff', waitlistPosition: null });
    expect(b.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/); // UUIDv7
    const expires = new Date(b.holdExpiresAt).getTime();
    expect(expires).toBeGreaterThan(before + 47.9 * 3_600_000);
    expect(expires).toBeLessThan(Date.now() + 48.1 * 3_600_000);
    expect(await depSeats(dep)).toMatchObject({ capacity: 10, held: 3, confirmed: 0, left: 7 });

    const lead = (await rows('SELECT * FROM leads WHERE id = ?', b.leadId))[0];
    expect(lead).toMatchObject({ departure_id: dep, trip_type: 'group', source: 'manual' });
    expect(lead.travel_date).toBe((await json(await call('GET', `/departures/${dep}`, admin))).data.startDate);
    expect(lead.currency).toBeTruthy();
    expect(await eventCount('seat_booking.held', b.id)).toBe(1);
  });

  it('an existing lead keeps its own travel date; a second request for the same lead is 409 ALREADY_BOOKED', async () => {
    const dep = await makeDeparture({ capacity: 10 });
    const contact = await json(await call('POST', '/contacts', admin, { name: 'Lead Owner', email: `lead.owner.${dep.slice(-6)}@sb.test`, type: 'customer' }));
    const lead = await json(await call('POST', '/leads', admin, {
      contactId: contact.data.id, title: 'Own date lead', destinations: ['Alps'], travelDate: '2031-12-24', tripType: 'group', source: 'manual', assignedTo: ADMIN_ID, currency: 'EUR',
    }));
    expect(lead.success, JSON.stringify(lead)).toBe(true);
    const first = await call('POST', `/departures/${dep}/bookings`, admin, { leadId: lead.data.id, seats: 2 });
    expect(first.status).toBe(201);
    const row = (await rows('SELECT departure_id, travel_date FROM leads WHERE id = ?', lead.data.id))[0];
    expect(row.departure_id).toBe(dep);
    expect(row.travel_date).toBe('2031-12-24');
    const again = await call('POST', `/departures/${dep}/bookings`, admin, { leadId: lead.data.id, seats: 1 });
    expect(again.status).toBe(409);
    expect((await json(again)).error).toMatchObject({ code: 'ALREADY_BOOKED' });
    expect((await call('POST', `/departures/${dep}/bookings`, admin, { leadId: 'no-such-lead', seats: 1 })).status).toBe(404);
  });

  it('when full the party is waitlisted with the next position; waitlisted parties hold nothing', async () => {
    const dep = await makeDeparture({ capacity: 4 });
    await holdOk(dep, 'Full One', 3);
    const w1 = await holdOk(dep, 'Wait One', 2);
    const w2 = await holdOk(dep, 'Wait Two', 4);
    expect(w1).toMatchObject({ status: 'waitlisted', waitlistPosition: 1, holdExpiresAt: null });
    expect(w2).toMatchObject({ status: 'waitlisted', waitlistPosition: 2 });
    expect(await depSeats(dep)).toMatchObject({ held: 3, waitlisted: 6, left: 1 });
    expect(await eventCount('seat_booking.waitlisted', w1.id)).toBe(1);
  });

  it('with the waitlist off a full departure answers 409 SEATS_UNAVAILABLE with the seats left, and leaves no stray lead', async () => {
    await setSettings({ waitlist: { enabled: false } });
    const dep = await makeDeparture({ capacity: 4 });
    await holdOk(dep, 'Only One', 3);
    const leadsBefore = (await rows('SELECT COUNT(*) AS n FROM leads'))[0].n;
    const res = await hold(dep, 'Too Late', 2);
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatchObject({ code: 'SEATS_UNAVAILABLE', details: { seatsLeft: 1 } });
    expect((await rows('SELECT COUNT(*) AS n FROM leads'))[0].n).toBe(leadsBefore);
    // More seats than the whole departure can never fit, waitlist or not.
    await setSettings({ waitlist: { enabled: true } });
    expect((await hold(dep, 'Huge Party', 5)).status).toBe(409);
  });

  it('only an open departure takes public requests; staff may add to a closed one but not to a draft', async () => {
    const draft = await makeDeparture({ capacity: 5, status: 'draft' });
    const res = await hold(draft, 'Draft Person', 1);
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('DEPARTURE_NOT_OPEN');
    const closed = await makeDeparture({ capacity: 5, status: 'closed' });
    expect((await hold(closed, 'Late Staff', 1)).status).toBe(201);
  });

  it('seats follow the passenger count when passengers come with the request', async () => {
    const dep = await makeDeparture({ capacity: 6 });
    const b = await holdOk(dep, 'With Passengers', 1, { passengers: [{ firstName: 'Ann' }, { firstName: 'Bo' }, { firstName: 'Cy' }] });
    expect(b.seats).toBe(3);
    expect(b.passengers.map((p: any) => p.firstName)).toEqual(['Ann', 'Bo', 'Cy']);
  });
});

describe('confirmation', () => {
  it('manual: staff confirm, the hold is cleared, the lead becomes won, and a second confirm is 409', async () => {
    const dep = await makeDeparture({ capacity: 10 });
    const b = await holdOk(dep, 'Manual Confirm', 2);
    expect((await rows('SELECT status FROM leads WHERE id = ?', b.leadId))[0].status).toBe('new');
    const res = await call('POST', `/seat-bookings/${b.id}/confirm`, admin);
    expect(res.status).toBe(200);
    expect((await json(res)).data).toMatchObject({ status: 'confirmed', confirmedBy: ADMIN_ID, holdExpiresAt: null });
    expect((await rows('SELECT status FROM leads WHERE id = ?', b.leadId))[0].status).toBe('won');
    expect(await eventCount('seat_booking.confirmed', b.id)).toBe(1);
    expect(await eventCount('lead.status_changed', b.leadId)).toBe(1);
    expect((await call('POST', `/seat-bookings/${b.id}/confirm`, admin)).status).toBe(409);
    expect(await depSeats(dep)).toMatchObject({ held: 0, confirmed: 2, left: 8 });
  });

  it('the lead stays where it is when the setting is off, or when it is already past the pipeline stage', async () => {
    await setSettings({ markLeadWonOnConfirm: false });
    const dep = await makeDeparture({ capacity: 10 });
    const b = await holdOk(dep, 'No Won', 1);
    expect((await call('POST', `/seat-bookings/${b.id}/confirm`, admin)).status).toBe(200);
    expect((await rows('SELECT status FROM leads WHERE id = ?', b.leadId))[0].status).toBe('new');

    await setSettings({ markLeadWonOnConfirm: true });
    const c = await holdOk(dep, 'Already Booked', 1);
    await DB.prepare(`UPDATE leads SET status = 'booking_confirmed' WHERE id = ?`).bind(c.leadId).run();
    expect((await call('POST', `/seat-bookings/${c.id}/confirm`, admin)).status).toBe(200);
    expect((await rows('SELECT status FROM leads WHERE id = ?', c.leadId))[0].status).toBe('booking_confirmed');
  });

  it('auto_when_available confirms in the same request (departure override), and a full departure still waitlists', async () => {
    const dep = await makeDeparture({ capacity: 3, confirmMode: 'auto_when_available' });
    const b = await holdOk(dep, 'Auto One', 2);
    expect(b).toMatchObject({ status: 'confirmed', confirmedBy: 'auto', holdExpiresAt: null });
    expect((await rows('SELECT status FROM leads WHERE id = ?', b.leadId))[0].status).toBe('won');
    const w = await holdOk(dep, 'Auto Two', 2);
    expect(w.status).toBe('waitlisted');
  });

  it('on_deposit leaves the booking held until the payment recipe confirms it', async () => {
    const dep = await makeDeparture({ capacity: 3, confirmMode: 'on_deposit' });
    expect((await holdOk(dep, 'Deposit Wait', 1)).status).toBe('held');
  });

  it('bulk-confirm reports each booking', async () => {
    const dep = await makeDeparture({ capacity: 10 });
    const a = await holdOk(dep, 'Bulk A', 1);
    const b = await holdOk(dep, 'Bulk B', 1);
    await call('POST', `/seat-bookings/${b.id}/cancel`, admin, { reason: 'changed mind' });
    const res = await json(await call('POST', '/seat-bookings/bulk-confirm', admin, { ids: [a.id, b.id, 'missing'] }));
    expect(res.data.confirmed).toBe(1);
    expect(res.data.results.find((r: any) => r.id === a.id).ok).toBe(true);
    expect(res.data.results.find((r: any) => r.id === b.id)).toMatchObject({ ok: false, code: 'ILLEGAL_TRANSITION' });
    expect(res.data.results.find((r: any) => r.id === 'missing')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('cancel, waitlist and expiry', () => {
  it('cancel frees the seats; in suggest mode the waitlist is left for the recipe', async () => {
    const dep = await makeDeparture({ capacity: 4 });
    const a = await holdOk(dep, 'Cancel A', 3);
    const w = await holdOk(dep, 'Cancel Waiting', 3);
    expect(w.status).toBe('waitlisted');
    const res = await call('POST', `/seat-bookings/${a.id}/cancel`, admin, { reason: 'Customer changed plans' });
    expect(res.status).toBe(200);
    expect((await json(res)).data).toMatchObject({ status: 'cancelled', cancelReason: 'Customer changed plans' });
    expect(await depSeats(dep)).toMatchObject({ held: 0, left: 4 });
    expect((await bookingRow(w.id)).status).toBe('waitlisted');
    expect(await eventCount('seat_booking.cancelled', a.id)).toBe(1);
    expect((await call('POST', `/seat-bookings/${a.id}/cancel`, admin)).status).toBe(409);
  });

  it('cancel in auto_hold mode holds the freed seats for the first fitting party, in order, and skips one that does not fit', async () => {
    await setSettings({ waitlist: { offerMode: 'auto_hold', offerHoldHours: 12 } });
    const dep = await makeDeparture({ capacity: 5 });
    const a = await holdOk(dep, 'Hold A', 4);
    const big = await holdOk(dep, 'Wait Big', 4); // position 1, does not fit 4+? (1 left)
    const small = await holdOk(dep, 'Wait Small', 1); // fits the one free seat at once? no: waitlist only when full
    expect(big.status).toBe('waitlisted');
    expect(small.status).toBe('held'); // one seat was free
    const wide = await holdOk(dep, 'Wait Wide', 2);
    expect(wide).toMatchObject({ status: 'waitlisted', waitlistPosition: 2 });

    await call('POST', `/seat-bookings/${a.id}/cancel`, admin, { reason: 'x' });
    const offered = await bookingRow(big.id);
    expect(offered.status).toBe('held');
    expect(offered.offered_at).toBeTruthy();
    expect(offered.waitlist_position).toBeNull();
    const hours = (new Date(offered.hold_expires_at).getTime() - new Date(offered.offered_at).getTime()) / 3_600_000;
    expect(hours).toBeCloseTo(12, 0);
    expect(await eventCount('waitlist.offered', big.id)).toBe(1);
    // 5 seats: small 1 + big 4 are held, the wide party (2) still waits.
    expect((await bookingRow(wide.id)).status).toBe('waitlisted');
    expect(await depSeats(dep)).toMatchObject({ held: 5, left: 0 });
  });

  it('staff can offer seats to a waitlisted party by hand; it is refused when the seats are not free', async () => {
    const dep = await makeDeparture({ capacity: 2 });
    const a = await holdOk(dep, 'Offer Holder', 2);
    const w = await holdOk(dep, 'Offer Waiter', 2);
    const refused = await call('POST', `/seat-bookings/${w.id}/offer`, admin);
    expect(refused.status).toBe(409);
    expect((await json(refused)).error).toMatchObject({ code: 'SEATS_UNAVAILABLE', details: { seatsLeft: 0 } });
    await call('POST', `/seat-bookings/${a.id}/cancel`, admin);
    const ok = await call('POST', `/seat-bookings/${w.id}/offer`, admin);
    expect(ok.status).toBe(200);
    const offered = (await json(ok)).data;
    expect(offered).toMatchObject({ status: 'held', waitlistPosition: null });
    expect(offered.offeredAt).toBeTruthy();
    expect((await call('POST', `/seat-bookings/${w.id}/offer`, admin)).status).toBe(409); // no longer waitlisted
  });

  it('the expiry job expires held bookings past their hold and offers the seats on; confirmed ones are untouched', async () => {
    await setSettings({ waitlist: { offerMode: 'auto_hold' } });
    const dep = await makeDeparture({ capacity: 3 });
    const stale = await holdOk(dep, 'Stale Hold', 2);
    const fresh = await holdOk(dep, 'Fresh Hold', 1);
    const waiting = await holdOk(dep, 'Expiry Waiter', 2);
    expect(waiting.status).toBe('waitlisted');
    const past = new Date(Date.now() - 60_000).toISOString();
    await DB.prepare('UPDATE seat_bookings SET hold_expires_at = ? WHERE id = ?').bind(past, stale.id).run();

    expect(JOB_SETS.every5.find((j) => j.name === 'departures.expire-holds')?.period).toBe('tick');
    expect(await expireHoldsForTenant(testEnv, TENANT_ID, DB)).toBe(1);
    expect((await bookingRow(stale.id)).status).toBe('expired');
    expect((await bookingRow(fresh.id)).status).toBe('held');
    expect((await bookingRow(waiting.id)).status).toBe('held'); // offered the 2 freed seats
    expect(await eventCount('seat_booking.expired', stale.id)).toBe(1);
    expect(await expireHoldsForTenant(testEnv, TENANT_ID, DB)).toBe(0);

    // A fixed clock: a hold that ends at 12:00 is alive at 11:59 and gone at 12:01.
    const dep2 = await makeDeparture({ capacity: 3 });
    const timed = await holdOk(dep2, 'Timed Hold', 1);
    const noon = '2040-01-01T12:00:00.000Z';
    await DB.prepare('UPDATE seat_bookings SET hold_expires_at = ? WHERE id = ?').bind(noon, timed.id).run();
    const countOf = async (now: string) => {
      // only this departure's booking is considered: other holds in the database end on real dates before 2040
      await DB.prepare(`UPDATE seat_bookings SET hold_expires_at = '2099-01-01T00:00:00.000Z' WHERE status = 'held' AND id != ?`).bind(timed.id).run();
      return expireHoldsForTenant(testEnv, TENANT_ID, DB, new Date(now));
    };
    expect(await countOf('2040-01-01T11:59:00.000Z')).toBe(0);
    expect(await countOf('2040-01-01T12:01:00.000Z')).toBe(1);
    expect((await bookingRow(timed.id)).status).toBe('expired');
  });

  it('raising the capacity gives the new seats to the waitlist (auto_hold) and emits departure.capacity_changed', async () => {
    await setSettings({ waitlist: { offerMode: 'auto_hold' } });
    const dep = await makeDeparture({ capacity: 2 });
    await holdOk(dep, 'Cap Holder', 2);
    const w = await holdOk(dep, 'Cap Waiter', 2);
    expect(w.status).toBe('waitlisted');
    expect((await call('PUT', `/departures/${dep}`, admin, { capacity: 4 })).status).toBe(200);
    expect((await bookingRow(w.id)).status).toBe('held');
    expect(await eventCount('departure.capacity_changed', dep)).toBe(1);
  });

  it('cancelling a waitlisted party frees nothing; cancelling its passengers is part of the cancel', async () => {
    const dep = await makeDeparture({ capacity: 2 });
    await holdOk(dep, 'Fill', 2);
    const w = await holdOk(dep, 'Wait With People', 2, { passengers: [{ firstName: 'P1' }, { firstName: 'P2' }] });
    expect(w.status).toBe('waitlisted');
    await call('POST', `/seat-bookings/${w.id}/cancel`, admin);
    expect((await rows(`SELECT status FROM seat_passengers WHERE seat_booking_id = ?`, w.id)).map((r) => r.status)).toEqual(['cancelled', 'cancelled']);
    expect(await depSeats(dep)).toMatchObject({ held: 2, waitlisted: 0 });
  });
});

describe('moving and changing seats', () => {
  it('moves a booking atomically: conditional insert on the target, the source cancelled with reason moved, passengers follow', async () => {
    const from = await makeDeparture({ capacity: 5 });
    const to = await makeDeparture({ capacity: 5 });
    const b = await holdOk(from, 'Mover', 2, { passengers: [{ firstName: 'M1' }, { firstName: 'M2' }] });
    await call('POST', `/seat-bookings/${b.id}/confirm`, admin);
    const res = await call('POST', `/seat-bookings/${b.id}/move`, admin, { toDepartureId: to });
    expect(res.status).toBe(200);
    const moved = (await json(res)).data;
    expect(moved).toMatchObject({ departureId: to, status: 'confirmed', seats: 2, leadId: b.leadId });
    expect(moved.id).not.toBe(b.id);
    expect(moved.passengers.map((p: any) => p.departureId)).toEqual([to, to]);
    expect(await bookingRow(b.id)).toMatchObject({ status: 'cancelled', cancel_reason: 'moved' });
    expect(await depSeats(from)).toMatchObject({ confirmed: 0, left: 5 });
    expect(await depSeats(to)).toMatchObject({ confirmed: 2, left: 3 });
    expect((await rows('SELECT departure_id FROM leads WHERE id = ?', b.leadId))[0].departure_id).toBe(to);
    // No "mark lost?" for a move: the lead still has an active booking.
    expect((await rows(`SELECT COUNT(*) AS n FROM assistant_suggestions WHERE dedupe_key = ?`, `lead-lost:${b.id}`))[0].n).toBe(0);
  });

  it('a move to a departure without room is 409 and changes nothing; moving to the same or a cancelled one is refused', async () => {
    const from = await makeDeparture({ capacity: 5 });
    const tight = await makeDeparture({ capacity: 1 });
    const b = await holdOk(from, 'Tight Mover', 2);
    const res = await call('POST', `/seat-bookings/${b.id}/move`, admin, { toDepartureId: tight });
    expect(res.status).toBe(409);
    expect((await json(res)).error).toMatchObject({ code: 'SEATS_UNAVAILABLE', details: { seatsLeft: 1 } });
    expect((await bookingRow(b.id)).status).toBe('held');
    expect((await rows('SELECT COUNT(*) AS n FROM seat_bookings WHERE departure_id = ?', tight))[0].n).toBe(0);
    expect((await call('POST', `/seat-bookings/${b.id}/move`, admin, { toDepartureId: from })).status).toBe(400);
    expect((await call('POST', `/seat-bookings/${b.id}/move`, admin, { toDepartureId: 'nope' })).status).toBe(404);
  });

  it('a waitlisted booking moves to the waitlist of the target', async () => {
    const full = await makeDeparture({ capacity: 1 });
    const other = await makeDeparture({ capacity: 1 });
    await holdOk(full, 'Occupant', 1);
    await holdOk(other, 'Other Occupant', 1);
    const w = await holdOk(full, 'Moving Waiter', 1);
    const moved = (await json(await call('POST', `/seat-bookings/${w.id}/move`, admin, { toDepartureId: other }))).data;
    expect(moved).toMatchObject({ status: 'waitlisted', waitlistPosition: 1, departureId: other });
  });

  it('changes seats under the same capacity rule, and freeing seats runs the waitlist', async () => {
    await setSettings({ waitlist: { offerMode: 'auto_hold' } });
    const dep = await makeDeparture({ capacity: 4 });
    const a = await holdOk(dep, 'Grower', 2);
    const w = await holdOk(dep, 'Grow Waiter', 3);
    expect(w.status).toBe('waitlisted');
    const grow = await call('PUT', `/seat-bookings/${a.id}/seats`, admin, { seats: 5 });
    expect(grow.status).toBe(409);
    expect((await json(grow)).error).toMatchObject({ code: 'SEATS_UNAVAILABLE', details: { seatsLeft: 4 } });
    expect((await call('PUT', `/seat-bookings/${a.id}/seats`, admin, { seats: 4 })).status).toBe(200);
    expect(await depSeats(dep)).toMatchObject({ held: 4, left: 0 });
    expect((await call('PUT', `/seat-bookings/${a.id}/seats`, admin, { seats: 1 })).status).toBe(200);
    expect((await bookingRow(w.id)).status).toBe('held'); // 3 freed seats fit the waiting party
  });
});

describe('passengers', () => {
  async function departureWithStops(capacity: number) {
    const dep = await makeDeparture({ capacity });
    const stops = (await json(await call('PUT', `/departures/${dep}/stops`, admin, {
      stops: [{ name: 'Central station', kind: 'pickup', localTime: '07:30' }, { name: 'Airport', kind: 'pickup', localTime: '08:30' }],
    }))).data;
    return { dep, stops: stops as Array<{ id: string }> };
  }

  it('replaces the list, sets the seats to the number of passengers and works out the age band on the departure date', async () => {
    const { dep, stops } = await departureWithStops(6);
    const b = await holdOk(dep, 'People Holder', 1);
    const start = (await json(await call('GET', `/departures/${dep}`, admin))).data.startDate as string;
    const year = Number(start.slice(0, 4));
    const res = await call('PUT', `/seat-bookings/${b.id}/passengers`, admin, {
      passengers: [
        { firstName: 'Ada', lastName: 'Adult', dateOfBirth: `${year - 40}-01-01`, pickupStopId: stops[0].id, roomType: 'double', gender: 'female' },
        { firstName: 'Kid', lastName: 'Adult', dateOfBirth: `${year - 8}-01-01`, pickupStopId: stops[0].id },
        { firstName: 'Baby', lastName: 'Adult', ageYears: 1, pickupStopId: stops[1].id },
      ],
    });
    expect(res.status).toBe(200);
    const data = (await json(res)).data;
    expect(data.seats).toBe(3);
    expect(data.passengers.map((p: any) => [p.firstName, p.bandKey])).toEqual([['Ada', 'adult'], ['Kid', 'child'], ['Baby', 'infant']]);
    expect(await depSeats(dep)).toMatchObject({ held: 3, left: 3 });

    // The same list with ids updates in place; leaving one out removes it and gives its seat back.
    const [ada, kid] = data.passengers;
    const trimmed = await json(await call('PUT', `/seat-bookings/${b.id}/passengers`, admin, {
      passengers: [{ id: ada.id, firstName: 'Ada B', pickupStopId: stops[0].id }, { id: kid.id, firstName: 'Kid', pickupStopId: stops[0].id }],
    }));
    expect(trimmed.data.seats).toBe(2);
    expect(trimmed.data.passengers.map((p: any) => p.id)).toEqual([ada.id, kid.id]);
    expect(trimmed.data.passengers[0].firstName).toBe('Ada B');
    expect(await depSeats(dep)).toMatchObject({ held: 2, left: 4 });
  });

  it('validates required fields, the pickup stop, the room type and the date of birth with every problem listed', async () => {
    const { dep, stops } = await departureWithStops(6);
    const other = await departureWithStops(6);
    const b = await holdOk(dep, 'Validator', 1);
    const put = (passengers: unknown[]) => call('PUT', `/seat-bookings/${b.id}/passengers`, admin, { passengers });

    const missing = await put([{ firstName: '' }, { firstName: 'No Stop' }]);
    expect(missing.status).toBe(400);
    const body = await json(missing);
    expect(body.error.code).toBe('PASSENGER_INVALID');
    expect(body.error.details.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ index: 0, field: 'name' }), expect.objectContaining({ index: 0, field: 'pickupPoint' }), expect.objectContaining({ index: 1, field: 'pickupPoint' }),
    ]));

    const foreign = await put([{ firstName: 'Wrong Stop', pickupStopId: other.stops[0].id }]);
    expect(foreign.status).toBe(400);
    expect((await json(foreign)).error.code).toBe('INVALID_PICKUP_STOP');

    const room = await put([{ firstName: 'Odd Room', pickupStopId: stops[0].id, roomType: 'penthouse' }]);
    expect(room.status).toBe(400);
    expect((await json(room)).error.details.errors[0]).toMatchObject({ field: 'roomType' });

    const born = await put([{ firstName: 'Time Traveller', pickupStopId: stops[0].id, dateOfBirth: '2099-01-01' }]);
    expect(born.status).toBe(400);
    expect((await bookingRow(b.id)).seats).toBe(1); // nothing changed
    // A required field that is collected by the traveller later is not demanded from staff.
    await setSettings({ passengerFields: [{ key: 'name', label: 'Name', required: true, collectOn: 'booking' }, { key: 'nationality', label: 'Nationality', required: true, collectOn: 'self_service' }] });
    expect((await put([{ firstName: 'Self Service' }])).status).toBe(200);
  });

  it('custom required fields live in extraFields; more passengers than free seats is 409 and changes nothing', async () => {
    await setSettings({
      passengerFields: [
        { key: 'name', label: 'Name', required: true, collectOn: 'booking' },
        { key: 'shirtSize', label: 'Shirt size', required: true, collectOn: 'staff_only', custom: true, type: 'select', options: ['S', 'M', 'L'] },
      ],
    });
    const dep = await makeDeparture({ capacity: 3 });
    const b = await holdOk(dep, 'Custom Fields', 1, { passengers: [{ firstName: 'Sam', extraFields: { shirtSize: 'M' } }] });
    expect(b.passengers[0].extraFields).toEqual({ shirtSize: 'M' });
    const noSize = await call('PUT', `/seat-bookings/${b.id}/passengers`, admin, { passengers: [{ firstName: 'Sam' }] });
    expect((await json(noSize)).error.details.errors[0]).toMatchObject({ field: 'shirtSize' });
    const badSize = await call('PUT', `/seat-bookings/${b.id}/passengers`, admin, { passengers: [{ firstName: 'Sam', extraFields: { shirtSize: 'XXL' } }] });
    expect(badSize.status).toBe(400);
    const tooMany = await call('PUT', `/seat-bookings/${b.id}/passengers`, admin, {
      passengers: ['A', 'B', 'C', 'D'].map((n) => ({ firstName: n, extraFields: { shirtSize: 'S' } })),
    });
    expect(tooMany.status).toBe(409);
    expect((await json(tooMany)).error).toMatchObject({ code: 'SEATS_UNAVAILABLE', details: { seatsLeft: 3 } });
    expect((await bookingRow(b.id)).seats).toBe(1);
  });

  it('createTravellers links or creates travellers under the booking contact', async () => {
    const dep = await makeDeparture({ capacity: 5 });
    const b = await holdOk(dep, 'Traveller Maker', 2);
    const existing = await json(await call('POST', '/travellers', admin, { contactId: b.contactId, firstName: 'Already', lastName: 'There', fullNamePassport: 'Already There' }));
    const existingId = existing.data?.id;
    const res = await call('PUT', `/seat-bookings/${b.id}/passengers`, admin, {
      createTravellers: true,
      passengers: [
        { firstName: 'New', lastName: 'Person', dateOfBirth: '1990-02-03', gender: 'male', extraFields: { nationality: 'NL', documentNumber: 'X123' } },
        ...(existingId ? [{ firstName: 'Already', lastName: 'There', travellerId: existingId }] : [{ firstName: 'Second', lastName: 'Person' }]),
      ],
    });
    expect(res.status).toBe(200);
    const passengers = (await json(res)).data.passengers;
    expect(passengers.every((p: any) => p.travellerId)).toBe(true);
    const created = (await rows('SELECT * FROM travellers WHERE id = ?', passengers[0].travellerId))[0];
    expect(created).toMatchObject({ contact_id: b.contactId, first_name: 'New', last_name: 'Person', date_of_birth: '1990-02-03', nationality: 'NL', passport_number: 'X123' });
    if (existingId) expect(passengers[1].travellerId).toBe(existingId);
    const unknown = await call('PUT', `/seat-bookings/${b.id}/passengers`, admin, { passengers: [{ firstName: 'Ghost', travellerId: 'no-such' }] });
    expect(unknown.status).toBe(400);
  });
});

describe('lists, lead endpoints and the lost suggestion', () => {
  it('lists the bookings of a departure with passenger counts, a status filter and a cursor', async () => {
    const dep = await makeDeparture({ capacity: 10 });
    await holdOk(dep, 'List A', 1, { passengers: [{ firstName: 'A1' }] });
    const bb = await holdOk(dep, 'List B', 2);
    await holdOk(dep, 'List C', 1);
    await call('POST', `/seat-bookings/${bb.id}/cancel`, admin);
    const all = await json(await call('GET', `/departures/${dep}/bookings`, admin));
    expect(all.data).toHaveLength(3);
    expect(all.data[0]).toMatchObject({ passengersCount: 1, contactName: 'List A' });
    const active = await json(await call('GET', `/departures/${dep}/bookings?status=held,confirmed`, admin));
    expect(active.data.map((r: any) => r.contactName)).toEqual(['List A', 'List C']);
    const page1 = await json(await call('GET', `/departures/${dep}/bookings?limit=2`, admin));
    expect(page1.pagination).toMatchObject({ total: 3, hasMore: true });
    const page2 = await json(await call('GET', `/departures/${dep}/bookings?limit=2&cursor=${encodeURIComponent(page1.pagination.nextCursor)}`, admin));
    expect(page2.data).toHaveLength(1);
    expect((await call('GET', '/departures/missing/bookings', admin)).status).toBe(404);
  });

  it('GET /leads/:id/seat-bookings and POST /leads/:id/hold-seats', async () => {
    const dep = await makeDeparture({ capacity: 4 });
    const contact = await json(await call('POST', '/contacts', admin, { name: 'Hold Seats Lead', email: `hs.${dep.slice(-6)}@sb.test`, type: 'customer' }));
    const lead = await json(await call('POST', '/leads', admin, {
      contactId: contact.data.id, title: 'Hold seats lead', destinations: ['Alps'], travelDate: '2031-11-01', tripType: 'group', source: 'manual', assignedTo: ADMIN_ID, currency: 'EUR',
    }));
    const hs = await call('POST', `/leads/${lead.data.id}/hold-seats`, sales, { departureId: dep, seats: 2 });
    expect(hs.status).toBe(201);
    expect((await json(hs)).data).toMatchObject({ status: 'held', seats: 2, leadId: lead.data.id });
    const list = await json(await call('GET', `/leads/${lead.data.id}/seat-bookings`, admin));
    expect(list.data).toHaveLength(1);
    expect(list.data[0]).toMatchObject({ departureId: dep, status: 'held', departureStatus: 'open' });
    expect(list.data[0].tourTitle).toContain('Seat tour');
    expect((await call('POST', `/leads/${lead.data.id}/hold-seats`, accountant, { departureId: dep, seats: 1 })).status).toBe(403);
  });

  it('cancelling the last active booking suggests marking the lead lost; applying it does; another active booking suppresses it', async () => {
    expect((await call('PUT', '/automations/pause', admin, { paused: false })).status).toBe(200);
    try {
      const dep = await makeDeparture({ capacity: 6 });
      const a = await holdOk(dep, 'Lost Candidate', 1);
      const cancelled = await call('POST', `/seat-bookings/${a.id}/cancel`, admin, { reason: 'Found a cheaper trip' });
      expect(cancelled.status).toBe(200);
      const pending = (await json(await call('GET', `/assistant/suggestions?leadId=${a.leadId}`, admin))).data.filter((s: any) => s.action.type === 'mark_lead_lost');
      expect(pending).toHaveLength(1);
      expect(pending[0].params).toMatchObject({ leadId: a.leadId, reason: 'Found a cheaper trip' });
      const applied = await call('POST', `/assistant/suggestions/${pending[0].id}/apply`, admin, {});
      expect(applied.status).toBe(200);
      expect((await rows('SELECT status, lost_reason FROM leads WHERE id = ?', a.leadId))[0]).toMatchObject({ status: 'lost', lost_reason: 'Found a cheaper trip' });

      // A lead with two bookings: the first cancel is not the last.
      const dep2 = await makeDeparture({ capacity: 6 });
      const dep3 = await makeDeparture({ capacity: 6 });
      const first = await holdOk(dep2, 'Two Trips', 1);
      expect((await call('POST', `/leads/${first.leadId}/hold-seats`, admin, { departureId: dep3, seats: 1 })).status).toBe(201);
      await call('POST', `/seat-bookings/${first.id}/cancel`, admin);
      expect((await rows(`SELECT COUNT(*) AS n FROM assistant_suggestions WHERE dedupe_key = ?`, `lead-lost:${first.id}`))[0].n).toBe(0);
    } finally {
      await call('PUT', '/automations/pause', admin, { paused: true });
    }
  });
});

describe('events', () => {
  it('departure.seats_low and departure.full fire on the transition only', async () => {
    const dep = await makeDeparture({ capacity: 12 });
    await holdOk(dep, 'Low 1', 1); // 11 left
    expect(await eventCount('departure.seats_low', dep)).toBe(0);
    await holdOk(dep, 'Low 2', 1); // 10 left: crosses the line
    expect(await eventCount('departure.seats_low', dep)).toBe(1);
    await holdOk(dep, 'Low 3', 1); // 9 left: already low
    expect(await eventCount('departure.seats_low', dep)).toBe(1);
    expect(await eventCount('departure.full', dep)).toBe(0);
    const last = await holdOk(dep, 'Low 4', 9); // 0 left
    expect(await eventCount('departure.full', dep)).toBe(1);
    expect(await eventCount('departure.seats_low', dep)).toBe(1);
    // Free a seat and take it again: the transition happens again.
    await call('POST', `/seat-bookings/${last.id}/cancel`, admin);
    await holdOk(dep, 'Low 5', 9);
    expect(await eventCount('departure.full', dep)).toBe(2);
    const payload = JSON.parse((await rows(`SELECT payload FROM domain_events WHERE type = 'departure.full' AND entity_id = ?`, dep))[0].payload);
    expect(payload).toMatchObject({ departureId: dep, left: 0, capacity: 12 });
  });

  it('manual status changes emit departure.status_changed', async () => {
    const dep = await makeDeparture({ capacity: 3 });
    expect((await call('POST', `/departures/${dep}/status`, admin, { status: 'closed' })).status).toBe(200);
    const events = await rows(`SELECT payload FROM domain_events WHERE type = 'departure.status_changed' AND entity_id = ? ORDER BY created_at, id`, dep);
    expect(events.map((e) => JSON.parse(e.payload))).toEqual(expect.arrayContaining([expect.objectContaining({ from: 'open', to: 'closed' })]));
  });
});

describe('departure lifecycle job', () => {
  it('closes at the cut-off date, departs on the start date and completes the day after the end, with events', async () => {
    const dep = await makeDeparture({ capacity: 5, start: '2030-05-10' });
    const stateAt = async (iso: string) => {
      await runDepartureLifecycle(testEnv, TENANT_ID, DB, new Date(iso));
      return (await rows('SELECT status FROM departures WHERE id = ?', dep))[0].status;
    };
    expect(JOB_SETS.every5.find((j) => j.name === 'departures.lifecycle')?.period).toBe('local-day');
    expect(await stateAt('2030-05-06T10:00:00Z')).toBe('open');
    expect(await stateAt('2030-05-07T10:00:00Z')).toBe('closed'); // booking cut-off date
    expect(await stateAt('2030-05-09T10:00:00Z')).toBe('closed');
    expect(await stateAt('2030-05-10T10:00:00Z')).toBe('departed');
    expect(await stateAt('2030-05-14T10:00:00Z')).toBe('departed'); // the end date itself
    expect(await stateAt('2030-05-15T10:00:00Z')).toBe('completed');
    const steps = (await rows(`SELECT payload FROM domain_events WHERE type = 'departure.status_changed' AND entity_id = ?`, dep)).map((e) => JSON.parse(e.payload)).filter((p) => p.automatic);
    expect(steps.map((s) => `${s.from}>${s.to}`)).toEqual(['open>closed', 'closed>departed', 'departed>completed']);
  });

  it('catches up a departure that was missed for days, and leaves drafts and cancelled departures alone', async () => {
    const missed = await makeDeparture({ capacity: 5, start: '2030-07-10' });
    const draft = await makeDeparture({ capacity: 5, start: '2030-07-11', status: 'draft' });
    await runDepartureLifecycle(testEnv, TENANT_ID, DB, new Date('2030-08-20T10:00:00Z'));
    expect((await rows('SELECT status FROM departures WHERE id = ?', missed))[0].status).toBe('completed');
    expect((await rows('SELECT status FROM departures WHERE id = ?', draft))[0].status).toBe('draft');
  });
});

describe('permissions and the feature gate', () => {
  it('a salesperson can hold, confirm and cancel (edit), an accountant can only read', async () => {
    const dep = await makeDeparture({ capacity: 6 });
    const res = await hold(dep, 'Sales Customer', 1, sales);
    expect(res.status).toBe(201);
    const b = (await json(res)).data;
    expect((await call('GET', `/seat-bookings/${b.id}`, sales)).status).toBe(200);
    expect((await call('POST', `/seat-bookings/${b.id}/confirm`, sales)).status).toBe(200);
    expect((await call('POST', `/seat-bookings/${b.id}/cancel`, sales)).status).toBe(200);

    const other = await holdOk(dep, 'Admin Customer', 1);
    expect((await call('GET', `/seat-bookings/${other.id}`, accountant)).status).toBe(200);
    expect((await call('GET', `/departures/${dep}/bookings`, accountant)).status).toBe(200);
    expect((await hold(dep, 'Accountant Try', 1, accountant)).status).toBe(403);
    for (const [method, path, body] of [
      ['POST', `/seat-bookings/${other.id}/confirm`, {}], ['POST', `/seat-bookings/${other.id}/cancel`, {}], ['POST', `/seat-bookings/${other.id}/offer`, {}],
      ['POST', `/seat-bookings/${other.id}/move`, { toDepartureId: dep }], ['PUT', `/seat-bookings/${other.id}/passengers`, { passengers: [] }],
      ['POST', '/seat-bookings/bulk-confirm', { ids: [other.id] }],
    ] as const) {
      expect((await call(method, path, accountant, body)).status, `${method} ${path}`).toBe(403);
    }
    expect((await call('GET', `/seat-bookings/${other.id}`, null)).status).toBe(401);
    expect((await call('GET', '/seat-bookings/does-not-exist', admin)).status).toBe(404);
  });

  it('with the feature off every seat route answers the feature-gate 403', async () => {
    const dep = await makeDeparture({ capacity: 3 });
    const b = await holdOk(dep, 'Gate Customer', 1);
    await DB.prepare(`UPDATE tenants SET plan = 'basic' WHERE id = ?`).bind(TENANT_ID).run();
    try {
      for (const [method, path, body] of [
        ['GET', `/seat-bookings/${b.id}`, undefined], ['POST', `/seat-bookings/${b.id}/confirm`, {}], ['POST', '/seat-bookings/bulk-confirm', { ids: [b.id] }],
        ['GET', `/departures/${dep}/bookings`, undefined], ['GET', `/leads/${b.leadId}/seat-bookings`, undefined],
        ['POST', `/leads/${b.leadId}/hold-seats`, { departureId: dep, seats: 1 }],
      ] as const) {
        const res = await call(method, path, admin, body);
        expect(res.status, `${method} ${path}`).toBe(403);
        expect(await json(res)).toMatchObject({ featureKey: 'group_departures', upgrade: true });
      }
    } finally {
      await DB.prepare(`UPDATE tenants SET plan = 'pro' WHERE id = ?`).bind(TENANT_ID).run();
    }
    expect((await call('GET', `/seat-bookings/${b.id}`, admin)).status).toBe(200);
  });
});
