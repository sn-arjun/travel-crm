'use client';

import * as React from 'react';
import { Pencil, Plus, Power, PowerOff, Route, Trash2 } from 'lucide-react';
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
import { settingsApi, type RoutingRule } from '@/lib/api/settings';
import { usersApi } from '@/lib/api/users';
import type { User } from '@travelcrm/shared';

interface RuleForm {
  name: string;
  priority: number;
  condition: string;
  destination: string;
  isActive: boolean;
}

const emptyForm: RuleForm = {
  name: '',
  priority: 1,
  condition: '{}',
  destination: '',
  isActive: true,
};

export default function RoutingRulesPage() {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<RuleForm>(emptyForm);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [cachedRules, setCachedRules] = React.useState<RoutingRule[]>([]);

  const fetchAll = React.useCallback(async (page: number) => {
    if (page > 1) return { data: [], pagination: { total: cachedRules.length } };
    const res = await settingsApi.routingRules.list();
    const rules = ('data' in res ? (res.data as RoutingRule[]) : []) ?? [];
    setCachedRules(rules);
    return { data: rules.sort((a, b) => a.priority - b.priority), pagination: { total: rules.length } };
  }, [cachedRules.length]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, priority: cachedRules.length + 1 });
    setDialogOpen(true);
  };

  const openEdit = (rule: RoutingRule) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      priority: rule.priority,
      condition: JSON.stringify(rule.condition, null, 2),
      destination: rule.destination,
      isActive: rule.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Rule name is required');
      return;
    }
    if (!form.destination) {
      toast.error('Pick a destination user');
      return;
    }
    let parsedCondition: Record<string, unknown> = {};
    try {
      parsedCondition = JSON.parse(form.condition);
    } catch {
      toast.error('Condition must be valid JSON');
      return;
    }
    try {
      if (editingId) {
        await settingsApi.routingRules.update(editingId, {
          name: form.name,
          priority: form.priority,
          condition: parsedCondition,
          destination: form.destination,
          isActive: form.isActive,
        });
        toast.success('Routing rule updated');
      } else {
        await settingsApi.routingRules.create({
          name: form.name,
          priority: form.priority,
          condition: parsedCondition,
          destination: form.destination,
          isActive: form.isActive,
        });
        toast.success('Routing rule created');
      }
      setDialogOpen(false);
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to save routing rule');
    }
  };

  const handleDelete = async (rule: RoutingRule) => {
    try {
      await settingsApi.routingRules.delete(rule.id);
      toast.success('Routing rule deleted');
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete routing rule');
    }
  };

  const handleToggle = async (rule: RoutingRule) => {
    try {
      await settingsApi.routingRules.update(rule.id, { isActive: !rule.isActive });
      toast.success(`Rule ${rule.isActive ? 'disabled' : 'enabled'}`);
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to update rule');
    }
  };

  return (
    <>
      <ListPage<RoutingRule>
        key={refreshKey}
        title="Lead Routing Rules"
        description="Rules are evaluated in priority order (lowest number first)."
        getRowId={(r) => r.id}
        fetcher={({ page }) => fetchAll(page)}
        extractItems={(r) => (r as { data: RoutingRule[] }).data}
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
            key: 'condition',
            header: 'Condition',
            cell: (r) => (
              <code className="text-xs bg-ds-surface-sunken px-ds-2 py-ds-1 rounded-ds-sm">
                {JSON.stringify(r.condition).slice(0, 50)}
                {JSON.stringify(r.condition).length > 50 ? '…' : ''}
              </code>
            ),
          },
          { key: 'destination', header: 'Destination' },
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
              await Promise.all(rows.map((r) => settingsApi.routingRules.delete(r.id)));
              setRefreshKey((k) => k + 1);
            },
          },
        ]}
        onExport={(rows) => {
          const csv = [
            ['Priority', 'Name', 'Condition', 'Destination', 'Status'].join(','),
            ...rows.map((r) =>
              [r.priority, `"${r.name}"`, `"${JSON.stringify(r.condition)}"`, r.destination, r.isActive ? 'Active' : 'Disabled'].join(','),
            ),
          ].join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'routing-rules.csv';
          a.click();
          URL.revokeObjectURL(url);
        }}
        emptyTitle="No routing rules configured"
        emptyDescription="Create rules to automatically route leads to the right team or user."
        emptyIcon={<Route className="h-10 w-10" aria-hidden="true" />}
        emptyAction={
          <Button onClick={openCreate} variant="outline" className="gap-ds-2">
            <Plus className="h-4 w-4" aria-hidden="true" /> Create First Rule
          </Button>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Routing Rule' : 'Create Routing Rule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-ds-4 py-ds-4">
            <div className="space-y-ds-2">
              <Label htmlFor="ruleName">Rule Name</Label>
              <Input
                id="ruleName"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Route high-value leads to senior agent"
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
                <Label htmlFor="ruleDestination">Destination</Label>
                <RelationCombobox<User>
                  value={form.destination || null}
                  onChange={(id) => setForm((p) => ({ ...p, destination: id ?? '' }))}
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
                  placeholder="Select a user or team"
                />
              </div>
            </div>
            <div className="space-y-ds-2">
              <Label htmlFor="ruleCondition">Condition (JSON)</Label>
              <Textarea
                id="ruleCondition"
                value={form.condition}
                onChange={(e) => setForm((p) => ({ ...p, condition: e.target.value }))}
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
