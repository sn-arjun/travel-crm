import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';
import { reportRegistry } from '../src/services/report-registry';

// R146: the tour reports (departure_seats, tour_sales, extras_sales): seats and load per departure, revenue and collected from
// the linked invoices, tour totals, the date and tour filters, role and feature gating.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';

let admin = '';
let sales = '';
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

async function login(email: string): Promise<string> {
  const res = await call('POST', '/auth/login', null, { email, password: 'password123', tenantId: TENANT_ID });
  return (await json(res)).data.accessToken;
}

async function setFlag(feature: string, enabled: boolean | null) {
  await DB.prepare('DELETE FROM tenant_feature_flags WHERE tenant_id = ? AND feature_key = ?').bind(TENANT_ID, feature).run();
  if (enabled !== null) {
    await DB.prepare('INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES (?, ?, ?, ?)').bind(`r146t-${feature}`, TENANT_ID, feature, enabled ? 1 : 0).run();
  }
}

async function makeTour(code: string, title: string): Promise<string> {
  const res = await call('POST', '/tours', admin, { code, title, destination: 'Alps', durationDays: 3, defaultCapacity: 49 });
  expect(res.status).toBe(201);
  return (await json(res)).data.id;
}

async function makeDeparture(tourId: string, startDate: string, capacity: number, status = 'open'): Promise<string> {
  const res = await call('POST', '/departures', admin, { tourId, startDate, capacityMode: 'manual', capacity });
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  const id = (await json(res)).data.id as string;
  if (status !== 'draft') expect((await call('POST', `/departures/${id}/status`, admin, { status: 'open' })).status).toBe(200);
  if (status === 'cancelled') expect((await call('POST', `/departures/${id}/status`, admin, { status: 'cancelled', reason: 'test' })).status).toBe(200);
  return id;
}

/** A party of `seats` seats; confirmed when asked; with an invoice of `total` of which `paid` is collected. */
async function party(depId: string, name: string, seats: number, opts: { confirm?: boolean; total?: number; paid?: number } = {}): Promise<string> {
  seq += 1;
  const res = await call('POST', `/departures/${depId}/bookings`, admin, {
    contact: { name, email: `${name.toLowerCase().replace(/\W+/g, '.')}.${seq}@tourreport.test` },
    seats,
  });
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  const booking = (await json(res)).data as { id: string; contactId: string; status: string };
  if (opts.confirm) expect((await call('POST', `/seat-bookings/${booking.id}/confirm`, admin, {})).status).toBe(200);
  if (opts.total !== undefined) {
    const invoiceId = `r146-inv-${seq}`;
    await DB.prepare(
      `INSERT INTO invoices (id, contact_id, invoice_number, type, total, status, due_date, balance_due, paid_amount, created_by)
       VALUES (?, ?, ?, 'tax_invoice', ?, 'sent', '2032-12-31', ?, ?, ?)`,
    ).bind(invoiceId, booking.contactId, `R146-${seq}`, opts.total, opts.total - (opts.paid ?? 0), opts.paid ?? 0, ADMIN_ID).run();
    await DB.prepare('UPDATE seat_bookings SET invoice_id = ? WHERE id = ?').bind(invoiceId, booking.id).run();
  }
  return booking.id;
}

const report = async (id: string, query = '', token = admin) => call('GET', `/reports/${id}?per_page=100${query}`, token);
const rowsOf = async (id: string, query = ''): Promise<any[]> => (await json(await report(id, query))).data.data;

let tourA = '';
let tourB = '';
let depA1 = '';
let depA2 = '';
let depB1 = '';

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  admin = await login('admin@e2e.test');
  sales = await login('sales@e2e.test');
  expect((await call('PUT', '/automations/pause', admin, { paused: true })).status).toBe(200);

  tourA = await makeTour('RPA', 'Report tour A');
  tourB = await makeTour('RPB', 'Report tour B');
  depA1 = await makeDeparture(tourA, '2033-03-10', 20);
  depA2 = await makeDeparture(tourA, '2033-05-10', 10);
  depB1 = await makeDeparture(tourB, '2033-04-10', 8);
  await makeDeparture(tourB, '2033-04-20', 8, 'cancelled');

  await party(depA1, 'Alpha Confirmed', 6, { confirm: true, total: 3000, paid: 1200 });
  await party(depA1, 'Alpha Held', 4, { total: 2000, paid: 0 });
  await party(depA2, 'Beta Confirmed', 5, { confirm: true, total: 1500, paid: 1500 });
  await party(depB1, 'Gamma Confirmed', 8, { confirm: true });
  await party(depB1, 'Gamma Waitlisted', 3); // full: waitlisted
});

afterAll(async () => {
  await setFlag('group_departures', null);
});

describe('departure_seats', () => {
  it('lists seats, load, left and revenue per departure from the linked invoices', async () => {
    const rows = await rowsOf('departure_seats', '&date_from=2033-01-01&date_to=2033-12-31');
    const a1 = rows.find((r) => r.departure_id === depA1);
    expect(a1).toMatchObject({ tour: 'Report tour A', capacity: 20, held: 4, confirmed: 6, waitlisted: 0, seats_left: 10, load_pct: 50, revenue_invoiced: 5000, revenue_collected: 1200 });
    expect(rows.find((r) => r.departure_id === depA2)).toMatchObject({ capacity: 10, confirmed: 5, seats_left: 5, load_pct: 50, revenue_invoiced: 1500, revenue_collected: 1500 });
    expect(rows.find((r) => r.departure_id === depB1)).toMatchObject({ capacity: 8, confirmed: 8, waitlisted: 3, seats_left: 0, load_pct: 100, revenue_invoiced: 0, revenue_collected: 0 });
    // Sorted by start date by default.
    const dates = rows.map((r) => r.start_date);
    expect(dates).toEqual([...dates].sort());
  });

  it('filters by date range, tour and status', async () => {
    const march = await rowsOf('departure_seats', '&date_from=2033-03-01&date_to=2033-03-31');
    expect(march.map((r) => r.departure_id)).toEqual([depA1]);
    const byTour = await rowsOf('departure_seats', `&date_from=2033-01-01&date_to=2033-12-31&filters=${encodeURIComponent(JSON.stringify({ tour_id: tourB }))}`);
    expect(byTour.every((r) => r.tour_id === tourB)).toBe(true);
    expect(byTour.length).toBe(2);
    const cancelled = await rowsOf('departure_seats', `&date_from=2033-01-01&date_to=2033-12-31&filters=${encodeURIComponent(JSON.stringify({ status: 'cancelled' }))}`);
    expect(cancelled.map((r) => r.status)).toEqual(['cancelled']);
  });

  it('exports to Excel and PDF like any report', async () => {
    const xlsx = await call('GET', '/reports/departure_seats/export?format=excel&date_from=2033-01-01&date_to=2033-12-31', admin);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get('Content-Type')).toContain('spreadsheetml');
    const pdf = await call('GET', '/reports/departure_seats/export?format=pdf&date_from=2033-01-01&date_to=2033-12-31', admin);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('Content-Type')).toBe('application/pdf');
  });
});

describe('tour_sales', () => {
  it('totals departures run, seats sold, average load and revenue per tour; cancelled departures do not count', async () => {
    const rows = await rowsOf('tour_sales', '&date_from=2033-01-01&date_to=2033-12-31');
    const a = rows.find((r) => r.tour_id === tourA);
    // Sold means confirmed: the held party of tour A is not sold yet. Loads: 6/20 = 30% and 5/10 = 50%.
    expect(a).toMatchObject({ tour_code: 'RPA', departures_run: 2, seats_sold: 11, avg_load_pct: 40, revenue_invoiced: 6500, revenue_collected: 2700 });
    const b = rows.find((r) => r.tour_id === tourB);
    expect(b).toMatchObject({ tour_code: 'RPB', departures_run: 1, seats_sold: 8, avg_load_pct: 100, revenue_invoiced: 0 });
    expect(rows[0].tour_id).toBe(tourA); // biggest revenue first
  });

  it('honours the date range', async () => {
    const rows = await rowsOf('tour_sales', '&date_from=2033-03-01&date_to=2033-03-31');
    expect(rows.map((r) => r.tour_id)).toEqual([tourA]);
    expect(rows[0]).toMatchObject({ departures_run: 1, seats_sold: 6, avg_load_pct: 30, revenue_invoiced: 5000 });
  });
});

describe('extras_sales', () => {
  it('is empty until passengers choose extras, then totals quantity and revenue per extra', async () => {
    expect(await rowsOf('extras_sales')).toEqual([]);

    const passenger = (await json(await call('POST', `/departures/${depA1}/bookings`, admin, {
      contact: { name: 'Extras Buyer', email: 'extras.buyer@tourreport.test' },
      passengers: [{ firstName: 'Ina', lastName: 'One' }, { firstName: 'Jos', lastName: 'Two' }],
    }))).data.passengers as Array<{ id: string }>;
    const extraId = 'r146-extra-1';
    await DB.prepare(`INSERT INTO tour_extras (id, tour_id, title, price, is_active) VALUES (?, ?, 'Gondola ride', 25, 1)`).bind(extraId, tourA).run();
    for (const [i, p] of passenger.entries()) {
      await DB.prepare(`INSERT INTO passenger_extras (id, seat_passenger_id, tour_extra_id, departure_id, quantity, unit_price, status) VALUES (?, ?, ?, ?, ?, 25, ?)`)
        .bind(`r146-pe-${i}`, p.id, extraId, depA1, i + 1, i === 1 ? 'cancelled' : 'selected').run();
    }
    const rows = await rowsOf('extras_sales', '&date_from=2000-01-01&date_to=2099-12-31'); // other params: the first answer may be cached
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ extra: 'Gondola ride', tour: 'Report tour A', quantity: 1, passengers: 1, revenue: 25 });
  });
});

describe('who sees the tour reports', () => {
  it('lists them for admin, with category tours, and refuses a salesperson', async () => {
    const list = (await json(await call('GET', '/reports', admin))).data as Array<{ id: string; category: string }>;
    for (const id of ['departure_seats', 'tour_sales', 'extras_sales']) {
      expect(list.find((r) => r.id === id)?.category, id).toBe('tours');
    }
    expect((await report('departure_seats', '', sales)).status).toBe(403);
    // The accountant role is allowed by the report definition.
    expect(reportRegistry.get('departure_seats')!.requiredRole).toEqual(['admin', 'sales_manager', 'operations', 'accountant']);
  });

  it('hides and refuses them when group_departures is off, and leaves the other reports alone', async () => {
    await setFlag('group_departures', false);
    try {
      const list = (await json(await call('GET', '/reports', admin))).data as Array<{ id: string; category: string }>;
      expect(list.some((r) => r.category === 'tours')).toBe(false);
      expect(list.length).toBeGreaterThan(10);
      expect((await report('departure_seats')).status).toBe(403);
      expect((await call('GET', '/reports/tour_sales/export?format=excel', admin)).status).toBe(403);
      expect((await report('pipeline_summary')).status).not.toBe(403);
    } finally {
      await setFlag('group_departures', null);
    }
    expect((await report('departure_seats')).status).toBe(200);
  });
});
