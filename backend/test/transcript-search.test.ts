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

describe('Transcript search tolerates FTS5 syntax characters in user input', () => {
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

  it('requires a query', async () => {
    const res = await call('GET', '/api/v1/transcripts', adminToken);
    expect(res.status).toBe(400);
  });

  for (const q of ['non-refundable', 'nonexistent-transcript-phrase-zzz', 'say "hello"', 'price: 5000*', '(refund) OR', 'AND']) {
    it(`q=${q} returns 200 with an empty list instead of an FTS syntax error`, async () => {
      const res = await call('GET', `/api/v1/transcripts?q=${encodeURIComponent(q)}`, adminToken);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual([]);
      expect(body.pagination.total).toBe(0);
    });
  }
});
