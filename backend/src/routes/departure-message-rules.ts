/**
 * Rules for departure-relative messages (R154, design section 9.3), mounted at /departure-message-rules and gated by the plan feature
 * group_departures in index.ts. A rule with no tour applies to every departure; a rule of a tour replaces the agency-wide rule of the same
 * name for that tour's departures.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../utils/validator';
import type { AppContext } from '../types';
import { success, created, notFound, error } from '../utils/response';
import { requirePermission } from '../middleware/rbac';
import { logActivity } from '../utils/activity-logger';
import { generateId } from '../utils/uuid';
import { loadRules, previewRule, sendRuleNow, type MessageRule } from '../services/departures/scheduled-messages';

type Row = Record<string, any>;

const timeStr = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Use a time as HH:MM');

const ruleFields = {
  tourId: z.string().min(1).max(64).nullable().optional(),
  name: z.string().trim().min(1).max(120),
  templateId: z.string().min(1).max(64).nullable().optional(),
  channel: z.enum(['preferred', 'whatsapp', 'email', 'sms']).default('preferred'),
  fallbackChannel: z.enum(['whatsapp', 'email', 'sms']).nullable().optional(),
  anchor: z.enum(['start', 'end', 'extras_cutoff']).default('start'),
  offsetDays: z.number().int().min(-365).max(365).default(0),
  localTime: timeStr.nullable().optional(),
  audience: z.enum(['confirmed', 'confirmed_and_held', 'waitlisted']).default('confirmed'),
  recipient: z.enum(['booking_contact', 'each_passenger_with_contact']).default('booking_contact'),
  purpose: z.enum(['service', 'marketing']).default('service'),
  mode: z.enum(['auto', 'suggest']).default('suggest'),
  isActive: z.boolean().default(true),
};

const createSchema = z.object(ruleFields);
const updateSchema = z.object(ruleFields).partial();
const listSchema = z.object({ tourId: z.string().min(1).max(64).optional(), scope: z.enum(['all', 'agency']).optional() });
const previewSchema = z.object({ departureId: z.string().min(1).max(64) });
const sendSchema = z.object({ departureId: z.string().min(1).max(64) });

const dto = (r: Row) => ({
  id: r.id,
  tourId: r.tour_id ?? null,
  name: r.name,
  templateId: r.template_id ?? null,
  templateName: r.template_name ?? null,
  channel: r.channel,
  fallbackChannel: r.fallback_channel ?? null,
  anchor: r.anchor,
  offsetDays: r.offset_days,
  localTime: r.local_time ?? null,
  audience: r.audience,
  recipient: r.recipient,
  purpose: r.purpose,
  mode: r.mode,
  isActive: !!r.is_active,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT_ONE = `SELECT r.*, t.name AS template_name FROM departure_message_rules r LEFT JOIN message_templates t ON t.id = r.template_id`;

const rules = new Hono<AppContext>();

rules.get('/', requirePermission('departures', 'view'), zValidator('query', listSchema), async (c) => {
  const q = c.req.valid('query');
  const where: string[] = [];
  const binds: unknown[] = [];
  if (q.tourId) {
    where.push('(r.tour_id = ? OR r.tour_id IS NULL)');
    binds.push(q.tourId);
  } else if (q.scope === 'agency') {
    where.push('r.tour_id IS NULL');
  }
  const { results } = await c
    .get('tenantDb')
    .prepare(`${SELECT_ONE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.tour_id IS NOT NULL, r.created_at, r.id`)
    .bind(...binds)
    .all<Row>();
  return success(c, (results ?? []).map(dto));
});

/** Checks the template and the tour a rule names exist. Returns a message, or null. */
async function checkRefs(db: D1Database, templateId: string | null | undefined, tourId: string | null | undefined): Promise<string | null> {
  if (templateId && !(await db.prepare('SELECT 1 AS hit FROM message_templates WHERE id = ?').bind(templateId).first())) return 'Template not found';
  if (tourId && !(await db.prepare('SELECT 1 AS hit FROM tours WHERE id = ? AND COALESCE(is_deleted, 0) = 0').bind(tourId).first())) return 'Tour not found';
  return null;
}

rules.post('/', requirePermission('departures', 'create'), zValidator('json', createSchema), async (c) => {
  const db = c.get('tenantDb');
  const b = c.req.valid('json');
  const problem = await checkRefs(db, b.templateId, b.tourId);
  if (problem) return error(c, problem, 400);
  const id = generateId();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO departure_message_rules (id, tour_id, name, template_id, channel, fallback_channel, anchor, offset_days, local_time, audience, recipient, purpose, mode, is_active, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id, b.tourId ?? null, b.name, b.templateId ?? null, b.channel, b.fallbackChannel ?? null, b.anchor, b.offsetDays, b.localTime ?? null,
      b.audience, b.recipient, b.purpose, b.mode, b.isActive ? 1 : 0, c.get('userId'), now, now,
    )
    .run();
  await logActivity(db, { userId: c.get('userId'), action: 'create', entityType: 'departure_message_rule', entityId: id });
  return created(c, dto((await db.prepare(`${SELECT_ONE} WHERE r.id = ?`).bind(id).first<Row>())!));
});

rules.put('/:id', requirePermission('departures', 'edit'), zValidator('json', updateSchema), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const current = await db.prepare('SELECT * FROM departure_message_rules WHERE id = ?').bind(id).first<Row>();
  if (!current) return notFound(c, 'Rule');
  const b = c.req.valid('json');
  const problem = await checkRefs(db, b.templateId, b.tourId);
  if (problem) return error(c, problem, 400);
  const pick = <T>(v: T | undefined, old: T): T => (v === undefined ? old : v);
  await db
    .prepare(
      `UPDATE departure_message_rules SET tour_id = ?, name = ?, template_id = ?, channel = ?, fallback_channel = ?, anchor = ?, offset_days = ?, local_time = ?,
         audience = ?, recipient = ?, purpose = ?, mode = ?, is_active = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(
      pick(b.tourId, current.tour_id), pick(b.name, current.name), pick(b.templateId, current.template_id), pick(b.channel, current.channel),
      pick(b.fallbackChannel, current.fallback_channel), pick(b.anchor, current.anchor), pick(b.offsetDays, current.offset_days),
      pick(b.localTime, current.local_time), pick(b.audience, current.audience), pick(b.recipient, current.recipient), pick(b.purpose, current.purpose),
      pick(b.mode, current.mode), b.isActive === undefined ? current.is_active : b.isActive ? 1 : 0, new Date().toISOString(), id,
    )
    .run();
  await logActivity(db, { userId: c.get('userId'), action: 'update', entityType: 'departure_message_rule', entityId: id });
  return success(c, dto((await db.prepare(`${SELECT_ONE} WHERE r.id = ?`).bind(id).first<Row>())!));
});

rules.delete('/:id', requirePermission('departures', 'delete'), async (c) => {
  const db = c.get('tenantDb');
  const id = c.req.param('id');
  const current = await db.prepare('SELECT id FROM departure_message_rules WHERE id = ?').bind(id).first();
  if (!current) return notFound(c, 'Rule');
  await db.prepare('DELETE FROM departure_message_rules WHERE id = ?').bind(id).run();
  await logActivity(db, { userId: c.get('userId'), action: 'delete', entityType: 'departure_message_rule', entityId: id });
  return success(c, { id });
});

async function ruleOr404(db: D1Database, id: string): Promise<MessageRule | null> {
  return (await loadRules(db)).find((r) => r.id === id) ?? null;
}

/** The per-person messages the rule would send on a departure. Nothing is sent and no row is written. */
rules.post('/:id/preview', requirePermission('departures', 'view'), zValidator('query', previewSchema), async (c) => {
  const db = c.get('tenantDb');
  const rule = await ruleOr404(db, c.req.param('id'));
  if (!rule) return notFound(c, 'Rule');
  const result = await previewRule(c.env, c.get('tenantId'), db, rule, c.req.valid('query').departureId);
  if (!result) return notFound(c, 'Departure');
  return success(c, result);
});

/** Sends the rule to everyone on a departure now (what the "Review and send" suggestion opens): people already messaged are left out. */
rules.post('/:id/send', requirePermission('communications', 'create'), zValidator('json', sendSchema), async (c) => {
  const db = c.get('tenantDb');
  const rule = await ruleOr404(db, c.req.param('id'));
  if (!rule) return notFound(c, 'Rule');
  const summary = await sendRuleNow(c.env, c.get('tenantId'), db, rule, c.req.valid('json').departureId);
  if (!summary) return notFound(c, 'Departure');
  await logActivity(db, { userId: c.get('userId'), action: 'send', entityType: 'departure_message_rule', entityId: rule.id, details: JSON.stringify(summary) });
  return success(c, summary);
});

export default rules;
