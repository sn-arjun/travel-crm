'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sparkles, Check, X, Undo2, Pencil, Loader2, ArrowUpRight } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tag } from '@/components/ui/tag';
import { cn } from '@/lib/utils';
import { assistantApi, type Suggestion, type SuggestionEntity } from '@/lib/api/assistant';
import { contactsApi } from '@/lib/api/contacts';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';

const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  lead: (id) => `/leads/${id}`,
  contact: (id) => `/contacts/${id}`,
  itinerary: (id) => `/itineraries/${id}`,
  invoice: (id) => `/invoices/${id}`,
  voucher: (id) => `/vouchers/${id}`,
  task: () => '/tasks',
  follow_up: () => '/follow-ups',
  payment: () => '/payments',
};

const ENTITY_LABELS: Record<string, string> = {
  lead: 'Lead',
  contact: 'Contact',
  itinerary: 'Itinerary',
  invoice: 'Invoice',
  voucher: 'Voucher',
  task: 'Task',
  follow_up: 'Follow-up',
  payment: 'Payment',
};

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}

function formatDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMoney(value: unknown): string | null {
  return typeof value === 'number' && value > 0 ? `₹${Math.round(value).toLocaleString('en-IN')}` : null;
}

/** The facts a person should check before clicking, per kind of action. */
function describe(suggestion: Suggestion): Array<{ label: string; value: string }> {
  const p = suggestion.params;
  const rows: Array<{ label: string; value: string | null }> = [];
  switch (suggestion.action.type) {
    case 'create_lead_from_enquiry': {
      const adults = typeof p.paxAdults === 'number' ? p.paxAdults : 1;
      const children = typeof p.paxChildren === 'number' ? p.paxChildren : 0;
      const travel = formatDate(p.travelDate);
      const back = formatDate(p.returnDate);
      rows.push(
        { label: 'Lead', value: typeof p.title === 'string' ? p.title : null },
        { label: 'Contact', value: [p.name, p.phone ?? p.email].filter((v) => typeof v === 'string' && v).join(' · ') || null },
        { label: 'Destinations', value: Array.isArray(p.destinations) && p.destinations.length > 0 ? p.destinations.join(', ') : null },
        { label: 'Travel', value: travel ? (back ? `${travel} to ${back}` : travel) : null },
        { label: 'Travellers', value: `${adults} adult${adults === 1 ? '' : 's'}${children ? ` + ${children} child${children === 1 ? '' : 'ren'}` : ''}` },
        { label: 'Budget', value: formatMoney(p.budget) },
        { label: 'Notes', value: typeof p.specialRequirements === 'string' ? p.specialRequirements : null },
      );
      break;
    }
    case 'update_lead': {
      const changes = (p.changes ?? {}) as Record<string, unknown>;
      rows.push(
        { label: 'Destinations', value: Array.isArray(changes.destinations) ? changes.destinations.join(', ') : null },
        { label: 'Travel date', value: formatDate(changes.travelDate) },
        { label: 'Return date', value: formatDate(changes.returnDate) },
        { label: 'Adults', value: typeof changes.paxAdults === 'number' ? String(changes.paxAdults) : null },
        { label: 'Children', value: typeof changes.paxChildren === 'number' ? String(changes.paxChildren) : null },
        { label: 'Budget', value: formatMoney(changes.budget) },
      );
      break;
    }
    case 'record_payment':
      rows.push(
        { label: 'Amount', value: formatMoney(p.amount) },
        { label: 'Reference', value: typeof p.reference === 'string' ? p.reference : null },
        { label: 'Method', value: p.method === 'transfer' ? 'Bank transfer' : typeof p.method === 'string' ? p.method : null },
      );
      break;
    case 'create_vouchers':
      for (const voucher of (Array.isArray(p.vouchers) ? p.vouchers : []) as Array<{ details?: Record<string, unknown> }>) {
        const d = voucher.details ?? {};
        rows.push({ label: String(d.hotelName ?? 'Voucher'), value: [formatDate(d.checkIn), formatDate(d.checkOut)].filter(Boolean).join(' to ') || null });
      }
      break;
    case 'create_follow_up':
      rows.push({
        label: 'When',
        value: typeof p.scheduledAt === 'string' ? new Date(p.scheduledAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null,
      });
      break;
    case 'create_task':
      rows.push({ label: 'Due', value: formatDate(p.dueDate) });
      break;
    case 'draft_reply':
      rows.push({ label: 'Message', value: typeof p.body === 'string' ? p.body : null });
      break;
    case 'open_prefilled_form':
      for (const row of (Array.isArray(p.details) ? p.details : []) as Array<{ label?: unknown; value?: unknown }>) {
        if (typeof row.label === 'string' && typeof row.value === 'string') rows.push({ label: row.label, value: row.value });
      }
      break;
    default:
      break;
  }
  return rows.filter((r): r is { label: string; value: string } => !!r.value);
}

function EntityLinks({ entities }: { entities: SuggestionEntity[] }) {
  const links = entities.filter((e) => ENTITY_ROUTES[e.type]);
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-ds-2">
      {links.map((entity) => (
        <Link
          key={`${entity.type}-${entity.id}`}
          href={ENTITY_ROUTES[entity.type]!(entity.id)}
          className="inline-flex items-center gap-ds-1 rounded-ds-md border border-ds-border px-ds-2 py-0.5 text-xs font-medium text-ds-primary hover:bg-ds-surface-sunken"
        >
          {entity.label ? `${ENTITY_LABELS[entity.type] ?? entity.type}: ${entity.label}` : `Open ${(ENTITY_LABELS[entity.type] ?? entity.type).toLowerCase()}`}
          <ArrowUpRight className="size-3" aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

interface LeadDraft {
  title: string;
  travelDate: string;
  paxAdults: string;
  paxChildren: string;
  budget: string;
}

export interface SuggestionCardProps {
  suggestion: Suggestion;
  /** Called after the suggestion was applied, dismissed or undone. */
  onChanged?: () => void;
  className?: string;
}

/**
 * One proposal from the assistant: what it wants to do, why, the values it will use,
 * and a single button to do it. Applied suggestions show what was created and can be undone.
 */
export function SuggestionCard({ suggestion, onChanged, className }: SuggestionCardProps) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<'apply' | 'dismiss' | 'undo' | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<LeadDraft | null>(null);
  const [reply, setReply] = React.useState<{ id: string; name: string; email?: string | null; phone?: string | null } | null>(null);

  const p = suggestion.params;
  const isPending = suggestion.status === 'pending';
  const isDone = suggestion.status === 'applied' || suggestion.status === 'auto_applied';
  const isLead = suggestion.action.type === 'create_lead_from_enquiry';
  const isForm = suggestion.action.type === 'open_prefilled_form';
  const details = describe(suggestion);

  const startEditing = () => {
    setDraft({
      title: typeof p.title === 'string' ? p.title : '',
      travelDate: typeof p.travelDate === 'string' ? p.travelDate.slice(0, 10) : '',
      paxAdults: String(typeof p.paxAdults === 'number' ? p.paxAdults : 1),
      paxChildren: String(typeof p.paxChildren === 'number' ? p.paxChildren : 0),
      budget: typeof p.budget === 'number' ? String(p.budget) : '',
    });
    setEditing(true);
  };

  const overrides = (): Record<string, unknown> | undefined => {
    if (!editing || !draft) return undefined;
    const budget = Number(draft.budget);
    return {
      title: draft.title.trim() || p.title,
      travelDate: draft.travelDate || null,
      paxAdults: Math.max(1, Number(draft.paxAdults) || 1),
      paxChildren: Math.max(0, Number(draft.paxChildren) || 0),
      budget: Number.isFinite(budget) && budget > 0 ? budget : null,
    };
  };

  const apply = async () => {
    setBusy('apply');
    try {
      const res = await assistantApi.apply(suggestion.id, overrides());
      toast.success(res.data?.result?.summary ?? 'Done');
      setEditing(false);
      onChanged?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not do that'));
      onChanged?.();
    } finally {
      setBusy(null);
    }
  };

  // A drafted message is never sent from here: it opens in the Communication Hub dialog to be read first.
  const openReply = async () => {
    setBusy('apply');
    try {
      const res = await contactsApi.getById(String(p.contactId));
      const contact = res.data;
      if (!contact) throw new Error('Contact not found');
      setReply({ id: contact.id, name: contact.name, email: contact.email, phone: contact.phone });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not open the message'));
    } finally {
      setBusy(null);
    }
  };

  // The form does the work; opening it is what "handles" the suggestion.
  const openForm = async () => {
    // In-app paths only; "//host" would be another site.
    const href = typeof p.href === 'string' && p.href.startsWith('/') && !p.href.startsWith('//') ? p.href : null;
    if (!href) return;
    setBusy('apply');
    try {
      await assistantApi.apply(suggestion.id);
    } catch {
      // Opening the form still helps even if the suggestion could not be marked as used.
    } finally {
      setBusy(null);
    }
    onChanged?.();
    router.push(href);
  };

  const dismiss = async () => {
    setBusy('dismiss');
    try {
      await assistantApi.dismiss(suggestion.id);
      onChanged?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not dismiss'));
    } finally {
      setBusy(null);
    }
  };

  const undo = async () => {
    setBusy('undo');
    try {
      await assistantApi.undo(suggestion.id);
      toast.success('Undone');
      onChanged?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not undo'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      data-testid="assistant-suggestion"
      data-action={suggestion.action.type}
      data-status={suggestion.status}
      className={cn(
        'flex flex-col gap-ds-3 rounded-ds-lg border p-ds-4',
        isPending ? 'border-ds-primary/40 bg-ds-primary-subtle/40' : 'border-ds-border bg-ds-surface',
        className,
      )}
    >
      <div className="flex items-start gap-ds-3">
        <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-ds-md', isDone ? 'bg-ds-success-subtle text-ds-success-on-subtle' : 'bg-ds-primary text-ds-primary-foreground')}>
          {isDone ? <Check className="size-4" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-ds-1">
          <div className="flex flex-wrap items-center gap-ds-2">
            <p className="text-sm font-semibold text-ds-foreground">{suggestion.title}</p>
            {suggestion.status === 'auto_applied' && <Tag tone="success" size="sm">Done automatically</Tag>}
            {suggestion.status === 'applied' && <Tag tone="success" size="sm">Done</Tag>}
            {isPending && suggestion.origin === 'ai' && <Tag tone="primary" size="sm">AI</Tag>}
          </div>
          {suggestion.reason && <p className="text-sm text-ds-foreground-muted">{isDone && suggestion.result?.summary ? suggestion.result.summary : suggestion.reason}</p>}
        </div>
      </div>

      {isPending && !editing && details.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-ds-4 gap-y-ds-1 text-sm">
          {details.map((row) => (
            <React.Fragment key={row.label}>
              <dt className="text-ds-foreground-muted">{row.label}</dt>
              <dd className="whitespace-pre-wrap text-ds-foreground">{row.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}

      {isPending && editing && draft && (
        <div className="grid grid-cols-2 gap-ds-3">
          <div className="col-span-2 flex flex-col gap-ds-1">
            <Label htmlFor={`${suggestion.id}-title`}>Lead title</Label>
            <Input id={`${suggestion.id}-title`} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="flex flex-col gap-ds-1">
            <Label htmlFor={`${suggestion.id}-date`}>Travel date</Label>
            <Input id={`${suggestion.id}-date`} type="date" value={draft.travelDate} onChange={(e) => setDraft({ ...draft, travelDate: e.target.value })} />
          </div>
          <div className="flex flex-col gap-ds-1">
            <Label htmlFor={`${suggestion.id}-budget`}>Budget (₹)</Label>
            <Input id={`${suggestion.id}-budget`} inputMode="numeric" value={draft.budget} onChange={(e) => setDraft({ ...draft, budget: e.target.value.replace(/[^\d.]/g, '') })} />
          </div>
          <div className="flex flex-col gap-ds-1">
            <Label htmlFor={`${suggestion.id}-adults`}>Adults</Label>
            <Input id={`${suggestion.id}-adults`} inputMode="numeric" value={draft.paxAdults} onChange={(e) => setDraft({ ...draft, paxAdults: e.target.value.replace(/\D/g, '') })} />
          </div>
          <div className="flex flex-col gap-ds-1">
            <Label htmlFor={`${suggestion.id}-children`}>Children</Label>
            <Input id={`${suggestion.id}-children`} inputMode="numeric" value={draft.paxChildren} onChange={(e) => setDraft({ ...draft, paxChildren: e.target.value.replace(/\D/g, '') })} />
          </div>
        </div>
      )}

      {isPending && suggestion.error && (
        <p className="text-xs text-ds-danger">Last attempt failed: {suggestion.error}</p>
      )}

      {isDone && suggestion.result && <EntityLinks entities={suggestion.result.entities} />}

      {isPending && (
        <div className="flex flex-wrap items-center gap-ds-2">
          {suggestion.canApply ? (
            <>
              <Button size="sm" onClick={isForm ? openForm : suggestion.action.clientHandled ? openReply : apply} disabled={busy !== null} className="gap-ds-2">
                {busy === 'apply' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                {isForm && typeof p.buttonLabel === 'string' ? p.buttonLabel : suggestion.action.label}
              </Button>
              {isLead && !editing && (
                <Button size="sm" variant="outline" onClick={startEditing} disabled={busy !== null} className="gap-ds-2">
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit first
                </Button>
              )}
              {editing && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy !== null}>
                  Cancel edit
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={dismiss} disabled={busy !== null} className="gap-ds-2 text-ds-foreground-muted">
                <X className="size-3.5" aria-hidden="true" />
                Dismiss
              </Button>
            </>
          ) : (
            <p className="text-xs text-ds-foreground-muted">Your role cannot do this; ask a colleague who can.</p>
          )}
        </div>
      )}

      {isDone && suggestion.canUndo && (
        <div>
          <Button size="sm" variant="ghost" onClick={undo} disabled={busy !== null} className="gap-ds-2 text-ds-foreground-muted">
            {busy === 'undo' ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Undo2 className="size-3.5" aria-hidden="true" />}
            Undo
          </Button>
        </div>
      )}

      {reply && (
        <SendMessageDialog
          open
          onOpenChange={(open) => {
            if (!open) setReply(null);
          }}
          contact={reply}
          defaultChannel={p.channel === 'email' || p.channel === 'sms' ? p.channel : 'whatsapp'}
          initialBody={typeof p.body === 'string' ? p.body : undefined}
          initialSubject={typeof p.subject === 'string' ? p.subject : undefined}
          leadId={typeof p.leadId === 'string' ? p.leadId : null}
          onSent={() => {
            // The message went out through the Communication Hub; record that the draft was used.
            void assistantApi.apply(suggestion.id).catch(() => undefined).finally(() => onChanged?.());
          }}
        />
      )}
    </div>
  );
}
