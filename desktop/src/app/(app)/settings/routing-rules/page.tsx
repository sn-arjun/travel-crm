'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Route,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Power,
  PowerOff,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { settingsApi, type RoutingRule } from '@/lib/api/settings';
import { cn } from '@/lib/utils';

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
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<RuleForm>(emptyForm);

  const { data: rulesResponse, loading, refetch } = useApiQuery(
    () => settingsApi.routingRules.list(),
    [],
  );

  const rules: RoutingRule[] = React.useMemo(() => {
    if (!rulesResponse || !('data' in rulesResponse)) return [];
    return (rulesResponse.data as RoutingRule[]) ?? [];
  }, [rulesResponse]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, priority: rules.length + 1 });
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
      refetch();
    } catch {
      toast.error('Failed to save routing rule');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await settingsApi.routingRules.delete(id);
      toast.success('Routing rule deleted');
      refetch();
    } catch {
      toast.error('Failed to delete routing rule');
    }
  };

  const handleToggle = async (rule: RoutingRule) => {
    try {
      await settingsApi.routingRules.update(rule.id, { isActive: !rule.isActive });
      toast.success(`Rule ${rule.isActive ? 'disabled' : 'enabled'}`);
      refetch();
    } catch {
      toast.error('Failed to update rule');
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
          <h1 className="text-3xl font-bold tracking-tight">Lead Routing Rules</h1>
          <p className="text-muted-foreground mt-1">Configure automatic lead assignment and routing</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Rule
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Route className="h-5 w-5" />
            Routing Rules ({rules.length})
          </CardTitle>
          <CardDescription>Rules are evaluated in priority order (lowest number first)</CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-12">
              <Route className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No routing rules configured</p>
              <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
                <Plus className="h-4 w-4" />
                Create First Rule
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Priority</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules
                  .sort((a, b) => a.priority - b.priority)
                  .map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm">{rule.priority}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{rule.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {JSON.stringify(rule.condition).slice(0, 50)}
                          {JSON.stringify(rule.condition).length > 50 ? '...' : ''}
                        </code>
                      </TableCell>
                      <TableCell className="text-sm">{rule.destination}</TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            rule.isActive
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
                          )}
                        >
                          {rule.isActive ? 'Active' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggle(rule)}>
                            {rule.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(rule)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(rule.id)}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Routing Rule' : 'Create Routing Rule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ruleName">Rule Name</Label>
              <Input
                id="ruleName"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Route high-value leads to senior agent"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rulePriority">Priority</Label>
                <Input
                  id="rulePriority"
                  type="number"
                  min={1}
                  value={form.priority}
                  onChange={(e) => setForm((p) => ({ ...p, priority: parseInt(e.target.value) || 1 }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ruleDestination">Destination (User/Team)</Label>
                <Input
                  id="ruleDestination"
                  value={form.destination}
                  onChange={(e) => setForm((p) => ({ ...p, destination: e.target.value }))}
                  placeholder="user-id or team name"
                />
              </div>
            </div>
            <div className="space-y-2">
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
            <div className="flex items-center gap-3">
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((p) => ({ ...p, isActive: v }))}
              />
              <Label>Active</Label>
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
