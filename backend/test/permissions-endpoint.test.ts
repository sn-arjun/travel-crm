import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { PERMISSIONS } from '../src/constants/permissions';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function login(email: string): Promise<string> {
  const res = await call('POST', '/auth/login', null, { email, password: 'password123', tenantId: TENANT_ID });
  expect(res.status).toBe(200);
  return ((await res.json()) as any).data.accessToken;
}

describe('GET /users/me/permissions', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
  });

  it('requires a signed-in user', async () => {
    expect((await call('GET', '/users/me/permissions', null)).status).toBe(401);
  });

  it.each([
    ['admin@e2e.test', 'admin'],
    ['sales@e2e.test', 'salesperson'],
    ['viewer@e2e.test', 'view_only'],
  ] as const)('returns the matrix row for %s', async (email, role) => {
    const res = await call('GET', '/users/me/permissions', await login(email));
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as any;
    expect(data).toEqual({ role, permissions: PERMISSIONS[role] });
  });

  it('lets only admins configure automations', () => {
    expect(PERMISSIONS.admin.automations).toContain('create');
    expect(PERMISSIONS.sales_manager.automations).toEqual(['view', 'edit']);
    expect(PERMISSIONS.salesperson.automations).toBeUndefined();
    expect(PERMISSIONS.view_only.automations).toBeUndefined();
  });
});
