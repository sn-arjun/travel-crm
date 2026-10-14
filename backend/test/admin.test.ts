import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;

// ── Helpers ────────────────────────────────────────────────────────

async function request(
  method: string,
  path: string,
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function publicRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost${path}`, opts), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const TENANT_ID = '00000000-0000-0000-0000-000000000000';

// admin@e2e.test is a TENANT admin — it must be rejected with 403.
let tenantAdminToken = '';
// superadmin@e2e.test is registered in MASTER_DB.super_admins — it gets 200.
let superAdminToken = '';

// Every read-only endpoint the desktop super-admin pages call.
const ALL_ENDPOINTS = [
  '/admin/dashboard',
  '/admin/stats',
  '/admin/tenants',
  '/admin/users',
  '/admin/plans',
  '/admin/billing',
  '/admin/billing/invoices',
  '/admin/billing/payments',
  '/admin/billing/revenue',
  '/admin/billing/stats',
  '/admin/system/health',
  '/admin/system/logs',
  '/admin/system/metrics',
  '/admin/platform/health',
  '/admin/config',
  '/admin/audit-logs',
];

// ── Setup ──────────────────────────────────────────────────────────

describe('Super Admin Platform Routes', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('http://localhost/api/v1/test/reset', { method: 'POST' }),
      testEnv,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);

    // Tenant admin — has role='admin' inside its tenant, but no platform access.
    const tenantLogin = await publicRequest('POST', '/api/v1/auth/login', {
      email: 'admin@e2e.test',
      password: 'password123',
      tenantId: TENANT_ID,
    });
    expect(tenantLogin.status).toBe(200);
    tenantAdminToken = ((await tenantLogin.json()) as any).data.accessToken;

    // Promote a second tenant user into the platform super-admin registry.
    // The password hash is irrelevant here — the backend keys off the email
    // present in the verified JWT, not off super_admins.password_hash.
    await testEnv.MASTER_DB.prepare(
      `INSERT OR REPLACE INTO super_admins (id, email, name, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
    )
      .bind(
        '01960000-0000-7000-8000-0000000000f1',
        'sales@e2e.test',
        'E2E Super Admin',
        'unused',
        'super_admin',
      )
      .run();

    const superLogin = await publicRequest('POST', '/api/v1/auth/login', {
      email: 'sales@e2e.test',
      password: 'password123',
      tenantId: TENANT_ID,
    });
    expect(superLogin.status).toBe(200);
    superAdminToken = ((await superLogin.json()) as any).data.accessToken;
  });

  // ── Authorization ────────────────────────────────────────────────

  describe('Authorization', () => {
    it('rejects unauthenticated requests with 401', async () => {
      for (const path of ALL_ENDPOINTS) {
        const res = await request('GET', path);
        expect(res.status, `${path} should be 401`).toBe(401);
      }
    });

    it('rejects a tenant admin with 403', async () => {
      for (const path of ALL_ENDPOINTS) {
        const res = await request('GET', path, tenantAdminToken);
        expect(res.status, `${path} should be 403`).toBe(403);
      }
    });

    it('does not leak platform data in the 403 body', async () => {
      const res = await request('GET', '/admin/tenants', tenantAdminToken);
      const body: any = await res.json();
      expect(body.success).toBe(false);
      expect(body.data).toBeUndefined();
      expect(body.error.message).toBe('Insufficient permissions');
    });

    it('allows a registered super admin on every endpoint', async () => {
      for (const path of ALL_ENDPOINTS) {
        const res = await request('GET', path, superAdminToken);
        expect(res.status, `${path} should be 200`).toBe(200);
      }
    });

    it('rejects a super admin whose registry row is deactivated', async () => {
      await testEnv.MASTER_DB.prepare(
        `UPDATE super_admins SET is_active = 0 WHERE email = ?`,
      )
        .bind('sales@e2e.test')
        .run();

      const res = await request('GET', '/admin/dashboard', superAdminToken);
      expect(res.status).toBe(403);

      await testEnv.MASTER_DB.prepare(
        `UPDATE super_admins SET is_active = 1 WHERE email = ?`,
      )
        .bind('sales@e2e.test')
        .run();
    });
  });

  // ── Dashboard & Stats ────────────────────────────────────────────

  describe('GET /admin/dashboard', () => {
    it('returns the shape the dashboard page renders', async () => {
      const res = await request('GET', '/admin/dashboard', superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      expect(body.success).toBe(true);
      const d = body.data;
      expect(typeof d.totalTenants).toBe('number');
      expect(typeof d.activeUsers).toBe('number');
      expect(typeof d.totalRevenue).toBe('number');
      expect(typeof d.platformHealth).toBe('number');
      expect(Array.isArray(d.recentSignups)).toBe(true);
      expect(Array.isArray(d.tenantBreakdown)).toBe(true);
      expect(Array.isArray(d.revenueByPlan)).toBe(true);
    });

    it('counts the seeded tenants', async () => {
      const res = await request('GET', '/admin/dashboard', superAdminToken);
      const body: any = await res.json();
      // /test/reset seeds the e2e tenant plus the demo tenant.
      expect(body.data.totalTenants).toBeGreaterThanOrEqual(2);
      expect(body.data.platformHealth).toBeGreaterThanOrEqual(0);
      expect(body.data.platformHealth).toBeLessThanOrEqual(100);
    });

    it('/admin/stats returns the same aggregate shape', async () => {
      const res = await request('GET', '/admin/stats', superAdminToken);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(typeof body.data.totalTenants).toBe('number');
      expect(Array.isArray(body.data.revenueByPlan)).toBe(true);
    });
  });

  // ── Tenants ──────────────────────────────────────────────────────

  describe('GET /admin/tenants', () => {
    it('returns a paginated tenant list', async () => {
      const res = await request('GET', '/admin/tenants?page=1&limit=10', superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination).toMatchObject({ page: 1, limit: 10 });
      expect(typeof body.pagination.total).toBe('number');
      expect(typeof body.pagination.totalPages).toBe('number');
      expect(typeof body.pagination.hasMore).toBe('boolean');
    });

    it('shapes each row the way the tenants table reads it', async () => {
      const res = await request('GET', '/admin/tenants', superAdminToken);
      const body: any = await res.json();
      expect(body.data.length).toBeGreaterThan(0);

      const t = body.data[0];
      expect(typeof t.id).toBe('string');
      expect(typeof t.name).toBe('string');
      expect(typeof t.email).toBe('string');
      expect(['active', 'suspended', 'inactive']).toContain(t.status);
      expect(typeof t.createdAt).toBe('string');
      expect(typeof t.userCount).toBe('number');
    });

    it('filters by status', async () => {
      const res = await request('GET', '/admin/tenants?status=active', superAdminToken);
      const body: any = await res.json();
      for (const t of body.data) {
        expect(t.status).toBe('active');
      }
    });

    it('filters by search term', async () => {
      const res = await request('GET', '/admin/tenants?search=Demo', superAdminToken);
      const body: any = await res.json();
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data.some((t: any) => t.name.includes('Demo'))).toBe(true);
    });

    it('returns an empty page for a search that matches nothing', async () => {
      const res = await request('GET', '/admin/tenants?search=zzzznomatch', superAdminToken);
      const body: any = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });
  });

  describe('GET /admin/tenants/:id', () => {
    it('returns tenant detail with stats', async () => {
      const res = await request('GET', `/admin/tenants/${TENANT_ID}`, superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      const d = body.data;
      expect(d.id).toBe(TENANT_ID);
      expect(typeof d.name).toBe('string');
      expect(typeof d.planId).toBe('string');
      expect(['active', 'suspended', 'inactive']).toContain(d.status);
      expect(d.stats).toBeDefined();
      expect(typeof d.stats.userCount).toBe('number');
      expect(typeof d.stats.contactCount).toBe('number');
      expect(typeof d.stats.leadCount).toBe('number');
      expect(typeof d.stats.invoiceCount).toBe('number');
    });

    it('returns 404 for an unknown tenant', async () => {
      const res = await request('GET', '/admin/tenants/does-not-exist', superAdminToken);
      expect(res.status).toBe(404);
    });
  });

  // ── Users ────────────────────────────────────────────────────────

  describe('GET /admin/users', () => {
    it('returns cross-tenant users with tenant names', async () => {
      const res = await request('GET', '/admin/users?page=1&limit=15', superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.pagination.limit).toBe(15);

      const u = body.data[0];
      expect(typeof u.id).toBe('string');
      expect(typeof u.name).toBe('string');
      expect(typeof u.email).toBe('string');
      expect(typeof u.tenantId).toBe('string');
      expect(typeof u.tenantName).toBe('string');
      expect(typeof u.role).toBe('string');
      expect(['active', 'inactive', 'suspended']).toContain(u.status);
    });

    it('spans more than one tenant', async () => {
      const res = await request('GET', '/admin/users?limit=100', superAdminToken);
      const body: any = await res.json();
      const tenantIds = new Set(body.data.map((u: any) => u.tenantId));
      expect(tenantIds.size).toBeGreaterThanOrEqual(2);
    });

    it('filters by role', async () => {
      const res = await request('GET', '/admin/users?role=admin', superAdminToken);
      const body: any = await res.json();
      expect(body.data.length).toBeGreaterThan(0);
      for (const u of body.data) {
        expect(u.role).toBe('admin');
      }
    });

    it('filters by search term', async () => {
      const res = await request('GET', '/admin/users?search=admin@e2e.test', superAdminToken);
      const body: any = await res.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].email).toBe('admin@e2e.test');
    });
  });

  describe('GET /admin/users/:id', () => {
    it('returns a single user', async () => {
      const list = await request('GET', '/admin/users?limit=1', superAdminToken);
      const listBody: any = await list.json();
      const id = listBody.data[0].id;

      const res = await request('GET', `/admin/users/${id}`, superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.id).toBe(id);
      expect(typeof body.data.email).toBe('string');
    });

    it('returns 404 for an unknown user', async () => {
      const res = await request('GET', '/admin/users/does-not-exist', superAdminToken);
      expect(res.status).toBe(404);
    });
  });

  // ── Plans ────────────────────────────────────────────────────────

  describe('GET /admin/plans', () => {
    it('returns the plan catalog in the card shape', async () => {
      const res = await request('GET', '/admin/plans', superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      const p = body.data[0];
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.description).toBe('string');
      expect(typeof p.price).toBe('number');
      expect(['monthly', 'yearly']).toContain(p.billingCycle);
      expect(Array.isArray(p.features)).toBe(true);
      expect(typeof p.isActive).toBe('boolean');
      expect(typeof p.createdAt).toBe('string');
    });

    it('includes the known pricing tiers', async () => {
      const res = await request('GET', '/admin/plans', superAdminToken);
      const body: any = await res.json();
      const ids = body.data.map((p: any) => p.id);
      expect(ids).toContain('basic');
      expect(ids).toContain('pro');
      expect(ids).toContain('enterprise');
    });
  });

  describe('GET /admin/plans/:id', () => {
    it('returns a single plan', async () => {
      const res = await request('GET', '/admin/plans/pro', superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.id).toBe('pro');
      expect(body.data.features.length).toBeGreaterThan(0);
    });

    it('returns 404 for an unknown plan', async () => {
      const res = await request('GET', '/admin/plans/nope', superAdminToken);
      expect(res.status).toBe(404);
    });
  });

  // ── Billing ──────────────────────────────────────────────────────

  describe('GET /admin/billing', () => {
    it('returns stats plus embedded invoices and payments', async () => {
      const res = await request('GET', '/admin/billing', superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      const d = body.data;
      expect(typeof d.totalRevenue).toBe('number');
      expect(typeof d.monthlyRecurring).toBe('number');
      expect(typeof d.activeSubscriptions).toBe('number');
      expect(typeof d.churnRate).toBe('number');
      expect(Array.isArray(d.revenueByMonth)).toBe(true);
      expect(Array.isArray(d.invoices)).toBe(true);
      expect(Array.isArray(d.payments)).toBe(true);
    });
  });

  describe('GET /admin/billing/stats', () => {
    it('returns headline billing metrics', async () => {
      const res = await request('GET', '/admin/billing/stats', superAdminToken);
      const body: any = await res.json();
      expect(typeof body.data.totalRevenue).toBe('number');
      expect(typeof body.data.churnRate).toBe('number');
      expect(Array.isArray(body.data.revenueByMonth)).toBe(true);
    });
  });

  describe('GET /admin/billing/invoices', () => {
    it('returns a paginated invoice list', async () => {
      const res = await request('GET', '/admin/billing/invoices?page=1&limit=10', superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination).toMatchObject({ page: 1, limit: 10 });
      for (const inv of body.data) {
        expect(['draft', 'sent', 'paid', 'overdue', 'cancelled']).toContain(inv.status);
        expect(typeof inv.amount).toBe('number');
        expect(typeof inv.tenantName).toBe('string');
      }
    });

    it('accepts a status filter', async () => {
      const res = await request('GET', '/admin/billing/invoices?status=paid', superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      for (const inv of body.data) {
        expect(inv.status).toBe('paid');
      }
    });
  });

  describe('GET /admin/billing/payments', () => {
    it('returns a paginated payment list', async () => {
      const res = await request('GET', '/admin/billing/payments', superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(typeof body.pagination.total).toBe('number');
      for (const p of body.data) {
        expect(['pending', 'completed', 'failed', 'refunded']).toContain(p.status);
        expect(typeof p.method).toBe('string');
      }
    });
  });

  describe('GET /admin/billing/revenue', () => {
    it('returns revenue series split by month and plan', async () => {
      const res = await request('GET', '/admin/billing/revenue', superAdminToken);
      const body: any = await res.json();
      expect(typeof body.data.totalRevenue).toBe('number');
      expect(Array.isArray(body.data.revenueByMonth)).toBe(true);
      expect(Array.isArray(body.data.revenueByPlan)).toBe(true);
    });
  });

  // ── System ───────────────────────────────────────────────────────

  describe('GET /admin/system/health', () => {
    it('returns the health shape the system page renders', async () => {
      const res = await request('GET', '/admin/system/health', superAdminToken);
      expect(res.status).toBe(200);
      const d: any = ((await res.json()) as any).data;

      expect(['healthy', 'warning', 'critical']).toContain(d.status);
      expect(typeof d.uptime).toBe('number');
      expect(typeof d.responseTime).toBe('number');
      expect(typeof d.cpuUsage).toBe('number');
      expect(typeof d.memoryUsage).toBe('number');
      expect(typeof d.databaseConnection).toBe('boolean');
      expect(typeof d.cacheHealth).toBe('string');
      expect(Array.isArray(d.metrics)).toBe(true);
      expect(Array.isArray(d.recentErrors)).toBe(true);
    });

    it('reports the master database as connected', async () => {
      const res = await request('GET', '/admin/system/health', superAdminToken);
      const d: any = ((await res.json()) as any).data;
      expect(d.databaseConnection).toBe(true);
      expect(d.status).toBe('healthy');
    });

    it('/admin/platform/health returns the same shape', async () => {
      const res = await request('GET', '/admin/platform/health', superAdminToken);
      const d: any = ((await res.json()) as any).data;
      expect(['healthy', 'warning', 'critical']).toContain(d.status);
      expect(typeof d.databaseConnection).toBe('boolean');
    });
  });

  describe('GET /admin/system/logs', () => {
    it('returns a paginated log stream', async () => {
      const res = await request('GET', '/admin/system/logs?page=1&limit=20', superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination.limit).toBe(20);
      for (const log of body.data) {
        expect(['info', 'warning', 'error', 'critical']).toContain(log.level);
        expect(typeof log.message).toBe('string');
        expect(typeof log.service).toBe('string');
        expect(typeof log.timestamp).toBe('string');
      }
    });

    it('accepts a level filter', async () => {
      const res = await request('GET', '/admin/system/logs?level=error', superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      for (const log of body.data) {
        expect(log.level).not.toBe('info');
      }
    });
  });

  describe('GET /admin/system/metrics', () => {
    it('returns a metric series', async () => {
      const res = await request('GET', '/admin/system/metrics', superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(Array.isArray(body.data.metrics)).toBe(true);
    });
  });

  // ── Config ───────────────────────────────────────────────────────

  describe('GET /admin/config', () => {
    it('returns the global config shape the config page renders', async () => {
      const res = await request('GET', '/admin/config', superAdminToken);
      expect(res.status).toBe(200);
      const d: any = ((await res.json()) as any).data;

      expect(typeof d.id).toBe('string');
      expect(typeof d.appName).toBe('string');
      expect(typeof d.appUrl).toBe('string');
      expect(typeof d.supportEmail).toBe('string');
      expect(typeof d.maxTenantsPerPlan).toBe('object');

      expect(typeof d.features.emailNotifications).toBe('boolean');
      expect(typeof d.features.smsNotifications).toBe('boolean');
      expect(typeof d.features.twoFactor).toBe('boolean');
      expect(typeof d.features.apiAccess).toBe('boolean');
      expect(typeof d.features.customDomain).toBe('boolean');
      expect(typeof d.features.whiteLabel).toBe('boolean');
      expect(typeof d.features.advancedAnalytics).toBe('boolean');

      expect(typeof d.security.passwordMinLength).toBe('number');
      expect(typeof d.security.maxLoginAttempts).toBe('number');
      expect(typeof d.security.sessionTimeoutMinutes).toBe('number');

      expect(typeof d.email.smtpHost).toBe('string');
      expect(typeof d.email.smtpPort).toBe('number');
      expect(typeof d.email.fromEmail).toBe('string');
    });

    it('never returns a secret value', async () => {
      const res = await request('GET', '/admin/config', superAdminToken);
      const raw = await res.text();
      expect(raw).not.toContain('SENDGRID_API_KEY');
      expect(raw).not.toContain(testEnv.JWT_SECRET ?? '__no_secret__');
    });
  });

  // ── Audit Logs ───────────────────────────────────────────────────

  describe('GET /admin/audit-logs', () => {
    beforeAll(async () => {
      await testEnv.MASTER_DB.prepare(
        `INSERT OR REPLACE INTO super_admin_audit_log
           (id, admin_id, action, entity_type, entity_id, details, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          '01960000-0000-7000-8000-0000000000e1',
          '01960000-0000-7000-8000-0000000000f1',
          'update',
          'tenant',
          TENANT_ID,
          JSON.stringify({ name: 'E2E Tenant', status: 'success' }),
          '203.0.113.7',
          'vitest',
          new Date().toISOString(),
        )
        .run();
    });

    it('returns a paginated audit trail in the table shape', async () => {
      const res = await request('GET', '/admin/audit-logs?page=1&limit=20', superAdminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();

      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);

      const log = body.data.find((l: any) => l.id === '01960000-0000-7000-8000-0000000000e1');
      expect(log).toBeDefined();
      expect(log.action).toBe('update');
      expect(log.resourceType).toBe('tenant');
      expect(log.resourceId).toBe(TENANT_ID);
      expect(log.resourceName).toBe('E2E Tenant');
      expect(log.userName).toBe('E2E Super Admin');
      expect(log.ipAddress).toBe('203.0.113.7');
      expect(['success', 'failure']).toContain(log.status);
      expect(typeof log.timestamp).toBe('string');
    });

    it('filters by action', async () => {
      const res = await request('GET', '/admin/audit-logs?action=update', superAdminToken);
      const body: any = await res.json();
      expect(body.data.length).toBeGreaterThan(0);
      for (const log of body.data) {
        expect(log.action.toLowerCase()).toContain('update');
      }
    });

    it('filters by search term', async () => {
      const res = await request('GET', '/admin/audit-logs?search=zzzznomatch', superAdminToken);
      const body: any = await res.json();
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });
  });

  // ── Read-only guarantee ──────────────────────────────────────────

  describe('Read-only surface', () => {
    it('does not expose mutations on the admin mount', async () => {
      for (const method of ['PUT', 'PATCH', 'DELETE']) {
        const res = await request(method, '/admin/tenants', superAdminToken);
        expect(res.status, `${method} /admin/tenants should not succeed`).toBe(404);
      }
    });

    it('only provisioning (R104) writes: POST /admin/tenants validates its body and creates nothing from an empty one', async () => {
      const res = await request('POST', '/admin/tenants', superAdminToken);
      expect(res.status).toBe(400);
    });
  });
});
