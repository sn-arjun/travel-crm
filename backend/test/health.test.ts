import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import worker from '../src/index';
import { safePath, sanitizeFields } from '../src/utils/logger';
import { buildEnvelope, HttpReporter, parseDsn } from '../src/services/error-reporter';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const HEALTH_TOKEN = 'health-token-for-tests-only';

async function call(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown; e?: any } = {},
): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }),
    opts.e ?? testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

const withToken = () => ({ ...testEnv, HEALTH_TOKEN });

describe('health checks', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/api/v1/test/reset')).status).toBe(200);
  });

  it('/health is public, cheap and touches MASTER_DB', async () => {
    const res = await call('GET', '/api/v1/health');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('timestamp');
  });

  it('/health answers 503 degraded when the registry database is unreachable', async () => {
    const broken = { ...testEnv, MASTER_DB: { prepare: () => { throw new Error('D1_ERROR: boom internal-detail'); } } };
    const res = await call('GET', '/api/v1/health', { e: broken });
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text).status).toBe('degraded');
    expect(text).not.toContain('internal-detail');
  });

  it('/health/deep without a token is 401', async () => {
    expect((await call('GET', '/api/v1/health/deep', { e: withToken() })).status).toBe(401);
    expect((await call('GET', '/api/v1/health/deep', { e: withToken(), headers: { 'X-Health-Token': 'wrong' } })).status).toBe(401);
    // no HEALTH_TOKEN configured: an empty header can never match
    expect((await call('GET', '/api/v1/health/deep', { headers: { 'X-Health-Token': '' } })).status).toBe(401);
  });

  it('/health/deep with the token reports three checks with latency', async () => {
    const res = await call('GET', '/api/v1/health/deep', { e: withToken(), headers: { 'X-Health-Token': HEALTH_TOKEN } });
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe('ok');
    expect(Object.keys(body.checks).sort()).toEqual(['kv', 'masterDb', 'r2']);
    for (const c of Object.values(body.checks) as any[]) {
      expect(c.ok).toBe(true);
      expect(typeof c.ms).toBe('number');
    }
  });

  it('/health/deep answers 503 with a broken KV and does not leak the error text', async () => {
    const brokenKv = { put: async () => { throw new Error('KV secret-internal-text'); }, get: async () => { throw new Error('KV secret-internal-text'); } };
    const res = await call('GET', '/api/v1/health/deep', { e: { ...withToken(), CACHE: brokenKv }, headers: { Authorization: `Bearer ${HEALTH_TOKEN}` } });
    expect(res.status).toBe(503);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.status).toBe('degraded');
    expect(body.checks.kv.ok).toBe(false);
    expect(body.checks.masterDb.ok).toBe(true);
    expect(text).not.toContain('secret-internal-text');
  });
});

describe('structured logs', () => {
  it('writes one JSON line per request with a request id and never the credentials', async () => {
    const lines: string[] = [];
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(' ')); }),
    );
    try {
      const res = await call('POST', '/api/v1/auth/login?password=querysecret', {
        body: { email: 'admin@e2e.test', password: 'super-secret-pw-123', tenantId: TENANT_ID },
        headers: { 'cf-ray': 'ray-test-123' },
      });
      expect(res.headers.get('X-Request-Id')).toBe('ray-test-123');
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    const requestLines = lines.filter((l) => l.includes('"http.request"')).map((l) => JSON.parse(l));
    expect(requestLines.length).toBe(1);
    expect(requestLines[0]).toMatchObject({ level: 'info', event: 'http.request', requestId: 'ray-test-123', method: 'POST', path: '/api/v1/auth/login' });
    expect(typeof requestLines[0].ms).toBe('number');
    const all = lines.join('\n');
    expect(all).not.toContain('super-secret-pw-123');
    expect(all).not.toContain('querysecret');
    expect(all).not.toContain('admin@e2e.test');
  });

  it('drops sensitive fields and masks id-like path segments', () => {
    expect(sanitizeFields({ ok: 1, password: 'x', apiKey: 'y', toNumber: '+1', phone: '+1', userEmail: 'a@b.c', requestBody: 'z' })).toEqual({ ok: 1, toNumber: '+1' });
    expect(safePath('/api/v1/public/quotation/AbCdEf0123456789AbCdEf0123')).toBe('/api/v1/public/quotation/:id');
    expect(safePath('/api/v1/contacts/0196a105-0000-7000-8000-0000000000a1/notes')).toBe('/api/v1/contacts/:id/notes');
  });
});

describe('error reporting', () => {
  it('parses a Sentry-style DSN and builds an envelope with ids only', () => {
    const t = parseDsn('https://abc123@o1.ingest.example.io/42');
    expect(t).toMatchObject({ url: 'https://o1.ingest.example.io/api/42/envelope/', key: 'abc123' });
    expect(parseDsn('not a dsn')).toBeNull();
    const envelope = buildEnvelope('https://abc123@o1.ingest.example.io/42', new Error('boom'), { requestId: 'r1', tenantId: 't1', source: 'http' });
    const [header, item, event] = envelope.split('\n').map((l) => JSON.parse(l));
    expect(header.dsn).toContain('abc123');
    expect(item.type).toBe('event');
    expect(event.tags).toMatchObject({ requestId: 'r1', tenantId: 't1', source: 'http' });
    expect(event.exception.values[0].value).toBe('boom');
  });

  it('the HTTP reporter posts the envelope and swallows delivery failures', async () => {
    const calls: Array<{ url: string; init: any }> = [];
    const ok = new HttpReporter('https://abc123@o1.ingest.example.io/42', {}, (async (url: any, init: any) => { calls.push({ url: String(url), init }); return new Response('{}'); }) as any);
    await ok.report(new Error('x'), { requestId: 'r2' });
    expect(calls[0].url).toBe('https://o1.ingest.example.io/api/42/envelope/');
    expect(calls[0].init.headers['X-Sentry-Auth']).toContain('sentry_key=abc123');
    const down = new HttpReporter('https://abc123@o1.ingest.example.io/42', {}, (async () => { throw new Error('network down'); }) as any);
    await expect(down.report(new Error('y'))).resolves.toBeUndefined();
  });

  it('an unhandled route error answers 500 and reaches the reporter (DSN set)', async () => {
    const fetched: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any) => { fetched.push(String(url)); return new Response('{}'); }) as any;
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); });
    try {
      const brokenMaster = { ...testEnv, ERROR_REPORTER_DSN: 'https://abc123@o1.ingest.example.io/42' };
      // reading the secret throws inside the handler (not inside a guarded check), so the error reaches app.onError
      Object.defineProperty(brokenMaster, 'HEALTH_TOKEN', { get() { throw new Error('secret binding exploded'); } });
      const res = await call('GET', '/api/v1/health/deep', { e: brokenMaster, headers: { 'X-Health-Token': HEALTH_TOKEN } });
      expect(res.status).toBe(500);
    } finally {
      spy.mockRestore();
      globalThis.fetch = realFetch;
    }
    expect(fetched).toContain('https://o1.ingest.example.io/api/42/envelope/');
    expect(lines.join('\n')).toContain('error.reported');
  });
});
