import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';

// R145: coach trips, driver API (used by the driver app, R147): the crew of a trip, tour leaders, who sees passengers.

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

interface Crew { id: string; phone: string; token: string }

/** Creates a crew member and signs in as them with the test-mode code. */
async function makeCrew(name: string, crewRole: string): Promise<Crew> {
  seq += 1;
  const phone = `+9198${String(6000000 + seq * 17).padStart(8, '0')}`;
  const created = await call('POST', '/fleet/drivers', admin, { name, phone, crewRole });
  expect(created.status, name).toBe(201);
  const id = (await json(created)).data.id as string;
  expect((await call('POST', '/driver/login', null, { phone, tenantId: TENANT_ID })).status).toBe(200);
  const verify = await call('POST', '/driver/login/verify', null, { phone, tenantId: TENANT_ID, otp: '123456' });
  expect(verify.status, name).toBe(200);
  return { id, phone, token: (await json(verify)).data.accessToken };
}

async function setDriverSees(on: boolean) {
  const current = (await json(await call('GET', '/departures/settings', admin))).data;
  const res = await call('PUT', '/departures/settings', admin, { ...current, driverSeesPassengers: on });
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
}

async function setFlag(feature: string, enabled: boolean | null) {
  await DB.prepare('DELETE FROM tenant_feature_flags WHERE tenant_id = ? AND feature_key = ?').bind(TENANT_ID, feature).run();
  if (enabled !== null) {
    await DB.prepare('INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES (?, ?, ?, ?)').bind(`r145d-${feature}`, TENANT_ID, feature, enabled ? 1 : 0).run();
  }
}

/** A coach trip today (so the "today" tab of the app lists it) with two stops and three passengers. */
async function makeTrip(crew: { driverId?: string; tourLeaderId?: string }) {
  const start = new Date();
  const res = await call('POST', '/fleet/trips', admin, {
    tripKind: 'coach', pickupDatetime: new Date(start.getTime() + 60_000).toISOString(), dropDatetime: new Date(start.getTime() + 8 * 3_600_000).toISOString(),
    pickupLocation: 'Depot', dropLocation: 'Hotel', ...crew,
    stops: [{ name: 'Utrecht, Stationsplein' }, { name: 'Zwolle' }],
  });
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  const trip = (await json(res)).data;
  const stops = (await json(await call('GET', `/fleet/trips/${trip.id}/stops`, admin))).data;
  const pax: string[] = [];
  for (const [name, stop] of [['Ann', 0], ['Bo', 0], ['Cy', 1]] as const) {
    const r = await call('POST', `/fleet/trips/${trip.id}/passengers`, admin, { name, tripStopId: stops[stop].id, phone: '+31612345678' });
    pax.push((await json(r)).data.id);
  }
  return { trip, stops, pax };
}

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  admin = await login('admin@e2e.test');
  await setDriverSees(false);
});

afterAll(async () => {
  await setFlag('coach_trips', null);
  await setFlag('driver_app', null);
});

describe('profile and list', () => {
  it('the profile says what the crew role is, and an old transfer trip looks the same', async () => {
    const leader = await makeCrew('Profile Leader', 'tour_leader');
    const plain = await makeCrew('Profile Driver', 'driver');
    const lp = (await json(await call('GET', '/driver/profile', leader.token))).data;
    expect(lp).toMatchObject({ crewRole: 'tour_leader', crew_role: 'tour_leader', canSeePassengers: true });
    const dp = (await json(await call('GET', '/driver/profile', plain.token))).data;
    expect(dp).toMatchObject({ crewRole: 'driver', canSeePassengers: false });
    expect(dp.name).toBe('Profile Driver');

    const vehicle = (await json(await call('POST', '/fleet/vehicles', admin, { registrationNumber: `DC-${++seq}`, type: 'sedan', seatingCapacity: 4 }))).data;
    const now = Date.now();
    const transfer = await call('POST', '/fleet/trips', admin, { vehicleId: vehicle.id, driverId: plain.id, pickupDatetime: new Date(now + 60_000).toISOString(), dropDatetime: new Date(now + 3_600_000).toISOString() });
    expect(transfer.status).toBe(201);
    const transferId = (await json(transfer)).data.id;
    const list = (await json(await call('GET', '/driver/trips?tab=today', plain.token))).data;
    const row = list.find((t: any) => t.id === transferId);
    expect(row).toBeTruthy();
    expect(row.tripKind).toBeUndefined();
    expect(row.coach).toBeUndefined();
  });

  it('lists the trips where the crew member is the driver or the tour leader, with a coach summary', async () => {
    const leader = await makeCrew('List Leader', 'tour_leader');
    const driver = await makeCrew('List Driver', 'driver');
    const other = await makeCrew('List Other', 'driver');
    const { trip } = await makeTrip({ driverId: driver.id, tourLeaderId: leader.id });

    const asLeader = (await json(await call('GET', '/driver/trips?tab=today', leader.token))).data;
    const row = asLeader.find((t: any) => t.id === trip.id);
    expect(row).toBeTruthy();
    expect(row).toMatchObject({ tripKind: 'coach', coach: { stopCount: 2, passengerCount: 3, nextStop: { name: 'Utrecht, Stationsplein' } } });
    const asDriver = (await json(await call('GET', '/driver/trips?tab=today', driver.token))).data;
    expect(asDriver.map((t: any) => t.id)).toContain(trip.id);
    const asOther = (await json(await call('GET', '/driver/trips?tab=today', other.token))).data;
    expect(asOther.map((t: any) => t.id)).not.toContain(trip.id);
    expect((await call('GET', `/driver/trips/${trip.id}`, other.token)).status).toBe(404);
  });
});

describe('a tour leader', () => {
  it('sees the stops and the passengers, ticks them, and the office sees the same', async () => {
    const leader = await makeCrew('Tick Leader', 'tour_leader');
    const { trip, stops, pax } = await makeTrip({ tourLeaderId: leader.id });

    const detail = (await json(await call('GET', `/driver/trips/${trip.id}`, leader.token))).data;
    expect(detail).toMatchObject({ tripKind: 'coach', myRole: 'tour_leader', canSeePassengers: true });
    expect(detail.stops.map((s: any) => s.name)).toEqual(['Utrecht, Stationsplein', 'Zwolle']);
    expect(detail.passengers.map((p: any) => p.name)).toEqual(['Ann', 'Bo', 'Cy']);
    expect(detail.passengers[0]).toMatchObject({ seats: 1, phone: '+31612345678', boarding: 'pending', documentsChecked: false });
    // never document numbers, contact links or notes
    expect(Object.keys(detail.passengers[0]).sort()).toEqual(
      ['boarding', 'boardedAt', 'documentsChecked', 'documentsCheckedAt', 'id', 'name', 'phone', 'seats', 'tripStopId'].sort(),
    );
    expect(detail.headcount).toMatchObject({ expected: 3, boarded: 0 });

    const arrive = await call('POST', `/driver/trips/${trip.id}/stops/${stops[0].id}/arrive`, leader.token, { lat: 52.09, lng: 5.11 });
    expect(arrive.status).toBe(200);
    expect((await json(arrive)).data.status).toBe('arrived');

    const op = { boarding: 'boarded', opId: 'drv-1', at: new Date().toISOString() };
    const ticked = await call('PUT', `/driver/trips/${trip.id}/passengers/${pax[0]}`, leader.token, op);
    expect(ticked.status).toBe(200);
    const body = (await json(ticked)).data;
    expect(body).toMatchObject({ applied: true, duplicate: false });
    expect(body.passenger.boarding).toBe('boarded');
    expect(body.passenger.contactId).toBeUndefined();
    // a retry of the same operation changes nothing
    expect((await json(await call('PUT', `/driver/trips/${trip.id}/passengers/${pax[0]}`, leader.token, op))).data).toMatchObject({ applied: false, duplicate: true });
    expect((await call('PUT', `/driver/trips/${trip.id}/passengers/${pax[1]}`, leader.token, { documentsChecked: true, opId: 'drv-2' })).status).toBe(200);

    const head = (await json(await call('GET', `/driver/trips/${trip.id}/headcount`, leader.token))).data;
    expect(head).toMatchObject({ expected: 3, boarded: 1, pending: 2, documentsChecked: 1 });
    const staff = (await json(await call('GET', `/fleet/trips/${trip.id}/headcount`, admin))).data;
    expect(staff).toMatchObject({ expected: 3, boarded: 1, documentsChecked: 1 });
    // the tick says who: the crew member, not a staff user
    const marked = (await rows('SELECT marked_by_driver_id, marked_by_user_id FROM trip_passengers WHERE id = ?', pax[0]))[0];
    expect(marked).toEqual({ marked_by_driver_id: leader.id, marked_by_user_id: null });
    expect((await json(await call('GET', `/driver/trips/${trip.id}/passengers`, leader.token))).data).toHaveLength(3);

    // the office takes it back later; an old offline tick from the app does not undo it
    const later = new Date(Date.now() + 60_000).toISOString();
    expect((await call('PUT', `/fleet/trips/${trip.id}/passengers/${pax[0]}`, admin, { boarding: 'no_show', opId: 'office-1', at: later })).status).toBe(200);
    const stale = (await json(await call('PUT', `/driver/trips/${trip.id}/passengers/${pax[0]}`, leader.token, { boarding: 'boarded', opId: 'drv-3', at: new Date().toISOString() }))).data;
    expect(stale).toMatchObject({ applied: false, stale: true });
    expect(stale.passenger.boarding).toBe('no_show');
  });
});

describe('a driver without passenger rights', () => {
  it('gets the stops and the head count, and 403 on the passengers, until the agency allows it', async () => {
    const driver = await makeCrew('Rights Driver', 'driver');
    const { trip, stops, pax } = await makeTrip({ driverId: driver.id });

    const detail = (await json(await call('GET', `/driver/trips/${trip.id}`, driver.token))).data;
    expect(detail).toMatchObject({ tripKind: 'coach', myRole: 'driver', canSeePassengers: false });
    expect(detail.stops).toHaveLength(2);
    expect(detail.passengers).toBeUndefined();
    expect(JSON.stringify(detail)).not.toContain('Ann');
    expect(detail.headcount.expected).toBe(3);

    expect((await call('GET', `/driver/trips/${trip.id}/passengers`, driver.token)).status).toBe(403);
    const tick = await call('PUT', `/driver/trips/${trip.id}/passengers/${pax[0]}`, driver.token, { boarding: 'boarded', opId: 'no-rights' });
    expect(tick.status).toBe(403);
    expect((await rows('SELECT boarding_status FROM trip_passengers WHERE id = ?', pax[0]))[0].boarding_status).toBe('pending');
    // the stop timeline and the count are the driver's own business
    expect((await call('POST', `/driver/trips/${trip.id}/stops/${stops[0].id}/arrive`, driver.token)).status).toBe(200);
    expect((await call('POST', `/driver/trips/${trip.id}/stops/${stops[0].id}/depart`, driver.token)).status).toBe(200);
    expect((await call('GET', `/driver/trips/${trip.id}/headcount`, driver.token)).status).toBe(200);

    await setDriverSees(true);
    try {
      const open = (await json(await call('GET', `/driver/trips/${trip.id}`, driver.token))).data;
      expect(open.canSeePassengers).toBe(true);
      expect(open.passengers).toHaveLength(3);
      expect((await call('PUT', `/driver/trips/${trip.id}/passengers/${pax[0]}`, driver.token, { boarding: 'boarded', opId: 'with-rights' })).status).toBe(200);
      expect((await json(await call('GET', '/driver/profile', driver.token))).data.canSeePassengers).toBe(true);
    } finally {
      await setDriverSees(false);
    }
    expect((await call('GET', `/driver/trips/${trip.id}/passengers`, driver.token)).status).toBe(403);
  });

  it('a driver of another trip cannot reach this one', async () => {
    const mine = await makeCrew('Mine Driver', 'driver');
    const theirs = await makeCrew('Theirs Driver', 'both');
    const { trip, stops, pax } = await makeTrip({ driverId: mine.id });
    expect((await call('GET', `/driver/trips/${trip.id}/headcount`, theirs.token)).status).toBe(404);
    expect((await call('POST', `/driver/trips/${trip.id}/stops/${stops[0].id}/arrive`, theirs.token)).status).toBe(404);
    expect((await call('PUT', `/driver/trips/${trip.id}/passengers/${pax[0]}`, theirs.token, { boarding: 'boarded', opId: 'x' })).status).toBe(404);
  });
});

describe('switches and auth', () => {
  it('needs the driver token, and coach_trips or driver_app off answers 403 on the coach routes only', async () => {
    const leader = await makeCrew('Switch Leader', 'tour_leader');
    const { trip, stops, pax } = await makeTrip({ tourLeaderId: leader.id });
    expect((await call('GET', `/driver/trips/${trip.id}/headcount`, null)).status).toBe(401);
    expect((await call('GET', `/driver/trips/${trip.id}/headcount`, admin)).status).toBe(403);

    for (const feature of ['coach_trips', 'driver_app']) {
      await setFlag(feature, false);
      try {
        for (const [method, path, body] of [
          ['GET', `/driver/trips/${trip.id}/headcount`, undefined],
          ['GET', `/driver/trips/${trip.id}/passengers`, undefined],
          ['PUT', `/driver/trips/${trip.id}/passengers/${pax[0]}`, { boarding: 'boarded', opId: 'sw' }],
          ['POST', `/driver/trips/${trip.id}/stops/${stops[0].id}/arrive`, undefined],
        ] as Array<[string, string, unknown]>) {
          const res = await call(method, path, leader.token, body);
          expect(res.status, `${feature} ${method} ${path}`).toBe(403);
        }
        // the trip itself stays reachable, without the coach extras when the feature is off
        const detail = await call('GET', `/driver/trips/${trip.id}`, leader.token);
        expect(detail.status).toBe(200);
        if (feature === 'coach_trips') expect((await json(detail)).data.stops).toBeUndefined();
      } finally {
        await setFlag(feature, null);
      }
    }
    expect((await call('GET', `/driver/trips/${trip.id}/headcount`, leader.token)).status).toBe(200);
  });
});
