import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;

async function call(method: string, path: string, token: string | null, rawBody?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost${path}`, { method, headers, body: rawBody }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

let adminToken = '';

describe('B33 global error handling', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    const reset = await call('POST', '/api/v1/test/reset', null);
    expect(reset.status).toBe(200);
    const login = await call(
      'POST',
      '/api/v1/auth/login',
      null,
      JSON.stringify({
        email: 'admin@e2e.test',
        password: 'password123',
        tenantId: '00000000-0000-0000-0000-000000000000',
      }),
    );
    expect(login.status).toBe(200);
    adminToken = ((await login.json()) as any).data.accessToken;
  });

  for (const path of ['/api/v1/contacts', '/api/v1/leads']) {
    it(`malformed JSON on POST ${path} -> 400 with the error envelope`, async () => {
      const res = await call('POST', path, adminToken, '{ not valid json');
      expect(res.status).toBe(400);
      const body: any = await res.json();
      expect(body.success).toBe(false);
      expect(typeof body.error.message).toBe('string');
      expect(body.error.message.length).toBeGreaterThan(0);
      expect(JSON.stringify(body)).not.toMatch(/\bat .*\.(ts|js):\d+/);
    });
  }

  it('malformed JSON on an auth route still answers 400', async () => {
    const res = await call('POST', '/api/v1/auth/login', null, '{ nope');
    expect(res.status).toBe(400);
    const body: any = await res.json();
    expect(body.success).toBe(false);
  });

  it('unknown routes still answer 404 in the envelope', async () => {
    const res = await call('GET', '/api/v1/definitely-not-a-route', adminToken);
    expect(res.status).toBe(404);
    expect(((await res.json()) as any).success).toBe(false);
  });
});
