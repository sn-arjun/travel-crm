import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { superAdminToken } from './utils/super-admin';

/**
 * R116 landing page enquiries: POST /api/v1/public/enquiries (no login) and the operator list.
 * Unique emails and IPs per test: storage is shared across test files (isolatedStorage is false).
 */

const testEnv = env as any;
const outboxEnv = { ...testEnv, SENDGRID_API_KEY: '', PLATFORM_SUPPORT_EMAIL: 'inbox-r116@platform.test' };
const realLimits = { ...outboxEnv, RATE_LIMIT_MULTIPLIER: '1' };
const SA = { id: '0196a116-0000-7000-8000-0000000000a1', email: 'owner-r116@platform.test' };

async function call(method: string, path: string, init: { json?: unknown; raw?: string; ip?: string; token?: string; headers?: Record<string, string> } = {}, e: any = outboxEnv): Promise<Response> {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.json !== undefined || init.raw !== undefined) headers['Content-Type'] = 'application/json';
  if (init.ip) headers['cf-connecting-ip'] = init.ip;
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost${path}`, { method, headers, body: init.raw ?? (init.json === undefined ? undefined : JSON.stringify(init.json)) }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

const post = (json: unknown, ip: string, e?: any) => call('POST', '/api/v1/public/enquiries', { json, ip }, e);
const rows = async (email: string) =>
  (await testEnv.MASTER_DB.prepare('SELECT * FROM platform_enquiries WHERE email = ?').bind(email).all()).results as any[];

const demo = (email: string, extra: Record<string, unknown> = {}) => ({
  kind: 'demo', name: 'Asha Rao', email, phone: '+91 98765 43210', company: 'Sunrise Holidays', country: 'India', agentsCount: 6,
  message: 'Please show me quotations.', sourceUrl: 'https://travelcrm.example/#demo', website: '', ...extra,
});

describe('public enquiries', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  });
  afterEach(() => vi.restoreAllMocks());

  it('a valid demo request answers 202 without echo, stores a row and notifies the platform inbox', async () => {
    const res = await post(demo('Asha.Demo@r116.test'), '198.51.100.11');
    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(body).toEqual({ success: true, data: { received: true } });

    const stored = await rows('asha.demo@r116.test');
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ kind: 'demo', name: 'Asha Rao', company: 'Sunrise Holidays', agents_count: 6, status: 'new' });
    expect(stored[0].ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0].ip_hash).not.toContain('198.51.100.11');

    const outbox = (await (await call('GET', '/api/v1/test/outbox?to=inbox-r116@platform.test')).json()) as any;
    const mails = outbox.data as any[];
    const mail = mails.find((m) => m.template === 'platform_enquiry' && m.text.includes('asha.demo@r116.test'));
    expect(mail).toBeTruthy();
    expect(mail.text).toContain('Type: demo');
  });

  it('a filled honeypot answers 202 but stores nothing and sends nothing', async () => {
    const res = await post(demo('bot@r116.test', { website: 'http://spam.example' }), '198.51.100.12');
    expect(res.status).toBe(202);
    expect(((await res.json()) as any).data).toEqual({ received: true });
    expect(await rows('bot@r116.test')).toHaveLength(0);
    const outbox = (await (await call('GET', '/api/v1/test/outbox')).json()) as any;
    expect(JSON.stringify(outbox)).not.toContain('bot@r116.test');
  });

  it('rejects invalid input with 400 and field messages', async () => {
    const res = await post({ kind: 'demo', name: '', email: 'not-an-email' }, '198.51.100.13');
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.fields.name).toBeTruthy();
    expect(body.fields.email).toBeTruthy();
    expect((await call('POST', '/api/v1/public/enquiries', { raw: '{nope', ip: '198.51.100.13' })).status).toBe(400);
  });

  it('the 6th request in an hour from one IP is refused with 429', async () => {
    const ip = '198.51.100.20';
    for (let i = 1; i <= 5; i++) {
      const res = await post(demo(`limit-${i}@r116.test`), ip, realLimits);
      expect(res.status).toBe(202);
    }
    const sixth = await post(demo('limit-6@r116.test'), ip, realLimits);
    expect(sixth.status).toBe(429);
    expect(await rows('limit-6@r116.test')).toHaveLength(0);
    // another visitor is not affected
    expect((await post(demo('limit-other@r116.test'), '198.51.100.21', realLimits)).status).toBe(202);
  });

  it('the 4th enquiry from one email in a day is refused with 429', async () => {
    for (let i = 0; i < 3; i++) expect((await post(demo('repeat@r116.test'), `198.51.100.3${i}`)).status).toBe(202);
    expect((await post(demo('repeat@r116.test'), '198.51.100.39')).status).toBe(429);
    expect(await rows('repeat@r116.test')).toHaveLength(3);
  });

  it('with Turnstile on, a failed verification is 400 and a passed one is accepted', async () => {
    const withSecret = { ...outboxEnv, TURNSTILE_SECRET: 'turnstile-test-secret' };
    const verdicts: boolean[] = [false, true];
    const seen: string[] = [];
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.startsWith('https://challenges.cloudflare.com/turnstile/v0/siteverify')) {
        seen.push(String(init?.body));
        return new Response(JSON.stringify({ success: verdicts.shift() }), { headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(input, init);
    });

    const failed = await post(demo('ts-fail@r116.test', { turnstileToken: 'bad' }), '198.51.100.41', withSecret);
    expect(failed.status).toBe(400);
    expect(await rows('ts-fail@r116.test')).toHaveLength(0);
    // no token at all is also a failure, and does not even call Cloudflare
    expect((await post(demo('ts-none@r116.test'), '198.51.100.42', withSecret)).status).toBe(400);

    const ok = await post(demo('ts-ok@r116.test', { turnstileToken: 'good' }), '198.51.100.43', withSecret);
    expect(ok.status).toBe(202);
    expect(await rows('ts-ok@r116.test')).toHaveLength(1);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain('secret=turnstile-test-secret');
  });

  it('an oversized body is refused with 413', async () => {
    const res = await call('POST', '/api/v1/public/enquiries', { raw: JSON.stringify(demo('big@r116.test', { message: 'x'.repeat(11 * 1024) })), ip: '198.51.100.50' });
    expect(res.status).toBe(413);
    expect(await rows('big@r116.test')).toHaveLength(0);
  });

  it('a registered agency email gets the same answer as a new one (no account disclosure)', async () => {
    await testEnv.MASTER_DB
      .prepare(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status) VALUES (?, 'Known Agency', 'r116-known', 'basic', 'active')`)
      .bind('0196a116-0000-7000-8000-0000000000b1')
      .run();
    const a = await post(demo('someone@known-agency.test'), '198.51.100.60');
    const b = await post(demo('stranger@r116-new.test'), '198.51.100.61');
    expect(a.status).toBe(b.status);
    expect(await a.text()).toBe(await b.text());
  });

  it('the operator list is super admin only and filterable; status can be changed', async () => {
    expect((await call('GET', '/api/v1/admin/enquiries')).status).toBe(401);

    const token = await superAdminToken(testEnv, SA);
    const list = await call('GET', '/api/v1/admin/enquiries?kind=demo&limit=100', { token });
    expect(list.status).toBe(200);
    const body = (await list.json()) as any;
    const mine = body.data.find((r: any) => r.email === 'asha.demo@r116.test');
    expect(mine).toMatchObject({ kind: 'demo', name: 'Asha Rao', status: 'new' });
    expect(mine).not.toHaveProperty('ip_hash');
    expect(body.data.every((r: any) => r.kind === 'demo')).toBe(true);
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);

    const patched = await call('PATCH', `/api/v1/admin/enquiries/${mine.id}`, { token, json: { status: 'contacted' } });
    expect(patched.status).toBe(200);
    const after = await call('GET', '/api/v1/admin/enquiries?status=contacted', { token });
    expect(((await after.json()) as any).data.some((r: any) => r.id === mine.id)).toBe(true);
    expect((await call('PATCH', `/api/v1/admin/enquiries/${mine.id}`, { token, json: { status: 'bogus' } })).status).toBe(400);
  });
});
