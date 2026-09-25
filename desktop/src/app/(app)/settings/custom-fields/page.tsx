'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Pencil, Trash2, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { contactsApi, type CustomFieldDef, type CreateCustomFieldRequest } from '@/lib/api/contacts';

interface FieldForm {
  name: string;
  label: string;
  fieldType: CustomFieldDef['fieldType'];
  options: string;
  isRequired: boolean;
}

const emptyForm: FieldForm = { name: '', label: '', fieldType: 'text', options: '', isRequired: false };

const TYPE_LABELS: Record<CustomFieldDef['fieldType'], string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  select: 'Select',
  multi_select: 'Multi-select',
  boolean: 'Yes/No',
};

export default function ContactCustomFieldsPage() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FieldForm>(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const { data: fieldsResponse, loading, refetch } = useApiQuery(
    () => contactsApi.getCustomFields(),
    [],
  );

  const fields: CustomFieldDef[] = React.useMemo(() => {
    const d = fieldsResponse?.data;
    return Array.isArray(d) ? d : [];
  }, [fieldsResponse]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(field: CustomFieldDef) {
    setEditingId(field.id);
    setForm({
      name: field.name,
      label: field.label,
      fieldType: field.fieldType,
      options: (field.options ?? []).join(', '),
      isRequired: !!field.isRequired,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.label.trim()) {
      toast.error('Field label is required');
      return;
    }
    if (!editingId && !form.name.trim()) {
      toast.error('Field name is required');
      return;
    }

    const payload: CreateCustomFieldRequest = {
      name: form.name.trim(),
      label: form.label.trim(),
      fieldType: form.fieldType,
      isRequired: form.isRequired,
      options: form.fieldType === 'select' || form.fieldType === 'multi_select'
        ? form.options.split(',').map((o) => o.trim()).filter(Boolean)
        : undefined,
    };

    setSaving(true);
    try {
      if (editingId) {
        await contactsApi.updateCustomField(editingId, payload);
        toast.success('Field updated');
      } else {
        await contactsApi.createCustomField(payload);
        toast.success('Field created');
      }
      setDialogOpen(false);
      refetch();
    } catch {
      toast.error('Failed to save field');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this custom field? Existing values will no longer be shown.')) return;
    setDeletingId(id);
    try {
      await contactsApi.deleteCustomField(id);
      toast.success('Field deleted');
      refetch();
    } catch {
      toast.error('Failed to delete field');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-ds-6 py-ds-4 border-b border-ds-border">
        <div className="flex items-center gap-ds-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()} aria-label="Back">
            <ArrowLeft aria-hidden="true" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Contact Custom Fields</h1>
            <p className="text-sm text-ds-foreground-muted">Define extra fields captured on every contact.</p>
          </div>
        </div>
        <Button onClick={openCreate}>
          <Plus aria-hidden="true" /> New Field
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-ds-6">
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="text-base">Fields</CardTitle>
            <CardDescription>These fields appear on contact create/edit forms and detail pages.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-ds-8">
                <Loader2 className="h-6 w-6 animate-spin text-ds-foreground-muted" aria-hidden="true" />
              </div>
            ) : fields.length === 0 ? (
              <EmptyState
                icon={<ListChecks aria-hidden="true" />}
                title="No custom fields yet"
                description="Add a field to capture extra information on contacts."
                action={<Button size="sm" onClick={openCreate}><Plus aria-hidden="true" /> New Field</Button>}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium text-sm">{f.label}</TableCell>
                      <TableCell className="text-sm text-ds-foreground-muted font-mono">{f.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{TYPE_LABELS[f.fieldType]}</Badge></TableCell>
                      <TableCell>{f.isRequired ? <Badge className="text-xs">Required</Badge> : <span className="text-xs text-ds-foreground-muted">Optional</span>}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-ds-1">
                          <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => openEdit(f)}>
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Delete"
                            disabled={deletingId === f.id}
                            onClick={() => handleDelete(f.id)}
                          >
                            {deletingId === f.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
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
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Field' : 'New Field'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-ds-4">
            <div className="space-y-ds-2">
              <Label htmlFor="field-label">Label <span className="text-ds-danger">*</span></Label>
              <Input
                id="field-label"
                placeholder="e.g., Passport Number"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div className="space-y-ds-2">
              <Label htmlFor="field-name">Field Name {!editingId && <span className="text-ds-danger">*</span>}</Label>
              <Input
                id="field-name"
                placeholder="e.g., passportNumber"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={!!editingId}
              />
            </div>
            <div className="space-y-ds-2">
              <Label>Type</Label>
              <Select value={form.fieldType} onValueChange={(v: CustomFieldDef['fieldType']) => { if (v) setForm({ ...form, fieldType: v }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(form.fieldType === 'select' || form.fieldType === 'multi_select') && (
              <div className="space-y-ds-2">
                <Label htmlFor="field-options">Options (comma-separated)</Label>
                <Input
                  id="field-options"
                  placeholder="e.g., Gold, Silver, Bronze"
                  value={form.options}
                  onChange={(e) => setForm({ ...form, options: e.target.value })}
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label htmlFor="field-required">Required</Label>
              <Switch id="field-required" checked={form.isRequired} onCheckedChange={(v) => setForm({ ...form, isRequired: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {editingId ? 'Save Changes' : 'Create Field'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
