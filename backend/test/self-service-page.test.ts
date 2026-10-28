import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import worker from '../src/index';

// R150: the traveller self-service page. One link per booking (or per passenger): traveller details, extras per person, payment.
// The public routes are under /api/v1/public/booking/:token; the staff routes that make the links are under /seat-bookings/:id.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const realLimits = { ...testEnv, RATE_LIMIT_MULTIPLIER: '1' };

let admin = '';
let seq = 0;
let ipSeq = 40;

async function send(e: any, method: string, path: string, init: { token?: string | null; json?: unknown; headers?: Record<string, string> } = {}): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost${path}`, { method, headers, body: init.json === undefined ? undefined : JSON.stringify(init.json) }), e, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const staff = (method: string, path: string, body?: unknown) => send(testEnv, method, `/api/v1${path}`, { token: admin, json: body });
const json = async (res: Response): Promise<any> => res.json();
const rows = async <T = any>(sql: string, ...b: unknown[]): Promise<T[]> => ((await DB.prepare(sql).bind(...b).all()).results ?? []) as T[];
const setSetting = (key: string, value: string) =>
  DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, value, new Date().toISOString()).run();

const anIp = () => `198.51.100.${ipSeq++ % 250}`;
const pub = (method: string, token: string, suffix = '', body?: unknown, e: any = testEnv, ip = anIp()) =>
  send(e, method, `/api/v1/public/booking/${token}${suffix}`, { json: body, headers: { 'cf-connecting-ip': ip } });
const view = async (token: string): Promise<any> => {
  const res = await pub('GET', token);
  expect(res.status).toBe(200);
  return (await json(res)).data;
};
const tokenOf = (url: string): string => new URL(url).pathname.split('/').pop()!;

const FIELDS = [
  { key: 'name', label: 'Name', required: true, collectOn: 'booking' },
  { key: 'gender', label: 'Gender', required: false, collectOn: 'booking' },
  { key: 'dateOfBirth', label: 'Date of birth', required: false, collectOn: 'booking' },
  { key: 'meal', label: 'Meal preference', required: false, collectOn: 'booking' },
  { key: 'nationality', label: 'Nationality', required: true, collectOn: 'self_service' },
  { key: 'documentType', label: 'Document type', required: false, collectOn: 'self_service' },
  { key: 'documentNumber', label: 'Document number', required: false, collectOn: 'self_service' },
  { key: 'documentExpiry', label: 'Document expiry', required: false, collectOn: 'self_service', type: 'date' },
  { key: 'documentExpiry2', label: 'Second document expiry', required: false, collectOn: 'self_service', type: 'date' },
];

interface Trip {
  depId: string;
  tourId: string;
  bookingId: string;
  contactId: string;
  passengerIds: string[];
  gondola: string;
  dinner: string;
}

/** A tour in EUR with adult and child prices, a 'Gondola' (day 2, child price) and a 'Dinner' extra, and a booked party of two adults and a child. */
async function makeTrip(o: { capacity?: number; gondolaCapacity?: number | null } = {}): Promise<Trip> {
  seq += 1;
  const tour = await staff('POST', '/tours', { code: `SS${seq}`, title: `Fjord round ${seq}`, currency: 'EUR', durationDays: 5 });
  expect(tour.status).toBe(201);
  const tourId = (await json(tour)).data.id;
  expect((await staff('PUT', `/tours/${tourId}/prices`, {
    prices: [
      { kind: 'age_band', key: 'adult', label: 'Adult', amount: 1000 },
      { kind: 'age_band', key: 'child', label: 'Child', amount: 600 },
      { kind: 'age_band', key: 'infant', label: 'Infant', amount: 0 },
    ],
  })).status).toBe(200);
  expect((await staff('PUT', `/tours/${tourId}/extras`, {
    extras: [
      { title: 'Gondola', dayNumber: 2, price: 50, bandPrices: { child: 30 }, capacity: o.gondolaCapacity ?? null, description: 'An evening on the water' },
      { title: 'Dinner', dayNumber: 3, price: 25 },
    ],
  })).status).toBe(200);
  const dep = await staff('POST', '/departures', { tourId, startDate: `2033-0${(seq % 9) + 1}-20`, capacityMode: 'manual', capacity: o.capacity ?? 30 });
  expect(dep.status).toBe(201);
  const depId = (await json(dep)).data.id;
  expect((await staff('POST', `/departures/${depId}/status`, { status: 'open' })).status).toBe(200);
  const extras = (await json(await staff('GET', `/departures/${depId}/extras`))).data.extras;

  const res = await staff('POST', `/departures/${depId}/bookings`, {
    contact: { name: 'Eva de Vries', email: `eva.${++seq}@self-service.test` },
    passengers: [
      { firstName: 'Eva', lastName: 'de Vries', dateOfBirth: '1985-03-01' },
      { firstName: 'Jan', lastName: 'de Vries', dateOfBirth: '1984-05-02' },
      { firstName: 'Sanne', lastName: 'de Vries', dateOfBirth: '2025-01-01' },
    ],
  });
  expect(res.status).toBe(201);
  const booking = (await json(res)).data;
  const passengerIds = (await rows('SELECT id FROM seat_passengers WHERE seat_booking_id = ? ORDER BY created_at, id', booking.id)).map((p) => p.id);
  return {
    depId, tourId, bookingId: booking.id, contactId: booking.contactId, passengerIds,
    gondola: extras.find((e: any) => e.title === 'Gondola').id, dinner: extras.find((e: any) => e.title === 'Dinner').id,
  };
}

async function linkOf(bookingId: string, body: Record<string, unknown> = { scope: 'booking' }): Promise<{ token: string; data: any }> {
  const res = await staff('POST', `/seat-bookings/${bookingId}/self-service-link`, body);
  expect(res.status).toBe(200);
  const data = (await json(res)).data;
  return { token: tokenOf(data.tripUrl), data };
}

const pick = (v: any, name: string) => v.passengers.find((p: any) => p.firstName === name);
const extraRef = (v: any, title: string) => v.extras.find((e: any) => e.title === title).ref;

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await send(testEnv, 'POST', '/api/v1/test/reset')).status).toBe(200);
  const login = await send(testEnv, 'POST', '/api/v1/auth/login', { json: { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID } });
  admin = (await json(login)).data.accessToken;
  expect((await staff('PUT', '/automations/pause', { paused: true })).status).toBe(200);
  for (const [k, v] of Object.entries({ country: 'NL', company_country: 'NL', currency: 'EUR', locale: 'nl-NL', timezone: 'Europe/Amsterdam', phone_default_country: 'NL', tax_system: 'none' })) await setSetting(k, v);
});

beforeEach(async () => {
  await DB.prepare(`DELETE FROM tenant_feature_flags WHERE feature_key IN ('public_booking', 'group_departures')`).run();
  expect((await staff('PUT', '/departures/settings', {
    enabled: true, confirmMode: 'manual', deposit: { type: 'none', value: null }, passengerFields: FIELDS, extrasCutoffDays: 7,
  })).status).toBe(200);
  await DB.prepare('DELETE FROM payment_gateway_accounts').run();
});

describe('the links', () => {
  it('a booking link and a passenger link are different kinds, the same address comes back, and the message links resolve', async () => {
    const trip = await makeTrip();
    const a = await linkOf(trip.bookingId);
    const again = await linkOf(trip.bookingId);
    expect(again.token).toBe(a.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a.data).toMatchObject({ scope: 'booking' });
    expect(a.data.detailsLink).toBe(`${a.data.tripUrl}?step=travellers`);
    expect(a.data.extrasLink).toBe(`${a.data.tripUrl}?step=extras`);
    expect((await rows('SELECT kind, entity_id, expires_at FROM public_links WHERE token = ?', a.token))[0]).toMatchObject({ kind: 'booking_self_service', entity_id: trip.bookingId });

    const p = await linkOf(trip.bookingId, { scope: 'passenger', passengerId: trip.passengerIds[1] });
    expect(p.token).not.toBe(a.token);
    expect((await rows('SELECT kind, entity_id FROM public_links WHERE token = ?', p.token))[0]).toMatchObject({ kind: 'passenger_self_service', entity_id: trip.passengerIds[1] });
    expect((await staff('POST', `/seat-bookings/${trip.bookingId}/self-service-link`, { scope: 'passenger', passengerId: 'nobody' })).status).toBe(404);
  });

  it('a passenger link shows only that passenger and cannot read or write another', async () => {
    const trip = await makeTrip();
    const bookingToken = (await linkOf(trip.bookingId)).token;
    const all = await view(bookingToken);
    expect(all.passengers.map((p: any) => p.firstName)).toEqual(['Eva', 'Jan', 'Sanne']);
    const jan = await linkOf(trip.bookingId, { scope: 'passenger', passengerId: trip.passengerIds[1] });
    const seen = await view(jan.token);
    expect(seen.scope).toBe('passenger');
    expect(seen.passengers.map((p: any) => p.firstName)).toEqual(['Jan']);

    // Eva's reference, taken from the booking link, means nothing on Jan's link.
    const evaRef = pick(all, 'Eva').ref;
    const write = await pub('PUT', jan.token, '/passengers', { passengers: [{ ref: evaRef, firstName: 'Hacked', values: { nationality: 'NL' } }] });
    expect(write.status).toBe(400);
    expect((await rows('SELECT first_name FROM seat_passengers WHERE id = ?', trip.passengerIds[0]))[0].first_name).toBe('Eva');
    const extra = await pub('PUT', jan.token, '/extras', { choices: [{ passengerRef: evaRef, extraRef: extraRef(seen, 'Dinner'), quantity: 1 }] });
    expect(extra.status).toBe(400);
    expect((await rows('SELECT COUNT(*) AS n FROM passenger_extras WHERE departure_id = ?', trip.depId))[0].n).toBe(0);
    // His own works, and only touches him.
    const mine = await pub('PUT', jan.token, '/extras', { choices: [{ passengerRef: seen.passengers[0].ref, extraRef: extraRef(seen, 'Dinner'), quantity: 2 }] });
    expect(mine.status).toBe(200);
    expect((await rows('SELECT seat_passenger_id, quantity FROM passenger_extras WHERE departure_id = ?', trip.depId))).toEqual([{ seat_passenger_id: trip.passengerIds[1], quantity: 2 }]);

    // The link of one traveller shows what that person chose and nothing of the booking's invoices; paying is for the whole booking.
    // (Eva's own choice, made on the booking link, is not part of Jan's total.)
    expect((await pub('PUT', bookingToken, '/extras', { choices: [{ passengerRef: pick(all, 'Eva').ref, extraRef: extraRef(all, 'Gondola'), quantity: 1 }, { passengerRef: pick(all, 'Jan').ref, extraRef: extraRef(all, 'Dinner'), quantity: 2 }] })).status).toBe(200);
    const personal = await view(jan.token);
    expect(personal.invoice).toBeNull();
    expect(personal.deposit).toBeNull();
    expect(personal.extrasMoney).toEqual({ total: 50, paid: 0, unpaid: 50 });
    expect((await pub('POST', jan.token, '/pay', { what: 'extras' })).status).toBe(409);
  });

  it('answers the same 404 for an unknown token, a token of another kind, a revoked link, a cancelled booking and a feature that is off', async () => {
    const trip = await makeTrip();
    const { token } = await linkOf(trip.bookingId);
    const unknown = await pub('GET', 'A'.repeat(22));
    expect(unknown.status).toBe(404);
    const body = await json(unknown);

    // The departure's booking page token does not open a trip page, and a trip token does not open the booking page.
    const bookingPage = await staff('POST', `/departures/${trip.depId}/public-link`);
    const pageToken = tokenOf((await json(bookingPage)).data.url);
    const wrongKind = await pub('GET', pageToken);
    expect(wrongKind.status).toBe(404);
    expect(await json(wrongKind)).toEqual(body);
    expect((await send(testEnv, 'GET', `/api/v1/public/departures/${token}`, { headers: { 'cf-connecting-ip': anIp() } })).status).toBe(404);

    await DB.prepare(`INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES ('r150-pb', ?, 'public_booking', 0)`).bind(TENANT_ID).run();
    const off = await pub('GET', token);
    await DB.prepare(`DELETE FROM tenant_feature_flags WHERE id = 'r150-pb'`).run();
    expect(off.status).toBe(404);
    expect(await json(off)).toEqual(body);
    expect((await staff('PUT', '/departures/settings', { enabled: false })).status).toBe(200);
    expect((await pub('GET', token)).status).toBe(404);
    expect((await staff('PUT', '/departures/settings', { enabled: true })).status).toBe(200);
    expect((await pub('GET', token)).status).toBe(200);

    // Stopping the links, and a cancelled booking.
    const stopped = await linkOf(trip.bookingId, { scope: 'passenger', passengerId: trip.passengerIds[0] });
    expect((await staff('DELETE', `/seat-bookings/${trip.bookingId}/self-service-link`)).status).toBe(200);
    for (const t of [token, stopped.token]) {
      const res = await pub('GET', t);
      expect(res.status).toBe(404);
      expect(await json(res)).toEqual(body);
    }
    const second = await makeTrip();
    const live = (await linkOf(second.bookingId)).token;
    expect((await staff('POST', `/seat-bookings/${second.bookingId}/cancel`, {})).status).toBe(200);
    const gone = await pub('GET', live);
    expect(gone.status).toBe(404);
    expect(await json(gone)).toEqual(body);
    // An expired link is a 410.
    const third = await makeTrip();
    const old = (await linkOf(third.bookingId)).token;
    await DB.prepare(`UPDATE public_links SET expires_at = '2020-01-01T00:00:00.000Z' WHERE token = ?`).bind(old).run();
    expect((await pub('GET', old)).status).toBe(410);
  });

  it('refuses a link for a booking that is cancelled and sends noindex and no-store', async () => {
    const trip = await makeTrip();
    const { token } = await linkOf(trip.bookingId);
    const res = await pub('GET', token);
    expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect((await staff('POST', `/seat-bookings/${trip.bookingId}/cancel`, {})).status).toBe(200);
    expect((await staff('POST', `/seat-bookings/${trip.bookingId}/self-service-link`, { scope: 'booking' })).status).toBe(409);
  });
});

describe('the page and the travellers', () => {
  it('shows a fixed projection: no ids, no costs, the fields to collect and the extras with their prices', async () => {
    const trip = await makeTrip();
    const { token } = await linkOf(trip.bookingId);
    const data = await view(token);
    const text = JSON.stringify(data);
    for (const id of [trip.bookingId, trip.depId, trip.tourId, trip.contactId, trip.gondola, ...trip.passengerIds]) expect(text).not.toContain(id);
    expect(text).not.toContain('cost');
    expect(data).toMatchObject({ scope: 'booking', state: 'open', currency: 'EUR', tour: { title: expect.stringContaining('Fjord round') } });
    expect(data.fields.map((f: any) => f.key)).toEqual(['nationality', 'documentType', 'documentNumber', 'documentExpiry', 'documentExpiry2']);
    expect(data.fields.find((f: any) => f.key === 'nationality').required).toBe(true);
    expect(data.collects).toEqual({ gender: true, dateOfBirth: true, meal: true });
    expect(data.extras.map((e: any) => [e.title, e.day, e.price, e.open])).toEqual([['Gondola', 2, 50, true], ['Dinner', 3, 25, true]]);
    expect(data.extras[0].bandPrices).toEqual({ child: 30 });
    expect(pick(data, 'Sanne').bandKey).toBe('child');
    expect(data.agency).toBeDefined();
    expect(data.language).toMatchObject({ available: ['en', 'nl'] });
  });

  it('checks the required details of every traveller and saves nothing when one is missing', async () => {
    const trip = await makeTrip();
    const { token } = await linkOf(trip.bookingId);
    const data = await view(token);
    const eva = pick(data, 'Eva').ref;
    const jan = pick(data, 'Jan').ref;
    const res = await pub('PUT', token, '/passengers', {
      passengers: [
        { ref: eva, firstName: 'Eva', values: { nationality: 'Dutch', documentExpiry: '31-12-2030' } },
        { ref: jan, firstName: '', values: { documentNumber: 'NL123' } },
      ],
    });
    expect(res.status).toBe(400);
    const error = (await json(res)).error;
    expect(error.code).toBe('PASSENGER_INVALID');
    expect(error.errors).toEqual(expect.arrayContaining([{ ref: eva, field: 'documentExpiry' }, { ref: jan, field: 'firstName' }, { ref: jan, field: 'nationality' }]));
    expect((await rows('SELECT extra_fields FROM seat_passengers WHERE id = ?', trip.passengerIds[0]))[0].extra_fields).toBeNull();
    expect((await rows('SELECT COUNT(*) AS n FROM travellers WHERE contact_id = ?', trip.contactId))[0].n).toBe(0);
  });

  it('creates and links the travellers, masks the document number and keeps it when the masked value comes back', async () => {
    const trip = await makeTrip();
    const { token } = await linkOf(trip.bookingId);
    const data = await view(token);
    const body = {
      passengers: [
        { ref: pick(data, 'Eva').ref, firstName: 'Eva', lastName: 'de Vries', gender: 'female', mealPreference: 'vegetarian', values: { nationality: 'Dutch', documentType: 'passport', documentNumber: 'NL1234567', documentExpiry: '2030-06-01', documentExpiry2: '2031-01-01' } },
        { ref: pick(data, 'Jan').ref, firstName: 'Jan', lastName: 'de Vries', values: { nationality: 'Dutch', documentNumber: 'NL7654321', documentExpiry: '2029-02-03' } },
      ],
    };
    const saved = await pub('PUT', token, '/passengers', body);
    expect(saved.status).toBe(200);
    const after = (await json(saved)).data;
    const eva = pick(after, 'Eva');
    expect(eva.values.documentNumber).toBe('******567');
    expect(eva.values.documentExpiry).toBe('2030-06-01');
    expect(eva.mealPreference).toBe('vegetarian');
    expect(JSON.stringify(after)).not.toContain('NL1234567');

    const passengers = await rows('SELECT * FROM seat_passengers WHERE seat_booking_id = ? ORDER BY created_at, id', trip.bookingId);
    expect(passengers[0].traveller_id).toBeTruthy();
    expect(passengers[1].traveller_id).toBeTruthy();
    expect(passengers[2].traveller_id).toBeNull();
    expect(passengers[0].documents_status).toBe('provided');
    expect(JSON.parse(passengers[0].extra_fields)).toMatchObject({ documentNumber: 'NL1234567', documentExpiry2: '2031-01-01' });
    const traveller = (await rows('SELECT * FROM travellers WHERE id = ?', passengers[0].traveller_id))[0];
    expect(traveller).toMatchObject({
      contact_id: trip.contactId, first_name: 'Eva', last_name: 'de Vries', gender: 'female', nationality: 'Dutch',
      passport_number: 'NL1234567', passport_expiry_date: '2030-06-01', meal_preference: 'vegetarian',
    });

    // Saving again with the masked number changes nothing but what was typed; the same traveller is updated, not duplicated.
    const again = await pub('PUT', token, '/passengers', {
      passengers: [{ ref: pick(after, 'Eva').ref, firstName: 'Eva', lastName: 'de Vries-Bos', values: { nationality: 'Dutch', documentNumber: eva.values.documentNumber, documentExpiry: '2030-07-01' } }],
    });
    expect(again.status).toBe(200);
    const updated = (await rows('SELECT * FROM travellers WHERE contact_id = ? ORDER BY created_at', trip.contactId));
    expect(updated).toHaveLength(2);
    expect(updated.find((t) => t.id === traveller.id)).toMatchObject({ passport_number: 'NL1234567', passport_expiry_date: '2030-07-01', last_name: 'de Vries-Bos' });
    // The staff manifest reads them too.
    const manifest = (await json(await staff('GET', `/departures/${trip.depId}/manifest?view=full`))).data;
    const eva2 = manifest.groups[0].rows.find((r: any) => r.name.startsWith('Eva'));
    expect(eva2['field:documentNumber']).toBe('NL1234567');
  });

  it('fills an empty date of birth but leaves one the booking already holds, and never changes a band that is set', async () => {
    const trip = await makeTrip();
    await DB.prepare('UPDATE seat_passengers SET date_of_birth = NULL, age_years = 30, band_key = NULL WHERE id = ?').bind(trip.passengerIds[1]).run();
    const { token } = await linkOf(trip.bookingId);
    const data = await view(token);
    const res = await pub('PUT', token, '/passengers', {
      passengers: [
        { ref: pick(data, 'Jan').ref, firstName: 'Jan', dateOfBirth: '1990-01-01', values: { nationality: 'Dutch' } },
        { ref: pick(data, 'Sanne').ref, firstName: 'Sanne', dateOfBirth: '1960-01-01', values: { nationality: 'Dutch' } },
      ],
    });
    expect(res.status).toBe(200);
    const [, jan, sanne] = await rows('SELECT date_of_birth, band_key FROM seat_passengers WHERE seat_booking_id = ? ORDER BY created_at, id', trip.bookingId);
    expect(jan).toEqual({ date_of_birth: '1990-01-01', band_key: 'adult' });
    expect(sanne).toEqual({ date_of_birth: '2025-01-01', band_key: 'child' });
  });
});

describe('extras on the page', () => {
  it('saves the choices per person and day, prices them by band and makes the extras invoice', async () => {
    const trip = await makeTrip();
    const { token } = await linkOf(trip.bookingId);
    const data = await view(token);
    const res = await pub('PUT', token, '/extras', {
      choices: [
        { passengerRef: pick(data, 'Eva').ref, extraRef: extraRef(data, 'Gondola'), quantity: 1 },
        { passengerRef: pick(data, 'Sanne').ref, extraRef: extraRef(data, 'Gondola'), quantity: 1 },
        { passengerRef: pick(data, 'Jan').ref, extraRef: extraRef(data, 'Dinner'), quantity: 2 },
      ],
    });
    expect(res.status).toBe(200);
    const out = (await json(res)).data;
    expect(out.invoiceCreated).toMatchObject({ total: 130, currency: 'EUR' });
    expect(out.extrasMoney).toEqual({ total: 130, paid: 0, unpaid: 130 });
    expect(pick(out, 'Sanne').extras).toEqual([{ extraRef: extraRef(out, 'Gondola'), quantity: 1, status: 'invoiced' }]);
    const stored = await rows('SELECT unit_price, quantity, selected_via, status FROM passenger_extras WHERE departure_id = ? ORDER BY unit_price', trip.depId);
    expect(stored.map((r) => [r.unit_price, r.quantity, r.selected_via, r.status])).toEqual([[25, 2, 'self_service', 'invoiced'], [30, 1, 'self_service', 'invoiced'], [50, 1, 'self_service', 'invoiced']]);

    // Taking one away updates the same invoice.
    const fewer = await pub('PUT', token, '/extras', { choices: [{ passengerRef: pick(data, 'Eva').ref, extraRef: extraRef(data, 'Gondola'), quantity: 1 }] });
    expect((await json(fewer)).data.invoiceCreated).toMatchObject({ total: 50 });
    expect((await rows('SELECT COUNT(*) AS n FROM invoices WHERE id IN (SELECT invoice_id FROM passenger_extras WHERE departure_id = ?)', trip.depId))[0].n).toBe(1);
  });

  it('refuses a change after the cut-off and a choice that is sold out, and shows both on the page', async () => {
    const trip = await makeTrip({ gondolaCapacity: 1 });
    const { token } = await linkOf(trip.bookingId);
    const data = await view(token);
    const eva = pick(data, 'Eva').ref;
    const jan = pick(data, 'Jan').ref;
    expect(data.extras.find((e: any) => e.title === 'Gondola')).toMatchObject({ soldOut: false, left: 1 });

    const full = await pub('PUT', token, '/extras', { choices: [{ passengerRef: eva, extraRef: extraRef(data, 'Gondola'), quantity: 1 }, { passengerRef: jan, extraRef: extraRef(data, 'Gondola'), quantity: 1 }] });
    expect(full.status).toBe(409);
    expect((await json(full)).error).toMatchObject({ code: 'EXTRA_FULL', message: 'Gondola is fully booked' });
    expect((await pub('PUT', token, '/extras', { choices: [{ passengerRef: eva, extraRef: extraRef(data, 'Gondola'), quantity: 1 }] })).status).toBe(200);
    expect((await view(token)).extras.find((e: any) => e.title === 'Gondola')).toMatchObject({ soldOut: true, left: 0 });

    // The departure's extras cut-off date has passed.
    expect((await staff('PUT', `/departures/${trip.depId}`, { extrasCutoffDate: '2020-01-01' })).status).toBe(200);
    const closed = await view(token);
    expect(closed.extrasOpen).toBe(false);
    expect(closed.extras.every((e: any) => e.open === false)).toBe(true);
    const late = await pub('PUT', token, '/extras', { choices: [{ passengerRef: eva, extraRef: extraRef(closed, 'Gondola'), quantity: 1 }, { passengerRef: jan, extraRef: extraRef(closed, 'Dinner'), quantity: 1 }] });
    expect(late.status).toBe(409);
    expect((await json(late)).error.code).toBe('EXTRAS_CLOSED');
    const drop = await pub('PUT', token, '/extras', { choices: [] });
    expect(drop.status).toBe(409);
    expect((await rows(`SELECT status FROM passenger_extras WHERE departure_id = ? AND status != 'cancelled'`, trip.depId))).toHaveLength(1);
    // Staff can still change it.
    expect((await staff('PUT', `/seat-bookings/${trip.bookingId}/extras`, { choices: [] })).status).toBe(200);
  });

  it('answers in the agency language', async () => {
    const trip = await makeTrip({ gondolaCapacity: 0 });
    const { token } = await linkOf(trip.bookingId);
    const data = await view(token);
    await setSetting('default_language', 'nl');
    try {
      const res = await pub('PUT', token, '/extras', { choices: [{ passengerRef: pick(data, 'Eva').ref, extraRef: extraRef(data, 'Gondola'), quantity: 1 }] });
      expect(res.status).toBe(409);
      expect((await json(res)).error.message).toBe('Gondola is volgeboekt');
    } finally {
      await setSetting('default_language', 'en');
    }
  });
});

describe('paying', () => {
  const bank = { accountName: 'Reisbureau Test BV', iban: 'NL91ABNA0417164300', bic: 'ABNANL2A', bankName: 'ABN AMRO' };

  it('creates a test-gateway link for the extras invoice, reuses it, and a payment on it marks the extras paid', async () => {
    expect((await staff('PUT', '/integrations/payment-gateways/mock', {})).status).toBe(200);
    const trip = await makeTrip();
    const { token } = await linkOf(trip.bookingId);
    const data = await view(token);
    expect((await pub('PUT', token, '/extras', { choices: [{ passengerRef: pick(data, 'Eva').ref, extraRef: extraRef(data, 'Gondola'), quantity: 1 }, { passengerRef: pick(data, 'Jan').ref, extraRef: extraRef(data, 'Dinner'), quantity: 2 }] })).status).toBe(200);

    const pay = await pub('POST', token, '/pay', { what: 'extras' });
    expect(pay.status).toBe(200);
    const out = (await json(pay)).data;
    expect(out.payment).toMatchObject({ amount: 100, currency: 'EUR' });
    expect(out.payment.url).toContain('/webhooks/payments/mock-pay/');
    const invoice = (await rows(`SELECT i.* FROM invoices i JOIN passenger_extras pe ON pe.invoice_id = i.id WHERE pe.departure_id = ? LIMIT 1`, trip.depId))[0];
    expect(invoice).toMatchObject({ invoice_number: out.reference, payment_link_status: 'created', payment_link_gateway: 'mock', payment_link_amount: 100, payment_link_purpose: 'balance' });

    // Asking again gives the same link.
    expect((await json(await pub('POST', token, '/pay', { what: 'extras' }))).data.payment.url).toBe(out.payment.url);

    // Paying on the page the link opens records one payment and marks the extras paid.
    const ctx = createExecutionContext();
    const paid = await worker.fetch(
      new Request(`http://localhost${new URL(out.payment.url).pathname}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'method=ideal&action=pay' }),
      testEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(paid.status).toBe(200);
    expect((await rows('SELECT amount FROM payments WHERE invoice_id = ?', invoice.id))).toEqual([{ amount: 100 }]);
    expect((await rows('SELECT status FROM invoices WHERE id = ?', invoice.id))[0].status).toBe('paid');
    expect((await rows('SELECT status FROM passenger_extras WHERE departure_id = ?', trip.depId)).every((r) => r.status === 'paid')).toBe(true);
    const after = await view(token);
    expect(after.extrasMoney).toEqual({ total: 100, paid: 100, unpaid: 0 });
    expect((await pub('POST', token, '/pay', { what: 'extras' })).status).toBe(409);
  });

  it('pays the balance of the booking invoice and the deposit, and answers nothing-due when there is nothing', async () => {
    expect((await staff('PUT', '/integrations/payment-gateways/mock', {})).status).toBe(200);
    expect((await staff('PUT', '/departures/settings', { deposit: { type: 'percent', value: 30 } })).status).toBe(200);
    const trip = await makeTrip();
    const { token } = await linkOf(trip.bookingId);
    // Adults 2 x 1000 and a child 600: 2600. No invoice yet: it is made when the customer pays.
    const deposit = (await json(await pub('POST', token, '/pay', { what: 'deposit' }))).data;
    expect(deposit.payment).toMatchObject({ amount: 780, currency: 'EUR' });
    const balance = (await json(await pub('POST', token, '/pay', { what: 'balance' }))).data;
    expect(balance.payment).toMatchObject({ amount: 2600 });
    expect(balance.payment.url).not.toBe(deposit.payment.url);
    const page = await view(token);
    expect(page.invoice).toMatchObject({ total: 2600, paid: 0, balance: 2600 });
    expect(page.deposit).toEqual({ amount: 780, due: 780 });
    // Nothing chosen, nothing to pay for extras.
    expect((await pub('POST', token, '/pay', { what: 'extras' })).status).toBe(409);
    expect((await pub('POST', token, '/pay', { what: 'other' })).status).toBe(400);
  });

  it('gives the bank details and the invoice number as the reference when no gateway is connected', async () => {
    await setSetting('bank_details', JSON.stringify(bank));
    const trip = await makeTrip();
    const { token } = await linkOf(trip.bookingId);
    const data = await view(token);
    expect((await pub('PUT', token, '/extras', { choices: [{ passengerRef: pick(data, 'Eva').ref, extraRef: extraRef(data, 'Dinner'), quantity: 1 }] })).status).toBe(200);
    const out = (await json(await pub('POST', token, '/pay', { what: 'extras' }))).data;
    expect(out.payment).toBeUndefined();
    expect(out.bank).toMatchObject({ amount: 25, currency: 'EUR', reference: out.reference });
    expect(out.bank.lines.map((l: any) => l.field)).toEqual(expect.arrayContaining(['accountName', 'iban']));
  });
});

describe('limits', () => {
  it('limits writes to 30 a minute per token and pay to 5 a minute per token, whatever the address', async () => {
    const trip = await makeTrip();
    const { token } = await linkOf(trip.bookingId);
    const other = await makeTrip();
    const otherToken = (await linkOf(other.bookingId)).token;
    for (let i = 0; i < 30; i++) expect((await pub('PUT', token, '/extras', { choices: [] }, realLimits, `192.0.2.${i + 1}`)).status).not.toBe(429);
    expect((await pub('PUT', token, '/extras', { choices: [] }, realLimits, '192.0.2.250')).status).toBe(429);
    // Another link is not affected.
    expect((await pub('PUT', otherToken, '/extras', { choices: [] }, realLimits, '192.0.2.251')).status).toBe(200);

    for (let i = 0; i < 5; i++) expect((await pub('POST', otherToken, '/pay', { what: 'extras' }, realLimits, `192.0.2.${100 + i}`)).status).not.toBe(429);
    expect((await pub('POST', otherToken, '/pay', { what: 'extras' }, realLimits, '192.0.2.199')).status).toBe(429);
  });

  it('limits reads to 60 a minute per address', async () => {
    const trip = await makeTrip();
    const { token } = await linkOf(trip.bookingId);
    for (let i = 0; i < 60; i++) expect((await pub('GET', token, '', undefined, realLimits, '192.0.2.222')).status).toBe(200);
    expect((await pub('GET', token, '', undefined, realLimits, '192.0.2.222')).status).toBe(429);
  });
});
