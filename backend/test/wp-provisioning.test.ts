import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { signAccessToken } from '../src/utils/jwt';
import { superAdminToken } from './utils/super-admin';
import { handleQueue } from '../src/queues/index';
import { handleWpProvisionJob } from '../src/queues/wp-provision-queue';
import { processSite, sweepWordpressSites, MAX_ATTEMPTS } from '../src/services/wordpress/sites';
import { canonicalString, hmacHex, signProvisionerRequest } from '../src/services/wordpress/provisioner-client';

/**
 * R309: WordPress site provisioning. The provisioner is a mocked fetch; the queue is a recording fake.
 * Agencies are rows in the shared test master database, with ids and subdomains unique to this file.
 */

const P = '0196a309-0000-7000-8000';
const SECRET = 'wp-test-secret-0123456789abcdefghij';
const PROVISIONER = 'https://provisioner.test';

const queued: any[] = [];
const testEnv: any = {
  ...(env as any),
  OCI_PROVISIONER_URL: PROVISIONER,
  PROVISIONER_SECRET: SECRET,
  WP_SITES_DOMAIN: 'sites.r309.test',
  SENDGRID_API_KEY: '',
  WP_PROVISION_QUEUE: { send: async (m: any) => void queued.push(m) },
};

const master = (sql: string, ...binds: unknown[]): D1PreparedStatement => (env as any).MASTER_DB.prepare(sql).bind(...binds);
const json = async (res: Response) => (await res.json()) as any;

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body) }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

let seq = 0;
async function makeTenant(): Promise<{ id: string; subdomain: string; adminEmail: string }> {
  const n = String(++seq).padStart(4, '0');
  const id = `${P}-00000000${n}`;
  const subdomain = `wp-r309-${n}`;
  const adminEmail = `owner-${n}@r309.test`;
  await master(
    `INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, max_users, owner_email) VALUES (?, ?, ?, 'basic', 'active', 5, ?)`,
    id, `R309 Agency ${n}`, subdomain, adminEmail,
  ).run();
  return { id, subdomain, adminEmail };
}

async function row(siteId: string): Promise<any> {
  return master('SELECT * FROM wordpress_sites WHERE id = ?', siteId).first();
}
async function events(siteId: string): Promise<string[]> {
  const { results } = await master('SELECT event FROM wordpress_site_events WHERE site_id = ? ORDER BY created_at, rowid', siteId).all();
  return (results as any[]).map((r) => r.event);
}

let sa: string;
let fetchMock: ReturnType<typeof vi.fn>;
let provisioner: (url: string, init: RequestInit) => Response | Promise<Response>;

const ok = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeAll(async () => {
  await applyD1Migrations((env as any).MASTER_DB, (env as any).TEST_MIGRATIONS);
  sa = await superAdminToken(env, { id: `${P}-0000000000a1`, email: 'owner-r309@platform.test' });
});

beforeEach(() => {
  queued.length = 0;
  fetchMock = vi.fn(async (input: any, init: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith(PROVISIONER)) return provisioner(url, init);
    return new Response('{}', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  provisioner = () => ok({ status: 'active' });
});
afterEach(() => vi.unstubAllGlobals());

/** A created site, ready for the consumer. */
async function newSite(): Promise<{ siteId: string; tenant: Awaited<ReturnType<typeof makeTenant>> }> {
  const tenant = await makeTenant();
  const res = await call('POST', `/admin/tenants/${tenant.id}/wordpress`, sa, {});
  expect(res.status).toBe(202);
  return { siteId: (await json(res)).data.site.id, tenant };
}

describe('request signing', () => {
  it('matches the provisioner vector and builds the documented string', async () => {
    const body = '{"siteId":"s1"}';
    expect(canonicalString('1800000000', 'post', '/sites', body)).toBe('1800000000\nPOST\n/sites\n{"siteId":"s1"}');
    // The same fixed vector is asserted in oci-provisioner/test/signature.test.mjs against node:crypto.
    expect(await hmacHex('secret-key-for-vector-test-0001', canonicalString('1800000000', 'POST', '/sites', body)))
      .toBe('27582f384e2d9b401e88cab1a016720f6681673946adb7b1b6cde87f2d4b2780');
    const h = await signProvisionerRequest('k'.repeat(24), { method: 'GET', path: '/sites/a', nowMs: 1_800_000_000_999 });
    expect(h['X-Timestamp']).toBe('1800000000');
    expect(h['X-Signature']).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('admin endpoints', () => {
  it('refuses everyone but a super admin: 401 without a token, 403 for an agency user and for a read-only operator', async () => {
    const tenant = await makeTenant();
    const agencyToken = await signAccessToken({ userId: `${P}-1111111111aa`, tenantId: tenant.id, role: 'admin', email: tenant.adminEmail }, (env as any).JWT_SECRET);
    const viewer = await superAdminToken(env, { id: `${P}-0000000000a2`, email: 'viewer-r309@platform.test', role: 'viewer' });

    expect((await call('GET', '/admin/wordpress', null)).status).toBe(401);
    expect((await call('GET', '/admin/wordpress', agencyToken)).status).toBe(403);
    expect((await call('POST', `/admin/tenants/${tenant.id}/wordpress`, agencyToken, {})).status).toBe(403);
    expect((await call('POST', '/admin/wordpress/anything/retry', agencyToken)).status).toBe(403);
    expect((await call('GET', '/admin/wordpress', viewer)).status).toBe(200);
    expect((await call('POST', `/admin/tenants/${tenant.id}/wordpress`, viewer, {})).status).toBe(403);
    expect((await master('SELECT COUNT(*) AS n FROM wordpress_sites WHERE tenant_id = ?', tenant.id).first<any>()).n).toBe(0);
  });

  it('creates a queued site, audits it, sends one queue message, and refuses a second site for the same agency', async () => {
    const tenant = await makeTenant();
    const res = await call('POST', `/admin/tenants/${tenant.id}/wordpress`, sa, { primaryColor: '#112233' });
    expect(res.status).toBe(202);
    const site = (await json(res)).data.site;
    expect(site).toMatchObject({ status: 'queued', attempts: 0, subdomain: tenant.subdomain, siteUrl: `https://${tenant.subdomain}.sites.r309.test` });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ type: 'wp-provision', data: { siteId: site.id } });

    const saved = await row(site.id);
    expect(JSON.parse(saved.request_json)).toMatchObject({ adminEmail: tenant.adminEmail, primaryColor: '#112233' });

    const audit = await master(`SELECT action, entity_id FROM super_admin_audit_log WHERE entity_id = ? AND action = 'wordpress.requested'`, site.id).first<any>();
    expect(audit).toBeTruthy();

    const again = await call('POST', `/admin/tenants/${tenant.id}/wordpress`, sa, {});
    expect(again.status).toBe(409);
    expect((await json(again)).error.code).toBe('ALREADY_EXISTS');
    expect(queued).toHaveLength(1);
    expect((await master('SELECT COUNT(*) AS n FROM wordpress_sites WHERE tenant_id = ?', tenant.id).first<any>()).n).toBe(1);
  });

  it('404 for an unknown agency or site, 422 when no admin email can be found', async () => {
    expect((await call('POST', `/admin/tenants/${P}-nope/wordpress`, sa, {})).status).toBe(404);
    expect((await call('POST', `/admin/wordpress/${P}-nope/retry`, sa)).status).toBe(404);
    const tenant = await makeTenant();
    await master('UPDATE tenants SET owner_email = NULL WHERE id = ?', tenant.id).run();
    expect((await call('POST', `/admin/tenants/${tenant.id}/wordpress`, sa, {})).status).toBe(422);
  });
});

describe('queue consumer', () => {
  it('posts a correctly signed request to the provisioner and marks the site active with its address', async () => {
    const { siteId, tenant } = await newSite();
    provisioner = () => ok({ status: 'active', slug: tenant.subdomain, siteUrl: `https://${tenant.subdomain}.sites.r309.test`, adminUrl: `https://${tenant.subdomain}.sites.r309.test/wp-admin/`, containerId: `wp-site-${tenant.subdomain}` });

    const outcome = await handleWpProvisionJob({ siteId }, testEnv);
    expect(outcome).toEqual({});

    const calls = fetchMock.mock.calls.filter(([u]) => String(u).startsWith(PROVISIONER));
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0] as [string, RequestInit];
    expect(url).toBe(`${PROVISIONER}/sites`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    expect(JSON.parse(body)).toMatchObject({ siteId, slug: tenant.subdomain, domain: `${tenant.subdomain}.sites.r309.test`, adminEmail: tenant.adminEmail });
    // Recompute the signature independently from the documented string.
    const expected = await hmacHex(SECRET, `${headers['X-Timestamp']}\nPOST\n/sites\n${body}`);
    expect(headers['X-Signature']).toBe(expected);
    expect(Math.abs(Number(headers['X-Timestamp']) - Date.now() / 1000)).toBeLessThan(30);
    expect(body).not.toContain(SECRET);

    const saved = await row(siteId);
    expect(saved).toMatchObject({ status: 'active', error_message: null, wp_admin_url: `https://${tenant.subdomain}.sites.r309.test/wp-admin/`, container_id: `wp-site-${tenant.subdomain}` });
    expect(saved.provisioned_at).toBeTruthy();
    expect(await events(siteId)).toEqual(expect.arrayContaining(['requested', 'attempt_started', 'active', 'welcome_email_sent']));
  });

  it('sends the agency admin an email with the site address and no credentials', async () => {
    const { siteId, tenant } = await newSite();
    await processSite(testEnv, siteId);
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request(`http://localhost/api/v1/test/outbox?to=${encodeURIComponent(tenant.adminEmail)}`), testEnv, ctx);
    await waitOnExecutionContext(ctx);
    const mails = (await json(res)).data as Array<{ template: string; html: string; text: string; subject: string }>;
    const mail = mails.find((m) => m.template === 'website_ready');
    expect(mail).toBeTruthy();
    expect(mail!.text).toContain(`https://${tenant.subdomain}.sites.r309.test`);
    expect(`${mail!.html}${mail!.text}`.toLowerCase()).not.toMatch(/password:|temporary password/);
  });

  it('is idempotent: a second delivery for an active site calls nothing, a second create makes no second site', async () => {
    const { siteId } = await newSite();
    await processSite(testEnv, siteId);
    const before = fetchMock.mock.calls.filter(([u]) => String(u).startsWith(PROVISIONER)).length;
    expect(await processSite(testEnv, siteId)).toEqual({});
    expect(fetchMock.mock.calls.filter(([u]) => String(u).startsWith(PROVISIONER)).length).toBe(before);
    expect((await row(siteId)).status).toBe('active');
  });

  it('retries a 500 with backoff and ends failed with the reason after three attempts', async () => {
    const { siteId } = await newSite();
    provisioner = () => ok({ error: 'docker daemon not running' }, 500);

    const first = await processSite(testEnv, siteId);
    expect(first).toEqual({ retryInSeconds: 60 });
    expect(await row(siteId)).toMatchObject({ status: 'queued', attempts: 1 });
    expect((await row(siteId)).error_message).toContain('500');

    const second = await processSite(testEnv, siteId);
    expect(second).toEqual({ retryInSeconds: 300 });
    expect(await row(siteId)).toMatchObject({ status: 'queued', attempts: 2 });

    const third = await processSite(testEnv, siteId);
    expect(third).toEqual({});
    const failed = await row(siteId);
    expect(failed.status).toBe('failed');
    expect(failed.attempts).toBe(MAX_ATTEMPTS);
    expect(failed.error_message).toContain('docker daemon not running');
    expect(failed.error_message).toContain('3 attempts');
    expect(fetchMock.mock.calls.filter(([u]) => String(u).startsWith(PROVISIONER))).toHaveLength(3);
    expect(await events(siteId)).toEqual(expect.arrayContaining(['attempt_failed', 'failed']));

    // A late duplicate message does not start a fourth attempt.
    await processSite(testEnv, siteId);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).startsWith(PROVISIONER))).toHaveLength(3);
  });

  it('retries a network failure, and fails at once on a refusal (401) and on missing configuration', async () => {
    const net = await newSite();
    provisioner = () => { throw new TypeError('fetch failed'); };
    expect(await processSite(testEnv, net.siteId)).toEqual({ retryInSeconds: 60 });
    expect((await row(net.siteId)).error_message).toContain('Could not reach the provisioner');

    const refused = await newSite();
    provisioner = () => ok({ error: 'Unauthorized' }, 401);
    expect(await processSite(testEnv, refused.siteId)).toEqual({});
    expect(await row(refused.siteId)).toMatchObject({ status: 'failed', attempts: 0 });
    expect((await row(refused.siteId)).error_message).toContain('401');

    const unconfigured = await newSite();
    const bare = { ...testEnv, OCI_PROVISIONER_URL: undefined };
    expect(await processSite(bare, unconfigured.siteId)).toEqual({});
    expect((await row(unconfigured.siteId)).error_message).toContain('OCI_PROVISIONER_URL is not set');
  });

  it('keeps polling while the provisioner is still building, without counting a failed attempt', async () => {
    const { siteId } = await newSite();
    provisioner = () => ok({ status: 'provisioning' }, 202);
    expect(await processSite(testEnv, siteId)).toEqual({ retryInSeconds: 30 });
    expect(await row(siteId)).toMatchObject({ status: 'provisioning', attempts: 0 });
    expect(await processSite(testEnv, siteId)).toEqual({ retryInSeconds: 30 });
    provisioner = () => ok({ status: 'active' });
    await processSite(testEnv, siteId);
    expect((await row(siteId)).status).toBe('active');
  });

  it('fails a build that has run for more than 30 minutes', async () => {
    const { siteId } = await newSite();
    provisioner = () => ok({ status: 'provisioning' }, 202);
    await processSite(testEnv, siteId);
    await master(`UPDATE wordpress_sites SET started_at = '2020-01-01T00:00:00Z' WHERE id = ?`, siteId).run();
    await processSite(testEnv, siteId);
    expect(await row(siteId)).toMatchObject({ status: 'failed' });
    expect((await row(siteId)).error_message).toContain('Timed out');
  });

  it('through handleQueue: a delayed retry is requested for the message, and a finished job is acknowledged', async () => {
    const { siteId } = await newSite();
    const msg = (): any => ({ body: { type: 'wp-provision', data: { siteId } }, ack: vi.fn(), retry: vi.fn() });

    provisioner = () => ok({ error: 'boom' }, 503);
    const m1 = msg();
    await handleQueue({ queue: 'travelcrm-wp-provision-queue', messages: [m1] } as any, testEnv);
    expect(m1.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(m1.ack).not.toHaveBeenCalled();

    provisioner = () => ok({ status: 'active' });
    const m2 = msg();
    await handleQueue({ queue: 'travelcrm-wp-provision-queue', messages: [m2] } as any, testEnv);
    expect(m2.ack).toHaveBeenCalled();
    expect(m2.retry).not.toHaveBeenCalled();
    expect((await row(siteId)).status).toBe('active');
  });
});

describe('retry and status in the console API', () => {
  it('a failed site can be retried by the super admin: queued again, attempts reset, history kept; other states cannot', async () => {
    const { siteId } = await newSite();
    provisioner = () => ok({ error: 'nope' }, 400);
    await processSite(testEnv, siteId);
    expect((await row(siteId)).status).toBe('failed');

    queued.length = 0;
    const res = await call('POST', `/admin/wordpress/${siteId}/retry`, sa);
    expect(res.status).toBe(202);
    expect((await json(res)).data.site).toMatchObject({ status: 'queued', attempts: 0 });
    expect(queued).toHaveLength(1);
    expect(queued[0].data.siteId).toBe(siteId);
    expect(await master(`SELECT 1 AS x FROM super_admin_audit_log WHERE entity_id = ? AND action = 'wordpress.retried'`, siteId).first()).toBeTruthy();

    // Queued is not retryable; once active it is not either.
    expect((await call('POST', `/admin/wordpress/${siteId}/retry`, sa)).status).toBe(409);
    provisioner = () => ok({ status: 'active' });
    await processSite(testEnv, siteId);
    expect((await row(siteId)).status).toBe('active');
    expect((await call('POST', `/admin/wordpress/${siteId}/retry`, sa)).status).toBe(409);
    expect(await events(siteId)).toEqual(expect.arrayContaining(['retry_requested', 'failed', 'active']));
  });

  it('lists sites with status, counts, last error and per-site history', async () => {
    const { siteId, tenant } = await newSite();
    provisioner = () => ok({ error: 'disk full' }, 500);
    await processSite(testEnv, siteId);

    const list = await json(await call('GET', '/admin/wordpress', sa));
    const mine = list.data.sites.find((s: any) => s.id === siteId);
    expect(mine).toMatchObject({ status: 'queued', attempts: 1, companyName: expect.stringContaining('R309 Agency'), subdomain: tenant.subdomain });
    expect(mine.lastError).toContain('disk full');
    expect(list.data.counts.queued).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(list)).not.toContain('request_json');

    const filtered = await json(await call('GET', '/admin/wordpress?status=failed', sa));
    expect(filtered.data.sites.every((s: any) => s.status === 'failed')).toBe(true);

    const detail = await json(await call('GET', `/admin/wordpress/${siteId}`, sa));
    expect(detail.data.site.id).toBe(siteId);
    expect(detail.data.history.map((h: any) => h.event)).toEqual(expect.arrayContaining(['requested', 'attempt_started', 'attempt_failed']));
    expect((await call('GET', `/admin/wordpress/${P}-nope`, sa)).status).toBe(404);
  });
});

describe('cron sweep', () => {
  it('queues a site again when nothing has happened for ten minutes, and leaves fresh and finished ones alone', async () => {
    const stale = await newSite();
    const fresh = await newSite();
    const done = await newSite();
    await processSite(testEnv, done.siteId);
    await master(`UPDATE wordpress_sites SET updated_at = '2020-01-01T00:00:00Z' WHERE id IN (?, ?)`, stale.siteId, done.siteId).run();

    queued.length = 0;
    const resent = await sweepWordpressSites(testEnv, new Date());
    expect(resent).toBeGreaterThanOrEqual(1);
    const ids = queued.map((m) => m.data.siteId);
    expect(ids).toContain(stale.siteId);
    expect(ids).not.toContain(fresh.siteId);
    expect(ids).not.toContain(done.siteId);
    expect(await events(stale.siteId)).toContain('resent_by_cron');
  });
});
