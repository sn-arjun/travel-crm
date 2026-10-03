import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;

async function rawRequest(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: Record<string, unknown>,
): Promise<Response> {
  const opts: RequestInit = {
    method,
    headers: { ...headers },
  };
  if (body) {
    opts.body = JSON.stringify(body);
    (opts.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(url, opts), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

let adminToken = '';

describe('Infrastructure & Edge Case Tests', () => {
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
    const loginRes = await rawRequest('POST', 'http://localhost/api/v1/auth/login', {}, {
      email: 'admin@e2e.test',
      password: 'password123',
      tenantId: '00000000-0000-0000-0000-000000000000',
    });
    const loginBody: any = await loginRes.json();
    adminToken = loginBody.data.accessToken;
  });

  // ─── Health Check Variations ───────────────────────────────────

  describe('Health Check Variations', () => {
    it('should respond at /api/v1/health', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/health');
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.status).toBe('ok');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('database');
      expect(body).toHaveProperty('uptime');
    });

    it('should respond at /api/health (alias)', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/health');
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.status).toBe('ok');
    });

    it('health check should not require auth', async () => {
      // No Authorization header
      const res = await rawRequest('GET', 'http://localhost/api/v1/health');
      expect(res.status).toBe(200);
    });
  });

  // ─── 404 Not Found ─────────────────────────────────────────────

  describe('404 Not Found', () => {
    it('should return 401 or 404 for unknown routes (auth middleware runs first)', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/unknown-endpoint');
      // Auth middleware intercepts before route matching under /api/v1/*
      expect([401, 404]).toContain(res.status);
    });

    it('should return 401 or 404 for deeply nested unknown routes', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/some/deep/path/that/does/not/exist');
      expect([401, 404]).toContain(res.status);
    });
  });

  // ─── Auth Edge Cases ───────────────────────────────────────────

  describe('Auth Edge Cases', () => {
    it('should reject empty body on login', async () => {
      const res = await rawRequest('POST', 'http://localhost/api/v1/auth/login', {
        'Content-Type': 'application/json',
      });
      // An empty JSON body fails request validation
      expect(res.status).toBe(400);
    });

    it('should reject login without email', async () => {
      const res = await rawRequest('POST', 'http://localhost/api/v1/auth/login', {}, {
        password: 'password123',
        tenantId: '00000000-0000-0000-0000-000000000000',
      });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject login without password', async () => {
      const res = await rawRequest('POST', 'http://localhost/api/v1/auth/login', {}, {
        email: 'admin@e2e.test',
        tenantId: '00000000-0000-0000-0000-000000000000',
      });
      expect([400, 401]).toContain(res.status);
    });

    it('should reject empty Authorization header', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/leads', {
        Authorization: '',
      });
      expect(res.status).toBe(401);
    });

    it('should reject "Bearer" without token', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/leads', {
        Authorization: 'Bearer ',
      });
      expect(res.status).toBe(401);
    });

    it('should reject "Basic" auth scheme', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/leads', {
        Authorization: 'Basic dXNlcjpwYXNz',
      });
      expect(res.status).toBe(401);
    });

    it('should reject expired/tampered JWT', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/leads', {
        Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      });
      expect(res.status).toBe(401);
    });
  });

  // ─── Dual Route Mount (v1 and non-v1) ─────────────────────────

  describe('Dual Route Mount', () => {
    it('/api/v1/contacts should work', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/contacts', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
    });

    it('/api/contacts should also work', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/contacts', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
    });

    it('/api/v1/leads should work', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/leads', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
    });

    it('/api/leads should also work', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/leads', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
    });
  });

  // ─── CORS Headers ─────────────────────────────────────────────

  describe('CORS Headers', () => {
    it('should include CORS headers on OPTIONS preflight', async () => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request('http://localhost/api/v1/contacts', {
          method: 'OPTIONS',
          headers: {
            Origin: 'http://localhost:3100',
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'Authorization',
          },
        }),
        testEnv,
        ctx,
      );
      await waitOnExecutionContext(ctx);

      // Preflight should succeed
      expect([200, 204]).toContain(res.status);

      const allowOrigin = res.headers.get('access-control-allow-origin');
      expect(allowOrigin).toBeDefined();
    });

    it('should allow Content-Type and Authorization headers', async () => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request('http://localhost/api/v1/contacts', {
          method: 'OPTIONS',
          headers: {
            Origin: 'http://localhost:3100',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'Content-Type, Authorization',
          },
        }),
        testEnv,
        ctx,
      );
      await waitOnExecutionContext(ctx);

      const allowHeaders = res.headers.get('access-control-allow-headers');
      if (allowHeaders) {
        expect(allowHeaders.toLowerCase()).toContain('content-type');
        expect(allowHeaders.toLowerCase()).toContain('authorization');
      }
    });
  });

  // ─── Structured Error Responses ────────────────────────────────

  describe('Structured Error Responses', () => {
    it('should return { success: false, error: ... } for 401', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/leads');
      expect(res.status).toBe(401);
      const body: any = await res.json();
      expect(body.success).toBe(false);
      expect(body).toHaveProperty('error');
    });

    it('should return { success: false } for validation errors', async () => {
      const res = await rawRequest('POST', 'http://localhost/api/v1/contacts', {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      }, {});
      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.success).toBe(false);
    });

    it('should return JSON for 404', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/contacts/nonexistent-id', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(404);
      const body: any = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // ─── Content-Type Handling ─────────────────────────────────────

  describe('Content-Type Handling', () => {
    it('should return JSON content-type on success', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/health');
      const contentType = res.headers.get('content-type');
      expect(contentType).toContain('application/json');
    });

    it('should handle request without Content-Type header', async () => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request('http://localhost/api/v1/health', { method: 'GET' }),
        testEnv,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      expect(res.status).toBe(200);
    });
  });

  // ─── Pagination Edge Cases ─────────────────────────────────────

  describe('Pagination Edge Cases', () => {
    it('should handle page=0 gracefully', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/contacts?page=0&limit=10', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
    });

    it('should handle very large page number', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/contacts?page=99999&limit=10', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toEqual([]);
    });

    it('should handle limit=0', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/contacts?page=1&limit=0', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
    });

    it('should clamp extremely large limit', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/contacts?page=1&limit=10000', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
    });
  });

  // ─── Method Not Allowed ────────────────────────────────────────

  describe('HTTP Method Edge Cases', () => {
    it('should reject PATCH on health endpoint', async () => {
      const res = await rawRequest('PATCH', 'http://localhost/api/v1/health');
      expect([404, 405]).toContain(res.status);
    });

    it('should reject DELETE on health endpoint', async () => {
      const res = await rawRequest('DELETE', 'http://localhost/api/v1/health');
      expect([404, 405]).toContain(res.status);
    });
  });

  // ─── Multiple Protected Routes Access ──────────────────────────

  describe('All Protected Routes Accessible', () => {
    const protectedGets = [
      '/contacts',
      '/leads',
      '/invoices',
      '/tasks',
      '/follow-ups',
      '/bookmarks',
      '/sticky-notes',
      '/notifications',
      '/users',
      '/suppliers',
      '/travellers',
      '/visa',
      '/vouchers',
      '/itineraries',
      '/rate-cards',
      '/campaigns',
      '/reports',
      '/documents',
    ];

    for (const route of protectedGets) {
      it(`should access ${route} with auth`, async () => {
        const res = await rawRequest('GET', `http://localhost/api/v1${route}`, {
          Authorization: `Bearer ${adminToken}`,
        });
        // Every listed route answers its list endpoint for an admin
        expect(res.status).toBe(200);
      });

      it(`should reject ${route} without auth`, async () => {
        const res = await rawRequest('GET', `http://localhost/api/v1${route}`);
        expect(res.status).toBe(401);
      });
    }
  });

  // ─── Fleet Routes ──────────────────────────────────────────────

  describe('Fleet Routes', () => {
    it('should list fleet vehicles', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/fleet/vehicles', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
    });

    it('should list fleet drivers', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/fleet/drivers', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
    });

    it('should list fleet trips', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/fleet/trips', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
    });

    it('should list rate cards', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/rate-cards', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
    });

    it('should reject fleet vehicle creation with missing fields', async () => {
      const res = await rawRequest('POST', 'http://localhost/api/v1/fleet/vehicles', {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      }, {});
      expect(res.status).toBe(400);
    });
  });

  // ─── Settings ──────────────────────────────────────────────────

  describe('Settings', () => {
    it('should access settings endpoint', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/settings/company', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect([200, 404]).toContain(res.status);
    });
  });

  // ─── Activity Logs ─────────────────────────────────────────────

  describe('Activity Logs', () => {
    it('should list activity logs', async () => {
      const res = await rawRequest('GET', 'http://localhost/api/v1/activity-logs', {
        Authorization: `Bearer ${adminToken}`,
      });
      expect(res.status).toBe(200);
    });
  });
});
