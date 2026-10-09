'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Sparkles, ArrowUpRight, Undo2, Play, Lock, UserPlus, Map as MapIcon, MessageSquare, Search, Lightbulb, Target,
  ScanText, BellRing, BarChart3, Bot, ScanSearch, Plus, Pencil, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApiQuery } from '@/hooks/use-api';
import { usePermissions } from '@/hooks/use-permission';
import { useSuggestions } from '@/hooks/use-suggestions';
import { useRealtimeEvent } from '@/hooks/use-realtime-event';
import { aiApi } from '@/lib/api/ai';
import {
  assistantApi, automationsApi,
  type AutomationActivity, type AutomationMode, type AutomationRecipe, type CustomRule,
} from '@/lib/api/assistant';
import { SuggestionCard } from '@/components/domain/assistant/suggestion-card';
import { suggestionHref } from '@/components/domain/assistant/suggestion-target';
import { RuleBuilderDialog } from '@/components/domain/assistant/rule-builder-dialog';
import { useConfirm } from '@/components/ui/confirm-dialog';

const TABS = ['queue', 'activity', 'automations', 'tools', 'usage'] as const;
type TabKey = (typeof TABS)[number];

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ── Queue ────────────────────────────────────────────────────

function QueueTab() {
  const { suggestions, loading, refresh } = useSuggestions({ status: 'pending', limit: 100 });

  if (loading) return <div className="flex flex-col gap-ds-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>;
  if (suggestions.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="size-8" aria-hidden="true" />}
        title="Nothing is waiting"
        description="When a message arrives or a booking moves on, the assistant lists what it suggests here and on the record itself."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-ds-4 xl:grid-cols-2" data-testid="assistant-queue">
      {suggestions.map((s) => (
        <div key={s.id} className="flex flex-col gap-ds-1">
          <Link href={suggestionHref(s)} className="inline-flex w-fit items-center gap-ds-1 text-xs font-medium text-ds-foreground-muted hover:text-ds-primary">
            {s.ruleTitle}
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
          <SuggestionCard suggestion={s} onChanged={() => void refresh()} />
        </div>
      ))}
    </div>
  );
}

// ── Activity ─────────────────────────────────────────────────

const OUTCOME_TONE: Record<string, 'success' | 'info' | 'danger' | 'neutral'> = {
  applied: 'success',
  suggested: 'info',
  failed: 'danger',
  undone: 'neutral',
};
const OUTCOME_LABEL: Record<string, string> = { applied: 'Done', suggested: 'Suggested', failed: 'Failed', undone: 'Undone' };

function ActivityTab() {
  const { data, loading, refetch } = useApiQuery(() => assistantApi.activity(100), []);
  const rows: AutomationActivity[] = data?.data ?? [];
  const [undoing, setUndoing] = React.useState<string | null>(null);
  useRealtimeEvent('assistant:suggestion', () => { void refetch({ silent: true }); });

  const undo = async (row: AutomationActivity) => {
    if (!row.suggestionId) return;
    setUndoing(row.id);
    try {
      await assistantApi.undo(row.suggestionId);
      toast.success('Undone');
      await refetch({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not undo'));
    } finally {
      setUndoing(null);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (rows.length === 0) {
    return <EmptyState title="No activity yet" description="Everything an automation suggests or does is recorded here." />;
  }

  return (
    <SectionCard title="What the automations did" description="Newest first. Anything done automatically can be undone here." flush>
      <ul className="flex flex-col divide-y divide-ds-border" data-testid="assistant-activity">
        {rows.map((row) => {
          const target = row.leadId ? `/leads/${row.leadId}` : row.entityType && row.entityId ? suggestionHref({ entityType: row.entityType, entityId: row.entityId, leadId: row.leadId, contactId: row.contactId }) : null;
          return (
            <li key={row.id} className="flex items-center gap-ds-4 px-ds-4 py-ds-3">
              <Tag tone={OUTCOME_TONE[row.outcome] ?? 'neutral'} size="sm" className="w-20 shrink-0 justify-center">
                {OUTCOME_LABEL[row.outcome] ?? row.outcome}
              </Tag>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-ds-foreground">{row.detail ?? row.ruleTitle}</span>
                <span className="truncate text-xs text-ds-foreground-muted">{row.ruleTitle}</span>
              </div>
              <span className="shrink-0 text-xs text-ds-foreground-subtle">{when(row.createdAt)}</span>
              {target && (
                <Link href={target} className="shrink-0 text-xs font-medium text-ds-primary hover:underline">Open</Link>
              )}
              {row.canUndo && (
                <Button size="sm" variant="ghost" className="shrink-0 gap-ds-1" disabled={undoing !== null} onClick={() => undo(row)}>
                  <Undo2 className="size-3.5" aria-hidden="true" />
                  Undo
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

// ── Automations ──────────────────────────────────────────────

const MODE_LABELS: Record<AutomationMode, string> = { off: 'Off', suggest: 'Suggest', auto: 'Automatic' };

function RecipeRow({ recipe, canEdit, canAutomate, onSaved }: { recipe: AutomationRecipe; canEdit: boolean; canAutomate: boolean; onSaved: () => void }) {
  const [saving, setSaving] = React.useState(false);
  const [values, setValues] = React.useState<Record<string, string>>(() => Object.fromEntries(recipe.settings.map((s) => [s.key, String(s.value)])));

  const save = async (change: { mode?: AutomationMode; settings?: Record<string, number> }) => {
    setSaving(true);
    try {
      await automationsApi.update(recipe.key, change);
      toast.success(change.mode ? `${recipe.title}: ${MODE_LABELS[change.mode].toLowerCase()}` : 'Saved');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save'));
      setValues(Object.fromEntries(recipe.settings.map((s) => [s.key, String(s.value)])));
    } finally {
      setSaving(false);
    }
  };

  const disabled = !canEdit || recipe.locked || saving;

  return (
    <li className="flex flex-col gap-ds-3 px-ds-4 py-ds-4 md:flex-row md:items-start" data-recipe={recipe.key}>
      <div className="flex min-w-0 flex-1 flex-col gap-ds-1">
        <div className="flex flex-wrap items-center gap-ds-2">
          <span className="text-sm font-semibold text-ds-foreground">{recipe.title}</span>
          {recipe.usesAi && <Tag tone="primary" size="sm">Uses AI credits</Tag>}
          {!recipe.autoEligible && <Tag tone="neutral" size="sm">Always asks first</Tag>}
          {recipe.locked && (
            <Tag tone="warning" size="sm">
              <span className="flex items-center gap-ds-1"><Lock className="size-3" aria-hidden="true" />Not in your plan</span>
            </Tag>
          )}
        </div>
        <p className="text-sm text-ds-foreground-muted">{recipe.description}</p>
        <p className="text-xs text-ds-foreground-subtle">
          Last 30 days: {recipe.last30Days.applied} done, {recipe.last30Days.suggested} suggested{recipe.last30Days.failed > 0 ? `, ${recipe.last30Days.failed} failed` : ''}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-ds-3">
        {recipe.settings.map((field) => (
          <label key={field.key} className="flex items-center gap-ds-2 text-sm text-ds-foreground-muted">
            {field.label}
            <Input
              aria-label={`${recipe.title}: ${field.label}`}
              inputMode="numeric"
              className="h-9 w-16 text-right"
              disabled={disabled}
              value={values[field.key] ?? ''}
              onChange={(e) => setValues({ ...values, [field.key]: e.target.value.replace(/\D/g, '') })}
              onBlur={() => {
                const next = Number(values[field.key]);
                if (Number.isFinite(next) && next !== field.value) void save({ settings: { [field.key]: next } });
              }}
            />
            {field.unit}
          </label>
        ))}
        <Select value={recipe.mode} onValueChange={(mode) => void save({ mode: mode as AutomationMode })} disabled={disabled}>
          <SelectTrigger className="h-9 w-36" aria-label={`${recipe.title}: mode`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
            <SelectItem value="suggest">Suggest</SelectItem>
            {recipe.autoEligible && (canAutomate || recipe.mode === 'auto') && <SelectItem value="auto">Automatic</SelectItem>}
          </SelectContent>
        </Select>
      </div>
    </li>
  );
}

function CustomRuleRow({ rule, canManage, onEdit, onDelete }: { rule: CustomRule; canManage: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <li className="flex flex-col gap-ds-3 px-ds-4 py-ds-4 md:flex-row md:items-start" data-rule={rule.name}>
      <div className="flex min-w-0 flex-1 flex-col gap-ds-1">
        <div className="flex flex-wrap items-center gap-ds-2">
          <span className="text-sm font-semibold text-ds-foreground">{rule.name}</span>
          <Tag tone={rule.mode === 'off' ? 'neutral' : rule.mode === 'auto' ? 'success' : 'info'} size="sm">{MODE_LABELS[rule.mode]}</Tag>
          {!rule.autoEligible && <Tag tone="neutral" size="sm">Always asks first</Tag>}
        </div>
        <p className="text-sm text-ds-foreground-muted">{rule.description}</p>
        <p className="text-xs text-ds-foreground-subtle">
          Last 30 days: {rule.last30Days.applied} done, {rule.last30Days.suggested} suggested{rule.last30Days.failed > 0 ? `, ${rule.last30Days.failed} failed` : ''}
        </p>
      </div>
      {canManage && (
        <div className="flex shrink-0 items-center gap-ds-2">
          <Button size="sm" variant="outline" className="gap-ds-1" onClick={onEdit} aria-label={`Change rule ${rule.name}`}>
            <Pencil className="size-3.5" aria-hidden="true" />
            Change
          </Button>
          <Button size="sm" variant="ghost" className="gap-ds-1" onClick={onDelete} aria-label={`Delete rule ${rule.name}`}>
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete
          </Button>
        </div>
      )}
    </li>
  );
}

function AutomationsTab() {
  const { can, loaded } = usePermissions();
  const { data, loading, error, refetch } = useApiQuery(() => automationsApi.library(), []);
  const [running, setRunning] = React.useState(false);
  const [builder, setBuilder] = React.useState<{ open: boolean; rule: CustomRule | null }>({ open: false, rule: null });
  const { confirm, dialog: confirmDialog } = useConfirm();
  const library = data?.data;

  if (loading || !loaded) return <Skeleton className="h-64 w-full" />;
  if (error || !library) {
    return <EmptyState icon={<Lock className="size-8" aria-hidden="true" />} title="Automations are managed by your administrator" description="Ask an administrator or sales manager to change what runs automatically." />;
  }

  const canEdit = can('automations', 'edit');
  const canAutomate = can('automations', 'create');
  const areas = [...new Set(library.recipes.map((r) => r.area))];

  const togglePause = async (paused: boolean) => {
    try {
      await automationsApi.setPaused(paused);
      toast.success(paused ? 'All automations paused' : 'Automations resumed');
      await refetch({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change this'));
    }
  };

  const deleteRule = async (rule: CustomRule) => {
    const ok = await confirm({
      title: `Delete "${rule.name}"?`,
      description: 'The rule stops running. Anything it already suggested or did stays as it is.',
      confirmLabel: 'Delete rule',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await automationsApi.deleteRule(rule.id);
      toast.success('Rule deleted');
      await refetch({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the rule'));
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      await automationsApi.runScheduled();
      toast.success('Daily checks ran');
      await refetch({ silent: true });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not run the daily checks'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex flex-wrap items-center justify-between gap-ds-3 rounded-ds-lg border border-ds-border bg-ds-surface-sunken px-ds-4 py-ds-3">
        <p className="text-sm text-ds-foreground-muted">
          <span className="font-medium text-ds-foreground">Off</span> does nothing. <span className="font-medium text-ds-foreground">Suggest</span> shows a one-click card on the record.{' '}
          <span className="font-medium text-ds-foreground">Automatic</span> does it straight away and is only offered for low-risk steps. Sending messages, money and creating leads always need a click.
          {!library.aiIncluded && ' AI reading of messages is not in your plan; rule-based automations all work.'}
        </p>
        {canAutomate && (
          <div className="flex shrink-0 items-center gap-ds-4">
            <label className="flex items-center gap-ds-2 text-sm text-ds-foreground">
              <Switch checked={library.paused} onCheckedChange={(checked) => void togglePause(checked)} aria-label="Pause all automations" />
              Pause all
            </label>
            <Button size="sm" variant="outline" onClick={runNow} disabled={running || library.paused} className="gap-ds-2">
              <Play className="size-3.5" aria-hidden="true" />
              Run daily checks now
            </Button>
          </div>
        )}
      </div>

      {library.paused && (
        <p className="rounded-ds-lg border border-ds-warning bg-ds-warning-subtle px-ds-4 py-ds-3 text-sm text-ds-warning-on-subtle">
          Automations are paused for the whole workspace. Nothing is suggested or done automatically until they are resumed.
        </p>
      )}

      <SectionCard
        title="Your rules"
        description="Rules you build yourself: when something happens, and your conditions hold, do these steps."
        actions={
          canAutomate && library.customRules.length < library.builder.maxRules ? (
            <Button size="sm" className="gap-ds-1" onClick={() => setBuilder({ open: true, rule: null })}>
              <Plus className="size-3.5" aria-hidden="true" />
              New rule
            </Button>
          ) : undefined
        }
        flush
      >
        {library.customRules.length === 0 ? (
          <p className="px-ds-4 py-ds-4 text-sm text-ds-foreground-muted">
            {canAutomate
              ? 'No rules of your own yet. For example: when a honeymoon lead with a budget over 2,00,000 is created, create a task for a senior consultant to call.'
              : 'No rules of your own yet. An administrator can add them.'}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-ds-border" data-testid="custom-rules">
            {library.customRules.map((rule) => (
              <CustomRuleRow key={rule.id} rule={rule} canManage={canAutomate} onEdit={() => setBuilder({ open: true, rule })} onDelete={() => void deleteRule(rule)} />
            ))}
          </ul>
        )}
      </SectionCard>

      <RuleBuilderDialog
        open={builder.open}
        onOpenChange={(open) => setBuilder((current) => ({ ...current, open }))}
        options={library.builder}
        rule={builder.rule}
        canAutomate={canAutomate}
        onSaved={() => void refetch({ silent: true })}
      />
      {confirmDialog}

      {areas.map((area) => (
        <SectionCard key={area} title={area} flush>
          <ul className="flex flex-col divide-y divide-ds-border">
            {library.recipes.filter((r) => r.area === area).map((recipe) => (
              <RecipeRow key={`${recipe.key}:${recipe.mode}:${recipe.settings.map((s) => s.value).join(',')}`} recipe={recipe} canEdit={canEdit} canAutomate={canAutomate} onSaved={() => void refetch({ silent: true })} />
            ))}
          </ul>
        </SectionCard>
      ))}
    </div>
  );
}

// ── Tools ────────────────────────────────────────────────────

const TOOLS: ReadonlyArray<{ title: string; description: string; icon: LucideIcon; href: string }> = [
  { title: 'Lead extraction', description: 'Paste any text and pull out a lead', icon: UserPlus, href: '/ai/lead-creation' },
  { title: 'Itinerary generator', description: 'Draft a day-by-day plan', icon: MapIcon, href: '/ai/itinerary' },
  { title: 'Message composer', description: 'Draft email, SMS and WhatsApp messages', icon: MessageSquare, href: '/ai/compose' },
  { title: 'Ask your data', description: 'Questions about the CRM in plain English', icon: Search, href: '/ai/search' },
  { title: 'Insights', description: 'Trends and recommendations', icon: Lightbulb, href: '/ai/insights' },
  { title: 'Lead scoring', description: 'Scores with the reasons behind them', icon: Target, href: '/ai/lead-score' },
  { title: 'Document scanning', description: 'Passports, visas and supplier invoices', icon: ScanText, href: '/ai/ocr' },
  { title: 'Document scans', description: 'Review scanned documents', icon: ScanSearch, href: '/ai/document-scans' },
  { title: 'Call extractions', description: 'Leads and tasks found in call transcripts', icon: ScanSearch, href: '/ai/extractions' },
  { title: 'Smart follow-ups', description: 'Suggested timing and wording', icon: BellRing, href: '/ai/smart-followups' },
  { title: 'Business intelligence', description: 'Briefings, health score and forecasts', icon: BarChart3, href: '/ai/bi' },
  { title: 'Chatbot', description: 'Website and WhatsApp chatbot conversations', icon: Bot, href: '/chatbot' },
];

function ToolsTab() {
  return (
    <div className="grid grid-cols-1 gap-ds-3 md:grid-cols-2 xl:grid-cols-3">
      {TOOLS.map((tool) => (
        <Link key={tool.href} href={tool.href} className="flex items-start gap-ds-3 rounded-ds-lg border border-ds-border bg-ds-surface p-ds-4 transition-colors hover:border-ds-primary">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-ds-md bg-ds-primary-subtle text-ds-primary-on-subtle">
            <tool.icon className="size-4" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold text-ds-foreground">{tool.title}</span>
            <span className="text-sm text-ds-foreground-muted">{tool.description}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

// ── Usage ────────────────────────────────────────────────────

const CREDIT_CLASSES = [
  { name: 'Read a message', credits: 1 },
  { name: 'Understand and draft a reply', credits: 5 },
  { name: 'Scan a document', credits: 15 },
  { name: 'Write an itinerary or briefing', credits: 60 },
];

function UsageTab() {
  const { data, loading } = useApiQuery(() => aiApi.settings.getUsage(), []);
  const credits = data?.data?.quotas?.find((q) => q.key === 'ai_credits_per_month');

  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="grid grid-cols-1 gap-ds-4 lg:grid-cols-2">
      <SectionCard title="AI credits this month" description="Rule-based automations never use credits. When credits run out, they keep working and only AI reading pauses.">
        {credits ? (
          <div className="flex flex-col gap-ds-3" data-testid="credit-usage">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold text-ds-foreground">{credits.remaining.toLocaleString('en-IN')}</span>
              <span className="text-sm text-ds-foreground-muted">left of {credits.limit.toLocaleString('en-IN')}</span>
            </div>
            <Progress value={Math.min(100, credits.percentUsed)} />
            <p className="text-xs text-ds-foreground-muted">{credits.used.toLocaleString('en-IN')} used. Resets monthly.</p>
          </div>
        ) : (
          <p className="text-sm text-ds-foreground-muted">Usage appears here once the assistant has read its first message.</p>
        )}
      </SectionCard>
      <SectionCard title="What uses credits">
        <ul className="flex flex-col divide-y divide-ds-border text-sm">
          {CREDIT_CLASSES.map((row) => (
            <li key={row.name} className="flex items-center justify-between py-ds-2">
              <span className="text-ds-foreground">{row.name}</span>
              <span className="text-ds-foreground-muted">{row.credits} credit{row.credits === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────

function AssistantPageContent() {
  const router = useRouter();
  const search = useSearchParams();
  const requested = search.get('tab') as TabKey | null;
  const tab: TabKey = requested && TABS.includes(requested) ? requested : 'queue';

  return (
    <PageContainer>
      <PageHeader
        title="Assistant"
        description="What the assistant suggests, what your automations did, and how they are set up."
      />
      <Tabs value={tab} onValueChange={(next) => router.replace(next === 'queue' ? '/assistant' : `/assistant?tab=${next}`)}>
        <TabsList>
          <TabsTrigger value="queue">Suggestions</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
          <TabsTrigger value="tools">AI tools</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="mt-ds-4"><QueueTab /></TabsContent>
        <TabsContent value="activity" className="mt-ds-4"><ActivityTab /></TabsContent>
        <TabsContent value="automations" className="mt-ds-4"><AutomationsTab /></TabsContent>
        <TabsContent value="tools" className="mt-ds-4"><ToolsTab /></TabsContent>
        <TabsContent value="usage" className="mt-ds-4"><UsageTab /></TabsContent>
      </Tabs>
    </PageContainer>
  );
}

export default function AssistantPage() {
  return (
    <React.Suspense fallback={null}>
      <AssistantPageContent />
    </React.Suspense>
  );
}
