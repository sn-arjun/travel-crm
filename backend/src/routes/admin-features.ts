import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, error, notFound } from '../utils/response';
import { actorFrom, logAdminAction } from '../services/admin/audit';
import { bumpCatalogueVersion, getCatalogue } from '../services/plans/catalogue';
import { FEATURE_REGISTRY, isRegisteredFeature } from '../services/features/registry';
import { invalidatePlatformSwitches } from '../services/features/resolve';

/**
 * Feature switches (R127), mounted at /admin/features (super admin only, audited):
 *   GET  /                         registry + the plan x feature grid + the platform switches
 *   PUT  /plans/:planKey/:key      put one feature in, or take it out of, one plan   { enabled, reason? }
 *   PUT  /platform/:key            switch one feature on or off for every agency      { enabled, reason }  (reason required to switch off)
 * Agency overrides live at /admin/tenants/:id/features (admin-tenant-ops.ts).
 */
export const featureAdminRoutes = new Hono<AppContext>();

interface SwitchRow {
  feature_key: string;
  is_enabled: number;
  reason: string | null;
  updated_by: string | null;
  updated_at: string;
}

async function platformSwitches(db: D1Database): Promise<Record<string, { enabled: boolean; reason: string | null; updatedBy: string | null; updatedAt: string }>> {
  const rows = await db.prepare('SELECT feature_key, is_enabled, reason, updated_by, updated_at FROM platform_feature_switches').all<SwitchRow>();
  return Object.fromEntries((rows.results ?? []).map((r) => [r.feature_key, { enabled: !!r.is_enabled, reason: r.reason, updatedBy: r.updated_by, updatedAt: r.updated_at }]));
}

featureAdminRoutes.get('/', async (c) => {
  const catalogue = await getCatalogue(c.env);
  const switches = await platformSwitches(c.env.MASTER_DB);
  const registered = new Set(FEATURE_REGISTRY.map((f) => f.key));
  // Keys a plan still lists that the registry does not know are shown as "unregistered" so an operator can see and remove them.
  const unregistered = [...new Set(catalogue.plans.flatMap((p) => p.features))].filter((k) => !registered.has(k)).sort();
  return success(c, {
    registry: FEATURE_REGISTRY,
    unregistered,
    plans: catalogue.plans.map((p) => ({ key: p.key, name: p.name, isActive: p.isActive, features: p.features })),
    platform: switches,
  });
});

const planSwitchSchema = z.object({ enabled: z.boolean(), reason: z.string().trim().max(500).optional() });

featureAdminRoutes.put('/plans/:planKey/:key', zValidator('json', planSwitchSchema), async (c) => {
  const planKey = c.req.param('planKey');
  const key = c.req.param('key');
  const body = c.req.valid('json');
  const db = c.env.MASTER_DB;
  const plan = await db.prepare('SELECT key FROM plans WHERE key = ?').bind(planKey).first();
  if (!plan) return notFound(c, 'Plan');
  const present = await db.prepare('SELECT 1 AS x FROM plan_features WHERE plan_key = ? AND feature_key = ?').bind(planKey, key).first();
  // A key outside the registry may only be removed (cleaning up), never added.
  if (!isRegisteredFeature(key) && !(present && !body.enabled)) return error(c, `Unknown feature "${key}"`, 400);

  if (body.enabled) {
    await db.prepare('INSERT OR IGNORE INTO plan_features (plan_key, feature_key) VALUES (?, ?)').bind(planKey, key).run();
  } else {
    await db.prepare('DELETE FROM plan_features WHERE plan_key = ? AND feature_key = ?').bind(planKey, key).run();
  }
  await bumpCatalogueVersion(c.env);
  await logAdminAction(
    c.env,
    actorFrom(c),
    'feature.plan_switch',
    null,
    { enabled: !!present },
    { enabled: body.enabled },
    { entityType: 'plan', entityId: planKey, extra: { featureKey: key, reason: body.reason ?? null } },
  );
  return success(c, { planKey, key, enabled: body.enabled });
});

const platformSwitchSchema = z.object({ enabled: z.boolean(), reason: z.string().trim().max(500).optional() });

featureAdminRoutes.put('/platform/:key', zValidator('json', platformSwitchSchema), async (c) => {
  const key = c.req.param('key');
  const body = c.req.valid('json');
  const db = c.env.MASTER_DB;
  const before = (await platformSwitches(db))[key];
  if (!isRegisteredFeature(key) && !(before && !before.enabled && body.enabled)) return error(c, `Unknown feature "${key}"`, 400);
  if (!body.enabled && !body.reason) return error(c, 'A reason is required to switch a feature off for every agency', 400);

  const actor = actorFrom(c);
  await db
    .prepare(
      `INSERT INTO platform_feature_switches (feature_key, is_enabled, reason, updated_by, updated_at)
       VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
       ON CONFLICT (feature_key) DO UPDATE SET is_enabled = excluded.is_enabled, reason = excluded.reason,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    .bind(key, body.enabled ? 1 : 0, body.reason ?? null, actor.email)
    .run();
  await invalidatePlatformSwitches(c.env);
  await logAdminAction(
    c.env,
    actor,
    'feature.platform_switch',
    null,
    { enabled: before ? before.enabled : true },
    { enabled: body.enabled },
    { entityType: 'feature', entityId: key, extra: { reason: body.reason ?? null } },
  );
  return success(c, { key, enabled: body.enabled, reason: body.reason ?? null });
});
