import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import {
  choicesText, extraCutoffIso, isExtraOpen, mergeExtras, refundWindowOpen, setChoices, unitPrice, type ExtraRowDto,
} from '../src/services/departures/extras';

// R150: the extras of a tour and a departure: the effective catalogue, prices by age band or rate card, capacity, the cut-off, the
// extras invoice, payment, and the refund suggestion. The self-service page is in self-service-page.test.ts.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

let admin = '';
let seq = 0;

async function call(method: string, path: string, body?: unknown, token: string | null = admin): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const json = async (res: Response): Promise<any> => res.json();
const rows = async <T = any>(sql: string, ...b: unknown[]): Promise<T[]> => ((await DB.prepare(sql).bind(...b).all()).results ?? []) as T[];
const setSetting = (key: string, value: string) =>
  DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, value, new Date().toISOString()).run();

interface Dep { id: string; tourId: string }
interface Party { id: string; passengers: Array<{ id: string; firstName: string; bandKey: string | null }> }

/** A tour in EUR with adult, child and infant prices and one open departure (extras cut-off: 7 days before the start). */
async function makeDeparture(capacity = 20): Promise<Dep> {
  seq += 1;
  const tour = await call('POST', '/tours', { code: `EX${seq}`, title: `Lake tour ${seq}`, currency: 'EUR', durationDays: 4 });
  expect(tour.status).toBe(201);
  const tourId = (await json(tour)).data.id;
  expect((await call('PUT', `/tours/${tourId}/prices`, {
    prices: [
      { kind: 'age_band', key: 'adult', label: 'Adult', amount: 1000 },
      { kind: 'age_band', key: 'child', label: 'Child', amount: 600 },
      { kind: 'age_band', key: 'infant', label: 'Infant', amount: 0 },
    ],
  })).status).toBe(200);
  const dep = await call('POST', '/departures', { tourId, startDate: `2033-0${(seq % 9) + 1}-20`, capacityMode: 'manual', capacity });
  expect(dep.status).toBe(201);
  const id = (await json(dep)).data.id;
  expect((await call('POST', `/departures/${id}/status`, { status: 'open' })).status).toBe(200);
  return { id, tourId };
}

/** A party of two adults and a child (age 8 at the start), booked by staff. */
async function makeParty(dep: Dep, name = 'Mia'): Promise<Party> {
  const res = await call('POST', `/departures/${dep.id}/bookings`, {
    contact: { name: `${name} Visser`, email: `${name.toLowerCase()}.${++seq}@extras.test` },
    passengers: [
      { firstName: name, lastName: 'Visser', dateOfBirth: '1985-03-01' },
      { firstName: 'Piet', lastName: 'Visser', dateOfBirth: '1984-05-02' },
      { firstName: 'Lotte', lastName: 'Visser', dateOfBirth: '2025-01-01' },
    ],
  });
  expect(res.status).toBe(201);
  const booking = (await json(res)).data;
  const passengers = (await rows('SELECT id, first_name, band_key FROM seat_passengers WHERE seat_booking_id = ? ORDER BY created_at, id', booking.id)).map((p) => ({ id: p.id, firstName: p.first_name, bandKey: p.band_key }));
  return { id: booking.id, passengers };
}

const putTourExtras = (tourId: string, extras: unknown[]) => call('PUT', `/tours/${tourId}/extras`, { extras });
const putDepExtras = (depId: string, extras: unknown[]) => call('PUT', `/departures/${depId}/extras`, { extras });
const overview = async (depId: string) => (await json(await call('GET', `/departures/${depId}/extras`))).data;
/** The id of the extra with this title in the departure's effective catalogue. */
const idOf = async (depId: string, title: string): Promise<string> => (await overview(depId)).extras.find((e: any) => e.title === title).id;
const choose = (bookingId: string, choices: unknown[], extra: Record<string, unknown> = {}) => call('PUT', `/seat-bookings/${bookingId}/extras`, { choices, ...extra });

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', undefined, null)).status).toBe(200);
  const login = await call('POST', '/auth/login', { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID }, null);
  admin = (await json(login)).data.accessToken;
  expect((await call('PUT', '/automations/pause', { paused: true })).status).toBe(200);
  for (const [k, v] of Object.entries({ country: 'NL', company_country: 'NL', currency: 'EUR', locale: 'nl-NL', timezone: 'Europe/Amsterdam', phone_default_country: 'NL', tax_system: 'none' })) await setSetting(k, v);
  expect((await call('PUT', '/departures/settings', { enabled: true, confirmMode: 'manual', deposit: { type: 'none', value: null } })).status).toBe(200);
});

const row = (over: Partial<ExtraRowDto>): ExtraRowDto => ({
  id: `x${++seq}`, tourId: null, departureId: null, dayNumber: null, title: 'Extra', description: null, price: 10, currency: null, bandPrices: null,
  rateCardId: null, supplierId: null, capacity: null, cutoffHoursBefore: null, refundableUntilHours: null, isActive: true, sortOrder: 0, ...over,
});

describe('the pure rules', () => {
  it('merges tour-wide, tour and departure rows; the same title and day later in that order replaces, an inactive row hides', () => {
    const merged = mergeExtras([
      row({ id: 'w', title: 'Welcome drink', tourId: null, price: 5 }),
      row({ id: 't1', title: 'Boat trip', dayNumber: 2, tourId: 'T', price: 40 }),
      row({ id: 't2', title: 'Dinner', dayNumber: 3, tourId: 'T', price: 30 }),
      row({ id: 'd1', title: ' boat TRIP ', dayNumber: 2, tourId: 'T', departureId: 'D', price: 55 }),
      row({ id: 'd2', title: 'Dinner', dayNumber: 3, tourId: 'T', departureId: 'D', price: 30, isActive: false }),
      row({ id: 'd3', title: 'Boat trip', dayNumber: 4, tourId: 'T', departureId: 'D', price: 45 }),
    ]);
    expect(merged.map((e) => [e.id, e.source, e.price])).toEqual([
      ['w', 'tour_wide', 5],
      ['d1', 'departure', 55],
      ['d3', 'departure', 45],
    ]);
    expect(mergeExtras([row({ id: 'a', departureId: 'D', tourId: 'T', isActive: false })], { includeInactive: true })).toHaveLength(1);
  });

  it('prices by band first (a band price of 0 is a price), then the extra price, then the rate card', () => {
    const e = { price: 50, bandPrices: { child: 30, infant: 0 } };
    expect(unitPrice(e, 'adult', null)).toBe(50);
    expect(unitPrice(e, 'child', null)).toBe(30);
    expect(unitPrice(e, 'infant', null)).toBe(0);
    expect(unitPrice(e, null, null)).toBe(50);
    expect(unitPrice({ price: 0, bandPrices: null }, 'adult', 12.345)).toBe(12.35);
    expect(unitPrice({ price: 0, bandPrices: null }, 'adult', null)).toBe(0);
  });

  it('closes at the end of the departure cut-off day, or hours before the start when the extra has its own', () => {
    const dep = { start_date: '2033-06-20', start_time: '08:00', extras_cutoff_date: '2033-06-13' };
    const tz = 'Europe/Amsterdam';
    const day = extraCutoffIso({ cutoffHoursBefore: null }, dep, tz)!;
    expect(day).toBe('2033-06-13T22:00:00.000Z'); // midnight at the start of the 14th, CEST
    const hours = extraCutoffIso({ cutoffHoursBefore: 48 }, dep, tz)!;
    expect(hours).toBe('2033-06-18T06:00:00.000Z'); // 08:00 on the 20th is 06:00 UTC, 48 hours earlier
    const start = '2033-06-20T06:00:00.000Z';
    expect(isExtraOpen(day, start, new Date('2033-06-13T21:59:00Z'))).toBe(true);
    expect(isExtraOpen(day, start, new Date('2033-06-13T22:00:00Z'))).toBe(false);
    expect(isExtraOpen(null, start, new Date('2033-06-20T05:59:00Z'))).toBe(true);
    expect(isExtraOpen(null, start, new Date('2033-06-20T06:00:00Z'))).toBe(false);
    expect(refundWindowOpen({ refundableUntilHours: 24 }, dep, tz, new Date('2033-06-19T05:59:00Z'))).toBe(true);
    expect(refundWindowOpen({ refundableUntilHours: 24 }, dep, tz, new Date('2033-06-19T06:00:00Z'))).toBe(false);
    expect(refundWindowOpen({ refundableUntilHours: null }, dep, tz, new Date('2033-06-01T00:00:00Z'))).toBe(false);
  });

  it('writes the choices of a passenger as one line, marking what is not paid', () => {
    expect(choicesText([
      { title: 'Gondola', quantity: 2, dayNumber: 2, status: 'paid' },
      { title: 'Dinner', quantity: 1, dayNumber: null, status: 'selected' },
    ], '(unpaid)')).toBe('Gondola x2 (2); Dinner (unpaid)');
  });
});

describe('the catalogue of a tour and a departure', () => {
  it('merges the tour rows with the departure overrides and shows where each row comes from', async () => {
    const dep = await makeDeparture();
    expect((await putTourExtras(dep.tourId, [
      { title: 'Boat trip', dayNumber: 2, price: 40, capacity: 10 },
      { title: 'Dinner', dayNumber: 3, price: 30 },
    ])).status).toBe(200);
    await DB.prepare(`INSERT INTO tour_extras (id, tour_id, departure_id, title, price, is_active) VALUES (?, NULL, NULL, 'Welcome drink', 5, 1)`).bind(`wide-${seq}`).run();
    expect((await putDepExtras(dep.id, [
      { title: 'boat trip', dayNumber: 2, price: 55, capacity: 4 },
      { title: 'Dinner', dayNumber: 3, price: 30, isActive: false },
      { title: 'Spa', dayNumber: 4, price: 20 },
    ])).status).toBe(200);

    const data = await overview(dep.id);
    expect(data.extras.map((e: any) => [e.title, e.source, e.price])).toEqual([
      ['Welcome drink', 'tour_wide', 5],
      ['boat trip', 'departure', 55],
      ['Spa', 'departure', 20],
    ]);
    expect(data.own).toHaveLength(3);
    expect(data.extras.find((e: any) => e.title === 'boat trip')).toMatchObject({ capacity: 4, left: 4, sold: 0, open: true });
    // The tour's own list is untouched by the departure's overrides, and saving the tour list does not remove the departure's rows.
    expect((await json(await call('GET', `/tours/${dep.tourId}/extras`))).data.filter((e: any) => !e.departureId)).toHaveLength(2);
    expect((await putTourExtras(dep.tourId, [{ title: 'Boat trip', dayNumber: 2, price: 40, capacity: 10 }])).status).toBe(200);
    expect((await overview(dep.id)).own).toHaveLength(3);
    await DB.prepare("DELETE FROM tour_extras WHERE title = 'Welcome drink'").run();
  });

  it('prices from the rate card when the extra has no price, only while the card is active and valid', async () => {
    const dep = await makeDeparture();
    await DB.prepare(`INSERT INTO rate_cards (id, service_type, name, cost_price, selling_price, currency, is_active, valid_to) VALUES (?, 'activity', 'Museum pass', 10, 18, 'EUR', 1, NULL)`).bind(`rc-ok-${seq}`).run();
    await DB.prepare(`INSERT INTO rate_cards (id, service_type, name, cost_price, selling_price, currency, is_active, valid_to) VALUES (?, 'activity', 'Old pass', 10, 22, 'EUR', 1, '2020-01-01')`).bind(`rc-old-${seq}`).run();
    expect((await putTourExtras(dep.tourId, [
      { title: 'Museum', price: 0, rateCardId: `rc-ok-${seq}` },
      { title: 'Old museum', price: 0, rateCardId: `rc-old-${seq}` },
      { title: 'Own price wins', price: 9, rateCardId: `rc-ok-${seq}` },
    ])).status).toBe(200);
    const byTitle = Object.fromEntries((await overview(dep.id)).extras.map((e: any) => [e.title, e.listPrice]));
    expect(byTitle).toMatchObject({ Museum: 18, 'Old museum': 0, 'Own price wins': 9 });
  });
});

describe('what passengers choose', () => {
  it('prices each choice for the passenger\'s band, counts the capacity and refuses what no longer fits', async () => {
    const dep = await makeDeparture();
    expect((await putTourExtras(dep.tourId, [{ title: 'Gondola', dayNumber: 2, price: 50, bandPrices: { child: 30 }, capacity: 3 }])).status).toBe(200);
    const gondola = await idOf(dep.id, 'Gondola');
    const a = await makeParty(dep, 'Mia');
    const [mia, piet, lotte] = a.passengers;
    expect(lotte.bandKey).toBe('child');

    const res = await choose(a.id, [{ passengerId: mia.id, extraId: gondola, quantity: 1 }, { passengerId: lotte.id, extraId: gondola, quantity: 1 }], { invoice: false });
    expect(res.status).toBe(200);
    const stored = await rows('SELECT seat_passenger_id, quantity, unit_price, status, selected_via FROM passenger_extras WHERE departure_id = ? ORDER BY unit_price DESC', dep.id);
    expect(stored.map((r) => [r.quantity, r.unit_price, r.status, r.selected_via])).toEqual([[1, 50, 'selected', 'staff'], [1, 30, 'selected', 'staff']]);
    expect((await overview(dep.id)).extras.find((e: any) => e.id === gondola)).toMatchObject({ sold: 2, left: 1, revenue: 80 });

    // Two more do not fit (one place left); one does.
    const tooMany = await choose(a.id, [{ passengerId: mia.id, extraId: gondola, quantity: 1 }, { passengerId: piet.id, extraId: gondola, quantity: 2 }, { passengerId: lotte.id, extraId: gondola, quantity: 1 }], { invoice: false });
    expect(tooMany.status).toBe(409);
    expect((await json(tooMany)).error).toMatchObject({ code: 'EXTRA_FULL', details: { extra: 'Gondola', left: 1 } });
    expect((await choose(a.id, [{ passengerId: mia.id, extraId: gondola, quantity: 1 }, { passengerId: piet.id, extraId: gondola, quantity: 1 }, { passengerId: lotte.id, extraId: gondola, quantity: 1 }], { invoice: false })).status).toBe(200);
    expect((await overview(dep.id)).extras.find((e: any) => e.id === gondola)).toMatchObject({ sold: 3, left: 0 });

    // Another party finds it sold out; removing a choice gives the place back.
    const b = await makeParty(dep, 'Noor');
    const full = await choose(b.id, [{ passengerId: b.passengers[0].id, extraId: gondola, quantity: 1 }], { invoice: false });
    expect(full.status).toBe(409);
    expect((await choose(a.id, [{ passengerId: mia.id, extraId: gondola, quantity: 1 }, { passengerId: lotte.id, extraId: gondola, quantity: 1 }], { invoice: false })).status).toBe(200);
    expect((await choose(b.id, [{ passengerId: b.passengers[0].id, extraId: gondola, quantity: 1 }], { invoice: false })).status).toBe(200);
  });

  it('refuses an extra that is not sold on the departure and a passenger that is not on the booking', async () => {
    const dep = await makeDeparture();
    const other = await makeDeparture();
    expect((await putTourExtras(other.tourId, [{ title: 'Elsewhere', price: 5 }])).status).toBe(200);
    expect((await putTourExtras(dep.tourId, [{ title: 'Here', price: 5 }])).status).toBe(200);
    const here = await idOf(dep.id, 'Here');
    const elsewhere = await idOf(other.id, 'Elsewhere');
    const a = await makeParty(dep);
    const b = await makeParty(dep, 'Sam');
    expect((await choose(a.id, [{ passengerId: a.passengers[0].id, extraId: elsewhere, quantity: 1 }])).status).toBe(400);
    expect((await choose(a.id, [{ passengerId: b.passengers[0].id, extraId: here, quantity: 1 }])).status).toBe(400);
    expect((await rows('SELECT COUNT(*) AS n FROM passenger_extras WHERE departure_id = ?', dep.id))[0].n).toBe(0);
  });

  it('holds customers to the cut-off and lets staff change a choice after it', async () => {
    const dep = await makeDeparture();
    expect((await putTourExtras(dep.tourId, [{ title: 'Late tour', price: 20, cutoffHoursBefore: 72 }, { title: 'Open tour', price: 20 }])).status).toBe(200);
    const extras = (await overview(dep.id)).extras;
    const late = extras.find((e: any) => e.title === 'Late tour').id;
    const open = extras.find((e: any) => e.title === 'Open tour').id;
    const a = await makeParty(dep);
    const mia = a.passengers[0].id;
    const startRow = (await rows('SELECT start_date FROM departures WHERE id = ?', dep.id))[0];
    // Two days before the start (inside the 72 hours) but before the departure's own cut-off date would have passed anyway.
    const twoDaysBefore = new Date(`${startRow.start_date}T00:00:00Z`);
    twoDaysBefore.setUTCDate(twoDaysBefore.getUTCDate() - 2);

    await expect(setChoices(DB, a.id, [{ passengerId: mia, extraId: late, quantity: 1 }], { via: 'self_service', enforceCutoff: true, now: twoDaysBefore })).rejects.toMatchObject({ code: 'EXTRAS_CLOSED', status: 409 });
    // The departure's cut-off date (7 days before) has also passed for the extra without its own hours.
    await expect(setChoices(DB, a.id, [{ passengerId: mia, extraId: open, quantity: 1 }], { via: 'self_service', enforceCutoff: true, now: twoDaysBefore })).rejects.toMatchObject({ code: 'EXTRAS_CLOSED' });
    // Well before: fine. Staff are not held to it.
    const early = new Date('2033-01-01T00:00:00Z');
    expect((await setChoices(DB, a.id, [{ passengerId: mia, extraId: late, quantity: 1 }], { via: 'self_service', enforceCutoff: true, now: early })).changed).toBe(1);
    // After the cut-off a customer cannot change or drop it...
    await expect(setChoices(DB, a.id, [], { via: 'self_service', enforceCutoff: true, now: twoDaysBefore })).rejects.toMatchObject({ code: 'EXTRAS_CLOSED' });
    // ...but the same unchanged list is accepted, and staff can.
    expect((await setChoices(DB, a.id, [{ passengerId: mia, extraId: late, quantity: 1 }], { via: 'self_service', enforceCutoff: true, now: twoDaysBefore })).changed).toBe(0);
    expect((await choose(a.id, [], { invoice: false })).status).toBe(200);
    expect((await rows(`SELECT status FROM passenger_extras WHERE departure_id = ?`, dep.id))[0].status).toBe('cancelled');
  });
});

describe('the extras invoice', () => {
  const setup = async () => {
    const dep = await makeDeparture();
    expect((await putTourExtras(dep.tourId, [
      { title: 'Gondola', dayNumber: 2, price: 50, bandPrices: { child: 30 }, refundableUntilHours: 48 },
      { title: 'Dinner', price: 25 },
    ])).status).toBe(200);
    const extras = (await overview(dep.id)).extras;
    const gondola = extras.find((e: any) => e.title === 'Gondola').id;
    const dinner = extras.find((e: any) => e.title === 'Dinner').id;
    const party = await makeParty(dep);
    return { dep, gondola, dinner, party };
  };

  it('has one line per passenger per extra, totals the choices, and is refreshed while nothing is paid', async () => {
    const { dep, gondola, dinner, party } = await setup();
    const [mia, piet, lotte] = party.passengers;
    const first = await choose(party.id, [
      { passengerId: mia.id, extraId: gondola, quantity: 1 },
      { passengerId: piet.id, extraId: gondola, quantity: 1 },
      { passengerId: piet.id, extraId: dinner, quantity: 2 },
      { passengerId: lotte.id, extraId: gondola, quantity: 1 },
    ]);
    expect(first.status).toBe(200);
    const made = (await json(first)).data.invoice;
    expect(made).toMatchObject({ created: true, total: 180, currency: 'EUR' });

    const items = await rows('SELECT description, quantity, rate, amount FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order', made.invoiceId);
    expect(items).toHaveLength(4);
    expect(items.map((i) => [i.quantity, i.rate])).toEqual(expect.arrayContaining([[1, 50], [1, 30], [2, 25]]));
    expect(items.some((i) => i.description.includes('Gondola') && i.description.includes('Lotte'))).toBe(true);
    const stored = await rows('SELECT status, invoice_id, invoice_item_id FROM passenger_extras WHERE departure_id = ?', dep.id);
    expect(stored.every((r) => r.status === 'invoiced' && r.invoice_id === made.invoiceId && r.invoice_item_id)).toBe(true);
    expect((await rows('SELECT total, status, contact_id, lead_id FROM invoices WHERE id = ?', made.invoiceId))[0]).toMatchObject({ total: 180, status: 'draft' });
    // The booking's own invoice is a different one and is not touched.
    expect((await rows('SELECT invoice_id FROM seat_bookings WHERE id = ?', party.id))[0].invoice_id).toBeNull();

    // One more dinner: the same invoice, new total.
    const again = (await json(await choose(party.id, [
      { passengerId: mia.id, extraId: gondola, quantity: 1 },
      { passengerId: piet.id, extraId: gondola, quantity: 1 },
      { passengerId: piet.id, extraId: dinner, quantity: 2 },
      { passengerId: lotte.id, extraId: gondola, quantity: 1 },
      { passengerId: mia.id, extraId: dinner, quantity: 1 },
    ]))).data.invoice;
    expect(again).toMatchObject({ created: false, invoiceId: made.invoiceId, total: 205 });
    expect((await rows('SELECT COUNT(*) AS n FROM invoices WHERE id IN (SELECT invoice_id FROM passenger_extras WHERE departure_id = ?)', dep.id))[0].n).toBe(1);

    // Removing every choice cancels the open invoice.
    const none = await choose(party.id, []);
    expect((await json(none)).data.invoice).toBeNull();
    expect((await rows('SELECT status FROM invoices WHERE id = ?', made.invoiceId))[0].status).toBe('cancelled');
  });

  it('marks the choices paid when the invoice is paid, and makes a further invoice for choices made afterwards', async () => {
    const { dep, gondola, dinner, party } = await setup();
    const [mia, piet] = party.passengers;
    const first = (await json(await choose(party.id, [{ passengerId: mia.id, extraId: gondola, quantity: 1 }, { passengerId: piet.id, extraId: dinner, quantity: 1 }]))).data.invoice;
    expect(first.total).toBe(75);

    // A part payment leaves the choices invoiced.
    expect((await call('POST', '/payments', { invoiceId: first.invoiceId, amount: 25, method: 'transfer' })).status).toBe(201);
    expect((await rows('SELECT status FROM passenger_extras WHERE invoice_id = ?', first.invoiceId)).every((r) => r.status === 'invoiced')).toBe(true);
    // A new choice no longer goes on an invoice with money on it.
    const second = (await json(await choose(party.id, [{ passengerId: mia.id, extraId: gondola, quantity: 1 }, { passengerId: piet.id, extraId: dinner, quantity: 1 }, { passengerId: piet.id, extraId: gondola, quantity: 1 }]))).data.invoice;
    expect(second).toMatchObject({ created: true, total: 50 });
    expect(second.invoiceId).not.toBe(first.invoiceId);
    expect((await rows('SELECT total FROM invoices WHERE id = ?', first.invoiceId))[0].total).toBe(75);

    // Paying the rest settles the first invoice's choices; the second stays invoiced.
    expect((await call('POST', '/payments', { invoiceId: first.invoiceId, amount: 50, method: 'transfer' })).status).toBe(201);
    const byInvoice = await rows('SELECT invoice_id, status FROM passenger_extras WHERE departure_id = ?', dep.id);
    expect(byInvoice.filter((r) => r.invoice_id === first.invoiceId).every((r) => r.status === 'paid')).toBe(true);
    expect(byInvoice.filter((r) => r.invoice_id === second.invoiceId).every((r) => r.status === 'invoiced')).toBe(true);
    expect((await overview(dep.id)).extras.find((e: any) => e.id === gondola)).toMatchObject({ sold: 2, revenue: 100, paid: 50 });
  });

  it('suggests a refund for a paid choice that is removed inside the refund window, and not outside it', async () => {
    const { gondola, dinner, party } = await setup();
    const [mia, piet] = party.passengers;
    const made = (await json(await choose(party.id, [{ passengerId: mia.id, extraId: gondola, quantity: 1 }, { passengerId: piet.id, extraId: dinner, quantity: 1 }]))).data.invoice;
    expect((await call('POST', '/payments', { invoiceId: made.invoiceId, amount: made.total, method: 'transfer' })).status).toBe(201);

    // Gondola is refundable until 48 hours before the start, Dinner has no refund window.
    const res = await choose(party.id, []);
    expect(res.status).toBe(200);
    const refunds = (await json(res)).data.refunds;
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ title: 'Gondola', quantity: 1, amount: 50, invoiceId: made.invoiceId });
    expect((await rows(`SELECT status FROM passenger_extras WHERE tour_extra_id = ?`, dinner))[0].status).toBe('cancelled');
  });

  it('shows the choices on the full manifest, with unpaid ones marked', async () => {
    const { dep, gondola, dinner, party } = await setup();
    const [mia, piet] = party.passengers;
    expect((await call('POST', `/seat-bookings/${party.id}/confirm`)).status).toBe(200);
    const made = (await json(await choose(party.id, [{ passengerId: mia.id, extraId: gondola, quantity: 2 }, { passengerId: piet.id, extraId: dinner, quantity: 1 }]))).data.invoice;
    await call('POST', '/payments', { invoiceId: made.invoiceId, amount: made.total, method: 'transfer' });
    await choose(party.id, [{ passengerId: mia.id, extraId: gondola, quantity: 2 }, { passengerId: piet.id, extraId: dinner, quantity: 1 }, { passengerId: piet.id, extraId: gondola, quantity: 1 }], { invoice: false });

    const manifest = (await json(await call('GET', `/departures/${dep.id}/manifest?view=full`))).data;
    expect(manifest.columns.map((c: any) => c.key)).toContain('extras');
    const cells = Object.fromEntries(manifest.groups[0].rows.map((r: any) => [r.name, r.extras]));
    expect(cells['Mia Visser']).toBe('Gondola x2 (2)');
    expect(cells['Piet Visser']).toBe('Dinner; Gondola (2) (unpaid)');
    expect(cells['Lotte Visser']).toBe('');
    // A departure nobody chose extras on has no extras column.
    const empty = await makeDeparture();
    expect((await json(await call('GET', `/departures/${empty.id}/manifest?view=full`))).data.columns.map((c: any) => c.key)).not.toContain('extras');
  });
});
