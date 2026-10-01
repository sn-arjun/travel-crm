'use client';

import * as React from 'react';
import {
  ListOrdered,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react';
import { ListPage, RelationCombobox } from '@/components/domain';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  Tag,
  Textarea,
} from '@/components/ui';
import { toast } from 'sonner';
import { LEAD_STATUS_LABELS } from '@travelcrm/shared';
import { settingsApi, type FollowUpSequence, type FollowUpStepType } from '@/lib/api/settings';
import { templatesApi, type MessageTemplate } from '@/lib/api/templates';

type StepType = FollowUpStepType;

interface StepForm {
  day: number;
  type: StepType;
  notes: string;
  templateId: string;
}

interface SequenceForm {
  name: string;
  triggerStatus: string;
  steps: StepForm[];
  isActive: boolean;
}

const STEP_TYPES: Array<{ value: StepType; label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'call', label: 'Call' },
  { value: 'visit', label: 'Visit' },
];

const TRIGGER_STATUSES = Object.entries(LEAD_STATUS_LABELS) as Array<[string, string]>;

// GET /templates answers { data: [...], pagination } with the page info beside data, not inside it.
const fetchTemplates = async (q: string, page: number) => {
  const r = (await templatesApi.list({ search: q, page, limit: 20 })) as unknown as {
    data?: MessageTemplate[] | { data?: MessageTemplate[]; pagination?: { total?: number } };
    pagination?: { total?: number };
  };
  const nested = Array.isArray(r.data) ? undefined : r.data;
  const items = (Array.isArray(r.data) ? r.data : nested?.data) ?? [];
  const total = r.pagination?.total ?? nested?.pagination?.total ?? items.length;
  return { items, total };
};

const resolveTemplate = async (id: string) => {
  const r = await templatesApi.getById(id);
  return 'data' in r ? r.data : null;
};

const stepTypeIcons: Record<StepType, React.ReactNode> = {
  email: <Mail className="h-4 w-4" aria-hidden="true" />,
  sms: <MessageSquare className="h-4 w-4" aria-hidden="true" />,
  whatsapp: <MessageCircle className="h-4 w-4" aria-hidden="true" />,
  call: <Phone className="h-4 w-4" aria-hidden="true" />,
  visit: <MapPin className="h-4 w-4" aria-hidden="true" />,
};

const emptyStep: StepForm = { day: 1, type: 'email', notes: '', templateId: '' };

const emptyForm: SequenceForm = {
  name: '',
  triggerStatus: 'new',
  steps: [{ ...emptyStep }],
  isActive: true,
};

export default function FollowUpSequencesPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<SequenceForm>(emptyForm);
  const [refreshKey, setRefreshKey] = React.useState(0);

  // The API returns every sequence in one response, so search runs client-side.
  const fetchAll = React.useCallback(async ({ page, search }: { page: number; search: string }) => {
    if (page > 1) return { data: [], pagination: { total: 0 } };
    const res = await settingsApi.followUpSequences.list();
    const all = ('data' in res ? res.data : []) ?? [];
    const q = search.trim().toLowerCase();
    const data = q
      ? all.filter((s) => {
          const trigger = LEAD_STATUS_LABELS[s.triggerStatus as keyof typeof LEAD_STATUS_LABELS] ?? s.triggerStatus;
          return s.name.toLowerCase().includes(q) || trigger.toLowerCase().includes(q);
        })
      : all;
    return { data, pagination: { total: data.length } };
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, steps: [{ ...emptyStep }] });
    setDialogOpen(true);
  };

  const openEdit = (seq: FollowUpSequence) => {
    setEditingId(seq.id);
    setForm({
      name: seq.name,
      triggerStatus: seq.triggerStatus,
      steps: seq.steps.map((s) => ({
        day: s.day,
        type: s.type,
        notes: s.notes ?? '',
        templateId: s.templateId ?? '',
      })),
      isActive: seq.isActive,
    });
    setDialogOpen(true);
  };

  const addStep = () => {
    setForm((p) => ({ ...p, steps: [...p.steps, { ...emptyStep, day: (p.steps[p.steps.length - 1]?.day ?? 0) + 1 }] }));
  };

  const removeStep = (idx: number) => {
    setForm((p) => ({
      ...p,
      steps: p.steps.filter((_, i) => i !== idx),
    }));
  };

  const updateStep = (idx: number, patch: Partial<StepForm>) => {
    setForm((p) => ({ ...p, steps: p.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)) }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Sequence name is required');
      return;
    }
    if (form.steps.length === 0) {
      toast.error('At least one step is required');
      return;
    }
    try {
      const payload = {
        name: form.name.trim(),
        triggerStatus: form.triggerStatus,
        steps: form.steps.map((st) => ({
          day: st.day,
          type: st.type,
          ...(st.notes.trim() && { notes: st.notes.trim() }),
          ...(st.templateId && { templateId: st.templateId }),
        })),
        isActive: form.isActive,
      };
      if (editingId) {
        await settingsApi.followUpSequences.update(editingId, payload);
        toast.success('Sequence updated');
      } else {
        await settingsApi.followUpSequences.create(payload);
        toast.success('Sequence created');
      }
      setDialogOpen(false);
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to save sequence');
    }
  };

  const handleDelete = async (seq: FollowUpSequence) => {
    try {
      await settingsApi.followUpSequences.delete(seq.id);
      toast.success('Sequence deleted');
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete sequence');
    }
  };

  const handleToggle = async (seq: FollowUpSequence) => {
    try {
      await settingsApi.followUpSequences.update(seq.id, { isActive: !seq.isActive });
      toast.success(`Sequence ${seq.isActive ? 'disabled' : 'enabled'}`);
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to update sequence');
    }
  };

  return (
    <>
      <ListPage<FollowUpSequence>
        key={refreshKey}
        title="Follow-up Sequences"
        description="Configure automated follow-up workflows for leads."
        getRowId={(s) => s.id}
        fetcher={fetchAll}
        searchPlaceholder="Search sequences…"
        extractItems={(r) => (r as { data: FollowUpSequence[] }).data}
        extractTotal={(r) => (r as { pagination: { total: number } }).pagination.total}
        primaryAction={
          <Button size="sm" onClick={openCreate} className="gap-ds-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Sequence
          </Button>
        }
        columns={[
          { key: 'name', header: 'Name', sortable: true },
          {
            key: 'triggerStatus',
            header: 'Trigger',
            cell: (s) => <span>{LEAD_STATUS_LABELS[s.triggerStatus as keyof typeof LEAD_STATUS_LABELS] ?? s.triggerStatus}</span>,
          },
          {
            key: 'steps',
            header: 'Steps',
            cell: (s) => (
              <div className="flex items-center gap-ds-1">
                {s.steps.map((step, i) => (
                  <span key={i} title={`Day ${step.day}: ${step.type}`}>
                    {stepTypeIcons[step.type]}
                  </span>
                ))}
                <span className="text-xs text-ds-foreground-subtle ml-ds-1">({s.steps.length})</span>
              </div>
            ),
          },
          {
            key: 'isActive',
            header: 'Status',
            cell: (s) => <Tag tone={s.isActive ? 'success' : 'neutral'}>{s.isActive ? 'Active' : 'Disabled'}</Tag>,
          },
        ]}
        rowActions={(s) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label={s.isActive ? 'Disable' : 'Enable'} onClick={() => handleToggle(s)}>
              {s.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => openEdit(s)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => handleDelete(s)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
        bulkActions={[
          {
            label: 'Delete',
            destructive: true,
            onSelect: async (rows) => {
              await Promise.all(rows.map((s) => settingsApi.followUpSequences.delete(s.id)));
              setRefreshKey((k) => k + 1);
            },
          },
        ]}
        onExport={(rows) => {
          const csv = [
            ['Name', 'Trigger', 'Steps', 'Status'].join(','),
            ...rows.map((s) => [`"${s.name}"`, `"${s.triggerStatus}"`, s.steps.length, s.isActive ? 'Active' : 'Disabled'].join(',')),
          ].join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'followup-sequences.csv';
          a.click();
          URL.revokeObjectURL(url);
        }}
        emptyTitle="No follow-up sequences configured"
        emptyDescription="Create a sequence to automate follow-up steps for new leads."
        emptyIcon={<ListOrdered className="h-10 w-10" aria-hidden="true" />}
        emptyAction={
          <Button onClick={openCreate} variant="outline" className="gap-ds-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Create First Sequence
          </Button>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Sequence' : 'Create Sequence'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-ds-4 py-ds-4">
            <div className="space-y-ds-2">
              <Label htmlFor="seqName">Name</Label>
              <Input
                id="seqName"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., New Lead Welcome Sequence"
              />
            </div>
            <div className="grid grid-cols-2 gap-ds-4">
              <div className="space-y-ds-2">
                <Label htmlFor="seqTrigger">Trigger Status</Label>
                <Select value={form.triggerStatus} onValueChange={(v) => setForm((p) => ({ ...p, triggerStatus: v }))}>
                  <SelectTrigger id="seqTrigger"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGER_STATUSES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-ds-3 pb-ds-2">
                <Switch id="seqActive" checked={form.isActive} onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))} />
                <Label htmlFor="seqActive">Active</Label>
              </div>
            </div>

            <Separator />

            <div className="space-y-ds-2">
              <div className="flex items-center justify-between">
                <Label>Steps</Label>
                <Button variant="outline" size="sm" onClick={addStep} className="gap-ds-1">
                  <Plus className="h-3 w-3" aria-hidden="true" /> Add Step
                </Button>
              </div>
              {form.steps.map((step, idx) => (
                <div key={idx} className="rounded-ds-md border border-ds-border p-ds-4 space-y-ds-3" data-testid="sequence-step">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Step {idx + 1}</span>
                    {form.steps.length > 1 && (
                      <Button variant="ghost" size="icon-sm" className="text-ds-danger" onClick={() => removeStep(idx)} aria-label={`Remove step ${idx + 1}`}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-ds-3">
                    <div className="space-y-ds-1">
                      <Label className="text-xs">Type</Label>
                      <Select value={step.type} onValueChange={(v) => updateStep(idx, { type: v as StepType })}>
                        <SelectTrigger aria-label={`Step ${idx + 1} type`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STEP_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-ds-1">
                      <Label className="text-xs">Day</Label>
                      <Input
                        type="number"
                        min={0}
                        aria-label={`Step ${idx + 1} day`}
                        value={step.day}
                        onChange={(e) => updateStep(idx, { day: parseInt(e.target.value, 10) || 0 })}
                      />
                    </div>
                    <div className="space-y-ds-1">
                      <Label className="text-xs">Template (optional)</Label>
                      <RelationCombobox<MessageTemplate>
                        value={step.templateId || null}
                        onChange={(id) => updateStep(idx, { templateId: id ?? '' })}
                        fetcher={fetchTemplates}
                        getOptionId={(t) => t.id}
                        getOptionLabel={(t) => t.name}
                        getOptionDescription={(t) => t.channel}
                        resolveSelected={resolveTemplate}
                        placeholder="Select a template"
                        aria-label={`Step ${idx + 1} template`}
                      />
                    </div>
                  </div>
                  <div className="space-y-ds-1">
                    <Label className="text-xs">Notes</Label>
                    <Textarea
                      aria-label={`Step ${idx + 1} notes`}
                      value={step.notes}
                      onChange={(e) => updateStep(idx, { notes: e.target.value })}
                      rows={2}
                      placeholder="What should happen at this step"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingId ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
