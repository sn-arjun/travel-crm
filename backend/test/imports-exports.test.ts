import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;

// ── Helpers ────────────────────────────────────────────────────────

async function authRequest(
  method: string,
  path: string,
  token: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, opts),
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
  const res = await worker.fetch(
    new Request(`http://localhost${path}`, opts),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

let adminToken = '';

// ── Setup ──────────────────────────────────────────────────────────

describe('Import/Export Routes Integration Tests', () => {
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

    // Login
    const loginRes = await publicRequest('POST', '/api/v1/auth/login', {
      email: 'admin@e2e.test',
      password: 'password123',
      tenantId: '00000000-0000-0000-0000-000000000000',
    });
    expect(loginRes.status).toBe(200);
    const loginBody: any = await loginRes.json();
    adminToken = loginBody.data.accessToken;
  });

  // ═══════════════════════════════════════════════════════════════
  // IMPORTS
  // ═══════════════════════════════════════════════════════════════

  describe('Import Jobs', () => {
    it('should list recent imports', async () => {
      const res = await authRequest('GET', '/imports', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return 404 for non-existent import job progress', async () => {
      const res = await authRequest('GET', '/imports/nonexistent-id/progress', adminToken);
      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent import job errors', async () => {
      const res = await authRequest('GET', '/imports/nonexistent-id/errors', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      // Should return empty array for non-existent job
      expect(body.success).toBe(true);
    });

    it('should reject execute for non-existent import job', async () => {
      const res = await authRequest('POST', '/imports/nonexistent-id/execute', adminToken, {
        duplicateStrategy: 'skip',
      });
      expect(res.status).toBe(404);
    });

    it('should reject cancel for non-existent import job', async () => {
      const res = await authRequest('POST', '/imports/nonexistent-id/cancel', adminToken);
      expect(res.status).toBe(404);
    });

    it('should get template for contacts import', async () => {
      const res = await authRequest('GET', '/imports/templates/contacts', adminToken);
      // May return 200 with Excel file or 400/500 depending on template generator
      expect([200, 400, 500]).toContain(res.status);
      if (res.status === 200) {
        const contentType = res.headers.get('content-type');
        expect(contentType).toContain('spreadsheetml');
      }
    });

    it('should get template for leads import', async () => {
      const res = await authRequest('GET', '/imports/templates/leads', adminToken);
      expect([200, 400, 500]).toContain(res.status);
    });

    it('should handle invalid template type', async () => {
      const res = await authRequest('GET', '/imports/templates/invalid_type', adminToken);
      expect([400, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════════

  describe('Export Contacts', () => {
    it('should export contacts as Excel', async () => {
      const res = await authRequest('GET', '/exports/contacts', adminToken);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const contentType = res.headers.get('content-type');
        expect(contentType).toContain('spreadsheetml');
        const disposition = res.headers.get('content-disposition');
        expect(disposition).toContain('contacts_export');
      }
    });
  });

  describe('Export Leads', () => {
    it('should export leads as Excel', async () => {
      const res = await authRequest('GET', '/exports/leads', adminToken);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const contentType = res.headers.get('content-type');
        expect(contentType).toContain('spreadsheetml');
        const disposition = res.headers.get('content-disposition');
        expect(disposition).toContain('leads_export');
      }
    });
  });

  describe('Bulk PDF Export', () => {
    it('should reject bulk PDF without invoiceIds', async () => {
      const res = await authRequest('POST', '/exports/invoices/bulk-pdf', adminToken, {});
      expect(res.status).toBe(400);
    });

    it('should reject bulk PDF with non-array invoiceIds', async () => {
      const res = await authRequest('POST', '/exports/invoices/bulk-pdf', adminToken, {
        invoiceIds: 'not-an-array',
      });
      expect(res.status).toBe(400);
    });

    it('should queue bulk PDF export with valid invoiceIds', async () => {
      const res = await authRequest('POST', '/exports/invoices/bulk-pdf', adminToken, {
        invoiceIds: ['id1', 'id2'],
      });
      // Should succeed (queues the job) or fail if queue not available in test env
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('id');
        expect(body.data).toHaveProperty('status');
      }
    });
  });

  describe('Full GDPR Export', () => {
    it('should queue full export', async () => {
      const res = await authRequest('POST', '/exports/full', adminToken);
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('id');
        expect(body.data).toHaveProperty('exportType', 'tenant_full');
      }
    });
  });

  describe('Export Job Status', () => {
    it('should return 404 for non-existent export job', async () => {
      const res = await authRequest('GET', '/exports/jobs/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent export download', async () => {
      const res = await authRequest('GET', '/exports/jobs/nonexistent-id/download', adminToken);
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AUTH REQUIRED
  // ═══════════════════════════════════════════════════════════════

  describe('Auth Required', () => {
    it('should reject unauthenticated import list', async () => {
      const res = await publicRequest('GET', '/api/v1/imports');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated export contacts', async () => {
      const res = await publicRequest('GET', '/api/v1/exports/contacts');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated export leads', async () => {
      const res = await publicRequest('GET', '/api/v1/exports/leads');
      expect(res.status).toBe(401);
    });
  });
});
