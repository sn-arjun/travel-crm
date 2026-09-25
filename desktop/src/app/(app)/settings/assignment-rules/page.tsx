'use client';

import * as React from 'react';
import { Pencil, Plus, Power, PowerOff, Trash2, Users } from 'lucide-react';
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
  Switch,
  Tag,
  Textarea,
} from '@/components/ui';
import { toast } from 'sonner';
import { settingsApi, type AssignmentRule } from '@/lib/api/settings';
import { usersApi } from '@/lib/api/users';
import type { User } from '@travelcrm/shared';

interface RuleForm {
  name: string;
  priority: number;
  criteria: string;
  assignTo: string;
  isActive: boolean;
}

const emptyForm: RuleForm = {
  name: '',
  priority: 1,
  criteria: '{}',
  assignTo: '',
  isActive: true,
};

export default function AssignmentRulesPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<RuleForm>(emptyForm);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [cachedRules, setCachedRules] = React.useState<AssignmentRule[]>([]);

  const fetchAll = React.useCallback(async (page: number) => {
    if (page > 1) return { data: [], pagination: { total: cachedRules.length } };
    const res = await settingsApi.assignmentRules.list();
    const rules = ('data' in res ? (res.data as AssignmentRule[]) : []) ?? [];
    setCachedRules(rules);
    return { data: rules.sort((a, b) => a.priority - b.priority), pagination: { total: rules.length } };
  }, [cachedRules.length]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, priority: cachedRules.length + 1 });
    setDialogOpen(true);
  };

  const openEdit = (rule: AssignmentRule) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      priority: rule.priority,
      criteria: JSON.stringify(rule.criteria, null, 2),
      assignTo: rule.assignTo,
      isActive: rule.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Rule name is required');
      return;
    }
    if (!form.assignTo) {
      toast.error('Pick a user to assign to');
      return;
    }
    let parsedCriteria: Record<string, unknown> = {};
    try {
      parsedCriteria = JSON.parse(form.criteria);
    } catch {
      toast.error('Criteria must be valid JSON');
      return;
    }
    try {
      if (editingId) {
        await settingsApi.assignmentRules.update(editingId, {
          name: form.name,
          priority: form.priority,
          criteria: parsedCriteria,
          assignTo: form.assignTo,
          isActive: form.isActive,
        });
        toast.success('Assignment rule updated');
      } else {
        await settingsApi.assignmentRules.create({
          name: form.name,
          priority: form.priority,
          criteria: parsedCriteria,
          assignTo: form.assignTo,
          isActive: form.isActive,
        });
        toast.success('Assignment rule created');
      }
      setDialogOpen(false);
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to save assignment rule');
    }
  };

  const handleDelete = async (rule: AssignmentRule) => {
    try {
      await settingsApi.assignmentRules.delete(rule.id);
      toast.success('Assignment rule deleted');
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete assignment rule');
    }
  };

  const handleToggle = async (rule: AssignmentRule) => {
    try {
      await settingsApi.assignmentRules.update(rule.id, { isActive: !rule.isActive });
      toast.success(`Rule ${rule.isActive ? 'disabled' : 'enabled'}`);
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to update rule');
    }
  };

  return (
    <>
      <ListPage<AssignmentRule>
        key={refreshKey}
        title="Assignment Rules"
        description="Rules are evaluated in priority order (lowest number first). Matching leads are automatically assigned to the specified user."
        getRowId={(r) => r.id}
        fetcher={({ page }) => fetchAll(page)}
        extractItems={(r) => (r as { data: AssignmentRule[] }).data}
        extractTotal={(r) => (r as { pagination: { total: number } }).pagination.total}
        primaryAction={
          <Button size="sm" onClick={openCreate} className="gap-ds-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Rule
          </Button>
        }
        columns={[
          { key: 'priority', header: 'Priority', width: '90px', cell: (r) => <span className="font-mono text-sm">{r.priority}</span> },
          { key: 'name', header: 'Name', sortable: true },
          {
            key: 'criteria',
            header: 'Criteria',
            cell: (r) => (
              <code className="text-xs bg-ds-surface-sunken px-ds-2 py-ds-1 rounded-ds-sm">
                {JSON.stringify(r.criteria).slice(0, 50)}
                {JSON.stringify(r.criteria).length > 50 ? '…' : ''}
              </code>
            ),
          },
          { key: 'assignTo', header: 'Assign To' },
          {
            key: 'isActive',
            header: 'Status',
            cell: (r) => <Tag tone={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'Active' : 'Disabled'}</Tag>,
          },
        ]}
        rowActions={(r) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label={r.isActive ? 'Disable' : 'Enable'} onClick={() => handleToggle(r)}>
              {r.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => openEdit(r)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => handleDelete(r)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
        bulkActions={[
          {
            label: 'Delete',
            destructive: true,
            onSelect: async (rows) => {
              await Promise.all(rows.map((r) => settingsApi.assignmentRules.delete(r.id)));
              setRefreshKey((k) => k + 1);
            },
          },
        ]}
        onExport={(rows) => {
          const csv = [
            ['Priority', 'Name', 'Criteria', 'Assign To', 'Status'].join(','),
            ...rows.map((r) =>
              [r.priority, `"${r.name}"`, `"${JSON.stringify(r.criteria)}"`, r.assignTo, r.isActive ? 'Active' : 'Disabled'].join(','),
            ),
          ].join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'assignment-rules.csv';
          a.click();
          URL.revokeObjectURL(url);
        }}
        emptyTitle="No assignment rules configured"
        emptyDescription="Create rules to automatically assign leads based on source, budget, or other criteria."
        emptyIcon={<Users className="h-10 w-10" aria-hidden="true" />}
        emptyAction={
          <Button onClick={openCreate} variant="outline" className="gap-ds-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Create First Rule
          </Button>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Assignment Rule' : 'Create Assignment Rule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-ds-4 py-ds-4">
            <div className="space-y-ds-2">
              <Label htmlFor="ruleName">Rule Name</Label>
              <Input
                id="ruleName"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Assign high-budget leads to senior team"
              />
            </div>
            <div className="grid grid-cols-2 gap-ds-4">
              <div className="space-y-ds-2">
                <Label htmlFor="rulePriority">Priority</Label>
                <Input
                  id="rulePriority"
                  type="number"
                  min={1}
                  value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: parseInt(e.target.value, 10) || 1 }))}
                />
              </div>
              <div className="space-y-ds-2">
                <Label htmlFor="ruleAssignTo">Assign To</Label>
                <RelationCombobox<User>
                  value={form.assignTo || null}
                  onChange={(id) => setForm((p) => ({ ...p, assignTo: id ?? '' }))}
                  fetcher={async (q, page) => {
                    const r = await usersApi.list({ search: q, page, limit: 20 });
                    const items = ('data' in r ? r.data.data : []) ?? [];
                    const total = ('data' in r ? r.data.pagination?.total : 0) ?? 0;
                    return { items, total };
                  }}
                  getOptionId={(u) => u.id}
                  getOptionLabel={(u) => u.name}
                  getOptionDescription={(u) => u.email}
                  resolveSelected={async (id) => {
                    const r = await usersApi.getById(id);
                    return 'data' in r ? r.data : null;
                  }}
                  placeholder="Select a user"
                />
              </div>
            </div>
            <div className="space-y-ds-2">
              <Label htmlFor="ruleCriteria">Criteria (JSON)</Label>
              <Textarea
                id="ruleCriteria"
                value={form.criteria}
                onChange={(e) => setForm((p) => ({ ...p, criteria: e.target.value }))}
                rows={5}
                className="font-mono text-sm"
                placeholder='{"source": "website", "budget": {"$gt": 50000}}'
              />
            </div>
            <div className="flex items-center gap-ds-3">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))} />
              <Label>Active</Label>
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
