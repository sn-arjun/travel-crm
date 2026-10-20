import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import worker from '../src/index';
import { superAdminToken } from './utils/super-admin';
import { signAccessToken } from '../src/utils/jwt';
import { LocalTenantProvisioner } from '../src/services/tenancy/local-provisioner';
import { generateTemporaryPassword } from '../src/services/tenancy/seed-tenant';
import { TENANT_MIGRATIONS } from '../src/db/tenant-migrations.generated';
import { bumpCatalogueVersion } from '../src/services/plans/catalogue';

const testEnv = env as any;
// Binding for the platform pseudo-tenant that carries the super admin's token (tenant middleware needs a database).
const multiEnv = { ...testEnv, TENANCY_MODE: 'multi', TENANT_DB_PLATFORM: testEnv.MASTER_DB };

const PLATFORM_TENANT = '0196a104-0000-7000-8000-0000000000aa';
const SUPER_EMAIL = 'super-r104@platform.test';
const POOLS = ['TENANT_DB_POOL_1', 'TENANT_DB_POOL_2', 'TENANT_DB_POOL_3'];

let superToken = '';
const created: string[] = [];
const secrets: string[] = []; // every temporary password handed out; none may reach the logs

async function call(e: any, method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
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

const agency = (key: string, over: Record<string, unknown> = {}) => ({
  companyName: `Agency ${key}`,
  slug: `r104-${key}`,
  ownerName: `Owner ${key}`,
  ownerEmail: `owner-${key}@r104.test`,
  plan: 'pro',
  country: 'India',
  currency: 'INR',
  timezone: 'Asia/Kolkata',
  taxSystem: 'gst',
  region: 'in',
  ...over,
});

async function create(e: any, body: Record<string, unknown>) {
  const res = await call(e, 'POST', '/admin/tenants', superToken, body);
  const json = (await res.json()) as any;
  if (json?.data?.tenantId) created.push(json.data.tenantId);
  if (json?.data?.temporaryPassword) secrets.push(json.data.temporaryPassword);
  return { res, json };
}

async function masterRow(sql: string, ...binds: unknown[]): Promise<any> {
  return testEnv.MASTER_DB.prepare(sql).bind(...binds).first();
}

async function releasePools() {
  await testEnv.MASTER_DB.prepare(`UPDATE tenants SET db_binding = NULL WHERE db_binding LIKE 'TENANT_DB_POOL_%'`).run();
  const local = new LocalTenantProvisioner(testEnv);
  for (const pool of POOLS) await local.dropDatabase({ databaseId: pool, binding: pool });
}

/** A D1 wrapper whose Nth batch() call throws: simulates a database that dies mid-provisioning. */
function flakyDb(real: D1Database, failOnBatch: number): D1Database {
  let n = 0;
  return {
    prepare: (sql: string) => real.prepare(sql),
    batch: (stmts: D1PreparedStatement[]) => {
      if (++n === failOnBatch) throw new Error('simulated database failure');
      return real.batch(stmts);
    },
    exec: (sql: string) => real.exec(sql),
  } as unknown as D1Database;
}

describe('tenant provisioning (POST /admin/tenants)', () => {
  const logs: string[] = [];

  beforeAll(async () => {
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      });
    }
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    await releasePools(); // other test files park agencies on the pool databases
    await testEnv.MASTER_DB
      .prepare(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, db_binding) VALUES (?, 'Platform', 'r104-platform', 'enterprise', 'active', 'TENANT_DB_PLATFORM')`)
      .bind(PLATFORM_TENANT)
      .run();
    await testEnv.MASTER_DB
      .prepare(`INSERT OR REPLACE INTO super_admins (id, email, name, password_hash, role, is_active) VALUES (?, ?, 'R104 Super', 'unused', 'super_admin', 1)`)
      .bind('0196a104-0000-7000-8000-0000000000ab', SUPER_EMAIL)
      .run();
    superToken = await superAdminToken(testEnv, { id: '0196a104-0000-7000-8000-0000000000ab', email: SUPER_EMAIL, name: 'R104 Super' });
  });

  afterAll(async () => {
    for (const id of created) {
      await testEnv.MASTER_DB.batch([
        testEnv.MASTER_DB.prepare('DELETE FROM tenant_users WHERE tenant_id = ?').bind(id),
        testEnv.MASTER_DB.prepare('DELETE FROM subscriptions WHERE tenant_id = ?').bind(id),
        testEnv.MASTER_DB.prepare('DELETE FROM tenants WHERE id = ?').bind(id),
      ]);
    }
    await testEnv.MASTER_DB.prepare('DELETE FROM tenants WHERE id = ?').bind(PLATFORM_TENANT).run();
    await releasePools();
    vi.restoreAllMocks();
  });

  let a: any;
  let b: any;

  it('creates agencies A and B, each on its own pool database', async () => {
    const ra = await create(multiEnv, agency('a'));
    const rb = await create(multiEnv, agency('b', { plan: 'trial' }));
    expect(ra.res.status).toBe(201);
    expect(rb.res.status).toBe(201);
    a = ra.json.data;
    b = rb.json.data;
    expect(a.provisioningStatus).toBe('active');
    expect(a.temporaryPassword).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(a.adminEmail).toBe('owner-a@r104.test');

    const rowA = await masterRow('SELECT * FROM tenants WHERE id = ?', a.tenantId);
    const rowB = await masterRow('SELECT * FROM tenants WHERE id = ?', b.tenantId);
    expect(rowA.db_binding).toBe('TENANT_DB_POOL_1');
    expect(rowB.db_binding).toBe('TENANT_DB_POOL_2');
    expect(rowA.status).toBe('active');
    expect(rowB.status).toBe('trial');
    expect(rowA.provisioning_status).toBe('active');
    expect(rowA.owner_email).toBe('owner-a@r104.test');
    expect(rowA.region).toBe('in');
    const sub = await masterRow('SELECT plan, status FROM subscriptions WHERE tenant_id = ?', a.tenantId);
    expect(sub.plan).toBe('pro');
    const link = await masterRow('SELECT user_id FROM tenant_users WHERE tenant_id = ? AND email = ?', a.tenantId, 'owner-a@r104.test');
    expect(link.user_id).toBeTruthy();
  });

  it('migrated the pool database and recorded every migration in d1_migrations', async () => {
    const { results } = await testEnv.TENANT_DB_POOL_1.prepare('SELECT name FROM d1_migrations ORDER BY id').all();
    expect(results.map((r: any) => r.name)).toEqual(TENANT_MIGRATIONS.map((m) => m.name));
    const col = await testEnv.TENANT_DB_POOL_1.prepare(`SELECT COUNT(*) AS n FROM pragma_table_info('users') WHERE name = 'must_change_password'`).first();
    expect(col.n).toBe(1);
  });

  it('the temporary password logs in for that tenant and flags mustChangePassword', async () => {
    const res = await call(multiEnv, 'POST', '/auth/login', null, { email: a.adminEmail, password: a.temporaryPassword, tenantId: a.tenantId });
    expect(res.status).toBe(200);
    const data = ((await res.json()) as any).data;
    expect(data.mustChangePassword).toBe(true);
    expect(data.user.role).toBe('admin');
    expect(data.tenant.name).toBe('Agency a');
    expect(data.tenant.currency).toBe('INR');

    const wrong = await call(multiEnv, 'POST', '/auth/login', null, { email: a.adminEmail, password: 'not-the-password', tenantId: a.tenantId });
    expect(wrong.status).toBe(401);
    // A's credentials do not work against B.
    const cross = await call(multiEnv, 'POST', '/auth/login', null, { email: a.adminEmail, password: a.temporaryPassword, tenantId: b.tenantId });
    expect(cross.status).toBe(401);
  });

  it('the admin sees an empty database that is isolated from the other agency and from MASTER_DB', async () => {
    const loginA = await call(multiEnv, 'POST', '/auth/login', null, { email: a.adminEmail, password: a.temporaryPassword, tenantId: a.tenantId });
    const dataA = ((await loginA.json()) as any).data;
    // R113: the temporary-password token cannot read data. This test is about isolation, so it uses a session
    // of the same admin without the restriction (the forced change itself is covered by first-login.test.ts).
    expect((await call(multiEnv, 'GET', '/contacts', dataA.accessToken)).status).toBe(403);
    const tokenA = await signAccessToken({ userId: dataA.user.id, tenantId: a.tenantId, role: 'admin', email: a.adminEmail, db: 'TENANT_DB_POOL_1' }, testEnv.JWT_SECRET);
    const loginB = await call(multiEnv, 'POST', '/auth/login', null, { email: b.adminEmail, password: b.temporaryPassword, tenantId: b.tenantId });
    expect(loginB.status).toBe(200);

    for (const path of ['/contacts', '/leads']) {
      const res = await call(multiEnv, 'GET', path, tokenA);
      expect(res.status).toBe(200);
      expect(((await res.json()) as any).data).toEqual([]);
    }
    const created = await call(multiEnv, 'POST', '/contacts', tokenA, { name: 'Only In Agency A R104', phone: '9000004104', type: 'customer' });
    expect(created.status).toBe(201);
    const count = async (db: D1Database) =>
      ((await db.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE name = 'Only In Agency A R104'`).first()) as any).n;
    expect([await count(testEnv.TENANT_DB_POOL_1), await count(testEnv.TENANT_DB_POOL_2), await count(testEnv.MASTER_DB)]).toEqual([1, 0, 0]);

    const seeded = await testEnv.TENANT_DB_POOL_1.prepare('SELECT email, role, must_change_password FROM users').all();
    expect(seeded.results).toEqual([{ email: 'owner-a@r104.test', role: 'admin', must_change_password: 1 }]);
    const settingRows = await testEnv.TENANT_DB_POOL_1.prepare('SELECT key, value FROM settings').all();
    const settings = Object.fromEntries(settingRows.results.map((r: any) => [r.key, r.value]));
    expect(settings).toMatchObject({ company_name: 'Agency a', country: 'India', currency: 'INR', timezone: 'Asia/Kolkata', tax_system: 'gst', onboarding_completed: 'false', locale: 'en-IN', phone_default_country: 'IN' });
    const inMaster = await masterRow(`SELECT COUNT(*) AS n FROM users WHERE email = 'owner-a@r104.test'`);
    expect(inMaster.n).toBe(0);
  });

  it('puts the welcome email in the outbox for the owner', async () => {
    const res = await call(multiEnv, 'GET', `/test/outbox?to=${encodeURIComponent('owner-a@r104.test')}`, null);
    const mails = ((await res.json()) as any).data as any[];
    const welcome = mails.find((m) => m.template === 'welcome_admin');
    expect(welcome).toBeTruthy();
    expect(welcome.subject).toContain('Agency a');
    expect(welcome.text).toContain(a.temporaryPassword);
    expect(welcome.tenantId).toBe(a.tenantId);
  });

  it('rejects a duplicate slug with 409 and creates nothing', async () => {
    const before = await masterRow('SELECT COUNT(*) AS n FROM tenants');
    const { res, json } = await create(multiEnv, agency('dup', { slug: 'r104-a' }));
    expect(res.status).toBe(409);
    expect(json.error.code).toBe('SLUG_TAKEN');
    expect((await masterRow('SELECT COUNT(*) AS n FROM tenants')).n).toBe(before.n);
  });

  it('validates the body', async () => {
    const { res } = await create(multiEnv, agency('bad', { slug: 'Bad Slug!', plan: 'platinum' }));
    expect(res.status).toBe(400);
  });

  it('refuses a tenant admin and anonymous callers', async () => {
    const login = await call(multiEnv, 'POST', '/auth/login', null, { email: a.adminEmail, password: a.temporaryPassword, tenantId: a.tenantId });
    const tenantAdminToken = ((await login.json()) as any).data.accessToken;
    expect((await call(multiEnv, 'POST', '/admin/tenants', tenantAdminToken, agency('nope'))).status).toBe(403);
    expect((await call(multiEnv, 'POST', '/admin/tenants', null, agency('nope'))).status).toBe(401);
    expect(await masterRow(`SELECT id FROM tenants WHERE subdomain = 'r104-nope'`)).toBeNull();
  });

  it('writes exactly one audit row per create', async () => {
    const { results } = await testEnv.MASTER_DB
      .prepare(`SELECT action, entity_type, entity_id, details FROM super_admin_audit_log WHERE entity_id IN (?, ?) ORDER BY created_at`)
      .bind(a.tenantId, b.tenantId)
      .all();
    expect(results).toHaveLength(2);
    expect(results.every((r: any) => r.action === 'tenant.create' && r.entity_type === 'tenant')).toBe(true);
    const details = JSON.parse(results[0].details);
    expect(details.actor).toBe(SUPER_EMAIL);
    expect(JSON.stringify(results)).not.toContain(a.temporaryPassword);
  });

  it('a failed provisioning rolls back, leaves nothing behind, and a retry resumes cleanly', async () => {
    // Pool 3 is the only free slot; its database dies on the 3rd batch (a migration).
    const flakyEnv = { ...multiEnv, TENANT_DB_POOL_3: flakyDb(testEnv.TENANT_DB_POOL_3, 3) };
    const { res, json } = await create(flakyEnv, agency('retry'));
    expect(res.status).toBe(502);
    expect(json.error.details.step).toBe('migrating');
    expect(json.error.details.retryable).toBe(true);
    const tenantId = json.error.details.tenantId as string;
    created.push(tenantId);

    const row = await masterRow('SELECT * FROM tenants WHERE id = ?', tenantId);
    expect(row.provisioning_status).toBe('failed');
    expect(row.provisioning_error).toMatch(/^migrating:/);
    expect(row.db_binding).toBeNull();
    expect(row.d1_database_id).toBeNull();
    expect(row.status).toBe('provisioning');
    expect(await masterRow('SELECT id FROM tenant_users WHERE tenant_id = ?', tenantId)).toBeNull();
    // The pool database was wiped: no tables, so the slot is reusable.
    const tables = await testEnv.TENANT_DB_POOL_3.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`).first();
    expect(tables.n).toBe(0);

    const status = await call(multiEnv, 'GET', `/admin/tenants/${tenantId}/provisioning`, superToken);
    expect(((await status.json()) as any).data).toMatchObject({ provisioningStatus: 'failed', tenantStatus: 'provisioning' });

    // The failed agency cannot sign in, and the slug stays reserved for the retry.
    expect((await call(multiEnv, 'POST', '/auth/login', null, { email: 'owner-retry@r104.test', password: 'x', tenantId })).status).toBe(400);
    expect((await create(multiEnv, agency('retry2', { slug: 'r104-retry' }))).res.status).toBe(409);

    const retry = await call(multiEnv, 'POST', `/admin/tenants/${tenantId}/retry`, superToken);
    expect(retry.status).toBe(200);
    const data = ((await retry.json()) as any).data;
    secrets.push(data.temporaryPassword);
    expect(data.provisioningStatus).toBe('active');

    const login = await call(multiEnv, 'POST', '/auth/login', null, { email: data.adminEmail, password: data.temporaryPassword, tenantId });
    expect(login.status).toBe(200);
    const final = await masterRow('SELECT * FROM tenants WHERE id = ?', tenantId);
    expect(final.db_binding).toBe('TENANT_DB_POOL_3');
    expect(final.provisioning_error).toBeNull();
    expect(final.status).toBe('active');

    // Retrying something that is not failed is refused.
    expect((await call(multiEnv, 'POST', `/admin/tenants/${tenantId}/retry`, superToken)).status).toBe(409);
    expect((await call(multiEnv, 'POST', '/admin/tenants/00000000-0000-0000-0000-00000000dead/retry', superToken)).status).toBe(404);

    const audits = await testEnv.MASTER_DB.prepare(`SELECT action FROM super_admin_audit_log WHERE entity_id = ? ORDER BY created_at, rowid`).bind(tenantId).all();
    expect(audits.results.map((r: any) => r.action)).toEqual(['tenant.create_failed', 'tenant.provision_retry']);
  });

  it('a fourth agency when the pool of 3 is used gets 409 POOL_EXHAUSTED and leaves no orphan rows', async () => {
    const { res, json } = await create(multiEnv, agency('d'));
    expect(res.status).toBe(409);
    expect(json.error.code).toBe('POOL_EXHAUSTED');
    expect(await masterRow(`SELECT id FROM tenants WHERE subdomain = 'r104-d'`)).toBeNull();
    expect(await masterRow(`SELECT COUNT(*) AS n FROM subscriptions WHERE tenant_id NOT IN (SELECT id FROM tenants)`)).toEqual({ n: 0 });
    // The slug is free again.
    expect((await masterRow(`SELECT COUNT(*) AS n FROM tenant_users WHERE email = 'owner-d@r104.test'`)).n).toBe(0);
  });

  it('single-database mode (dev parity) provisions without a pool', async () => {
    const singleEnv = { ...testEnv, TENANCY_MODE: 'single' };
    const keysBefore = new Set(((await testEnv.MASTER_DB.prepare('SELECT key FROM settings').all()).results as any[]).map((r) => r.key));
    const { res, json } = await create(singleEnv, agency('single'));
    expect(res.status).toBe(201);
    expect(json.data.provisioningStatus).toBe('active');
    const row = await masterRow('SELECT db_binding FROM tenants WHERE id = ?', json.data.tenantId);
    expect(row.db_binding).toBeNull();
    const login = await call(singleEnv, 'POST', '/auth/login', null, { email: json.data.adminEmail, password: json.data.temporaryPassword, tenantId: json.data.tenantId });
    expect(login.status).toBe(200);
    // An Indian agency is billed at the India price, in rupees (the founder price of PRICING.md 7.2).
    expect(await masterRow('SELECT amount, currency FROM subscriptions WHERE tenant_id = ?', json.data.tenantId)).toEqual({ amount: 23999, currency: 'INR' });
    await cleanSharedDb(keysBefore, 'owner-single@r104.test');
  });

  it('a UK agency is billed in its own market and currency, and starts with its own locale and phone code', async () => {
    const singleEnv = { ...testEnv, TENANCY_MODE: 'single' };
    const keysBefore = new Set(((await testEnv.MASTER_DB.prepare('SELECT key FROM settings').all()).results as any[]).map((r) => r.key));
    // GB is its own catalogue market (UK, GBP): the approved Pro founder price, no price row added by the test.
    try {
      const { res, json } = await create(singleEnv, agency('uk', { country: 'United Kingdom', currency: 'GBP', timezone: 'Europe/London', taxSystem: 'vat', region: 'uk' }));
      expect(res.status).toBe(201);
      expect(await masterRow('SELECT amount, currency FROM subscriptions WHERE tenant_id = ?', json.data.tenantId)).toEqual({ amount: 719, currency: 'GBP' });
      const login = await call(singleEnv, 'POST', '/auth/login', null, { email: json.data.adminEmail, password: json.data.temporaryPassword, tenantId: json.data.tenantId });
      const tenant = ((await login.json()) as any).data.tenant;
      expect(tenant).toMatchObject({ currency: 'GBP', locale: 'en-GB', country: 'GB', phoneDefaultCountry: 'GB', timezone: 'Europe/London' });
    } finally {
      await cleanSharedDb(keysBefore, 'owner-uk@r104.test');
    }
  });

  /** In single-database mode the shared database is MASTER_DB: remove what the agency added so other test files see the old state. */
  async function cleanSharedDb(keysBefore: Set<string>, ownerEmail: string) {
    const user = await masterRow(`SELECT id FROM users WHERE email = ?`, ownerEmail);
    for (const table of ['login_history', 'activity_logs']) await testEnv.MASTER_DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(user.id).run();
    await testEnv.MASTER_DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
    const keysAfter = ((await testEnv.MASTER_DB.prepare('SELECT key FROM settings').all()).results as any[]).map((r) => r.key);
    for (const key of keysAfter.filter((k) => !keysBefore.has(k))) await testEnv.MASTER_DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
  }

  it('generates 16-character alphanumeric passwords with all three classes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const p = generateTemporaryPassword();
      expect(p).toMatch(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z0-9]{16}$/);
      seen.add(p);
    }
    expect(seen.size).toBe(50);
  });

  it('never wrote a temporary password to the logs', () => {
    expect(secrets.length).toBeGreaterThanOrEqual(3);
    const output = logs.join('\n');
    for (const secret of secrets) expect(output).not.toContain(secret);
  });
});
