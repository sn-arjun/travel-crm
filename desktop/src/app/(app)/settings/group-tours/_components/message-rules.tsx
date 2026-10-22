'use client';

import * as React from 'react';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { RelationCombobox } from '@/components/domain';
import {
  Alert, AlertDescription, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label,
  SectionCard, Skeleton, Spinner, Switch, Tag, useConfirm,
} from '@/components/ui';
import { usePermission } from '@/hooks/use-permission';
import {
  departureMessagesApi, type FallbackChannel, type MessageRule, type MessageRuleInput, type RuleAnchor, type RuleAudience, type RuleChannel, type RuleMode,
  type RulePurpose, type RuleRecipient,
} from '@/lib/api/departure-messages';
import { unwrapList } from '@/lib/api/envelope';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';
import { departureErrorText } from '@/lib/departures';
import { useT, type TranslateFn } from '@/lib/i18n';
import { SimpleSelect } from '../../../departures/_components/simple-select';
import { IntField } from './int-field';
import { MessagePreview } from './message-preview';

const ANCHOR_SUFFIX: Record<RuleAnchor, string> = { start: 'Start', end: 'End', extras_cutoff: 'Extras' };
const DEFAULT_TIME = '09:00';

/** "Sends 2 days before departure at 18:00". */
export function whenText(t: TranslateFn, anchor: RuleAnchor, offsetDays: number, localTime: string | null): string {
  const suffix = ANCHOR_SUFFIX[anchor];
  const time = localTime || DEFAULT_TIME;
  if (offsetDays === 0) return t(`departureMessages.when.same${suffix}`, { time });
  return t(`departureMessages.when.${offsetDays < 0 ? 'before' : 'after'}${suffix}`, { count: Math.abs(offsetDays), time });
}

interface FormState {
  id: string | null;
  name: string;
  templateId: string | null;
  channel: RuleChannel;
  fallback: FallbackChannel | null;
  anchor: RuleAnchor;
  direction: 'before' | 'after';
  days: number;
  time: string;
  audience: RuleAudience;
  recipient: RuleRecipient;
  purpose: RulePurpose;
  mode: RuleMode;
  isActive: boolean;
}

const emptyForm = (): FormState => ({
  id: null, name: '', templateId: null, channel: 'preferred', fallback: null, anchor: 'start', direction: 'before', days: 2, time: '18:00',
  audience: 'confirmed', recipient: 'booking_contact', purpose: 'service', mode: 'suggest', isActive: true,
});

const formFromRule = (r: MessageRule, keepId: boolean): FormState => ({
  id: keepId ? r.id : null,
  name: r.name,
  templateId: r.templateId,
  channel: r.channel,
  fallback: r.fallbackChannel,
  anchor: r.anchor,
  direction: r.offsetDays > 0 ? 'after' : 'before',
  days: Math.abs(r.offsetDays),
  time: r.localTime || DEFAULT_TIME,
  audience: r.audience,
  recipient: r.recipient,
  purpose: r.purpose,
  mode: r.mode,
  isActive: r.isActive,
});

const offsetOf = (f: FormState): number => (f.direction === 'before' ? -f.days : f.days) || 0;

const inputFrom = (f: FormState, tourId: string | null): MessageRuleInput => ({
  tourId,
  name: f.name.trim(),
  templateId: f.templateId,
  channel: f.channel,
  fallbackChannel: f.fallback,
  anchor: f.anchor,
  offsetDays: offsetOf(f),
  localTime: f.time || null,
  audience: f.audience,
  recipient: f.recipient,
  purpose: f.purpose,
  mode: f.mode,
  isActive: f.isActive,
});

function TemplateCombobox({ value, onChange, disabled }: { value: string | null; onChange: (id: string | null, item: MessageTemplate | null) => void; disabled?: boolean }) {
  const t = useT();
  return (
    <RelationCombobox<MessageTemplate>
      value={value}
      onChange={onChange}
      disabled={disabled}
      fetcher={async (q, page) => {
        const list = unwrapList<MessageTemplate>(await templatesApi.list({ search: q || undefined, page, limit: 20, is_active: 1 }), { limit: 20 });
        return { items: list.data, total: list.pagination?.total ?? list.data.length };
      }}
      getOptionId={(x) => x.id}
      getOptionLabel={(x) => x.name}
      getOptionDescription={(x) => t(`departureMessages.channel.${x.channel}`)}
      resolveSelected={async (id) => {
        const r = await templatesApi.getById(id);
        const body = (r as unknown as { data?: MessageTemplate }).data;
        return body ?? null;
      }}
      placeholder={t('departureMessages.form.templatePlaceholder')}
      searchPlaceholder={t('departureMessages.form.templateSearch')}
      emptyText={t('departureMessages.form.templateEmpty')}
      aria-label={t('departureMessages.form.template')}
    />
  );
}

interface RuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: FormState;
  tourId: string | null;
  onSaved: () => void;
}

function RuleDialog({ open, onOpenChange, initial, tourId, onSaved }: RuleDialogProps) {
  const t = useT();
  const [form, setForm] = React.useState<FormState>(initial);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(initial);
      setError(null);
    }
  }, [open, initial]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    if (!form.name.trim()) return setError(t('departureMessages.form.nameRequired'));
    if (!form.templateId) return setError(t('departureMessages.form.templateRequired'));
    setSaving(true);
    setError(null);
    try {
      const input = inputFrom(form, tourId);
      if (form.id) await departureMessagesApi.update(form.id, input);
      else await departureMessagesApi.create(input);
      toast.success(t('departureMessages.saved'));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(departureErrorText(err, t, 'departureMessages.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const channelOptions = (['preferred', 'whatsapp', 'email', 'sms'] as const).map((c) => ({ value: c, label: t(`departureMessages.channel.${c}`) }));
  const fallbackOptions = (['email', 'sms', 'whatsapp'] as const).map((c) => ({ value: c, label: t(`departureMessages.channel.${c}`) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="message-rule-dialog">
        <DialogHeader>
          <DialogTitle>{form.id ? t('departureMessages.dialog.editTitle') : t('departureMessages.dialog.addTitle')}</DialogTitle>
          <DialogDescription>{t('departureMessages.dialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[65vh] gap-ds-4 overflow-y-auto sm:grid-cols-2">
          <div className="space-y-ds-1 sm:col-span-2">
            <Label htmlFor="dm-name">{t('departureMessages.form.name')}</Label>
            <Input id="dm-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('departureMessages.form.namePlaceholder')} maxLength={120} />
          </div>

          <div className="space-y-ds-1 sm:col-span-2">
            <Label>{t('departureMessages.form.template')}</Label>
            <TemplateCombobox value={form.templateId} onChange={(id) => set('templateId', id)} />
            <p className="text-xs text-ds-foreground-muted">{t('departureMessages.form.templateHint')}</p>
          </div>

          <div className="space-y-ds-1">
            <Label htmlFor="dm-channel">{t('departureMessages.form.channel')}</Label>
            <SimpleSelect id="dm-channel" value={form.channel} onChange={(v) => set('channel', (v as RuleChannel) ?? 'preferred')} options={channelOptions} />
            <p className="text-xs text-ds-foreground-muted">{t('departureMessages.form.channelHint')}</p>
          </div>
          <div className="space-y-ds-1">
            <Label htmlFor="dm-fallback">{t('departureMessages.form.fallback')}</Label>
            <SimpleSelect
              id="dm-fallback"
              value={form.fallback}
              onChange={(v) => set('fallback', (v as FallbackChannel | null) ?? null)}
              options={fallbackOptions}
              noneLabel={t('departureMessages.form.fallbackNone')}
            />
          </div>

          <div className="space-y-ds-1">
            <Label htmlFor="dm-anchor">{t('departureMessages.form.anchor')}</Label>
            <SimpleSelect
              id="dm-anchor"
              value={form.anchor}
              onChange={(v) => set('anchor', (v as RuleAnchor) ?? 'start')}
              options={(['start', 'end', 'extras_cutoff'] as const).map((a) => ({ value: a, label: t(`departureMessages.anchor.${a}`) }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-ds-2">
            <div className="space-y-ds-1">
              <Label htmlFor="dm-days">{t('departureMessages.form.days')}</Label>
              <IntField id="dm-days" value={form.days} min={0} max={365} onChange={(v) => set('days', v)} />
            </div>
            <div className="space-y-ds-1">
              <Label htmlFor="dm-direction">{t('departureMessages.form.direction')}</Label>
              <SimpleSelect
                id="dm-direction"
                value={form.direction}
                onChange={(v) => set('direction', v === 'after' ? 'after' : 'before')}
                options={[
                  { value: 'before', label: t('departureMessages.direction.before') },
                  { value: 'after', label: t('departureMessages.direction.after') },
                ]}
              />
            </div>
            <div className="space-y-ds-1">
              <Label htmlFor="dm-time">{t('departureMessages.form.time')}</Label>
              <Input id="dm-time" type="time" value={form.time} onChange={(e) => set('time', e.target.value)} />
            </div>
          </div>

          <p className="rounded-ds-md bg-ds-surface-sunken px-ds-3 py-ds-2 text-sm sm:col-span-2" data-testid="rule-sentence">
            <span className="text-ds-foreground-muted">{t('departureMessages.form.sentence')}: </span>
            {whenText(t, form.anchor, offsetOf(form), form.time)}
          </p>

          <div className="space-y-ds-1">
            <Label htmlFor="dm-audience">{t('departureMessages.form.audience')}</Label>
            <SimpleSelect
              id="dm-audience"
              value={form.audience}
              onChange={(v) => set('audience', (v as RuleAudience) ?? 'confirmed')}
              options={(['confirmed', 'confirmed_and_held', 'waitlisted'] as const).map((a) => ({ value: a, label: t(`departureMessages.audience.${a}`) }))}
            />
          </div>
          <div className="space-y-ds-1">
            <Label htmlFor="dm-recipient">{t('departureMessages.form.recipient')}</Label>
            <SimpleSelect
              id="dm-recipient"
              value={form.recipient}
              onChange={(v) => set('recipient', (v as RuleRecipient) ?? 'booking_contact')}
              options={(['booking_contact', 'each_passenger_with_contact'] as const).map((r) => ({ value: r, label: t(`departureMessages.recipient.${r}`) }))}
            />
          </div>

          <div className="space-y-ds-1">
            <Label htmlFor="dm-purpose">{t('departureMessages.form.purpose')}</Label>
            <SimpleSelect
              id="dm-purpose"
              value={form.purpose}
              onChange={(v) => set('purpose', (v as RulePurpose) ?? 'service')}
              options={(['service', 'marketing'] as const).map((p) => ({ value: p, label: t(`departureMessages.purpose.${p}`) }))}
            />
            <p className="text-xs text-ds-foreground-muted">{t('departureMessages.form.purposeHint')}</p>
          </div>
          <div className="space-y-ds-1">
            <Label htmlFor="dm-mode">{t('departureMessages.form.mode')}</Label>
            <SimpleSelect
              id="dm-mode"
              value={form.mode}
              onChange={(v) => set('mode', (v as RuleMode) ?? 'suggest')}
              options={(['suggest', 'auto'] as const).map((m) => ({ value: m, label: t(`departureMessages.mode.${m}`) }))}
            />
            <p className="text-xs text-ds-foreground-muted">{t('departureMessages.form.modeHint')}</p>
          </div>

          <label className="flex items-center gap-ds-2 text-sm sm:col-span-2">
            <Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} aria-label={t('departureMessages.form.active')} />
            {t('departureMessages.form.active')}
          </label>

          {error && (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => void save()} disabled={saving} data-testid="message-rule-save">
            {saving && <Spinner className="size-4" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MessageRulesProps {
  /** Rules of one tour (on the tour page): the agency rules that apply are listed too and can be overridden. Without it, the agency rules. */
  tourId?: string;
  /** Opens the preview of this rule (and departure) at once, as the link of a suggestion does. */
  initialPreview?: { ruleId: string; departureId: string | null } | null;
  /** Renders without its own card, for a place that has one (the tour page tab). */
  bare?: boolean;
}

/** Settings > Group tours > Scheduled messages, and the same list per tour. */
export function MessageRules({ tourId, initialPreview, bare }: MessageRulesProps) {
  const t = useT();
  const canCreate = usePermission('departures', 'create');
  const canEdit = usePermission('departures', 'edit');
  const canDelete = usePermission('departures', 'delete');
  const canSend = usePermission('communications', 'create');
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [rules, setRules] = React.useState<MessageRule[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<FormState | null>(null);
  const [preview, setPreview] = React.useState<{ rule: MessageRule; departureId: string | null } | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setRules(await departureMessagesApi.list(tourId ? { tourId } : { scope: 'agency' }));
      setError(null);
    } catch (err) {
      setError(departureErrorText(err, t, 'departureMessages.loadFailed'));
    }
  }, [tourId, t]);

  React.useEffect(() => {
    void load();
    // Load again when the tour changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId]);

  const opened = React.useRef(false);
  React.useEffect(() => {
    if (opened.current || !initialPreview || !rules) return;
    const rule = rules.find((r) => r.id === initialPreview.ruleId);
    if (rule) {
      opened.current = true;
      setPreview({ rule, departureId: initialPreview.departureId });
    }
  }, [initialPreview, rules]);

  async function toggle(rule: MessageRule, isActive: boolean) {
    setBusyId(rule.id);
    try {
      await departureMessagesApi.update(rule.id, { isActive });
      await load();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departureMessages.saveFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(rule: MessageRule) {
    const ok = await confirm({
      title: t('departureMessages.delete.title'),
      description: t('departureMessages.delete.description', { name: rule.name }),
      tone: 'destructive',
      confirmLabel: t('departureMessages.delete.confirm'),
    });
    if (!ok) return;
    try {
      await departureMessagesApi.remove(rule.id);
      toast.success(t('departureMessages.deleted'));
      await load();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departureMessages.deleteFailed'));
    }
  }

  const add = canCreate && (
    <Button size="sm" onClick={() => setDialog(emptyForm())} data-testid="add-message-rule">
      <Plus aria-hidden="true" /> {t('departureMessages.add')}
    </Button>
  );

  const row = (rule: MessageRule, inherited: boolean) => (
    <li key={rule.id} className="grid gap-ds-2 px-ds-4 py-ds-3 sm:grid-cols-[1fr_auto]" data-testid="message-rule-row" data-rule-name={rule.name}>
      <div className="min-w-0 space-y-ds-1">
        <div className="flex flex-wrap items-center gap-ds-2">
          <p className="text-sm font-medium">{rule.name}</p>
          <Tag tone={rule.purpose === 'marketing' ? 'warning' : 'neutral'}>{t(`departureMessages.purpose.${rule.purpose}`)}</Tag>
          <Tag tone={rule.mode === 'auto' ? 'info' : 'neutral'}>{t(`departureMessages.mode.${rule.mode}`)}</Tag>
          {!rule.isActive && <Tag tone="neutral">{t('departureMessages.inactive')}</Tag>}
        </div>
        <p className="text-sm text-ds-foreground-muted" data-testid="rule-when">{whenText(t, rule.anchor, rule.offsetDays, rule.localTime)}</p>
        <p className="text-xs text-ds-foreground-muted">
          {rule.templateName ?? t('departureMessages.noTemplate')} · {t(`departureMessages.audience.${rule.audience}`)} · {t(`departureMessages.recipient.${rule.recipient}`)}
        </p>
      </div>
      <div className="flex items-center gap-ds-2 sm:justify-end">
        <Switch
          checked={rule.isActive}
          disabled={!canEdit || busyId === rule.id || (!!tourId && inherited)}
          onCheckedChange={(v) => void toggle(rule, v)}
          aria-label={t('departureMessages.activeToggle', { name: rule.name })}
          data-testid="rule-active"
        />
        <Button variant="ghost" size="icon-sm" aria-label={`${t('departureMessages.actions.preview')}: ${rule.name}`} onClick={() => setPreview({ rule, departureId: null })} data-testid="rule-preview">
          <Eye aria-hidden="true" />
        </Button>
        {canEdit && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${t('departureMessages.actions.edit')}: ${rule.name}`}
            onClick={() => setDialog(formFromRule(rule, !(tourId && inherited)))}
            data-testid="rule-edit"
          >
            <Pencil aria-hidden="true" />
          </Button>
        )}
        {canDelete && !(tourId && inherited) && (
          <Button variant="ghost" size="icon-sm" aria-label={`${t('departureMessages.actions.delete')}: ${rule.name}`} onClick={() => void remove(rule)} data-testid="rule-delete">
            <Trash2 aria-hidden="true" />
          </Button>
        )}
      </div>
    </li>
  );

  let body: React.ReactNode;
  if (error) {
    body = (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  } else if (!rules) {
    body = <Skeleton className="h-24 w-full" />;
  } else {
    const own = tourId ? rules.filter((r) => r.tourId === tourId) : rules;
    const inherited = tourId ? rules.filter((r) => !r.tourId) : [];
    body = (
      <div className="space-y-ds-4">
        {own.length === 0 && inherited.length === 0 ? (
          <EmptyState title={t('departureMessages.empty.title')} description={t('departureMessages.empty.description')} action={add || undefined} />
        ) : (
          <>
            {own.length > 0 && <ul className="divide-y divide-ds-border rounded-ds-md border border-ds-border" data-testid="message-rules">{own.map((r) => row(r, false))}</ul>}
            {inherited.length > 0 && (
              <div className="space-y-ds-2">
                <p className="text-xs font-medium text-ds-foreground-muted">{t('departureMessages.section.agencyRules')}</p>
                <ul className="divide-y divide-ds-border rounded-ds-md border border-ds-border" data-testid="agency-message-rules">{inherited.map((r) => row(r, true))}</ul>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {bare ? (
        <div className="space-y-ds-3" data-testid="scheduled-messages">
          <div className="flex items-start justify-between gap-ds-4 px-ds-4 pt-ds-4">
            <p className="text-sm text-ds-foreground-muted">{t('departureMessages.section.tourDescription')}</p>
            {rules && rules.length > 0 && add}
          </div>
          <div className="px-ds-4 pb-ds-4">{body}</div>
        </div>
      ) : (
        <div data-testid="scheduled-messages">
          <SectionCard
            title={t('departureMessages.section.title')}
            description={t('departureMessages.section.description')}
            actions={rules && rules.length > 0 ? add || undefined : undefined}
          >
            {body}
          </SectionCard>
        </div>
      )}

      {dialog && (
        <RuleDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          initial={dialog}
          tourId={tourId ?? null}
          onSaved={() => void load()}
        />
      )}
      {preview && (
        <MessagePreview
          open
          onOpenChange={(o) => !o && setPreview(null)}
          ruleId={preview.rule.id}
          ruleName={preview.rule.name}
          departureId={preview.departureId}
          canSend={canSend}
          onSent={() => void load()}
        />
      )}
      {confirmDialog}
    </>
  );
}
