import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { newToken, TOKEN_SHAPE } from '../src/services/public-links';

// R148: the public booking page of a departure. The token names the departure; everything else is gated and rate limited.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const realLimits = { ...testEnv, RATE_LIMIT_MULTIPLIER: '1' };

let admin = '';
let seq = 0;
let ipSeq = 20;

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

const pubGet = (token: string, suffix = '', e: any = testEnv) => send(e, 'GET', `/api/v1/public/departures/${token}${suffix}`, { headers: { 'cf-connecting-ip': `198.51.100.${ipSeq++ % 250}` } });
const pubPost = (token: string, body: unknown, opts: { headers?: Record<string, string>; ip?: string; e?: any } = {}) =>
  send(opts.e ?? testEnv, 'POST', `/api/v1/public/departures/${token}/bookings`, { json: body, headers: { 'cf-connecting-ip': opts.ip ?? `203.0.113.${ipSeq++ % 250}`, ...(opts.headers ?? {}) } });

interface Dep { id: string; tourId: string; token: string; url: string }

/** A tour in EUR with band, room and seat prices and three stops, one open departure and its public page. */
async function makeDeparture(o: { capacity?: number; status?: 'open' | 'closed' | 'draft'; link?: boolean } = {}): Promise<Dep> {
  seq += 1;
  const tourRes = await staff('POST', '/tours', { code: `PB${seq}`, title: `Alpine round ${seq}`, destination: 'Switzerland', durationDays: 5, currency: 'EUR', terms: 'Tour terms apply.' });
  expect(tourRes.status).toBe(201);
  const tourId = (await json(tourRes)).data.id;
  expect((await staff('PUT', `/tours/${tourId}/prices`, {
    prices: [
      { kind: 'age_band', key: 'adult', label: 'Adult', amount: 1000 },
      { kind: 'age_band', key: 'child', label: 'Child', amount: 600 },
      { kind: 'age_band', key: 'infant', label: 'Infant', amount: 0 },
      { kind: 'room_supplement', key: 'single', amount: 250 },
      { kind: 'seat_surcharge', key: 'premium', amount: 40 },
    ],
  })).status).toBe(200);
  expect((await staff('PUT', `/tours/${tourId}/stops`, {
    stops: [
      { name: 'Amsterdam Centraal', address: 'Stationsplein 1', localTime: '06:30', kind: 'pickup' },
      { name: 'Utrecht', localTime: '07:15', kind: 'both' },
      { name: 'Hotel drop', kind: 'dropoff' },
    ],
  })).status).toBe(200);
  const depRes = await staff('POST', '/departures', { tourId, startDate: `2033-0${(seq % 9) + 1}-10`, capacityMode: 'manual', capacity: o.capacity ?? 20 });
  expect(depRes.status).toBe(201);
  const id = (await json(depRes)).data.id;
  const status = o.status ?? 'open';
  if (status !== 'draft') expect((await staff('POST', `/departures/${id}/status`, { status: 'open' })).status).toBe(200);
  if (status === 'closed') expect((await staff('POST', `/departures/${id}/status`, { status: 'closed' })).status).toBe(200);
  let url = '';
  let token = '';
  if (o.link !== false) {
    const link = await staff('POST', `/departures/${id}/public-link`);
    expect(link.status).toBe(200);
    url = (await json(link)).data.url;
    token = url.split('/').pop()!;
  }
  return { id, tourId, token, url };
}

interface Seen { ref: string; formToken: string; page: any }
async function openPage(token: string, e: any = testEnv): Promise<Seen> {
  const res = await pubGet(token, '', e);
  expect(res.status).toBe(200);
  const page = (await json(res)).data;
  return { ref: page.pickupPoints[0]?.ref, formToken: page.formToken, page };
}

const party = (ref: string, over: Record<string, unknown> = {}) => [
  { band: 'adult', firstName: 'Eva', lastName: 'de Vries', gender: 'female', pickupPoint: ref, roomType: 'single', shareOk: false, mealPreference: 'vegetarian', preferredSeat: '12A' },
  { band: 'adult', firstName: 'Jan', lastName: 'de Vries', gender: 'male', pickupPoint: ref },
  { band: 'child', firstName: 'Sanne', lastName: 'de Vries', ageYears: 8, pickupPoint: ref },
  { band: 'child', firstName: 'Tim', lastName: 'de Vries', ageYears: 5, pickupPoint: ref, ...over },
];

let emailSeq = 0;
const bookingBody = (seen: Seen, over: Record<string, unknown> = {}) => ({
  formToken: seen.formToken,
  language: 'en',
  contact: { name: 'Eva de Vries', email: `eva.${++emailSeq}@public-booking.test`, phone: '06 12345678' },
  passengers: party(seen.ref),
  acceptTerms: true,
  ...over,
});

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
    enabled: true,
    holdExpiryHours: 48,
    confirmMode: 'manual',
    waitlist: { enabled: true },
    preferredSeat: { enabled: true },
    showSeatsLeft: 'always',
    seatsLeftThreshold: 10,
    deposit: { type: 'none', value: null },
    publicBooking: { requireTerms: true, termsText: '', marketingOptIn: true },
  })).status).toBe(200);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('public links', () => {
  it('tokens are 128 random bits in base64url, never UUIDv7', () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(TOKEN_SHAPE);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/^[0-9a-f]{8}-/); // not a UUID
    expect(a.length).toBe(22);
  });

  it('enabling twice keeps one address, revoking stops it, enabling again makes a new one', async () => {
    const dep = await makeDeparture();
    const again = await json(await staff('POST', `/departures/${dep.id}/public-link`));
    expect(again.data.url).toBe(dep.url);
    expect(dep.url).toMatch(/\/book\/[A-Za-z0-9_-]{22}$/);
    expect((await json(await staff('GET', `/departures/${dep.id}/public-link`))).data).toMatchObject({ available: true, enabled: true, url: dep.url });
    expect((await pubGet(dep.token)).status).toBe(200);

    const off = await json(await staff('DELETE', `/departures/${dep.id}/public-link`));
    expect(off.data).toMatchObject({ enabled: false, url: null });
    expect((await pubGet(dep.token)).status).toBe(404);
    expect((await rows('SELECT public_booking_enabled AS e FROM departures WHERE id = ?', dep.id))[0].e).toBe(0);

    const fresh = (await json(await staff('POST', `/departures/${dep.id}/public-link`))).data.url as string;
    expect(fresh).not.toBe(dep.url);
    expect((await pubGet(fresh.split('/').pop()!)).status).toBe(200);
    expect((await pubGet(dep.token)).status).toBe(404);
  });

  it('a salesperson may view but a view-only role may not switch the page on', async () => {
    const dep = await makeDeparture({ link: false });
    const viewer = await json(await send(testEnv, 'POST', '/api/v1/auth/login', { json: { email: 'viewer@e2e.test', password: 'password123', tenantId: TENANT_ID } }));
    const token = viewer.data.accessToken;
    expect((await send(testEnv, 'POST', `/api/v1/departures/${dep.id}/public-link`, { token })).status).toBe(403);
    expect((await send(testEnv, 'GET', `/api/v1/departures/${dep.id}/public-link`, { token })).status).toBe(200);
  });
});

describe('GET /public/departures/:token', () => {
  it('unknown, revoked, wrong-kind and malformed tokens give the same 404 body', async () => {
    const dep = await makeDeparture();
    await DB.prepare(`INSERT INTO public_links (token, tenant_id, kind, entity_id) VALUES (?, ?, 'booking_self_service', ?)`).bind('B'.repeat(22), TENANT_ID, dep.id).run();
    const revoked = newToken();
    await DB.prepare(`INSERT INTO public_links (token, tenant_id, kind, entity_id, is_active) VALUES (?, ?, 'departure_booking', ?, 0)`).bind(revoked, TENANT_ID, dep.id).run();

    const bodies: string[] = [];
    for (const t of [newToken(), revoked, 'B'.repeat(22), 'short', 'a%20b', dep.id]) {
      const res = await pubGet(t);
      expect(res.status, t).toBe(404);
      bodies.push(await res.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]).error.code).toBe('NOT_FOUND');
  });

  it('an expired link answers 410', async () => {
    const dep = await makeDeparture();
    await DB.prepare(`UPDATE public_links SET expires_at = '2020-01-01T00:00:00Z' WHERE token = ?`).bind(dep.token).run();
    expect((await pubGet(dep.token)).status).toBe(410);
  });

  it('the plan feature, the agency switch and the departure switch each give the 404', async () => {
    const dep = await makeDeparture();
    expect((await pubGet(dep.token)).status).toBe(200);

    await DB.prepare(`INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES ('r148-pb', ?, 'public_booking', 0)`).bind(TENANT_ID).run();
    expect((await pubGet(dep.token)).status).toBe(404);
    expect((await pubPost(dep.token, {})).status).toBe(404);
    await DB.prepare(`DELETE FROM tenant_feature_flags WHERE id = 'r148-pb'`).run();
    expect((await pubGet(dep.token)).status).toBe(200);

    await staff('PUT', '/departures/settings', { enabled: false });
    expect((await pubGet(dep.token)).status).toBe(404);
    await staff('PUT', '/departures/settings', { enabled: true });

    expect((await staff('PUT', `/departures/${dep.id}`, { publicBookingEnabled: false })).status).toBe(200);
    expect((await pubGet(dep.token)).status).toBe(404);
    expect((await staff('PUT', `/departures/${dep.id}`, { publicBookingEnabled: true })).status).toBe(200);
    expect((await pubGet(dep.token)).status).toBe(200);

    const draft = await makeDeparture({ status: 'draft' });
    expect((await pubGet(draft.token)).status).toBe(404);
  });

  it('a closed departure answers 200 with state closed and takes no booking', async () => {
    const dep = await makeDeparture({ status: 'closed' });
    const page = (await json(await pubGet(dep.token))).data;
    expect(page.state).toBe('closed');
    expect(page.tour.title).toContain('Alpine round');
    const res = await pubPost(dep.token, { formToken: page.formToken });
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('CLOSED');
  });

  it('shows the fixed projection and nothing internal', async () => {
    const dep = await makeDeparture({ capacity: 12 });
    await staff('PUT', `/departures/${dep.id}/costs`, { costs: [{ description: 'Coach hire secret-cost', kind: 'per_departure', amount: 4321 }] });
    await staff('PUT', `/departures/${dep.id}`, { notes: 'internal-note-for-staff' });
    const stops = (await json(await staff('GET', `/departures/${dep.id}/stops`))).data as Array<{ id: string }>;

    const res = await pubGet(dep.token);
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    expect(res.headers.get('cache-control')).toContain('no-store');
    const text = await res.text();
    const page = JSON.parse(text).data;

    expect(page).toMatchObject({
      state: 'open',
      tour: { title: expect.stringContaining('Alpine round'), destination: 'Switzerland', durationDays: 5 },
      currency: 'EUR',
      language: { default: 'en', available: ['en', 'nl'] },
      seats: { left: 12, full: false },
      requireTerms: true,
      terms: 'Tour terms apply.',
    });
    expect(page.prices.bands.map((b: any) => [b.key, b.amount, b.minAge, b.maxAge])).toEqual([['adult', 1000, 12, null], ['child', 600, 2, 11], ['infant', 0, 0, 1]]);
    expect(page.prices.roomSupplements.find((r: any) => r.key === 'single').amount).toBe(250);
    expect(page.prices.seatSurcharge).toBe(40);
    // Pickup points only (the drop-only stop is not offered), by opaque reference.
    expect(page.pickupPoints.map((p: any) => [p.name, p.localTime])).toEqual([['Amsterdam Centraal', '06:30'], ['Utrecht', '07:15']]);
    expect(page.passengerFields.some((f: any) => f.key === 'pickupPoint')).toBe(true);
    expect(page.passengerFields.some((f: any) => f.key === 'documentNumber')).toBe(false); // collected later, not at booking
    expect(page.agency.name).toBe('Test Agency');

    for (const forbidden of [dep.id, dep.tourId, ...stops.map((s) => s.id), TENANT_ID, 'secret-cost', 'internal-note-for-staff', 'createdBy', 'created_by', 'supplier']) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    expect(text).not.toMatch(/"id"\s*:/);
    expect(text).not.toContain(dep.token);
  });

  it('shows seats left only as the setting allows', async () => {
    const dep = await makeDeparture({ capacity: 30 });
    expect((await openPage(dep.token)).page.seats.left).toBe(30);
    await staff('PUT', '/departures/settings', { showSeatsLeft: 'below_threshold', seatsLeftThreshold: 10 });
    expect((await openPage(dep.token)).page.seats.left).toBeNull();
    await staff('PUT', `/departures`.concat(`/${dep.id}`), { capacity: 8 });
    expect((await openPage(dep.token)).page.seats.left).toBe(8);
    await staff('PUT', '/departures/settings', { showSeatsLeft: 'never' });
    const hidden = (await openPage(dep.token)).page.seats;
    expect(hidden.left).toBeNull();
    expect(hidden.full).toBe(false);
  });

  it('lists the websites allowed to frame the page from the chat widget settings', async () => {
    const dep = await makeDeparture();
    expect((await json(await pubGet(dep.token, '/frame'))).data.ancestors).toEqual([]);
    await DB.prepare(`INSERT OR REPLACE INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES ('r148-bot', ?, 'ai_chatbot', 1)`).bind(TENANT_ID).run();
    expect((await staff('PUT', '/chatbot/config/website', { enabled: 1, greeting: 'Hi', allowedOrigins: ['https://www.example-travel.test/', "https://x.test; script-src *", 'https://*.partner.test'] })).status).toBeLessThan(300);
    expect((await json(await pubGet(dep.token, '/frame'))).data.ancestors).toEqual(['https://www.example-travel.test', 'https://*.partner.test']);
    expect((await pubGet(newToken(), '/frame')).status).toBe(404);
  });
});

describe('POST /public/departures/:token/bookings', () => {
  it('creates the contact, a website lead in the departure currency, passengers with bands and a held booking', async () => {
    const dep = await makeDeparture();
    const seen = await openPage(dep.token);
    const body = bookingBody(seen, { marketingOptIn: true });
    const res = await pubPost(dep.token, body);
    expect(res.status).toBe(201);
    const out = (await json(res)).data;
    expect(out).toMatchObject({ status: 'held', seats: 4, currency: 'EUR' });
    expect(out.holdExpiresAt).toBeTruthy();
    expect(out.reference).toMatch(/^BK-[0-9A-F]{8}$/);
    expect(JSON.stringify(out)).not.toContain(dep.id);

    const booking = (await rows('SELECT * FROM seat_bookings WHERE departure_id = ?', dep.id))[0];
    expect(booking).toMatchObject({ status: 'held', seats: 4, source: 'public_page', created_by: null });
    const contact = (await rows('SELECT * FROM contacts WHERE id = ?', booking.contact_id))[0];
    expect(contact).toMatchObject({ name: 'Eva de Vries', email: body.contact.email, phone: '+31612345678' });
    const lead = (await rows('SELECT * FROM leads WHERE id = ?', booking.lead_id))[0];
    expect(lead).toMatchObject({ source: 'website', currency: 'EUR', departure_id: dep.id, contact_id: contact.id });
    expect(lead.travel_date).toMatch(/^2033-/);

    const passengers = await rows('SELECT * FROM seat_passengers WHERE seat_booking_id = ? ORDER BY created_at, id', booking.id);
    expect(passengers.map((p) => p.band_key)).toEqual(['adult', 'adult', 'child', 'child']);
    expect(passengers[0]).toMatchObject({ first_name: 'Eva', gender: 'female', room_type: 'single', share_ok: 0, meal_preference: 'vegetarian', seat_number: '12A' });
    expect(passengers.every((p) => !!p.pickup_stop_id)).toBe(true);
    expect(passengers[2]).toMatchObject({ age_years: 8, band_key: 'child' });

    const events = (await rows(`SELECT type FROM domain_events WHERE entity_id IN (?, ?)`, lead.id, booking.id)).map((r) => r.type);
    expect(events).toContain('lead.created');
    expect(events).toContain('seat_booking.held');
    // No deposit asked: no invoice and no payment on the answer.
    expect(out.payment).toBeUndefined();
    expect(out.bank).toBeUndefined();
    expect(booking.invoice_id).toBeNull();
  });

  it('records the terms always and marketing only when ticked and offered', async () => {
    await DB.prepare('DELETE FROM contact_consents').run();
    const dep = await makeDeparture();
    const first = await openPage(dep.token);
    const plain = await pubPost(dep.token, bookingBody(first));
    expect(plain.status).toBe(201);
    const consents = await rows(`SELECT * FROM contact_consents ORDER BY captured_at, id`);
    expect(consents.map((c) => [c.purpose, c.status, c.source, c.channel])).toEqual([['service', 'granted', 'form', 'any']]);
    expect(JSON.parse(consents[0].evidence).accepted).toBe('terms');

    const second = await openPage(dep.token);
    await pubPost(dep.token, bookingBody(second, { marketingOptIn: true, passengers: party(second.ref).map((p) => ({ ...p, preferredSeat: undefined })) }));
    const marketing = await rows(`SELECT * FROM contact_consents WHERE purpose = 'marketing'`);
    expect(marketing.map((c) => [c.status, c.source])).toEqual([['granted', 'form']]);

    // The agency does not offer the box: a ticked box is ignored.
    await staff('PUT', '/departures/settings', { publicBooking: { marketingOptIn: false } });
    const third = await openPage(dep.token);
    expect(third.page.marketingOptIn).toBe(false);
    await pubPost(dep.token, bookingBody(third, { marketingOptIn: true, passengers: party(third.ref).map((p) => ({ ...p, preferredSeat: undefined })) }));
    expect((await rows(`SELECT COUNT(*) AS n FROM contact_consents WHERE purpose = 'marketing'`))[0].n).toBe(1);
  });

  it('an earlier opt-out of the contact stays in force when the box is ticked by whoever typed the address', async () => {
    const dep = await makeDeparture();
    const seen = await openPage(dep.token);
    const email = 'optedout@public-booking.test';
    await DB.prepare(`INSERT INTO contacts (id, name, email, type, opted_out) VALUES ('c-optout-r148', 'Opted Out', ?, 'customer', 1)`).bind(email).run();
    const res = await pubPost(dep.token, bookingBody(seen, { contact: { name: 'Someone', email }, marketingOptIn: true }));
    expect(res.status).toBe(201);
    expect((await rows(`SELECT opted_out FROM contacts WHERE id = 'c-optout-r148'`))[0].opted_out).toBe(1);
    expect((await rows(`SELECT COUNT(*) AS n FROM contact_consents WHERE contact_id = 'c-optout-r148' AND purpose = 'marketing'`))[0].n).toBe(1);
  });

  it('refuses without the terms, with a bad contact, and with passengers that do not fit the bands', async () => {
    const dep = await makeDeparture();
    const before = (await rows('SELECT COUNT(*) AS n FROM seat_bookings'))[0].n;
    const seen = await openPage(dep.token);

    let res = await pubPost(dep.token, bookingBody(seen, { acceptTerms: false }));
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('TERMS_REQUIRED');

    res = await pubPost(dep.token, bookingBody(seen, { contact: { name: 'Eva' } }));
    expect((await json(res)).error.code).toBe('CONTACT_REQUIRED');
    res = await pubPost(dep.token, bookingBody(seen, { contact: { name: 'Eva', email: 'not-an-email' } }));
    expect((await json(res)).error.field).toBe('email');
    res = await pubPost(dep.token, bookingBody(seen, { contact: { name: 'Eva', phone: '12' } }));
    expect((await json(res)).error.field).toBe('phone');

    // A child fare for someone aged 30, a child fare without any age, an unknown band, a stop that is not on the departure.
    const base = party(seen.ref);
    res = await pubPost(dep.token, bookingBody(seen, { passengers: [{ ...base[0], band: 'child', ageYears: 30 }] }));
    expect(res.status).toBe(400);
    expect((await json(res)).error.errors).toEqual([{ index: 0, field: 'band' }]);
    res = await pubPost(dep.token, bookingBody(seen, { passengers: [{ band: 'child', firstName: 'Tim', pickupPoint: seen.ref }] }));
    expect((await json(res)).error.errors[0]).toMatchObject({ index: 0 });
    res = await pubPost(dep.token, bookingBody(seen, { passengers: [{ ...base[0], band: 'senior' }] }));
    expect(res.status).toBe(400);
    res = await pubPost(dep.token, bookingBody(seen, { passengers: [{ ...base[0], pickupPoint: 'f'.repeat(16) }] }));
    expect((await json(res)).error.errors).toEqual([{ index: 0, field: 'pickupPoint' }]);
    // A required field (the pickup point) left out.
    res = await pubPost(dep.token, bookingBody(seen, { passengers: [{ band: 'adult', firstName: 'Eva' }] }));
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('PASSENGER_INVALID');

    expect((await rows('SELECT COUNT(*) AS n FROM seat_bookings'))[0].n).toBe(before);
    expect((await rows(`SELECT COUNT(*) AS n FROM leads WHERE source = 'website' AND departure_id = ?`, dep.id))[0].n).toBe(0);
  });

  it('a preferred seat another party already has is refused with its own message', async () => {
    const dep = await makeDeparture();
    const seen = await openPage(dep.token);
    expect((await pubPost(dep.token, bookingBody(seen))).status).toBe(201);
    const again = await openPage(dep.token);
    const res = await pubPost(dep.token, bookingBody(again));
    expect(res.status).toBe(400);
    expect((await json(res)).error.message).toBe('That seat is already taken');
  });

  it('puts a party that does not fit on the waitlist, or refuses it with the waitlist off', async () => {
    const dep = await makeDeparture({ capacity: 6 });
    const seen = await openPage(dep.token);
    const small = (over = {}) => bookingBody(seen, { passengers: party(seen.ref).slice(1, 4).map((p, i) => ({ ...p, preferredSeat: undefined, firstName: `P${i}`, ...over })) });
    expect((await json(await pubPost(dep.token, small()))).data.status).toBe('held'); // 3 of 6
    const second = await json(await pubPost(dep.token, small()));
    expect(second.data.status).toBe('held'); // 6 of 6
    const full = await openPage(dep.token);
    expect(full.page.seats).toMatchObject({ left: 0, full: true, waitlist: true });

    const waitlisted = await json(await pubPost(dep.token, { ...small(), formToken: full.formToken }));
    expect(waitlisted.data.status).toBe('waitlisted');
    expect(waitlisted.data.holdExpiresAt).toBeNull();
    expect((await rows(`SELECT status, waitlist_position FROM seat_bookings WHERE departure_id = ? AND status = 'waitlisted'`, dep.id))[0].waitlist_position).toBe(1);

    await staff('PUT', '/departures/settings', { waitlist: { enabled: false } });
    const refused = await pubPost(dep.token, { ...small(), formToken: full.formToken });
    expect(refused.status).toBe(409);
    expect((await json(refused)).error).toMatchObject({ code: 'SEATS_UNAVAILABLE', seats: { full: true } });
  });

  it('confirms at once in confirm mode auto_when_available', async () => {
    const dep = await makeDeparture();
    await staff('PUT', '/departures/settings', { confirmMode: 'auto_when_available' });
    const seen = await openPage(dep.token);
    const out = (await json(await pubPost(dep.token, bookingBody(seen)))).data;
    expect(out.status).toBe('confirmed');
    expect(out.holdExpiresAt).toBeNull();
  });

  it('rejects the honeypot, a form sent too fast and a form token that is not ours', async () => {
    const dep = await makeDeparture();
    const seen = await openPage(dep.token);
    let res = await pubPost(dep.token, bookingBody(seen, { website: 'https://spam.example' }));
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('REJECTED');

    res = await pubPost(dep.token, bookingBody(seen, { formToken: `${Date.now() - 60_000}.${'0'.repeat(32)}` }));
    expect((await json(res)).error.code).toBe('REJECTED');
    // The token of another departure's page does not work here.
    const other = await makeDeparture();
    const foreign = await openPage(other.token);
    res = await pubPost(dep.token, bookingBody(seen, { formToken: foreign.formToken }));
    expect((await json(res)).error.code).toBe('REJECTED');

    const slow = { ...testEnv, PUBLIC_BOOKING_MIN_FILL_SECONDS: '3' };
    const fresh = await openPage(dep.token, slow);
    res = await pubPost(dep.token, bookingBody(fresh), { e: slow });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('TOO_FAST');
    expect((await rows('SELECT COUNT(*) AS n FROM seat_bookings WHERE departure_id = ?', dep.id))[0].n).toBe(0);
  });

  it('an Idempotency-Key makes a double submit one booking and returns the first answer', async () => {
    const dep = await makeDeparture();
    const seen = await openPage(dep.token);
    const body = bookingBody(seen);
    const headers = { 'Idempotency-Key': 'double-click-1' };
    const first = await pubPost(dep.token, body, { headers });
    const second = await pubPost(dep.token, body, { headers });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect((await json(second)).data.reference).toBe((await json(first)).data.reference);
    expect((await rows('SELECT COUNT(*) AS n FROM seat_bookings WHERE departure_id = ?', dep.id))[0].n).toBe(1);
    expect((await rows(`SELECT COUNT(*) AS n FROM leads WHERE departure_id = ?`, dep.id))[0].n).toBe(1);

    // A refused form is not remembered: the corrected form goes through with the same key.
    const retry = { 'Idempotency-Key': 'fix-and-retry' };
    expect((await pubPost(dep.token, bookingBody(seen, { acceptTerms: false }), { headers: retry })).status).toBe(400);
    expect((await pubPost(dep.token, bookingBody(seen, { passengers: party(seen.ref).slice(1, 2) }), { headers: retry })).status).toBe(201);
  });

  it('limits a visitor to 5 bookings in 10 minutes and a link to 30 an hour', async () => {
    const dep = await makeDeparture();
    const seen = await openPage(dep.token, realLimits);
    const ip = '192.0.2.77';
    for (let i = 0; i < 5; i++) {
      const res = await pubPost(dep.token, { formToken: seen.formToken }, { ip, e: realLimits }); // refused as invalid, but each counts
      expect(res.status).toBe(400);
    }
    const sixth = await pubPost(dep.token, { formToken: seen.formToken }, { ip, e: realLimits });
    expect(sixth.status).toBe(429);
    // Another visitor is not affected.
    expect((await pubPost(dep.token, { formToken: seen.formToken }, { ip: '192.0.2.78', e: realLimits })).status).toBe(400);

    // The token limit is shared by all visitors.
    const busy = await makeDeparture();
    for (let i = 0; i < 30; i++) expect((await pubPost(busy.token, {}, { ip: `192.0.2.${i + 1}`, e: realLimits })).status).not.toBe(429);
    expect((await pubPost(busy.token, {}, { ip: '192.0.2.250', e: realLimits })).status).toBe(429);
  });

  it('limits reads to 60 a minute per visitor', async () => {
    const dep = await makeDeparture();
    for (let i = 0; i < 60; i++) expect((await send(realLimits, 'GET', `/api/v1/public/departures/${dep.token}`, { headers: { 'cf-connecting-ip': '192.0.2.200' } })).status).toBe(200);
    expect((await send(realLimits, 'GET', `/api/v1/public/departures/${dep.token}`, { headers: { 'cf-connecting-ip': '192.0.2.200' } })).status).toBe(429);
  });

  it('checks Turnstile when the secret is set, and only then', async () => {
    const dep = await makeDeparture();
    const guarded = { ...testEnv, TURNSTILE_SECRET_KEY: 'test-turnstile-secret', TURNSTILE_SITE_KEY: 'site-key' };
    const seen = await openPage(dep.token, guarded);
    expect(seen.page.captcha).toEqual({ siteKey: 'site-key' });
    expect((await openPage(dep.token)).page.captcha).toBeNull();

    const verdicts = [false, true];
    const fetchSpy = vi.fn(async (input: any) => {
      expect(String(input.url ?? input)).toContain('challenges.cloudflare.com/turnstile');
      return new Response(JSON.stringify({ success: verdicts.shift() }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchSpy);
    let res = await pubPost(dep.token, bookingBody(seen, { captchaToken: 'bad' }), { e: guarded });
    expect((await json(res)).error.code).toBe('CAPTCHA');
    res = await pubPost(dep.token, bookingBody(seen, { captchaToken: 'good' }), { e: guarded });
    expect(res.status).toBe(201);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // No token at all fails without calling Turnstile.
    res = await pubPost(dep.token, bookingBody(seen), { e: guarded });
    expect((await json(res)).error.code).toBe('CAPTCHA');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('answers in Dutch when the visitor asks for it', async () => {
    const dep = await makeDeparture();
    const seen = await openPage(dep.token);
    const res = await pubPost(dep.token, bookingBody(seen, { acceptTerms: false, language: 'nl' }));
    expect((await json(res)).error.message).toBe('Ga akkoord met de voorwaarden om te boeken');
  });
});

describe('deposit invoice and payment', () => {
  const bank = { accountName: 'Reisbureau Test BV', iban: 'NL91ABNA0417164300', bic: 'ABNANL2A', bankName: 'ABN AMRO' };
  const depositSettings = (over: Record<string, unknown> = {}) => staff('PUT', '/departures/settings', { deposit: { type: 'percent', value: 30 }, ...over });

  it('without a gateway the answer carries the bank details and the invoice number as the reference', async () => {
    await setSetting('bank_details', JSON.stringify(bank));
    await DB.prepare('DELETE FROM payment_gateway_accounts').run();
    await depositSettings();
    const dep = await makeDeparture();
    const seen = await openPage(dep.token);
    const out = (await json(await pubPost(dep.token, bookingBody(seen)))).data;

    // 2 adults 2 x 1000, 2 children 2 x 600, one single room 250, one preferred seat 40.
    expect(out).toMatchObject({ status: 'held', total: 3490, depositAmount: 1047, currency: 'EUR' });
    expect(out.payment).toBeUndefined();
    expect(out.bank.amount).toBe(1047);
    expect(out.bank.reference).toBe(out.reference);
    expect(out.reference).toMatch(/^[A-Z]*-?\d+/);
    const fields = out.bank.lines.map((l: any) => l.field);
    expect(fields).toEqual(expect.arrayContaining(['accountName', 'iban', 'bic']));
    expect(out.bank.lines.find((l: any) => l.field === 'iban').value).toBe('NL91 ABNA 0417 1643 00');

    const booking = (await rows('SELECT * FROM seat_bookings WHERE departure_id = ?', dep.id))[0];
    const invoice = (await rows('SELECT * FROM invoices WHERE id = ?', booking.invoice_id))[0];
    expect(invoice).toMatchObject({ invoice_number: out.reference, total: 3490, currency: 'EUR', lead_id: booking.lead_id, contact_id: booking.contact_id, created_by: null });
    expect(invoice.payment_link_url).toBeNull();
    expect((await rows('SELECT COUNT(*) AS n FROM invoice_items WHERE invoice_id = ?', invoice.id))[0].n).toBe(4);
  });

  it('with the test gateway connected the answer carries a deposit link that records one payment of the deposit', async () => {
    await depositSettings();
    expect((await staff('PUT', '/integrations/payment-gateways/mock', {})).status).toBe(200);
    const dep = await makeDeparture();
    const seen = await openPage(dep.token);
    const out = (await json(await pubPost(dep.token, bookingBody(seen)))).data;
    expect(out.bank).toBeUndefined();
    expect(out.payment).toMatchObject({ amount: 1047, currency: 'EUR' });
    expect(out.payment.url).toContain('/webhooks/payments/mock-pay/');

    const booking = (await rows('SELECT * FROM seat_bookings WHERE departure_id = ?', dep.id))[0];
    const invoice = (await rows('SELECT * FROM invoices WHERE id = ?', booking.invoice_id))[0];
    expect(invoice).toMatchObject({ payment_link_status: 'created', payment_link_gateway: 'mock', payment_link_amount: 1047, payment_link_purpose: 'deposit' });

    // Paying on the page the link opens records the payment once (the same pipeline as a real gateway's webhook).
    const ctx = createExecutionContext();
    const paid = await worker.fetch(
      new Request(`http://localhost${new URL(out.payment.url).pathname}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'method=ideal&action=pay' }),
      testEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(paid.status).toBe(200);
    const payments = await rows('SELECT * FROM payments WHERE invoice_id = ?', invoice.id);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amount: 1047, currency: 'EUR' });
    expect((await rows('SELECT status, paid_amount, balance_due FROM invoices WHERE id = ?', invoice.id))[0]).toMatchObject({ status: 'partially_paid', paid_amount: 1047, balance_due: 2443 });
  });

  it('a waitlisted party gets no invoice, and a booking that cannot be invoiced does not fail', async () => {
    await depositSettings();
    const dep = await makeDeparture({ capacity: 4 });
    const seen = await openPage(dep.token);
    expect((await pubPost(dep.token, bookingBody(seen))).status).toBe(201);
    const next = await openPage(dep.token);
    const out = (await json(await pubPost(dep.token, bookingBody(next, { passengers: party(next.ref).slice(1, 2) })))).data;
    expect(out.status).toBe('waitlisted');
    expect(out.payment ?? out.bank ?? null).toBeNull();
    expect((await rows(`SELECT invoice_id FROM seat_bookings WHERE status = 'waitlisted' AND departure_id = ?`, dep.id))[0].invoice_id).toBeNull();

    // A tour without prices: the seats are held and the answer simply has no payment part.
    const free = await makeDeparture();
    await staff('PUT', `/tours/${free.tourId}/prices`, { prices: [] });
    const page = await openPage(free.token);
    const res = await pubPost(free.token, bookingBody(page));
    expect(res.status).toBe(201);
    expect((await json(res)).data.payment).toBeUndefined();
  });
});

describe('privacy', () => {
  it('erasing the contact stops the self-service links, leaves the departure page alone and anonymises the passengers', async () => {
    const dep = await makeDeparture();
    const seen = await openPage(dep.token);
    expect((await pubPost(dep.token, bookingBody(seen))).status).toBe(201);
    const booking = (await rows('SELECT * FROM seat_bookings WHERE departure_id = ?', dep.id))[0];
    // A self-service link of this booking (R150 makes them) stops with the erasure; the departure's own link does not.
    const selfToken = newToken();
    await DB.prepare(`INSERT INTO public_links (token, tenant_id, kind, entity_id) VALUES (?, ?, 'booking_self_service', ?)`).bind(selfToken, TENANT_ID, booking.id).run();
    const erased = await staff('POST', `/contacts/${booking.contact_id}/erase`, { confirmation: 'ERASE CONTACT' });
    expect(erased.status).toBe(200);
    expect((await rows('SELECT is_active FROM public_links WHERE token = ?', selfToken))[0].is_active).toBe(0);
    expect((await rows('SELECT is_active FROM public_links WHERE token = ?', dep.token))[0].is_active).toBe(1);
    const left = await rows('SELECT first_name FROM seat_passengers WHERE seat_booking_id = ?', booking.id);
    expect(left.length).toBe(4);
    expect(left.every((p) => p.first_name === 'Erased')).toBe(true);
    expect((await pubGet(dep.token)).status).toBe(200);
  });
});

// R164-2: a tour can carry its own age bands; the booking page and passengers read them before the agency's.
describe('tour age bands', () => {
  const twelveYearOld = (seen: Seen, band: string) => [
    { band: 'adult', firstName: 'Eva', lastName: 'de Vries', pickupPoint: seen.ref },
    { band, firstName: 'Noor', lastName: 'de Vries', ageYears: 12, pickupPoint: seen.ref },
  ];

  it('a tour with adults from 13 prices a 12-year-old as a child while the agency says 12+', async () => {
    const dep = await makeDeparture();
    // Before: the agency's bands (adult from 12) decide.
    let seen = await openPage(dep.token);
    expect(seen.page.prices.bands.map((b: any) => [b.key, b.minAge, b.maxAge])).toEqual([['adult', 12, null], ['child', 2, 11], ['infant', 0, 1]]);
    let res = await pubPost(dep.token, bookingBody(seen, { passengers: twelveYearOld(seen, 'child') }));
    expect(res.status).toBe(400);

    // The tour's own bands: saved, validated and read back.
    const put = await staff('PUT', `/tours/${dep.tourId}`, { ageBands: [{ label: 'Adult', minAge: 13 }, { key: 'child', label: 'Child', minAge: 2 }, { key: 'infant', label: 'Infant', minAge: 0 }] });
    expect(put.status).toBe(200);
    const saved = (await json(put)).data.ageBands;
    expect(saved.map((b: any) => [b.key, b.minAge])).toEqual([['adult', 13], ['child', 2], ['infant', 0]]);
    expect((await json(await staff('GET', `/tours/${dep.tourId}`))).data.ageBands).toHaveLength(3);
    expect((await staff('PUT', `/tours/${dep.tourId}`, { ageBands: [{ label: 'Adult', minAge: 13 }] })).status).toBe(400); // no band from age 0

    seen = await openPage(dep.token);
    expect(seen.page.prices.bands.map((b: any) => [b.key, b.amount, b.minAge, b.maxAge])).toEqual([['adult', 1000, 13, null], ['child', 600, 2, 12], ['infant', 0, 0, 1]]);

    res = await pubPost(dep.token, bookingBody(seen, { passengers: twelveYearOld(seen, 'adult') }));
    expect(res.status).toBe(400);
    expect((await json(res)).error.errors).toEqual([{ index: 1, field: 'band' }]);
    res = await pubPost(dep.token, bookingBody(seen, { passengers: twelveYearOld(seen, 'child') }));
    expect(res.status).toBe(201);
    const booking = (await rows('SELECT id FROM seat_bookings WHERE departure_id = ?', dep.id))[0];
    const bands = (await rows('SELECT band_key FROM seat_passengers WHERE seat_booking_id = ? ORDER BY created_at, id', booking.id)).map((r) => r.band_key);
    expect(bands).toEqual(['adult', 'child']);


    // Back to the agency's bands.
    expect((await staff('PUT', `/tours/${dep.tourId}`, { ageBands: null })).status).toBe(200);
    seen = await openPage(dep.token);
    expect(seen.page.prices.bands.map((b: any) => [b.key, b.minAge])).toEqual([['adult', 12], ['child', 2], ['infant', 0]]);
  });

  it('another tour is unaffected', async () => {
    const own = await makeDeparture();
    const other = await makeDeparture();
    expect((await staff('PUT', `/tours/${own.tourId}`, { ageBands: [{ key: 'adult', label: 'Adult', minAge: 15 }, { key: 'child', label: 'Child', minAge: 2 }, { key: 'infant', label: 'Infant', minAge: 0 }] })).status).toBe(200);
    expect((await openPage(other.token)).page.prices.bands.map((b: any) => b.minAge)).toEqual([12, 2, 0]);
    expect((await openPage(own.token)).page.prices.bands.map((b: any) => b.minAge)).toEqual([15, 2, 0]);
  });
});
