'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  ListOrdered,
  Plus,
  Pencil,
  Trash2,
  Power,
  PowerOff,
  Mail,
  Phone,
  MessageSquare,
  CheckSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { settingsApi, type FollowUpSequence } from '@/lib/api/settings';
import { cn } from '@/lib/utils';

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
  email: <Mail className="h-4 w-4" />,
  sms: <MessageSquare className="h-4 w-4" />,
  call: <Phone className="h-4 w-4" />,
  task: <CheckSquare className="h-4 w-4" />,
};

const emptyStep: StepForm = { order: 1, delayDays: 1, type: 'email', message: '', template: '' };

const emptyForm: SequenceForm = {
  name: '',
  description: '',
  steps: [{ ...emptyStep }],
  isActive: true,
};

export default function FollowUpSequencesPage() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<SequenceForm>(emptyForm);

  const { data: seqResponse, loading, refetch } = useApiQuery(
    () => settingsApi.followUpSequences.list(),
    [],
  );

  const sequences: FollowUpSequence[] = React.useMemo(() => {
    if (!seqResponse || !('data' in seqResponse)) return [];
    return (seqResponse.data as FollowUpSequence[]) ?? [];
  }, [seqResponse]);

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
    setForm((p) => ({
      ...p,
      steps: [...p.steps, { ...emptyStep, order: p.steps.length + 1 }],
    }));
  };

  const removeStep = (idx: number) => {
    setForm((p) => ({
      ...p,
      steps: p.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })),
    }));
  };

  const updateStep = (idx: number, patch: Partial<StepForm>) => {
    setForm((p) => ({
      ...p,
      steps: p.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
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
      refetch();
    } catch {
      toast.error('Failed to save sequence');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await settingsApi.followUpSequences.delete(id);
      toast.success('Sequence deleted');
      refetch();
    } catch {
      toast.error('Failed to delete sequence');
    }
  };

  const handleToggle = async (seq: FollowUpSequence) => {
    try {
      await settingsApi.followUpSequences.update(seq.id, { isActive: !seq.isActive });
      toast.success(`Sequence ${seq.isActive ? 'disabled' : 'enabled'}`);
      refetch();
    } catch {
      toast.error('Failed to update sequence');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Follow-up Sequences</h1>
          <p className="text-muted-foreground mt-1">Configure automated follow-up workflows for leads</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Sequence
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5" />
            Sequences ({sequences.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sequences.length === 0 ? (
            <div className="text-center py-12">
              <ListOrdered className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No follow-up sequences configured</p>
              <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Create First Sequence
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sequences.map((seq) => (
                  <TableRow key={seq.id}>
                    <TableCell className="font-medium">{seq.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {seq.description || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {seq.steps.map((s, i) => (
                          <span key={i} title={`Day ${s.delayDays}: ${s.type}`}>
                            {stepTypeIcons[s.type]}
                          </span>
                        ))}
                        <span className="text-xs text-muted-foreground ml-1">({seq.steps.length})</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          seq.isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
                        )}
                      >
                        {seq.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggle(seq)}>
                          {seq.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(seq)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(seq.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Sequence' : 'Create Sequence'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="seqName">Name</Label>
              <Input
                id="seqName"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., New Lead Welcome Sequence"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seqDesc">Description</Label>
              <Textarea
                id="seqDesc"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                placeholder="Describe what this sequence does"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
              />
              <Label>Active</Label>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Steps</Label>
                <Button variant="outline" size="sm" onClick={addStep} className="gap-1">
                  <Plus className="h-3 w-3" />
                  Add Step
                </Button>
              </div>
              {form.steps.map((step, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Step {idx + 1}</span>
                    {form.steps.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeStep(idx)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select value={step.type} onValueChange={(v) => updateStep(idx, { type: v as StepType })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                          <SelectItem value="call">Call</SelectItem>
                          <SelectItem value="task">Task</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Delay (days)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={step.delayDays}
                        onChange={(e) => updateStep(idx, { delayDays: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Template (optional)</Label>
                      <Input
                        value={step.template}
                        onChange={(e) => updateStep(idx, { template: e.target.value })}
                        placeholder="template-id"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
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
    </div>
  );
}
