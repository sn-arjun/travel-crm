/**
 * Automations library: the recipes a workspace can switch off, keep as suggestions,
 * or let run automatically.
 *
 *   GET  /automations              every recipe with its mode, settings and whether the plan includes it
 *   PUT  /automations/:key         change mode or settings
 *   POST /automations/custom       add a rule of the workspace's own (admin)
 *   PUT  /automations/custom/:id   change it or switch it off
 *   DELETE /automations/custom/:id remove it
 *   POST /automations/run-scheduled  run the time-based recipes now (admin)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, error, notFound, forbidden } from '../utils/response';
import { requirePermission } from '../middleware/rbac';
import { getTenantFeatures } from '../middleware/feature-gate';
import { generateId } from '../utils/uuid';
import { RECIPES, RECIPES_BY_KEY } from '../services/automation/recipes';
import { loadRuleStates, automationsPaused, PAUSE_SETTING_KEY } from '../services/automation/engine';
import { emitEvent } from '../services/automation/events';
import { localDateString, getTenantTimeZone } from '../utils/tz';
import { loadLocaleContext } from '../utils/money';
import {
  CUSTOM_FIELDS,
  CUSTOM_OPERATORS,
  CUSTOM_PLACEHOLDERS,
  CUSTOM_PREFIX,
  CUSTOM_TRIGGERS,
  MAX_CUSTOM_RULES,
  canRunAutomatically,
  customRuleInputSchema,
  describeRule,
  listCustomRules,
  validateRule,
  type CustomRuleInput,
} from '../services/automation/custom-rules';

const automationRoutes = new Hono<AppContext>();

const AI_FEATURE_KEY = 'ai_copilot';

automationRoutes.get('/', requirePermission('automations', 'view'), async (c) => {
  const db = c.get('tenantDb');
  const locale = (await loadLocaleContext(db)).locale;
  const [states, tenant, paused, customRules] = await Promise.all([
    loadRuleStates(db),
    getTenantFeatures(c.env, c.get('tenantId')),
    automationsPaused(db),
    listCustomRules(db),
  ]);

  const counts = await db
    .prepare(
      `SELECT rule_key, outcome, COUNT(*) AS n FROM automation_runs
       WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days') GROUP BY rule_key, outcome`,
    )
    .all<{ rule_key: string; outcome: string; n: number }>();
  const stats: Record<string, Record<string, number>> = {};
  for (const row of counts.results) (stats[row.rule_key] ??= {})[row.outcome] = row.n;

  return success(c, {
    plan: tenant.plan,
    paused,
    aiIncluded: tenant.features.includes(AI_FEATURE_KEY),
    recipes: RECIPES.map((recipe) => ({
      key: recipe.key,
      area: recipe.area,
      title: recipe.title,
      description: recipe.description,
      mode: states[recipe.key].mode,
      defaultMode: recipe.defaultMode,
      autoEligible: recipe.autoEligible,
      usesAi: !!recipe.usesAi,
      locked: !!recipe.featureKey && !tenant.features.includes(recipe.featureKey),
      settings: (recipe.settings ?? []).map((field) => ({ ...field, value: states[recipe.key].settings[field.key] })),
      last30Days: {
        suggested: stats[recipe.key]?.suggested ?? 0,
        applied: stats[recipe.key]?.applied ?? 0,
        failed: stats[recipe.key]?.failed ?? 0,
      },
    })),
    customRules: customRules.map((rule) => ({
      id: rule.id,
      key: rule.key,
      name: rule.name,
      description: describeRule(rule, locale),
      trigger: rule.trigger,
      conditions: rule.conditions,
      actions: rule.actions,
      mode: rule.mode,
      autoEligible: canRunAutomatically(rule.actions),
      last30Days: {
        suggested: stats[rule.key]?.suggested ?? 0,
        applied: stats[rule.key]?.applied ?? 0,
        failed: stats[rule.key]?.failed ?? 0,
      },
    })),
    builder: { triggers: CUSTOM_TRIGGERS, fields: CUSTOM_FIELDS, operators: CUSTOM_OPERATORS, placeholders: CUSTOM_PLACEHOLDERS, maxRules: MAX_CUSTOM_RULES },
  });
});

// ── The workspace's own rules ────────────────────────────────

async function saveCustomRule(db: D1Database, id: string, rule: CustomRuleInput, userId: string, isNew: boolean): Promise<void> {
  const now = new Date().toISOString();
  const values = [rule.mode, JSON.stringify({ name: rule.name }), rule.trigger, JSON.stringify(rule.conditions), JSON.stringify(rule.actions), userId, now];
  if (isNew) {
    await db
      .prepare(
        `INSERT INTO automation_rules (id, recipe_key, mode, settings, trigger, conditions, actions, updated_by, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, `${CUSTOM_PREFIX}${id}`, ...values, now)
      .run();
    return;
  }
  await db
    .prepare(`UPDATE automation_rules SET mode = ?, settings = ?, trigger = ?, conditions = ?, actions = ?, updated_by = ?, updated_at = ? WHERE id = ?`)
    .bind(...values, id)
    .run();
}

automationRoutes.post('/custom', requirePermission('automations', 'create'), zValidator('json', customRuleInputSchema), async (c) => {
  const db = c.get('tenantDb');
  const rule = c.req.valid('json');
  const problem = validateRule(rule);
  if (problem) return error(c, problem, 400);

  const existing = await listCustomRules(db);
  if (existing.length >= MAX_CUSTOM_RULES) return error(c, `A workspace can have up to ${MAX_CUSTOM_RULES} rules of its own`, 400);
  if (existing.some((other) => other.name.toLowerCase() === rule.name.trim().toLowerCase())) return error(c, 'A rule with this name already exists', 409);

  const id = generateId();
  await saveCustomRule(db, id, { ...rule, name: rule.name.trim() }, c.get('userId'), true);
  return success(c, { id, key: `${CUSTOM_PREFIX}${id}`, description: describeRule(rule, (await loadLocaleContext(db)).locale) }, 201);
});

automationRoutes.put('/custom/:id', requirePermission('automations', 'create'), zValidator('json', customRuleInputSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const rule = c.req.valid('json');
  const existing = await listCustomRules(db);
  if (!existing.some((other) => other.id === id)) return notFound(c, 'Rule');
  const problem = validateRule(rule);
  if (problem) return error(c, problem, 400);
  if (existing.some((other) => other.id !== id && other.name.toLowerCase() === rule.name.trim().toLowerCase())) return error(c, 'A rule with this name already exists', 409);

  await saveCustomRule(db, id, { ...rule, name: rule.name.trim() }, c.get('userId'), false);
  return success(c, { id, key: `${CUSTOM_PREFIX}${id}`, description: describeRule(rule, (await loadLocaleContext(db)).locale) });
});

automationRoutes.delete('/custom/:id', requirePermission('automations', 'delete'), async (c) => {
  const result = await c.get('tenantDb')
    .prepare(`DELETE FROM automation_rules WHERE id = ? AND recipe_key LIKE 'custom:%'`)
    .bind(c.req.param('id'))
    .run();
  if (!result.meta.changes) return notFound(c, 'Rule');
  return success(c, { deleted: true });
});

// Pause or resume every automation at once. Registered before /:key so 'pause' is never read as a recipe key.
automationRoutes.put('/pause', requirePermission('automations', 'create'), zValidator('json', z.object({ paused: z.boolean() })), async (c) => {
  const { paused } = c.req.valid('json');
  await c.get('tenantDb')
    .prepare(
      `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    .bind(PAUSE_SETTING_KEY, paused ? '1' : '0', c.get('userId'), new Date().toISOString())
    .run();
  return success(c, { paused });
});

const updateSchema = z.object({
  mode: z.enum(['off', 'suggest', 'auto']).optional(),
  settings: z.record(z.string(), z.number()).optional(),
});

automationRoutes.put('/:key', requirePermission('automations', 'edit'), zValidator('json', updateSchema), async (c) => {
  const db = c.get('tenantDb');
  const recipe = RECIPES_BY_KEY[c.req.param('key')];
  if (!recipe) return notFound(c, 'Automation');
  const body = c.req.valid('json');

  if (body.mode === 'auto') {
    if (!recipe.autoEligible) return error(c, 'This automation always needs a click', 400);
    // Letting something run without a person is an administrator's decision.
    if (c.get('role') !== 'admin') return forbidden(c, 'Only an administrator can let an automation run on its own');
  }

  const states = await loadRuleStates(db);
  const current = states[recipe.key];
  const settings = { ...current.settings };
  for (const field of recipe.settings ?? []) {
    const value = body.settings?.[field.key];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) {
      return error(c, `${field.label} must be between ${field.min ?? 0} and ${field.max ?? 'any'} ${field.unit ?? ''}`.trim(), 400);
    }
    settings[field.key] = value;
  }
  const mode = body.mode ?? current.mode;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO automation_rules (id, recipe_key, mode, settings, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(recipe_key) DO UPDATE SET mode = excluded.mode, settings = excluded.settings, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    )
    .bind(generateId(), recipe.key, mode, JSON.stringify(settings), c.get('userId'), now, now)
    .run();

  return success(c, { key: recipe.key, mode, settings });
});

automationRoutes.post('/run-scheduled', requirePermission('automations', 'create'), async (c) => {
  const db = c.get('tenantDb');
  const day = localDateString(await getTenantTimeZone(db));
  await emitEvent(c.env, c.get('tenantId'), db, { type: 'schedule.tick', entityType: 'schedule', entityId: day, actorId: c.get('userId') });
  return success(c, { ran: true });
});

export default automationRoutes;
