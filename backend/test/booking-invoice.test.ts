import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { buildBookingLines, bookingDeposit } from '../src/services/departures/booking-invoice';
import type { PriceRow } from '../src/services/departures/tours';

// R148: the invoice of a seat booking: lines per band, room supplement and seat surcharge, in the departure's currency.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

let admin = '';
let sales = '';
let seq = 0;

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
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

const price = (kind: PriceRow['kind'], key: string, amount: number, sortOrder = 0, label: string | null = null): PriceRow =>
  ({ id: `${kind}-${key}`, departureId: null, kind, key, label, amount, currency: null, sortOrder });

const texts = { band: (l: string) => `Band ${l}`, room: (l: string) => `Room ${l}`, seat: () => 'Seat' };

describe('buildBookingLines (pure)', () => {
  const prices = [price('age_band', 'adult', 1000, 0, 'Adult'), price('age_band', 'child', 600, 1), price('age_band', 'infant', 0, 2), price('room_supplement', 'single', 250), price('room_supplement', 'twin', 0), price('seat_surcharge', 'premium', 40)];
  const roomLabels = { single: 'Single room', twin: 'Twin' };

  it('charges each band its price, a single supplement per passenger and the seat surcharge per chosen seat', () => {
    const lines = buildBookingLines({
      passengers: [
        { bandKey: 'adult', roomType: 'single', seatNumber: '3A' },
        { bandKey: 'adult', roomType: 'twin', seatNumber: null },
        { bandKey: 'child', roomType: null, seatNumber: '3B' },
        { bandKey: 'infant', roomType: null, seatNumber: null },
      ],
      prices, roomLabels, preferredSeat: true, texts,
    });
    expect(lines.map((l) => [l.kind, l.key, l.quantity, l.rate])).toEqual([
      ['band', 'adult', 2, 1000],
      ['band', 'child', 1, 600],
      ['room', 'single', 1, 250],
      ['seat', 'premium', 2, 40],
    ]);
    expect(lines[0].description).toBe('Band Adult'); // the price's own label
    expect(lines[1].description).toBe('Band child'); // no label: the key
    expect(lines[2].description).toBe('Room Single room');
    const total = lines.reduce((sum, l) => sum + l.quantity * l.rate, 0);
    expect(total).toBe(2000 + 600 + 250 + 80);
  });

  it('charges no seat surcharge when preferred seats are off, and a passenger without a band pays the adult fare', () => {
    const lines = buildBookingLines({
      passengers: [{ bandKey: null, roomType: null, seatNumber: '9C' }, { bandKey: 'senior', roomType: null, seatNumber: null }],
      prices, roomLabels, preferredSeat: false, texts,
    });
    // 'senior' has no price on this tour: it is not charged as an adult by accident.
    expect(lines.map((l) => [l.kind, l.key, l.quantity])).toEqual([['band', 'adult', 1]]);
  });

  it('a tour without prices has no lines', () => {
    expect(buildBookingLines({ passengers: [{ bandKey: 'adult', roomType: null, seatNumber: null }], prices: [], roomLabels, preferredSeat: true, texts })).toEqual([]);
  });
});

describe('bookingDeposit', () => {
  it('follows the deposit type and never exceeds the total', () => {
    expect(bookingDeposit({ type: 'percent', value: 30 }, 4, 3490)).toBe(1047);
    expect(bookingDeposit({ type: 'per_seat', value: 100 }, 4, 3490)).toBe(400);
    expect(bookingDeposit({ type: 'fixed', value: 500 }, 4, 3490)).toBe(500);
    expect(bookingDeposit({ type: 'fixed', value: 5000 }, 4, 3490)).toBe(3490);
    expect(bookingDeposit({ type: 'none', value: 30 }, 4, 3490)).toBe(0);
    expect(bookingDeposit({ type: 'percent', value: null }, 4, 3490)).toBe(0);
    expect(bookingDeposit({ type: 'percent', value: 33.333 }, 1, 100)).toBe(33.33);
  });
});

async function makeBooking(o: { capacity?: number; passengers?: Array<Record<string, unknown>>; prices?: boolean } = {}) {
  seq += 1;
  const tour = (await json(await call('POST', '/tours', admin, { code: `BI${seq}`, title: `Invoice tour ${seq}`, durationDays: 4, currency: 'EUR' }))).data;
  if (o.prices !== false) {
    await call('PUT', `/tours/${tour.id}/prices`, admin, {
      prices: [
        { kind: 'age_band', key: 'adult', label: 'Adult', amount: 1000 },
        { kind: 'age_band', key: 'child', label: 'Child', amount: 600 },
        { kind: 'room_supplement', key: 'single', amount: 250 },
        { kind: 'seat_surcharge', key: 'premium', amount: 40 },
      ],
    });
  }
  const dep = (await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: `2034-0${(seq % 9) + 1}-12`, capacityMode: 'manual', capacity: o.capacity ?? 20 }))).data;
  await call('POST', `/departures/${dep.id}/status`, admin, { status: 'open' });
  const res = await call('POST', `/departures/${dep.id}/bookings`, admin, {
    contact: { name: `Payer ${seq}`, email: `payer${seq}@booking-invoice.test` },
    passengers: o.passengers ?? [
      { firstName: 'Eva', roomType: 'single', ageYears: 40, seatNumber: '1A' },
      { firstName: 'Jan', ageYears: 41 },
      { firstName: 'Sanne', ageYears: 8 },
    ],
  });
  expect(res.status).toBe(201);
  return { depId: dep.id as string, booking: (await json(res)).data };
}

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  admin = (await json(await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID }))).data.accessToken;
  sales = (await json(await call('POST', '/auth/login', null, { email: 'sales@e2e.test', password: 'password123', tenantId: TENANT_ID }))).data.accessToken;
  expect((await call('PUT', '/automations/pause', admin, { paused: true })).status).toBe(200);
  for (const [k, v] of Object.entries({ country: 'NL', currency: 'EUR', locale: 'nl-NL', timezone: 'Europe/Amsterdam', tax_system: 'none' })) await setSetting(k, v);
  expect((await call('PUT', '/departures/settings', admin, { enabled: true, preferredSeat: { enabled: true } })).status).toBe(200);
});

describe('POST /seat-bookings/:id/invoice', () => {
  it('makes the invoice in the departure currency: bands, the single supplement and the seat surcharge', async () => {
    const { booking } = await makeBooking();
    const res = await call('POST', `/seat-bookings/${booking.id}/invoice`, admin);
    expect(res.status).toBe(200);
    const data = (await json(res)).data;
    // 2 adults 2000 + 1 child 600 + 1 single supplement 250 + 1 chosen seat 40.
    expect(data).toMatchObject({ created: true, currency: 'EUR', total: 2890 });

    const invoice = (await rows('SELECT * FROM invoices WHERE id = ?', data.invoiceId))[0];
    expect(invoice).toMatchObject({ currency: 'EUR', total: 2890, balance_due: 2890, status: 'draft', lead_id: booking.leadId, contact_id: booking.contactId, created_by: expect.any(String) });
    const items = await rows('SELECT description, quantity, rate, amount FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order', data.invoiceId);
    expect(items.map((i) => [i.quantity, i.rate, i.amount])).toEqual([[2, 1000, 2000], [1, 600, 600], [1, 250, 250], [1, 40, 40]]);
    expect(items[0].description).toContain('Adult');
    expect(items[2].description).toContain('Room supplement');

    expect((await rows('SELECT invoice_id FROM seat_bookings WHERE id = ?', booking.id))[0].invoice_id).toBe(data.invoiceId);
    expect((await rows(`SELECT seat_surcharge FROM seat_passengers WHERE seat_booking_id = ? AND seat_number = '1A'`, booking.id))[0].seat_surcharge).toBe(40);
    expect((await rows('SELECT COUNT(*) AS n FROM domain_events WHERE type = ? AND entity_id = ?', 'invoice.created', data.invoiceId))[0].n).toBe(1);
  });

  it('refreshes the draft from the current passengers instead of making a second invoice', async () => {
    const { booking } = await makeBooking();
    const first = (await json(await call('POST', `/seat-bookings/${booking.id}/invoice`, admin))).data;
    const detail = (await json(await call('GET', `/seat-bookings/${booking.id}`, admin))).data;
    const kept = detail.passengers.map((p: any) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, ageYears: p.ageYears, roomType: p.roomType, seatNumber: p.seatNumber }));
    expect((await call('PUT', `/seat-bookings/${booking.id}/passengers`, admin, { passengers: [...kept, { firstName: 'Tim', ageYears: 5 }] })).status).toBe(200);

    const again = await call('POST', `/seat-bookings/${booking.id}/invoice`, admin);
    expect(again.status).toBe(200);
    const second = (await json(again)).data;
    expect(second).toMatchObject({ created: false, invoiceId: first.invoiceId, invoiceNumber: first.invoiceNumber, total: 3490 });
    expect((await rows('SELECT COUNT(*) AS n FROM invoices WHERE lead_id = ?', booking.leadId))[0].n).toBe(1);
    const items = await rows('SELECT quantity, rate FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order', first.invoiceId);
    expect(items.map((i) => [i.quantity, i.rate])).toEqual([[2, 1000], [2, 600], [1, 250], [1, 40]]);
    expect((await rows('SELECT total, balance_due FROM invoices WHERE id = ?', first.invoiceId))[0]).toEqual({ total: 3490, balance_due: 3490 });
  });

  it('leaves an invoice that was sent or paid alone', async () => {
    const { booking } = await makeBooking();
    const made = (await json(await call('POST', `/seat-bookings/${booking.id}/invoice`, admin))).data;
    await DB.prepare(`UPDATE invoices SET status = 'sent' WHERE id = ?`).bind(made.invoiceId).run();
    const res = await call('POST', `/seat-bookings/${booking.id}/invoice`, admin);
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('INVOICE_LOCKED');
    expect((await rows('SELECT total FROM invoices WHERE id = ?', made.invoiceId))[0].total).toBe(2890);
  });

  it('refuses a waitlisted or cancelled booking, a tour without prices, and roles that may not invoice', async () => {
    const full = await makeBooking({ capacity: 3 });
    const waiting = await call('POST', `/departures/${full.depId}/bookings`, admin, { contact: { name: 'Late', email: 'late@booking-invoice.test' }, passengers: [{ firstName: 'Late', ageYears: 30 }] });
    const waitlisted = (await json(waiting)).data;
    expect(waitlisted.status).toBe('waitlisted');
    let res = await call('POST', `/seat-bookings/${waitlisted.id}/invoice`, admin);
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('BOOKING_NOT_INVOICEABLE');

    const unpriced = await makeBooking({ prices: false });
    res = await call('POST', `/seat-bookings/${unpriced.booking.id}/invoice`, admin);
    expect(res.status).toBe(409);
    expect((await json(res)).error.code).toBe('NOTHING_TO_INVOICE');

    expect((await call('POST', `/seat-bookings/${full.booking.id}/invoice`, sales)).status).toBe(403);
    expect((await call('POST', '/seat-bookings/nope/invoice', admin)).status).toBe(404);
    expect((await rows('SELECT invoice_id FROM seat_bookings WHERE id = ?', full.booking.id))[0].invoice_id).toBeNull();
  });
});
