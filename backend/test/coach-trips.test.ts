import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';
import { toUtcIso } from '../src/services/fleet/coach-trips';

// R145: coach trips, staff API: ordered stops, passengers by stop, ticks, head count, trips made from a departure.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

let admin = '';
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

async function setFlag(feature: string, enabled: boolean | null) {
  await DB.prepare('DELETE FROM tenant_feature_flags WHERE tenant_id = ? AND feature_key = ?').bind(TENANT_ID, feature).run();
  if (enabled !== null) {
    await DB.prepare('INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES (?, ?, ?, ?)').bind(`r145-${feature}`, TENANT_ID, feature, enabled ? 1 : 0).run();
  }
}

const TRIP_TIMES = { pickupDatetime: '2032-06-15T05:00:00.000Z', dropDatetime: '2032-06-15T20:00:00.000Z' };

/** An ad-hoc coach trip (no departure) with the given stops. */
async function makeCoachTrip(stops: Array<Record<string, unknown>> = [], extra: Record<string, unknown> = {}) {
  const res = await call('POST', '/fleet/trips', admin, { tripKind: 'coach', ...TRIP_TIMES, pickupLocation: 'Depot', dropLocation: 'Hotel', stops, ...extra });
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  return (await json(res)).data;
}

async function makeCrew(name: string, crewRole: string) {
  seq += 1;
  const res = await call('POST', '/fleet/drivers', admin, { name, phone: `+9198${String(7000000 + seq * 13).padStart(8, '0')}`, crewRole });
  expect(res.status, name).toBe(201);
  return (await json(res)).data;
}

/** A departure with three stops, optionally coaches, and open for booking. */
async function makeDeparture(opts: { vehicles?: Array<Record<string, unknown>>; tourLeaderDriverId?: string } = {}) {
  seq += 1;
  const tour = await json(await call('POST', '/tours', admin, { code: `CT${seq}`, title: `Coach tour ${seq}`, destination: 'Alps', durationDays: 3, defaultCapacity: 49 }));
  const dep = await json(
    await call('POST', '/departures', admin, {
      tourId: tour.data.id, startDate: `2032-07-0${(seq % 9) + 1}`, startTime: '07:00', capacityMode: 'manual', capacity: 40,
      ...(opts.tourLeaderDriverId && { tourLeaderDriverId: opts.tourLeaderDriverId }),
    }),
  );
  const id = dep.data.id as string;
  const stopsRes = await call('PUT', `/departures/${id}/stops`, admin, {
    stops: [
      { name: 'Utrecht Centraal', localTime: '07:00', documentsCheck: true },
      { name: 'Amersfoort', localTime: '07:40' },
      { name: 'Apeldoorn', localTime: '08:20' },
    ],
  });
  expect(stopsRes.status).toBe(200);
  const stops = (await json(stopsRes)).data as Array<{ id: string; name: string }>;
  if (opts.vehicles) expect((await call('PUT', `/departures/${id}/vehicles`, admin, { vehicles: opts.vehicles })).status).toBe(200);
  expect((await call('POST', `/departures/${id}/status`, admin, { status: 'open' })).status).toBe(200);
  return { id, stops };
}

async function bookParty(depId: string, name: string, pickups: string[]) {
  const res = await call('POST', `/departures/${depId}/bookings`, admin, {
    contact: { name, email: `${name.toLowerCase().replace(/\W+/g, '.')}.${depId.slice(-6)}@coach.test`, phone: `+3161234${String(1000 + ++seq)}` },
    passengers: pickups.map((pickupStopId, i) => ({ firstName: `${name}`, lastName: `P${i + 1}`, pickupStopId })),
  });
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  return (await json(res)).data;
}

const eventCount = async (type: string, entityId: string) =>
  (await rows(`SELECT COUNT(*) AS n FROM domain_events WHERE type = ? AND entity_id = ?`, type, entityId))[0].n as number;

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  admin = await login('admin@e2e.test');
  await DB.prepare(`INSERT INTO settings (key, value) VALUES ('timezone', 'Europe/Amsterdam') ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run();
  expect((await call('PUT', '/automations/pause', admin, { paused: true })).status).toBe(200);
});

afterAll(async () => {
  await setFlag('coach_trips', null);
  await setFlag('group_departures', null);
});

describe('times', () => {
  it('reads a wall-clock time in the agency zone and keeps an instant', () => {
    expect(toUtcIso('2032-06-15T07:30', 'Europe/Amsterdam')).toBe('2032-06-15T05:30:00.000Z');
    expect(toUtcIso('2032-12-15 07:30', 'Europe/Amsterdam')).toBe('2032-12-15T06:30:00.000Z');
    expect(toUtcIso('2032-06-15T07:30:00+02:00', 'Asia/Tokyo')).toBe('2032-06-15T05:30:00.000Z');
    expect(() => toUtcIso('soon', 'Europe/Amsterdam')).toThrow();
  });
});

describe('stops of a coach trip', () => {
  it('replaces the ordered list: updates in place, adds, removes, and keeps the arrival of a kept stop', async () => {
    const trip = await makeCoachTrip([
      { name: 'Stop A', scheduledAt: '2032-06-15T07:00' },
      { name: 'Stop B', scheduledAt: '2032-06-15T07:45', documentsCheck: true },
      { name: 'Stop C' },
    ]);
    expect(trip.tripKind).toBe('coach');
    const first = (await json(await call('GET', `/fleet/trips/${trip.id}/stops`, admin))).data;
    expect(first.map((s: any) => s.name)).toEqual(['Stop A', 'Stop B', 'Stop C']);
    expect(first.map((s: any) => s.sortOrder)).toEqual([0, 1, 2]);
    expect(first[0].scheduledAt).toBe('2032-06-15T05:00:00.000Z');
    expect(first[1].documentsCheck).toBe(true);
    expect(first[2].scheduledAt).toBeNull();

    expect((await call('POST', `/fleet/trips/${trip.id}/stops/${first[0].id}/arrive`, admin)).status).toBe(200);
    const pax = await json(await call('POST', `/fleet/trips/${trip.id}/passengers`, admin, { name: 'Riders at C', tripStopId: first[2].id }));

    // C first, A second, B removed, a new D last
    const res = await call('PUT', `/fleet/trips/${trip.id}/stops`, admin, {
      stops: [{ id: first[2].id, name: 'Stop C' }, { id: first[0].id, name: 'Stop A renamed', scheduledAt: '2032-06-15T07:05' }, { name: 'Stop D', lat: 52.1, lng: 5.1 }],
    });
    expect(res.status).toBe(200);
    const second = (await json(res)).data;
    expect(second.map((s: any) => s.name)).toEqual(['Stop C', 'Stop A renamed', 'Stop D']);
    expect(second.map((s: any) => s.sortOrder)).toEqual([0, 1, 2]);
    expect(second[1].id).toBe(first[0].id);
    expect(second[1].status).toBe('arrived');
    expect(second[1].scheduledAt).toBe('2032-06-15T05:05:00.000Z');
    expect(second[2].lat).toBe(52.1);

    // the passengers of a removed stop stay on the trip without a stop
    const grouped = (await json(await call('GET', `/fleet/trips/${trip.id}/passengers`, admin))).data;
    expect(grouped.stops.map((s: any) => s.name)).toEqual(['Stop C', 'Stop A renamed', 'Stop D']);
    expect(grouped.stops[0].passengers.map((p: any) => p.id)).toEqual([pax.data.id]);

    const removedC = await call('PUT', `/fleet/trips/${trip.id}/stops`, admin, { stops: [{ id: first[0].id, name: 'Stop A renamed' }] });
    expect(removedC.status).toBe(200);
    const after = (await json(await call('GET', `/fleet/trips/${trip.id}/passengers`, admin))).data;
    expect(after.unassigned.map((p: any) => p.id)).toEqual([pax.data.id]);
  });

  it('refuses a foreign stop id and a trip that is not a coach trip', async () => {
    const a = await makeCoachTrip([{ name: 'A1' }]);
    const b = await makeCoachTrip([{ name: 'B1' }]);
    const bStops = (await json(await call('GET', `/fleet/trips/${b.id}/stops`, admin))).data;
    const foreign = await call('PUT', `/fleet/trips/${a.id}/stops`, admin, { stops: [{ id: bStops[0].id, name: 'B1' }] });
    expect(foreign.status).toBe(400);
    expect((await json(foreign)).error.code).toBe('UNKNOWN_STOP');

    const vehicle = (await json(await call('POST', '/fleet/vehicles', admin, { registrationNumber: `CT-${++seq}`, type: 'sedan', seatingCapacity: 4 }))).data;
    const driver = await makeCrew('Plain Transfer Driver', 'driver');
    const transfer = await call('POST', '/fleet/trips', admin, { vehicleId: vehicle.id, driverId: driver.id, ...TRIP_TIMES });
    expect(transfer.status).toBe(201);
    const transferTrip = (await json(transfer)).data;
    expect(transferTrip.tripKind).toBe('transfer');
    expect(transferTrip.stopCount).toBeUndefined();
    const res = await call('PUT', `/fleet/trips/${transferTrip.id}/stops`, admin, { stops: [{ name: 'X' }] });
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('NOT_COACH_TRIP');
  });

  it('a transfer still needs a vehicle and a driver; a coach trip does not', async () => {
    const none = await call('POST', '/fleet/trips', admin, { ...TRIP_TIMES });
    expect(none.status).toBe(400);
    expect((await json(none)).error.message).toContain('Vehicle is required');
    const vehicle = (await json(await call('POST', '/fleet/vehicles', admin, { registrationNumber: `CT-${++seq}`, type: 'sedan', seatingCapacity: 4 }))).data;
    const noDriver = await call('POST', '/fleet/trips', admin, { vehicleId: vehicle.id, ...TRIP_TIMES });
    expect(noDriver.status).toBe(400);
    expect((await json(noDriver)).error.message).toContain('Driver is required');
    const coach = await makeCoachTrip();
    expect(coach.vehicleId).toBeNull();
    expect(coach.driverId).toBeNull();
  });

  it('takes a tour leader only from crew with that role', async () => {
    const leader = await makeCrew('Lena Leader', 'tour_leader');
    const driverOnly = await makeCrew('Dirk Driver', 'driver');
    const both = await makeCrew('Bo Both', 'both');
    const bad = await call('POST', '/fleet/trips', admin, { tripKind: 'coach', tourLeaderId: driverOnly.id, ...TRIP_TIMES });
    expect(bad.status).toBe(400);
    const ok = await makeCoachTrip([], { tourLeaderId: leader.id });
    expect(ok.tourLeaderId).toBe(leader.id);
    expect(ok.tourLeaderName).toBe('Lena Leader');
    const ok2 = await call('PUT', `/fleet/trips/${ok.id}`, admin, { tourLeaderId: both.id });
    expect(ok2.status).toBe(200);
    expect((await json(ok2)).data.tourLeaderName).toBe('Bo Both');

    const list = await json(await call('GET', '/fleet/drivers?crewRole=tour_leader&limit=100', admin));
    const names = list.data.map((d: any) => d.name);
    expect(names).toContain('Lena Leader');
    expect(names).toContain('Bo Both');
    expect(names).not.toContain('Dirk Driver');
    const drivers = (await json(await call('GET', '/fleet/drivers?crewRole=driver&limit=100', admin))).data.map((d: any) => d.name);
    expect(drivers).toContain('Dirk Driver');
    expect(drivers).toContain('Bo Both');
    expect(drivers).not.toContain('Lena Leader');
  });
});

describe('trips from a departure', () => {
  it('copies the stops and the passengers by pickup stop, with the crew of the departure', async () => {
    const leader = await makeCrew('Tessa Tourleader', 'tour_leader');
    const driver = await makeCrew('Dan Driver', 'driver');
    const dep = await makeDeparture({ tourLeaderDriverId: leader.id, vehicles: [{ label: 'Coach 1', capacity: 40, driverId: driver.id }] });
    const [utrecht, amersfoort, apeldoorn] = dep.stops;
    await bookParty(dep.id, 'Smit', [utrecht.id, utrecht.id, amersfoort.id]);
    await bookParty(dep.id, 'Jansen', [apeldoorn.id]);

    const res = await call('POST', `/departures/${dep.id}/trips`, admin);
    expect(res.status).toBe(201);
    const body = (await json(res)).data;
    expect(body.created).toBe(true);
    expect(body.trips).toHaveLength(1);
    const trip = body.trips[0];
    expect(trip.driverId).toBe(driver.id);
    expect(trip.tourLeaderId).toBe(leader.id);

    const detail = (await json(await call('GET', `/fleet/trips/${trip.id}`, admin))).data;
    expect(detail.tripKind).toBe('coach');
    expect(detail.departureId).toBe(dep.id);
    expect(detail.stops.map((s: any) => s.name)).toEqual(['Utrecht Centraal', 'Amersfoort', 'Apeldoorn']);
    expect(detail.stops[0].documentsCheck).toBe(true);
    expect(detail.stops[0].departureStopId).toBe(utrecht.id);
    // 07:00 local on the start day, in the agency zone
    expect(detail.stops[0].scheduledAt).toMatch(/T0[56]:00:00\.000Z$/);
    expect(detail.headcount).toMatchObject({ expected: 4, boarded: 0, noShow: 0, pending: 4 });

    const grouped = (await json(await call('GET', `/fleet/trips/${trip.id}/passengers`, admin))).data;
    expect(grouped.stops.map((s: any) => s.passengers.length)).toEqual([2, 1, 1]);
    expect(grouped.unassigned).toEqual([]);
    const first = grouped.stops[0].passengers[0];
    expect(first.name).toContain('Smit');
    expect(first.phone).toMatch(/^\+3161234\d{4}$/);
    expect(first.seatPassengerId).toBeTruthy();
    expect(first.contactId).toBeTruthy();
  });

  it('is idempotent: a second call returns the same trips; replace rebuilds trips without ticks only', async () => {
    const dep = await makeDeparture({ vehicles: [{ label: 'Coach A', capacity: 40 }] });
    await bookParty(dep.id, 'Idem', [dep.stops[0].id, dep.stops[1].id]);
    const one = (await json(await call('POST', `/departures/${dep.id}/trips`, admin))).data;
    expect(one.created).toBe(true);
    const again = await call('POST', `/departures/${dep.id}/trips`, admin);
    expect(again.status).toBe(200);
    const two = (await json(again)).data;
    expect(two.created).toBe(false);
    expect(two.trips.map((t: any) => t.id)).toEqual(one.trips.map((t: any) => t.id));
    expect((await rows(`SELECT COUNT(*) AS n FROM trip_assignments WHERE departure_id = ? AND is_deleted = 0`, dep.id))[0].n).toBe(1);

    // a late booking appears after a rebuild
    await bookParty(dep.id, 'Late', [dep.stops[2].id]);
    const rebuilt = await call('POST', `/departures/${dep.id}/trips?replace=1`, admin);
    expect(rebuilt.status).toBe(201);
    const three = (await json(rebuilt)).data;
    expect(three.trips[0].id).not.toBe(one.trips[0].id);
    expect((await json(await call('GET', `/fleet/trips/${three.trips[0].id}/headcount`, admin))).data.expected).toBe(3);
    expect((await rows(`SELECT COUNT(*) AS n FROM trip_assignments WHERE departure_id = ? AND is_deleted = 0`, dep.id))[0].n).toBe(1);

    // after a tick the trip is kept
    const grouped = (await json(await call('GET', `/fleet/trips/${three.trips[0].id}/passengers`, admin))).data;
    const pid = grouped.stops[0].passengers[0].id;
    expect((await call('PUT', `/fleet/trips/${three.trips[0].id}/passengers/${pid}`, admin, { boarding: 'boarded', opId: 'keep-1' })).status).toBe(200);
    const refused = await call('POST', `/departures/${dep.id}/trips?replace=1`, admin);
    expect(refused.status).toBe(409);
    expect((await json(refused)).error.code).toBe('TRIP_HAS_TICKS');
  });

  it('makes one trip per coach and fills them in order; no coach means one trip', async () => {
    const dep = await makeDeparture({ vehicles: [{ label: 'Coach 1', capacity: 2 }, { label: 'Coach 2', capacity: 5 }] });
    await bookParty(dep.id, 'Split', [dep.stops[0].id, dep.stops[0].id, dep.stops[1].id, dep.stops[2].id]);
    const res = (await json(await call('POST', `/departures/${dep.id}/trips`, admin))).data;
    expect(res.trips).toHaveLength(2);
    const counts = [];
    for (const t of res.trips) counts.push((await json(await call('GET', `/fleet/trips/${t.id}/headcount`, admin))).data.expected);
    expect(counts).toEqual([2, 2]);
    const total = (await json(await call('GET', `/departures/${dep.id}/headcount`, admin))).data;
    expect(total).toMatchObject({ expected: 4, boarded: 0, pending: 4 });
    expect(total.trips).toHaveLength(2);

    const bare = await makeDeparture();
    const one = (await json(await call('POST', `/departures/${bare.id}/trips`, admin))).data;
    expect(one.trips).toHaveLength(1);
    expect(one.trips[0].vehicleId).toBeNull();
  });

  it('leaves out cancelled and waitlisted people', async () => {
    const dep = await makeDeparture();
    const kept = await bookParty(dep.id, 'Stays', [dep.stops[0].id]);
    const gone = await bookParty(dep.id, 'Leaves', [dep.stops[0].id]);
    expect(kept.id).toBeTruthy();
    expect((await call('POST', `/seat-bookings/${gone.id}/cancel`, admin, { reason: 'test' })).status).toBe(200);
    const trip = (await json(await call('POST', `/departures/${dep.id}/trips`, admin))).data.trips[0];
    const pax = (await json(await call('GET', `/fleet/trips/${trip.id}/passengers`, admin))).data;
    expect(pax.stops[0].passengers).toHaveLength(1);
    expect(pax.stops[0].passengers[0].name).toContain('Stays');
  });
});

describe('check-in', () => {
  async function tripWithPassengers() {
    const trip = await makeCoachTrip([{ name: 'First' }, { name: 'Second' }]);
    const stops = (await json(await call('GET', `/fleet/trips/${trip.id}/stops`, admin))).data;
    const ids: string[] = [];
    for (const [name, stop] of [['Ann', 0], ['Bo', 0], ['Cy', 1]] as const) {
      const r = await call('POST', `/fleet/trips/${trip.id}/passengers`, admin, { name, tripStopId: stops[stop].id, phone: '0612345678' });
      expect(r.status).toBe(201);
      ids.push((await json(r)).data.id);
    }
    return { trip, stops, ids };
  }
  const tick = (tripId: string, pid: string, body: Record<string, unknown>, token = admin) => call('PUT', `/fleet/trips/${tripId}/passengers/${pid}`, token, body);

  it('ticks boarded and no-show, counts heads by stop and overall, and takes a tick back', async () => {
    const { trip, stops, ids } = await tripWithPassengers();
    const a = await json(await tick(trip.id, ids[0], { boarding: 'boarded', opId: 'op-1' }));
    expect(a.data).toMatchObject({ applied: true, duplicate: false });
    expect(a.data.passenger.boarding).toBe('boarded');
    expect(a.data.passenger.boardedAt).toBeTruthy();
    await tick(trip.id, ids[1], { boarding: 'no_show', opId: 'op-2' });

    let h = (await json(await call('GET', `/fleet/trips/${trip.id}/headcount`, admin))).data;
    expect(h).toMatchObject({ expected: 3, boarded: 1, noShow: 1, pending: 1 });
    expect(h.byStop.map((s: any) => [s.name, s.expected, s.boarded, s.noShow, s.pending])).toEqual([['First', 2, 1, 1, 0], ['Second', 1, 0, 0, 1]]);

    // reversible until the trip is completed
    await tick(trip.id, ids[0], { boarding: 'pending', opId: 'op-3' });
    h = (await json(await call('GET', `/fleet/trips/${trip.id}/headcount`, admin))).data;
    expect(h).toMatchObject({ boarded: 0, noShow: 1, pending: 2 });

    // the list and the detail carry the figures
    const list = (await json(await call('GET', '/fleet/trips?tripKind=coach&limit=100', admin))).data.find((t: any) => t.id === trip.id);
    expect(list).toMatchObject({ stopCount: 2, headcount: { expected: 3, boarded: 0, noShow: 1 } });

    // 'First' was complete after op-2; 'Second' is complete once its only passenger is marked
    expect(await eventCount('trip.headcount_complete', trip.id)).toBe(1);
    await tick(trip.id, ids[2], { boarding: 'boarded', opId: 'op-4' });
    expect(await eventCount('trip.headcount_complete', trip.id)).toBe(2);
    expect(await eventCount('trip.passenger_boarded', trip.id)).toBeGreaterThanOrEqual(2);
    expect(await eventCount('trip.passenger_no_show', trip.id)).toBe(1);
    expect(stops).toHaveLength(2);
  });

  it('ignores a repeated opId and a tick older than the one already applied (last write wins by at)', async () => {
    const { trip, ids } = await tripWithPassengers();
    const t1 = '2032-06-15T06:00:00.000Z';
    const t2 = '2032-06-15T06:05:00.000Z';
    const t3 = '2032-06-15T06:10:00.000Z';
    expect((await json(await tick(trip.id, ids[0], { boarding: 'boarded', opId: 'x-1', at: t2 }))).data.applied).toBe(true);

    // the same op again: nothing changes, no second event
    const dup = (await json(await tick(trip.id, ids[0], { boarding: 'boarded', opId: 'x-1', at: t2 }))).data;
    expect(dup).toMatchObject({ applied: false, duplicate: true });
    expect(await eventCount('trip.passenger_boarded', trip.id)).toBe(1);

    // an older tick from an offline phone arrives late: ignored
    const stale = (await json(await tick(trip.id, ids[0], { boarding: 'no_show', opId: 'x-0', at: t1 }))).data;
    expect(stale).toMatchObject({ applied: false, stale: true });
    expect(stale.passenger.boarding).toBe('boarded');

    // a newer one wins
    const newer = (await json(await tick(trip.id, ids[0], { boarding: 'no_show', opId: 'x-2', at: t3 }))).data;
    expect(newer.applied).toBe(true);
    expect(newer.passenger.boarding).toBe('no_show');
    expect(newer.passenger.boardedAt).toBeNull();

    // boarding and documents are separate: an older documents tick still applies when no documents tick came yet
    const docs = (await json(await tick(trip.id, ids[0], { documentsChecked: true, opId: 'x-3', at: t1 }))).data;
    expect(docs.applied).toBe(true);
    expect(docs.passenger.documentsChecked).toBe(true);
    expect(docs.passenger.boarding).toBe('no_show');
  });

  it('refuses a body without a tick, a missing opId and a bad time', async () => {
    const { trip, ids } = await tripWithPassengers();
    expect((await tick(trip.id, ids[0], { opId: 'only-op' })).status).toBe(400);
    expect((await tick(trip.id, ids[0], { boarding: 'boarded' })).status).toBe(400);
    expect((await tick(trip.id, ids[0], { boarding: 'boarded', opId: 'o', at: 'yesterday' })).status).toBe(400);
    expect((await tick(trip.id, ids[0], { boarding: 'late', opId: 'o' })).status).toBe(400);
    expect((await tick(trip.id, 'no-such-passenger', { boarding: 'boarded', opId: 'o' })).status).toBe(404);
  });

  it('mirrors documents checked to the manifest passenger, with who and when, and undoes it', async () => {
    const dep = await makeDeparture();
    await bookParty(dep.id, 'Docs', [dep.stops[0].id]);
    const trip = (await json(await call('POST', `/departures/${dep.id}/trips`, admin))).data.trips[0];
    const pax = (await json(await call('GET', `/fleet/trips/${trip.id}/passengers`, admin))).data.stops[0].passengers[0];
    expect((await rows('SELECT documents_status FROM seat_passengers WHERE id = ?', pax.seatPassengerId))[0].documents_status).not.toBe('checked');

    const at = '2032-07-01T05:30:00.000Z';
    expect((await tick(trip.id, pax.id, { documentsChecked: true, opId: 'd-1', at })).status).toBe(200);
    const row = (await rows('SELECT * FROM seat_passengers WHERE id = ?', pax.seatPassengerId))[0];
    expect(row.documents_status).toBe('checked');
    expect(row.documents_checked_at).toBe(at);
    expect(row.documents_checked_by_user_id).toBeTruthy();
    expect(await eventCount('trip.documents_checked', trip.id)).toBe(1);
    const h = (await json(await call('GET', `/fleet/trips/${trip.id}/headcount`, admin))).data;
    expect(h.documentsChecked).toBe(1);

    expect((await tick(trip.id, pax.id, { documentsChecked: false, opId: 'd-2', at: '2032-07-01T05:40:00.000Z' })).status).toBe(200);
    const undone = (await rows('SELECT documents_status, documents_checked_at FROM seat_passengers WHERE id = ?', pax.seatPassengerId))[0];
    expect(undone.documents_status).toBe('provided');
    expect(undone.documents_checked_at).toBeNull();
  });

  it('records arrival and departure of a stop once, with the position', async () => {
    const { trip, stops } = await tripWithPassengers();
    const arrive = await call('POST', `/fleet/trips/${trip.id}/stops/${stops[0].id}/arrive`, admin, { lat: 52.09, lng: 5.11 });
    expect(arrive.status).toBe(200);
    const arrived = (await json(arrive)).data;
    expect(arrived).toMatchObject({ status: 'arrived', arrivedLat: 52.09, arrivedLng: 5.11 });
    const repeat = (await json(await call('POST', `/fleet/trips/${trip.id}/stops/${stops[0].id}/arrive`, admin))).data;
    expect(repeat.arrivedAt).toBe(arrived.arrivedAt);
    expect(await eventCount('trip.stop_arrived', trip.id)).toBe(1);
    const left = (await json(await call('POST', `/fleet/trips/${trip.id}/stops/${stops[0].id}/depart`, admin))).data;
    expect(left.status).toBe('departed');
    expect(left.departedAt).toBeTruthy();
    expect((await call('POST', `/fleet/trips/${trip.id}/stops/nope/arrive`, admin)).status).toBe(404);
  });

  it('refuses ticks once the trip is cancelled', async () => {
    const { trip, ids } = await tripWithPassengers();
    expect((await call('PUT', `/fleet/trips/${trip.id}/status`, admin, { status: 'cancelled', reason: 'weather' })).status).toBe(200);
    const res = await tick(trip.id, ids[0], { boarding: 'boarded', opId: 'late-1' });
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('TRIP_CLOSED');
  });

  it('adds and removes an ad-hoc passenger; a foreign stop is refused', async () => {
    const { trip, stops } = await tripWithPassengers();
    const other = await makeCoachTrip([{ name: 'Elsewhere' }]);
    const otherStop = (await json(await call('GET', `/fleet/trips/${other.id}/stops`, admin))).data[0];
    expect((await call('POST', `/fleet/trips/${trip.id}/passengers`, admin, { name: 'X', tripStopId: otherStop.id })).status).toBe(400);
    const added = await call('POST', `/fleet/trips/${trip.id}/passengers`, admin, { name: 'Walk-in', tripStopId: stops[1].id, seats: 2 });
    expect(added.status).toBe(201);
    const p = (await json(added)).data;
    expect(p).toMatchObject({ seatPassengerId: null, seats: 2, boarding: 'pending' });
    expect((await json(await call('GET', `/fleet/trips/${trip.id}/headcount`, admin))).data.expected).toBe(5);
    expect((await call('DELETE', `/fleet/trips/${trip.id}/passengers/${p.id}`, admin)).status).toBe(200);
    expect((await call('DELETE', `/fleet/trips/${trip.id}/passengers/${p.id}`, admin)).status).toBe(404);
  });
});

describe('feature switches', () => {
  it('coach_trips off: the coach routes answer 403, and so does a coach trip body', async () => {
    const trip = await makeCoachTrip([{ name: 'S' }]);
    const dep = await makeDeparture();
    await setFlag('coach_trips', false);
    try {
      for (const [method, path, body] of [
        ['GET', `/fleet/trips/${trip.id}/stops`, undefined],
        ['PUT', `/fleet/trips/${trip.id}/stops`, { stops: [] }],
        ['GET', `/fleet/trips/${trip.id}/passengers`, undefined],
        ['GET', `/fleet/trips/${trip.id}/headcount`, undefined],
        ['POST', `/departures/${dep.id}/trips`, undefined],
        ['GET', `/departures/${dep.id}/headcount`, undefined],
        ['POST', '/fleet/trips', { tripKind: 'coach', ...TRIP_TIMES }],
      ] as Array<[string, string, unknown]>) {
        const res = await call(method, path, admin, body);
        expect(res.status, `${method} ${path}`).toBe(403);
        expect(await json(res)).toMatchObject({ featureKey: 'coach_trips' });
      }
      // a plain trip does not need the feature
      const vehicle = (await json(await call('POST', '/fleet/vehicles', admin, { registrationNumber: `CT-${++seq}`, type: 'sedan', seatingCapacity: 4 }))).data;
      const driver = await makeCrew('Feature Free Driver', 'driver');
      expect((await call('POST', '/fleet/trips', admin, { vehicleId: vehicle.id, driverId: driver.id, ...TRIP_TIMES })).status).toBe(201);
    } finally {
      await setFlag('coach_trips', null);
    }
    expect((await call('GET', `/fleet/trips/${trip.id}/stops`, admin)).status).toBe(200);
  });

  it('trips from a departure need group_departures too', async () => {
    const dep = await makeDeparture();
    await setFlag('group_departures', false);
    try {
      const res = await call('POST', `/departures/${dep.id}/trips`, admin);
      expect(res.status).toBe(403);
      expect(await json(res)).toMatchObject({ featureKey: 'group_departures' });
    } finally {
      await setFlag('group_departures', null);
    }
    expect((await call('POST', `/departures/${dep.id}/trips`, admin)).status).toBe(201);
  });
});

describe('crew roles', () => {
  it('stores the crew role and the linked staff user, and refuses an unknown user', async () => {
    const adminUser = (await rows(`SELECT id FROM users WHERE email = 'admin@e2e.test'`))[0].id as string;
    seq += 1;
    const res = await call('POST', '/fleet/drivers', admin, { name: 'Linked Leader', phone: `+9198${String(8000000 + seq).padStart(8, '0')}`, crewRole: 'both', userId: adminUser });
    expect(res.status).toBe(201);
    const d = (await json(res)).data;
    expect(d).toMatchObject({ crewRole: 'both', userId: adminUser });
    const detail = (await json(await call('GET', `/fleet/drivers/${d.id}`, admin))).data;
    expect(detail.userName).toBeTruthy();
    const edit = await call('PUT', `/fleet/drivers/${d.id}`, admin, { crewRole: 'tour_leader', userId: null });
    expect((await json(edit)).data).toMatchObject({ crewRole: 'tour_leader', userId: null });
    expect((await call('PUT', `/fleet/drivers/${d.id}`, admin, { userId: 'no-such-user' })).status).toBe(400);
    expect((await call('PUT', `/fleet/drivers/${d.id}`, admin, { crewRole: 'pilot' })).status).toBe(400);
    const plain = await call('POST', '/fleet/drivers', admin, { name: 'Default Role', phone: `+9198${String(8100000 + seq).padStart(8, '0')}` });
    expect((await json(plain)).data.crewRole).toBe('driver');
  });
});

describe('privacy', () => {
  it('erasing a contact anonymises their trip passengers and leaves the trip and the other passengers alone', async () => {
    const dep = await makeDeparture();
    const gone = await bookParty(dep.id, 'Erasable', [dep.stops[0].id]);
    await bookParty(dep.id, 'Staying', [dep.stops[0].id]);
    const trip = (await json(await call('POST', `/departures/${dep.id}/trips`, admin))).data.trips[0];
    const before = (await json(await call('GET', `/fleet/trips/${trip.id}/passengers`, admin))).data.stops[0].passengers;
    expect(before.map((p: any) => p.name).sort()).toEqual(['Erasable P1', 'Staying P1']);

    const res = await call('POST', `/contacts/${gone.contactId}/erase`, admin, { confirmation: 'ERASE CONTACT' });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);

    const after = await rows('SELECT name, phone, contact_id FROM trip_passengers WHERE trip_id = ? ORDER BY name', trip.id);
    expect(after).toHaveLength(2);
    expect(after.find((p) => p.name === 'Erased')).toMatchObject({ phone: null, contact_id: null });
    expect(after.find((p) => p.name === 'Staying P1')?.phone).toMatch(/^\+3161234\d{4}$/);
    const row = (await rows('SELECT pickup_location, is_deleted FROM trip_assignments WHERE id = ?', trip.id))[0];
    expect(row.pickup_location).toBe('Utrecht Centraal');
    expect(row.is_deleted).toBe(0);
  });
});
