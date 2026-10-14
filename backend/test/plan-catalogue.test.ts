import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import worker from '../src/index';
import { hashPassword } from '../src/utils/password';
import { signAccessToken } from '../src/utils/jwt';
import { getAllowance, getCatalogue, seatLimit, bumpCatalogueVersion, currentPeriodKey } from '../src/services/plans/catalogue';
import { commPackPrice, addonPrice } from '../src/services/plans/pricing';
import { getCreditBalance } from '../src/services/ai-credits';
import { checkTrialExpiry } from '../src/cron/dispatch';

const testEnv = env as any;
const multiEnv = { ...testEnv, TENANCY_MODE: 'multi', TENANT_DB_PLATFORM: testEnv.MASTER_DB };
const POOL = testEnv.TENANT_DB_POOL_3 as D1Database; // the Basic agency's database
const POOL_PAST = testEnv.TENANT_DB_POOL_2 as D1Database; // the expired trial
const POOL_FUTURE = testEnv.TENANT_DB_POOL_1 as D1Database; // the running trial

// Unique ids: storage is shared across test files (isolatedStorage is false).
const PLATFORM = '0196a109-0000-7000-8000-0000000000aa';
const BASIC = '0196a109-0000-7000-8000-0000000000b1';
const TRIAL_PAST = '0196a109-0000-7000-8000-0000000000c1';
const TRIAL_FUTURE = '0196a109-0000-7000-8000-0000000000c2';
const SUPER_EMAIL = 'super-r109@platform.test';
const PASSWORD = 'Catalogue@123';
const ADMIN_EMAIL = 'admin@r109-basic.test';
const ADMIN_USER = '0196a109-1111-7000-8000-0000000000b1';

let superToken = '';
let basicToken = '';

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

const master = (sql: string, ...binds: unknown[]) => (testEnv.MASTER_DB as D1Database).prepare(sql).bind(...binds);

async function addUser(id: string, email: string, hash: string, active = 1) {
  await POOL.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, role, name, is_active) VALUES (?, ?, ?, 'salesperson', ?, ?)`).bind(id, email, hash, email, active).run();
}

async function insertTenant(id: string, sub: string, plan: string, status: string, binding: string) {
  await master(
    `INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status, db_binding) VALUES (?, ?, ?, ?, ?, ?)`,
    id, `R109 ${sub}`, `r109-${sub}`, plan, status, binding,
  ).run();
}

/** Users other test files left active in the shared pool database: parked while this file counts seats. */
const parked: string[] = [];

async function cleanup() {
  const ids = [BASIC, TRIAL_PAST, TRIAL_FUTURE];
  const tables = await testEnv.MASTER_DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'").all();
  const withTenantId: string[] = [];
  for (const { name } of tables.results as Array<{ name: string }>) {
    const cols = await testEnv.MASTER_DB.prepare(`PRAGMA table_info("${name}")`).all();
    if ((cols.results as Array<{ name: string }>).some((c) => c.name === 'tenant_id')) withTenantId.push(name);
  }
  for (const id of ids) {
    for (let pass = 0; pass < 3; pass++) {
      for (const table of withTenantId) {
        try { await master(`DELETE FROM "${table}" WHERE tenant_id = ?`, id).run(); } catch { /* a parent row still references it: next pass */ }
      }
    }
    await master('DELETE FROM tenants WHERE id = ?', id).run();
  }
  await master('DELETE FROM tenants WHERE id IN (?, ?)', 'r109-starter', 'r109-free').run();
  for (const pool of [POOL, POOL_PAST, POOL_FUTURE]) await cleanPool(pool);
}

/** Rows that point at this file's users (login history, activity log, ...) go first, then the users. */
async function cleanPool(POOL: D1Database) {
  const poolTables = await POOL.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'").all();
  for (const { name } of poolTables.results as Array<{ name: string }>) {
    const cols = await POOL.prepare(`PRAGMA table_info("${name}")`).all();
    for (const col of (cols.results as Array<{ name: string }>).map((c) => c.name).filter((c) => c === 'user_id' || c === 'created_by' || c === 'assigned_to')) {
      try { await POOL.prepare(`DELETE FROM "${name}" WHERE "${col}" IN (SELECT id FROM users WHERE email LIKE '%@r109-%')`).run(); } catch { /* not a delete-able link */ }
    }
  }
  await POOL.prepare('DELETE FROM users WHERE email LIKE ?').bind('%@r109-%').run();
}

/** Put the seeded catalogue values back, whatever a test changed. */
async function restoreSeed() {
  await master(`UPDATE comm_unit_costs SET unit_cost = 8.06, margin_pct = 20 WHERE channel = 'sms' AND market = 'IN'`).run();
  await master(`UPDATE plan_prices SET yearly_price = 12000 WHERE plan_key = 'basic' AND market = 'IN'`).run();
  await master(`DELETE FROM plan_features WHERE plan_key = 'basic' AND feature_key = 'ai_copilot'`).run();
  await master(`UPDATE plan_allowances SET monthly_amount = 1000 WHERE plan_key = 'basic' AND allowance_key = 'ai_credits'`).run();
  await bumpCatalogueVersion(testEnv);
}

describe('plan catalogue (R109)', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    await applyD1Migrations(POOL, testEnv.TEST_MIGRATIONS);
    // Other test files park agencies on the pool databases and a binding belongs to one agency: release them.
    await master("UPDATE tenants SET db_binding = NULL WHERE db_binding LIKE 'TENANT_DB_POOL_%'").run();
    await applyD1Migrations(POOL_PAST, testEnv.TEST_MIGRATIONS);
    await applyD1Migrations(POOL_FUTURE, testEnv.TEST_MIGRATIONS);
    await cleanup();
    await restoreSeed();
    const others = await POOL.prepare("SELECT id FROM users WHERE is_active = 1").all<{ id: string }>();
    for (const u of others.results) parked.push(u.id);
    await POOL.prepare('UPDATE users SET is_active = 0').run();

    await insertTenant(PLATFORM, 'platform', 'enterprise', 'active', 'TENANT_DB_PLATFORM');
    await master(`INSERT OR REPLACE INTO super_admins (id, email, name, password_hash, role, is_active) VALUES (?, ?, 'R109 Super', 'unused', 'super_admin', 1)`, '0196a109-0000-7000-8000-0000000000ab', SUPER_EMAIL).run();
    superToken = await signAccessToken({ userId: 'r109-super', tenantId: PLATFORM, role: 'admin', email: SUPER_EMAIL }, testEnv.JWT_SECRET);

    // A Basic agency (5 users included) already holding its 5 seats: the admin and four others.
    const hash = await hashPassword(PASSWORD);
    await insertTenant(BASIC, 'basic', 'basic', 'active', 'TENANT_DB_POOL_3');
    await master(`INSERT OR REPLACE INTO tenant_users (id, tenant_id, email, user_id, role, is_active) VALUES (?, ?, ?, ?, 'admin', 1)`, '0196a109-4444-7000-8000-0000000000b1', BASIC, ADMIN_EMAIL, ADMIN_USER).run();
    await POOL.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, role, name, is_active) VALUES (?, ?, ?, 'admin', 'R109 Admin', 1)`).bind(ADMIN_USER, ADMIN_EMAIL, hash).run();
    for (let i = 1; i <= 4; i++) await addUser(`0196a109-1111-7000-8000-00000000010${i}`, `staff${i}@r109-basic.test`, hash);
    basicToken = await signAccessToken({ userId: ADMIN_USER, tenantId: BASIC, role: 'admin', email: ADMIN_EMAIL }, testEnv.JWT_SECRET);
  });

  afterAll(async () => {
    await restoreSeed();
    await cleanup();
    for (const id of parked) await POOL.prepare('UPDATE users SET is_active = 1 WHERE id = ?').bind(id).run();
  });

  describe('seed', () => {
    it('holds the owner-decided India prices and included users, and no active per-user price', async () => {
      const catalogue = await getCatalogue(testEnv);
      const rows = Object.fromEntries(catalogue.plans.map((p) => [p.key, p.prices.find((x) => x.market === 'IN' && x.isActive)]));
      expect(rows.basic).toMatchObject({ yearlyPrice: 12000, includedUsers: 5, currency: 'INR' });
      expect(rows.pro).toMatchObject({ yearlyPrice: 18000, includedUsers: 15 });
      expect(rows.enterprise).toMatchObject({ yearlyPrice: 24000, includedUsers: 100 });
      expect(catalogue.plans.map((p) => p.key).sort()).toEqual(['basic', 'enterprise', 'pro', 'trial']);
    });

    it('trial has no voip_calling; paid plans keep it', async () => {
      const catalogue = await getCatalogue(testEnv);
      const features = (key: string) => catalogue.plans.find((p) => p.key === key)!.features;
      expect(features('trial')).not.toContain('voip_calling');
      expect(features('basic')).toContain('voip_calling');
      expect(features('enterprise')).toContain('ai_coaching');
    });

    it('migrates starter tenants to basic and free tenants to trial', async () => {
      await master(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status) VALUES ('r109-starter', 'Old Starter', 'r109-starter', 'starter', 'active')`).run();
      await master(`INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status) VALUES ('r109-free', 'Old Free', 'r109-free', 'free', 'trial')`).run();
      const migration = (testEnv.TEST_MIGRATIONS as Array<{ name: string; queries: string[] }>).find((m) => m.name.includes('0015_plan_catalogue'))!;
      const body = (q: string) => q.split(/\r?\n/).filter((line) => !line.startsWith('--')).join(' ').trim();
      const fixes = migration.queries.map(body).filter((q) => /^UPDATE (tenants|subscriptions) SET plan/.test(q));
      expect(fixes).toHaveLength(4);
      for (const q of fixes) await testEnv.MASTER_DB.prepare(q).run();
      const plans = await testEnv.MASTER_DB.prepare(`SELECT id, plan FROM tenants WHERE id IN ('r109-starter', 'r109-free') ORDER BY id`).all();
      expect(plans.results).toEqual([{ id: 'r109-free', plan: 'trial' }, { id: 'r109-starter', plan: 'basic' }]);
    });
  });

  describe('features come from plan_features', () => {
    it('toggling a feature through the admin PUT changes the answer at once (cache invalidated)', async () => {
      const check = async () => ((await (await call(multiEnv, 'GET', '/automations', basicToken)).json()) as any).data.aiIncluded;
      expect(await check()).toBe(false);

      const basicFeatures = (await getCatalogue(testEnv)).plans.find((p) => p.key === 'basic')!.features;
      const on = await call(multiEnv, 'PUT', '/admin/catalogue/plans/basic', superToken, { features: [...basicFeatures, 'ai_copilot'] });
      expect(on.status).toBe(200);
      expect(await check()).toBe(true);

      const off = await call(multiEnv, 'PUT', '/admin/catalogue/plans/basic', superToken, { features: basicFeatures });
      expect(off.status).toBe(200);
      expect(await check()).toBe(false);

      const audit = await master(`SELECT COUNT(*) AS c FROM super_admin_audit_log WHERE action = 'catalogue.plan.update' AND entity_id = 'basic'`).first<{ c: number }>();
      expect(audit!.c).toBeGreaterThanOrEqual(2);
    });

    it('a tenant admin cannot read or change the catalogue', async () => {
      expect((await call(multiEnv, 'GET', '/admin/catalogue', basicToken)).status).toBe(403);
      expect((await call(multiEnv, 'PUT', '/admin/catalogue/plans/basic', basicToken, { name: 'Hacked' })).status).toBe(403);
      expect((await call(multiEnv, 'POST', `/admin/tenants/${BASIC}/addons`, basicToken, { productKey: 'extra_user' })).status).toBe(403);
    });
  });

  describe('seat limits', () => {
    const invite = (n: number) => call(multiEnv, 'POST', '/users', basicToken, { email: `invitee${n}@r109-basic.test`, name: `Invitee ${n}`, role: 'salesperson' });

    it('a Basic agency with 5 active users cannot invite a sixth: 402 SEAT_LIMIT', async () => {
      expect(await seatLimit(testEnv, BASIC)).toBe(5);
      const res = await invite(1);
      expect(res.status).toBe(402);
      const body = (await res.json()) as any;
      expect(body).toMatchObject({ code: 'SEAT_LIMIT', limit: 5, used: 5, options: ['upgrade', 'extra_users'] });
      expect(body.error.code).toBe('SEAT_LIMIT');
    });

    it('a super admin grant of one extra user lets exactly one more invite through', async () => {
      const grant = await call(multiEnv, 'POST', `/admin/tenants/${BASIC}/addons`, superToken, { productKey: 'extra_user', quantity: 1, note: 'r109 test' });
      expect(grant.status).toBe(201);
      expect(((await grant.json()) as any).data).toMatchObject({ seatLimit: 6, periodKey: null, unitsGranted: 1 });
      expect(await seatLimit(testEnv, BASIC)).toBe(6);

      expect((await invite(2)).status).toBe(201);
      expect((await invite(3)).status).toBe(402);

      const row = await master(`SELECT source, granted_by, reference FROM tenant_addons WHERE tenant_id = ? AND product_key = 'extra_user'`, BASIC).first<any>();
      expect(row).toEqual({ source: 'super_admin_grant', granted_by: SUPER_EMAIL, reference: 'r109 test' });
    });

    it('pending invites count; deactivating frees a seat and reactivating needs one', async () => {
      const list = (await (await call(multiEnv, 'GET', '/users', basicToken)).json()) as any;
      const rows: any[] = Array.isArray(list.data) ? list.data : list.data.data;
      const invited = rows.find((u) => u.email === 'invitee2@r109-basic.test');
      expect(invited).toBeTruthy();

      expect((await call(multiEnv, 'PUT', `/users/${invited.id}/deactivate`, basicToken)).status).toBe(200);
      expect((await invite(4)).status).toBe(201); // the freed seat is taken by a new invite
      const blocked = await call(multiEnv, 'PUT', `/users/${invited.id}/activate`, basicToken);
      expect(blocked.status).toBe(402);
      expect(((await blocked.json()) as any).code).toBe('SEAT_LIMIT');
    });

    it('the login summary shows the plan, seat limit and seats used', async () => {
      const res = await call(multiEnv, 'POST', '/auth/login', null, { email: ADMIN_EMAIL, password: PASSWORD, tenantId: BASIC });
      expect(res.status).toBe(200);
      const tenant = ((await res.json()) as any).data.tenant;
      expect(tenant.plan).toEqual({ key: 'basic', name: 'Basic' });
      expect(tenant.seats).toEqual({ limit: 6, used: 6 });
    });
  });

  describe('AI credit allowance', () => {
    it('is the plan amount plus packs granted for the current month only', async () => {
      const month = currentPeriodKey();
      expect(await getAllowance(testEnv, BASIC, 'ai_credits')).toBe(1000);

      const grant = await call(multiEnv, 'POST', `/admin/tenants/${BASIC}/addons`, superToken, { productKey: 'ai_credit_pack_5000', quantity: 2 });
      expect(grant.status).toBe(201);
      expect(((await grant.json()) as any).data).toMatchObject({ unitsGranted: 10000, periodKey: month, allowanceKey: 'ai_credits', allowanceThisMonth: 11000 });
      expect(await getAllowance(testEnv, BASIC, 'ai_credits', month)).toBe(11000);
      expect(await getAllowance(testEnv, BASIC, 'ai_credits', '2020-01')).toBe(1000); // another month: no pack
      expect(await getAllowance(testEnv, BASIC, 'sms')).toBe(10); // a pack of one kind does not lift another

      expect(await getCreditBalance(testEnv, BASIC)).toEqual({ limit: 11000, used: 0, remaining: 11000 });
    });

    it('follows an edit of the plan allowance with no code change', async () => {
      const res = await call(multiEnv, 'PUT', '/admin/catalogue/allowances/basic', superToken, { ai_credits: 2500 });
      expect(res.status).toBe(200);
      expect(await getAllowance(testEnv, BASIC, 'ai_credits')).toBe(12500);
    });

    it('a communication pack lifts only its own channel for this month', async () => {
      const grant = await call(multiEnv, 'POST', `/admin/tenants/${BASIC}/addons`, superToken, { productKey: 'sms_100', quantity: 1 });
      expect(grant.status).toBe(201);
      expect(await getAllowance(testEnv, BASIC, 'sms')).toBe(110);
      expect(await getAllowance(testEnv, BASIC, 'whatsapp')).toBe(250);
    });
  });

  describe('prices are computed from the catalogue', () => {
    it('commPackPrice(sms, IN, 100) = 100 x 8.06 x 1.2 = 967.20, rounded up to the paisa', async () => {
      expect(await commPackPrice(testEnv, 'sms', 'IN', 100)).toBe(967.2);
      expect(await commPackPrice(testEnv, 'whatsapp', 'IN', 1000)).toBe(714);
      expect(await commPackPrice(testEnv, 'otp', 'IN', 100)).toBe(1548);
      expect(await commPackPrice(testEnv, 'sms', 'IN', 1)).toBe(9.68); // 9.672 rounds up
      expect(await commPackPrice(testEnv, 'call_minute', 'IN', 100)).toBeNull(); // inactive until the ADR addendum
    });

    it('changes when unit_cost or margin_pct changes, with no code change', async () => {
      const cost = await master(`SELECT id FROM comm_unit_costs WHERE channel = 'sms' AND market = 'IN' AND is_active = 1`).first<{ id: string }>();

      const costUp = await call(multiEnv, 'PUT', `/admin/catalogue/unit-costs/${cost!.id}`, superToken, { unitCost: 10 });
      expect(costUp.status).toBe(200);
      expect(await commPackPrice(testEnv, 'sms', 'IN', 100)).toBe(1200);
      expect(await addonPrice(testEnv, 'sms_100')).toBe(1200);

      const marginUp = await call(multiEnv, 'PUT', `/admin/catalogue/unit-costs/${cost!.id}`, superToken, { marginPct: 50 });
      expect(marginUp.status).toBe(200);
      expect(await commPackPrice(testEnv, 'sms', 'IN', 100)).toBe(1500);

      await call(multiEnv, 'PUT', `/admin/catalogue/unit-costs/${cost!.id}`, superToken, { unitCost: 8.06, marginPct: 20 });
      expect(await commPackPrice(testEnv, 'sms', 'IN', 100)).toBe(967.2);
    });

    it('fixed-price products and the extra-user price come from their rows', async () => {
      expect(await addonPrice(testEnv, 'ai_credit_pack_5000')).toBe(250);
      expect(await addonPrice(testEnv, 'extra_user', { planKey: 'pro' })).toBe(1800);
      expect(await addonPrice(testEnv, 'extra_user', { planKey: 'enterprise' })).toBe(1200);
    });

    it('GET /admin/catalogue returns provider costs, margins and computed add-on prices', async () => {
      const res = await call(multiEnv, 'GET', '/admin/catalogue', superToken);
      expect(res.status).toBe(200);
      const data = ((await res.json()) as any).data;
      expect(data.unitCosts.find((u: any) => u.channel === 'sms')).toMatchObject({ unitCost: 8.06, marginPct: 20, currency: 'INR' });
      expect(data.addons.find((a: any) => a.key === 'sms_100').price).toBe(967.2);
      expect(data.notes).toContain('DRAFT');
    });
  });

  describe('GET /public/plans', () => {
    it('returns the three public plans with prices, users, allowances and computed add-on prices', async () => {
      const res = await call(multiEnv, 'GET', '/public/plans?market=IN', null);
      expect(res.status).toBe(200);
      const data = ((await res.json()) as any).data;
      expect(data.market).toBe('IN');
      expect(data.plans.map((p: any) => [p.key, p.yearlyPrice, p.includedUsers, p.extraUserYearlyPrice])).toEqual([
        ['basic', 12000, 5, 2400],
        ['pro', 18000, 15, 1800],
        ['enterprise', 24000, 100, 1200],
      ]);
      expect(data.plans[0].allowances).toMatchObject({ ai_credits: 2500, sms: 10, whatsapp: 250, otp: 9 }); // 2500: raised by the allowance edit above
      const price = (key: string) => data.addons.find((a: any) => a.key === key).price;
      expect(price('sms_100')).toBe(967.2);
      expect(price('whatsapp_1000')).toBe(714);
      expect(price('otp_100')).toBe(1548);
      expect(price('ai_credit_pack_5000')).toBe(250);
      expect(JSON.stringify(data)).not.toMatch(/unitCost|marginPct|margin_pct|provider/);
    });

    it('shows a changed price straight away', async () => {
      const price = await master(`SELECT id FROM plan_prices WHERE plan_key = 'basic' AND market = 'IN'`).first<{ id: string }>();
      expect((await call(multiEnv, 'PUT', `/admin/catalogue/prices/${price!.id}`, superToken, { yearlyPrice: 13500 })).status).toBe(200);
      const data = ((await (await call(multiEnv, 'GET', '/public/plans?market=IN', null)).json()) as any).data;
      expect(data.plans[0].yearlyPrice).toBe(13500);
    });
  });

  describe('trial expiry', () => {
    const past = new Date(Date.now() - 2 * 86400000).toISOString();
    const future = new Date(Date.now() + 7 * 86400000).toISOString();

    beforeAll(async () => {
      const hash = await hashPassword(PASSWORD);
      for (const [id, tag, ends] of [[TRIAL_PAST, 'past', past], [TRIAL_FUTURE, 'future', future]] as const) {
        const pool = tag === 'past' ? POOL_PAST : POOL_FUTURE;
        await insertTenant(id, `trial-${tag}`, 'trial', 'trial', tag === 'past' ? 'TENANT_DB_POOL_2' : 'TENANT_DB_POOL_1');
        const userId = `0196a109-2222-7000-8000-00000000000${tag === 'past' ? 1 : 2}`;
        await master(`INSERT OR REPLACE INTO tenant_users (id, tenant_id, email, user_id, role, is_active) VALUES (?, ?, ?, ?, 'admin', 1)`, `0196a109-5555-7000-8000-00000000000${tag === 'past' ? 1 : 2}`, id, `owner@r109-${tag}.test`, userId).run();
        await pool.prepare(`INSERT OR REPLACE INTO users (id, email, password_hash, role, name, is_active) VALUES (?, ?, ?, 'admin', 'Trial owner', 1)`).bind(userId, `owner@r109-${tag}.test`, hash).run();
        await master(
          `INSERT INTO subscriptions (id, tenant_id, plan, amount, billing_cycle, start_date, next_billing_date, status, trial_ends_at) VALUES (?, ?, 'trial', 0, 'yearly', ?, ?, 'trial', ?)`,
          `0196a109-6666-7000-8000-00000000000${tag === 'past' ? 1 : 2}`, id, past, ends, ends,
        ).run();
      }
    });

    const login = (tenantId: string, tag: string) => call(multiEnv, 'POST', '/auth/login', null, { email: `owner@r109-${tag}.test`, password: PASSWORD, tenantId });

    it('login of a trial agency whose end date has passed is 402 TRIAL_EXPIRED, before the daily job runs', async () => {
      const res = await login(TRIAL_PAST, 'past');
      expect(res.status).toBe(402);
      expect(((await res.json()) as any).code).toBe('TRIAL_EXPIRED');
    });

    it('the daily job expires only trials past their end date and drops the cached registry entry', async () => {
      const tokenFuture = await signAccessToken({ userId: '0196a109-2222-7000-8000-000000000002', tenantId: TRIAL_FUTURE, role: 'admin', email: 'owner@r109-future.test' }, testEnv.JWT_SECRET);
      const tokenPast = await signAccessToken({ userId: '0196a109-2222-7000-8000-000000000001', tenantId: TRIAL_PAST, role: 'admin', email: 'owner@r109-past.test' }, testEnv.JWT_SECRET);
      expect((await call(multiEnv, 'GET', '/users/me/permissions', tokenPast)).status).toBe(200); // caches the registry entry

      const expired = await checkTrialExpiry(testEnv, new Date());
      expect(expired).toContain(TRIAL_PAST);
      expect(expired).not.toContain(TRIAL_FUTURE);

      expect((await master('SELECT status FROM tenants WHERE id = ?', TRIAL_PAST).first<any>()).status).toBe('expired');
      expect((await master('SELECT status FROM tenants WHERE id = ?', TRIAL_FUTURE).first<any>()).status).toBe('trial');
      expect((await call(multiEnv, 'GET', '/users/me/permissions', tokenPast)).status).toBe(403);
      expect((await call(multiEnv, 'GET', '/users/me/permissions', tokenFuture)).status).toBe(200);

      const again = await login(TRIAL_PAST, 'past');
      expect(again.status).toBe(402);
      expect(((await again.json()) as any).code).toBe('TRIAL_EXPIRED');
      expect((await login(TRIAL_FUTURE, 'future')).status).toBe(200);
    });

    it('running the job again changes nothing', async () => {
      expect(await checkTrialExpiry(testEnv, new Date())).toEqual([]);
    });
  });
});
