import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { isTestMode } from '../src/utils/test-mode';
import { resolveCorsOrigin } from '../src/utils/cors';
import { seedMemoryRateLimit } from '../src/middleware/rate-limit';

const testEnv = env as any;
const TENANT_A = '00000000-0000-0000-0000-000000000000';
const TENANT_B = '0198aaaa-0000-7000-8000-00000000000b';
const ADMIN_ID = '11111111-1111-1111-1111-111111111111';

/** Real limits: the suites run with the test-mode multiplier, this file turns it off where it matters. */
const realLimits = () => ({ ...testEnv, RATE_LIMIT_MULTIPLIER: '1' });

async function call(
  method: string,
  path: string,
  token: string | null,
  opts: { body?: unknown; form?: FormData; headers?: Record<string, string>; e?: any } = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (!opts.form) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, {
      method,
      headers,
      body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    }),
    opts.e ?? testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function login(email: string, password = 'password123', e: any = testEnv, ip = 'unknown'): Promise<Response> {
  return call('POST', '/auth/login', null, { body: { email, password, tenantId: TENANT_A }, headers: { 'CF-Connecting-IP': ip }, e });
}

async function token(email: string): Promise<string> {
  return ((await (await login(email)).json()) as any).data.accessToken;
}

async function upload(tok: string, name: string): Promise<string> {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' }));
  const res = await call('POST', '/files/upload', tok, { form });
  expect(res.status).toBe(200);
  return ((await res.json()) as any).data.key;
}

describe('R106 security hardening', () => {
  let admin = '';
  let sales = '';
  let viewer = '';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    admin = await token('admin@e2e.test');
    sales = await token('sales@e2e.test');
    viewer = await token('viewer@e2e.test');
    await testEnv.FILE_STORAGE.put(`${TENANT_B}/x.png`, new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: 'image/png' } });
  });

  describe('tenant-scoped files', () => {
    it('serves the tenant its own file, privately cached', async () => {
      const key = await upload(admin, 'own.png');
      expect(key.startsWith(`${TENANT_A}/`)).toBe(true);
      const res = await call('GET', `/files/${encodeURIComponent(key)}`, admin);
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    });

    it('a key outside the caller tenant prefix cannot be read or deleted, and the object survives', async () => {
      const key = encodeURIComponent(`${TENANT_B}/x.png`);
      expect((await call('GET', `/files/${key}`, admin)).status).toBe(403);
      expect((await call('DELETE', `/files/${key}`, admin)).status).toBe(403);
      expect(await testEnv.FILE_STORAGE.head(`${TENANT_B}/x.png`)).not.toBeNull();
    });

    it('rejects traversal and absolute keys', async () => {
      expect((await call('GET', `/files/${encodeURIComponent(`${TENANT_A}/../${TENANT_B}/x.png`)}`, admin)).status).toBe(400);
      expect((await call('DELETE', `/files/${encodeURIComponent(`${TENANT_A}/a/../../b.png`)}`, admin)).status).toBe(400);
      expect((await call('GET', `/files/${encodeURIComponent('/etc/passwd')}`, admin)).status).toBe(400);
    });

    it('a missing object under the own prefix is 404', async () => {
      expect((await call('GET', `/files/${encodeURIComponent(`${TENANT_A}/nope.png`)}`, admin)).status).toBe(404);
    });

    it('a salesperson cannot delete an admin upload but can delete their own', async () => {
      const adminKey = await upload(admin, 'admins.png');
      expect((await call('DELETE', `/files/${encodeURIComponent(adminKey)}`, sales)).status).toBe(403);
      expect(await testEnv.FILE_STORAGE.head(adminKey)).not.toBeNull();

      const salesKey = await upload(sales, 'mine.png');
      expect((await call('DELETE', `/files/${encodeURIComponent(salesKey)}`, sales)).status).toBe(200);
      expect(await testEnv.FILE_STORAGE.head(salesKey)).toBeNull();

      expect((await call('DELETE', `/files/${encodeURIComponent(adminKey)}`, admin)).status).toBe(200);
    });
  });

  describe('exports', () => {
    it('view_only and salesperson cannot export; admin can', async () => {
      expect((await call('GET', '/exports/contacts', viewer)).status).toBe(403);
      expect((await call('GET', '/exports/contacts', sales)).status).toBe(403);
      expect((await call('POST', '/exports/full', sales, { body: {} })).status).toBe(403);
      expect((await call('GET', '/exports/contacts?format=csv', admin)).status).toBe(200);
    });
  });

  describe('login limits', () => {
    it('the 11th wrong password in 15 minutes is refused with 429 or 423', async () => {
      const e = realLimits();
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) statuses.push((await login('sales@e2e.test', 'wrong-password', e, '203.0.113.7')).status);
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect([429, 423]).toContain(statuses[10]);
      // Even the right password is refused while limited.
      expect([429, 423]).toContain((await login('sales@e2e.test', 'password123', e, '203.0.113.7')).status);
    });

    it('limits are per IP+email: another IP is not blocked', async () => {
      expect((await login('viewer@e2e.test', 'password123', realLimits(), '203.0.113.8')).status).toBe(200);
    });
  });

  describe('CORS', () => {
    const prod = { ENVIRONMENT: 'production', CORS_ORIGINS: 'https://app.example.com, https://admin.example.com', ALLOW_LOOPBACK_ORIGINS: 'true' };

    async function preflight(origin: string, e: any): Promise<Response> {
      const ctx = createExecutionContext();
      const res = await worker.fetch(
        new Request('http://localhost/api/v1/health', {
          method: 'OPTIONS',
          headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
        }),
        e,
        ctx,
      );
      await waitOnExecutionContext(ctx);
      return res;
    }

    it('no allow-origin for *.pages.dev, yes for a CORS_ORIGINS entry, and the desktop loopback (preflight through the worker)', async () => {
      const e = { ...testEnv, ENVIRONMENT: 'production', TEST_MODE: 'false', ALLOW_SINGLE_TENANT_PRODUCTION: 'true', CORS_ORIGINS: prod.CORS_ORIGINS, ALLOW_LOOPBACK_ORIGINS: 'true' };
      expect((await preflight('https://evil.pages.dev', e)).headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect((await preflight('http://evil.example', e)).headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect((await preflight('https://app.example.com', e)).headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
      expect((await preflight('https://admin.example.com', e)).headers.get('Access-Control-Allow-Origin')).toBe('https://admin.example.com');
      expect((await preflight('http://127.0.0.1:53211', e)).headers.get('Access-Control-Allow-Origin')).toBe('http://127.0.0.1:53211');
    });

    it('production accepts the desktop app loopback origin on any port and rejects foreign origins', () => {
      expect(resolveCorsOrigin('http://127.0.0.1:53211', prod)).toBe('http://127.0.0.1:53211');
      expect(resolveCorsOrigin('http://localhost:49152', prod)).toBe('http://localhost:49152');
      expect(resolveCorsOrigin('http://evil.example', prod)).toBeNull();
      expect(resolveCorsOrigin('https://127.0.0.1:53211', prod)).toBeNull();
      expect(resolveCorsOrigin('http://127.0.0.1.evil.example:80', prod)).toBeNull();
      expect(resolveCorsOrigin('http://127.0.0.1', prod)).toBeNull();
      expect(resolveCorsOrigin('https://evil.pages.dev', prod)).toBeNull();
    });

    it('loopback is closed in production unless ALLOW_LOOPBACK_ORIGINS is true, open in dev', () => {
      expect(resolveCorsOrigin('http://127.0.0.1:3100', { ENVIRONMENT: 'production' })).toBeNull();
      expect(resolveCorsOrigin('http://localhost:3110', { ENVIRONMENT: 'development' })).toBe('http://localhost:3110');
      expect(resolveCorsOrigin('http://localhost:3110', { TEST_MODE: 'true' })).toBe('http://localhost:3110');
    });
  });

  describe('TEST_MODE fence', () => {
    it('isTestMode is false in production even when TEST_MODE leaks', () => {
      expect(isTestMode({ TEST_MODE: 'true', ENVIRONMENT: 'production' })).toBe(false);
      expect(isTestMode({ TEST_MODE: 'true', ENVIRONMENT: 'development' })).toBe(true);
      expect(isTestMode({ TEST_MODE: 'false' })).toBe(false);
      expect(isTestMode({})).toBe(false);
    });

    it('the service refuses to run with TEST_MODE in production', async () => {
      const res = await call('POST', '/test/reset', null, { e: { ...testEnv, ENVIRONMENT: 'production' } });
      expect(res.status).toBe(503);
    });
  });

  describe('public quotation links', () => {
    it('are not indexed, 404 for unknown tokens, 410 once revoked', async () => {
      await testEnv.MASTER_DB.prepare('INSERT OR REPLACE INTO quotation_links (token, tenant_id, itinerary_id, is_active) VALUES (?, ?, ?, 0)')
        .bind('revoked-token-r106', TENANT_A, 'no-such-itinerary')
        .run();
      const gone = await call('GET', '/public/quotation/revoked-token-r106', null);
      expect(gone.status).toBe(410);
      expect(gone.headers.get('X-Robots-Tag')).toContain('noindex');
      const unknown = await call('GET', '/public/quotation/never-issued-r106', null);
      expect(unknown.status).toBe(404);
      expect(unknown.headers.get('X-Robots-Tag')).toContain('noindex');
    });

    it('allow 60 requests a minute per IP', async () => {
      const e = realLimits();
      const h = { 'CF-Connecting-IP': '198.51.100.9' };
      let last = 0;
      for (let i = 0; i < 61; i++) last = (await call('GET', '/public/quotation/never-issued-r106', null, { e, headers: h })).status;
      expect(last).toBe(429);
    });
  });

  describe('per-user API limit', () => {
    it('answers 429 once a user has used 600 requests this minute, other users unaffected', async () => {
      const e = realLimits();
      seedMemoryRateLimit(`rl:api:${ADMIN_ID}`, 600); // in-memory fallback: the test env has no rate limit binding
      expect((await call('GET', '/contacts', admin, { e })).status).toBe(429);
      expect((await call('GET', '/contacts', viewer, { e })).status).toBe(200);
      seedMemoryRateLimit(`rl:api:${ADMIN_ID}`, null);
      expect((await call('GET', '/contacts', admin, { e })).status).toBe(200);
    });
  });
});
