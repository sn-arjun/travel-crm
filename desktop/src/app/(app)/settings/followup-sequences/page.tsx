'use client';

import * as React from 'react';
import {
  CheckSquare,
  ListOrdered,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react';
import { ListPage } from '@/components/domain';
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
import { settingsApi, type FollowUpSequence } from '@/lib/api/settings';

type StepType = 'email' | 'sms' | 'call' | 'task';

interface StepForm {
  order: number;
  delayDays: number;
  type: StepType;
  message: string;
  template: string;
}

interface SequenceForm {
  name: string;
  description: string;
  steps: StepForm[];
  isActive: boolean;
}

const stepTypeIcons: Record<StepType, React.ReactNode> = {
  email: <Mail className="h-4 w-4" aria-hidden="true" />,
  sms: <MessageSquare className="h-4 w-4" aria-hidden="true" />,
  call: <Phone className="h-4 w-4" aria-hidden="true" />,
  task: <CheckSquare className="h-4 w-4" aria-hidden="true" />,
};

const emptyStep: StepForm = { order: 1, delayDays: 1, type: 'email', message: '', template: '' };

const emptyForm: SequenceForm = {
  name: '',
  description: '',
  steps: [{ ...emptyStep }],
  isActive: true,
};

export default function FollowUpSequencesPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<SequenceForm>(emptyForm);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [cachedSequences, setCachedSequences] = React.useState<FollowUpSequence[]>([]);

  const fetchAll = React.useCallback(async (page: number) => {
    if (page > 1) return { data: [], pagination: { total: cachedSequences.length } };
    const res = await settingsApi.followUpSequences.list();
    const sequences = ('data' in res ? (res.data as FollowUpSequence[]) : []) ?? [];
    setCachedSequences(sequences);
    return { data: sequences, pagination: { total: sequences.length } };
  }, [cachedSequences.length]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, steps: [{ ...emptyStep }] });
    setDialogOpen(true);
  };

  const openEdit = (seq: FollowUpSequence) => {
    setEditingId(seq.id);
    setForm({
      name: seq.name,
      description: seq.description ?? '',
      steps: seq.steps.map((s) => ({
        order: s.order,
        delayDays: s.delayDays,
        type: s.type,
        message: s.message ?? '',
        template: s.template ?? '',
      })),
      isActive: seq.isActive,
    });
    setDialogOpen(true);
  };

  const addStep = () => {
    setForm((p) => ({ ...p, steps: [...p.steps, { ...emptyStep, order: p.steps.length + 1 }] }));
  };

  const removeStep = (idx: number) => {
    setForm((p) => ({
      ...p,
      steps: p.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })),
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
        name: form.name,
        description: form.description || undefined,
        steps: form.steps,
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
        fetcher={({ page }) => fetchAll(page)}
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
            key: 'description',
            header: 'Description',
            cell: (s) => <span className="text-ds-foreground-muted truncate max-w-[200px] block">{s.description || '-'}</span>,
          },
          {
            key: 'steps',
            header: 'Steps',
            cell: (s) => (
              <div className="flex items-center gap-ds-1">
                {s.steps.map((step, i) => (
                  <span key={i} title={`Day ${step.delayDays}: ${step.type}`}>
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
            ['Name', 'Description', 'Steps', 'Status'].join(','),
            ...rows.map((s) => [`"${s.name}"`, `"${s.description ?? ''}"`, s.steps.length, s.isActive ? 'Active' : 'Disabled'].join(',')),
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
            <div className="space-y-ds-2">
              <Label htmlFor="seqDesc">Description</Label>
              <Textarea
                id="seqDesc"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                placeholder="Describe what this sequence does"
              />
            </div>
            <div className="flex items-center gap-ds-3">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))} />
              <Label>Active</Label>
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
                <div key={idx} className="rounded-ds-md border border-ds-border p-ds-4 space-y-ds-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Step {idx + 1}</span>
                    {form.steps.length > 1 && (
                      <Button variant="ghost" size="icon-sm" className="text-ds-danger" onClick={() => removeStep(idx)} aria-label="Remove step">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-ds-3">
                    <div className="space-y-ds-1">
                      <Label className="text-xs">Type</Label>
                      <Select value={step.type} onValueChange={(v) => updateStep(idx, { type: v as StepType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="call">Call</SelectItem>
                          <SelectItem value="task">Task</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-ds-1">
                      <Label className="text-xs">Delay (days)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={step.delayDays}
                        onChange={(e) => updateStep(idx, { delayDays: parseInt(e.target.value, 10) || 0 })}
                      />
                    </div>
                    <div className="space-y-ds-1">
                      <Label className="text-xs">Template (optional)</Label>
                      <Input
                        value={step.template}
                        onChange={(e) => updateStep(idx, { template: e.target.value })}
                        placeholder="template-id"
                      />
                    </div>
                  </div>
                  <div className="space-y-ds-1">
                    <Label className="text-xs">Message</Label>
                    <Textarea
                      value={step.message}
                      onChange={(e) => updateStep(idx, { message: e.target.value })}
                      rows={2}
                      placeholder="Message content or description"
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
