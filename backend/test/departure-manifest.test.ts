import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';
import { csvCell, suggestRoomGroups } from '../src/services/departures/manifest';
import { defaultPassengerFields } from '../src/services/departures/settings';

// R146: the manifest (pickup, rooming, full) as JSON, CSV and PDF; room suggestions; seats on calendar events;
// the staff-side passenger fields; the realtime announcement of seat changes.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

let admin = '';
let sales = '';
let seq = 0;

async function call(method: string, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}
const json = async (res: Response): Promise<any> => res.json();

async function login(email: string): Promise<string> {
  const res = await call('POST', '/auth/login', null, { email, password: 'password123', tenantId: TENANT_ID });
  return (await json(res)).data.accessToken;
}

async function setFlag(feature: string, enabled: boolean | null) {
  await DB.prepare('DELETE FROM tenant_feature_flags WHERE tenant_id = ? AND feature_key = ?').bind(TENANT_ID, feature).run();
  if (enabled !== null) {
    await DB.prepare('INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES (?, ?, ?, ?)').bind(`r146-${feature}`, TENANT_ID, feature, enabled ? 1 : 0).run();
  }
}

/** A departure with three stops (the first checks documents), open for booking. */
async function makeDeparture(capacity = 40) {
  seq += 1;
  const tour = await json(await call('POST', '/tours', admin, { code: `MF${seq}`, title: `Manifest tour ${seq}`, destination: 'Alps', durationDays: 3, defaultCapacity: 49 }));
  const dep = await json(await call('POST', '/departures', admin, { tourId: tour.data.id, startDate: `2032-08-0${(seq % 9) + 1}`, startTime: '07:00', capacityMode: 'manual', capacity }));
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
  expect((await call('POST', `/departures/${id}/status`, admin, { status: 'open' })).status).toBe(200);
  return { id, code: dep.data.code as string, stops };
}

async function book(depId: string, name: string, passengers: Array<Record<string, unknown>>) {
  seq += 1;
  const res = await call('POST', `/departures/${depId}/bookings`, admin, {
    contact: { name, email: `${name.toLowerCase().replace(/\W+/g, '.')}.${seq}@manifest.test`, phone: `+3161234${String(2000 + seq)}` },
    passengers: passengers.map((p, i) => ({ lastName: `P${i + 1}`, ...p })),
  });
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  return (await json(res)).data as { id: string; passengers: Array<{ id: string; firstName: string }> };
}

const manifest = async (depId: string, query: string, token = admin) => json(await call('GET', `/departures/${depId}/manifest?${query}`, token));

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  admin = await login('admin@e2e.test');
  sales = await login('sales@e2e.test');
  await DB.prepare(`INSERT INTO settings (key, value) VALUES ('timezone', 'Europe/Amsterdam') ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run();
  expect((await call('PUT', '/automations/pause', admin, { paused: true })).status).toBe(200);
  // Pickup stays optional here so a passenger without a pickup point can be booked.
  const fields = defaultPassengerFields().map((f) => (f.key === 'pickupPoint' ? { ...f, required: false } : f));
  expect((await call('PUT', '/departures/settings', admin, { passengerFields: fields })).status).toBe(200);
});

afterAll(async () => {
  await setFlag('group_departures', null);
  await call('PUT', '/departures/settings', admin, { passengerFields: defaultPassengerFields() });
});

describe('pure rules', () => {
  it('guards a cell that a spreadsheet could read as a formula, but keeps phone numbers as typed', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@home')).toBe("'@home");
    expect(csvCell('+31 6 1234 5678')).toBe('+31 6 1234 5678');
    expect(csvCell('-12')).toBe('-12');
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell(null)).toBe('');
  });

  it('suggests rooms of the right size, by room type, keeping a booking together and honouring same-gender', () => {
    const p = (id: string, bookingId: string, gender: string, shareGender = false, roomType = 'double') => ({
      id, name: id, bookingId, gender, roomType, shareOk: true, shareGender, roomGroup: null as string | null,
    });
    const out = suggestRoomGroups(
      [p('a', 'b1', 'female', true), p('b', 'b2', 'male'), p('c', 'b3', 'female'), p('d', 'b4', 'male'), { ...p('e', 'b5', 'female'), roomGroup: '9' }, { ...p('f', 'b6', 'female'), shareOk: false }],
      new Map([['double', 2]]),
      ['9'],
    );
    expect(out.map((r) => [r.room, r.passengers.map((x) => x.id)])).toEqual([['10', ['a', 'c']], ['11', ['b', 'd']]]);
  });
});

describe('pickup list', () => {
  it('lists the stops in order with time and documents flag, then who boards there; people without a stop come last', async () => {
    const dep = await makeDeparture();
    const [utrecht, amersfoort] = dep.stops;
    await book(dep.id, 'Van Dijk', [{ firstName: 'Anna', pickupStopId: amersfoort.id }, { firstName: 'Bram', pickupStopId: amersfoort.id }]);
    await book(dep.id, 'De Vries', [{ firstName: 'Cato', pickupStopId: utrecht.id }]);
    await book(dep.id, 'No Stop', [{ firstName: 'Dirk' }]);

    const res = await manifest(dep.id, 'view=pickup&format=json');
    const m = res.data;
    expect(m.view).toBe('pickup');
    expect(m.groups.map((g: any) => g.title)).toEqual(['Utrecht Centraal', 'Amersfoort', 'Apeldoorn', 'No pickup point']);
    expect(m.groups.map((g: any) => g.time)).toEqual(['07:00', '07:40', '08:20', null]);
    expect(m.groups.map((g: any) => g.documentsCheck)).toEqual([true, false, false, false]);
    expect(m.groups.map((g: any) => g.rows.length)).toEqual([1, 2, 0, 1]);
    expect(m.groups[1].rows.map((r: any) => r.name)).toEqual(['Anna P1', 'Bram P2']);
    expect(m.groups[1].rows[0]).toMatchObject({ seats: 2, documents: 'Unknown' });
    expect(m.groups[1].rows[0].phone).toMatch(/^\+3161234/);
    expect(m.totals).toEqual({ passengers: 4, seats: 4 });
    expect(m.columns.map((c: any) => c.key)).toEqual(['name', 'seats', 'phone', 'documents']);
  });

  it('a held-only party is on the list unless confirmed bookings are asked for', async () => {
    const dep = await makeDeparture();
    const held = await book(dep.id, 'Held Party', [{ firstName: 'Hana', pickupStopId: dep.stops[0].id }]);
    const conf = await book(dep.id, 'Confirmed Party', [{ firstName: 'Cleo', pickupStopId: dep.stops[0].id }]);
    expect((await call('POST', `/seat-bookings/${conf.id}/confirm`, admin, {})).status).toBe(200);
    expect(held.id).not.toBe(conf.id);
    expect((await manifest(dep.id, 'view=pickup')).data.totals.passengers).toBe(2);
    const only = (await manifest(dep.id, 'view=pickup&bookings=confirmed')).data;
    expect(only.totals.passengers).toBe(1);
    expect(only.groups[0].rows[0].name).toBe('Cleo P1');
  });

  it('answers 404 for an unknown departure and 400 for an unknown view', async () => {
    const dep = await makeDeparture();
    expect((await call('GET', '/departures/does-not-exist/manifest?view=pickup', admin)).status).toBe(404);
    expect((await call('GET', `/departures/${dep.id}/manifest?view=other`, admin)).status).toBe(400);
  });
});

describe('rooming list and room suggestions', () => {
  it('groups by room (natural order), then those without a room; shows gender, room type, sharing and meal', async () => {
    const dep = await makeDeparture();
    const a = await book(dep.id, 'Room A', [
      { firstName: 'Eva', gender: 'female', roomType: 'double', shareOk: true, mealPreference: 'vegetarian' },
      { firstName: 'Fay', gender: 'female', roomType: 'double' },
    ]);
    const b = await book(dep.id, 'Room B', [{ firstName: 'Gus', gender: 'male', roomType: 'single' }, { firstName: 'Hal', gender: 'male', roomType: 'twin', shareGender: true }]);
    const [eva, fay] = a.passengers;
    const [gus] = b.passengers;
    const saved = await call('PUT', `/departures/${dep.id}/rooms`, admin, { assignments: [{ passengerId: eva.id, roomGroup: '10' }, { passengerId: fay.id, roomGroup: '10' }, { passengerId: gus.id, roomGroup: '2' }] });
    expect(saved.status).toBe(200);
    expect((await json(saved)).data.updated).toBe(3);

    const m = (await manifest(dep.id, 'view=rooming')).data;
    expect(m.groups.map((g: any) => g.title)).toEqual(['2', '10', 'Not in a room yet']);
    expect(m.groups[1].rows.map((r: any) => r.name)).toEqual(['Eva P1', 'Fay P2']);
    expect(m.groups[1].rows[0]).toMatchObject({ gender: 'Female', roomType: 'Double', sharing: 'Will share', meal: 'vegetarian' });
    expect(m.groups[2].rows[0]).toMatchObject({ name: 'Hal P2', roomType: 'Twin', sharing: 'Same gender only' });
    expect(m.columns.map((c: any) => c.key)).toEqual(['name', 'gender', 'roomType', 'sharing', 'meal', 'notes']);
  });

  it('suggests pairs among people who share and saves what staff confirm', async () => {
    const dep = await makeDeparture();
    const x = await book(dep.id, 'Pair X', [{ firstName: 'Ida', gender: 'female', roomType: 'double', shareOk: true, shareGender: true }]);
    const y = await book(dep.id, 'Pair Y', [{ firstName: 'Jan', gender: 'male', roomType: 'double', shareOk: true }]);
    const z = await book(dep.id, 'Pair Z', [{ firstName: 'Kim', gender: 'female', roomType: 'double', shareOk: true }]);
    const res = await json(await call('GET', `/departures/${dep.id}/rooms/suggestions`, admin));
    expect(res.data).toHaveLength(1);
    expect(res.data[0].passengers.map((p: any) => p.id).sort()).toEqual([x.passengers[0].id, z.passengers[0].id].sort());
    expect(y.passengers[0].id).toBeTruthy();
    // Nothing is saved by asking.
    expect((await manifest(dep.id, 'view=rooming')).data.groups.map((g: any) => g.title)).toEqual(['Not in a room yet']);
    const save = await call('PUT', `/departures/${dep.id}/rooms`, admin, { assignments: res.data[0].passengers.map((p: any) => ({ passengerId: p.id, roomGroup: res.data[0].room })) });
    expect(save.status).toBe(200);
    expect((await json(await call('GET', `/departures/${dep.id}/rooms/suggestions`, admin))).data).toEqual([]);
    // A passenger of another departure is not touched.
    const other = await makeDeparture();
    const o = await book(other.id, 'Other', [{ firstName: 'Zed' }]);
    expect((await json(await call('PUT', `/departures/${dep.id}/rooms`, admin, { assignments: [{ passengerId: o.passengers[0].id, roomGroup: '99' }] }))).data.updated).toBe(0);
  });

  it('a salesperson may read the rooming list; a view-only user cannot save rooms', async () => {
    const dep = await makeDeparture();
    expect((await call('GET', `/departures/${dep.id}/manifest?view=rooming`, sales)).status).toBe(200);
    const viewer = await login('viewer@e2e.test');
    expect((await call('PUT', `/departures/${dep.id}/rooms`, viewer, { assignments: [{ passengerId: 'x', roomGroup: '1' }] })).status).toBe(403);
  });
});

describe('full manifest and document numbers', () => {
  it('includes document numbers for a role that may export travellers and leaves them out for a salesperson, in JSON and CSV', async () => {
    const dep = await makeDeparture();
    await book(dep.id, 'Docs Party', [
      { firstName: 'Lena', gender: 'female', dateOfBirth: '1990-01-02', pickupStopId: dep.stops[0].id, extraFields: { nationality: 'Dutch', documentType: 'passport', documentNumber: 'NL9988776', documentExpiry: '2035-05-05' } },
    ]);

    const adminM = (await manifest(dep.id, 'view=full')).data;
    expect(adminM.documentNumbersIncluded).toBe(true);
    const keys = adminM.columns.map((c: any) => c.key);
    expect(keys).toContain('field:documentNumber');
    expect(keys).toContain('field:nationality');
    expect(adminM.groups[0].rows[0]).toMatchObject({ name: 'Lena P1', dateOfBirth: '1990-01-02', pickup: 'Utrecht Centraal', 'field:documentNumber': 'NL9988776', 'field:nationality': 'Dutch' });

    const salesM = (await manifest(dep.id, 'view=full', sales)).data;
    expect(salesM.documentNumbersIncluded).toBe(false);
    const salesKeys = salesM.columns.map((c: any) => c.key);
    expect(salesKeys).not.toContain('field:documentNumber');
    expect(salesKeys).not.toContain('field:documentExpiry');
    expect(salesKeys).toContain('field:nationality');
    expect(JSON.stringify(salesM)).not.toContain('NL9988776');

    const salesCsv = await (await call('GET', `/departures/${dep.id}/manifest?view=full&format=csv`, sales)).text();
    expect(salesCsv).not.toContain('NL9988776');
    expect(salesCsv).not.toContain('2035-05-05');
    const adminCsv = await (await call('GET', `/departures/${dep.id}/manifest?view=full&format=csv`, admin)).text();
    expect(adminCsv).toContain('NL9988776');
  });
});

describe('CSV and PDF', () => {
  it('returns a CSV with a byte order mark, the group columns first and a download name', async () => {
    const dep = await makeDeparture();
    await book(dep.id, 'Csv Party', [{ firstName: 'Mila, "M"', pickupStopId: dep.stops[1].id }, { firstName: '=Evil()', pickupStopId: dep.stops[1].id }]);
    const res = await call('GET', `/departures/${dep.id}/manifest?view=pickup&format=csv`, admin);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain(`${dep.code}-pickup.csv`);
    const text = await res.text();
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Pickup point,Time,Name,Seats,Phone,Documents');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^Amersfoort,07:40,"Mila, ""M"" P1",2,\+3161234\d+,Unknown$/);
    expect(lines[2]).toContain("'=Evil() P2");
  });

  it('returns a PDF for each view, and a name outside Latin-1 does not break it', async () => {
    const dep = await makeDeparture();
    await book(dep.id, 'Pdf Party', [{ firstName: 'Łukasz', roomType: 'double', pickupStopId: dep.stops[0].id }]);
    for (const view of ['pickup', 'rooming', 'full']) {
      const res = await call('GET', `/departures/${dep.id}/manifest?view=${view}&format=pdf`, admin);
      expect(res.status, view).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      expect(res.headers.get('Content-Disposition')).toContain(`${dep.code}-${view}.pdf`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
      expect(bytes.length).toBeGreaterThan(800);
    }
  });

  it('writes the texts in Dutch when the agency language is Dutch', async () => {
    const dep = await makeDeparture();
    await book(dep.id, 'Nl Party', [{ firstName: 'Sanne', pickupStopId: dep.stops[0].id }]);
    await DB.prepare(`INSERT INTO settings (key, value) VALUES ('default_language', 'nl') ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run();
    try {
      const m = (await manifest(dep.id, 'view=pickup')).data;
      expect(m.title).toBe('Ophaallijst');
      expect(m.groupLabel).toBe('Opstapplaats');
      expect(m.groups[0].rows[0].documents).toBe('Onbekend');
    } finally {
      await DB.prepare(`DELETE FROM settings WHERE key = 'default_language'`).run();
    }
  });
});

describe('feature switch', () => {
  it('answers 403 when group_departures is off for the agency', async () => {
    const dep = await makeDeparture();
    await setFlag('group_departures', false);
    try {
      expect((await call('GET', `/departures/${dep.id}/manifest?view=pickup`, admin)).status).toBe(403);
      expect((await call('GET', `/departures/${dep.id}/manifest?view=pickup&format=csv`, admin)).status).toBe(403);
    } finally {
      await setFlag('group_departures', null);
    }
    expect((await call('GET', `/departures/${dep.id}/manifest?view=pickup`, admin)).status).toBe(200);
  });
});

describe('seats on calendar events', () => {
  it('the planner list and detail carry the departure with its seats summary', async () => {
    const dep = await makeDeparture(10);
    await book(dep.id, 'Calendar Party', [{ firstName: 'Noor' }, { firstName: 'Odin' }]);
    const detail = (await json(await call('GET', `/departures/${dep.id}`, admin))).data;
    const list = await json(await call('GET', `/events?start_date=${detail.startDate}T00:00:00.000Z&end_date=${detail.startDate}T23:59:59.000Z&view=team`, admin));
    const event = (list.data as any[]).find((e) => e.related_departure_id === dep.id);
    expect(event, JSON.stringify(list)).toBeTruthy();
    expect(event.departure).toMatchObject({ id: dep.id, code: dep.code, status: 'open', seats: { capacity: 10, held: 2, confirmed: 0, waitlisted: 0, left: 8 } });
    const one = await json(await call('GET', `/events/${event.id}`, admin));
    expect(one.data.departure.seats.left).toBe(8);
    // An event of another kind has no departure key.
    const plain = await json(await call('POST', '/events', admin, { title: 'Plain', event_type: 'meeting', start_at: `${detail.startDate}T10:00:00.000Z` }));
    const again = (await json(await call('GET', `/events?start_date=${detail.startDate}T00:00:00.000Z&end_date=${detail.startDate}T23:59:59.000Z&view=team`, admin))).data as any[];
    expect(again.find((e) => e.id === plain.data.id).departure).toBeUndefined();
  });
});

describe('quote and lead links', () => {
  it('links a lead and a quote to a departure; the quote shows seats requested and seats left', async () => {
    const dep = await makeDeparture(6);
    const held = await book(dep.id, 'Quote Party', [{ firstName: 'Pia' }, { firstName: 'Quin' }]);
    const lead = await json(await call('GET', `/leads/${(await json(await call('GET', `/seat-bookings/${held.id}`, admin))).data.leadId}`, admin));
    expect(lead.data.departureId).toBe(dep.id);

    const contact = await json(await call('POST', '/contacts', admin, { name: 'Quote Owner', email: `quote.owner.${seq}@manifest.test`, type: 'customer' }));
    const fresh = await json(await call('POST', '/leads', admin, { contactId: contact.data.id, title: 'Quote lead', destinations: ['Alps'], travelDate: '2032-08-01', tripType: 'group', source: 'manual', paxAdults: 3, currency: 'EUR' }));
    expect(fresh.success, JSON.stringify(fresh)).toBe(true);
    expect((await json(await call('GET', `/leads/${fresh.data.id}`, admin))).data.departureId).toBeNull();
    expect((await call('PUT', `/leads/${fresh.data.id}/departure`, admin, { departureId: dep.id })).status).toBe(200);
    expect((await json(await call('GET', `/leads/${fresh.data.id}`, admin))).data.departureId).toBe(dep.id);
    expect((await call('PUT', `/leads/${fresh.data.id}/departure`, admin, { departureId: 'nope' })).status).toBe(404);

    const itin = await json(await call('POST', '/itineraries', admin, { leadId: fresh.data.id, title: 'Group quote', days: [{ dayNumber: 1, title: 'Day 1' }] }));
    expect(itin.success, JSON.stringify(itin)).toBe(true);
    const before = (await json(await call('GET', `/itineraries/${itin.data.id}`, admin))).data;
    expect(before.departure).toBeNull();
    expect((await call('PUT', `/itineraries/${itin.data.id}/departure`, admin, { departureId: dep.id })).status).toBe(200);
    const linked = (await json(await call('GET', `/itineraries/${itin.data.id}`, admin))).data;
    expect(linked.departure).toMatchObject({ id: dep.id, code: dep.code, seats: { capacity: 6, held: 2, left: 4 } });
    // No number given: the party size of the lead.
    expect(linked.seats).toEqual({ requested: 3, left: 4, fits: true });
    expect((await call('PUT', `/itineraries/${itin.data.id}/departure`, admin, { departureId: dep.id, seatsRequested: 5 })).status).toBe(200);
    expect((await json(await call('GET', `/itineraries/${itin.data.id}`, admin))).data.seats).toEqual({ requested: 5, left: 4, fits: false });
    expect((await call('PUT', `/itineraries/${itin.data.id}/departure`, admin, { departureId: null })).status).toBe(200);
    expect((await json(await call('GET', `/itineraries/${itin.data.id}`, admin))).data.seats).toBeNull();
  });
});

describe('staff fields of a passenger (seat number, room, documents status)', () => {
  it('saves them, keeps them when a later save leaves them out, and refuses a seat number that is taken', async () => {
    const dep = await makeDeparture();
    const b = await book(dep.id, 'Staff Fields', [{ firstName: 'Rik' }, { firstName: 'Sem' }]);
    const [rik, sem] = b.passengers;
    const put = async (passengers: Array<Record<string, unknown>>) => call('PUT', `/seat-bookings/${b.id}/passengers`, admin, { passengers });
    const base = (p: { id: string; firstName: string }, extra: Record<string, unknown>) => ({ id: p.id, firstName: p.firstName, lastName: p.firstName === 'Rik' ? 'P1' : 'P2', ...extra });

    const first = await put([base(rik, { seatNumber: '12A', documentsStatus: 'checked', roomGroup: '4' }), base(sem, { seatNumber: '12B' })]);
    expect(first.status, JSON.stringify(await first.clone().json())).toBe(200);
    const saved = (await json(first)).data.passengers as any[];
    expect(saved.find((p) => p.firstName === 'Rik')).toMatchObject({ seatNumber: '12A', documentsStatus: 'checked', roomGroup: '4' });
    const stamped = await DB.prepare('SELECT documents_checked_at, documents_checked_by_user_id FROM seat_passengers WHERE id = ?').bind(rik.id).first<any>();
    expect(stamped.documents_checked_at).toBeTruthy();
    expect(stamped.documents_checked_by_user_id).toBeTruthy();

    // Left out: unchanged. Null: cleared.
    const second = await put([base(rik, {}), base(sem, { seatNumber: null })]);
    expect(second.status).toBe(200);
    const after = (await json(second)).data.passengers as any[];
    expect(after.find((p) => p.firstName === 'Rik')).toMatchObject({ seatNumber: '12A', documentsStatus: 'checked', roomGroup: '4' });
    expect(after.find((p) => p.firstName === 'Sem').seatNumber).toBeNull();

    // The same seat number on two people of the departure is refused, inside the list and across bookings.
    const dup = await put([base(rik, { seatNumber: '7C' }), base(sem, { seatNumber: '7c' })]);
    expect(dup.status).toBe(400);
    expect((await json(dup)).error.code).toBe('PASSENGER_INVALID');
    const other = await book(dep.id, 'Other Party', [{ firstName: 'Tom' }]);
    const clash = await call('PUT', `/seat-bookings/${other.id}/passengers`, admin, { passengers: [{ id: other.passengers[0].id, firstName: 'Tom', lastName: 'P1', seatNumber: '12A' }] });
    expect(clash.status).toBe(400);

    expect((await call('PUT', `/seat-bookings/${b.id}/passengers`, admin, { passengers: [{ firstName: 'X', lastName: 'Y', documentsStatus: 'nonsense' }] })).status).toBe(400);
  });
});

describe('realtime announcement of seat changes', () => {
  it('tells connected screens the seats of the departure changed, with ids and counts only', async () => {
    const dep = await makeDeparture(10);
    const res = await call('GET', `/ws?token=${encodeURIComponent(admin)}`, null, undefined, { Upgrade: 'websocket' });
    expect(res.status).toBe(101);
    const socket = res.webSocket!;
    socket.accept();
    const received: Array<{ type: string; data?: Record<string, any> }> = [];
    socket.addEventListener('message', (event) => received.push(JSON.parse(event.data as string)));

    const b = await book(dep.id, 'Live Party', [{ firstName: 'Uma' }, { firstName: 'Vik' }, { firstName: 'Wes' }]);
    expect((await call('POST', `/seat-bookings/${b.id}/confirm`, admin, {})).status).toBe(200);
    expect((await call('POST', `/seat-bookings/${b.id}/cancel`, admin, { reason: 'test' })).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 150));
    socket.close();

    const events = received.filter((m) => m.type === 'departure:seats_changed' && m.data?.departureId === dep.id);
    const reasons = events.map((e) => e.data!.reason);
    expect(reasons).toEqual(expect.arrayContaining(['seat_booking.held', 'seat_booking.confirmed', 'seat_booking.cancelled']));
    const afterHold = events.find((e) => e.data!.reason === 'seat_booking.held')!;
    expect(afterHold.data!.seats).toMatchObject({ capacity: 10, held: 3, left: 7 });
    expect(events.find((e) => e.data!.reason === 'seat_booking.cancelled')!.data!.seats).toMatchObject({ held: 0, confirmed: 0, left: 10 });
    // Never names or contact details.
    expect(JSON.stringify(events)).not.toMatch(/Uma|Live Party|@manifest\.test/);
  });
});
