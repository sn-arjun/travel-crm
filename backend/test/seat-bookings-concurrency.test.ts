import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

// R143: the capacity rule lives in the SQL statement itself, so parallel requests can never oversell.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

let admin = '';

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

async function openDeparture(code: string, capacity: number): Promise<string> {
  const tour = (await json(await call('POST', '/tours', admin, { code, title: `Concurrency ${code}`, destination: 'Austria', durationDays: 3 }))).data;
  const dep = (await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: '2033-06-10', capacityMode: 'manual', capacity }))).data;
  expect((await call('POST', `/departures/${dep.id}/status`, admin, { status: 'open' })).status).toBe(200);
  return dep.id;
}

const request = (dep: string, i: number, seats = 1) =>
  call('POST', `/departures/${dep}/bookings`, admin, { contact: { name: `Parallel ${i}`, email: `parallel.${dep.slice(-6)}.${i}@sb.test` }, seats });

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
  admin = (await json(login)).data.accessToken;
  expect((await call('PUT', '/automations/pause', admin, { paused: true })).status).toBe(200);
  expect((await call('PUT', '/departures/settings', admin, { waitlist: { enabled: true, offerMode: 'suggest' }, confirmMode: 'manual' })).status).toBe(200);
});

describe('capacity under parallel requests', () => {
  it('20 requests of 1 seat on a 10-seat departure: exactly 10 held and 10 waitlisted, never 11 held', async () => {
    const dep = await openDeparture('CONC10', 10);
    const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => request(dep, i)));
    expect(responses.map((r) => r.status)).toEqual(Array(20).fill(201));
    const statuses = (await Promise.all(responses.map(json))).map((b) => b.data.status as string);
    expect(statuses.filter((s) => s === 'held')).toHaveLength(10);
    expect(statuses.filter((s) => s === 'waitlisted')).toHaveLength(10);
    const sum = (await rows(`SELECT COALESCE(SUM(seats), 0) AS n FROM seat_bookings WHERE departure_id = ? AND status IN ('held', 'confirmed')`, dep))[0].n;
    expect(sum).toBe(10);
    const positions = (await rows(`SELECT waitlist_position AS p FROM seat_bookings WHERE departure_id = ? AND status = 'waitlisted'`, dep)).map((r) => r.p as number);
    expect(positions).toHaveLength(10);
    expect(positions.every((p) => p >= 1)).toBe(true);
  });

  it('with the waitlist off the other 10 are refused with 409 and nothing is oversold', async () => {
    expect((await call('PUT', '/departures/settings', admin, { waitlist: { enabled: false } })).status).toBe(200);
    try {
      const dep = await openDeparture('CONC10B', 10);
      const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => request(dep, i)));
      const codes = responses.map((r) => r.status);
      expect(codes.filter((c) => c === 201)).toHaveLength(10);
      expect(codes.filter((c) => c === 409)).toHaveLength(10);
      expect((await rows(`SELECT COALESCE(SUM(seats), 0) AS n FROM seat_bookings WHERE departure_id = ?`, dep))[0].n).toBe(10);
      // The refused requests left no lead behind.
      const refusedLeads = (await rows(`SELECT COUNT(*) AS n FROM leads WHERE is_deleted = 0 AND departure_id = ?`, dep))[0].n;
      expect(refusedLeads).toBe(10);
    } finally {
      await call('PUT', '/departures/settings', admin, { waitlist: { enabled: true } });
    }
  });

  it('mixed party sizes never exceed the capacity, and confirming in parallel changes no seat count', async () => {
    const dep = await openDeparture('CONC7', 7);
    const sizes = [3, 2, 2, 1, 4, 1, 2, 3, 1, 2];
    const responses = await Promise.all(sizes.map((n, i) => request(dep, i, n)));
    expect(responses.every((r) => r.status === 201)).toBe(true);
    const bookings = (await Promise.all(responses.map(json))).map((b) => b.data);
    const heldSeats = bookings.filter((b) => b.status === 'held').reduce((n, b) => n + b.seats, 0);
    expect(heldSeats).toBeLessThanOrEqual(7);
    expect((await rows(`SELECT COALESCE(SUM(seats), 0) AS n FROM seat_bookings WHERE departure_id = ? AND status IN ('held', 'confirmed')`, dep))[0].n).toBe(heldSeats);

    const held = bookings.filter((b) => b.status === 'held');
    await Promise.all(held.map((b) => call('POST', `/seat-bookings/${b.id}/confirm`, admin)));
    expect((await rows(`SELECT COALESCE(SUM(seats), 0) AS n FROM seat_bookings WHERE departure_id = ? AND status = 'confirmed'`, dep))[0].n).toBe(heldSeats);

    // Parallel growth of two bookings competing for the last seats cannot pass the capacity either.
    const [a, b] = held;
    const free = 7 - heldSeats;
    const grows = await Promise.all([a, b].map((x) => call('PUT', `/seat-bookings/${x.id}/seats`, admin, { seats: x.seats + free + 1 })));
    expect(grows.every((r) => r.status === 409)).toBe(true);
    const wanted = free > 0 ? free : 0;
    if (wanted > 0) {
      const both = await Promise.all([a, b].map((x) => call('PUT', `/seat-bookings/${x.id}/seats`, admin, { seats: x.seats + wanted })));
      expect(both.filter((r) => r.status === 200)).toHaveLength(1);
    }
    expect((await rows(`SELECT COALESCE(SUM(seats), 0) AS n FROM seat_bookings WHERE departure_id = ? AND status IN ('held', 'confirmed')`, dep))[0].n).toBeLessThanOrEqual(7);
  });
});
