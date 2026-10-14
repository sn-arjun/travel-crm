import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { TENANT_MIGRATIONS } from '../src/db/tenant-migrations.generated';

// Workerd tests cannot read the file system, so the generated bundle is compared with
// TEST_MIGRATIONS, which vitest.config.ts builds from drizzle/tenant/*.sql with readD1Migrations.
const testMigrations = (env as unknown as { TEST_MIGRATIONS: { name: string; queries: string[] }[] }).TEST_MIGRATIONS;
const tenantFromFiles = testMigrations
  .filter((m) => m.name.startsWith('tenant_'))
  .map((m) => ({ name: m.name.slice('tenant_'.length), queries: m.queries }));

describe('tenant migration bundle', () => {
  it('has the same migration names, in the same order, as drizzle/tenant', () => {
    expect(TENANT_MIGRATIONS.map((m) => m.name)).toEqual(tenantFromFiles.map((m) => m.name));
  });

  it('has the same non-empty statements as drizzle/tenant (re-run npm run db:bundle-tenant if this fails)', () => {
    for (const [i, m] of tenantFromFiles.entries()) {
      expect(TENANT_MIGRATIONS[i].queries, m.name).toEqual(m.queries);
    }
    const count = (list: { queries: string[] }[]) => list.reduce((n, m) => n + m.queries.length, 0);
    expect(count(TENANT_MIGRATIONS)).toBe(count(tenantFromFiles));
  });

  it('contains no empty statements', () => {
    for (const m of TENANT_MIGRATIONS) {
      for (const q of m.queries) expect(q.replace(/--[^\n]*/g, '').trim().length).toBeGreaterThan(0);
    }
  });
});
