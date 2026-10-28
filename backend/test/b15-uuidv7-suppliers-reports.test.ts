import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { ReportEngine } from '../src/services/report-engine';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function raw(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function json(method: string, path: string, token: string | null, body?: unknown): Promise<{ status: number; body: any }> {
  const res = await raw(method, path, token, body);
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function login(email: string): Promise<string> {
  const res = await raw('POST', '/auth/login', null, { email, password: 'password123', tenantId: TENANT_ID });
  expect(res.status).toBe(200);
  return ((await res.json()) as any).data.accessToken;
}

let adminToken = '';
let salesToken = '';

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  const reset = await raw('POST', '/test/reset', null);
  expect(reset.status).toBe(200);
  adminToken = await login('admin@e2e.test');
  salesToken = await login('sales@e2e.test');
});

// ─────────────────────────────────────────────────────────────
// Migration 0037: suppliers table matches the routes on a fresh database
// ─────────────────────────────────────────────────────────────
describe('B15 suppliers on a freshly migrated database (migration 0037)', () => {
  it('has every column the Drizzle schema and routes use', async () => {
    const info = await testEnv.MASTER_DB.prepare('PRAGMA table_info(suppliers)').all();
    const cols = new Set((info.results as any[]).map((r) => r.name));
    for (const col of [
      'id', 'company_name', 'contact_person', 'email', 'phone', 'address', 'city', 'state', 'country',
      'postal_code', 'gst_number', 'tax_id', 'category', 'website', 'notes', 'rating', 'is_preferred',
      'status', 'created_by', 'created_at', 'updated_at', 'is_deleted',
    ]) {
      expect(cols.has(col), `suppliers.${col}`).toBe(true);
    }
  });

  it('GET /suppliers answers 200 with an empty page', async () => {
    const res = await json('GET', '/suppliers', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination.total).toBe(0);
  });

  it('create -> list -> get -> update -> delete round trip with a UUIDv7 id', async () => {
    const created = await json('POST', '/suppliers', adminToken, {
      companyName: 'Grand Hotel Mumbai',
      category: 'hotel',
      contactPerson: 'Rahul Sharma',
      email: 'bookings@grandhotel.com',
      phone: '+912234567890',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '400001',
      website: 'https://grandhotel.com',
      isPreferred: true,
    });
    expect(created.status).toBe(201);
    const id: string = created.body.data.id;
    expect(id).toMatch(UUID_V7);
    expect(created.body.data.is_deleted).toBe(0);
    expect(created.body.data.status).toBe('active');
    expect(created.body.data.is_preferred).toBe(true);

    const list = await json('GET', '/suppliers?category=hotel&status=active&search=Grand', adminToken);
    expect(list.status).toBe(200);
    expect(list.body.data.map((s: any) => s.id)).toContain(id);
    expect(list.body.pagination.total).toBe(1);

    const summary = await json('GET', '/suppliers/categories/summary', adminToken);
    expect(summary.status).toBe(200);
    expect(summary.body.data.hotel).toBe(1);

    const got = await json('GET', `/suppliers/${id}`, adminToken);
    expect(got.status).toBe(200);
    expect(got.body.data.company_name).toBe('Grand Hotel Mumbai');

    const updated = await json('PUT', `/suppliers/${id}`, adminToken, { city: 'Pune', website: 'https://grandhotel.in' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.city).toBe('Pune');

    const payment = await json('POST', `/suppliers/${id}/payments`, adminToken, {
      amount: 5000,
      method: 'bank_transfer',
      payment_date: '2027-01-10',
    });
    expect(payment.status).toBe(201);
    expect(payment.body.id).toMatch(UUID_V7);

    const del = await json('DELETE', `/suppliers/${id}`, adminToken);
    expect(del.status).toBe(200);

    const after = await json('GET', '/suppliers', adminToken);
    expect(after.status).toBe(200);
    expect(after.body.data.map((s: any) => s.id)).not.toContain(id);
    expect((await json('GET', `/suppliers/${id}`, adminToken)).status).toBe(404);
  });

  it('GET /suppliers/compare-rates answers 200 on a fresh database', async () => {
    const res = await json('GET', '/suppliers/compare-rates?service_type=hotel&destination=Goa', adminToken);
    expect(res.status).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────
// BUG-081: persisted ids are UUIDv7
// ─────────────────────────────────────────────────────────────
describe('B15 database ids are UUIDv7 (BUG-081)', () => {
  it('tasks and their deadline calendar events get UUIDv7 ids', async () => {
    const created = await json('POST', '/tasks', adminToken, {
      title: 'Confirm hotel booking for the Goa group',
      due_date: '2027-02-01',
    });
    expect(created.status).toBe(201);
    const taskId = created.body.data.id;
    expect(taskId).toMatch(UUID_V7);

    const events = await testEnv.MASTER_DB.prepare('SELECT id FROM events WHERE related_task_id = ?').bind(taskId).all();
    expect(events.results.length).toBe(1);
    expect((events.results[0] as any).id).toMatch(UUID_V7);
  });
});

// ─────────────────────────────────────────────────────────────
// Report engine: the salesperson filter belongs in WHERE, before ORDER BY / LIMIT
// ─────────────────────────────────────────────────────────────
describe('B15 report engine salesperson filter placement', () => {
  const engine = new ReportEngine() as any;
  const build = (baseQuery: string, userRole: string, extra: Record<string, any> = {}) =>
    engine._buildQuery(
      {
        baseQuery,
        allowedFilters: extra.allowedFilters ?? [],
        allowedGroupBy: [],
        defaultSort: { column: 'n', order: 'desc' },
        dateColumn: 'created_at',
      },
      extra.params ?? {},
      'user-1',
      userRole,
    );

  it('injects the filter into WHERE ahead of the {ORDER_BY} placeholder', () => {
    const { query, bindings } = build('SELECT a AS n FROM leads WHERE is_deleted = 0 {DATE_FILTER} {ORDER_BY}', 'salesperson');
    expect(query.indexOf('assigned_to = ?')).toBeGreaterThan(-1);
    expect(query.indexOf('assigned_to = ?')).toBeLessThan(query.indexOf('ORDER BY'));
    expect(query.indexOf('ORDER BY')).toBeLessThan(query.indexOf('LIMIT'));
    expect(bindings).toEqual(['user-1', 25, 0]);
  });

  it('adds a WHERE when the base query has none, and ignores WHERE inside subqueries', () => {
    const { query } = build('SELECT (SELECT COUNT(*) FROM t WHERE t.x = 1) AS n FROM leads {ORDER_BY}', 'salesperson');
    expect(query).toMatch(/FROM leads\s+WHERE\s+assigned_to = \?\s+ORDER BY/);
  });

  it('puts the filter before GROUP BY / HAVING and keeps dynamic filters in WHERE', () => {
    const { query, bindings } = build(
      'SELECT status, COUNT(*) AS n FROM leads WHERE 1 = 1 GROUP BY status HAVING n > 0 {ORDER_BY}',
      'salesperson',
      { allowedFilters: ['status'], params: { status: 'new' } },
    );
    expect(query.indexOf('assigned_to = ?')).toBeLessThan(query.indexOf('GROUP BY'));
    expect(query.indexOf('status = ?')).toBeLessThan(query.indexOf('GROUP BY'));
    expect(query.indexOf('HAVING')).toBeLessThan(query.indexOf('ORDER BY'));
    expect(bindings).toEqual(['user-1', 'new', 25, 0]);
  });

  it('leaves non-salesperson queries without the owner filter', () => {
    const { query } = build('SELECT a AS n FROM leads WHERE 1 = 1 {ORDER_BY}', 'admin');
    expect(query).not.toContain('assigned_to');
  });
});

describe('B15 every report id runs as a salesperson', () => {
  it('answers 200 (or 403 for admin-only reports), never a SQL error', async () => {
    const list = await raw('GET', '/reports', adminToken);
    expect(list.status).toBe(200);
    const reports: any[] = ((await list.json()) as any).data;
    expect(reports.length).toBeGreaterThan(20);
    // Cached admin results must not hide a SQL error for the salesperson query.
    await raw('DELETE', '/reports/cache', adminToken);
    const failures: string[] = [];
    let allowed = 0;
    for (const r of reports) {
      for (const qs of ['', '?date_preset=this_month']) {
        const res = await raw('GET', `/reports/${r.id}${qs}`, salesToken);
        const text = await res.text();
        if (r.requiredRole.includes('salesperson')) {
          allowed++;
          if (res.status !== 200) failures.push(`${r.id}${qs} -> ${res.status} ${text.slice(0, 200)}`);
        } else if (!/Insufficient permissions/.test(text)) {
          // Admin-only reports are refused by role before any SQL runs.
          failures.push(`${r.id}${qs} -> ${res.status} ${text.slice(0, 200)}`);
        }
      }
    }
    expect(allowed).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});
