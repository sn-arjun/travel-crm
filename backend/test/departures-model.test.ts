import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';
import { signAccessToken } from '../src/utils/jwt';
import { effectiveValue, effectiveSettings, mergeGroupToursSettings } from '../src/services/departures/settings';
import { localDateTimeToUtcIso } from '../src/services/departures/common';
import { seatsFrom } from '../src/services/departures/capacity';

// R139: group departures data model, tours and departures API, capacity, calendar sync, feature gate and permissions.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';
const ACCOUNTANT_ID = '0196c139-0000-7000-8000-000000000a01';

let admin = '';
let sales = '';
let accountant = '';

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

async function setZone(zone: string) {
  await DB.prepare(`INSERT INTO settings (key, value) VALUES ('timezone', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(zone).run();
}

async function newTour(token: string, code: string, extra: Record<string, unknown> = {}) {
  const res = await call('POST', '/tours', token, { code, title: `Alpine Lakes 5 days ${code}`, destination: 'Switzerland', durationDays: 5, defaultCapacity: 49, ...extra });
  expect(res.status).toBe(201);
  return (await json(res)).data;
}

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  admin = await login('admin@e2e.test');
  sales = await login('sales@e2e.test');
  await DB.prepare(`INSERT OR REPLACE INTO users (id, email, name, password_hash, role, is_active) VALUES (?, 'acc@r139.test', 'R139 Accountant', 'x', 'accountant', 1)`).bind(ACCOUNTANT_ID).run();
  accountant = await signAccessToken({ userId: ACCOUNTANT_ID, tenantId: TENANT_ID, role: 'accountant', email: 'acc@r139.test' }, testEnv.JWT_SECRET);
  await setZone('Europe/Amsterdam');
});

afterAll(async () => {
  await DB.prepare("DELETE FROM users WHERE email LIKE '%@r139.test'").run();
  await DB.prepare(`UPDATE tenants SET plan = 'pro' WHERE id = ?`).bind(TENANT_ID).run();
});

describe('pure rules', () => {
  it('effective value is departure ?? tour ?? setting', () => {
    expect(effectiveValue(5, 10, 20)).toBe(5);
    expect(effectiveValue(null, 10, 20)).toBe(10);
    expect(effectiveValue(undefined, null, 20)).toBe(20);
    expect(effectiveValue(0, 10, 20)).toBe(0);
    const settings = mergeGroupToursSettings({ holdExpiryHours: 48 });
    expect(effectiveSettings(null, { holdExpiryHours: 12 }, settings).holdExpiryHours).toBe(12);
    expect(effectiveSettings({ holdExpiryHours: 6 }, { holdExpiryHours: 12 }, settings).holdExpiryHours).toBe(6);
    expect(effectiveSettings(null, null, settings).holdExpiryHours).toBe(48);
  });

  it('converts local wall-clock time to UTC in both zones, summer and winter', () => {
    expect(localDateTimeToUtcIso('Europe/Amsterdam', '2027-07-10', '07:30')).toBe('2027-07-10T05:30:00.000Z');
    expect(localDateTimeToUtcIso('Europe/Amsterdam', '2027-01-10', '07:30')).toBe('2027-01-10T06:30:00.000Z');
    expect(localDateTimeToUtcIso('Asia/Kolkata', '2027-07-10', '07:30')).toBe('2027-07-10T02:00:00.000Z');
  });

  it('seats left never goes below zero', () => {
    expect(seatsFrom(49, 3, 10, 2)).toEqual({ capacity: 49, held: 3, confirmed: 10, waitlisted: 2, left: 36 });
    expect(seatsFrom(2, 2, 1, 0).left).toBe(0);
  });
});

describe('migrations', () => {
  it('create every group-tours table and the added columns on a fresh tenant', async () => {
    const names = (await rows(`SELECT name FROM sqlite_master WHERE type = 'table'`)).map((r) => r.name);
    for (const t of ['tours', 'tour_stops', 'departures', 'departure_vehicles', 'departure_stops', 'tour_prices', 'seat_bookings', 'seat_passengers', 'tour_extras', 'passenger_extras', 'departure_costs', 'departure_message_rules', 'departure_message_sends']) {
      expect(names, t).toContain(t);
    }
    const cols = async (t: string) => (await rows(`SELECT name FROM pragma_table_info('${t}')`)).map((r) => r.name);
    expect(await cols('itineraries')).toEqual(expect.arrayContaining(['departure_id', 'seats_requested']));
    expect(await cols('leads')).toContain('departure_id');
    expect(await cols('events')).toContain('related_departure_id');
  });
});

describe('tours', () => {
  it('creates, reads, edits, lists with filters and pages, and refuses a code clash with 409', async () => {
    const tour = await newTour(admin, 'ALP5');
    expect(tour.code).toBe('ALP5');
    expect(tour.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/); // UUIDv7

    const clash = await call('POST', '/tours', admin, { code: 'ALP5', title: 'Duplicate' });
    expect(clash.status).toBe(409);
    expect((await json(clash)).error.code).toBe('CODE_TAKEN');

    const edited = await call('PUT', `/tours/${tour.id}`, admin, { title: 'Alpine Lakes 5 days (new)', destination: 'Austria' });
    expect(edited.status).toBe(200);
    expect((await json(edited)).data.title).toBe('Alpine Lakes 5 days (new)');

    await newTour(admin, 'DOL4', { destination: 'Italy', title: 'Dolomites 4 days' });
    const q = await json(await call('GET', '/tours?q=Dolomites', admin));
    expect(q.data.map((t: any) => t.code)).toEqual(['DOL4']);
    const dest = await json(await call('GET', '/tours?destination=Austria', admin));
    expect(dest.data.map((t: any) => t.code)).toEqual(['ALP5']);
    const page1 = await json(await call('GET', '/tours?limit=1', admin));
    expect(page1.data).toHaveLength(1);
    expect(page1.pagination.hasMore).toBe(true);
    const page2 = await json(await call('GET', `/tours?limit=1&cursor=${encodeURIComponent(page1.pagination.nextCursor)}`, admin));
    expect(page2.data[0].id).not.toBe(page1.data[0].id);
  });

  it('replaces stops, prices and extras, and checks the itinerary template', async () => {
    const tour = await newTour(admin, 'STP3');
    const stops = await call('PUT', `/tours/${tour.id}/stops`, admin, {
      stops: [
        { name: 'Central station', kind: 'pickup', localTime: '07:30', dayOffset: 0 },
        { name: 'Lake hotel', kind: 'dropoff', localTime: '18:00', dayOffset: 0 },
      ],
    });
    expect(stops.status).toBe(200);
    expect((await json(stops)).data.map((s: any) => s.name)).toEqual(['Central station', 'Lake hotel']);

    const prices = await call('PUT', `/tours/${tour.id}/prices`, admin, {
      prices: [
        { kind: 'age_band', key: 'adult', amount: 500 },
        { kind: 'age_band', key: 'child', amount: 300 },
        { kind: 'room_supplement', key: 'single', amount: 120 },
      ],
    });
    expect(prices.status).toBe(200);
    expect((await json(prices)).data).toHaveLength(3);
    const again = await call('PUT', `/tours/${tour.id}/prices`, admin, { prices: [{ kind: 'age_band', key: 'adult', amount: 550 }] });
    expect((await json(again)).data).toHaveLength(1);

    const extras = await call('PUT', `/tours/${tour.id}/extras`, admin, { extras: [{ title: 'Boat trip', price: 40 }] });
    expect(extras.status).toBe(200);
    expect((await json(extras)).data[0].title).toBe('Boat trip');

    const bad = await call('PUT', `/tours/${tour.id}`, admin, { itineraryTemplateId: 'no-such-template' });
    expect(bad.status).toBe(400);
  });

  it('deletes a tour without departures and archives one that has departures', async () => {
    const free = await newTour(admin, 'DEL1');
    const del = await json(await call('DELETE', `/tours/${free.id}`, admin));
    expect(del.data).toMatchObject({ deleted: true, archived: false });
    expect((await call('GET', `/tours/${free.id}`, admin)).status).toBe(404);

    const used = await newTour(admin, 'ARC1');
    expect((await call('POST', '/departures', admin, { tourId: used.id, startDate: '2027-06-01' })).status).toBe(201);
    const arch = await json(await call('DELETE', `/tours/${used.id}`, admin));
    expect(arch.data).toMatchObject({ archived: true, deleted: false });
    expect((await json(await call('GET', `/tours/${used.id}`, admin))).data.status).toBe('archived');
    expect((await call('POST', '/departures', admin, { tourId: used.id, startDate: '2027-06-08' })).status).toBe(409);
  });
});

describe('departures', () => {
  it('creation copies the tour stops, computes scheduled_at in the agency zone, end date and cut-offs, and starts as draft', async () => {
    const tour = await newTour(admin, 'CPY5');
    await call('PUT', `/tours/${tour.id}/stops`, admin, {
      stops: [
        { name: 'Depot', kind: 'pickup', localTime: '07:30', dayOffset: 0 },
        { name: 'Return stop', kind: 'dropoff', localTime: '20:00', dayOffset: 4 },
      ],
    });

    await setZone('Europe/Amsterdam');
    const nl = await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2027-07-10' }));
    expect(nl.data).toMatchObject({ code: 'CPY5-2027-07-10', endDate: '2027-07-14', status: 'draft', capacity: 49 });
    expect(nl.data.bookingCutoffDate).toBeTruthy();
    expect(nl.data.stops.map((s: any) => s.scheduledAt)).toEqual(['2027-07-10T05:30:00.000Z', '2027-07-14T18:00:00.000Z']);

    await setZone('Asia/Kolkata');
    const inTz = await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2027-08-10' }));
    expect(inTz.data.stops.map((s: any) => s.scheduledAt)).toEqual(['2027-08-10T02:00:00.000Z', '2027-08-14T14:30:00.000Z']);
    await setZone('Europe/Amsterdam');

    const clash = await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2027-07-10' });
    expect(clash.status).toBe(409);
  });

  it('bulk create makes one departure per date and reports a taken code', async () => {
    const tour = await newTour(admin, 'BLK5');
    const res = await call('POST', '/departures/bulk', admin, { tourId: tour.id, dates: ['2027-09-01', '2027-09-08', '2027-09-15'] });
    expect(res.status).toBe(201);
    const body = (await json(res)).data;
    expect(body.created).toHaveLength(3);
    const again = (await json(await call('POST', '/departures/bulk', admin, { tourId: tour.id, dates: ['2027-09-08', '2027-09-22'] }))).data;
    expect(again.created).toHaveLength(1);
    expect(again.skipped.map((s: any) => s.date)).toEqual(['2027-09-08']);
  });

  it('status follows draft -> open -> closed -> departed -> completed; anything else is 409; cancel needs a reason', async () => {
    const tour = await newTour(admin, 'STA5');
    const d = (await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2027-10-01' }))).data;
    const go = (status: string, reason?: string) => call('POST', `/departures/${d.id}/status`, admin, { status, reason });

    expect((await go('closed')).status).toBe(409);
    expect((await go('completed')).status).toBe(409);
    expect((await go('open')).status).toBe(200);
    expect((await go('draft')).status).toBe(409);
    expect((await go('closed')).status).toBe(200);
    expect((await go('departed')).status).toBe(200);
    expect((await go('cancelled', 'too late')).status).toBe(409); // not after departure
    expect((await go('completed')).status).toBe(200);
    expect((await go('open')).status).toBe(409);

    const other = (await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2027-10-08' }))).data;
    const noReason = await call('POST', `/departures/${other.id}/status`, admin, { status: 'cancelled' });
    expect(noReason.status).toBe(400);
    const cancelled = await call('POST', `/departures/${other.id}/status`, admin, { status: 'cancelled', reason: 'Not enough guests' });
    expect(cancelled.status).toBe(200);
    expect((await json(cancelled)).data.cancelledReason).toBe('Not enough guests');
  });

  it('coaches set the capacity (vehicle seating, explicit, or agency default) and manual mode keeps its number', async () => {
    const tour = await newTour(admin, 'VEH3', { defaultCapacity: null });
    await DB.prepare(`INSERT OR REPLACE INTO vehicles (id, tenant_id, registration_number, type, make, model, seating_capacity, created_by) VALUES ('0196c139-0000-7000-8000-0000000000d1', ?, 'R139-AAA', 'luxury_coach', 'Coachline', 'Tourer', 53, ?)`).bind(TENANT_ID, ADMIN_ID).run();
    const d = (await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2027-11-01' }))).data;
    expect(d.capacity).toBe(0);

    const three = await call('PUT', `/departures/${d.id}/vehicles`, admin, { vehicles: [{ capacity: 49 }, { capacity: 49 }, { capacity: 49 }] });
    expect(three.status).toBe(200);
    expect((await json(three)).data.capacity).toBe(147);

    const fromVehicle = await call('PUT', `/departures/${d.id}/vehicles`, admin, { vehicles: [{ vehicleId: '0196c139-0000-7000-8000-0000000000d1' }] });
    expect(fromVehicle.status).toBe(200);
    expect((await json(fromVehicle)).data.capacity).toBe(53);
    const dflt = await call('PUT', `/departures/${d.id}/vehicles`, admin, { vehicles: [{}] });
    expect((await json(dflt)).data.capacity).toBe(mergeGroupToursSettings({}).defaultVehicleCapacity);

    const manual = await call('PUT', `/departures/${d.id}`, admin, { capacityMode: 'manual', capacity: 30 });
    expect(manual.status).toBe(200);
    expect((await json(manual)).data.capacity).toBe(30);
  });

  it('capacity cannot drop below the seats held and confirmed (409 SEATS_IN_USE)', async () => {
    const tour = await newTour(admin, 'CAP5');
    const d = (await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2027-12-01', capacityMode: 'manual', capacity: 10 }))).data;
    const contact = '0196c139-0000-7000-8000-0000000000c1';
    const lead = '0196c139-0000-7000-8000-0000000000e1';
    await DB.prepare(`INSERT OR REPLACE INTO contacts (id, name, type, created_by) VALUES (?, 'Seat Holder', 'customer', ?)`).bind(contact, ADMIN_ID).run();
    await DB.prepare(`INSERT OR REPLACE INTO leads (id, contact_id, title, created_by) VALUES (?, ?, 'Alpine group', ?)`).bind(lead, contact, ADMIN_ID).run();
    await DB.prepare(`INSERT INTO seat_bookings (id, departure_id, lead_id, contact_id, status, seats) VALUES ('0196c139-0000-7000-8000-0000000000b1', ?, ?, ?, 'confirmed', 6)`).bind(d.id, lead, contact).run();

    const low = await call('PUT', `/departures/${d.id}`, admin, { capacity: 5 });
    expect(low.status).toBe(409);
    expect((await json(low)).error.code).toBe('SEATS_IN_USE');
    expect((await call('PUT', `/departures/${d.id}`, admin, { capacity: 6 })).status).toBe(200);

    // vehicles mode recomputes the capacity from the coaches and is held to the same rule
    expect((await call('PUT', `/departures/${d.id}`, admin, { capacityMode: 'vehicles' })).status).toBe(200);
    const smallCoach = await call('PUT', `/departures/${d.id}/vehicles`, admin, { vehicles: [{ capacity: 5 }] });
    expect(smallCoach.status).toBe(409);
    expect((await json(smallCoach)).error.code).toBe('SEATS_IN_USE');
  });

  it('list rows carry seats from one aggregate, and filter by tour, status, dates, hasSeats and q', async () => {
    const tour = await newTour(admin, 'LST5');
    const full = (await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2028-01-10', capacityMode: 'manual', capacity: 4 }))).data;
    const open = (await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2028-02-10', capacityMode: 'manual', capacity: 20 }))).data;
    const contact = '0196c139-0000-7000-8000-0000000000c2';
    const lead = '0196c139-0000-7000-8000-0000000000e2';
    await DB.prepare(`INSERT OR REPLACE INTO contacts (id, name, type, created_by) VALUES (?, 'Seat Holder Two', 'customer', ?)`).bind(contact, ADMIN_ID).run();
    await DB.prepare(`INSERT OR REPLACE INTO leads (id, contact_id, title, created_by) VALUES (?, ?, 'Lakes group', ?)`).bind(lead, contact, ADMIN_ID).run();
    await DB.prepare(`INSERT INTO seat_bookings (id, departure_id, lead_id, contact_id, status, seats) VALUES ('0196c139-0000-7000-8000-0000000000b2', ?, ?, ?, 'confirmed', 3)`).bind(full.id, lead, contact).run();

    const all = (await json(await call('GET', `/departures?tour=${tour.id}`, admin))).data;
    expect(all.map((d: any) => d.startDate)).toEqual(['2028-01-10', '2028-02-10']);
    const seatsFull = all.find((d: any) => d.id === full.id).seats;
    expect(seatsFull).toMatchObject({ capacity: 4, confirmed: 3, waitlisted: 0 });
    expect(seatsFull.left).toBe(1);
    expect(all.find((d: any) => d.id === open.id).seats).toEqual({ capacity: 20, held: 0, confirmed: 0, waitlisted: 0, left: 20 });

    expect((await json(await call('GET', `/departures?tour=${tour.id}&from=2028-02-01`, admin))).data.map((d: any) => d.id)).toEqual([open.id]);
    expect((await json(await call('GET', `/departures?tour=${tour.id}&to=2028-01-31`, admin))).data.map((d: any) => d.id)).toEqual([full.id]);
    expect((await json(await call('GET', `/departures?tour=${tour.id}&status=open`, admin))).data).toHaveLength(0);
    expect((await json(await call('GET', `/departures?tour=${tour.id}&q=LST5-2028-02`, admin))).data.map((d: any) => d.id)).toEqual([open.id]);
    expect((await json(await call('GET', `/departures?tour=${tour.id}&hasSeats=true`, admin))).data.length).toBeGreaterThanOrEqual(1);
    const p1 = await json(await call('GET', `/departures?tour=${tour.id}&limit=1`, admin));
    expect(p1.pagination).toMatchObject({ hasMore: true, total: 2 });
  });

  it('departure stops, price overrides and costs can be replaced', async () => {
    const tour = await newTour(admin, 'SPC5');
    await call('PUT', `/tours/${tour.id}/prices`, admin, { prices: [{ kind: 'age_band', key: 'adult', amount: 500 }] });
    const d = (await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2028-03-01' }))).data;

    const stops = await json(await call('PUT', `/departures/${d.id}/stops`, admin, { stops: [{ name: 'Airport', kind: 'pickup', localTime: '06:00' }] }));
    expect(stops.data[0].scheduledAt).toBe('2028-03-01T05:00:00.000Z');

    const prices = await json(await call('PUT', `/departures/${d.id}/prices`, admin, { prices: [{ kind: 'age_band', key: 'adult', amount: 450 }] }));
    expect(prices.data.find((p: any) => p.key === 'adult').amount).toBe(450);
    expect((await json(await call('GET', `/tours/${tour.id}/prices`, admin))).data[0].amount).toBe(500);

    const costs = await json(await call('PUT', `/departures/${d.id}/costs`, admin, { costs: [{ description: 'Coach hire', amount: 1800 }, { description: 'Guide', kind: 'per_seat', amount: 12 }] }));
    expect(costs.data).toHaveLength(2);
    expect((await call('PUT', '/departures/does-not-exist/costs', admin, { costs: [] })).status).toBe(404);
  });
});

describe('calendar sync', () => {
  it('creates, updates and removes one trip_departure event with the departure', async () => {
    const tour = await newTour(admin, 'CAL5', { title: 'Calendar Alps' });
    const d = (await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2028-04-01' }))).data;
    const events = () => rows(`SELECT * FROM events WHERE related_departure_id = ?`, d.id);

    let ev = await events();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ event_type: 'trip_departure', title: `Calendar Alps (${d.code})`, is_deleted: 0, timezone: 'Europe/Amsterdam' });
    expect(ev[0].id).toBe(d.calendarEventId);

    await call('PUT', `/departures/${d.id}`, admin, { startDate: '2028-04-08' });
    ev = await events();
    expect(ev).toHaveLength(1);
    expect(ev[0].start_at.startsWith('2028-04-07')).toBe(true); // all-day start at local midnight, UTC the day before in summer

    await call('POST', `/departures/${d.id}/status`, admin, { status: 'open' });
    expect((await events())[0].is_deleted).toBe(0);

    await call('POST', `/departures/${d.id}/status`, admin, { status: 'cancelled', reason: 'weather' });
    expect((await events())[0].is_deleted).toBe(1);

    const other = (await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2028-05-01' }))).data;
    expect((await call('DELETE', `/departures/${other.id}`, admin)).status).toBe(200);
    expect((await rows(`SELECT is_deleted FROM events WHERE id = ?`, other.calendarEventId))[0].is_deleted).toBe(1);
  });
});

describe('settings', () => {
  it('returns the defaults, saves a validated change (admin only) and keeps unrelated defaults', async () => {
    const before = (await json(await call('GET', '/departures/settings', admin))).data;
    expect(before.holdExpiryHours).toBeGreaterThan(0);
    expect((await call('PUT', '/departures/settings', sales, { holdExpiryHours: 12 })).status).toBe(403);
    expect((await call('PUT', '/departures/settings', admin, { holdExpiryHours: 0 })).status).toBe(400);
    const saved = (await json(await call('PUT', '/departures/settings', admin, { holdExpiryHours: 12 }))).data;
    expect(saved.holdExpiryHours).toBe(12);
    expect(saved.defaultVehicleCapacity).toBe(before.defaultVehicleCapacity);
    expect((await json(await call('GET', '/departures/settings', admin))).data.holdExpiryHours).toBe(12);
  });
});

describe('permissions and the feature gate', () => {
  it('salesperson can view, create and edit but not delete; accountant can view but not create', async () => {
    const tour = await newTour(sales, 'PRM5');
    expect((await call('GET', '/tours', sales)).status).toBe(200);
    const d = await call('POST', '/departures', sales, { tourId: tour.id, startDate: '2028-06-01' });
    expect(d.status).toBe(201);
    const id = (await json(d)).data.id;
    expect((await call('PUT', `/departures/${id}`, sales, { notes: 'x' })).status).toBe(200);
    expect((await call('DELETE', `/departures/${id}`, sales)).status).toBe(403);
    expect((await call('DELETE', `/tours/${tour.id}`, sales)).status).toBe(403);

    expect((await call('GET', '/departures', accountant)).status).toBe(200);
    expect((await call('POST', '/tours', accountant, { code: 'ACC1', title: 'Nope' })).status).toBe(403);
    expect((await call('POST', '/departures', accountant, { tourId: tour.id, startDate: '2028-06-08' })).status).toBe(403);
  });

  it('an agency on the Basic plan gets the feature-gate 403', async () => {
    await DB.prepare(`UPDATE tenants SET plan = 'basic' WHERE id = ?`).bind(TENANT_ID).run();
    try {
      for (const path of ['/tours', '/departures', '/departures/settings']) {
        const res = await call('GET', path, admin);
        expect(res.status, path).toBe(403);
        const body = await json(res);
        expect(body).toMatchObject({ featureKey: 'group_departures', currentPlan: 'basic', upgrade: true });
      }
    } finally {
      await DB.prepare(`UPDATE tenants SET plan = 'pro' WHERE id = ?`).bind(TENANT_ID).run();
    }
    expect((await call('GET', '/tours', admin)).status).toBe(200);
  });

  it('master migration 0030 places the six keys on the plans', async () => {
    const placed = async (key: string) => (await rows(`SELECT plan_key FROM plan_features WHERE feature_key = ? ORDER BY plan_key`, key)).map((r) => r.plan_key);
    expect(await placed('group_departures')).toEqual(['enterprise', 'pro', 'trial']);
    expect(await placed('public_booking')).toEqual(['enterprise', 'pro', 'trial']);
    for (const k of ['coach_trips', 'age_band_pricing', 'margin_scheme', 'quote_acceptance']) {
      expect(await placed(k), k).toEqual(['basic', 'enterprise', 'pro', 'trial']);
    }
  });
});

describe('privacy', () => {
  it('erasing a contact anonymises the passengers on their seats and keeps the seat counts', async () => {
    const tour = await newTour(admin, 'GDP5');
    const d = (await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2028-07-01', capacityMode: 'manual', capacity: 8 }))).data;
    const contact = '0196c139-0000-7000-8000-0000000000c9';
    const lead = '0196c139-0000-7000-8000-0000000000e9';
    const booking = '0196c139-0000-7000-8000-0000000000b9';
    await DB.prepare(`INSERT OR REPLACE INTO contacts (id, name, email, type, created_by) VALUES (?, 'Erasable Person', 'erasable-r139@example.test', 'customer', ?)`).bind(contact, ADMIN_ID).run();
    await DB.prepare(`INSERT OR REPLACE INTO leads (id, contact_id, title, created_by) VALUES (?, ?, 'Erasable lead', ?)`).bind(lead, contact, ADMIN_ID).run();
    await DB.prepare(`INSERT INTO seat_bookings (id, departure_id, lead_id, contact_id, status, seats, notes) VALUES (?, ?, ?, ?, 'confirmed', 2, 'wants window')`).bind(booking, d.id, lead, contact).run();
    await DB.prepare(`INSERT INTO seat_passengers (id, seat_booking_id, departure_id, first_name, last_name, date_of_birth, meal_preference, extra_fields) VALUES ('0196c139-0000-7000-8000-0000000000f9', ?, ?, 'Erika', 'Mustermann', '1980-02-03', 'vegan', '{"passport":"X1"}')`).bind(booking, d.id).run();

    const res = await call('POST', `/contacts/${contact}/erase`, admin, { confirmation: 'ERASE CONTACT' });
    expect(res.status).toBe(200);
    const p = (await rows(`SELECT * FROM seat_passengers WHERE id = '0196c139-0000-7000-8000-0000000000f9'`))[0];
    expect(p).toMatchObject({ first_name: 'Erased', date_of_birth: null, meal_preference: null, extra_fields: null });
    expect((await rows(`SELECT notes, seats, status FROM seat_bookings WHERE id = ?`, booking))[0]).toEqual({ notes: null, seats: 2, status: 'confirmed' });
    const detail = (await json(await call('GET', `/departures/${d.id}`, admin))).data;
    expect(detail.seats.confirmed).toBe(2);
  });
});
