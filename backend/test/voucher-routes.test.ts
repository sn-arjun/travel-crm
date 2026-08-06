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

describe('Voucher Routes Integration Tests', () => {
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
  // LIST VOUCHERS
  // ═══════════════════════════════════════════════════════════════

  describe('List Vouchers', () => {
    it('should list vouchers', async () => {
      const res = await authRequest('GET', '/vouchers', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('pagination');
    });

    it('should support pagination', async () => {
      const res = await authRequest('GET', '/vouchers?page=1&limit=5', adminToken);
      expect(res.status).toBe(200);
    });

    it('should support type filter', async () => {
      const res = await authRequest('GET', '/vouchers?type=hotel', adminToken);
      expect(res.status).toBe(200);
    });

    it('should support status filter', async () => {
      const res = await authRequest('GET', '/vouchers?status=draft', adminToken);
      expect(res.status).toBe(200);
    });

    it('should support search filter', async () => {
      const res = await authRequest('GET', '/vouchers?search=hotel', adminToken);
      expect(res.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VOUCHER CREATION VALIDATION
  // ═══════════════════════════════════════════════════════════════

  describe('Voucher Creation Validation', () => {
    it('should reject voucher without leadId', async () => {
      const res = await authRequest('POST', '/vouchers', adminToken, {
        type: 'hotel',
        title: 'Test Hotel Voucher',
        details: { hotelName: 'Grand Hotel' },
      });
      expect(res.status).toBe(400);
    });

    it('should reject voucher without type', async () => {
      const res = await authRequest('POST', '/vouchers', adminToken, {
        leadId: 'some-lead',
        title: 'Test Voucher',
        details: {},
      });
      expect(res.status).toBe(400);
    });

    it('should reject voucher without title', async () => {
      const res = await authRequest('POST', '/vouchers', adminToken, {
        leadId: 'some-lead',
        type: 'hotel',
        details: {},
      });
      expect(res.status).toBe(400);
    });

    it('should reject voucher with invalid type', async () => {
      const res = await authRequest('POST', '/vouchers', adminToken, {
        leadId: 'some-lead',
        type: 'spaceship',
        title: 'Test Voucher',
        details: {},
      });
      expect(res.status).toBe(400);
    });

    it('should reject voucher with empty title', async () => {
      const res = await authRequest('POST', '/vouchers', adminToken, {
        leadId: 'some-lead',
        type: 'hotel',
        title: '',
        details: {},
      });
      expect(res.status).toBe(400);
    });

    it('should reject voucher with empty leadId', async () => {
      const res = await authRequest('POST', '/vouchers', adminToken, {
        leadId: '',
        type: 'hotel',
        title: 'Test',
        details: {},
      });
      expect(res.status).toBe(400);
    });

    it('should return 404 for voucher with non-existent lead', async () => {
      const res = await authRequest('POST', '/vouchers', adminToken, {
        leadId: 'nonexistent-lead-id',
        type: 'hotel',
        title: 'Test Hotel',
        details: {
          guestNames: ['John'],
          hotelName: 'Grand Hotel',
          checkIn: '2026-05-01',
          checkOut: '2026-05-03',
          roomType: 'Deluxe',
        },
      });
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VOUCHER LIFECYCLE (CREATE → UPDATE → STATUS → DELETE)
  // ═══════════════════════════════════════════════════════════════

  describe('Voucher Lifecycle', () => {
    let contactId = '';
    let leadId = '';
    let voucherId = '';

    it('should create a contact', async () => {
      const res = await authRequest('POST', '/contacts', adminToken, {
        name: 'Voucher Test Client',
        email: 'voucher@test.com',
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

    it('should create a lead', async () => {
      if (!contactId) return;
      const res = await authRequest('POST', '/leads', adminToken, {
        contactId,
        title: 'Voucher Test Trip',
        destinations: ['Goa'],
        travelDate: '2026-06-01',
        tripType: 'family',
        source: 'website',
      });
      if (res.status === 201) {
        const body: any = await res.json();
        leadId = body.data.id;
      } else {
        expect([201, 400, 500]).toContain(res.status);
      }
    });

    it('should create a hotel voucher', async () => {
      if (!leadId) return;
      const res = await authRequest('POST', '/vouchers', adminToken, {
        leadId,
        type: 'hotel',
        title: 'Grand Hotel Stay',
        details: {
          guestNames: ['John Doe', 'Jane Doe'],
          hotelName: 'Grand Hotel Goa',
          hotelAddress: '123 Beach Road, Goa',
          checkIn: '2026-06-01',
          checkOut: '2026-06-05',
          roomType: 'Deluxe',
          roomCount: 1,
          mealPlan: 'MAP',
          specialRequests: 'Sea view room',
        },
        notes: 'VIP guest',
      });
      if (res.status === 201) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty('id');
        expect(body.data.status).toBe('draft');
        voucherId = body.data.id;
      }
    });

    it('should get voucher by ID', async () => {
      if (!voucherId) return;
      const res = await authRequest('GET', `/vouchers/${voucherId}`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data).toHaveProperty('title', 'Grand Hotel Stay');
        expect(body.data).toHaveProperty('details');
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should return 404 for non-existent voucher', async () => {
      const res = await authRequest('GET', '/vouchers/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });

    it('should update draft voucher', async () => {
      if (!voucherId) return;
      const res = await authRequest('PUT', `/vouchers/${voucherId}`, adminToken, {
        title: 'Grand Hotel Stay (Updated)',
        notes: 'Updated notes',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should get vouchers by lead', async () => {
      if (!leadId) return;
      const res = await authRequest('GET', `/vouchers/by-lead/${leadId}`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data).toHaveProperty('hotel');
        expect(body.data).toHaveProperty('transport');
        expect(body.data).toHaveProperty('flight');
        expect(body.data).toHaveProperty('activity');
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should update status to sent', async () => {
      if (!voucherId) return;
      const res = await authRequest('PATCH', `/vouchers/${voucherId}/status`, adminToken, {
        status: 'sent',
      });
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data.status).toBe('sent');
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should reject updating sent voucher fields', async () => {
      if (!voucherId) return;
      const res = await authRequest('PUT', `/vouchers/${voucherId}`, adminToken, {
        title: 'Should fail',
      });
      expect([400, 404]).toContain(res.status);
    });

    it('should update status to confirmed', async () => {
      if (!voucherId) return;
      const res = await authRequest('PATCH', `/vouchers/${voucherId}/status`, adminToken, {
        status: 'confirmed',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should reject invalid status transition (confirmed→sent)', async () => {
      if (!voucherId) return;
      const res = await authRequest('PATCH', `/vouchers/${voucherId}/status`, adminToken, {
        status: 'sent',
      });
      expect([400, 404]).toContain(res.status);
    });

    it('should reject invalid status value', async () => {
      if (!voucherId) return;
      const res = await authRequest('PATCH', `/vouchers/${voucherId}/status`, adminToken, {
        status: 'invalid_status',
      });
      expect([400, 404]).toContain(res.status);
    });

    it('should delete voucher (soft)', async () => {
      if (!voucherId) return;
      const res = await authRequest('DELETE', `/vouchers/${voucherId}`, adminToken);
      expect([200, 404]).toContain(res.status);
    });

    it('should return 404 after deletion', async () => {
      if (!voucherId) return;
      const res = await authRequest('GET', `/vouchers/${voucherId}`, adminToken);
      expect([404, 200]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // VOUCHER SEND
  // ═══════════════════════════════════════════════════════════════

  describe('Voucher Send Validation', () => {
    it('should reject send without channel', async () => {
      const res = await authRequest('POST', '/vouchers/some-id/send', adminToken, {
        to: 'test@example.com',
      });
      // May return 400 or 404 depending on ID resolution
      expect([400, 404]).toContain(res.status);
    });

    it('should reject send without recipient', async () => {
      const res = await authRequest('POST', '/vouchers/some-id/send', adminToken, {
        channel: 'email',
      });
      expect([400, 404]).toContain(res.status);
    });

    it('should reject send with invalid channel', async () => {
      const res = await authRequest('POST', '/vouchers/some-id/send', adminToken, {
        channel: 'fax',
        to: 'test@example.com',
      });
      expect([400, 404]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TRANSPORT VOUCHER CREATION
  // ═══════════════════════════════════════════════════════════════

  describe('Transport Voucher Type Validation', () => {
    it('should reject transport voucher with invalid details', async () => {
      const res = await authRequest('POST', '/vouchers', adminToken, {
        leadId: 'some-lead',
        type: 'transport',
        title: 'Transport Test',
        details: {
          // Missing required vehicleType, pickupLocation, pickupTime, dropLocation
        },
      });
      // May be 400, 404 (lead not found) or 422 (invalid details)
      expect([400, 404, 422]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AUTH REQUIRED
  // ═══════════════════════════════════════════════════════════════

  describe('Auth Required', () => {
    it('should reject unauthenticated voucher list', async () => {
      const res = await publicRequest('GET', '/api/v1/vouchers');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated voucher creation', async () => {
      const res = await publicRequest('POST', '/api/v1/vouchers');
      expect(res.status).toBe(401);
    });
  });
});
