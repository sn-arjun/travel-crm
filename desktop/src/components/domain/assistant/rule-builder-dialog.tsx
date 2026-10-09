'use client';

import * as React from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  automationsApi,
  type AutomationMode, type CustomRule, type RuleAction, type RuleBuilderOptions, type RuleCondition, type RuleOperator,
} from '@/lib/api/assistant';
import {
  ACTION_LABELS, autoAllowed, draftFromRule, draftProblem, draftToInput, emptyAction, emptyCondition, emptyDraft, fieldsFor, humanize,
  operatorsFor, withField, withTrigger, type ActionDraft, type RuleDraft,
} from './rule-draft';

const MAX_CONDITIONS = 8;
const MAX_ACTIONS = 5;

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

interface RuleBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: RuleBuilderOptions;
  /** The rule being changed; omit to add a new one. */
  rule?: CustomRule | null;
  /** Only an administrator may let a rule run on its own. */
  canAutomate: boolean;
  onSaved: () => void;
}

export function RuleBuilderDialog({ open, onOpenChange, options, rule, canAutomate, onSaved }: RuleBuilderDialogProps) {
  const [draft, setDraft] = React.useState<RuleDraft>(() => (rule ? draftFromRule(rule) : emptyDraft(options)));
  const [saving, setSaving] = React.useState(false);
  const [showProblem, setShowProblem] = React.useState(false);

  // Start from the rule (or from blank) each time the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    setDraft(rule ? draftFromRule(rule) : emptyDraft(options));
    setShowProblem(false);
  }, [open, rule, options]);

  const problem = draftProblem(draft, options);
  const fields = fieldsFor(options, draft.trigger);
  const mayAutomate = canAutomate && autoAllowed(draft);

  const setCondition = (index: number, next: RuleCondition) =>
    setDraft((d) => ({ ...d, conditions: d.conditions.map((c, i) => (i === index ? next : c)) }));
  const setAction = (index: number, change: Partial<ActionDraft>) =>
    setDraft((d) => {
      const actions = d.actions.map((a, i) => (i === index ? { ...a, ...change } : a));
      const next = { ...d, actions };
      // A step that drafts a message takes "Automatic" off the table.
      return next.mode === 'auto' && !autoAllowed(next) ? { ...next, mode: 'suggest' as AutomationMode } : next;
    });

  const save = async () => {
    if (problem) {
      setShowProblem(true);
      return;
    }
    setSaving(true);
    try {
      const input = draftToInput(draft);
      if (rule) await automationsApi.updateRule(rule.id, input);
      else await automationsApi.createRule(input);
      toast.success(rule ? 'Rule saved' : 'Rule added');
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the rule'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={saving ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="rule-builder">
        <DialogHeader>
          <DialogTitle>{rule ? 'Change rule' : 'New rule'}</DialogTitle>
          <DialogDescription>
            When something happens, and your conditions hold, the assistant does the steps below or suggests them with one click.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-ds-5">
          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="rule-name">Name</Label>
            <Input id="rule-name" value={draft.name} maxLength={100} placeholder="e.g. High-value honeymoon enquiries" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>

          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="rule-trigger">When</Label>
            <Select value={draft.trigger} onValueChange={(trigger) => setDraft(withTrigger(options, draft, trigger))}>
              <SelectTrigger id="rule-trigger" className="h-9 w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.triggers.map((trigger) => <SelectItem key={trigger.value} value={trigger.value}>{trigger.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="flex flex-col gap-ds-2">
            <legend className="mb-ds-2 text-sm font-medium text-ds-foreground">Only if <span className="font-normal text-ds-foreground-muted">(all must hold; leave empty to run every time)</span></legend>
            {draft.conditions.map((condition, index) => {
              const field = options.fields.find((f) => f.value === condition.field);
              return (
                <div key={index} className="flex flex-wrap items-center gap-ds-2" data-testid="rule-condition">
                  <Select value={condition.field} onValueChange={(value) => setCondition(index, withField(options, condition, value))}>
                    <SelectTrigger className="h-9 w-44" aria-label={`Condition ${index + 1}: what to look at`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {fields.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={condition.op} onValueChange={(op) => setCondition(index, { ...condition, op: op as RuleOperator })}>
                    <SelectTrigger className="h-9 w-36" aria-label={`Condition ${index + 1}: comparison`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {operatorsFor(options, condition.field).map((op) => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {field?.options && condition.op !== 'contains' ? (
                    <Select value={condition.value} onValueChange={(value) => setCondition(index, { ...condition, value })}>
                      <SelectTrigger className="h-9 min-w-40 flex-1" aria-label={`Condition ${index + 1}: value`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => <SelectItem key={option} value={option}>{humanize(option)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      aria-label={`Condition ${index + 1}: value`}
                      className="h-9 min-w-40 flex-1"
                      inputMode={field?.kind === 'number' ? 'numeric' : undefined}
                      value={condition.value}
                      maxLength={120}
                      onChange={(e) => setCondition(index, { ...condition, value: e.target.value })}
                    />
                  )}
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove condition ${index + 1}`} onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, i) => i !== index) })}>
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              );
            })}
            {draft.conditions.length < MAX_CONDITIONS && fields.length > 0 && (
              <Button type="button" variant="outline" size="sm" className="w-fit gap-ds-1" onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, emptyCondition(options, draft.trigger)] })}>
                <Plus className="size-3.5" aria-hidden="true" />
                Add condition
              </Button>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-ds-3">
            <legend className="mb-ds-2 text-sm font-medium text-ds-foreground">Then</legend>
            {draft.actions.map((action, index) => (
              <div key={index} className="flex flex-col gap-ds-2 rounded-ds-md border border-ds-border p-ds-3" data-testid="rule-step">
                <div className="flex items-center gap-ds-2">
                  <Select value={action.type} onValueChange={(type) => setAction(index, { type: type as RuleAction['type'] })}>
                    <SelectTrigger className="h-9 flex-1" aria-label={`Step ${index + 1}: what to do`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ACTION_LABELS) as Array<RuleAction['type']>).map((type) => <SelectItem key={type} value={type}>{ACTION_LABELS[type]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {draft.actions.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove step ${index + 1}`} onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, i) => i !== index) })}>
                      <X className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>

                {action.type === 'create_task' && (
                  <div className="flex flex-wrap items-center gap-ds-2">
                    <Input aria-label={`Step ${index + 1}: task title`} className="h-9 basis-full" placeholder="Task title" maxLength={160} value={action.title} onChange={(e) => setAction(index, { title: e.target.value })} />
                    <label className="flex items-center gap-ds-2 text-sm text-ds-foreground-muted">
                      due in
                      <Input aria-label={`Step ${index + 1}: due in days`} inputMode="numeric" className="h-9 w-16 text-right" value={action.days} onChange={(e) => setAction(index, { days: e.target.value.replace(/\D/g, '') })} />
                      days
                    </label>
                    <Select value={action.priority} onValueChange={(priority) => setAction(index, { priority: priority as ActionDraft['priority'] })}>
                      <SelectTrigger className="h-9 w-32" aria-label={`Step ${index + 1}: priority`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low priority</SelectItem>
                        <SelectItem value="medium">Medium priority</SelectItem>
                        <SelectItem value="high">High priority</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {action.type === 'create_follow_up' && (
                  <div className="flex flex-wrap items-center gap-ds-2">
                    <Select value={action.followUpType} onValueChange={(followUpType) => setAction(index, { followUpType: followUpType as ActionDraft['followUpType'] })}>
                      <SelectTrigger className="h-9 w-36" aria-label={`Step ${index + 1}: follow-up type`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="visit">Visit</SelectItem>
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-ds-2 text-sm text-ds-foreground-muted">
                      in
                      <Input aria-label={`Step ${index + 1}: in days`} inputMode="numeric" className="h-9 w-16 text-right" value={action.days} onChange={(e) => setAction(index, { days: e.target.value.replace(/\D/g, '') })} />
                      days
                    </label>
                    <Input aria-label={`Step ${index + 1}: note`} className="h-9 min-w-40 flex-1" placeholder="Note (optional)" maxLength={300} value={action.body} onChange={(e) => setAction(index, { body: e.target.value })} />
                  </div>
                )}

                {action.type === 'draft_message' && (
                  <div className="flex flex-col gap-ds-2">
                    <Select value={action.channel} onValueChange={(channel) => setAction(index, { channel: channel as ActionDraft['channel'] })}>
                      <SelectTrigger className="h-9 w-40" aria-label={`Step ${index + 1}: channel`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea aria-label={`Step ${index + 1}: message`} rows={3} maxLength={2000} placeholder="Hi {{first_name}}, ..." value={action.body} onChange={(e) => setAction(index, { body: e.target.value })} />
                    <p className="text-xs text-ds-foreground-muted">You read and send it yourself; nothing goes out without a click.</p>
                  </div>
                )}

                {action.type === 'advance_lead_status' && (
                  <div className="flex flex-wrap items-center gap-ds-2 text-sm text-ds-foreground-muted">
                    to
                    <Select value={action.status} onValueChange={(status) => setAction(index, { status: status as ActionDraft['status'] })}>
                      <SelectTrigger className="h-9 w-44" aria-label={`Step ${index + 1}: status`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contacted">Contacted</SelectItem>
                        <SelectItem value="qualified">Qualified</SelectItem>
                        <SelectItem value="proposal_sent">Proposal sent</SelectItem>
                      </SelectContent>
                    </Select>
                    <span>(a lead is never moved backwards)</span>
                  </div>
                )}
              </div>
            ))}
            {draft.actions.length < MAX_ACTIONS && (
              <Button type="button" variant="outline" size="sm" className="w-fit gap-ds-1" onClick={() => setDraft({ ...draft, actions: [...draft.actions, emptyAction()] })}>
                <Plus className="size-3.5" aria-hidden="true" />
                Add step
              </Button>
            )}
            <p className="text-xs text-ds-foreground-muted">
              In task titles, notes and messages you can use {options.placeholders.map((name) => `{{${name}}}`).join(', ')}.
            </p>
          </fieldset>

          <div className="flex flex-col gap-ds-2">
            <Label htmlFor="rule-mode">How it runs</Label>
            <Select value={draft.mode} onValueChange={(mode) => setDraft({ ...draft, mode: mode as AutomationMode })}>
              <SelectTrigger id="rule-mode" className="h-9 w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="suggest">Suggest (one click)</SelectItem>
                {(mayAutomate || draft.mode === 'auto') && <SelectItem value="auto">Automatic</SelectItem>}
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
            {!autoAllowed(draft) && <p className="text-xs text-ds-foreground-muted">A rule that drafts a message always asks first.</p>}
          </div>

          {showProblem && problem && (
            <p role="alert" className="rounded-ds-md border border-ds-danger bg-ds-danger-subtle px-ds-3 py-ds-2 text-sm text-ds-danger-on-subtle">{problem}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{rule ? 'Save rule' : 'Add rule'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
