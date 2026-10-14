import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import { bindingNameFor, tenancyMode, tenantDbFor, candidateTenantDbs, TenantDbUnavailableError } from '../src/services/tenant-db';

const testEnv = env as any;
const single = { ...testEnv, TENANCY_MODE: 'single' };
const multi = { ...testEnv, TENANCY_MODE: 'multi' };

const emptyMaster = {
  prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }),
};

describe('tenancy mode', () => {
  it('is single only when TENANCY_MODE is exactly "single"', () => {
    expect(tenancyMode({ TENANCY_MODE: 'single' } as any)).toBe('single');
    expect(tenancyMode({ TENANCY_MODE: 'multi' } as any)).toBe('multi');
    expect(tenancyMode({} as any)).toBe('multi');
    expect(tenancyMode({ TENANCY_MODE: 'SINGLE' } as any)).toBe('multi');
  });
});

describe('bindingNameFor', () => {
  it('strips hyphens and lower-cases, giving a valid binding name', () => {
    const name = bindingNameFor('0196ABCD-1234-7000-8000-00000000000F');
    expect(name).toBe('TENANT_DB_0196abcd12347000800000000000000f');
    expect(name).toMatch(/^TENANT_DB_[0-9a-f]{32}$/);
  });
});

describe('tenantDbFor', () => {
  it('single mode returns MASTER_DB', () => {
    expect(tenantDbFor(single, { dbBinding: null })).toBe(testEnv.MASTER_DB);
    expect(tenantDbFor(single, { dbBinding: 'TENANT_DB_POOL_1' })).toBe(testEnv.MASTER_DB);
  });

  it('multi mode returns the tenant binding when it is set and bound', () => {
    expect(tenantDbFor(multi, { dbBinding: 'TENANT_DB_POOL_2' })).toBe(testEnv.TENANT_DB_POOL_2);
    expect(tenantDbFor(multi, { dbBinding: 'TENANT_DB_POOL_2' })).not.toBe(testEnv.MASTER_DB);
  });

  it('multi mode throws, never MASTER_DB, for a missing, unknown or foreign binding name', () => {
    expect(() => tenantDbFor(multi, { dbBinding: null })).toThrow(TenantDbUnavailableError);
    expect(() => tenantDbFor(multi, { dbBinding: 'TENANT_DB_doesnotexist' })).toThrow(TenantDbUnavailableError);
    // Only TENANT_DB_* names can be looked up: a stored name must not reach other bindings.
    expect(() => tenantDbFor(multi, { dbBinding: 'MASTER_DB' })).toThrow(TenantDbUnavailableError);
    expect(() => tenantDbFor(multi, { dbBinding: 'JWT_SECRET' })).toThrow(TenantDbUnavailableError);
  });

  it('an unset TENANCY_MODE behaves as multi (fails closed)', () => {
    const unset = { ...testEnv, TENANCY_MODE: undefined };
    expect(() => tenantDbFor(unset, { dbBinding: null })).toThrow(TenantDbUnavailableError);
  });
});

describe('candidateTenantDbs', () => {
  it('multi mode returns [] when no tenant resolves, never MASTER_DB', async () => {
    expect(await candidateTenantDbs({ ...multi, MASTER_DB: emptyMaster })).toEqual([]);
  });

  it('single mode returns [MASTER_DB] when no tenant resolves', async () => {
    const e = { ...single, MASTER_DB: emptyMaster };
    expect(await candidateTenantDbs(e)).toEqual([emptyMaster]);
  });
});
