import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import worker from '../src/index';
import { superAdminToken } from './utils/super-admin';
import { requireFeature, getTenantFeatures } from '../src/middleware/feature-gate';
import { resolveFeature, resolveFeatureState, resolveTenantFeatures } from '../src/services/features/resolve';
import { FEATURE_KEYS, FEATURE_REGISTRY } from '../src/services/features/registry';
import { bumpCatalogueVersion } from '../src/services/plans/catalogue';
import indexSource from '../src/index.ts?raw';
import chatbotSource from '../src/routes/public-chatbot.ts?raw';
import aiSettingsSource from '../src/routes/ai-settings.ts?raw';
import planSeed from '../drizzle/master/0015_plan_catalogue.sql?raw';

const testEnv = env as any;
const master = (sql: string, ...binds: unknown[]) => (testEnv.MASTER_DB as D1Database).prepare(sql).bind(...binds);

// Unique ids: storage is shared across test files.
const SUPER_ID = '0196a127-0000-7000-8000-0000000000a1';
const SUPER_EMAIL = 'super-r127@platform.test';
const T_BASIC = '0196a127-0000-7000-8000-0000000000b1';
const T_BASIC_2 = '0196a127-0000-7000-8000-0000000000b2';
const T_PRO = '0196a127-0000-7000-8000-0000000000b3';
const KEY = 'fleet_management'; // seeded on basic and pro
const PLAN_KEY = 'ai_dialer_cards'; // not seeded on basic

let superToken = '';

async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function json<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** Mount requireFeature on a tiny app so the real 403 bodies can be read without a tenant database. */
async function gate(tenantId: string, key: string): Promise<{ status: number; body: any }> {
  const app = new Hono<any>();
  app.use('*', async (c, next) => {
    c.set('tenantId', tenantId);
    await next();
  });
  app.use('/x', requireFeature(key));
  app.get('/x', (c) => c.json({ ok: true }));
  const res = await app.fetch(new Request('http://localhost/x'), testEnv);
  return { status: res.status, body: await res.json() };
}

async function reset() {
  await master('DELETE FROM platform_feature_switches').run();
  await master('DELETE FROM tenant_feature_flags WHERE tenant_id IN (?, ?, ?)', T_BASIC, T_BASIC_2, T_PRO).run();
  await master(`DELETE FROM plan_features WHERE plan_key = 'basic' AND feature_key = ?`, PLAN_KEY).run();
  await master(`INSERT OR IGNORE INTO plan_features (plan_key, feature_key) VALUES ('basic', ?)`, KEY).run();
  await bumpCatalogueVersion(testEnv);
  await testEnv.CACHE?.delete('features:platform-off');
}

describe('feature switches (R127)', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    superToken = await superAdminToken(testEnv, { id: SUPER_ID, email: SUPER_EMAIL, name: 'R127 Super' });
    for (const [id, sub, plan] of [[T_BASIC, 'a', 'basic'], [T_BASIC_2, 'b', 'basic'], [T_PRO, 'c', 'pro']]) {
      await master(
        `INSERT OR REPLACE INTO tenants (id, company_name, subdomain, plan, status) VALUES (?, ?, ?, ?, 'active')`,
        id, `R127 ${sub}`, `r127-${sub}`, plan,
      ).run();
    }
    await reset();
  });

  afterAll(async () => {
    await reset();
    for (const id of [T_BASIC, T_BASIC_2, T_PRO]) await master('DELETE FROM tenants WHERE id = ?', id).run();
  });

  describe('registry', () => {
    it('lists every key the gates and plans use', () => {
      const registered = new Set(FEATURE_KEYS);
      expect(registered.size).toBe(FEATURE_REGISTRY.length); // no duplicates
      const gated = [...(indexSource + chatbotSource).matchAll(/requireFeatures?\(\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
      expect(gated.length).toBeGreaterThanOrEqual(7);
      const block = aiSettingsSource.slice(aiSettingsSource.indexOf('AI_FEATURE_KEYS = ['), aiSettingsSource.indexOf('] as const'));
      const aiKeys = [...block.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
      expect(aiKeys.length).toBeGreaterThanOrEqual(28);
      const seeded = [...planSeed.matchAll(/\('[a-z]+', '([a-z0-9_]+)'\)/g)].map((m) => m[1]);
      expect(seeded.length).toBeGreaterThan(20);
      const missing = [...new Set([...gated, ...aiKeys, ...seeded])].filter((k) => !registered.has(k));
      expect(missing).toEqual([]);
    });

    it('gives every feature a name, a description and an area', () => {
      for (const f of FEATURE_REGISTRY) {
        expect(f.name.length).toBeGreaterThan(2);
        expect(f.description.length).toBeGreaterThan(5);
        expect(f.area).toBeTruthy();
      }
    });
  });

  describe('resolution order', () => {
    it('platform off beats an agency override on, which beats the plan', () => {
      expect(resolveFeatureState({ key: 'k', platformOff: true, override: true, inPlan: true })).toEqual({ key: 'k', enabled: false, source: 'platform' });
      expect(resolveFeatureState({ key: 'k', platformOff: false, override: false, inPlan: true })).toEqual({ key: 'k', enabled: false, source: 'override' });
      expect(resolveFeatureState({ key: 'k', platformOff: false, override: true, inPlan: false })).toEqual({ key: 'k', enabled: true, source: 'override' });
      expect(resolveFeatureState({ key: 'k', platformOff: false, override: undefined, inPlan: true })).toEqual({ key: 'k', enabled: true, source: 'plan' });
      expect(resolveFeatureState({ key: 'k', platformOff: false, override: undefined, inPlan: false })).toEqual({ key: 'k', enabled: false, source: 'plan' });
    });

    it('applies the order against the database and the summary agrees with the gate', async () => {
      await reset();
      expect(await resolveFeature(testEnv, T_BASIC, KEY)).toMatchObject({ enabled: true, source: 'plan', plan: 'basic' });

      await master(`INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES (?, ?, ?, 0)`, 'r127-flag-1', T_BASIC, KEY).run();
      expect(await resolveFeature(testEnv, T_BASIC, KEY)).toMatchObject({ enabled: false, source: 'override' });
      expect(await resolveFeature(testEnv, T_BASIC_2, KEY)).toMatchObject({ enabled: true, source: 'plan' });

      // platform off wins over an override that says on
      await master(`UPDATE tenant_feature_flags SET is_enabled = 1 WHERE id = 'r127-flag-1'`).run();
      const res = await call('PUT', `/admin/features/platform/${KEY}`, { enabled: false, reason: 'provider outage' });
      expect(res.status).toBe(200);
      expect(await resolveFeature(testEnv, T_BASIC, KEY)).toMatchObject({ enabled: false, source: 'platform' });
      const summary = await getTenantFeatures(testEnv, T_BASIC);
      expect(summary.features).not.toContain(KEY);
      expect(summary.platformOff).toContain(KEY);
      expect(summary.sources[KEY]).toBe('platform');
      const all = await resolveTenantFeatures(testEnv, T_PRO);
      expect(all.features.find((f) => f.key === KEY)).toMatchObject({ enabled: false, source: 'platform' });
    });
  });

  describe('gate answers', () => {
    it('a platform-off feature is 403 FEATURE_DISABLED with no upgrade offer; a plan-locked one keeps upgrade:true', async () => {
      await reset();
      await call('PUT', `/admin/features/platform/${KEY}`, { enabled: false, reason: 'switched off for the test' });
      const off = await gate(T_BASIC, KEY);
      expect(off.status).toBe(403);
      expect(off.body).toMatchObject({ code: 'FEATURE_DISABLED', featureKey: KEY, upgrade: false });

      const locked = await gate(T_BASIC, PLAN_KEY);
      expect(locked.status).toBe(403);
      expect(locked.body).toMatchObject({ featureKey: PLAN_KEY, upgrade: true, currentPlan: 'basic' });
      expect(locked.body.code).toBeUndefined();

      await call('PUT', `/admin/features/platform/${KEY}`, { enabled: true });
      expect((await gate(T_BASIC, KEY)).status).toBe(200);
    });

    it('a switch change shows through the cache straight away (no deploy, well within a minute)', async () => {
      await reset();
      expect((await gate(T_PRO, KEY)).status).toBe(200); // primes the cache
      await call('PUT', `/admin/features/platform/${KEY}`, { enabled: false, reason: 'cache check' });
      expect((await gate(T_PRO, KEY)).status).toBe(403);
      await call('PUT', `/admin/features/platform/${KEY}`, { enabled: true });
      expect((await gate(T_PRO, KEY)).status).toBe(200);
    });
  });

  describe('plan grid', () => {
    it('a plan switch applies to every agency on that plan and not to others', async () => {
      await reset();
      expect((await gate(T_BASIC, PLAN_KEY)).status).toBe(403);
      const on = await call('PUT', `/admin/features/plans/basic/${PLAN_KEY}`, { enabled: true, reason: 'launch offer' });
      expect(on.status).toBe(200);
      expect((await gate(T_BASIC, PLAN_KEY)).status).toBe(200);
      expect((await gate(T_BASIC_2, PLAN_KEY)).status).toBe(200);
      expect(await resolveFeature(testEnv, T_BASIC, PLAN_KEY)).toMatchObject({ enabled: true, source: 'plan' });

      const grid = await json(await call('GET', '/admin/features'));
      expect(grid.data.plans.find((p: any) => p.key === 'basic').features).toContain(PLAN_KEY);
      expect(grid.data.registry.length).toBe(FEATURE_REGISTRY.length);

      await call('PUT', `/admin/features/plans/basic/${PLAN_KEY}`, { enabled: false });
      expect((await gate(T_BASIC_2, PLAN_KEY)).status).toBe(403);
    });

    it('refuses keys outside the registry and unknown plans', async () => {
      expect((await call('PUT', '/admin/features/plans/basic/not_a_feature', { enabled: true })).status).toBe(400);
      expect((await call('PUT', `/admin/features/plans/nope/${KEY}`, { enabled: true })).status).toBe(404);
      expect((await call('PUT', '/admin/features/platform/not_a_feature', { enabled: false, reason: 'x' })).status).toBe(400);
    });
  });

  describe('agency panel', () => {
    it('lists each feature with its effective state and source, and "follow plan" removes an override', async () => {
      await reset();
      let res = await call('PUT', `/admin/tenants/${T_BASIC}/features`, { features: { [KEY]: false, [PLAN_KEY]: true }, reason: 'support request' });
      expect(res.status).toBe(200);
      let list = (await json(await call('GET', `/admin/tenants/${T_BASIC}/features`))).data.features as any[];
      expect(list.find((f) => f.key === KEY)).toMatchObject({ enabled: false, source: 'override', override: false, planDefault: true });
      expect(list.find((f) => f.key === PLAN_KEY)).toMatchObject({ enabled: true, source: 'override', override: true, planDefault: false });
      expect(list.find((f) => f.key === 'ai_coaching')).toMatchObject({ enabled: false, source: 'plan', override: null });

      await call('PUT', `/admin/features/platform/${PLAN_KEY}`, { enabled: false, reason: 'pulled' });
      list = (await json(await call('GET', `/admin/tenants/${T_BASIC}/features`))).data.features as any[];
      expect(list.find((f) => f.key === PLAN_KEY)).toMatchObject({ enabled: false, source: 'platform', platformOff: true });

      res = await call('PUT', `/admin/tenants/${T_BASIC}/features`, { features: { [KEY]: null } });
      expect(res.status).toBe(200);
      list = (await json(await call('GET', `/admin/tenants/${T_BASIC}/features`))).data.features as any[];
      expect(list.find((f) => f.key === KEY)).toMatchObject({ enabled: true, source: 'plan', override: null });
    });
  });

  describe('audit', () => {
    it('records every change with the actor and the reason', async () => {
      await reset();
      await master(`DELETE FROM super_admin_audit_log WHERE action IN ('feature.platform_switch', 'feature.plan_switch', 'tenant.features_update')`).run();
      await call('PUT', `/admin/features/platform/${KEY}`, { enabled: false, reason: 'audit platform' });
      await call('PUT', `/admin/features/plans/basic/${PLAN_KEY}`, { enabled: true, reason: 'audit plan' });
      await call('PUT', `/admin/tenants/${T_BASIC}/features`, { features: { [KEY]: true }, reason: 'audit agency' });

      const rows = await master(`SELECT action, entity_id, details FROM super_admin_audit_log WHERE action IN ('feature.platform_switch', 'feature.plan_switch', 'tenant.features_update')`).all<{ action: string; entity_id: string; details: string }>();
      const byAction = new Map(rows.results.map((r) => [r.action, r]));
      expect(byAction.size).toBe(3);
      for (const [action, reason] of [['feature.platform_switch', 'audit platform'], ['feature.plan_switch', 'audit plan'], ['tenant.features_update', 'audit agency']]) {
        const d = JSON.parse(byAction.get(action)!.details);
        expect(d.actor).toBe(SUPER_EMAIL);
        expect(d.reason).toBe(reason);
      }
      expect(JSON.parse(byAction.get('feature.platform_switch')!.details)).toMatchObject({ before: { enabled: true }, after: { enabled: false } });
      expect(byAction.get('feature.platform_switch')!.entity_id).toBe(KEY);
      expect(JSON.parse(byAction.get('feature.plan_switch')!.details).featureKey).toBe(PLAN_KEY);
    });

    it('requires a reason to switch a feature off for every agency', async () => {
      await reset();
      const res = await call('PUT', `/admin/features/platform/${KEY}`, { enabled: false });
      expect(res.status).toBe(400);
      expect((await resolveFeature(testEnv, T_BASIC, KEY)).source).not.toBe('platform');
    });
  });
});
