import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';

// R153: the leads pipeline board: counts and values per column, filters, mixed currencies, the board setting, visibility.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const SALES_ID = '33333333-3333-3333-3333-333333333333';

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
const data = async (res: Response): Promise<any> => ((await res.json()) as any).data;

let admin = '';
let sales = '';
let contactId = '';
let seq = 0;

async function seed(over: Record<string, unknown> = {}) {
  const row = {
    title: `Board lead ${++seq}`, status: 'new', priority: 'warm', assigned_to: null as string | null, currency: null as string | null,
    budget: null as number | null, estimated_value: null as number | null, destination: '["Kerala"]', source: 'manual', travel_date: '2032-07-10',
    ...over,
  };
  const id = `r153-lead-${String(seq).padStart(3, '0')}`;
  await DB.prepare(
    `INSERT INTO leads (id, contact_id, title, destination, travel_date, budget, currency, source, status, priority, assigned_to, estimated_value, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).bind(id, contactId, row.title, row.destination, row.travel_date, row.budget, row.currency, row.source, row.status, row.priority, row.assigned_to, row.estimated_value,
    `2032-01-01T00:${String(seq % 60).padStart(2, '0')}:00Z`, `2032-01-01T00:00:00Z`).run();
  return id;
}

const board = async (token: string, query = '') => data(await call('GET', `/leads/board${query}`, token));
const col = (b: any, status: string) => b.columns.find((c: any) => c.status === status);

describe('GET /leads/board', () => {
  beforeAll(async () => {
    await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = async (email: string) => (await data(await call('POST', '/auth/login', null, { email, password: 'password123', tenantId: TENANT_ID }))).accessToken;
    admin = await login('admin@e2e.test');
    sales = await login('sales@e2e.test');
    const c = await call('POST', '/contacts', admin, { name: 'Board Contact', type: 'customer', email: 'board.contact@r153.test' });
    expect(c.status).toBe(201);
    contactId = (await data(c)).id;
    await DB.prepare('DELETE FROM leads').run();
    await DB.prepare("DELETE FROM settings WHERE key = 'leads.board'").run();
  });

  afterAll(async () => {
    await DB.prepare('DELETE FROM leads').run();
    await DB.prepare("DELETE FROM settings WHERE key = 'leads.board'").run();
  });

  it('answers with the default columns in pipeline order and on_hold hidden', async () => {
    const b = await board(admin);
    expect(b.columns.map((c: any) => c.status)).toEqual(['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost']);
    expect(b.columns.every((c: any) => c.count === 0 && c.value === 0 && c.leads.length === 0)).toBe(true);
    expect(b.showValue).toBe(true);
    expect(typeof b.currency).toBe('string');
  });

  it('counts and sums each column, preferring the estimated value over the budget', async () => {
    const cur = (await board(admin)).currency as string;
    await seed({ status: 'new', budget: 1000, currency: cur });
    await seed({ status: 'new', budget: 500, estimated_value: 700, currency: cur });
    await seed({ status: 'new', budget: 200 }); // legacy row without a currency counts in the agency currency
    await seed({ status: 'contacted', budget: 50, currency: cur });
    await seed({ status: 'on_hold', budget: 9, currency: cur });
    const b = await board(admin);
    expect(col(b, 'new')).toMatchObject({ count: 3, value: 1900, mixedCurrencies: false, otherCurrencyCount: 0 });
    expect(col(b, 'new').leads).toHaveLength(3);
    expect(col(b, 'contacted')).toMatchObject({ count: 1, value: 50 });
    expect(col(b, 'on_hold')).toBeUndefined();
    const lead = col(b, 'contacted').leads[0];
    expect(lead).toMatchObject({ status: 'contacted', contactName: 'Board Contact', destinations: ['Kerala'] });
  });

  it('counts leads in another currency without summing them, and flags the column', async () => {
    const b0 = await board(admin);
    const cur = b0.currency as string;
    const other = cur === 'EUR' ? 'USD' : 'EUR';
    await seed({ status: 'qualified', budget: 300, currency: cur });
    await seed({ status: 'qualified', budget: 8000, currency: other });
    const q = col(await board(admin), 'qualified');
    expect(q).toMatchObject({ count: 2, value: 300, mixedCurrencies: true, otherCurrencyCount: 1 });
  });

  it('filters by priority, owner, unassigned, source, destination, travel dates and text', async () => {
    await DB.prepare('DELETE FROM leads').run();
    await seed({ status: 'new', priority: 'hot', assigned_to: SALES_ID, title: 'Alpine Escape', destination: '["Switzerland"]', source: 'website', travel_date: '2032-03-01' });
    await seed({ status: 'new', priority: 'cold', title: 'Beach Break', destination: '["Goa"]', source: 'referral', travel_date: '2032-09-01' });
    await seed({ status: 'won', priority: 'hot', title: 'Hot Won', destination: '["Goa"]' });
    const newCount = async (query: string) => col(await board(admin, query), 'new').count as number;

    expect(await newCount('')).toBe(2);
    expect(await newCount('?priority=hot')).toBe(1);
    expect(await newCount('?priority=hot,cold')).toBe(2);
    expect(await newCount(`?assignedTo=${SALES_ID}`)).toBe(1);
    expect(await newCount('?unassigned=1')).toBe(1);
    expect(await newCount('?source=website')).toBe(1);
    expect(await newCount('?destination=Goa')).toBe(1);
    expect(await newCount('?travelDateFrom=2032-06-01')).toBe(1);
    expect(await newCount('?travelDateTo=2032-06-01')).toBe(1);
    expect(await newCount('?q=Alpine')).toBe(1);
    expect(col(await board(admin, '?priority=hot'), 'won').count).toBe(1);
    // A quote or percent in a filter is data, not syntax.
    expect(await newCount('?destination=%25')).toBe(0);
    expect(await newCount('?priority=%27%20OR%201%3D1')).toBe(0);
  });

  it('asks for one column and pages it ("load more")', async () => {
    await DB.prepare('DELETE FROM leads').run();
    for (let i = 0; i < 25; i++) await seed({ status: 'negotiation', budget: 10, currency: null });
    await seed({ status: 'new' });
    const first = await board(admin, '?status=negotiation');
    expect(first.columns.map((c: any) => c.status)).toEqual(['negotiation']);
    expect(first.columns[0]).toMatchObject({ count: 25 });
    expect(first.columns[0].leads).toHaveLength(20);
    const second = await board(admin, '?status=negotiation&page=2');
    expect(second.columns[0].leads).toHaveLength(5);
    const ids = new Set([...first.columns[0].leads, ...second.columns[0].leads].map((l: any) => l.id));
    expect(ids.size).toBe(25);
    // A status that is not a column is shown when asked for explicitly.
    const hold = await board(admin, '?status=on_hold');
    expect(hold.columns.map((c: any) => c.status)).toEqual(['on_hold']);
  });

  it('carries the seats a lead holds when the departures feature is on, and leaves them out when it is off', async () => {
    await DB.prepare('DELETE FROM leads').run();
    const tour = await data(await call('POST', '/tours', admin, { code: 'R153', title: 'Board tour', destination: 'Switzerland', durationDays: 5, defaultCapacity: 49 }));
    const dep = await data(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2032-10-08' }));
    const dep2 = await data(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2032-11-08' }));
    const withSeats = await seed({ status: 'proposal_sent' });
    const without = await seed({ status: 'proposal_sent' });
    await DB.prepare(`INSERT INTO seat_bookings (id, departure_id, lead_id, contact_id, status, seats) VALUES ('r153-sb-1', ?, ?, ?, 'held', 2), ('r153-sb-2', ?, ?, ?, 'confirmed', 3), ('r153-sb-3', ?, ?, ?, 'cancelled', 9)`)
      .bind(dep.id, withSeats, contactId, dep2.id, withSeats, contactId, dep.id, without, contactId).run();

    const leads = col(await board(admin), 'proposal_sent').leads as any[];
    expect(leads.find((l) => l.id === withSeats)).toMatchObject({ seats: 5, seatStatus: 'confirmed' });
    expect(leads.find((l) => l.id === without).seats).toBeUndefined();

    await DB.prepare('INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES (?, ?, ?, 0)').bind('r153-flag', TENANT_ID, 'group_departures').run();
    try {
      const off = col(await board(admin), 'proposal_sent').leads as any[];
      expect(off.find((l) => l.id === withSeats).seats).toBeUndefined();
    } finally {
      await DB.prepare("DELETE FROM tenant_feature_flags WHERE id = 'r153-flag'").run();
    }
    await DB.prepare("DELETE FROM seat_bookings WHERE id LIKE 'r153-sb-%'").run();
  });

  it('shows a salesperson only what the list shows them', async () => {
    await DB.prepare('DELETE FROM leads').run();
    await seed({ status: 'new', assigned_to: SALES_ID });
    await seed({ status: 'new', assigned_to: null });
    await seed({ status: 'won', assigned_to: SALES_ID });
    const mine = await board(sales);
    expect(col(mine, 'new').count).toBe(1);
    expect(col(mine, 'won').count).toBe(1);
    // Asking for the unassigned leads does not widen it.
    expect(col(await board(sales, '?unassigned=1'), 'new').count).toBe(0);
    const list = await data(await call('GET', '/leads?limit=50', sales));
    const listed = Array.isArray(list) ? list : list.data ?? list.items ?? [];
    expect(listed.length).toBe(2);
  });

  it('keeps the columns an admin chose, and only managers may change them', async () => {
    const settings = await data(await call('GET', '/leads/board-settings', sales));
    expect(settings.columns).toEqual(['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost']);
    expect(settings.available).toContain('on_hold');

    expect((await call('PUT', '/leads/board-settings', sales, { columns: ['new'] })).status).toBe(403);
    expect((await call('PUT', '/leads/board-settings', admin, { columns: [] })).status).toBe(400);
    expect((await call('PUT', '/leads/board-settings', admin, { columns: ['new', 'nonsense'] })).status).toBe(400);

    const saved = await call('PUT', '/leads/board-settings', admin, { columns: ['lost', 'new', 'on_hold', 'new'], showValue: false });
    expect(saved.status).toBe(200);
    expect((await data(saved)).columns).toEqual(['lost', 'new', 'on_hold']);

    const b = await board(admin);
    expect(b.columns.map((c: any) => c.status)).toEqual(['lost', 'new', 'on_hold']);
    expect(b.showValue).toBe(false);
    // A column that was hidden stays out of the board, but a status filter can still ask for it.
    expect(col(b, 'won')).toBeUndefined();
    expect(col(await board(admin, '?status=won'), 'won')).toBeDefined();

    await DB.prepare("DELETE FROM settings WHERE key = 'leads.board'").run();
    expect((await board(admin)).columns).toHaveLength(7);
  });
});
