import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';

const testEnv = env as any;

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function actions(token: string, action: string): Promise<string[]> {
  const res = await call('GET', `/api/v1/activity-logs?limit=100&action=${encodeURIComponent(action)}`, token);
  expect(res.status).toBe(200);
  const body: any = await res.json();
  return (body.data as Array<{ action: string }>).map((row) => row.action);
}

let adminToken = '';

describe('Activity log action filter', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    const reset = await call('POST', '/api/v1/test/reset', null);
    expect(reset.status).toBe(200);
    const login = await call('POST', '/api/v1/auth/login', null, {
      email: 'admin@e2e.test',
      password: 'password123',
      tenantId: '00000000-0000-0000-0000-000000000000',
    });
    expect(login.status).toBe(200);
    adminToken = ((await login.json()) as any).data.accessToken;

    // invite_user, then update_user and deactivate_user for the same person.
    const created = await call('POST', '/api/v1/users', adminToken, {
      email: `filter-${Date.now()}@example.com`,
      name: 'Meera Pillai',
      role: 'salesperson',
    });
    expect(created.status).toBe(201);
    const userId = ((await created.json()) as any).data.id as string;
    expect((await call('PUT', `/api/v1/users/${userId}`, adminToken, { name: 'Meera S Pillai' })).status).toBe(200);
    expect((await call('PUT', `/api/v1/users/${userId}/deactivate`, adminToken)).status).toBe(200);
  });

  it('matches an exact action', async () => {
    const found = await actions(adminToken, 'update_user');
    expect(found.length).toBeGreaterThan(0);
    expect(new Set(found)).toEqual(new Set(['update_user']));
  });

  it('matches every action in a verb group', async () => {
    const found = await actions(adminToken, 'update');
    expect(found).toContain('update_user');
    expect(found.every((a) => a === 'update' || a.startsWith('update_'))).toBe(true);
  });

  it('does not match partial verbs or other groups', async () => {
    expect(await actions(adminToken, 'upd')).toEqual([]);
    const deactivate = await actions(adminToken, 'deactivate');
    expect(deactivate).toContain('deactivate_user');
    expect(deactivate).not.toContain('update_user');
  });

  it('treats LIKE wildcards in the filter literally', async () => {
    expect(await actions(adminToken, '%')).toEqual([]);
    expect(await actions(adminToken, 'update%')).toEqual([]);
  });
});
