import { describe, it, expect } from 'vitest';

import type { CustomRule, RuleBuilderOptions } from '@/lib/api/assistant';
import {
  autoAllowed, draftFromRule, draftProblem, draftToInput, emptyAction, emptyCondition, emptyDraft, fieldsFor, operatorsFor, withField, withTrigger,
} from './rule-draft';

const options: RuleBuilderOptions = {
  triggers: [
    { value: 'lead.created', label: 'A lead is created' },
    { value: 'payment.recorded', label: 'A payment is recorded' },
  ],
  fields: [
    { value: 'trip_type', label: 'Trip type', kind: 'text', options: ['family', 'honeymoon'] },
    { value: 'destination', label: 'Destination', kind: 'text' },
    { value: 'budget', label: 'Budget', kind: 'number' },
    { value: 'amount', label: 'Payment amount', kind: 'number', triggers: ['payment.recorded'] },
  ],
  operators: [
    { value: 'equals', label: 'is', kinds: ['text', 'number'] },
    { value: 'contains', label: 'contains', kinds: ['text'] },
    { value: 'greater_than', label: 'is more than', kinds: ['number'] },
  ],
  placeholders: ['customer_name'],
  maxRules: 50,
};

const ready = () => ({
  ...emptyDraft(options),
  name: 'Big budgets',
  conditions: [{ field: 'budget', op: 'greater_than' as const, value: ' 200000 ' }],
  actions: [{ ...emptyAction('create_task'), title: ' Call {{customer_name}} ', days: '0', priority: 'high' as const }],
});

describe('rule draft', () => {
  it('offers only the fields and comparisons that fit', () => {
    expect(fieldsFor(options, 'lead.created').map((f) => f.value)).toEqual(['trip_type', 'destination', 'budget']);
    expect(fieldsFor(options, 'payment.recorded').map((f) => f.value)).toContain('amount');
    expect(operatorsFor(options, 'budget').map((o) => o.value)).toEqual(['equals', 'greater_than']);
    expect(operatorsFor(options, 'destination').map((o) => o.value)).toEqual(['equals', 'contains']);
  });

  it('starts a condition on a value that exists', () => {
    expect(emptyCondition(options, 'lead.created')).toEqual({ field: 'trip_type', op: 'equals', value: 'family' });
  });

  it('resets the comparison when the new field cannot use it', () => {
    expect(withField(options, { field: 'budget', op: 'greater_than', value: '5' }, 'trip_type')).toEqual({ field: 'trip_type', op: 'equals', value: 'family' });
    expect(withField(options, { field: 'destination', op: 'contains', value: 'goa' }, 'budget')).toEqual({ field: 'budget', op: 'equals', value: '' });
  });

  it('drops conditions the new trigger cannot evaluate', () => {
    const draft = { ...ready(), trigger: 'payment.recorded', conditions: [{ field: 'amount', op: 'greater_than' as const, value: '1' }, { field: 'budget', op: 'equals' as const, value: '2' }] };
    expect(withTrigger(options, draft, 'lead.created').conditions).toEqual([{ field: 'budget', op: 'equals', value: '2' }]);
  });

  it('names the first thing to fix', () => {
    expect(draftProblem({ ...ready(), name: ' a ' }, options)).toBe('Give the rule a name');
    expect(draftProblem({ ...ready(), conditions: [{ field: 'budget', op: 'greater_than', value: '' }] }, options)).toBe('Enter a value for "Budget"');
    expect(draftProblem({ ...ready(), conditions: [{ field: 'budget', op: 'greater_than', value: 'lots' }] }, options)).toBe('"Budget" needs a number');
    expect(draftProblem({ ...ready(), actions: [] }, options)).toBe('Add at least one step');
    expect(draftProblem({ ...ready(), actions: [emptyAction('create_task')] }, options)).toBe('Give the task a title');
    expect(draftProblem({ ...ready(), actions: [{ ...emptyAction('create_task'), title: 'x', days: '1.5' }] }, options)).toBe('Days must be a whole number up to 365');
    expect(draftProblem({ ...ready(), actions: [emptyAction('draft_message')] }, options)).toBe('Write the message');
    expect(draftProblem(ready(), options)).toBeNull();
  });

  it('a rule that drafts a message cannot be automatic', () => {
    const drafting = { ...ready(), mode: 'auto' as const, actions: [{ ...emptyAction('draft_message'), body: 'Hi' }] };
    expect(autoAllowed(drafting)).toBe(false);
    expect(draftProblem(drafting, options)).toBe('A rule that drafts a message always asks first');
    expect(draftToInput(drafting).mode).toBe('suggest');
    expect(autoAllowed({ ...ready(), mode: 'auto' })).toBe(true);
  });

  it('sends trimmed, typed values', () => {
    expect(draftToInput(ready())).toEqual({
      name: 'Big budgets',
      trigger: 'lead.created',
      conditions: [{ field: 'budget', op: 'greater_than', value: '200000' }],
      actions: [{ type: 'create_task', title: 'Call {{customer_name}}', dueInDays: 0, priority: 'high' }],
      mode: 'suggest',
    });
    const followUp = draftToInput({ ...ready(), actions: [{ ...emptyAction('create_follow_up'), days: '3', followUpType: 'whatsapp' }] });
    expect(followUp.actions).toEqual([{ type: 'create_follow_up', inDays: 3, followUpType: 'whatsapp' }]);
  });

  it('an existing rule opens with its values and saves back unchanged', () => {
    const rule: CustomRule = {
      id: 'r1', key: 'custom:r1', name: 'Welcome', trigger: 'lead.created', description: '', autoEligible: false, mode: 'suggest',
      last30Days: { suggested: 0, applied: 0, failed: 0 },
      conditions: [{ field: 'trip_type', op: 'equals', value: 'honeymoon' }],
      actions: [
        { type: 'draft_message', channel: 'email', body: 'Hello {{first_name}}' },
        { type: 'create_follow_up', inDays: 2, followUpType: 'call', notes: 'Check the brief' },
        { type: 'advance_lead_status', status: 'qualified' },
      ],
    };
    const { name, trigger, conditions, actions, mode } = rule;
    expect(draftToInput(draftFromRule(rule))).toEqual({ name, trigger, conditions, actions, mode });
  });
});
