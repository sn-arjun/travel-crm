'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Plus, Trash2, Save, Loader2, Users, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiMutation } from '@/hooks/use-api';
import { marketingApi, type CreateSegmentRequest } from '@/lib/api/marketing';

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
    { value: 'last_n_days', label: 'In Last N Days' },
  ],
};

function getFieldType(field: string): 'text' | 'number' | 'date' {
  if (['total_spent', 'trip_count'].includes(field)) return 'number';
  if (['last_trip_date', 'created_at'].includes(field)) return 'date';
  return 'text';
}

function createRule(): Rule {
  return { id: String(Date.now()), field: 'city', operator: 'equals', value: '' };
}

function createRuleGroup(): RuleGroup {
  return { id: String(Date.now()), logic: 'AND', rules: [createRule()] };
}

export default function NewSegmentPage() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [groups, setGroups] = React.useState<RuleGroup[]>([createRuleGroup()]);
  const [previewCount, setPreviewCount] = React.useState<number | null>(null);

  const { mutate: createSegment, loading: saving } = useApiMutation(
    (data: CreateSegmentRequest) => marketingApi.segments.create(data),
  );

  function updateRule(groupId: string, ruleId: string, updates: Partial<Rule>) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, rules: g.rules.map((r) => (r.id === ruleId ? { ...r, ...updates } : r)) }
          : g,
      ),
    );
  }

  function addRule(groupId: string) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, rules: [...g.rules, createRule()] } : g,
      ),
    );
  }

  function removeRule(groupId: string, ruleId: string) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, rules: g.rules.filter((r) => r.id !== ruleId) } : g,
      ).filter((g) => g.rules.length > 0),
    );
  }

  function toggleGroupLogic(groupId: string) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, logic: g.logic === 'AND' ? 'OR' : 'AND' } : g,
      ),
    );
  }

  function addGroup() {
    setGroups((prev) => [...prev, createRuleGroup()]);
  }

  function handlePreview() {
    // Simulate preview count
    const count = Math.floor(Math.random() * 500) + 50;
    setPreviewCount(count);
    toast.info(`Estimated ${count} matching contacts`);
  }

  function buildCriteria(): Record<string, unknown> {
    const criteria: Record<string, unknown> = {
      groups: groups.map((g) => ({
        logic: g.logic,
        rules: g.rules.map((r) => ({
          field: r.field,
          operator: r.operator,
          value: r.value,
        })),
      })),
    };
    return criteria;
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Segment name is required');
      return;
    }

    const hasEmptyRules = groups.some((g) => g.rules.some((r) => !r.value.trim()));
    if (hasEmptyRules) {
      toast.error('All rule values must be filled in');
      return;
    }

    const result = await createSegment({
      name: name.trim(),
      criteria: buildCriteria(),
    });

    if (result) {
      toast.success('Segment created successfully');
      router.push('/marketing/segments');
    } else {
      toast.error('Failed to create segment');
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              New Segment
            </h1>
            <p className="text-sm text-muted-foreground">Define rules to group your contacts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handlePreview}>
            <Eye className="h-4 w-4 mr-1.5" /> Preview
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Segment
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Segment Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
                <Input
                  id="name"
                  placeholder="e.g., High-value customers in Mumbai"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the purpose of this segment..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Rule Builder */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Rules</span>
                {previewCount !== null && (
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3 w-3" />
                    ~{previewCount} contacts
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {groups.map((group, gi) => (
                <div key={group.id} className="space-y-3">
                  {gi > 0 && (
                    <div className="flex items-center gap-3">
                      <div className="flex-1 border-t" />
                      <Badge variant="outline" className="text-xs font-medium">OR</Badge>
                      <div className="flex-1 border-t" />
                    </div>
                  )}

                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => toggleGroupLogic(group.id)}
                      >
                        Match <Badge variant="outline" className="mx-1">{group.logic}</Badge> of the following
                      </Button>
                    </div>

                    {group.rules.map((rule, ri) => {
                      const fieldType = getFieldType(rule.field);
                      const operators = operatorOptions[fieldType] ?? operatorOptions.text!;
                      return (
                        <div key={rule.id} className="flex items-center gap-2">
                          {ri > 0 && (
                            <Badge variant="secondary" className="text-[10px] shrink-0 w-10 justify-center">
                              {group.logic}
                            </Badge>
                          )}
                          {ri === 0 && <div className="w-10 shrink-0" />}
                          <Select
                            value={rule.field}
                            onValueChange={(v) => updateRule(group.id, rule.id, { field: v, operator: 'equals', value: '' })}
                          >
                            <SelectTrigger className="w-36 h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {fieldOptions.map((f) => (
                                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={rule.operator}
                            onValueChange={(v) => updateRule(group.id, rule.id, { operator: v })}
                          >
                            <SelectTrigger className="w-36 h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {operators.map((op) => (
                                <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Value..."
                            value={rule.value}
                            onChange={(e) => updateRule(group.id, rule.id, { value: e.target.value })}
                            className="flex-1 h-9"
                            type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => removeRule(group.id, rule.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => addRule(group.id)}
                      className="mt-2"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Rule
                    </Button>
                  </div>
                </div>
              ))}

              <Button variant="outline" onClick={addGroup} className="w-full">
                <Plus className="h-4 w-4 mr-1.5" /> Add Rule Group (OR)
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
