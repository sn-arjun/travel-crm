'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus, Phone, Mail, MessageCircle, MapPin, ClipboardList, Trash2, CheckCircle2, CalendarClock,
} from 'lucide-react';
import { ListPage, RelationCombobox } from '@/components/domain';
import {
  Button, Tag, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Label, Textarea, useConfirm, Spinner,
} from '@/components/ui';
import { DateTimePicker } from '@/components/ui/date-picker';
import { followUpsApi } from '@/lib/api/follow-ups';
import { leadsApi } from '@/lib/api/leads';
import type { FollowUp } from '@travelcrm/shared';
import type { Lead } from '@travelcrm/shared';

type FollowUpRow = FollowUp & { status?: string; leadTitle?: string; contactName?: string };

const TYPE_ICONS: Record<string, React.ReactNode> = {
  call: <Phone className="size-3.5" aria-hidden="true" />,
  email: <Mail className="size-3.5" aria-hidden="true" />,
  whatsapp: <MessageCircle className="size-3.5" aria-hidden="true" />,
  visit: <MapPin className="size-3.5" aria-hidden="true" />,
  sms: <Mail className="size-3.5" aria-hidden="true" />,
  meeting: <MapPin className="size-3.5" aria-hidden="true" />,
  task: <ClipboardList className="size-3.5" aria-hidden="true" />,
};

function isOverdue(f: FollowUpRow) {
  return f.status !== 'completed' && !f.completedAt && f.scheduledAt && new Date(f.scheduledAt) < new Date();
}

function statusTone(f: FollowUpRow): 'success' | 'danger' | 'warning' | 'neutral' {
  if (f.status === 'completed' || f.completedAt) return 'success';
  if (isOverdue(f)) return 'danger';
  return 'warning';
}

function statusLabel(f: FollowUpRow) {
  if (f.status === 'completed' || f.completedAt) return 'Completed';
  if (isOverdue(f)) return 'Overdue';
  return 'Pending';
}

// GET /follow-ups returns every pending follow-up as a plain array and ignores
// paging/search/type/status params, so narrowing and paging happen here.
async function queryFollowUps(params: { search?: string; status?: string; type?: string }): Promise<FollowUpRow[]> {
  const res = await followUpsApi.list();
  const data: any = res.data;
  const all: FollowUpRow[] = Array.isArray(data) ? data : (data?.data ?? []);
  const q = params.search?.trim().toLowerCase();
  return all.filter((f) => {
    if (params.type && f.type !== params.type) return false;
    if (params.status === 'overdue' && !isOverdue(f)) return false;
    if (params.status === 'pending' && isOverdue(f)) return false;
    if (q) {
      const haystack = [f.leadTitle, f.contactName, f.notes, f.type].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const OUTCOME_LABELS: Record<string, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
  no_response: 'No response',
};

function toCsvValue(v: unknown) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

interface ScheduleFormState {
  leadId: string;
  leadLabel: string;
  scheduledAt: Date | undefined;
  type: string;
  notes: string;
}

const EMPTY_FORM: ScheduleFormState = { leadId: '', leadLabel: '', scheduledAt: undefined, type: 'call', notes: '' };

function ScheduleDialog({
  open,
  onOpenChange,
  mode,
  followUp,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'reschedule';
  followUp?: FollowUpRow | null;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState<ScheduleFormState>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  // Remounts the picker once the form is populated so its time selects start from the pre-filled value.
  const [pickerKey, setPickerKey] = React.useState(0);

  React.useEffect(() => {
    if (!open) return;
    setPickerKey((k) => k + 1);
    if (mode === 'reschedule' && followUp) {
      setForm({
        leadId: followUp.leadId,
        leadLabel: followUp.leadTitle ?? '',
        scheduledAt: followUp.scheduledAt ? new Date(followUp.scheduledAt) : undefined,
        type: followUp.type,
        notes: followUp.notes ?? '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, mode, followUp]);

  async function handleSave() {
    if (!form.scheduledAt || !form.leadId) {
      toast.error('Please select a lead and date');
      return;
    }
    setSaving(true);
    try {
      if (mode === 'reschedule' && followUp) {
        await followUpsApi.update(followUp.id, { scheduledAt: form.scheduledAt.toISOString() });
      } else {
        await followUpsApi.create({
          leadId: form.leadId,
          scheduledAt: form.scheduledAt.toISOString(),
          type: form.type as never,
          notes: form.notes || undefined,
        });
      }
      toast.success(mode === 'reschedule' ? 'Follow-up rescheduled' : 'Follow-up scheduled');
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error(mode === 'reschedule' ? 'Failed to reschedule follow-up' : 'Failed to create follow-up');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'reschedule' ? 'Reschedule follow-up' : 'Schedule follow-up'}</DialogTitle>
          <DialogDescription>
            {mode === 'reschedule' ? 'Pick a new date and time for this follow-up.' : 'Schedule a new follow-up for a lead.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-ds-4">
          <div className="flex flex-col gap-ds-1">
            <Label htmlFor="followup-lead">
              Lead<span aria-hidden="true" className="ml-0.5 text-ds-danger">*</span>
            </Label>
            <RelationCombobox<Lead>
              value={form.leadId || null}
              onChange={(id, item) => setForm((f) => ({ ...f, leadId: id ?? '', leadLabel: item?.title ?? '' }))}
              disabled={mode === 'reschedule'}
              fetcher={async (query, page) => {
                const r = await leadsApi.list({ search: query, page, limit: 20 });
                const data: any = r.data;
                const items = Array.isArray(data) ? data : (data?.data ?? []);
                const total = Array.isArray(data) ? items.length : (data?.pagination?.total ?? items.length);
                return { items, total };
              }}
              getOptionId={(l) => l.id}
              getOptionLabel={(l) => l.title}
              getOptionDescription={(l) => l.contact?.name}
              resolveSelected={async (id) => (await leadsApi.getById(id)).data}
              placeholder="Select a lead"
              searchPlaceholder="Search leads..."
            />
          </div>
          <div className="grid grid-cols-2 gap-ds-4">
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="followup-date">
                Date &amp; time<span aria-hidden="true" className="ml-0.5 text-ds-danger">*</span>
              </Label>
              <DateTimePicker
                key={pickerKey}
                value={form.scheduledAt}
                onChange={(d) => setForm((f) => ({ ...f, scheduledAt: d }))}
                placeholder="Pick date & time"
                minDate={mode === 'create' ? startOfToday() : undefined}
              />
            </div>
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="followup-type">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))} disabled={mode === 'reschedule'}>
                <SelectTrigger id="followup-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="call">Call</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="visit">Visit</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {mode === 'create' && (
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="followup-notes">Notes</Label>
              <Textarea
                id="followup-notes"
                placeholder="What to follow up on..."
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button disabled={saving || !form.scheduledAt || !form.leadId} onClick={handleSave} className="gap-ds-2">
            {saving && <Spinner className="size-4" />}
            {mode === 'reschedule' ? 'Reschedule' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({
  open,
  onOpenChange,
  followUp,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  followUp: FollowUpRow | null;
  onSaved: () => void;
}) {
  const [outcome, setOutcome] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) { setOutcome(''); setNotes(''); }
  }, [open]);

  async function handleComplete() {
    if (!followUp) return;
    setSaving(true);
    try {
      const outcomeNotes = [OUTCOME_LABELS[outcome], notes.trim()].filter(Boolean).join(' — ');
      await followUpsApi.complete(followUp.id, { outcomeNotes: outcomeNotes || undefined });
      toast.success('Follow-up completed');
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error('Failed to complete follow-up');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete follow-up</DialogTitle>
          <DialogDescription>Log the outcome of this follow-up.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-ds-4">
          <div className="flex flex-col gap-ds-1">
            <Label htmlFor="complete-outcome">Outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger id="complete-outcome"><SelectValue placeholder="Select outcome" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="negative">Negative</SelectItem>
                <SelectItem value="no_response">No response</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-ds-1">
            <Label htmlFor="complete-notes">Notes</Label>
            <Textarea
              id="complete-notes"
              placeholder="What happened?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button disabled={saving} onClick={handleComplete} className="gap-ds-2">
            {saving && <Spinner className="size-4" />}
            Mark complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FollowUpsPage() {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [statusFilter, setStatusFilter] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [rescheduleTarget, setRescheduleTarget] = React.useState<FollowUpRow | null>(null);
  const [completeTarget, setCompleteTarget] = React.useState<FollowUpRow | null>(null);

  const bump = () => setRefreshKey((k) => k + 1);

  const fetchPage = React.useCallback(
    async ({ page, limit, search }: { page: number; limit: number; search: string }) => {
      const rows = await queryFollowUps({ search, status: statusFilter, type: typeFilter });
      const start = (page - 1) * limit;
      return { data: { data: rows.slice(start, start + limit), pagination: { total: rows.length, page, limit } } };
    },
    [statusFilter, typeFilter],
  );

  async function handleDelete(f: FollowUpRow) {
    const ok = await confirm({
      title: 'Cancel follow-up',
      description: 'This follow-up will be permanently removed. This cannot be undone.',
      confirmLabel: 'Cancel follow-up',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await followUpsApi.delete(f.id);
      toast.success('Follow-up cancelled');
      bump();
    } catch {
      toast.error('Failed to cancel follow-up');
    }
  }

  const filters = [
    ...(statusFilter ? [{ id: 'status', label: 'Status', value: statusFilter }] : []),
    ...(typeFilter ? [{ id: 'type', label: 'Type', value: typeFilter }] : []),
  ];

  return (
    <>
      {dialog}
      <ListPage<FollowUpRow>
        key={refreshKey}
        title="Follow-ups"
        description="Stay on top of scheduled outreach across your pipeline."
        getRowId={(f) => f.id}
        fetcher={fetchPage}
        searchPlaceholder="Search follow-ups..."
        columns={[
          {
            key: 'type',
            header: 'Type',
            cell: (f) => (
              <span className="inline-flex items-center gap-ds-2">
                <span className="flex size-7 items-center justify-center rounded-ds-full bg-ds-surface-sunken text-ds-foreground-muted">
                  {TYPE_ICONS[f.type] ?? <ClipboardList className="size-3.5" aria-hidden="true" />}
                </span>
                <span className="text-sm font-medium capitalize">{f.type}</span>
              </span>
            ),
          },
          {
            key: 'lead',
            header: 'Lead',
            cell: (f) => (
              <div>
                <button
                  type="button"
                  className="text-sm font-medium text-ds-primary hover:underline"
                  onClick={(e) => { e.stopPropagation(); router.push(`/leads/${f.leadId}`); }}
                >
                  {f.leadTitle ?? f.leadId}
                </button>
                {f.contactName && <p className="text-xs text-ds-foreground-muted">{f.contactName}</p>}
              </div>
            ),
          },
          {
            key: 'notes',
            header: 'Notes',
            cell: (f) => <span className="line-clamp-2 text-sm text-ds-foreground-muted">{f.notes || '—'}</span>,
          },
          {
            key: 'scheduledAt',
            header: 'Scheduled',
            cell: (f) => (
              <span className={isOverdue(f) ? 'text-sm font-medium text-ds-danger' : 'text-sm'}>
                {f.scheduledAt
                  ? new Date(f.scheduledAt).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })
                  : '—'}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (f) => <Tag tone={statusTone(f)}>{statusLabel(f)}</Tag>,
          },
        ]}
        primaryAction={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" /> Schedule follow-up
          </Button>
        }
        headerActions={
          <div className="flex items-center gap-ds-2">
            <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="visit">Visit</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        filters={filters}
        onRemoveFilter={(id) => { if (id === 'status') setStatusFilter(''); if (id === 'type') setTypeFilter(''); }}
        onClearFilters={() => { setStatusFilter(''); setTypeFilter(''); }}
        rowActions={(f) => {
          const completed = f.status === 'completed' || !!f.completedAt;
          return (
            <>
              {!completed && (
                <Button variant="ghost" size="icon-sm" aria-label="Mark complete" onClick={() => setCompleteTarget(f)}>
                  <CheckCircle2 />
                </Button>
              )}
              {!completed && (
                <Button variant="ghost" size="icon-sm" aria-label="Reschedule" onClick={() => setRescheduleTarget(f)}>
                  <CalendarClock />
                </Button>
              )}
              <Button variant="ghost" size="icon-sm" aria-label="Cancel follow-up" onClick={() => void handleDelete(f)}>
                <Trash2 />
              </Button>
            </>
          );
        }}
        bulkActions={[
          {
            label: 'Cancel',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              try {
                await Promise.all(rows.map((r) => followUpsApi.delete(r.id)));
                toast.success(`${rows.length} follow-up${rows.length !== 1 ? 's' : ''} cancelled`);
              } catch {
                toast.error('Failed to cancel selected follow-ups');
              }
              bump();
            },
          },
        ]}
        onExport={async (rows) => {
          try {
            const all = await queryFollowUps({ status: statusFilter, type: typeFilter });
            const header = ['Type', 'Lead', 'Contact', 'Notes', 'Scheduled', 'Status'];
            const lines = [header.join(',')];
            for (const f of all) {
              lines.push([
                toCsvValue(f.type),
                toCsvValue(f.leadTitle ?? f.leadId),
                toCsvValue(f.contactName ?? ''),
                toCsvValue(f.notes ?? ''),
                toCsvValue(f.scheduledAt),
                toCsvValue(statusLabel(f)),
              ].join(','));
            }
            const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `follow-ups_export_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Follow-ups exported successfully');
          } catch {
            toast.error('Failed to export follow-ups');
          }
        }}
        emptyTitle="No follow-ups yet"
        emptyDescription="Schedule a follow-up to stay on top of your leads."
        emptyIcon={<CalendarClock className="size-10" aria-hidden="true" />}
        emptyAction={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden="true" /> Schedule follow-up
          </Button>
        }
      />

      <ScheduleDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" onSaved={bump} />
      <ScheduleDialog
        open={rescheduleTarget !== null}
        onOpenChange={(o) => !o && setRescheduleTarget(null)}
        mode="reschedule"
        followUp={rescheduleTarget}
        onSaved={bump}
      />
      <CompleteDialog
        open={completeTarget !== null}
        onOpenChange={(o) => !o && setCompleteTarget(null)}
        followUp={completeTarget}
        onSaved={bump}
      />
    </>
  );
}
