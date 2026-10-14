import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { hashPassword } from '../src/utils/password';
import { signAccessToken } from '../src/utils/jwt';
import { bindingNameFor } from '../src/services/tenant-db';

const testEnv = env as any;
const multiEnv = { ...testEnv, TENANCY_MODE: 'multi' };

// Unique ids: storage is shared across test files (isolatedStorage is false).
const TENANT: Record<string, string> = {
  A: '0196a101-0000-7000-8000-00000000000a',
  B: '0196a101-0000-7000-8000-00000000000b',
  C: '0196a101-0000-7000-8000-00000000000c',
  GHOST: '0196a101-0000-7000-8000-00000000000d', // binding names a pool that does not exist
  NOBINDING: '0196a101-0000-7000-8000-0000000000f0',
};
const POOL: Record<string, string> = { A: 'TENANT_DB_POOL_1', B: 'TENANT_DB_POOL_2', C: 'TENANT_DB_POOL_3' };
const SUFFIX: Record<string, string> = { A: 'a', B: 'b', C: 'c' };
const PASSWORD = 'Isolation@123';
const emailOf = (k: string) => `admin-${k.toLowerCase()}@isolation.test`;
const userOf = (k: string) => `0196a101-1111-7000-8000-00000000000${SUFFIX[k]}`;
const leadOf = (k: string) => `0196a101-2222-7000-8000-00000000000${SUFFIX[k]}`;
const contactOf = (k: string) => `0196a101-3333-7000-8000-00000000000${SUFFIX[k]}`;

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

async function insertTenant(id: string, sub: string, binding: string | null, status = 'active') {
  await testEnv.MASTER_DB
    .prepare(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, db_binding) VALUES (?, ?, ?, 'pro', ?, ?)`)
    .bind(id, `Isolation ${sub}`, `iso-${sub}`, status, binding)
    .run();
}

async function tokenFor(tenantId: string): Promise<string> {
  return signAccessToken({ userId: 'ghost-user', tenantId, role: 'admin', email: 'ghost@isolation.test' }, testEnv.JWT_SECRET);
}

describe('tenant isolation in multi-tenant mode', () => {
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    for (const pool of Object.values(POOL)) await applyD1Migrations(testEnv[pool], testEnv.TEST_MIGRATIONS);

    const hash = await hashPassword(PASSWORD);
    for (const k of ['A', 'B', 'C']) {
      const db: D1Database = testEnv[POOL[k]];
      await insertTenant(TENANT[k], k.toLowerCase(), POOL[k]);
      await testEnv.MASTER_DB
        .prepare(`INSERT OR REPLACE INTO tenant_users (id, tenant_id, email, user_id, role, is_active) VALUES (?, ?, ?, ?, 'admin', 1)`)
        .bind(`0196a101-4444-7000-8000-00000000000${SUFFIX[k]}`, TENANT[k], emailOf(k), userOf(k))
        .run();
      await db
        .prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, role, name, is_active) VALUES (?, ?, ?, 'admin', ?, 1)`)
        .bind(userOf(k), emailOf(k), hash, `Admin ${k}`)
        .run();
      await db.prepare(`INSERT OR REPLACE INTO contacts (id, name, type) VALUES (?, ?, 'customer')`).bind(contactOf(k), `Contact ${k}`).run();
      await db
        .prepare(`INSERT OR REPLACE INTO leads (id, contact_id, title, status) VALUES (?, ?, ?, 'new')`)
        .bind(leadOf(k), contactOf(k), `Lead of agency ${k}`)
        .run();
    }
    for (const k of ['A', 'B', 'C']) {
      const res = await call(multiEnv, 'POST', '/auth/login', null, { email: emailOf(k), password: PASSWORD, tenantId: TENANT[k] });
      expect(res.status).toBe(200);
      tokens[k] = ((await res.json()) as any).data.accessToken;
    }
  });

  it('uses the provisioner binding-name scheme', () => {
    expect(bindingNameFor(TENANT.A)).toMatch(/^TENANT_DB_[0-9a-f]{32}$/);
  });

  it("A's token lists only A's lead", async () => {
    const res = await call(multiEnv, 'GET', '/leads', tokens.A);
    expect(res.status).toBe(200);
    const ids = ((await res.json()) as any).data.map((l: any) => l.id);
    expect(ids).toContain(leadOf('A'));
    expect(ids).not.toContain(leadOf('B'));
    expect(ids).not.toContain(leadOf('C'));
  });

  it('B and C each see only their own lead', async () => {
    for (const k of ['B', 'C']) {
      const ids = ((await (await call(multiEnv, 'GET', '/leads', tokens[k])).json()) as any).data.map((l: any) => l.id);
      expect(ids).toEqual([leadOf(k)]);
    }
  });

  it("A's token cannot read B's lead by id", async () => {
    expect((await call(multiEnv, 'GET', `/leads/${leadOf('A')}`, tokens.A)).status).toBe(200);
    expect((await call(multiEnv, 'GET', `/leads/${leadOf('B')}`, tokens.A)).status).toBe(404);
  });

  it('writes land in the tenant database, not MASTER_DB', async () => {
    const res = await call(multiEnv, 'POST', '/contacts', tokens.A, { name: 'Written Only To Pool One', phone: '9000009001', type: 'customer' });
    expect(res.status).toBe(201);
    const count = async (db: D1Database) =>
      ((await db.prepare(`SELECT COUNT(*) AS n FROM contacts WHERE name = 'Written Only To Pool One'`).first()) as any).n;
    expect([await count(testEnv.TENANT_DB_POOL_1), await count(testEnv.MASTER_DB), await count(testEnv.TENANT_DB_POOL_2)]).toEqual([1, 0, 0]);
  });

  it('a tenant whose db_binding names a missing binding gets 503 TENANT_DB_UNAVAILABLE on requests and on login', async () => {
    await insertTenant(TENANT.GHOST, 'ghost', 'TENANT_DB_nopesuchbinding00000000000000');
    const res = await call(multiEnv, 'GET', '/leads', await tokenFor(TENANT.GHOST));
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).error.code).toBe('TENANT_DB_UNAVAILABLE');

    const login = await call(multiEnv, 'POST', '/auth/login', null, { email: 'ghost@isolation.test', password: 'whatever1', tenantId: TENANT.GHOST });
    expect(login.status).toBe(503);
    expect(((await login.json()) as any).error.code).toBe('TENANT_DB_UNAVAILABLE');
  });

  it('a tenant with no db_binding at all also fails closed', async () => {
    await insertTenant(TENANT.NOBINDING, 'nobinding', null);
    expect((await call(multiEnv, 'GET', '/leads', await tokenFor(TENANT.NOBINDING))).status).toBe(503);
  });

  it('refresh-token for a suspended tenant is rejected with 403 TENANT_INACTIVE', async () => {
    const loginRes = await call(multiEnv, 'POST', '/auth/login', null, { email: emailOf('C'), password: PASSWORD, tenantId: TENANT.C });
    const refreshToken = ((await loginRes.json()) as any).data.refreshToken;
    expect(refreshToken).toBeTruthy();
    await testEnv.MASTER_DB.prepare(`UPDATE tenants SET status = 'suspended' WHERE id = ?`).bind(TENANT.C).run();
    try {
      const res = await call(multiEnv, 'POST', '/auth/refresh-token', null, { refreshToken });
      expect(res.status).toBe(403);
      expect(((await res.json()) as any).error.code).toBe('TENANT_INACTIVE');
    } finally {
      await testEnv.MASTER_DB.prepare(`UPDATE tenants SET status = 'active' WHERE id = ?`).bind(TENANT.C).run();
    }
  });

  it('a cancelled tenant is blocked on requests', async () => {
    await testEnv.MASTER_DB.prepare(`UPDATE tenants SET status = 'cancelled' WHERE id = ?`).bind(TENANT.B).run();
    await testEnv.CACHE.delete(`tenant:v2:${TENANT.B}`);
    try {
      expect((await call(multiEnv, 'GET', '/leads', tokens.B)).status).toBe(403);
    } finally {
      await testEnv.MASTER_DB.prepare(`UPDATE tenants SET status = 'active' WHERE id = ?`).bind(TENANT.B).run();
      await testEnv.CACHE.delete(`tenant:v2:${TENANT.B}`);
    }
  });
});

describe('production guards', () => {
  it('ENVIRONMENT=production with TEST_MODE=true refuses every request with 503', async () => {
    const prodTest = { ...multiEnv, ENVIRONMENT: 'production', TEST_MODE: 'true' };
    expect((await call(prodTest, 'GET', '/health', null)).status).toBe(503);
    expect((await call(prodTest, 'POST', '/test/reset', null)).status).toBe(503);
  });

  it('ENVIRONMENT=production with TENANCY_MODE=single is refused unless explicitly allowed', async () => {
    const prodSingle = { ...testEnv, ENVIRONMENT: 'production', TENANCY_MODE: 'single', TEST_MODE: 'false' };
    expect((await call(prodSingle, 'GET', '/health', null)).status).toBe(503);
    expect((await call({ ...prodSingle, ALLOW_SINGLE_TENANT_PRODUCTION: 'true' }, 'GET', '/health', null)).status).toBe(200);
  });

  it('production in multi mode without test mode serves normally', async () => {
    expect((await call({ ...multiEnv, ENVIRONMENT: 'production', TEST_MODE: 'false' }, 'GET', '/health', null)).status).toBe(200);
  });
});
