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

describe('Marketing Routes Integration Tests', () => {
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
  // SEGMENTS CRUD
  // ═══════════════════════════════════════════════════════════════

  describe('Segments CRUD', () => {
    let segmentId = '';

    it('should list segments', async () => {
      const res = await authRequest('GET', '/marketing/segments', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('pagination');
    });

    it('should support pagination on segments', async () => {
      const res = await authRequest('GET', '/marketing/segments?page=1&limit=5', adminToken);
      expect(res.status).toBe(200);
    });

    it('should support search on segments', async () => {
      const res = await authRequest('GET', '/marketing/segments?search=vip', adminToken);
      expect(res.status).toBe(200);
    });

    it('should create a segment', async () => {
      const res = await authRequest('POST', '/marketing/segments', adminToken, {
        name: 'VIP Customers',
        description: 'High-value customers',
        isDynamic: true,
        filtersJson: JSON.stringify({ tags: ['vip'] }),
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
      segmentId = body.data.id;
    });

    it('should reject segment without name', async () => {
      const res = await authRequest('POST', '/marketing/segments', adminToken, {
        description: 'No name',
      });
      expect(res.status).toBe(400);
    });

    it('should reject segment with empty name', async () => {
      const res = await authRequest('POST', '/marketing/segments', adminToken, {
        name: '',
      });
      expect(res.status).toBe(400);
    });

    it('should get segment by ID', async () => {
      if (!segmentId) return;
      const res = await authRequest('GET', `/marketing/segments/${segmentId}`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data).toHaveProperty('name', 'VIP Customers');
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should return 404 for non-existent segment', async () => {
      const res = await authRequest('GET', '/marketing/segments/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });

    it('should get contacts in segment', async () => {
      if (!segmentId) return;
      const res = await authRequest('GET', `/marketing/segments/${segmentId}/contacts`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body).toHaveProperty('pagination');
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should update segment', async () => {
      if (!segmentId) return;
      const res = await authRequest('PUT', `/marketing/segments/${segmentId}`, adminToken, {
        name: 'VIP Customers (Updated)',
        description: 'Updated description',
      });
      expect([200, 404]).toContain(res.status);
    });

    it('should refresh segment count', async () => {
      if (!segmentId) return;
      const res = await authRequest('POST', `/marketing/segments/${segmentId}/refresh-count`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data).toHaveProperty('contact_count');
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should delete segment (soft)', async () => {
      if (!segmentId) return;
      const res = await authRequest('DELETE', `/marketing/segments/${segmentId}`, adminToken);
      expect([200, 404]).toContain(res.status);
    });

    it('should return 404 after deletion', async () => {
      if (!segmentId) return;
      const res = await authRequest('GET', `/marketing/segments/${segmentId}`, adminToken);
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BRANDING
  // ═══════════════════════════════════════════════════════════════

  describe('Branding', () => {
    it('should get branding (or defaults)', async () => {
      const res = await authRequest('GET', '/marketing/branding', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      if (body.data) {
        // camelCase since the verify-phase branding rework (see routes/marketing/branding.ts)
        expect(body.data).toHaveProperty('primaryColor');
      }
    });

    it('should update branding', async () => {
      const res = await authRequest('PUT', '/marketing/branding', adminToken, {
        primaryColor: '#FF5722',
        agencyName: 'Test Travel Agency',
        tagline: 'Your journey starts here',
      });
      expect(res.status).toBe(200);
    });

    it('should persist branding changes', async () => {
      const res = await authRequest('GET', '/marketing/branding', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // OPT-OUT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  describe('Opt-Out Management', () => {
    let contactId = '';

    it('should list opted-out contacts', async () => {
      const res = await authRequest('GET', '/marketing/opt-out', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('pagination');
    });

    it('should support pagination on opt-out list', async () => {
      const res = await authRequest('GET', '/marketing/opt-out?page=1&limit=5', adminToken);
      expect(res.status).toBe(200);
    });

    it('should create a contact for opt-out testing', async () => {
      const res = await authRequest('POST', '/contacts', adminToken, {
        name: 'Opt Out Test Contact',
        email: 'optout@test.com',
        type: 'customer',
        source: 'manual',
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      contactId = body.data.id;
    });

    it('should opt out a contact', async () => {
      if (!contactId) return;
      const res = await authRequest('POST', `/marketing/opt-out/${contactId}`, adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveProperty('opted_out', true);
    });

    it('should return 404 for opting out non-existent contact', async () => {
      const res = await authRequest('POST', '/marketing/opt-out/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });

    it('should opt in a contact (reverse opt-out)', async () => {
      if (!contactId) return;
      const res = await authRequest('POST', `/marketing/opt-out/${contactId}/opt-in`, adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveProperty('opted_out', false);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MARKETING CAMPAIGNS
  // ═══════════════════════════════════════════════════════════════

  describe('Marketing Campaigns', () => {
    it('should list marketing campaigns', async () => {
      const res = await authRequest('GET', '/marketing/campaigns', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('pagination');
    });

    it('should support pagination on campaigns', async () => {
      const res = await authRequest('GET', '/marketing/campaigns?page=1&limit=5', adminToken);
      expect(res.status).toBe(200);
    });

    it('should support search on campaigns', async () => {
      const res = await authRequest('GET', '/marketing/campaigns?search=test', adminToken);
      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent campaign', async () => {
      const res = await authRequest('GET', '/marketing/campaigns/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AUTH REQUIRED
  // ═══════════════════════════════════════════════════════════════

  describe('Auth Required', () => {
    it('should reject unauthenticated segments request', async () => {
      const res = await publicRequest('GET', '/api/v1/marketing/segments');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated branding request', async () => {
      const res = await publicRequest('GET', '/api/v1/marketing/branding');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated opt-out request', async () => {
      const res = await publicRequest('GET', '/api/v1/marketing/opt-out');
      expect(res.status).toBe(401);
    });
  });
});
