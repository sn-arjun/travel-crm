import { env, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { CloudflareTenantProvisioner } from '../src/services/tenancy/cloudflare-provisioner';
import { ProvisioningError } from '../src/services/tenancy/provisioner';
import { runProvisioning, type TenantRow } from '../src/services/tenancy/run-provisioning';
import { seedTenant } from '../src/services/tenancy/seed-tenant';
import { TENANT_MIGRATIONS } from '../src/db/tenant-migrations.generated';
import { bindingNameFor } from '../src/services/tenant-db';

const testEnv = env as any;
const TOKEN = 'cf-secret-token-r104-0123456789';
const cfEnv = { ...testEnv, CF_ACCOUNT_ID: 'acct123', CF_API_TOKEN: TOKEN, CF_WORKER_SCRIPT_NAME: 'travelcrm-api', TENANT_PROVISIONER: 'cloudflare' };
const TENANT_ID = '0196a104-1111-7000-8000-0000000000c1';

interface Recorded {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: any;
  rawBody: unknown;
}

function mockFetch(handler: (call: Recorded) => { status?: number; json?: unknown } | Promise<{ status?: number; json?: unknown }>) {
  const calls: Recorded[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const raw = init?.body;
    const call: Recorded = {
      method: init?.method ?? 'GET',
      url: String(input),
      headers,
      rawBody: raw,
      body: typeof raw === 'string' ? JSON.parse(raw) : undefined,
    };
    calls.push(call);
    const out = await handler(call);
    return new Response(JSON.stringify(out.json ?? { success: true, result: {} }), { status: out.status ?? 200 });
  }) as typeof fetch;
  return { calls, fetcher };
}

const target = { databaseId: 'db-uuid-1', binding: bindingNameFor(TENANT_ID) };

describe('CloudflareTenantProvisioner (mocked fetch)', () => {
  it('creates the D1 database with a name and a location hint', async () => {
    const { calls, fetcher } = mockFetch(() => ({ json: { success: true, result: { uuid: 'db-uuid-1' } } }));
    const result = await new CloudflareTenantProvisioner(cfEnv, fetcher).createDatabase({ tenantId: TENANT_ID, slug: 'sunrise-travels', region: 'in' });
    expect(result).toEqual({ databaseId: 'db-uuid-1', binding: bindingNameFor(TENANT_ID) });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('https://api.cloudflare.com/client/v4/accounts/acct123/d1/database');
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].body).toEqual({ name: 'travelcrm-t-sunrise-travels', primary_location_hint: 'apac' });
  });

  it('pins EU and UK agencies with a jurisdiction instead of a hint, and maps the other regions', async () => {
    const seen: Record<string, any> = {};
    const { fetcher } = mockFetch((c) => {
      seen[c.body.name] = c.body;
      return { json: { success: true, result: { uuid: 'x' } } };
    });
    const p = new CloudflareTenantProvisioner(cfEnv, fetcher);
    for (const region of ['eu', 'uk', 'us', 'au', 'gulf'] as const) await p.createDatabase({ tenantId: TENANT_ID, slug: `r-${region}`, region });
    expect(seen['travelcrm-t-r-eu']).toEqual({ name: 'travelcrm-t-r-eu', jurisdiction: 'eu' });
    expect(seen['travelcrm-t-r-uk']).toEqual({ name: 'travelcrm-t-r-uk', jurisdiction: 'eu' });
    expect(seen['travelcrm-t-r-us'].primary_location_hint).toBe('wnam');
    expect(seen['travelcrm-t-r-au'].primary_location_hint).toBe('oc');
    expect(seen['travelcrm-t-r-gulf'].primary_location_hint).toBe('apac');
  });

  it('runs every migration statement through /query and records each migration in d1_migrations', async () => {
    const { calls, fetcher } = mockFetch(() => ({}));
    const { applied } = await new CloudflareTenantProvisioner(cfEnv, fetcher).applyMigrations(target);
    expect(applied).toEqual(TENANT_MIGRATIONS.map((m) => m.name));

    const queryUrl = 'https://api.cloudflare.com/client/v4/accounts/acct123/d1/database/db-uuid-1/query';
    expect(calls.every((c) => c.url === queryUrl && c.method === 'POST')).toBe(true);
    expect(calls[0].body.sql).toContain('CREATE TABLE IF NOT EXISTS d1_migrations');

    const sqlSent = calls.map((c) => c.body.sql as string).join('\n');
    for (const migration of TENANT_MIGRATIONS) {
      for (const statement of migration.queries) {
        expect(sqlSent, `${migration.name}: ${statement.slice(0, 60)}`).toContain(statement.trimEnd().replace(/;+\s*$/, ''));
      }
    }
    const bookkeeping = calls.filter((c) => /INSERT INTO d1_migrations/.test(c.body.sql));
    expect(bookkeeping.map((c) => c.body.params[0])).toEqual(TENANT_MIGRATIONS.map((m) => m.name));
    // A migration's bookkeeping row comes after its statements.
    const firstMigration = calls.findIndex((c) => c.body.sql.includes('CREATE TABLE IF NOT EXISTS users'));
    expect(firstMigration).toBeGreaterThan(0);
    expect(calls.indexOf(bookkeeping[0])).toBeGreaterThan(firstMigration);
  });

  it('seeds the admin and settings through /query with bound params (hash, never the clear password)', async () => {
    const { calls, fetcher } = mockFetch(() => ({}));
    const p = new CloudflareTenantProvisioner(cfEnv, fetcher);
    const { temporaryPassword } = await seedTenant(p, target, {
      adminEmail: 'Owner@Example.com',
      adminName: 'Owner',
      company: 'Sunrise',
      country: 'India',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      taxSystem: 'gst',
    });
    expect(temporaryPassword).toHaveLength(16);
    const user = calls.find((c) => /INSERT INTO users/.test(c.body.sql))!;
    expect(user.body.params[1]).toBe('owner@example.com');
    expect(user.body.params[3]).toMatch(/^\$2[aby]\$/);
    expect(JSON.stringify(calls.map((c) => c.body))).not.toContain(temporaryPassword);
    const keys = calls.filter((c) => /INTO settings/.test(c.body.sql)).map((c) => c.body.params[0]);
    expect(keys).toEqual(['company_name', 'company_email', 'country', 'currency', 'timezone', 'tax_system', 'onboarding_completed']);
  });

  it('registers the binding through the script settings API and reports active on 2xx', async () => {
    const { calls, fetcher } = mockFetch(() => ({}));
    const result = await new CloudflareTenantProvisioner(cfEnv, fetcher).registerBinding(target);
    expect(result).toBe('active');
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toBe('https://api.cloudflare.com/client/v4/accounts/acct123/workers/scripts/travelcrm-api/settings');
    const settings = JSON.parse((calls[0].rawBody as FormData).get('settings') as string);
    expect(settings.bindings).toEqual([{ type: 'd1', name: target.binding, id: 'db-uuid-1' }]);
    expect(settings.keep_bindings).toContain('d1');
  });

  it('a 4xx on the settings PATCH yields pending_deploy, and so does a missing script name or a network error', async () => {
    const denied = mockFetch(() => ({ status: 403, json: { success: false, errors: [{ message: 'forbidden' }] } }));
    expect(await new CloudflareTenantProvisioner(cfEnv, denied.fetcher).registerBinding(target)).toBe('pending_deploy');

    const noScript = mockFetch(() => ({}));
    expect(await new CloudflareTenantProvisioner({ ...cfEnv, CF_WORKER_SCRIPT_NAME: undefined }, noScript.fetcher).registerBinding(target)).toBe('pending_deploy');
    expect(noScript.calls).toHaveLength(0);

    const broken = (async () => {
      throw new Error(`connect failed with ${TOKEN}`);
    }) as unknown as typeof fetch;
    expect(await new CloudflareTenantProvisioner(cfEnv, broken).registerBinding(target)).toBe('pending_deploy');
  });

  it('drops the database with DELETE', async () => {
    const { calls, fetcher } = mockFetch(() => ({}));
    await new CloudflareTenantProvisioner(cfEnv, fetcher).dropDatabase(target);
    expect(calls[0].method).toBe('DELETE');
    expect(calls[0].url).toBe('https://api.cloudflare.com/client/v4/accounts/acct123/d1/database/db-uuid-1');
  });

  it('never puts the token in a thrown error, even when Cloudflare echoes it back', async () => {
    const { fetcher } = mockFetch(() => ({ status: 400, json: { success: false, errors: [{ message: `bad token ${TOKEN}` }] } }));
    const p = new CloudflareTenantProvisioner(cfEnv, fetcher);
    const err = await p.createDatabase({ tenantId: TENANT_ID, slug: 'x-y-z', region: 'in' }).catch((e) => e);
    expect(err).toBeInstanceOf(ProvisioningError);
    expect(err.message).toContain('HTTP 400');
    expect(err.message).not.toContain(TOKEN);

    const netFail = new CloudflareTenantProvisioner(cfEnv, (async () => {
      throw new Error(`socket closed ${TOKEN}`);
    }) as unknown as typeof fetch);
    const err2 = await netFail.dropDatabase(target).catch((e) => e);
    expect(err2.message).not.toContain(TOKEN);
  });

  it('refuses to run without CF_ACCOUNT_ID and CF_API_TOKEN', async () => {
    const { fetcher, calls } = mockFetch(() => ({}));
    const err = await new CloudflareTenantProvisioner({ ...cfEnv, CF_API_TOKEN: undefined }, fetcher)
      .createDatabase({ tenantId: TENANT_ID, slug: 'abc', region: 'in' })
      .catch((e) => e);
    expect(err.code).toBe('NOT_CONFIGURED');
    expect(calls).toHaveLength(0);
  });
});

describe('rollback against Cloudflare', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    await testEnv.MASTER_DB
      .prepare(
        `INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, provisioning_status, owner_email, owner_name, country, region)
         VALUES (?, 'CF Agency', 'r104-cf', 'pro', 'provisioning', 'creating_db', 'owner-cf@r104.test', 'CF Owner', 'India', 'in')`,
      )
      .bind(TENANT_ID)
      .run();
  });

  it('deletes the created D1 database when a migration fails, and stores the failed step', async () => {
    let queries = 0;
    const { calls, fetcher } = mockFetch((c) => {
      if (c.url.endsWith('/d1/database') && c.method === 'POST') return { json: { success: true, result: { uuid: 'db-to-drop' } } };
      if (c.url.endsWith('/query')) {
        queries++;
        if (queries === 4) return { status: 500, json: { success: false, errors: [{ message: 'D1 internal error' }] } };
      }
      return {};
    });
    const row = (await testEnv.MASTER_DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(TENANT_ID).first()) as TenantRow;
    const out = await runProvisioning(cfEnv, row, { provisioner: new CloudflareTenantProvisioner(cfEnv, fetcher) });

    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.step).toBe('migrating');
      expect(out.purged).toBe(false);
    }
    const del = calls.find((c) => c.method === 'DELETE');
    expect(del?.url).toBe('https://api.cloudflare.com/client/v4/accounts/acct123/d1/database/db-to-drop');

    const after = (await testEnv.MASTER_DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(TENANT_ID).first()) as any;
    expect(after.provisioning_status).toBe('failed');
    expect(after.provisioning_error).toMatch(/^migrating: .*HTTP 500/);
    expect(after.d1_database_id).toBeNull();
    expect(after.db_binding).toBeNull();
    expect(JSON.stringify(after)).not.toContain(TOKEN);
    await testEnv.MASTER_DB.prepare('DELETE FROM tenants WHERE id = ?').bind(TENANT_ID).run();
  });
});
