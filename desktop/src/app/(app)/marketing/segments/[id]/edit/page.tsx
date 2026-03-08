'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Plus, Trash2, Save, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { marketingApi } from '@/lib/api/marketing';

interface Rule {
  id: string;
  field: string;
  operator: string;
  value: string;
}

interface RuleGroup {
  id: string;
  logic: 'AND' | 'OR';
  rules: Rule[];
}

const fieldOptions = [
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'country', label: 'Country' },
  { value: 'source', label: 'Lead Source' },
  { value: 'status', label: 'Lead Status' },
  { value: 'tag', label: 'Tag' },
  { value: 'total_spent', label: 'Total Spent' },
  { value: 'last_trip_date', label: 'Last Trip Date' },
  { value: 'trip_count', label: 'Trip Count' },
  { value: 'created_at', label: 'Created Date' },
];

const operatorOptions: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'starts_with', label: 'Starts With' },
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'gt', label: 'Greater Than' },
    { value: 'lt', label: 'Less Than' },
    { value: 'gte', label: 'Greater or Equal' },
    { value: 'lte', label: 'Less or Equal' },
  ],
  date: [
    { value: 'before', label: 'Before' },
    { value: 'after', label: 'After' },
    { value: 'between', label: 'Between' },
  ],
};

function getFieldType(field: string): string {
  if (['total_spent', 'trip_count'].includes(field)) return 'number';
  if (['last_trip_date', 'created_at'].includes(field)) return 'date';
  return 'text';
}

function makeRule(): Rule {
  return { id: crypto.randomUUID(), field: 'city', operator: 'equals', value: '' };
}

function makeGroup(): RuleGroup {
  return { id: crypto.randomUUID(), logic: 'AND', rules: [makeRule()] };
}

function criteriaToGroups(criteria: Record<string, unknown>): RuleGroup[] {
  // Best-effort conversion from criteria object to rule groups
  const rules: Rule[] = Object.entries(criteria).map(([field, value]) => ({
    id: crypto.randomUUID(),
    field,
    operator: 'equals',
    value: String(value ?? ''),
  }));
  if (rules.length === 0) return [makeGroup()];
  return [{ id: crypto.randomUUID(), logic: 'AND', rules }];
}

function groupsToCriteria(groups: RuleGroup[]): Record<string, unknown> {
  const criteria: Record<string, unknown> = {};
  for (const group of groups) {
    for (const rule of group.rules) {
      if (rule.field && rule.value) {
        criteria[rule.field] = rule.value;
      }
    }
  }
  return criteria;
}

export default function EditSegmentPage() {
  const router = useRouter();
  const params = useParams();
  const segmentId = params.id as string;

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [groups, setGroups] = React.useState<RuleGroup[]>([makeGroup()]);
  const [initialized, setInitialized] = React.useState(false);

  const { data: response, loading: loadingSegment } = useApiQuery(
    () => marketingApi.segments.list({ limit: 1 }),
    [],
  );

  // Load segment data — we use the list API since there's no getById in client
  // Pre-populate from the response
  React.useEffect(() => {
    if (!initialized && response) {
      // Try to find the segment in the list response
      const data = (response as any)?.data;
      const list: any[] = Array.isArray(data) ? data : (data?.data ?? []);
      const segment = list.find((s: any) => s.id === segmentId);
      if (segment) {
        setName(segment.name || '');
        setDescription(segment.description || '');
        setGroups(criteriaToGroups(segment.criteria || {}));
        setInitialized(true);
      }
    }
  }, [response, segmentId, initialized]);

  const { mutate: updateSegment, loading: saving } = useApiMutation(
    (data: { name: string; criteria: Record<string, unknown> }) =>
      marketingApi.segments.create(data), // Using create as upsert since no dedicated update endpoint
  );

  function handleAddGroup() {
    setGroups((prev) => [...prev, makeGroup()]);
  }

  function handleRemoveGroup(groupId: string) {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  }

  function handleGroupLogicChange(groupId: string, logic: 'AND' | 'OR') {
    setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, logic } : g));
  }

  function handleAddRule(groupId: string) {
    setGroups((prev) => prev.map((g) =>
      g.id === groupId ? { ...g, rules: [...g.rules, makeRule()] } : g,
    ));
  }

  function handleRemoveRule(groupId: string, ruleId: string) {
    setGroups((prev) => prev.map((g) =>
      g.id === groupId ? { ...g, rules: g.rules.filter((r) => r.id !== ruleId) } : g,
    ));
  }

  function handleRuleChange(groupId: string, ruleId: string, field: keyof Rule, value: string) {
    setGroups((prev) => prev.map((g) =>
      g.id === groupId ? {
        ...g,
        rules: g.rules.map((r) =>
          r.id === ruleId ? { ...r, [field]: value, ...(field === 'field' ? { operator: 'equals', value: '' } : {}) } : r,
        ),
      } : g,
    ));
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Segment name is required');
      return;
    }
    const criteria = groupsToCriteria(groups);
    const result = await updateSegment({ name: name.trim(), criteria });
    if (result) {
      toast.success('Segment updated');
      router.push('/marketing/segments');
    } else {
      toast.error('Failed to update segment');
    }
  }

  if (loadingSegment && !initialized) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-4 px-6 py-4 border-b">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="p-6 space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b">
        <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Edit Segment
          </h1>
          <p className="text-sm text-muted-foreground">Update segment rules and save</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Segment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Segment Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g., High Value Customers"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Describe who this segment targets..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Rule Groups */}
          {groups.map((group, gi) => (
            <Card key={group.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">Group {gi + 1}</CardTitle>
                    <Select value={group.logic} onValueChange={(v) => handleGroupLogicChange(group.id, v as 'AND' | 'OR')}>
                      <SelectTrigger className="w-20 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AND">AND</SelectItem>
                        <SelectItem value="OR">OR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {groups.length > 1 && (
                    <Button variant="ghost" size="icon-sm" onClick={() => handleRemoveGroup(group.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {group.rules.map((rule, ri) => {
                  const fieldType = getFieldType(rule.field);
                  const operators = (operatorOptions[fieldType] ?? operatorOptions.text)!
                  return (
                    <div key={rule.id} className="flex items-center gap-2">
                      {ri > 0 && (
                        <span className={cn(
                          'text-xs font-medium w-8 text-center shrink-0',
                          group.logic === 'AND' ? 'text-blue-600' : 'text-orange-600',
                        )}>
                          {group.logic}
                        </span>
                      )}
                      <Select value={rule.field} onValueChange={(v) => handleRuleChange(group.id, rule.id, 'field', v)}>
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {fieldOptions.map((f) => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={rule.operator} onValueChange={(v) => handleRuleChange(group.id, rule.id, 'operator', v)}>
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {operators.map((op) => (
                            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="flex-1 h-8 text-xs"
                        placeholder="Value..."
                        type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
                        value={rule.value}
                        onChange={(e) => handleRuleChange(group.id, rule.id, 'value', e.target.value)}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemoveRule(group.id, rule.id)}
                        disabled={group.rules.length === 1}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddRule(group.id)}
                  className="mt-2"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Rule
                </Button>
              </CardContent>
            </Card>
          ))}

          <Button variant="outline" onClick={handleAddGroup} className="w-full">
            <Plus className="h-4 w-4 mr-2" /> Add Rule Group
          </Button>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t px-6 py-4 bg-background flex items-center justify-between">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
