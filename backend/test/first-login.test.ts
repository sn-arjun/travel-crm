import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';
import { signAccessToken } from '../src/utils/jwt';
import { passwordChangeAllowed } from '../src/middleware/tenant';

// R113: a provisioned agency admin signs in with a temporary password and can do nothing but change it.
const testEnv = env as any;
const e = { ...testEnv, TENANCY_MODE: 'single', SENDGRID_API_KEY: '' };

const PLATFORM_TENANT = '0196a113-0000-7000-8000-0000000000aa';
const SUPER_EMAIL = 'super-r113@platform.test';
const OWNER_EMAIL = 'owner-r113@r113.test';

let tenantId = '';
let tempPassword = '';
let loginData: any;
let firstToken = '';
let firstRefresh = '';
let otherRefresh = '';
const NEW_PASSWORD = 'Voyage2026ok';

async function call(method: string, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const h: Record<string, string> = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }),
    e,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

const login = (password: string) => call('POST', '/auth/login', null, { email: OWNER_EMAIL, password, tenantId });

describe('first login: forced password change', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    await testEnv.MASTER_DB
      .prepare(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status) VALUES (?, 'Platform', 'r113-platform', 'enterprise', 'active')`)
      .bind(PLATFORM_TENANT)
      .run();
    await testEnv.MASTER_DB
      .prepare(`INSERT OR REPLACE INTO super_admins (id, email, name, password_hash, role, is_active) VALUES ('0196a113-0000-7000-8000-0000000000ab', ?, 'R113 Super', 'unused', 'super_admin', 1)`)
      .bind(SUPER_EMAIL)
      .run();
    const superToken = await signAccessToken({ userId: 'r113-super', tenantId: PLATFORM_TENANT, role: 'admin', email: SUPER_EMAIL }, testEnv.JWT_SECRET);

    // The R104 path: the provisioner creates the agency and its admin with a temporary password.
    const res = await call('POST', '/admin/tenants', superToken, {
      companyName: 'Agency R113',
      slug: 'r113-agency',
      ownerName: 'Owner R113',
      ownerEmail: OWNER_EMAIL,
      plan: 'pro',
      country: 'India',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      taxSystem: 'gst',
      region: 'in',
    });
    expect(res.status).toBe(201);
    const json = (await res.json()) as any;
    tenantId = json.data.tenantId;
    tempPassword = json.data.temporaryPassword;
  });

  afterAll(async () => {
    await testEnv.MASTER_DB.batch([
      testEnv.MASTER_DB.prepare('DELETE FROM tenant_users WHERE tenant_id = ?').bind(tenantId),
      testEnv.MASTER_DB.prepare('DELETE FROM subscriptions WHERE tenant_id = ?').bind(tenantId),
      testEnv.MASTER_DB.prepare('DELETE FROM tenants WHERE id = ?').bind(tenantId),
      testEnv.MASTER_DB.prepare('DELETE FROM tenants WHERE id = ?').bind(PLATFORM_TENANT),
    ]);
  });

  it('logs the provisioned admin in with mustChangePassword true and a restricted token', async () => {
    const res = await login(tempPassword);
    expect(res.status).toBe(200);
    loginData = ((await res.json()) as any).data;
    expect(loginData.mustChangePassword).toBe(true);
    firstToken = loginData.accessToken;
    firstRefresh = loginData.refreshToken;
    const claims = JSON.parse(atob(firstToken.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    expect(claims.mcp).toBe(true);
  });

  it('blocks data endpoints with 403 PASSWORD_CHANGE_REQUIRED', async () => {
    for (const path of ['/leads', '/contacts', '/settings/company', '/dashboard/summary']) {
      const res = await call('GET', path, firstToken);
      expect(res.status, path).toBe(403);
      expect(((await res.json()) as any).error.code, path).toBe('PASSWORD_CHANGE_REQUIRED');
    }
    const write = await call('POST', '/leads', firstToken, { name: 'x' });
    expect(write.status).toBe(403);
    expect(((await write.json()) as any).error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('still lets the token read its own profile', async () => {
    const res = await call('GET', '/users/me', firstToken);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data.email).toBe(OWNER_EMAIL);
  });

  it('a refreshed token is still restricted while the password is temporary', async () => {
    const res = await call('POST', '/auth/refresh-token', null, { refreshToken: firstRefresh });
    expect(res.status).toBe(200);
    const data = ((await res.json()) as any).data;
    expect(data.mustChangePassword).toBe(true);
    firstToken = data.accessToken;
    firstRefresh = data.refreshToken;
    expect((await call('GET', '/leads', firstToken)).status).toBe(403);
  });

  it('only the change-password, logout and profile read paths are allowed', () => {
    expect(passwordChangeAllowed('POST', '/api/v1/auth/change-password')).toBe(true);
    expect(passwordChangeAllowed('POST', '/api/auth/logout')).toBe(true);
    expect(passwordChangeAllowed('GET', '/api/v1/users/me')).toBe(true);
    expect(passwordChangeAllowed('PUT', '/api/v1/users/me')).toBe(false);
    expect(passwordChangeAllowed('GET', '/api/v1/users')).toBe(false);
    expect(passwordChangeAllowed('GET', '/api/v1/auth/sessions')).toBe(false);
  });

  it('rejects a wrong current password with 401', async () => {
    const res = await call('POST', '/auth/change-password', firstToken, { currentPassword: 'not-the-password1', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
    expect((await call('GET', '/leads', firstToken)).status).toBe(403); // still restricted
  });

  it('rejects weak new passwords with 400', async () => {
    for (const newPassword of ['Short1a', 'onlyletterspassword', '12345678901234']) {
      const res = await call('POST', '/auth/change-password', firstToken, { currentPassword: tempPassword, newPassword });
      expect(res.status, newPassword).toBe(400);
    }
  });

  it('rejects reusing the current password with 400', async () => {
    const res = await call('POST', '/auth/change-password', firstToken, { currentPassword: tempPassword, newPassword: tempPassword });
    expect(res.status).toBe(400);
  });

  it('a second session exists before the change (to prove revocation)', async () => {
    const res = await login(tempPassword);
    expect(res.status).toBe(200);
    otherRefresh = ((await res.json()) as any).data.refreshToken;
    expect(await testEnv.SESSIONS.get(`refresh:${otherRefresh}`)).not.toBeNull();
  });

  it('changes the password: new token works, other sessions are revoked, mail is in the outbox', async () => {
    await call('DELETE', '/test/outbox', null);
    const res = await call('POST', '/auth/change-password', firstToken, { currentPassword: tempPassword, newPassword: NEW_PASSWORD }, { 'X-Refresh-Token': firstRefresh });
    expect(res.status).toBe(200);
    const data = ((await res.json()) as any).data;
    expect(data.mustChangePassword).toBe(false);
    expect((await call('GET', '/leads', data.accessToken)).status).toBe(200);

    // The caller's own refresh token survives and now yields an unrestricted token.
    const refreshed = await call('POST', '/auth/refresh-token', null, { refreshToken: firstRefresh });
    expect(refreshed.status).toBe(200);
    const r = ((await refreshed.json()) as any).data;
    expect(r.mustChangePassword).toBe(false);
    expect((await call('GET', '/leads', r.accessToken)).status).toBe(200);

    // Every other session is gone.
    expect(await testEnv.SESSIONS.get(`refresh:${otherRefresh}`)).toBeNull();
    expect((await call('POST', '/auth/refresh-token', null, { refreshToken: otherRefresh })).status).toBe(401);

    // The old password no longer signs in; the new one does, without the flag.
    expect((await login(tempPassword)).status).toBe(401);
    const again = await login(NEW_PASSWORD);
    expect(again.status).toBe(200);
    const againData = ((await again.json()) as any).data;
    expect(againData.mustChangePassword).toBe(false);
    expect((await call('GET', '/leads', againData.accessToken)).status).toBe(200);

    const outbox = await call('GET', `/test/outbox?to=${encodeURIComponent(OWNER_EMAIL)}`, null);
    const mails = ((await outbox.json()) as any).data as Array<{ template: string; text: string; html: string }>;
    const changed = mails.filter((m) => m.template === 'password_changed');
    expect(changed).toHaveLength(1);
    expect(changed[0]!.text + changed[0]!.html).not.toContain(NEW_PASSWORD);
  });

  it('change-password also works for a user who is not forced (voluntary change)', async () => {
    const adminLogin = await login(NEW_PASSWORD);
    const { accessToken, refreshToken } = ((await adminLogin.json()) as any).data;
    const res = await call('POST', '/auth/change-password', accessToken, { currentPassword: NEW_PASSWORD, newPassword: 'Another1Passw0rd' }, { 'X-Refresh-Token': refreshToken });
    expect(res.status).toBe(200);
    expect((await login(NEW_PASSWORD)).status).toBe(401);
    expect((await login('Another1Passw0rd')).status).toBe(200);
  });

  it('requires authentication', async () => {
    const res = await call('POST', '/auth/change-password', null, { currentPassword: 'a', newPassword: 'Abcdefghij12' });
    expect(res.status).toBe(401);
  });
});
