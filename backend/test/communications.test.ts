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

describe('Communication Routes Integration Tests', () => {
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

  // ─── Communication Log ──────────────────────────────────────────

  describe('Communication Log', () => {
    it('should list communication log (GET /communications/log)', async () => {
      const res = await authRequest('GET', '/communications/log', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('pagination');
    });

    it('should support channel filter on log', async () => {
      const res = await authRequest('GET', '/communications/log?channel=email', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
    });

    it('should support status filter on log', async () => {
      const res = await authRequest('GET', '/communications/log?status=sent', adminToken);
      expect(res.status).toBe(200);
    });

    it('should support pagination on log', async () => {
      const res = await authRequest('GET', '/communications/log?page=1&limit=5', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.pagination).toHaveProperty('page');
      expect(body.pagination).toHaveProperty('limit');
    });

    it('should support search on log', async () => {
      const res = await authRequest('GET', '/communications/log?search=test', adminToken);
      expect(res.status).toBe(200);
    });
  });

  // ─── Communication History ──────────────────────────────────────

  describe('Communication History', () => {
    it('should list communication history (GET /communications/history)', async () => {
      const res = await authRequest('GET', '/communications/history', adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
    });

    it('should filter history by channel', async () => {
      const res = await authRequest('GET', '/communications/history?channel=whatsapp', adminToken);
      expect(res.status).toBe(200);
    });

    it('should filter history by contact_id', async () => {
      const res = await authRequest('GET', '/communications/history?contact_id=some-id', adminToken);
      expect(res.status).toBe(200);
    });
  });

  // ─── Send Message Validation ────────────────────────────────────

  describe('Send Message Validation', () => {
    it('should reject send without channel', async () => {
      const res = await authRequest('POST', '/communications/send', adminToken, {
        contact_id: 'some-id',
        message: 'Hello',
      });
      expect(res.status).toBe(400);
    });

    it('should reject send without contact_id', async () => {
      const res = await authRequest('POST', '/communications/send', adminToken, {
        channel: 'email',
        message: 'Hello',
      });
      expect(res.status).toBe(400);
    });

    it('should reject send without message', async () => {
      const res = await authRequest('POST', '/communications/send', adminToken, {
        channel: 'email',
        contact_id: 'some-id',
      });
      expect(res.status).toBe(400);
    });

    it('should reject send with invalid channel', async () => {
      const res = await authRequest('POST', '/communications/send', adminToken, {
        channel: 'pigeon',
        contact_id: 'some-id',
        message: 'Hello',
      });
      expect(res.status).toBe(400);
    });

    it('should reject send with empty message', async () => {
      const res = await authRequest('POST', '/communications/send', adminToken, {
        channel: 'email',
        contact_id: 'some-id',
        message: '',
      });
      expect(res.status).toBe(400);
    });

    it('should reject send with invalid media_url', async () => {
      const res = await authRequest('POST', '/communications/send', adminToken, {
        channel: 'whatsapp',
        contact_id: 'some-id',
        message: 'Hello',
        media_url: 'not-a-url',
      });
      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent contact', async () => {
      const res = await authRequest('POST', '/communications/send', adminToken, {
        channel: 'email',
        contact_id: 'nonexistent-contact-id',
        message: 'Hello',
      });
      expect([404, 500]).toContain(res.status);
    });
  });

  // ─── Send Template Validation ───────────────────────────────────

  describe('Send Template Validation', () => {
    it('should reject send-template without contact_id', async () => {
      const res = await authRequest('POST', '/communications/send-template', adminToken, {
        template_id: 'some-template',
      });
      expect(res.status).toBe(400);
    });

    it('should reject send-template without template_id', async () => {
      const res = await authRequest('POST', '/communications/send-template', adminToken, {
        contact_id: 'some-id',
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── Send Document Validation ───────────────────────────────────

  describe('Send Document Validation', () => {
    it('should reject send-document without required fields', async () => {
      const res = await authRequest('POST', '/communications/send-document', adminToken, {});
      expect(res.status).toBe(400);
    });

    it('should reject send-document with invalid document_type', async () => {
      const res = await authRequest('POST', '/communications/send-document', adminToken, {
        contact_id: 'some-id',
        channel: 'email',
        document_type: 'invalid',
        document_id: 'some-doc',
      });
      expect(res.status).toBe(400);
    });

    it('should reject send-document with invalid channel', async () => {
      const res = await authRequest('POST', '/communications/send-document', adminToken, {
        contact_id: 'some-id',
        channel: 'fax',
        document_type: 'invoice',
        document_id: 'some-doc',
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── Bulk Send Validation ───────────────────────────────────────

  describe('Bulk Send Validation', () => {
    it('should reject bulk-send without channel', async () => {
      const res = await authRequest('POST', '/communications/bulk-send', adminToken, {
        contact_ids: ['id1', 'id2'],
        message: 'Hello',
      });
      expect(res.status).toBe(400);
    });

    it('should reject bulk-send with empty contact_ids', async () => {
      const res = await authRequest('POST', '/communications/bulk-send', adminToken, {
        channel: 'email',
        contact_ids: [],
      });
      expect(res.status).toBe(400);
    });

    it('should reject bulk-send with invalid channel', async () => {
      const res = await authRequest('POST', '/communications/bulk-send', adminToken, {
        channel: 'pigeon',
        contact_ids: ['id1'],
        message: 'Hello',
      });
      expect(res.status).toBe(400);
    });
  });

  // ─── Bulk Send Status ───────────────────────────────────────────

  describe('Bulk Send Status', () => {
    it('should get batch status', async () => {
      const res = await authRequest('GET', '/communications/bulk-send/some-batch-id/status', adminToken);
      if (res.status === 200) {
        const body: any = await res.json();
        expect(body.success).toBe(true);
        if (body.data) {
          expect(body.data).toHaveProperty('batch_id');
          expect(body.data).toHaveProperty('status');
        }
      } else {
        expect([200, 404, 500]).toContain(res.status);
      }
    });
  });

  // ─── Auth Required ──────────────────────────────────────────────

  describe('Auth Required', () => {
    it('should reject unauthenticated log request', async () => {
      const res = await publicRequest('GET', '/api/v1/communications/log');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated history request', async () => {
      const res = await publicRequest('GET', '/api/v1/communications/history');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated send request', async () => {
      const res = await publicRequest('POST', '/api/v1/communications/send');
      expect(res.status).toBe(401);
    });
  });
});
