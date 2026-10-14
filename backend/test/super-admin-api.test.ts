import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { signAccessToken } from '../src/utils/jwt';
import { hashPassword } from '../src/utils/password';
import { getAllowance } from '../src/services/plans/catalogue';
import { logAdminAction } from '../src/services/admin/audit';
import { superAdminToken } from './utils/super-admin';

/**
 * R111 super admin backend API: its own login and token, lockout, role limits, tenant lifecycle writes with audit,
 * plan changes, feature flags, caps, usage, add-on top-ups, impersonation and the audit-log reader.
 * Agencies live in the shared single-database test setup (db_binding NULL), with unique ids and emails.
 */

const testEnv = env as any;
const P = '0196a111-0000-7000-8000'; // id prefix for this file

const SA_ID = `${P}-0000000000a1`;
const SA_EMAIL = 'owner-r111@platform.test';
const SA_NAME = 'Priya Operator';
const SA_PASSWORD = 'correct horse battery staple';

async function call(method: string, path: string, token: string | null, body?: unknown, e: any = testEnv): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body) }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

const json = async (res: Response) => (await res.json()) as any;
const master = (sql: string, ...binds: unknown[]) => (testEnv.MASTER_DB as D1Database).prepare(sql).bind(...binds);

function claims(token: string): Record<string, any> {
  return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
}

/** The standalone console's hash format: "<saltHex>:<hashHex>", PBKDF2-SHA256, 100000 iterations, 256 bits. */
async function legacyHash(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hex = (b: Uint8Array) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex(salt)}:${hex(new Uint8Array(bits))}`;
}

async function login(email: string, password: string): Promise<Response> {
  return call('POST', '/admin/auth/login', null, { email, password });
}

interface Agency {
  id: string;
  adminId: string;
  adminEmail: string;
  token: string;
}

let agencySeq = 0;
/** An active agency on the Basic plan with one admin user and a yearly subscription. */
async function makeAgency(plan = 'basic', status = 'active'): Promise<Agency> {
  const n = String(++agencySeq).padStart(4, '0');
  const id = `${P}-00000000${n}`;
  const adminId = `${P}-11111111${n}`;
  const adminEmail = `admin-${n}@r111.test`;
  await master(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, max_users) VALUES (?, ?, ?, ?, ?, 5)`, id, `R111 Agency ${n}`, `r111-${n}`, plan, status).run();
  await master(
    `INSERT OR REPLACE INTO subscriptions (id, tenant_id, plan, amount, billing_cycle, start_date, next_billing_date, status) VALUES (?, ?, ?, 1000, 'yearly', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', 'active')`,
    `${P}-22222222${n}`, id, plan,
  ).run();
  await master(`INSERT OR REPLACE INTO users (id, email, password_hash, role, name, is_active) VALUES (?, ?, ?, 'admin', ?, 1)`, adminId, adminEmail, 'unused', `Admin ${n}`).run();
  await master(`INSERT OR REPLACE INTO tenant_users (id, tenant_id, email, user_id, role, is_active) VALUES (?, ?, ?, ?, 'admin', 1)`, `${P}-33333333${n}`, id, adminEmail, adminId).run();
  const token = await signAccessToken({ userId: adminId, tenantId: id, role: 'admin', email: adminEmail }, testEnv.JWT_SECRET);
  return { id, adminId, adminEmail, token };
}

async function audits(action: string, tenantId: string): Promise<Array<{ details: any; admin_id: string | null; entity_id: string | null }>> {
  const { results } = await master(`SELECT admin_id, entity_id, details FROM super_admin_audit_log WHERE action = ? AND entity_id = ? ORDER BY created_at, rowid`, action, tenantId).all<any>();
  return results.map((r: any) => ({ ...r, details: JSON.parse(r.details) }));
}

async function auditCount(tenantId?: string): Promise<number> {
  const row = tenantId
    ? await master(`SELECT COUNT(*) AS c FROM super_admin_audit_log WHERE entity_id = ?`, tenantId).first<{ c: number }>()
    : await master(`SELECT COUNT(*) AS c FROM super_admin_audit_log`).first<{ c: number }>();
  return row?.c ?? 0;
}

let sa = ''; // super admin token from a real login

describe('super admin API (R111)', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    await master(`DELETE FROM super_admin_login_log WHERE email LIKE '%@r111.sa'`).run();
    await master(`INSERT OR REPLACE INTO super_admins (id, email, name, password_hash, role, is_active) VALUES (?, ?, ?, ?, 'super_admin', 1)`, SA_ID, SA_EMAIL, SA_NAME, await hashPassword(SA_PASSWORD)).run();
    const res = await login(SA_EMAIL, SA_PASSWORD);
    expect(res.status).toBe(200);
    sa = (await json(res)).data.token;
  });

  describe('login and token', () => {
    it('logs in a super admin whose hash was made by the standalone console (PBKDF2) and upgrades it to bcrypt', async () => {
      const email = 'legacy@r111.sa';
      const legacy = await legacyHash('legacy passphrase 123');
      await master(`INSERT OR REPLACE INTO super_admins (id, email, name, password_hash, role, is_active) VALUES (?, ?, 'Legacy Admin', ?, 'super_admin', 1)`, `${P}-0000000000a2`, email, legacy).run();

      const res = await login(email, 'legacy passphrase 123');
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.data.admin).toEqual({ id: `${P}-0000000000a2`, email, name: 'Legacy Admin', role: 'super_admin' });
      expect(new Date(body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

      const row = await master(`SELECT password_hash FROM super_admins WHERE id = ?`, `${P}-0000000000a2`).first<{ password_hash: string }>();
      expect(row!.password_hash.startsWith('$2')).toBe(true);
      // The upgraded hash still works.
      expect((await login(email, 'legacy passphrase 123')).status).toBe(200);
    });

    it('issues a 2 hour token with the super-admin audience, signed with its own secret, and it opens /admin/*', async () => {
      const c = claims(sa);
      expect(c.aud).toBe('super-admin');
      expect(c.sub).toBe(SA_ID);
      expect(c.exp - c.iat).toBe(2 * 60 * 60);
      expect(c.tenantId).toBeUndefined();

      const me = await call('GET', '/admin/auth/me', sa);
      expect(me.status).toBe(200);
      expect((await json(me)).data).toEqual({ id: SA_ID, email: SA_EMAIL, name: SA_NAME, role: 'super_admin' });
      expect((await call('GET', '/admin/tenants', sa)).status).toBe(200);
    });

    it('answers a wrong password with 401 and the same message as an unknown email', async () => {
      const wrong = await login(SA_EMAIL, 'not the password at all');
      const unknown = await login('nobody@r111.sa', 'not the password at all');
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect((await json(wrong)).error.message).toBe((await json(unknown)).error.message);
    });

    it('locks an email after 5 failures: the 6th attempt is 429 even with the right password', async () => {
      const email = 'lockout@r111.sa';
      await master(`INSERT OR REPLACE INTO super_admins (id, email, name, password_hash, role, is_active) VALUES (?, ?, 'Lock Test', ?, 'super_admin', 1)`, `${P}-0000000000a3`, email, await hashPassword('lockout passphrase 1')).run();
      for (let i = 1; i <= 5; i++) expect((await login(email, `wrong ${i}`)).status, `attempt ${i}`).toBe(401);
      const sixth = await login(email, 'wrong 6');
      expect(sixth.status).toBe(429);
      expect(Number(sixth.headers.get('Retry-After'))).toBeGreaterThan(0);
      expect((await login(email, 'lockout passphrase 1')).status).toBe(429);
      // A different email is unaffected.
      expect((await login(SA_EMAIL, SA_PASSWORD)).status).toBe(200);
    });

    it('locks an unknown email the same way (nothing reveals which emails exist)', async () => {
      for (let i = 1; i <= 5; i++) expect((await login('ghost@r111.sa', `wrong ${i}`)).status).toBe(401);
      expect((await login('ghost@r111.sa', 'wrong 6')).status).toBe(429);
    });

    it('refuses a deactivated super admin', async () => {
      const email = 'inactive@r111.sa';
      await master(`INSERT OR REPLACE INTO super_admins (id, email, name, password_hash, role, is_active) VALUES (?, ?, 'Inactive', ?, 'super_admin', 0)`, `${P}-0000000000a4`, email, await hashPassword('inactive passphrase 1')).run();
      expect((await login(email, 'inactive passphrase 1')).status).toBe(401);
    });

    it('answers 503 when SUPER_ADMIN_JWT_SECRET is not configured outside test mode', async () => {
      const res = await call('POST', '/admin/auth/login', null, { email: SA_EMAIL, password: SA_PASSWORD }, { ...testEnv, TEST_MODE: 'false', SUPER_ADMIN_JWT_SECRET: undefined });
      expect(res.status).toBe(503);
    });

    it('records successful and failed attempts in the login log without storing passwords', async () => {
      const { results } = await master(`SELECT success, event, email, admin_id FROM super_admin_login_log WHERE email = ?`, SA_EMAIL).all<any>();
      expect(results.some((r: any) => r.success === 1 && r.event === 'login' && r.admin_id === SA_ID)).toBe(true);
      expect(results.some((r: any) => r.success === 0)).toBe(true);
    });

    it('logout revokes the token', async () => {
      const issued = await json(await login(SA_EMAIL, SA_PASSWORD));
      const token = issued.data.token as string;
      expect((await call('GET', '/admin/auth/me', token)).status).toBe(200);
      expect((await call('POST', '/admin/auth/logout', token)).status).toBe(200);
      expect((await call('GET', '/admin/auth/me', token)).status).toBe(401);
      expect((await audits('auth.logout', SA_ID)).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('separation from tenant auth', () => {
    it('answers 401 without a token or with garbage, and 403 for a tenant admin token', async () => {
      const agency = await makeAgency();
      expect((await call('GET', '/admin/tenants', null)).status).toBe(401);
      expect((await call('GET', '/admin/tenants', 'not.a.token')).status).toBe(401);
      expect((await call('GET', '/admin/tenants', agency.token)).status).toBe(403);
      expect((await call('POST', `/admin/tenants/${agency.id}/suspend`, agency.token)).status).toBe(403);
      expect((await call('GET', '/admin/auth/me', agency.token)).status).toBe(403);
    });

    it('does not accept a super admin token as a tenant session', async () => {
      expect((await call('GET', '/contacts', sa)).status).toBe(401);
    });

    it('lets only the login route through unauthenticated, and has no route that creates a super admin', async () => {
      const before = await master(`SELECT COUNT(*) AS c FROM super_admins`).first<{ c: number }>();
      for (const [method, path] of [
        ['POST', '/admin/auth/register'],
        ['POST', '/admin/auth/seed'],
        ['POST', '/admin/seed'],
        ['POST', '/admin/super-admins'],
        ['POST', '/auth/seed'],
        ['GET', '/admin/auth/me'],
        ['POST', '/admin/auth/logout'],
      ] as const) {
        const res = await call(method, path, null, { email: 'intruder@r111.sa', name: 'X', password: 'a very long password 1' });
        expect([401, 404], `${method} ${path}`).toContain(res.status);
      }
      const after = await master(`SELECT COUNT(*) AS c FROM super_admins`).first<{ c: number }>();
      expect(after!.c).toBe(before!.c);
    });

    it('keeps /admin/whoami on tenant auth and answers false for tenant sessions', async () => {
      const agency = await makeAgency();
      const res = await call('GET', '/admin/whoami', agency.token);
      expect(res.status).toBe(200);
      expect((await json(res)).data).toEqual({ isSuperAdmin: false });
    });
  });

  describe('roles', () => {
    it('lets a viewer read but not write, and a support admin read and impersonate but not suspend', async () => {
      const agency = await makeAgency();
      const viewer = await superAdminToken(testEnv, { id: `${P}-0000000000b1`, email: 'viewer@r111.sa', role: 'viewer' });
      const support = await superAdminToken(testEnv, { id: `${P}-0000000000b2`, email: 'support@r111.sa', role: 'support', name: 'Sam Support' });
      expect((await call('GET', '/admin/tenants', viewer)).status).toBe(200);
      expect((await call('POST', `/admin/tenants/${agency.id}/suspend`, viewer)).status).toBe(403);
      expect((await call('POST', `/admin/tenants/${agency.id}/impersonate`, viewer, { reason: 'looking around' })).status).toBe(403);
      expect((await call('POST', `/admin/tenants/${agency.id}/suspend`, support)).status).toBe(403);
      expect((await call('POST', `/admin/tenants/${agency.id}/impersonate`, support, { reason: 'customer asked for help' })).status).toBe(201);
    });
  });

  describe('lifecycle', () => {
    it('suspend takes effect on the very next tenant request (KV cache entry deleted) and writes before/after audit', async () => {
      const agency = await makeAgency();
      expect((await call('GET', '/contacts', agency.token)).status).toBe(200); // primes the KV tenant cache
      expect(await testEnv.CACHE.get(`tenant:v2:${agency.id}`)).not.toBeNull();

      const res = await call('POST', `/admin/tenants/${agency.id}/suspend`, sa, { reason: 'unpaid invoice' });
      expect(res.status).toBe(200);
      expect((await json(res)).data).toMatchObject({ status: 'suspended', previousStatus: 'active' });
      expect(await testEnv.CACHE.get(`tenant:v2:${agency.id}`)).toBeNull();

      const blocked = await call('GET', '/contacts', agency.token);
      expect(blocked.status).toBe(403);
      expect((await json(blocked)).error.message).toMatch(/suspended/i);

      const [row] = await audits('tenant.suspend', agency.id);
      expect(row.admin_id).toBe(SA_ID);
      expect(row.details).toMatchObject({ actor: SA_EMAIL, before: { status: 'active' }, after: { status: 'suspended' }, reason: 'unpaid invoice' });

      // Suspending twice is a conflict, not a second silent write.
      expect((await call('POST', `/admin/tenants/${agency.id}/suspend`, sa)).status).toBe(409);
      expect((await audits('tenant.suspend', agency.id)).length).toBe(1);
    });

    it('reactivate restores access immediately and audits it', async () => {
      const agency = await makeAgency();
      await call('POST', `/admin/tenants/${agency.id}/suspend`, sa);
      expect((await call('GET', '/contacts', agency.token)).status).toBe(403);
      const res = await call('POST', `/admin/tenants/${agency.id}/reactivate`, sa);
      expect(res.status).toBe(200);
      expect((await call('GET', '/contacts', agency.token)).status).toBe(200);
      const [row] = await audits('tenant.reactivate', agency.id);
      expect(row.details).toMatchObject({ before: { status: 'suspended' }, after: { status: 'active' } });
      expect((await call('POST', `/admin/tenants/${agency.id}/reactivate`, sa)).status).toBe(409);
    });

    it('cancel blocks the agency, cancels its subscription and keeps its data; reactivate brings it back', async () => {
      const agency = await makeAgency();
      const res = await call('POST', `/admin/tenants/${agency.id}/cancel`, sa, { reason: 'closed business' });
      expect(res.status).toBe(200);
      expect((await json(res)).data.dataKept).toBe(true);
      expect((await call('GET', '/contacts', agency.token)).status).toBe(403);

      const sub = await master(`SELECT status, cancellation_reason FROM subscriptions WHERE tenant_id = ?`, agency.id).first<any>();
      expect(sub).toEqual({ status: 'cancelled', cancellation_reason: 'closed business' });
      const user = await master(`SELECT id FROM users WHERE id = ?`, agency.adminId).first();
      expect(user).not.toBeNull();
      const [row] = await audits('tenant.cancel', agency.id);
      expect(row.details).toMatchObject({ before: { status: 'active' }, after: { status: 'cancelled', dataKept: true } });

      expect((await call('POST', `/admin/tenants/${agency.id}/cancel`, sa)).status).toBe(409);
      expect((await call('POST', `/admin/tenants/${agency.id}/reactivate`, sa)).status).toBe(200);
      expect((await call('GET', '/contacts', agency.token)).status).toBe(200);
      expect((await master(`SELECT status FROM subscriptions WHERE tenant_id = ?`, agency.id).first<any>()).status).toBe('active');
    });

    it('returns 404 for an unknown agency', async () => {
      expect((await call('POST', `/admin/tenants/${P}-ffffffffffff/suspend`, sa)).status).toBe(404);
    });
  });

  describe('plan change', () => {
    it('rejects an unknown plan key with 400 and writes nothing', async () => {
      const agency = await makeAgency();
      const before = await auditCount(agency.id);
      const res = await call('PUT', `/admin/tenants/${agency.id}/plan`, sa, { plan: 'platinum-deluxe' });
      expect(res.status).toBe(400);
      expect((await json(res)).error.message).toMatch(/Unknown plan/);
      expect((await master(`SELECT plan FROM tenants WHERE id = ?`, agency.id).first<any>()).plan).toBe('basic');
      expect(await auditCount(agency.id)).toBe(before);
    });

    it('changes plan from the catalogue: tenant, subscription amount and seats follow, with before/after audit', async () => {
      const agency = await makeAgency('basic');
      const res = await call('PUT', `/admin/tenants/${agency.id}/plan`, sa, { plan: 'pro', reason: 'upgrade' });
      expect(res.status).toBe(200);
      const data = (await json(res)).data;
      expect(data.plan).toBe('pro');

      const tenant = await master(`SELECT plan, max_users FROM tenants WHERE id = ?`, agency.id).first<any>();
      expect(tenant.plan).toBe('pro');
      expect(tenant.max_users).toBe(data.maxUsers);
      expect(tenant.max_users).toBeGreaterThan(5);
      const sub = await master(`SELECT plan, amount FROM subscriptions WHERE tenant_id = ?`, agency.id).first<any>();
      expect(sub.plan).toBe('pro');
      expect(sub.amount).toBe(data.yearlyPrice);

      const [row] = await audits('tenant.plan_change', agency.id);
      expect(row.details).toMatchObject({ before: { plan: 'basic', maxUsers: 5 }, after: { plan: 'pro', maxUsers: tenant.max_users }, reason: 'upgrade' });
    });

    it('moving a trial agency to a paid plan activates it', async () => {
      const agency = await makeAgency('trial', 'trial');
      await master(`UPDATE subscriptions SET status = 'trial', trial_ends_at = '2099-01-01T00:00:00Z' WHERE tenant_id = ?`, agency.id).run();
      expect((await call('PUT', `/admin/tenants/${agency.id}/plan`, sa, { plan: 'basic' })).status).toBe(200);
      expect((await master(`SELECT status FROM tenants WHERE id = ?`, agency.id).first<any>()).status).toBe('active');
      const sub = await master(`SELECT status, trial_ends_at FROM subscriptions WHERE tenant_id = ?`, agency.id).first<any>();
      expect(sub).toEqual({ status: 'active', trial_ends_at: null });
    });
  });

  describe('features, caps, usage and top-ups', () => {
    it('sets, lists and resets feature overrides with audit', async () => {
      const agency = await makeAgency('basic');
      const put = await call('PUT', `/admin/tenants/${agency.id}/features`, sa, { features: { ai_copilot: true, voip_calling: false } });
      expect(put.status).toBe(200);
      expect((await json(put)).data.overrides).toEqual({ ai_copilot: true, voip_calling: false });

      const list = (await json(await call('GET', `/admin/tenants/${agency.id}/features`, sa))).data;
      expect(list.plan).toBe('basic');
      expect(list.features.find((f: any) => f.key === 'ai_copilot')).toMatchObject({ enabled: true, isOverride: true });

      const [row] = await audits('tenant.features_update', agency.id);
      expect(row.details).toMatchObject({ before: {}, after: { ai_copilot: true, voip_calling: false } });

      expect((await call('PUT', `/admin/tenants/${agency.id}/features`, sa, { features: { 'Bad Key!': true } })).status).toBe(400);
      expect((await call('DELETE', `/admin/tenants/${agency.id}/features`, sa)).status).toBe(200);
      expect((await audits('tenant.features_reset', agency.id)).length).toBe(1);
      expect((await master(`SELECT COUNT(*) AS c FROM tenant_feature_flags WHERE tenant_id = ?`, agency.id).first<any>()).c).toBe(0);
    });

    it('sets usage cap overrides with audit and refuses the AI credit key (it follows the catalogue)', async () => {
      const agency = await makeAgency();
      const put = await call('PUT', `/admin/tenants/${agency.id}/caps`, sa, { caps: [{ capKey: 'sms_per_month', capValue: 250 }, { capKey: 'ai_actions_per_day', capValue: 40 }] });
      expect(put.status).toBe(200);
      const caps = (await json(await call('GET', `/admin/tenants/${agency.id}/caps`, sa))).data.caps;
      expect(caps.find((c: any) => c.capKey === 'sms_per_month')).toMatchObject({ capValue: 250, resetPeriod: 'monthly' });
      expect(caps.find((c: any) => c.capKey === 'ai_actions_per_day')).toMatchObject({ capValue: 40, resetPeriod: 'daily' });
      const [row] = await audits('tenant.caps_update', agency.id);
      expect(row.details.before).toEqual([]);
      expect(row.details.after.length).toBe(2);
      expect((await call('PUT', `/admin/tenants/${agency.id}/caps`, sa, { caps: [{ capKey: 'ai_credits_per_month', capValue: 9 }] })).status).toBe(400);
    });

    it('an AI credit top-up raises the allowance, shows in usage and is audited', async () => {
      const agency = await makeAgency('basic');
      const before = await getAllowance(testEnv, agency.id, 'ai_credits');
      const grant = await call('POST', `/admin/tenants/${agency.id}/addons`, sa, { productKey: 'ai_credit_pack_5000', quantity: 2, note: 'goodwill' });
      expect(grant.status).toBe(201);
      const after = await getAllowance(testEnv, agency.id, 'ai_credits');
      expect(after).toBe(before + 10000);

      const usage = (await json(await call('GET', `/admin/tenants/${agency.id}/usage`, sa))).data;
      expect(usage.plan).toBe('basic');
      expect(usage.allowances.ai_credits).toEqual({ allowance: after, used: 0, remaining: after });
      expect(Object.keys(usage.allowances).sort()).toEqual(['ai_credits', 'call_minutes', 'email', 'otp', 'sms', 'whatsapp']);
      expect(usage.seats.limit).toBeGreaterThanOrEqual(5);
      expect(usage.addons.some((a: any) => a.product_key === 'ai_credit_pack_5000' && a.granted_by === SA_EMAIL)).toBe(true);

      const [row] = await audits('tenant.addon.grant', agency.id);
      expect(row.admin_id).toBe(SA_ID);
      expect(row.details).toMatchObject({ actor: SA_EMAIL, productKey: 'ai_credit_pack_5000', quantity: 2, unitsGranted: 10000 });
    });
  });

  describe('impersonation', () => {
    it('requires a reason', async () => {
      const agency = await makeAgency();
      expect((await call('POST', `/admin/tenants/${agency.id}/impersonate`, sa, {})).status).toBe(400);
      expect((await call('POST', `/admin/tenants/${agency.id}/impersonate`, sa, { reason: 'x' })).status).toBe(400);
      expect((await call('POST', `/admin/tenants/${agency.id}/impersonate`, sa, { reason: '   ' })).status).toBe(400);
      expect((await master(`SELECT COUNT(*) AS c FROM impersonation_sessions WHERE tenant_id = ?`, agency.id).first<any>()).c).toBe(0);
    });

    it('issues a 30 minute marked tenant token, logs every request in the agency activity log, and cannot act as a super admin', async () => {
      const agency = await makeAgency();
      const res = await call('POST', `/admin/tenants/${agency.id}/impersonate`, sa, { reason: 'customer cannot find invoices' });
      expect(res.status).toBe(201);
      const data = (await json(res)).data;
      expect(data.refreshToken).toBeUndefined();
      expect(data.user.id).toBe(agency.adminId);

      const c = claims(data.accessToken);
      expect(c.exp - c.iat).toBe(30 * 60);
      expect(c.imp).toBe(SA_ID);
      expect(c.tenantId).toBe(agency.id);
      expect(c.userId).toBe(agency.adminId);
      expect(c.sid).toBe(data.sessionId);
      expect(c.aud).toBeUndefined();

      // Works on tenant routes...
      expect((await call('GET', '/contacts', data.accessToken)).status).toBe(200);
      // ...and each request is in the agency activity log with the support actor.
      const { results } = await master(`SELECT user_id, action, entity_type, entity_id, details FROM activity_logs WHERE entity_id = ? AND action = 'support_request'`, data.sessionId).all<any>();
      expect(results.length).toBeGreaterThanOrEqual(1);
      const log = results[results.length - 1];
      expect(log.user_id).toBe(agency.adminId);
      expect(log.entity_type).toBe('support_session');
      expect(JSON.parse(log.details)).toMatchObject({ actor: `Support (${SA_NAME})`, superAdminId: SA_ID, method: 'GET', path: '/api/v1/contacts', status: 200 });

      // Never a super admin, never a credential change.
      expect((await call('GET', '/admin/tenants', data.accessToken)).status).toBe(403);
      expect((await call('POST', `/admin/tenants/${agency.id}/suspend`, data.accessToken)).status).toBe(403);
      expect((await call('GET', '/admin/auth/me', data.accessToken)).status).toBe(403);
      expect((await call('POST', '/auth/logout', data.accessToken)).status).toBe(403);
      expect((await call('POST', '/auth/refresh-token', null, { refreshToken: 'whatever' })).status).toBe(401);

      // Who, which agency, which user, why, when.
      const session = await master(`SELECT * FROM impersonation_sessions WHERE id = ?`, data.sessionId).first<any>();
      expect(session).toMatchObject({ super_admin_id: SA_ID, tenant_id: agency.id, user_id: agency.adminId, user_email: agency.adminEmail, reason: 'customer cannot find invoices', ended_at: null });
      expect(Date.parse(session.expires_at) - Date.parse(session.started_at)).toBe(30 * 60 * 1000);
      const [row] = await audits('tenant.impersonate_start', agency.id);
      expect(row.admin_id).toBe(SA_ID);
      expect(row.details).toMatchObject({ actor: SA_EMAIL, reason: 'customer cannot find invoices', after: { sessionId: data.sessionId, userId: agency.adminId } });
      expect(JSON.stringify(row.details)).not.toContain(data.accessToken);
    });

    it('ends when the session is ended, when it expires, and when the super admin is deactivated', async () => {
      const agency = await makeAgency();
      const start = async () => (await json(await call('POST', `/admin/tenants/${agency.id}/impersonate`, sa, { reason: 'investigating a report' }))).data;

      const a = await start();
      expect((await call('GET', '/contacts', a.accessToken)).status).toBe(200);
      const end = await call('POST', `/admin/impersonation/${a.sessionId}/end`, sa);
      expect(end.status).toBe(200);
      expect((await call('GET', '/contacts', a.accessToken)).status).toBe(401);
      expect((await call('POST', `/admin/impersonation/${a.sessionId}/end`, sa)).status).toBe(409);
      expect((await audits('tenant.impersonate_end', agency.id)).length).toBe(1);

      const b = await start();
      await master(`UPDATE impersonation_sessions SET expires_at = ? WHERE id = ?`, new Date(Date.now() - 1000).toISOString(), b.sessionId).run();
      expect((await call('GET', '/contacts', b.accessToken)).status).toBe(401);

      const other = `${P}-0000000000c1`;
      const otherToken = await superAdminToken(testEnv, { id: other, email: 'temp@r111.sa', name: 'Temp Admin' });
      const c = (await json(await call('POST', `/admin/tenants/${agency.id}/impersonate`, otherToken, { reason: 'short lived access' }))).data;
      expect((await call('GET', '/contacts', c.accessToken)).status).toBe(200);
      await master(`UPDATE super_admins SET is_active = 0 WHERE id = ?`, other).run();
      expect((await call('GET', '/contacts', c.accessToken)).status).toBe(401);
    });

    it('refuses to impersonate a suspended agency and lists sessions', async () => {
      const agency = await makeAgency();
      await call('POST', `/admin/tenants/${agency.id}/suspend`, sa);
      expect((await call('POST', `/admin/tenants/${agency.id}/impersonate`, sa, { reason: 'check the data' })).status).toBe(409);
      await call('POST', `/admin/tenants/${agency.id}/reactivate`, sa);
      await call('POST', `/admin/tenants/${agency.id}/impersonate`, sa, { reason: 'check the data' });
      const list = await json(await call('GET', `/admin/impersonation?tenantId=${agency.id}`, sa));
      expect(list.pagination.total).toBe(1);
      expect(list.data[0]).toMatchObject({ tenant_id: agency.id, super_admin_name: SA_NAME, reason: 'check the data' });
    });
  });

  describe('audit', () => {
    it('every write under /admin creates an audit row', async () => {
      const agency = await makeAgency('basic');
      const payment = { amount: 500, method: 'bank_transfer', reference: 'UTR123' };
      const subId = (await master(`SELECT id FROM subscriptions WHERE tenant_id = ?`, agency.id).first<any>()).id as string;

      const writes: Array<[string, string, unknown?]> = [
        ['POST', `/admin/tenants/${agency.id}/suspend`],
        ['POST', `/admin/tenants/${agency.id}/reactivate`],
        ['PUT', `/admin/tenants/${agency.id}/plan`, { plan: 'pro' }],
        ['PUT', `/admin/tenants/${agency.id}/features`, { features: { ai_copilot: true } }],
        ['DELETE', `/admin/tenants/${agency.id}/features`],
        ['PUT', `/admin/tenants/${agency.id}/caps`, { caps: [{ capKey: 'sms_per_month', capValue: 10 }] }],
        ['POST', `/admin/tenants/${agency.id}/addons`, { productKey: 'extra_user', quantity: 1 }],
        ['POST', `/admin/tenants/${agency.id}/impersonate`, { reason: 'audit coverage test' }],
        ['POST', `/admin/subscriptions/${subId}/record-payment`, payment],
        ['POST', `/admin/subscriptions/${subId}/cancel`, { reason: 'test', immediate: true }],
        ['POST', `/admin/tenants/${agency.id}/reactivate`],
        ['POST', `/admin/tenants/${agency.id}/cancel`],
      ];
      for (const [method, path, body] of writes) {
        const before = await auditCount();
        const res = await call(method, path, sa, body);
        expect(res.status, `${method} ${path}`).toBeLessThan(300);
        expect(await auditCount(), `${method} ${path} wrote no audit row`).toBeGreaterThan(before);
      }

      // The session started above can be ended, which audits as well.
      const sessionId = (await master(`SELECT id FROM impersonation_sessions WHERE tenant_id = ?`, agency.id).first<any>()).id as string;
      const before = await auditCount();
      expect((await call('POST', `/admin/impersonation/${sessionId}/end`, sa)).status).toBe(200);
      expect(await auditCount()).toBe(before + 1);

      // Catalogue edits are audited too (R109), through the same service.
      const cat = await auditCount();
      const plan = await call('PUT', '/admin/catalogue/plans/basic', sa, { description: 'R111 audit coverage' });
      expect(plan.status).toBe(200);
      expect(await auditCount()).toBeGreaterThan(cat);
      await call('PUT', '/admin/catalogue/plans/basic', sa, { description: null });
    });

    it('a rejected write leaves no audit row', async () => {
      const agency = await makeAgency();
      const before = await auditCount();
      expect((await call('PUT', `/admin/tenants/${agency.id}/plan`, sa, { plan: 'nope' })).status).toBe(400);
      expect((await call('POST', `/admin/tenants/${agency.id}/reactivate`, sa)).status).toBe(409);
      expect((await call('POST', `/admin/tenants/${agency.id}/impersonate`, sa, {})).status).toBe(400);
      expect(await auditCount()).toBe(before);
    });

    it('never stores secrets: password-like keys are redacted', async () => {
      const agency = await makeAgency();
      await logAdminAction(testEnv, { id: SA_ID, email: SA_EMAIL }, 'test.redaction', agency.id, { password: 'hunter2hunter2', nested: { apiKey: 'sk-live-1', plan: 'basic' } }, { temporaryPassword: 'abc', token: 't', plan: 'pro' });
      const [row] = await audits('test.redaction', agency.id);
      expect(JSON.stringify(row.details)).not.toMatch(/hunter2|sk-live|"abc"|"t"/);
      expect(row.details.before).toEqual({ password: '[redacted]', nested: { apiKey: '[redacted]', plan: 'basic' } });
      expect(row.details.after).toEqual({ temporaryPassword: '[redacted]', token: '[redacted]', plan: 'pro' });
    });

    it('GET /admin/audit-log filters by action, agency and admin and paginates newest first', async () => {
      const agency = await makeAgency();
      await call('POST', `/admin/tenants/${agency.id}/suspend`, sa, { reason: 'filter test' });
      await call('POST', `/admin/tenants/${agency.id}/reactivate`, sa);

      const byTenant = await json(await call('GET', `/admin/audit-log?tenantId=${agency.id}`, sa));
      expect(byTenant.pagination.total).toBe(2);
      expect(byTenant.data.map((r: any) => r.action)).toEqual(['tenant.reactivate', 'tenant.suspend']);
      expect(byTenant.data[0]).toMatchObject({ admin_id: SA_ID, admin_name: SA_NAME, admin_email: SA_EMAIL, entity_type: 'tenant' });
      expect(byTenant.data[1].details.before).toEqual({ status: 'active' });

      const byAction = await json(await call('GET', `/admin/audit-log?tenantId=${agency.id}&action=tenant.suspend`, sa));
      expect(byAction.data.length).toBe(1);

      const paged = await json(await call('GET', `/admin/audit-log?tenantId=${agency.id}&limit=1&page=2`, sa));
      expect(paged.data.length).toBe(1);
      expect(paged.pagination).toMatchObject({ total: 2, page: 2, limit: 1, hasMore: false });

      const byAdmin = await json(await call('GET', `/admin/audit-log?adminId=${SA_ID}&limit=5`, sa));
      expect(byAdmin.data.every((r: any) => r.admin_id === SA_ID)).toBe(true);
    });
  });

  describe('console reads', () => {
    it('serves the ported dashboard, report and subscription reads', async () => {
      await makeAgency('pro');
      const paths = [
        '/admin/dashboard/stats',
        '/admin/dashboard/growth',
        '/admin/dashboard/revenue',
        '/admin/dashboard/top-tenants',
        '/admin/dashboard/recent-activity',
        '/admin/reports/feature-usage',
        '/admin/reports/geographic-distribution',
        '/admin/reports/platform-summary',
        '/admin/subscriptions',
      ];
      for (const path of paths) {
        const res = await call('GET', path, sa);
        expect(res.status, path).toBe(200);
        expect((await json(res)).success, path).toBe(true);
      }
      const stats = (await json(await call('GET', '/admin/dashboard/stats', sa))).data;
      expect(stats.tenantStats.total).toBeGreaterThan(0);
      expect(stats.revenueStats).toHaveProperty('mrr');
      const growth = (await json(await call('GET', '/admin/dashboard/growth', sa))).data.months;
      expect(growth.length).toBe(12);
      const subs = await json(await call('GET', '/admin/subscriptions?limit=5', sa));
      expect(subs.data.length).toBeLessThanOrEqual(5);
      expect(subs.revenue).toHaveProperty('active_count');
      const detail = await json(await call('GET', `/admin/subscriptions/${subs.data[0].id}`, sa));
      expect(detail.data.subscription.id).toBe(subs.data[0].id);
    });

    it('lists agencies with per-agency counts read from the agency database, capped at 50 per request and cached', async () => {
      const agency = await makeAgency();
      await master(`INSERT INTO contacts (id, name, email, created_by) VALUES (?, 'Counted', 'c@r111.test', ?)`, `${P}-44444444${String(agencySeq).padStart(4, '0')}`, agency.adminId).run().catch(() => undefined);
      const res = await json(await call('GET', '/admin/tenants?counts=1&limit=100', sa));
      expect(res.pagination.limit).toBe(50);
      expect(res.data.length).toBeLessThanOrEqual(50);
      expect(res.data.every((t: any) => typeof t.stats?.contactCount === 'number')).toBe(true);
      expect(await testEnv.CACHE.get(`sa:counts:${agency.id}`)).not.toBeNull();
      const detail = await json(await call('GET', `/admin/tenants/${agency.id}`, sa));
      expect(detail.data.stats).toHaveProperty('contactCount');
    });
  });
});
