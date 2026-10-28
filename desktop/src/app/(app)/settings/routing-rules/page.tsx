'use client';

import * as React from 'react';
import { Plus, Route, Trash2 } from 'lucide-react';
import { RelationCombobox } from '@/components/domain';
import {
  Button,
  EmptyState,
  Label,
  PageHeader,
  SectionCard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Spinner,
} from '@/components/ui';
import { toast } from 'sonner';
import { fetchUserOptions, resolveUserOption, settingsApi, type LeadSource } from '@/lib/api/settings';
import { useApiQuery } from '@/hooks/use-api';
import type { User } from '@travelcrm/shared';
import { PageContainer } from '@/components/layout/page-container';

interface RuleRow {
  key: number;
  source: LeadSource | '';
  assignToUserId: string;
}

const SOURCES: Array<{ value: LeadSource; label: string }> = [
  { value: 'manual', label: 'Manual entry' },
  { value: 'website', label: 'Website' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'google', label: 'Google' },
  { value: 'referral', label: 'Referral' },
  { value: 'walkin', label: 'Walk-in' },
];

function RoutingRulesPageContent() {
  const { data: response, loading } = useApiQuery(() => settingsApi.routingRules.get(), []);
  const [rows, setRows] = React.useState<RuleRow[]>([]);
  const [saving, setSaving] = React.useState(false);
  const nextKey = React.useRef(1);

  React.useEffect(() => {
    if (!response || !('data' in response) || !Array.isArray(response.data)) return;
    setRows(
      response.data.map((r) => ({
        key: nextKey.current++,
        source: r.source,
        assignToUserId: r.assignToUserId,
      })),
    );
  }, [response]);

  const updateRow = (key: number, patch: Partial<RuleRow>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((list) => {
      const used = new Set(list.map((r) => r.source));
      const free = SOURCES.find((s) => !used.has(s.value));
      return [...list, { key: nextKey.current++, source: free?.value ?? '', assignToUserId: '' }];
    });

  const handleSave = async () => {
    if (rows.some((r) => !r.source)) {
      toast.error('Pick a lead source for every rule');
      return;
    }
    if (rows.some((r) => !r.assignToUserId)) {
      toast.error('Pick a user to assign to for every rule');
      return;
    }
    if (new Set(rows.map((r) => r.source)).size !== rows.length) {
      toast.error('Each lead source can only have one rule');
      return;
    }
    setSaving(true);
    try {
      await settingsApi.routingRules.update(
        rows.map((r) => ({ source: r.source as LeadSource, assignToUserId: r.assignToUserId })),
      );
      toast.success('Routing rules saved successfully');
    } catch {
      toast.error('Failed to save routing rules');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-ds-4">
      <PageHeader
        title="Lead Routing Rules"
        description="Send leads from a given source straight to a specific user."
        sticky
        actions={
          <Button onClick={handleSave} disabled={saving} className="gap-ds-2">
            {saving && <Spinner className="size-4" />}
            Save Routing Rules
          </Button>
        }
      />

      <SectionCard title="Source Routing" description="Each lead source can route to one user.">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Route className="h-10 w-10" aria-hidden="true" />}
            title="No routing rules configured"
            description="Create a rule to route leads from a source to the right user."
            action={
              <Button variant="outline" onClick={addRow} className="gap-ds-2">
                <Plus className="h-4 w-4" aria-hidden="true" /> Add Rule
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-ds-3">
            {rows.map((r, idx) => (
              <div key={r.key} className="grid grid-cols-[200px_1fr_auto] items-end gap-ds-3" data-testid="routing-rule-row">
                <div className="flex flex-col gap-ds-1">
                  <Label>Lead Source</Label>
                  <Select value={r.source} onValueChange={(v) => updateRow(r.key, { source: v as LeadSource })}>
                    <SelectTrigger aria-label={`Lead source ${idx + 1}`}><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      {SOURCES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-ds-1">
                  <Label>Assign To</Label>
                  <RelationCombobox<User>
                    value={r.assignToUserId || null}
                    onChange={(id) => updateRow(r.key, { assignToUserId: id ?? '' })}
                    fetcher={fetchUserOptions}
                    getOptionId={(u) => u.id}
                    getOptionLabel={(u) => u.name}
                    getOptionDescription={(u) => u.email}
                    resolveSelected={resolveUserOption}
                    placeholder="Select a user"
                    aria-label={`Assign to ${idx + 1}`}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove rule ${idx + 1}`}
                  onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div>
              <Button variant="outline" size="sm" onClick={addRow} disabled={rows.length >= SOURCES.length} className="gap-ds-2">
                <Plus className="h-4 w-4" aria-hidden="true" /> Add Rule
              </Button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default function RoutingRulesPage() {
  return (
    <PageContainer>
      <RoutingRulesPageContent />
    </PageContainer>
  );
}
