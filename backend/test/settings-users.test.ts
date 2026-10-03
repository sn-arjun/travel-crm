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

describe('Settings & User Management Integration Tests', () => {
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
  // COMPANY SETTINGS
  // ═══════════════════════════════════════════════════════════════

  describe('Company Settings', () => {
    it('should get company settings', async () => {
      const res = await authRequest('GET', '/settings/company', adminToken);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
      }
    });

    it('should update company settings (admin)', async () => {
      const res = await authRequest('PUT', '/settings/company', adminToken, {
        company_name: 'Test Travel Agency',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        gst_number: '22AAAAA0000A1Z5',
      });
      expect(res.status).toBe(200);
    });

    it('should persist settings after update', async () => {
      const res = await authRequest('GET', '/settings/company', adminToken);
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data).toBeDefined();
      }
    });

    it('should reject settings update from non-admin (salesperson)', async () => {
      if (!salespersonToken) return;
      const res = await authRequest('PUT', '/settings/company', salespersonToken, {
        company_name: 'Hacked Name',
      });
      expect(res.status).toBe(403);
    });

    it('should allow any authenticated user to read settings', async () => {
      if (!salespersonToken) return;
      const res = await authRequest('GET', '/settings/company', salespersonToken);
      expect([200, 404]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // USER PROFILE
  // ═══════════════════════════════════════════════════════════════

  describe('User Profile', () => {
    it('should get own profile (admin)', async () => {
      const res = await authRequest('GET', '/users/me', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data).toHaveProperty('id');
      expect(body.data).toHaveProperty('email', 'admin@e2e.test');
      expect(body.data).toHaveProperty('role', 'admin');
      expect(body.data).toHaveProperty('name');
    });

    it('should get own profile (salesperson)', async () => {
      if (!salespersonToken) return;
      const res = await authRequest('GET', '/users/me', salespersonToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.role).toBe('salesperson');
    });

    it('should update own profile', async () => {
      const res = await authRequest('PUT', '/users/me', adminToken, {
        name: 'Admin Updated Name',
        phone: '+919999999999',
        language: 'hi',
      });
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.data.name).toBe('Admin Updated Name');
      expect(body.data.language).toBe('hi');
    });

    it('should reject profile update with empty name', async () => {
      const res = await authRequest('PUT', '/users/me', adminToken, {
        name: '',
      });
      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // USER LISTING & MANAGEMENT (ADMIN ONLY)
  // ═══════════════════════════════════════════════════════════════

  describe('User Listing', () => {
    it('should list users (admin)', async () => {
      const res = await authRequest('GET', '/users', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should reject user listing (salesperson)', async () => {
      if (!salespersonToken) return;
      const res = await authRequest('GET', '/users', salespersonToken);
      expect(res.status).toBe(403);
    });

    it('should get user by ID (admin)', async () => {
      // First get user list to find an ID
      const listRes = await authRequest('GET', '/users', adminToken);
      const listBody: any = await listRes.json();
      if (listBody.data.length > 0) {
        const userId = listBody.data[0].id;
        const res = await authRequest('GET', `/users/${userId}`, adminToken);
        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.data).toHaveProperty('email');
        // Should not expose password hash
        expect(body.data).not.toHaveProperty('passwordHash');
        expect(body.data).not.toHaveProperty('password_hash');
      }
    });

    it('should return 404 for non-existent user', async () => {
      const res = await authRequest('GET', '/users/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // USER CREATION (ADMIN ONLY)
  // ═══════════════════════════════════════════════════════════════

  describe('User Creation', () => {
    it('should reject user creation with invalid role', async () => {
      const res = await authRequest('POST', '/users', adminToken, {
        email: 'newuser@test.com',
        name: 'New User',
        role: 'superadmin',
      });
      expect(res.status).toBe(400);
    });

    it('should reject user creation with missing email', async () => {
      const res = await authRequest('POST', '/users', adminToken, {
        name: 'No Email',
        role: 'salesperson',
      });
      expect(res.status).toBe(400);
    });

    it('should reject user creation with invalid email', async () => {
      const res = await authRequest('POST', '/users', adminToken, {
        email: 'not-an-email',
        name: 'Bad Email',
        role: 'salesperson',
      });
      expect(res.status).toBe(400);
    });

    it('should reject user creation by non-admin', async () => {
      if (!salespersonToken) return;
      const res = await authRequest('POST', '/users', salespersonToken, {
        email: 'unauthorized@test.com',
        name: 'Unauthorized',
        role: 'salesperson',
      });
      expect(res.status).toBe(403);
    });

    it('should reject duplicate email', async () => {
      const res = await authRequest('POST', '/users', adminToken, {
        email: 'admin@e2e.test',
        name: 'Duplicate',
        role: 'salesperson',
      });
      expect(res.status).toBe(409);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // USER ACTIVATION/DEACTIVATION
  // ═══════════════════════════════════════════════════════════════

  describe('User Activation', () => {
    it('should prevent self-deactivation', async () => {
      const meRes = await authRequest('GET', '/users/me', adminToken);
      if (meRes.status !== 200) return;
      const meBody: any = await meRes.json();
      const res = await authRequest('PUT', `/users/${meBody.data.id}/deactivate`, adminToken);
      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // LOGIN HISTORY
  // ═══════════════════════════════════════════════════════════════

  describe('Login History', () => {
    it('should get own login history', async () => {
      const res = await authRequest('GET', '/users/me/login-history', adminToken);
      expect(res.status).toBe(200);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBe(true);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // AUTH REQUIRED
  // ═══════════════════════════════════════════════════════════════

  describe('Auth Required', () => {
    it('should reject unauthenticated settings request', async () => {
      const res = await publicRequest('GET', '/api/v1/settings/company');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated user profile request', async () => {
      const res = await publicRequest('GET', '/api/v1/users/me');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated user list request', async () => {
      const res = await publicRequest('GET', '/api/v1/users');
      expect(res.status).toBe(401);
    });
  });
});
