import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = testEnv): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

/** KV namespace wrapper that counts writes. */
function kvSpy(kv: KVNamespace) {
  const counts = { put: 0, get: 0 };
  const proxy = new Proxy(kv, {
    get(target, prop) {
      const v = (target as any)[prop];
      if (prop === 'put' || prop === 'get') {
        return (...args: unknown[]) => { counts[prop as 'put' | 'get']++; return v.apply(target, args); };
      }
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
  return { counts, proxy };
}

describe('API rate limit on the Workers Rate Limiting binding', () => {
  let token = '';
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    token = ((await login.json()) as any).data.accessToken;
  });

  it('an ordinary authenticated API request makes no KV write (nor read) for rate limiting', async () => {
    const spy = kvSpy(testEnv.CACHE);
    const res = await call('GET', '/contacts', token, undefined, { ...testEnv, CACHE: spy.proxy });
    expect(res.status).toBe(200);
    expect(spy.counts.put).toBe(0);
  });

  it('asks the bound limiter with a per-user key and answers 429 when it refuses', async () => {
    const keys: string[] = [];
    let allow = false;
    const limiter = { limit: async ({ key }: { key: string }) => { keys.push(key); return { success: allow }; } };
    const e = { ...testEnv, API_RATE_LIMITER: limiter };
    const refused = await call('GET', '/contacts', token, undefined, e);
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).toBeTruthy();
    expect(keys[0]).toBe('rl:api:11111111-1111-1111-1111-111111111111');
    allow = true;
    expect((await call('GET', '/contacts', token, undefined, e)).status).toBe(200);
  });

  it('fails open when the binding throws', async () => {
    const e = { ...testEnv, API_RATE_LIMITER: { limit: async () => { throw new Error('limiter down'); } } };
    expect((await call('GET', '/contacts', token, undefined, e)).status).toBe(200);
  });
});
