'use client';

import * as React from 'react';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { EntityForm, FormRow } from '@/components/domain';
import {
  Button, Input, Textarea, SectionCard, Badge, DatePicker,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { marketingApi } from '@/lib/api/marketing';
import {
  fieldOptions, operatorOptions, getFieldType, makeRule, makeGroup,
  groupsToCriteria, type RuleGroup,
} from '../rule-builder';

const schema = z.object({
  name: z.string().min(1, 'Segment name is required'),
  description: z.string().optional(),
});
type SegmentFormValues = z.infer<typeof schema>;

export default function NewSegmentPage() {
  const router = useRouter();
  const [groups, setGroups] = React.useState<RuleGroup[]>([makeGroup()]);
  const [previewCount, setPreviewCount] = React.useState<number | null>(null);
  const [previewing, setPreviewing] = React.useState(false);

  function updateRule(groupId: string, ruleId: string, updates: Partial<RuleGroup['rules'][number]>) {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, rules: g.rules.map((r) => (r.id === ruleId ? { ...r, ...updates } : r)) }
          : g,
      ),
    );
  }

  function addRule(groupId: string) {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, rules: [...g.rules, makeRule()] } : g)));
  }

  function removeRule(groupId: string, ruleId: string) {
    setGroups((prev) =>
      prev
        .map((g) => (g.id === groupId ? { ...g, rules: g.rules.filter((r) => r.id !== ruleId) } : g))
        .filter((g) => g.rules.length > 0),
    );
  }

  function toggleGroupLogic(groupId: string) {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, logic: g.logic === 'AND' ? 'OR' : 'AND' } : g)),
    );
  }

  async function handlePreview(name: string) {
    const criteria = groupsToCriteria(groups);
    setPreviewing(true);
    try {
      const created = await marketingApi.segments.create({ name: name || 'Untitled segment', criteria });
      const refreshed = await marketingApi.segments.refreshCount(created.data.id);
      setPreviewCount(refreshed.data.contactCount ?? 0);
      await marketingApi.segments.delete(created.data.id);
      toast.info(`Estimated ${refreshed.data.contactCount ?? 0} matching contacts`);
    } catch {
      toast.error('Could not estimate matching contacts');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSubmit(values: SegmentFormValues) {
    const hasEmptyRules = groups.some((g) => g.rules.some((r) => !r.value.trim()));
    if (hasEmptyRules) {
      toast.error('All rule values must be filled in');
      return;
    }
    try {
      await marketingApi.segments.create({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        criteria: groupsToCriteria(groups),
      });
      toast.success('Segment created successfully');
      router.push('/marketing/segments');
    } catch {
      toast.error('Failed to create segment');
    }
  }

  return (
    <EntityForm<SegmentFormValues>
      title="New segment"
      description="Define rules to group your contacts."
      schema={schema}
      defaultValues={{ name: '', description: '' }}
      onCancel={() => router.back()}
      onSubmit={handleSubmit}
      renderSections={(form) => (
        <>
          <SectionCard title="Segment details" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="name" label="Name" required wide>
                <Input
                  id="name"
                  placeholder="e.g., High-value customers in Mumbai"
                  {...form.register('name')}
                />
              </FormRow>
              <FormRow name="description" label="Description" wide>
                <Textarea
                  id="description"
                  placeholder="Describe the purpose of this segment..."
                  rows={2}
                  {...form.register('description')}
                />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard
            title="Rules"
            description={previewCount !== null ? `~${previewCount} matching contacts` : undefined}
          >
            <div className="flex flex-col gap-ds-4 sm:col-span-2">
              {groups.map((group, gi) => (
                <div key={group.id} className="flex flex-col gap-ds-3">
                  {gi > 0 && (
                    <div className="flex items-center gap-ds-3">
                      <div className="flex-1 border-t border-ds-border" />
                      <Badge variant="outline" className="text-xs font-medium">OR</Badge>
                      <div className="flex-1 border-t border-ds-border" />
                    </div>
                  )}

                  <div className="rounded-ds-md border border-ds-border p-ds-4 flex flex-col gap-ds-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-fit text-xs"
                      onClick={() => toggleGroupLogic(group.id)}
                    >
                      Match <Badge variant="outline" className="mx-1">{group.logic}</Badge> of the following
                    </Button>

                    {group.rules.map((rule, ri) => {
                      const fieldType = getFieldType(rule.field);
                      const operators = operatorOptions[fieldType] ?? operatorOptions.text;
                      return (
                        <div key={rule.id} className="flex items-center gap-ds-2">
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
                            <SelectTrigger className="w-36">
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
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {operators.map((op) => (
                                <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {fieldType === 'date' ? (
                            <DatePicker
                              value={rule.value ? new Date(rule.value) : undefined}
                              onChange={(d) => updateRule(group.id, rule.id, { value: d ? d.toISOString().slice(0, 10) : '' })}
                              className="flex-1"
                            />
                          ) : (
                            <Input
                              placeholder="Value..."
                              value={rule.value}
                              onChange={(e) => updateRule(group.id, rule.id, { value: e.target.value })}
                              className="flex-1"
                              type={fieldType === 'number' ? 'number' : 'text'}
                            />
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Remove rule"
                            onClick={() => removeRule(group.id, rule.id)}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </div>
                      );
                    })}

                    <Button type="button" variant="outline" size="sm" onClick={() => addRule(group.id)} className="w-fit">
                      <Plus aria-hidden="true" /> Add rule
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-ds-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setGroups((prev) => [...prev, makeGroup()])}
                >
                  <Plus aria-hidden="true" /> Add rule group (OR)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handlePreview(form.watch('name'))}
                  disabled={previewing}
                >
                  {previewing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  Preview count
                </Button>
              </div>
            </div>
          </SectionCard>
        </>
      )}
    />
  );
}
