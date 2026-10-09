import type {
  AutomationMode, CustomRule, CustomRuleInput, RuleAction, RuleBuilderOptions, RuleCondition, RuleOperator,
} from '@/lib/api/assistant';

/** One step of a rule while it is being edited: every input is kept as typed. */
export interface ActionDraft {
  type: RuleAction['type'];
  title: string;
  days: string;
  priority: 'low' | 'medium' | 'high';
  followUpType: 'call' | 'email' | 'whatsapp' | 'visit' | 'sms';
  channel: 'whatsapp' | 'email' | 'sms';
  body: string;
  status: 'contacted' | 'qualified' | 'proposal_sent';
}

export interface RuleDraft {
  name: string;
  trigger: string;
  conditions: RuleCondition[];
  actions: ActionDraft[];
  mode: AutomationMode;
}

export const ACTION_LABELS: Record<RuleAction['type'], string> = {
  create_task: 'Create a task',
  create_follow_up: 'Schedule a follow-up',
  draft_message: 'Draft a message to the customer',
  advance_lead_status: 'Move the lead forward',
};

export function humanize(value: string): string {
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function emptyAction(type: RuleAction['type'] = 'create_task'): ActionDraft {
  return { type, title: '', days: '1', priority: 'medium', followUpType: 'call', channel: 'whatsapp', body: '', status: 'contacted' };
}

export function emptyDraft(options: RuleBuilderOptions): RuleDraft {
  return { name: '', trigger: options.triggers[0]?.value ?? 'lead.created', conditions: [], actions: [emptyAction()], mode: 'suggest' };
}

export function draftFromRule(rule: CustomRule): RuleDraft {
  return {
    name: rule.name,
    trigger: rule.trigger,
    conditions: rule.conditions.map((condition) => ({ ...condition })),
    actions: rule.actions.map((action) => {
      const draft = emptyAction(action.type);
      switch (action.type) {
        case 'create_task': return { ...draft, title: action.title, days: String(action.dueInDays), priority: action.priority };
        case 'create_follow_up': return { ...draft, days: String(action.inDays), followUpType: action.followUpType, body: action.notes ?? '' };
        case 'draft_message': return { ...draft, channel: action.channel, body: action.body };
        case 'advance_lead_status': return { ...draft, status: action.status };
      }
    }),
    mode: rule.mode,
  };
}

/** The fields a condition can use with this trigger. */
export function fieldsFor(options: RuleBuilderOptions, trigger: string) {
  return options.fields.filter((field) => !field.triggers || field.triggers.includes(trigger));
}

export function operatorsFor(options: RuleBuilderOptions, fieldValue: string) {
  const field = options.fields.find((f) => f.value === fieldValue);
  return field ? options.operators.filter((op) => op.kinds.includes(field.kind)) : options.operators;
}

/** A fresh condition on the first field this trigger offers. */
export function emptyCondition(options: RuleBuilderOptions, trigger: string): RuleCondition {
  const field = fieldsFor(options, trigger)[0];
  return { field: field?.value ?? '', op: 'equals', value: field?.options?.[0] ?? '' };
}

/** Changing the field keeps the comparison only if it still makes sense. */
export function withField(options: RuleBuilderOptions, condition: RuleCondition, fieldValue: string): RuleCondition {
  const field = options.fields.find((f) => f.value === fieldValue);
  const allowed = operatorsFor(options, fieldValue).map((op) => op.value);
  const op: RuleOperator = allowed.includes(condition.op) ? condition.op : 'equals';
  return { field: fieldValue, op, value: field?.options?.[0] ?? '' };
}

/** Changing the trigger drops conditions it cannot evaluate. */
export function withTrigger(options: RuleBuilderOptions, draft: RuleDraft, trigger: string): RuleDraft {
  const allowed = new Set(fieldsFor(options, trigger).map((field) => field.value));
  return { ...draft, trigger, conditions: draft.conditions.filter((condition) => allowed.has(condition.field)) };
}

/** A rule that drafts a message always asks first. */
export function autoAllowed(draft: RuleDraft): boolean {
  return draft.actions.every((action) => action.type !== 'draft_message');
}

function wholeDays(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const days = Number(text);
  return days <= 365 ? days : null;
}

/** The first thing to fix before the rule can be saved, in plain words; null when it is ready. */
export function draftProblem(draft: RuleDraft, options: RuleBuilderOptions): string | null {
  if (draft.name.trim().length < 3) return 'Give the rule a name';
  for (const condition of draft.conditions) {
    const field = options.fields.find((f) => f.value === condition.field);
    if (!field) return 'Choose what each condition looks at';
    if (condition.value.trim() === '') return `Enter a value for "${field.label}"`;
    if (field.kind === 'number' && !Number.isFinite(Number(condition.value))) return `"${field.label}" needs a number`;
  }
  if (draft.actions.length === 0) return 'Add at least one step';
  for (const action of draft.actions) {
    if (action.type === 'create_task' && action.title.trim() === '') return 'Give the task a title';
    if (action.type === 'draft_message' && action.body.trim() === '') return 'Write the message';
    if ((action.type === 'create_task' || action.type === 'create_follow_up') && wholeDays(action.days) === null) return 'Days must be a whole number up to 365';
  }
  if (draft.mode === 'auto' && !autoAllowed(draft)) return 'A rule that drafts a message always asks first';
  return null;
}

/** What is sent to the server. Call only when draftProblem() is null. */
export function draftToInput(draft: RuleDraft): CustomRuleInput {
  return {
    name: draft.name.trim(),
    trigger: draft.trigger,
    conditions: draft.conditions.map((condition) => ({ ...condition, value: condition.value.trim() })),
    actions: draft.actions.map((action): RuleAction => {
      switch (action.type) {
        case 'create_task': return { type: 'create_task', title: action.title.trim(), dueInDays: wholeDays(action.days) ?? 1, priority: action.priority };
        case 'create_follow_up': {
          const notes = action.body.trim();
          return { type: 'create_follow_up', inDays: wholeDays(action.days) ?? 1, followUpType: action.followUpType, ...(notes ? { notes } : {}) };
        }
        case 'draft_message': return { type: 'draft_message', channel: action.channel, body: action.body.trim() };
        case 'advance_lead_status': return { type: 'advance_lead_status', status: action.status };
      }
    }),
    mode: draft.mode === 'auto' && !autoAllowed(draft) ? 'suggest' : draft.mode,
  };
}
