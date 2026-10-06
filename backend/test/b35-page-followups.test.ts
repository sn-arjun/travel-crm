import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { ReportEngine } from '../src/services/report-engine';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

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

async function api(method: string, path: string, token: string, body?: unknown) {
  const res = await raw(method, path, token, body);
  return { status: res.status, body: (await res.json()) as any };
}

let adminToken = '';
let contactId = '';
let leadId = '';
const today = new Date().toISOString().split('T')[0];

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  expect((await raw('POST', '/test/reset', null)).status).toBe(200);
  const login = await raw('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
  adminToken = ((await login.json()) as any).data.accessToken;

  const contact = await api('POST', '/contacts', adminToken, { name: 'B35 Client', email: 'b35@test.com', type: 'customer', source: 'manual' });
  expect(contact.status).toBe(201);
  contactId = contact.body.data.id;
  const lead = await api('POST', '/leads', adminToken, {
    contactId, title: 'B35 Lead', destinations: ['Goa'], travelDate: '2026-12-15', returnDate: '2026-12-22',
    paxAdults: 2, budget: 50000, currency: 'INR', tripType: 'family', source: 'website', priority: 'hot',
  });
  expect(lead.status, JSON.stringify(lead.body)).toBe(201);
  leadId = lead.body.data.id;
});

describe('B35 invoice issueDate + terms', () => {
  const items = [{ description: 'Hotel', quantity: 1, rate: 1000 }];

  it('round-trips issueDate and terms through POST and GET', async () => {
    const res = await api('POST', '/invoices', adminToken, {
      contactId, items, issueDate: '2026-03-05', terms: 'Net 15', dueDate: '2026-03-20',
    });
    expect(res.status).toBe(201);
    const id = res.body.data.id;

    const get = await api('GET', `/invoices/${id}`, adminToken);
    expect(get.status).toBe(200);
    expect(get.body.data.issue_date ?? get.body.data.issueDate).toBe('2026-03-05');
    expect(get.body.data.terms).toBe('Net 15');

    const list = await api('GET', '/invoices?limit=100', adminToken);
    const row = (list.body.data.items ?? list.body.data).find((r: any) => r.id === id);
    expect(row.issue_date ?? row.issueDate).toBe('2026-03-05');
    expect(row.terms).toBe('Net 15');
  });

  it('updates issueDate and terms through PUT', async () => {
    const created = await api('POST', '/invoices', adminToken, { contactId, items, issueDate: '2026-03-05', terms: 'Net 15' });
    const id = created.body.data.id;
    const put = await api('PUT', `/invoices/${id}`, adminToken, { issueDate: '2026-04-01', terms: 'Due on receipt' });
    expect(put.status).toBe(200);
    const get = await api('GET', `/invoices/${id}`, adminToken);
    expect(get.body.data.issue_date ?? get.body.data.issueDate).toBe('2026-04-01');
    expect(get.body.data.terms).toBe('Due on receipt');
  });

  it('defaults issueDate to the creation date when omitted', async () => {
    const created = await api('POST', '/invoices', adminToken, { contactId, items });
    const get = await api('GET', `/invoices/${created.body.data.id}`, adminToken);
    expect(get.body.data.issue_date ?? get.body.data.issueDate).toBe(today);
    expect(get.body.data.terms ?? null).toBeNull();
  });
});

describe('B35 GET /reports/dashboard date range', () => {
  it('is unchanged when no range is given (lead and this-month invoicing visible)', async () => {
    const res = await api('GET', '/reports/dashboard', adminToken);
    expect(res.status).toBe(200);
    const total = res.body.data.pipeline.reduce((n: number, r: any) => n + r.count, 0);
    expect(total).toBeGreaterThan(0);
    expect(res.body.data.financial.invoicedThisMonth).toBeGreaterThan(0);
  });

  it('honours date_from/date_to: a past range excludes today, a range containing today includes it', async () => {
    const past = await api('GET', '/reports/dashboard?date_from=2020-01-01&date_to=2020-01-31', adminToken);
    expect(past.status).toBe(200);
    expect(past.body.data.pipeline).toEqual([]);
    expect(past.body.data.hotLeads).toEqual([]);
    expect(past.body.data.recentActivities).toEqual([]);
    expect(past.body.data.financial.invoicedThisMonth).toBe(0);

    const now = await api('GET', `/reports/dashboard?date_from=${today}&date_to=${today}`, adminToken);
    expect(now.body.data.pipeline.reduce((n: number, r: any) => n + r.count, 0)).toBeGreaterThan(0);
    expect(now.body.data.hotLeads.length).toBeGreaterThan(0);
    expect(now.body.data.financial.invoicedThisMonth).toBeGreaterThan(0);
  });

  it('accepts a date_preset', async () => {
    const res = await api('GET', '/reports/dashboard?date_preset=last_year', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data.pipeline).toEqual([]);
    const thisMonth = await api('GET', '/reports/dashboard?date_preset=this_month', adminToken);
    expect(thisMonth.body.data.pipeline.length).toBeGreaterThan(0);
  });
});

describe('B35 report engine previous_period_rows', () => {
  it('returns every previous-period row (and keeps previous_period as the first row)', async () => {
    const currentRows = [{ status: 'new', lead_count: 1 }];
    const prevRows = [
      { status: 'new', lead_count: 4 },
      { status: 'contacted', lead_count: 3 },
      { status: 'qualified', lead_count: 2 },
    ];
    const fakeDb: any = {
      prepare: () => ({ bind: () => ({}) }),
      batch: async () => [{ results: currentRows }, { results: [{ total: 1 }] }, { results: prevRows }],
    };
    const result = await new ReportEngine().execute(
      fakeDb, 'pipeline_summary',
      { date_from: '2026-02-01', date_to: '2026-02-28', compare: 'true' } as any,
      'u1', 'admin',
    );
    expect(result.previous_period_rows).toEqual(prevRows);
    expect(result.previous_period).toEqual(prevRows[0]);
  });

  it('is exposed over HTTP when compare=true', async () => {
    const res = await api('GET', '/reports/pipeline_summary?compare=true&date_from=2026-01-01&date_to=2026-01-31', adminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.previous_period_rows)).toBe(true);
  });
});

describe('B35 report meta.total and as-of-now reports', () => {
  it('returns the real total and hasMore for a full page (never -1)', async () => {
    const rows = [{ a: 1 }, { a: 2 }];
    const fakeDb: any = {
      prepare: () => ({ bind: () => ({}) }),
      batch: async () => [{ results: rows }, { results: [{ total: 7 }] }],
    };
    const r = await new ReportEngine().execute(fakeDb, 'pipeline_summary', { per_page: 2, page: 1 } as any, 'u1', 'admin');
    expect(r.meta.total).toBe(7);
    expect((r.meta as any).hasMore).toBe(true);
    const last = await new ReportEngine().execute(fakeDb, 'pipeline_summary', { per_page: 2, page: 4 } as any, 'u1', 'admin');
    expect((last.meta as any).hasMore).toBe(false);
  });

  it('over HTTP meta.total is numeric and matches the row count for a full page', async () => {
    const res = await api('GET', '/reports/pipeline_summary?per_page=1', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.data.meta.total).toBeGreaterThanOrEqual(res.body.data.data.length);
    expect(typeof res.body.data.meta.hasMore).toBe('boolean');
  });

  it('fleet_availability ignores the date range', async () => {
    const v = await api('POST', '/fleet/vehicles', adminToken, {
      registrationNumber: 'B35-0001', type: 'sedan', make: 'Toyota', model: 'Etios', capacity: 4,
    });
    const unfiltered = await api('GET', '/reports/fleet_availability', adminToken);
    const past = await api('GET', '/reports/fleet_availability?date_from=2020-01-01&date_to=2020-01-31', adminToken);
    expect(past.status).toBe(200);
    expect(past.body.data.data).toEqual(unfiltered.body.data.data);
    if (v.status === 201) expect(past.body.data.data.length).toBeGreaterThan(0);
  });
});

describe('B35 GET /follow-ups status filter', () => {
  let pendingId = '';
  let completedId = '';

  beforeAll(async () => {
    const mk = async () => {
      const r = await api('POST', '/follow-ups', adminToken, {
        leadId, scheduledAt: new Date(Date.now() + 86400000).toISOString(), type: 'call',
      });
      expect(r.status).toBe(201);
      return r.body.data.id as string;
    };
    pendingId = await mk();
    completedId = await mk();
    const done = await api('PUT', `/follow-ups/${completedId}/complete`, adminToken, { outcomeNotes: 'spoke' });
    expect(done.status).toBe(200);
  });

  const ids = (body: any) => body.data.map((f: any) => f.id);

  it('defaults to pending only', async () => {
    const res = await api('GET', `/follow-ups?contactId=${contactId}`, adminToken);
    expect(ids(res.body)).toContain(pendingId);
    expect(ids(res.body)).not.toContain(completedId);
  });

  it('status=completed returns completed items, composing with contactId', async () => {
    const res = await api('GET', `/follow-ups?status=completed&contactId=${contactId}`, adminToken);
    expect(res.status).toBe(200);
    expect(ids(res.body)).toContain(completedId);
    expect(ids(res.body)).not.toContain(pendingId);
    expect(res.body.data.find((f: any) => f.id === completedId).status).toBe('completed');

    const other = await api('GET', '/follow-ups?status=completed&contactId=no-such-contact', adminToken);
    expect(other.body.data).toEqual([]);
  });

  it('status=all returns both', async () => {
    const res = await api('GET', `/follow-ups?status=all&contactId=${contactId}`, adminToken);
    expect(ids(res.body)).toEqual(expect.arrayContaining([pendingId, completedId]));
  });

  it('status=cancelled is accepted and an unknown status is a 400', async () => {
    const ok = await api('GET', '/follow-ups?status=cancelled', adminToken);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual([]);
    const bad = await api('GET', '/follow-ups?status=bogus', adminToken);
    expect(bad.status).toBe(400);
  });
});
