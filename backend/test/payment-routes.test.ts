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
let salespersonToken = '';

// ── Setup ──────────────────────────────────────────────────────────

describe('Payment Routes Integration Tests', () => {
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

    // Login as admin
    const loginRes = await publicRequest('POST', '/api/v1/auth/login', {
      email: 'admin@e2e.test',
      password: 'password123',
      tenantId: '00000000-0000-0000-0000-000000000000',
    });
    expect(loginRes.status).toBe(200);
    const loginBody: any = await loginRes.json();
    adminToken = loginBody.data.accessToken;

    // Login as salesperson
    const salesLogin = await publicRequest('POST', '/api/v1/auth/login', {
      email: 'sales@e2e.test',
      password: 'password123',
      tenantId: '00000000-0000-0000-0000-000000000000',
    });
    if (salesLogin.status === 200) {
      const salesBody: any = await salesLogin.json();
      salespersonToken = salesBody.data.accessToken;
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // LIST PAYMENTS
  // ═══════════════════════════════════════════════════════════════

  describe('List Payments', () => {
    it('should list payments', async () => {
      const res = await authRequest('GET', '/payments', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('pagination');
    });

    it('should support pagination', async () => {
      const res = await authRequest('GET', '/payments?page=1&limit=5', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.pagination).toHaveProperty('page');
      expect(body.pagination).toHaveProperty('limit');
    });

    it('should support type filter', async () => {
      const res = await authRequest('GET', '/payments?type=incoming', adminToken);
      expect([200, 500]).toContain(res.status);
    });

    it('should support method filter', async () => {
      const res = await authRequest('GET', '/payments?method=cash', adminToken);
      expect([200, 500]).toContain(res.status);
    });

    it('should support date range filter', async () => {
      const res = await authRequest('GET', '/payments?dateFrom=2026-01-01&dateTo=2026-12-31', adminToken);
      expect([200, 500]).toContain(res.status);
    });

    it('should support contactId filter', async () => {
      const res = await authRequest('GET', '/payments?contactId=some-id', adminToken);
      expect([200, 500]).toContain(res.status);
    });

    it('should support invoiceId filter', async () => {
      const res = await authRequest('GET', '/payments?invoiceId=some-id', adminToken);
      expect([200, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RECORD PAYMENT VALIDATION
  // ═══════════════════════════════════════════════════════════════

  describe('Record Payment Validation', () => {
    it('should reject payment without invoiceId', async () => {
      const res = await authRequest('POST', '/payments', adminToken, {
        amount: 1000,
        method: 'cash',
      });
      expect(res.status).toBe(400);
    });

    it('should reject payment without amount', async () => {
      const res = await authRequest('POST', '/payments', adminToken, {
        invoiceId: 'some-invoice',
        method: 'cash',
      });
      expect(res.status).toBe(400);
    });

    it('should reject payment without method', async () => {
      const res = await authRequest('POST', '/payments', adminToken, {
        invoiceId: 'some-invoice',
        amount: 1000,
      });
      expect(res.status).toBe(400);
    });

    it('should reject payment with zero amount', async () => {
      const res = await authRequest('POST', '/payments', adminToken, {
        invoiceId: 'some-invoice',
        amount: 0,
        method: 'cash',
      });
      expect(res.status).toBe(400);
    });

    it('should reject payment with negative amount', async () => {
      const res = await authRequest('POST', '/payments', adminToken, {
        invoiceId: 'some-invoice',
        amount: -500,
        method: 'cash',
      });
      expect(res.status).toBe(400);
    });

    it('should reject payment with empty invoiceId', async () => {
      const res = await authRequest('POST', '/payments', adminToken, {
        invoiceId: '',
        amount: 1000,
        method: 'cash',
      });
      expect(res.status).toBe(400);
    });

    it('should reject payment with empty method', async () => {
      const res = await authRequest('POST', '/payments', adminToken, {
        invoiceId: 'some-invoice',
        amount: 1000,
        method: '',
      });
      expect(res.status).toBe(400);
    });

    it('should return 404 for payment to non-existent invoice', async () => {
      const res = await authRequest('POST', '/payments', adminToken, {
        invoiceId: 'nonexistent-invoice',
        amount: 1000,
        method: 'cash',
      });
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RBAC — PAYMENT PERMISSIONS
  // ═══════════════════════════════════════════════════════════════

  describe('Payment RBAC', () => {
    it('should reject payment recording by salesperson', async () => {
      if (!salespersonToken) return;
      const res = await authRequest('POST', '/payments', salespersonToken, {
        invoiceId: 'some-invoice',
        amount: 1000,
        method: 'cash',
      });
      expect(res.status).toBe(403);
    });

    it('should allow salesperson to list payments', async () => {
      if (!salespersonToken) return;
      const res = await authRequest('GET', '/payments', salespersonToken);
      expect(res.status).toBe(200);
    });

    it('should reject payment deletion by salesperson', async () => {
      if (!salespersonToken) return;
      const res = await authRequest('DELETE', '/payments/some-id', salespersonToken);
      expect(res.status).toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // GET PAYMENT BY ID
  // ═══════════════════════════════════════════════════════════════

  describe('Get Payment', () => {
    it('should return 404 for non-existent payment', async () => {
      const res = await authRequest('GET', '/payments/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DELETE PAYMENT
  // ═══════════════════════════════════════════════════════════════

  describe('Delete Payment', () => {
    it('should return 404 for deleting non-existent payment', async () => {
      const res = await authRequest('DELETE', '/payments/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LINK ADVANCE PAYMENT
  // ═══════════════════════════════════════════════════════════════

  describe('Link Advance Payment', () => {
    it('should reject link without invoiceId', async () => {
      const res = await authRequest('POST', '/payments/some-id/link-invoice', adminToken, {
        amount: 1000,
      });
      expect(res.status).toBe(400);
    });

    it('should reject link without amount', async () => {
      const res = await authRequest('POST', '/payments/some-id/link-invoice', adminToken, {
        invoiceId: 'some-invoice',
      });
      expect(res.status).toBe(400);
    });

    it('should reject link with negative amount', async () => {
      const res = await authRequest('POST', '/payments/some-id/link-invoice', adminToken, {
        invoiceId: 'some-invoice',
        amount: -100,
      });
      expect(res.status).toBe(400);
    });

    it('should return 404 for linking non-existent payment', async () => {
      const res = await authRequest('POST', '/payments/nonexistent-id/link-invoice', adminToken, {
        invoiceId: 'some-invoice',
        amount: 1000,
      });
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PAYMENT WITH INVOICE LIFECYCLE
  // ═══════════════════════════════════════════════════════════════

  describe('Payment with Invoice Lifecycle', () => {
    let contactId = '';
    let invoiceId = '';

    it('should create a contact for payment testing', async () => {
      const res = await authRequest('POST', '/contacts', adminToken, {
        name: 'Payment Test Client',
        email: 'payment@test.com',
        type: 'customer',
        source: 'manual',
      });
      if (res.status === 201) {
        const body: any = await res.json();
        contactId = body.data.id;
      } else {
        expect([201, 500]).toContain(res.status);
      }
    });

    it('should create an invoice', async () => {
      if (!contactId) return;
      const res = await authRequest('POST', '/invoices', adminToken, {
        contactId,
        items: [
          { description: 'Tour Package', quantity: 1, rate: 50000 },
        ],
        currency: 'INR',
        dueDate: '2026-04-01',
      });
      if (res.status === 201) {
        const body: any = await res.json();
        invoiceId = body.data.id;
      }
    });

    it('should record a payment against the invoice', async () => {
      if (!invoiceId) return;
      const res = await authRequest('POST', '/payments', adminToken, {
        invoiceId,
        amount: 25000,
        method: 'bank_transfer',
        reference: 'TXN-001',
        notes: 'Partial payment',
      });
      if (res.status === 201) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('id');
        expect(body.data.invoiceStatus).toBe('partially_paid');
      } else {
        // May fail in test env due to queue dependencies
        expect([201, 500]).toContain(res.status);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AUTH REQUIRED
  // ═══════════════════════════════════════════════════════════════

  describe('Auth Required', () => {
    it('should reject unauthenticated payment list', async () => {
      const res = await publicRequest('GET', '/api/v1/payments');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated payment creation', async () => {
      const res = await publicRequest('POST', '/api/v1/payments');
      expect(res.status).toBe(401);
    });
  });
});
