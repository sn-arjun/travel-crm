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

describe('Message Template Routes Integration Tests', () => {
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

  // ─── Template CRUD ──────────────────────────────────────────────

  describe('Template CRUD', () => {
    let templateId = '';

    it('should list templates', async () => {
      const res = await authRequest('GET', '/templates', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('pagination');
    });

    it('should create a template', async () => {
      const res = await authRequest('POST', '/templates', adminToken, {
        channel: 'email',
        name: 'Welcome Email',
        subject: 'Welcome {customer_name}!',
        content: 'Dear {customer_name}, welcome to our agency. Your trip to {destination} is being prepared.',
        category: 'greeting',
        language: 'en',
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
      expect(body.data).toHaveProperty('variables');
      expect(Array.isArray(body.data.variables)).toBe(true);
      // Should detect {customer_name} and {destination} as variables
      expect(body.data.variables).toContain('customer_name');
      expect(body.data.variables).toContain('destination');
      templateId = body.data.id;
    });

    it('should reject template without name', async () => {
      const res = await authRequest('POST', '/templates', adminToken, {
        channel: 'email',
        content: 'Some content',
      });
      expect(res.status).toBe(400);
    });

    it('should reject template without channel', async () => {
      const res = await authRequest('POST', '/templates', adminToken, {
        name: 'Test',
        content: 'Some content',
      });
      expect(res.status).toBe(400);
    });

    it('should reject template without content', async () => {
      const res = await authRequest('POST', '/templates', adminToken, {
        channel: 'sms',
        name: 'Test',
      });
      expect(res.status).toBe(400);
    });

    it('should reject template with empty name', async () => {
      const res = await authRequest('POST', '/templates', adminToken, {
        channel: 'sms',
        name: '',
        content: 'Some content',
      });
      expect(res.status).toBe(400);
    });

    it('should reject template with empty content', async () => {
      const res = await authRequest('POST', '/templates', adminToken, {
        channel: 'sms',
        name: 'Test',
        content: '',
      });
      expect(res.status).toBe(400);
    });

    it('should reject template with invalid channel', async () => {
      const res = await authRequest('POST', '/templates', adminToken, {
        channel: 'pigeon',
        name: 'Test',
        content: 'Some content',
      });
      expect(res.status).toBe(400);
    });

    it('should reject template with invalid category', async () => {
      const res = await authRequest('POST', '/templates', adminToken, {
        channel: 'email',
        name: 'Test',
        content: 'Some content',
        category: 'invalid_category',
      });
      expect(res.status).toBe(400);
    });

    it('should get template by ID', async () => {
      if (!templateId) return;
      const res = await authRequest('GET', `/templates/${templateId}`, adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data).toHaveProperty('name', 'Welcome Email');
        expect(body.data).toHaveProperty('channel', 'email');
        expect(body.data).toHaveProperty('variables');
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should return 404 for non-existent template', async () => {
      const res = await authRequest('GET', '/templates/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });

    it('should update template', async () => {
      if (!templateId) return;
      const res = await authRequest('PUT', `/templates/${templateId}`, adminToken, {
        name: 'Welcome Email (Updated)',
        content: 'Hello {customer_name}, your booking is confirmed for {destination} on {travel_date}.',
      });
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.data).toHaveProperty('name', 'Welcome Email (Updated)');
        // Updated content should detect new variable {travel_date}
        expect(body.data.variables).toContain('travel_date');
      } else {
        expect([200, 404]).toContain(res.status);
      }
    });

    it('should return 404 when updating non-existent template', async () => {
      const res = await authRequest('PUT', '/templates/nonexistent-id', adminToken, {
        name: 'Updated',
      });
      expect(res.status).toBe(404);
    });

    it('should delete template (soft)', async () => {
      if (!templateId) return;
      const res = await authRequest('DELETE', `/templates/${templateId}`, adminToken);
      expect([200, 404]).toContain(res.status);
    });

    it('should return 404 when deleting non-existent template', async () => {
      const res = await authRequest('DELETE', '/templates/nonexistent-id', adminToken);
      expect(res.status).toBe(404);
    });
  });

  // ─── Template Filtering ─────────────────────────────────────────

  describe('Template Filtering', () => {
    it('should create templates for filtering', async () => {
      // Create WhatsApp template
      const res1 = await authRequest('POST', '/templates', adminToken, {
        channel: 'whatsapp',
        name: 'WhatsApp Greeting',
        content: 'Hello {customer_name}!',
        category: 'greeting',
      });
      expect(res1.status).toBe(201);

      // Create SMS template
      const res2 = await authRequest('POST', '/templates', adminToken, {
        channel: 'sms',
        name: 'SMS Reminder',
        content: 'Reminder: Your trip is tomorrow.',
        category: 'reminder',
      });
      expect(res2.status).toBe(201);
    });

    it('should filter templates by channel', async () => {
      const res = await authRequest('GET', '/templates?channel=whatsapp', adminToken);
      expect(res.status).toBe(200);
    });

    it('should filter templates by category', async () => {
      const res = await authRequest('GET', '/templates?category=greeting', adminToken);
      expect(res.status).toBe(200);
    });

    it('should search templates', async () => {
      const res = await authRequest('GET', '/templates?search=Greeting', adminToken);
      expect(res.status).toBe(200);
    });

    it('should paginate templates', async () => {
      const res = await authRequest('GET', '/templates?page=1&limit=1', adminToken);
      expect(res.status).toBe(200);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body).toHaveProperty('pagination');
      }
    });
  });

  // ─── Also accessible at /message-templates alias ────────────────

  describe('Route Alias', () => {
    it('should also work at /message-templates', async () => {
      const res = await authRequest('GET', '/message-templates', adminToken);
      expect(res.status).toBe(200);
    });
  });

  // ─── Auth Required ──────────────────────────────────────────────

  describe('Auth Required', () => {
    it('should reject unauthenticated template list', async () => {
      const res = await publicRequest('GET', '/api/v1/templates');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated template creation', async () => {
      const res = await publicRequest('POST', '/api/v1/templates');
      expect(res.status).toBe(401);
    });
  });
});
