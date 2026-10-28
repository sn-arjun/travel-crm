import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { ReportCache, reportCacheScope } from '../src/services/report-cache';

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

async function login(email: string): Promise<string> {
  const res = await raw('POST', '/auth/login', null, { email, password: 'password123', tenantId: TENANT_ID });
  expect(res.status).toBe(200);
  return ((await res.json()) as any).data.accessToken;
}

const ADMIN_PAYLOAD = {
  data: [{ status: 'won', count: 999 }],
  columns: [{ name: 'status', type: 'string' }, { name: 'count', type: 'number' }],
  meta: { total: 999, page: 1, per_page: 25 },
};

// Open to salesperson, filtered by owner for that role
const SHARED_REPORT = 'pipeline_summary';
// Admin / manager only
const ADMIN_ONLY_REPORT = 'lead_ageing';

let adminToken = '';
let salesToken = '';

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  const reset = await raw('POST', '/test/reset', null);
  expect(reset.status).toBe(200);
  adminToken = await login('admin@e2e.test');
  salesToken = await login('sales@e2e.test');
});

describe('B32 report cache scope', () => {
  it('scopes owner-filtered roles by role and user, other roles by role', () => {
    expect(reportCacheScope('admin', 'u1')).toBe('admin');
    expect(reportCacheScope('manager', 'u2')).toBe('manager');
    expect(reportCacheScope('salesperson', 'u3')).toBe('salesperson:u3');
    expect(reportCacheScope('salesperson', 'u3')).not.toBe(reportCacheScope('salesperson', 'u4'));
  });

  it('never serves a result cached for one scope to another, and invalidate clears every scope', async () => {
    const cache = new ReportCache(testEnv.REPORT_CACHE);
    const params = { date_from: '2026-01-01' };
    const adminScope = reportCacheScope('admin', 'admin-1');
    const salesScope = reportCacheScope('salesperson', 'sales-1');
    const otherSalesScope = reportCacheScope('salesperson', 'sales-2');

    await cache.set('tenant-b32', 'r1', params, adminScope, ADMIN_PAYLOAD as any);
    expect(await cache.get('tenant-b32', 'r1', params, adminScope)).toMatchObject({ meta: { total: 999 } });
    expect(await cache.get('tenant-b32', 'r1', params, salesScope)).toBeNull();
    expect(await cache.get('tenant-b32', 'r1', params, otherSalesScope)).toBeNull();

    await cache.set('tenant-b32', 'r1', params, salesScope, { ...ADMIN_PAYLOAD, meta: { total: 1, page: 1, per_page: 25 } } as any);
    await cache.set('tenant-b32', 'r2', params, adminScope, ADMIN_PAYLOAD as any);
    expect((await cache.get('tenant-b32', 'r1', params, salesScope) as any).meta.total).toBe(1);
    expect(await cache.get('tenant-b32', 'r1', params, otherSalesScope)).toBeNull();

    // Per-report invalidation removes every scope of that report only
    await cache.invalidate('tenant-b32', 'r1');
    expect(await cache.get('tenant-b32', 'r1', params, adminScope)).toBeNull();
    expect(await cache.get('tenant-b32', 'r1', params, salesScope)).toBeNull();
    expect(await cache.get('tenant-b32', 'r2', params, adminScope)).not.toBeNull();

    // Tenant-wide invalidation removes the rest
    await cache.invalidate('tenant-b32');
    expect(await cache.get('tenant-b32', 'r2', params, adminScope)).toBeNull();
  });
});

describe('B32 report cache over HTTP', () => {
  it('a salesperson does not receive the admin-cached payload; the admin still does', async () => {
    await raw('DELETE', '/reports/cache', adminToken);
    const cache = new ReportCache(testEnv.REPORT_CACHE);
    // A query string with no filters produces the same cache params as the request below
    await cache.set(TENANT_ID, SHARED_REPORT, {}, reportCacheScope('admin', 'ignored'), ADMIN_PAYLOAD as any);

    const adminRes = await raw('GET', `/reports/${SHARED_REPORT}`, adminToken);
    expect(adminRes.status).toBe(200);
    expect(adminRes.headers.get('X-Cache')).toBe('HIT');
    expect(((await adminRes.json()) as any).data.meta.total).toBe(999);

    const salesRes = await raw('GET', `/reports/${SHARED_REPORT}`, salesToken);
    expect(salesRes.status).toBe(200);
    expect(salesRes.headers.get('X-Cache')).toBe('MISS');
    const salesBody: any = await salesRes.json();
    expect(salesBody.data.meta.total).not.toBe(999);
    expect(JSON.stringify(salesBody.data.data)).not.toContain('999');

    // The salesperson's own result is then cached for the salesperson only
    const salesAgain = await raw('GET', `/reports/${SHARED_REPORT}`, salesToken);
    expect(salesAgain.headers.get('X-Cache')).toBe('HIT');
    expect(((await salesAgain.json()) as any).data.meta.total).toBe(salesBody.data.meta.total);
    const adminAgain = await raw('GET', `/reports/${SHARED_REPORT}`, adminToken);
    expect(((await adminAgain.json()) as any).data.meta.total).toBe(999);
  });

  it('DELETE /reports/cache clears the admin and salesperson entries', async () => {
    const del = await raw('DELETE', '/reports/cache', adminToken);
    expect(del.status).toBe(200);
    const adminRes = await raw('GET', `/reports/${SHARED_REPORT}`, adminToken);
    expect(adminRes.headers.get('X-Cache')).toBe('MISS');
    const salesRes = await raw('GET', `/reports/${SHARED_REPORT}`, salesToken);
    expect(salesRes.headers.get('X-Cache')).toBe('MISS');
  });

  it('DELETE /reports/:id/cache clears every scope of that report', async () => {
    await raw('GET', `/reports/${SHARED_REPORT}`, adminToken);
    await raw('GET', `/reports/${SHARED_REPORT}`, salesToken);
    const del = await raw('DELETE', `/reports/${SHARED_REPORT}/cache`, adminToken);
    expect(del.status).toBe(200);
    expect((await raw('GET', `/reports/${SHARED_REPORT}`, adminToken)).headers.get('X-Cache')).toBe('MISS');
    expect((await raw('GET', `/reports/${SHARED_REPORT}`, salesToken)).headers.get('X-Cache')).toBe('MISS');
  });
});

describe('B32 forbidden report', () => {
  it('answers 403 FORBIDDEN in the standard envelope', async () => {
    await raw('DELETE', '/reports/cache', adminToken);
    const res = await raw('GET', `/reports/${ADMIN_ONLY_REPORT}`, salesToken);
    expect(res.status).toBe(403);
    const body: any = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toMatch(/Insufficient permissions/);
  });

  it('stays 403 even when an admin has the same report cached', async () => {
    const admin = await raw('GET', `/reports/${ADMIN_ONLY_REPORT}`, adminToken);
    expect(admin.status).toBe(200);
    const again = await raw('GET', `/reports/${ADMIN_ONLY_REPORT}`, adminToken);
    expect(again.headers.get('X-Cache')).toBe('HIT');
    const res = await raw('GET', `/reports/${ADMIN_ONLY_REPORT}`, salesToken);
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error.code).toBe('FORBIDDEN');
  });

  it('still answers 404 for an unknown report', async () => {
    const res = await raw('GET', '/reports/no_such_report', adminToken);
    expect(res.status).toBe(404);
    expect(((await res.json()) as any).error.details.code).toBe('NOT_FOUND');
  });
});

describe('B32 regression: formerly 500 outcomes', () => {
  it('POST /templates creates a template on a freshly migrated database', async () => {
    const res = await raw('POST', '/templates', adminToken, {
      channel: 'email',
      name: 'Itinerary Ready',
      subject: 'Your {destination} itinerary',
      content: 'Hello {customer_name}, your itinerary is attached.',
      category: 'quotation',
    });
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.data.variables).toEqual(expect.arrayContaining(['customer_name', 'destination']));
    const get = await raw('GET', `/templates/${body.data.id}`, adminToken);
    expect(get.status).toBe(200);
  });

  it('POST /auth/login with an empty body is a 400, not a 500', async () => {
    const res = await raw('POST', '/auth/login', null);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).success).toBe(false);
  });
});
