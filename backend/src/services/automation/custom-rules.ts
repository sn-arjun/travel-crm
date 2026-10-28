/**
 * Custom automation rules: "when this happens, if these conditions hold, do these things".
 *
 * A workspace builds them from fixed lists (triggers, fields, operators, actions), so a rule can only
 * ever do what the action registry allows. They are stored in automation_rules next to the library
 * recipes (recipe_key = "custom:<id>") and run through the same engine, guards and audit log.
 */

import { z } from 'zod';
import { getTenantTimeZone, localDateString, addDaysLocal, daysBetweenLocal } from '../../utils/tz';
import { ACTIONS } from './actions';
import type { AutomationMode, DomainEvent, Proposal, RecipeContext } from './types';

export const CUSTOM_PREFIX = 'custom:';
export const MAX_CUSTOM_RULES = 50;

// ── What a rule can be built from ────────────────────────────

export const CUSTOM_TRIGGERS = [
  { value: 'lead.created', label: 'A lead is created' },
  { value: 'lead.status_changed', label: 'A lead changes status' },
  { value: 'message.received', label: 'A customer message arrives on a lead' },
  { value: 'itinerary.sent', label: 'A quote is sent' },
  { value: 'quote.accepted', label: 'A customer accepts a quote' },
  { value: 'payment.recorded', label: 'A payment is recorded' },
] as const;

export type FieldKind = 'text' | 'number';

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'requirement_gathered', 'proposal_sent', 'negotiation', 'won', 'booking_confirmed', 'completed', 'lost', 'on_hold'];

export const CUSTOM_FIELDS: ReadonlyArray<{ value: string; label: string; kind: FieldKind; options?: string[]; triggers?: string[] }> = [
  { value: 'new_status', label: 'New status', kind: 'text', options: LEAD_STATUSES, triggers: ['lead.status_changed'] },
  { value: 'status', label: 'Lead status', kind: 'text', options: LEAD_STATUSES },
  { value: 'source', label: 'Lead source', kind: 'text' },
  { value: 'trip_type', label: 'Trip type', kind: 'text', options: ['domestic', 'international', 'honeymoon', 'family', 'group', 'corporate', 'adventure', 'pilgrimage'] },
  { value: 'priority', label: 'Priority', kind: 'text', options: ['hot', 'warm', 'cold'] },
  { value: 'destination', label: 'Destination', kind: 'text' },
  { value: 'budget', label: 'Budget', kind: 'number' },
  { value: 'travellers', label: 'Number of travellers', kind: 'number' },
  { value: 'days_to_travel', label: 'Days until travel', kind: 'number' },
  { value: 'amount', label: 'Payment amount', kind: 'number', triggers: ['payment.recorded'] },
  { value: 'channel', label: 'Message channel', kind: 'text', options: ['whatsapp', 'sms', 'email'], triggers: ['message.received'] },
];

export const CUSTOM_OPERATORS = [
  { value: 'equals', label: 'is', kinds: ['text', 'number'] },
  { value: 'not_equals', label: 'is not', kinds: ['text', 'number'] },
  { value: 'contains', label: 'contains', kinds: ['text'] },
  { value: 'greater_than', label: 'is more than', kinds: ['number'] },
  { value: 'less_than', label: 'is less than', kinds: ['number'] },
] as const;

export const CUSTOM_PLACEHOLDERS = ['customer_name', 'first_name', 'lead_title', 'destination', 'travel_date'] as const;

const conditionSchema = z.object({
  field: z.enum(CUSTOM_FIELDS.map((f) => f.value) as [string, ...string[]]),
  op: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than']),
  value: z.string().max(120),
});

const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_task'),
    title: z.string().min(1).max(160),
    dueInDays: z.number().int().min(0).max(365).default(1),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
  }),
  z.object({
    type: z.literal('create_follow_up'),
    inDays: z.number().int().min(0).max(365).default(1),
    followUpType: z.enum(['call', 'email', 'whatsapp', 'visit', 'sms']).default('call'),
    notes: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal('draft_message'),
    channel: z.enum(['whatsapp', 'email', 'sms']),
    body: z.string().min(1).max(2000),
  }),
  z.object({
    type: z.literal('advance_lead_status'),
    status: z.enum(['contacted', 'qualified', 'proposal_sent']),
  }),
]);

export type CustomCondition = z.infer<typeof conditionSchema>;
export type CustomAction = z.infer<typeof actionSchema>;

export const customRuleInputSchema = z.object({
  name: z.string().min(3).max(100),
  trigger: z.enum(CUSTOM_TRIGGERS.map((t) => t.value) as [string, ...string[]]),
  conditions: z.array(conditionSchema).max(8).default([]),
  actions: z.array(actionSchema).min(1).max(5),
  mode: z.enum(['off', 'suggest', 'auto']).default('suggest'),
});

export type CustomRuleInput = z.infer<typeof customRuleInputSchema>;

export interface CustomRule extends CustomRuleInput {
  id: string;
  key: string;
  updatedBy: string | null;
}

/** Which registry action a rule action becomes. */
const REGISTRY_ACTION: Record<CustomAction['type'], string> = {
  create_task: 'create_task',
  create_follow_up: 'create_follow_up',
  draft_message: 'draft_reply',
  advance_lead_status: 'advance_lead_status',
};

/** A rule may run on its own only when every step it takes is low risk. */
export function canRunAutomatically(actions: CustomAction[]): boolean {
  return actions.every((action) => {
    const def = ACTIONS[REGISTRY_ACTION[action.type]];
    return def.risk === 'low' && !def.clientHandled;
  });
}

/** Problems a person should fix before saving, in plain words. */
export function validateRule(rule: CustomRuleInput): string | null {
  for (const condition of rule.conditions) {
    const field = CUSTOM_FIELDS.find((f) => f.value === condition.field)!;
    if (field.triggers && !field.triggers.includes(rule.trigger)) {
      return `"${field.label}" cannot be used with this trigger`;
    }
    const op = CUSTOM_OPERATORS.find((o) => o.value === condition.op)!;
    if (!(op.kinds as readonly string[]).includes(field.kind)) return `"${field.label}" cannot be compared with "${op.label}"`;
    if (condition.value.trim() === '') return `"${field.label}" needs a value`;
    if (field.kind === 'number' && !Number.isFinite(Number(condition.value))) return `"${field.label}" needs a number`;
  }
  if (rule.mode === 'auto' && !canRunAutomatically(rule.actions)) {
    return 'A rule that drafts a message always asks first; set it to Suggest';
  }
  return null;
}

// ── Storage ──────────────────────────────────────────────────

interface RuleRow {
  id: string;
  recipe_key: string;
  mode: string;
  settings: string | null;
  trigger: string | null;
  conditions: string | null;
  actions: string | null;
  updated_by: string | null;
}

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toRule(row: RuleRow): CustomRule | null {
  const candidate = customRuleInputSchema.safeParse({
    name: parse<{ name?: string }>(row.settings, {}).name ?? 'Custom rule',
    trigger: row.trigger,
    conditions: parse(row.conditions, []),
    actions: parse(row.actions, []),
    mode: row.mode,
  });
  if (!candidate.success) return null;
  return { ...candidate.data, id: row.id, key: row.recipe_key, updatedBy: row.updated_by };
}

export async function listCustomRules(db: D1Database, trigger?: string): Promise<CustomRule[]> {
  const rows = await db
    .prepare(
      `SELECT id, recipe_key, mode, settings, trigger, conditions, actions, updated_by FROM automation_rules
       WHERE recipe_key LIKE 'custom:%' ${trigger ? 'AND trigger = ?' : ''} ORDER BY created_at`,
    )
    .bind(...(trigger ? [trigger] : []))
    .all<RuleRow>();
  return rows.results.map(toRule).filter((rule): rule is CustomRule => rule !== null);
}

/** key -> name, for showing who suggested something. */
export async function customRuleNames(db: D1Database): Promise<Record<string, string>> {
  const rules = await listCustomRules(db);
  return Object.fromEntries(rules.map((rule) => [rule.key, rule.name]));
}

// ── Evaluation ───────────────────────────────────────────────

interface Facts {
  today: string;
  values: Record<string, string | number | null>;
  lead: { id: string; title: string; contact_id: string; assigned_to: string | null; source: string | null };
  contact: { id: string; name: string; phone: string | null; email: string | null; opted_out: number | null } | null;
  placeholders: Record<string, string>;
}

async function factsFor(ctx: RecipeContext, event: DomainEvent): Promise<Facts | null> {
  const leadId = event.entityType === 'lead' ? event.entityId : (event.payload.leadId as string | null | undefined);
  if (!leadId) return null;
  const lead = await ctx.db
    .prepare('SELECT * FROM leads WHERE id = ? AND COALESCE(is_deleted, 0) = 0')
    .bind(leadId)
    .first<Record<string, string | number | null>>();
  if (!lead) return null;
  const contact = await ctx.db
    .prepare('SELECT id, name, phone, email, opted_out FROM contacts WHERE id = ?')
    .bind(lead.contact_id)
    .first<Facts['contact']>();

  let destinations: string[] = lead.destination ? [String(lead.destination)] : [];
  try {
    const parsed = JSON.parse(String(lead.destination ?? ''));
    if (Array.isArray(parsed)) destinations = parsed.filter((d) => typeof d === 'string');
  } catch {
    // plain text
  }

  const today = localDateString(await getTenantTimeZone(ctx.db));
  const travelDate = typeof lead.travel_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(lead.travel_date) ? lead.travel_date.slice(0, 10) : null;
  const daysToTravel = travelDate ? daysBetweenLocal(today, travelDate) : null;

  return {
    today,
    values: {
      new_status: typeof event.payload.to === 'string' ? event.payload.to : null,
      status: (lead.status as string) ?? null,
      source: (lead.source as string) ?? null,
      trip_type: (lead.trip_type as string) ?? null,
      priority: (lead.priority as string) ?? null,
      destination: destinations.join(', '),
      budget: typeof lead.budget === 'number' ? lead.budget : null,
      travellers: Number(lead.pax_adults ?? 1) + Number(lead.pax_children ?? 0),
      days_to_travel: daysToTravel,
      amount: typeof event.payload.amount === 'number' ? event.payload.amount : null,
      channel: typeof event.payload.channel === 'string' ? event.payload.channel : null,
    },
    lead: {
      id: String(lead.id),
      title: String(lead.title),
      contact_id: String(lead.contact_id),
      assigned_to: (lead.assigned_to as string | null) ?? null,
      source: (lead.source as string | null) ?? null,
    },
    contact,
    placeholders: {
      customer_name: contact?.name ?? '',
      first_name: contact?.name?.split(' ')[0] ?? '',
      lead_title: String(lead.title),
      destination: destinations.join(', '),
      travel_date: travelDate
        ? new Date(`${travelDate}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        : '',
    },
  };
}

export function conditionHolds(condition: CustomCondition, actual: string | number | null): boolean {
  if (actual === null || actual === undefined || actual === '') return condition.op === 'not_equals';
  if (typeof actual === 'number') {
    const wanted = Number(condition.value);
    if (!Number.isFinite(wanted)) return false;
    switch (condition.op) {
      case 'equals': return actual === wanted;
      case 'not_equals': return actual !== wanted;
      case 'greater_than': return actual > wanted;
      case 'less_than': return actual < wanted;
      default: return false;
    }
  }
  const have = actual.trim().toLowerCase();
  const wanted = condition.value.trim().toLowerCase();
  switch (condition.op) {
    case 'equals': return have === wanted;
    case 'not_equals': return have !== wanted;
    case 'contains': return have.includes(wanted);
    default: return false;
  }
}

function fill(text: string, placeholders: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, name: string) => (name in placeholders ? placeholders[name] : whole));
}

/** The proposals a rule makes for one event (none when its conditions do not hold). */
export async function evaluateCustomRule(ctx: RecipeContext, rule: CustomRule, event: DomainEvent): Promise<Proposal[]> {
  const facts = await factsFor(ctx, event);
  if (!facts) return [];
  if (!rule.conditions.every((condition) => conditionHolds(condition, facts.values[condition.field] ?? null))) return [];

  const today = facts.today;
  const base = {
    entityType: 'lead',
    entityId: facts.lead.id,
    contactId: facts.lead.contact_id,
    leadId: facts.lead.id,
    assignedTo: facts.lead.assigned_to,
    reason: `Your rule "${rule.name}"`,
  };
  // One run per rule per occurrence: the same event never fires a rule twice.
  const occurrence = `${rule.key}:${event.entityType}:${event.entityId}:${typeof event.payload.to === 'string' ? event.payload.to : ''}`;

  const proposals: Proposal[] = [];
  rule.actions.forEach((action, index) => {
    const dedupeKey = `${occurrence}:${index}`;
    switch (action.type) {
      case 'create_task': {
        const title = fill(action.title, facts.placeholders).slice(0, 200);
        proposals.push({
          ...base,
          action: 'create_task',
          title,
          params: { title, dueDate: addDaysLocal(today, action.dueInDays), priority: action.priority, assignedTo: facts.lead.assigned_to, relatedLeadId: facts.lead.id },
          dedupeKey,
        });
        break;
      }
      case 'create_follow_up':
        proposals.push({
          ...base,
          action: 'create_follow_up',
          title: `Follow up on "${facts.lead.title}"`,
          params: {
            leadId: facts.lead.id,
            scheduledAt: new Date(Date.now() + action.inDays * 86_400_000).toISOString(),
            type: action.followUpType,
            notes: action.notes ? fill(action.notes, facts.placeholders) : `From your rule "${rule.name}"`,
          },
          dedupeKey,
        });
        break;
      case 'advance_lead_status':
        proposals.push({
          ...base,
          action: 'advance_lead_status',
          title: `Move "${facts.lead.title}" to ${action.status.replace(/_/g, ' ')}`,
          params: { leadId: facts.lead.id, status: action.status },
          dedupeKey,
        });
        break;
      case 'draft_message': {
        const contact = facts.contact;
        // Never draft to someone who opted out or cannot be reached on that channel.
        if (!contact || contact.opted_out) break;
        if (action.channel === 'email' ? !contact.email : !contact.phone) break;
        proposals.push({
          ...base,
          action: 'draft_reply',
          title: `Message ${contact.name}`,
          params: { contactId: contact.id, leadId: facts.lead.id, channel: action.channel, subject: action.channel === 'email' ? facts.lead.title : null, body: fill(action.body, facts.placeholders) },
          dedupeKey,
        });
        break;
      }
    }
  });
  return proposals;
}

/** One sentence describing a rule, for lists. */
export function describeRule(rule: CustomRuleInput, locale = 'en-US'): string {
  const trigger = CUSTOM_TRIGGERS.find((t) => t.value === rule.trigger)?.label ?? rule.trigger;
  const conditions = rule.conditions.map((condition) => {
    const field = CUSTOM_FIELDS.find((f) => f.value === condition.field);
    const op = CUSTOM_OPERATORS.find((o) => o.value === condition.op)?.label ?? condition.op;
    const amount = Number(condition.value);
    const value = field?.kind === 'number' && Number.isFinite(amount) ? amount.toLocaleString(locale) : condition.value.replace(/_/g, ' ');
    return `${(field?.label ?? condition.field).toLowerCase()} ${op} ${value}`;
  });
  const actions = rule.actions.map((action) => {
    switch (action.type) {
      case 'create_task': return `create the task "${action.title}"`;
      case 'create_follow_up': return `schedule a ${action.followUpType} follow-up in ${action.inDays} day${action.inDays === 1 ? '' : 's'}`;
      case 'draft_message': return `draft a ${action.channel === 'sms' ? 'SMS' : action.channel === 'email' ? 'email' : 'WhatsApp message'}`;
      case 'advance_lead_status': return `move the lead to ${action.status.replace(/_/g, ' ')}`;
    }
  });
  return `When ${trigger.charAt(0).toLowerCase()}${trigger.slice(1)}${conditions.length ? `, and ${conditions.join(' and ')}` : ''}: ${actions.join(', then ')}.`;
}

export type { AutomationMode };
