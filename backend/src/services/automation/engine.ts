/**
 * Automation engine.
 *
 * event -> recipes that listen for it -> proposals -> either a pending suggestion (one click)
 * or, for a recipe in `auto` mode whose action is low risk, an immediate run as the admin who
 * enabled it. Everything is written to automation_runs.
 */

import type { Env } from '../../types';
import { generateId } from '../../utils/uuid';
import { hasPermission, type Role } from '../../constants/permissions';
import { broadcastToTenant } from '../../utils/realtime';
import { getTenantFeatures } from '../../middleware/feature-gate';
import { ACTIONS } from './actions';
import { RECIPES, RECIPES_BY_KEY } from './recipes';
import { makeApiCaller, systemActor } from './api-caller';
import { CUSTOM_TRIGGERS, canRunAutomatically, evaluateCustomRule, listCustomRules, type CustomRule } from './custom-rules';
import type { ActionContext, AutomationMode, DomainEvent, Proposal, Recipe } from './types';

/** An automation may trigger another, but a chain stops here. */
export const MAX_AUTOMATION_DEPTH = 3;

const AI_FEATURE_KEY = 'ai_copilot';

export interface RuleState {
  mode: AutomationMode;
  settings: Record<string, number>;
  updatedBy: string | null;
}

export interface SuggestionRow {
  id: string;
  rule_key: string;
  origin: string;
  source_type: string | null;
  source_id: string | null;
  entity_type: string;
  entity_id: string;
  contact_id: string | null;
  lead_id: string | null;
  action_type: string;
  params: string;
  title: string;
  reason: string | null;
  confidence: number | null;
  risk: string;
  status: string;
  dedupe_key: string;
  result: string | null;
  undo: string | null;
  error: string | null;
  assigned_to: string | null;
  applied_by: string | null;
  applied_at: string | null;
  model_used: string | null;
  created_at: string;
  updated_at: string;
}

export class EngineError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 422) {
    super(message);
    this.name = 'EngineError';
  }
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Mode and settings for every recipe: the workspace's choice, else the recipe default. */
export async function loadRuleStates(db: D1Database): Promise<Record<string, RuleState>> {
  const rows = await db
    .prepare('SELECT recipe_key, mode, settings, updated_by FROM automation_rules')
    .all<{ recipe_key: string; mode: string; settings: string | null; updated_by: string | null }>();
  const stored = new Map(rows.results.map((row) => [row.recipe_key, row]));

  const states: Record<string, RuleState> = {};
  for (const recipe of RECIPES) {
    const row = stored.get(recipe.key);
    const settings: Record<string, number> = {};
    const saved = parseJson<Record<string, unknown>>(row?.settings ?? null, {});
    for (const field of recipe.settings ?? []) {
      const value = Number(saved[field.key]);
      settings[field.key] = Number.isFinite(value) ? value : field.default;
    }
    let mode = (row?.mode as AutomationMode | undefined) ?? recipe.defaultMode;
    if (mode === 'auto' && !recipe.autoEligible) mode = 'suggest';
    states[recipe.key] = { mode, settings, updatedBy: row?.updated_by ?? null };
  }
  return states;
}

async function logRun(
  db: D1Database,
  run: { ruleKey: string; event?: DomainEvent | null; outcome: string; detail?: string; suggestionId?: string; startedAt: number; entityType?: string; entityId?: string },
): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO automation_runs (id, rule_key, event_id, event_type, entity_type, entity_id, outcome, detail, suggestion_id, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        generateId(),
        run.ruleKey,
        run.event?.id ?? null,
        run.event?.type ?? null,
        run.entityType ?? run.event?.entityType ?? null,
        run.entityId ?? run.event?.entityId ?? null,
        run.outcome,
        run.detail?.slice(0, 500) ?? null,
        run.suggestionId ?? null,
        Date.now() - run.startedAt,
      )
      .run();
  } catch (err) {
    console.error('[automation] run log failed', err);
  }
}

async function announce(env: Env, tenantId: string, suggestion: { id: string; entityType: string; entityId: string; contactId?: string | null; leadId?: string | null; status: string }) {
  await broadcastToTenant(env, tenantId, { type: 'assistant:suggestion', data: suggestion });
}

/** Fill gaps in a pending suggestion with what a later message added (no value is overwritten). */
function mergeParams(current: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    const existing = merged[key];
    if (Array.isArray(existing) && Array.isArray(value)) {
      const seen = new Set(existing.map((v) => (typeof v === 'string' ? v.toLowerCase() : JSON.stringify(v))));
      merged[key] = [...existing, ...value.filter((v) => !seen.has(typeof v === 'string' ? v.toLowerCase() : JSON.stringify(v)))];
    } else if (existing === null || existing === undefined || existing === '' || (key === 'paxAdults' && existing === 1 && typeof value === 'number' && value > 1)) {
      merged[key] = value;
    }
  }
  return merged;
}

export const PAUSE_SETTING_KEY = 'automations_paused';

/** A workspace can pause every automation at once (bulk imports, migrations, seeding). */
export async function automationsPaused(db: D1Database): Promise<boolean> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(PAUSE_SETTING_KEY).first<{ value: string | null }>();
  return row?.value === '1';
}

export async function processEvent(env: Env, tenantId: string, db: D1Database, event: DomainEvent): Promise<void> {
  if (event.depth >= MAX_AUTOMATION_DEPTH) return;
  const recipes = RECIPES.filter((recipe) => recipe.triggers.includes(event.type));
  const customPossible = CUSTOM_TRIGGERS.some((trigger) => trigger.value === event.type);
  if (recipes.length === 0 && !customPossible) return;
  if (await automationsPaused(db)) return;

  const states = await loadRuleStates(db);
  let features: string[] | null = null;
  const hasFeature = async (key: string): Promise<boolean> => {
    if (!features) features = (await getTenantFeatures(env.MASTER_DB, tenantId)).features;
    return features.includes(key);
  };

  for (const recipe of recipes) {
    const state = states[recipe.key];
    if (state.mode === 'off') continue;
    if (recipe.featureKey && !(await hasFeature(recipe.featureKey))) continue;

    const startedAt = Date.now();
    let proposals: Proposal[];
    try {
      proposals = await recipe.evaluate(
        { env, tenantId, db, settings: state.settings, aiAllowed: recipe.usesAi ? await hasFeature(AI_FEATURE_KEY) : false },
        event,
      );
    } catch (err) {
      await logRun(db, { ruleKey: recipe.key, event, outcome: 'failed', detail: err instanceof Error ? err.message : String(err), startedAt });
      continue;
    }

    for (const proposal of proposals) {
      await handleProposal(env, tenantId, db, recipe, state, proposal, event, startedAt);
    }
  }

  if (customPossible) await runCustomRules(env, tenantId, db, event);

  await db.prepare(`UPDATE domain_events SET processed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`).bind(event.id).run();
}

/** The workspace's own rules, through the same guards as the library. */
async function runCustomRules(env: Env, tenantId: string, db: D1Database, event: DomainEvent): Promise<void> {
  let rules: CustomRule[];
  try {
    rules = await listCustomRules(db, event.type);
  } catch (err) {
    console.error('[automation] could not load custom rules', err);
    return;
  }

  for (const rule of rules) {
    if (rule.mode === 'off') continue;
    const startedAt = Date.now();
    const source = { key: rule.key, autoEligible: canRunAutomatically(rule.actions) };
    const state: RuleState = { mode: rule.mode, settings: {}, updatedBy: rule.updatedBy };
    try {
      const proposals = await evaluateCustomRule({ env, tenantId, db, settings: {}, aiAllowed: false }, rule, event);
      for (const proposal of proposals) await handleProposal(env, tenantId, db, source, state, proposal, event, startedAt);
    } catch (err) {
      await logRun(db, { ruleKey: rule.key, event, outcome: 'failed', detail: err instanceof Error ? err.message : String(err), startedAt });
    }
  }
}

async function handleProposal(
  env: Env,
  tenantId: string,
  db: D1Database,
  recipe: Pick<Recipe, 'key' | 'autoEligible'>,
  state: RuleState,
  proposal: Proposal,
  event: DomainEvent,
  startedAt: number,
): Promise<void> {
  const action = ACTIONS[proposal.action];
  if (!action) {
    await logRun(db, { ruleKey: recipe.key, event, outcome: 'failed', detail: `Unknown action ${proposal.action}`, startedAt });
    return;
  }
  const parsed = action.schema.safeParse(proposal.params);
  if (!parsed.success) {
    await logRun(db, { ruleKey: recipe.key, event, outcome: 'failed', detail: `Invalid parameters for ${action.type}`, startedAt });
    return;
  }

  const existing = await db
    .prepare('SELECT id, status, params FROM assistant_suggestions WHERE dedupe_key = ?')
    .bind(proposal.dedupeKey)
    .first<{ id: string; status: string; params: string }>();
  if (existing) {
    if (proposal.mergeIntoPending && existing.status === 'pending') {
      const merged = action.schema.safeParse(mergeParams(parseJson<Record<string, unknown>>(existing.params, {}), parsed.data as Record<string, unknown>));
      if (merged.success) {
        await db
          .prepare(`UPDATE assistant_suggestions SET params = ?, reason = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id = ?`)
          .bind(JSON.stringify(merged.data), proposal.reason, existing.id)
          .run();
        await announce(env, tenantId, { id: existing.id, entityType: proposal.entityType, entityId: proposal.entityId, contactId: proposal.contactId, leadId: proposal.leadId, status: 'pending' });
      }
    }
    return;
  }

  const automatic = state.mode === 'auto' && recipe.autoEligible && action.risk === 'low' && !action.clientHandled;
  const id = generateId();
  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO assistant_suggestions
         (id, rule_key, origin, source_type, source_id, entity_type, entity_id, contact_id, lead_id, action_type, params,
          title, reason, confidence, risk, status, dedupe_key, assigned_to, model_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      recipe.key,
      proposal.origin ?? 'rule',
      proposal.sourceType ?? event.entityType,
      proposal.sourceId ?? event.entityId,
      proposal.entityType,
      proposal.entityId,
      proposal.contactId ?? null,
      proposal.leadId ?? null,
      action.type,
      JSON.stringify(parsed.data),
      proposal.title,
      proposal.reason,
      proposal.confidence ?? null,
      action.risk,
      automatic ? 'applying' : 'pending',
      proposal.dedupeKey,
      proposal.assignedTo ?? null,
      proposal.model ?? null,
    )
    .run();
  if (!inserted.meta.changes) return; // another run created it first

  const where = { id, entityType: proposal.entityType, entityId: proposal.entityId, contactId: proposal.contactId, leadId: proposal.leadId };

  if (!automatic) {
    await logRun(db, { ruleKey: recipe.key, event, outcome: 'suggested', detail: proposal.title, suggestionId: id, startedAt });
    await announce(env, tenantId, { ...where, status: 'pending' });
    return;
  }

  const actor = await systemActor(env, tenantId, db, state.updatedBy);
  if (!actor) {
    await db.prepare(`UPDATE assistant_suggestions SET status = 'pending', error = ? WHERE id = ?`).bind('No active administrator to act for', id).run();
    await logRun(db, { ruleKey: recipe.key, event, outcome: 'suggested', detail: 'No administrator to run as; left as a suggestion', suggestionId: id, startedAt });
    await announce(env, tenantId, { ...where, status: 'pending' });
    return;
  }

  const ctx: ActionContext = { env, tenantId, db, api: makeApiCaller(env, actor.token, event.depth), actorId: actor.userId, automatic: true, depth: event.depth };
  try {
    const result = await action.execute(ctx, parsed.data);
    await db
      .prepare(
        `UPDATE assistant_suggestions SET status = 'auto_applied', result = ?, undo = ?, applied_by = ?, applied_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(JSON.stringify({ entities: result.entities, summary: result.summary ?? null }), result.undo ? JSON.stringify(result.undo) : null, actor.userId, new Date().toISOString(), new Date().toISOString(), id)
      .run();
    await logRun(db, { ruleKey: recipe.key, event, outcome: 'applied', detail: result.summary ?? proposal.title, suggestionId: id, startedAt });
    await announce(env, tenantId, { ...where, status: 'auto_applied' });
  } catch (err) {
    // An automatic run that fails becomes an ordinary suggestion a person can look at.
    const detail = err instanceof Error ? err.message : String(err);
    await db.prepare(`UPDATE assistant_suggestions SET status = 'pending', error = ? WHERE id = ?`).bind(detail.slice(0, 500), id).run();
    await logRun(db, { ruleKey: recipe.key, event, outcome: 'failed', detail, suggestionId: id, startedAt });
    await announce(env, tenantId, { ...where, status: 'pending' });
  }
}

// ── Suggestions: apply, dismiss, undo ────────────────────────

export interface Clicker {
  userId: string;
  role: string;
  token: string;
}

export function canApply(role: string, actionType: string): boolean {
  const action = ACTIONS[actionType];
  return !!action && hasPermission(role as Role, action.module, action.permission);
}

export async function getSuggestion(db: D1Database, id: string): Promise<SuggestionRow | null> {
  return db.prepare('SELECT * FROM assistant_suggestions WHERE id = ?').bind(id).first<SuggestionRow>();
}

export async function applySuggestion(
  env: Env,
  tenantId: string,
  db: D1Database,
  id: string,
  clicker: Clicker,
  overrides: Record<string, unknown> = {},
  depth = 0,
): Promise<SuggestionRow> {
  const suggestion = await getSuggestion(db, id);
  if (!suggestion) throw new EngineError('Suggestion not found', 404);
  const action = ACTIONS[suggestion.action_type];
  if (!action) throw new EngineError('This suggestion can no longer be applied', 409);
  if (!hasPermission(clicker.role as Role, action.module, action.permission)) {
    throw new EngineError('You do not have permission to do this', 403);
  }

  const parsed = action.schema.safeParse({ ...parseJson<Record<string, unknown>>(suggestion.params, {}), ...overrides });
  if (!parsed.success) throw new EngineError('Some of the details are not valid', 422);

  // Two people, or a double click: only the first claim wins.
  const claim = await db
    .prepare(`UPDATE assistant_suggestions SET status = 'applying', error = NULL, updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(new Date().toISOString(), id)
    .run();
  if (!claim.meta.changes) throw new EngineError('This suggestion was already handled', 409);

  const startedAt = Date.now();
  const ctx: ActionContext = { env, tenantId, db, api: makeApiCaller(env, clicker.token, depth), actorId: clicker.userId, automatic: false, depth };
  try {
    const result = await action.execute(ctx, parsed.data);
    const now = new Date().toISOString();
    await db
      .prepare(
        `UPDATE assistant_suggestions SET status = 'applied', params = ?, result = ?, undo = ?, applied_by = ?, applied_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(JSON.stringify(parsed.data), JSON.stringify({ entities: result.entities, summary: result.summary ?? null }), result.undo ? JSON.stringify(result.undo) : null, clicker.userId, now, now, id)
      .run();
    await logRun(db, { ruleKey: suggestion.rule_key, outcome: 'applied', detail: result.summary ?? suggestion.title, suggestionId: id, startedAt, entityType: suggestion.entity_type, entityId: suggestion.entity_id });
    await announce(env, tenantId, { id, entityType: suggestion.entity_type, entityId: suggestion.entity_id, contactId: suggestion.contact_id, leadId: suggestion.lead_id, status: 'applied' });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await db.prepare(`UPDATE assistant_suggestions SET status = 'pending', error = ? WHERE id = ?`).bind(detail.slice(0, 500), id).run();
    await logRun(db, { ruleKey: suggestion.rule_key, outcome: 'failed', detail, suggestionId: id, startedAt, entityType: suggestion.entity_type, entityId: suggestion.entity_id });
    throw new EngineError(detail, 422);
  }

  return (await getSuggestion(db, id))!;
}

export async function dismissSuggestion(env: Env, tenantId: string, db: D1Database, id: string, userId: string): Promise<SuggestionRow> {
  const suggestion = await getSuggestion(db, id);
  if (!suggestion) throw new EngineError('Suggestion not found', 404);
  const result = await db
    .prepare(`UPDATE assistant_suggestions SET status = 'dismissed', applied_by = ?, updated_at = ? WHERE id = ? AND status = 'pending'`)
    .bind(userId, new Date().toISOString(), id)
    .run();
  if (!result.meta.changes) throw new EngineError('This suggestion was already handled', 409);
  await announce(env, tenantId, { id, entityType: suggestion.entity_type, entityId: suggestion.entity_id, contactId: suggestion.contact_id, leadId: suggestion.lead_id, status: 'dismissed' });
  return (await getSuggestion(db, id))!;
}

export async function undoSuggestion(env: Env, tenantId: string, db: D1Database, id: string, clicker: Clicker): Promise<SuggestionRow> {
  const suggestion = await getSuggestion(db, id);
  if (!suggestion) throw new EngineError('Suggestion not found', 404);
  const action = ACTIONS[suggestion.action_type];
  if (!action?.undo || !suggestion.undo) throw new EngineError('This cannot be undone here', 409);
  if (!hasPermission(clicker.role as Role, action.module, action.permission)) {
    throw new EngineError('You do not have permission to do this', 403);
  }
  const previous = suggestion.status;
  const claim = await db
    .prepare(`UPDATE assistant_suggestions SET status = 'undoing', updated_at = ? WHERE id = ? AND status IN ('applied', 'auto_applied')`)
    .bind(new Date().toISOString(), id)
    .run();
  if (!claim.meta.changes) throw new EngineError('Nothing to undo', 409);

  const startedAt = Date.now();
  // Depth is at the limit so that reversing an action never sets off further automations.
  const ctx: ActionContext = { env, tenantId, db, api: makeApiCaller(env, clicker.token, MAX_AUTOMATION_DEPTH), actorId: clicker.userId, automatic: false, depth: MAX_AUTOMATION_DEPTH };
  try {
    await action.undo(ctx, parseJson<Record<string, unknown>>(suggestion.undo, {}));
    await db.prepare(`UPDATE assistant_suggestions SET status = 'undone', updated_at = ? WHERE id = ?`).bind(new Date().toISOString(), id).run();
    await logRun(db, { ruleKey: suggestion.rule_key, outcome: 'undone', detail: suggestion.title, suggestionId: id, startedAt, entityType: suggestion.entity_type, entityId: suggestion.entity_id });
    await announce(env, tenantId, { id, entityType: suggestion.entity_type, entityId: suggestion.entity_id, contactId: suggestion.contact_id, leadId: suggestion.lead_id, status: 'undone' });
  } catch (err) {
    await db.prepare(`UPDATE assistant_suggestions SET status = ? WHERE id = ?`).bind(previous, id).run();
    throw new EngineError(err instanceof Error ? err.message : String(err), 422);
  }
  return (await getSuggestion(db, id))!;
}

export function recipeFor(key: string): Recipe | undefined {
  return RECIPES_BY_KEY[key];
}
