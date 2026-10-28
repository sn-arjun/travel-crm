import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';
import { signAccessToken } from '../src/utils/jwt';
import { reportRegistry } from '../src/services/report-registry';

// R135-1: report definitions name the real role ids (sales_manager, not 'manager').

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const MANAGER_ID = '01960000-0000-7000-8000-000000013501';
const SALES_ID = '01960000-0000-7000-8000-000000013502';
const REAL_ROLES = ['admin', 'sales_manager', 'salesperson', 'operations', 'accountant', 'view_only'];

async function get(path: string, token: string): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function seedUser(id: string, role: string): Promise<string> {
  await testEnv.MASTER_DB.prepare(
    `INSERT OR REPLACE INTO users (id, email, name, password_hash, role, is_active) VALUES (?, ?, ?, 'x', ?, 1)`,
  ).bind(id, `${id}@r135.test`, `User ${id}`, role).run();
  return signAccessToken({ userId: id, tenantId: TENANT_ID, role, email: `${id}@r135.test` }, testEnv.JWT_SECRET);
}

let manager = '';
let sales = '';

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  const ctx = createExecutionContext();
  const reset = await worker.fetch(new Request('http://localhost/api/v1/test/reset', { method: 'POST' }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  expect(reset.status).toBe(200);
  manager = await seedUser(MANAGER_ID, 'sales_manager');
  sales = await seedUser(SALES_ID, 'salesperson');
});

afterAll(async () => {
  await testEnv.MASTER_DB.prepare("DELETE FROM users WHERE email LIKE '%@r135.test'").run();
});

describe('R135-1 team report roles', () => {
  it('sales_manager gets 200 on the team report; salesperson keeps its 403', async () => {
    expect((await get('/reports/team_dashboard', manager)).status).toBe(200);
    expect((await get('/reports/team_dashboard', sales)).status).toBe(403);
  });

  it('no report definition names a role id that does not exist', () => {
    for (const report of reportRegistry.getAll()) {
      for (const role of report.requiredRole) expect(REAL_ROLES, `${report.id}: ${role}`).toContain(role);
    }
  });
});
