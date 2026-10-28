/**
 * Assistant: the suggestions people see on their screens.
 *
 *   GET  /assistant/suggestions            filter by contactId, leadId, entityType + entityId, status
 *   GET  /assistant/suggestions/count      pending suggestions the user can act on
 *   POST /assistant/suggestions/:id/apply  one click (optionally with edited values)
 *   POST /assistant/suggestions/:id/dismiss
 *   POST /assistant/suggestions/:id/undo
 *   POST /assistant/analyze                read a received message again
 *   GET  /assistant/activity               what automations did, newest first
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { CUSTOM_PREFIX, customRuleNames } from '../services/automation/custom-rules';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, error, notFound } from '../utils/response';
import { ACTIONS } from '../services/automation/actions';
import { emitEvent, requestDepth } from '../services/automation/events';
import {
  applySuggestion,
  canApply,
  dismissSuggestion,
  undoSuggestion,
  recipeFor,
  EngineError,
  type SuggestionRow,
  type Clicker,
} from '../services/automation/engine';

const assistantRoutes = new Hono<AppContext>();

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type RuleNames = Record<string, string>;

/** Names of the workspace's own rules, looked up only when one of the rows came from one. */
async function ruleNames(db: D1Database, keys: Array<string | null>): Promise<RuleNames> {
  return keys.some((key) => key?.startsWith(CUSTOM_PREFIX)) ? customRuleNames(db) : {};
}

function ruleTitle(key: string | null, names: RuleNames): string | null {
  if (!key) return key;
  return recipeFor(key)?.title ?? names[key] ?? (key.startsWith(CUSTOM_PREFIX) ? 'A rule that was deleted' : key);
}

function present(row: SuggestionRow, role: string, names: RuleNames = {}) {
  const action = ACTIONS[row.action_type];
  const allowed = canApply(role, row.action_type);
  return {
    id: row.id,
    ruleKey: row.rule_key,
    ruleTitle: ruleTitle(row.rule_key, names),
    origin: row.origin,
    entityType: row.entity_type,
    entityId: row.entity_id,
    contactId: row.contact_id,
    leadId: row.lead_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    action: {
      type: row.action_type,
      label: action?.label ?? row.action_type,
      risk: row.risk,
      clientHandled: !!action?.clientHandled,
    },
    params: parse<Record<string, unknown>>(row.params, {}),
    title: row.title,
    reason: row.reason,
    confidence: row.confidence,
    status: row.status,
    result: parse<{ entities: Array<{ type: string; id: string; label?: string }>; summary: string | null } | null>(row.result, null),
    error: row.error,
    canApply: allowed && row.status === 'pending',
    canUndo: allowed && (row.status === 'applied' || row.status === 'auto_applied') && !!action?.undo && !!row.undo,
    assignedTo: row.assigned_to,
    appliedBy: row.applied_by,
    appliedAt: row.applied_at,
    modelUsed: row.model_used,
    createdAt: row.created_at,
  };
}

function clicker(c: Context<AppContext>): Clicker {
  return {
    userId: c.get('userId'),
    role: c.get('role'),
    token: (c.req.header('Authorization') ?? '').replace(/^Bearer\s+/i, ''),
  };
}

function engineFailure(c: Context<AppContext>, err: unknown) {
  if (err instanceof EngineError) return error(c, err.message, err.status);
  throw err;
}

const STATUS_FILTERS: Record<string, string[]> = {
  pending: ['pending', 'applying'],
  done: ['applied', 'auto_applied'],
  all: ['pending', 'applying', 'applied', 'auto_applied', 'dismissed', 'undone'],
};

/** Salespeople see what is theirs or nobody's; everyone else sees the workspace. */
function scope(role: string, userId: string): { sql: string; binds: string[] } {
  if (role === 'salesperson') return { sql: ' AND (assigned_to IS NULL OR assigned_to = ?)', binds: [userId] };
  return { sql: '', binds: [] };
}

assistantRoutes.get('/suggestions', async (c) => {
  const db = c.get('tenantDb');
  const role = c.get('role');
  const q = c.req.query();

  const conditions: string[] = [];
  const binds: unknown[] = [];
  const statuses = STATUS_FILTERS[q.status ?? 'pending'] ?? STATUS_FILTERS.pending;
  conditions.push(`status IN (${statuses.map(() => '?').join(', ')})`);
  binds.push(...statuses);

  // A record's panel shows suggestions about it, whichever way they are linked.
  const about: string[] = [];
  if (q.leadId) { about.push('lead_id = ?', `(entity_type = 'lead' AND entity_id = ?)`); binds.push(q.leadId, q.leadId); }
  if (q.contactId) { about.push('contact_id = ?', `(entity_type = 'contact' AND entity_id = ?)`); binds.push(q.contactId, q.contactId); }
  if (q.entityType && q.entityId) { about.push('(entity_type = ? AND entity_id = ?)'); binds.push(q.entityType, q.entityId); }
  if (q.sourceId) { about.push('source_id = ?'); binds.push(q.sourceId); }
  if (about.length > 0) conditions.push(`(${about.join(' OR ')})`);

  const visible = scope(role, c.get('userId'));
  const limit = Math.min(100, Math.max(1, parseInt(q.limit ?? '50', 10) || 50));

  const rows = await db
    .prepare(`SELECT * FROM assistant_suggestions WHERE ${conditions.join(' AND ')}${visible.sql} ORDER BY created_at DESC LIMIT ?`)
    .bind(...binds, ...visible.binds, limit)
    .all<SuggestionRow>();

  const names = await ruleNames(db, rows.results.map((row) => row.rule_key));
  return success(c, rows.results.map((row) => present(row, role, names)));
});

assistantRoutes.get('/suggestions/count', async (c) => {
  const db = c.get('tenantDb');
  const role = c.get('role');
  const visible = scope(role, c.get('userId'));
  const rows = await db
    .prepare(`SELECT action_type, COUNT(*) AS n FROM assistant_suggestions WHERE status = 'pending'${visible.sql} GROUP BY action_type`)
    .bind(...visible.binds)
    .all<{ action_type: string; n: number }>();
  const pending = rows.results.filter((row) => canApply(role, row.action_type)).reduce((sum, row) => sum + row.n, 0);
  return success(c, { pending });
});

assistantRoutes.post(
  '/suggestions/:id/apply',
  zValidator('json', z.object({ params: z.record(z.string(), z.any()).optional() })),
  async (c) => {
    try {
      const row = await applySuggestion(c.env, c.get('tenantId'), c.get('tenantDb'), c.req.param('id'), clicker(c), c.req.valid('json').params ?? {}, requestDepth(c));
      return success(c, present(row, c.get('role'), await ruleNames(c.get('tenantDb'), [row.rule_key])));
    } catch (err) {
      return engineFailure(c, err);
    }
  },
);

assistantRoutes.post('/suggestions/:id/dismiss', async (c) => {
  try {
    const row = await dismissSuggestion(c.env, c.get('tenantId'), c.get('tenantDb'), c.req.param('id'), c.get('userId'));
    return success(c, present(row, c.get('role'), await ruleNames(c.get('tenantDb'), [row.rule_key])));
  } catch (err) {
    return engineFailure(c, err);
  }
});

assistantRoutes.post('/suggestions/:id/undo', async (c) => {
  try {
    const row = await undoSuggestion(c.env, c.get('tenantId'), c.get('tenantDb'), c.req.param('id'), clicker(c));
    return success(c, present(row, c.get('role'), await ruleNames(c.get('tenantDb'), [row.rule_key])));
  } catch (err) {
    return engineFailure(c, err);
  }
});

assistantRoutes.post('/analyze', zValidator('json', z.object({ messageId: z.string().min(1) })), async (c) => {
  const db = c.get('tenantDb');
  const { messageId } = c.req.valid('json');
  const message = await db
    .prepare(`SELECT id, channel, contact_id, lead_id, from_address FROM message_log WHERE id = ? AND direction = 'incoming'`)
    .bind(messageId)
    .first<{ id: string; channel: string; contact_id: string | null; lead_id: string | null; from_address: string | null }>();
  if (!message) return notFound(c, 'Message');

  await emitEvent(c.env, c.get('tenantId'), db, {
    type: 'message.received',
    entityType: 'message',
    entityId: message.id,
    payload: { channel: message.channel, contactId: message.contact_id, leadId: message.lead_id, from: message.from_address, reanalysis: true },
    actorId: c.get('userId'),
  });

  const analysis = await db.prepare('SELECT * FROM assistant_message_analysis WHERE message_id = ?').bind(messageId).first<Record<string, unknown>>();
  return success(c, {
    messageId,
    intent: analysis?.intent ?? null,
    source: analysis?.source ?? null,
    summary: analysis?.summary ?? null,
    entities: parse<Record<string, unknown>>((analysis?.entities as string) ?? null, {}),
  });
});

assistantRoutes.get('/activity', async (c) => {
  const db = c.get('tenantDb');
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10) || 50));
  const rows = await db
    .prepare(
      `SELECT r.id, r.rule_key, r.event_type, r.entity_type, r.entity_id, r.outcome, r.detail, r.suggestion_id, r.created_at,
              s.status AS suggestion_status, s.title AS suggestion_title, s.lead_id, s.contact_id, s.action_type, s.undo, s.entity_type AS s_entity_type, s.entity_id AS s_entity_id
       FROM automation_runs r LEFT JOIN assistant_suggestions s ON s.id = r.suggestion_id
       ORDER BY r.created_at DESC, r.id DESC LIMIT ?`,
    )
    .bind(limit)
    .all<Record<string, string | null>>();

  const role = c.get('role');
  const names = await ruleNames(db, rows.results.map((row) => row.rule_key));
  return success(
    c,
    rows.results.map((row) => {
      const action = row.action_type ? ACTIONS[row.action_type] : undefined;
      return {
        id: row.id,
        ruleKey: row.rule_key,
        ruleTitle: ruleTitle(row.rule_key, names),
        eventType: row.event_type,
        outcome: row.outcome,
        detail: row.detail ?? row.suggestion_title,
        suggestionId: row.suggestion_id,
        suggestionStatus: row.suggestion_status,
        entityType: row.s_entity_type ?? row.entity_type,
        entityId: row.s_entity_id ?? row.entity_id,
        leadId: row.lead_id,
        contactId: row.contact_id,
        canUndo:
          !!row.suggestion_id && !!action?.undo && !!row.undo &&
          (row.suggestion_status === 'applied' || row.suggestion_status === 'auto_applied') &&
          row.outcome === 'applied' && canApply(role, row.action_type ?? ''),
        createdAt: row.created_at,
      };
    }),
  );
});

export default assistantRoutes;
