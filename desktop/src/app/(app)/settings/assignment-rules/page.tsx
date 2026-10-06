'use client';

import * as React from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { RelationCombobox } from '@/components/domain';
import {
  Button,
  EmptyState,
  Input,
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
import { fetchUserOptions, resolveUserOption, settingsApi, type AssignmentMode } from '@/lib/api/settings';
import { useApiQuery } from '@/hooks/use-api';
import type { User } from '@travelcrm/shared';
import { PageContainer } from '@/components/layout/page-container';

interface MemberRow {
  key: number;
  userId: string;
  weight: string;
}

const MODES: Array<{ value: AssignmentMode; label: string; hint: string }> = [
  { value: 'round_robin', label: 'Round robin', hint: 'New leads rotate through the team members below, weighted by their share.' },
  { value: 'source_based', label: 'Source based', hint: 'New leads follow the per-source routing rules, falling back to the team below.' },
  { value: 'manual', label: 'Manual', hint: 'New leads stay unassigned until a manager assigns them.' },
];

function AssignmentRulesPageContent() {
  const { data: response, loading } = useApiQuery(() => settingsApi.assignmentRules.get(), []);
  const [mode, setMode] = React.useState<AssignmentMode>('round_robin');
  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [saving, setSaving] = React.useState(false);
  const nextKey = React.useRef(1);

  React.useEffect(() => {
    if (!response || !('data' in response) || !response.data) return;
    setMode(response.data.mode ?? 'round_robin');
    setMembers(
      (response.data.rules ?? []).map((m) => ({
        key: nextKey.current++,
        userId: m.userId,
        weight: String(m.weight ?? 1),
      })),
    );
  }, [response]);

  const updateMember = (key: number, patch: Partial<MemberRow>) =>
    setMembers((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addMember = () =>
    setMembers((rows) => [...rows, { key: nextKey.current++, userId: '', weight: '1' }]);

  const handleSave = async () => {
    if (members.some((m) => !m.userId)) {
      toast.error('Pick a user for every team member row');
      return;
    }
    if (new Set(members.map((m) => m.userId)).size !== members.length) {
      toast.error('Each user can only appear once');
      return;
    }
    if (members.some((m) => !/^\d+$/.test(m.weight) || Number(m.weight) < 1 || Number(m.weight) > 10)) {
      toast.error('Weight must be a whole number from 1 to 10');
      return;
    }
    setSaving(true);
    try {
      await settingsApi.assignmentRules.update({
        mode,
        rules: members.map((m) => ({ userId: m.userId, weight: Number(m.weight) })),
      });
      toast.success('Assignment rules saved successfully');
    } catch {
      toast.error('Failed to save assignment rules');
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

  const activeMode = MODES.find((m) => m.value === mode);

  return (
    <div className="flex flex-col gap-ds-4">
      <PageHeader
        title="Assignment Rules"
        description="Choose how new leads are assigned to your team."
        sticky
        actions={
          <Button onClick={handleSave} disabled={saving} className="gap-ds-2">
            {saving && <Spinner className="size-4" />}
            Save Assignment Rules
          </Button>
        }
      />

      <SectionCard title="Assignment Mode" description={activeMode?.hint}>
        <div className="flex max-w-sm flex-col gap-ds-1">
          <Label htmlFor="assignmentMode">Mode</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as AssignmentMode)}>
            <SelectTrigger id="assignmentMode"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SectionCard>

      <SectionCard title="Team Members" description="A weight of 2 receives twice as many leads as a weight of 1.">
        {members.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10" aria-hidden="true" />}
            title="No team members configured"
            description="Add the people who should receive new leads."
            action={
              <Button variant="outline" onClick={addMember} className="gap-ds-2">
                <Plus className="h-4 w-4" aria-hidden="true" /> Add Team Member
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-ds-3">
            {members.map((m, idx) => (
              <div key={m.key} className="grid grid-cols-[1fr_96px_auto] items-end gap-ds-3" data-testid="assignment-member-row">
                <div className="flex flex-col gap-ds-1">
                  <Label>User</Label>
                  <RelationCombobox<User>
                    value={m.userId || null}
                    onChange={(id) => updateMember(m.key, { userId: id ?? '' })}
                    fetcher={fetchUserOptions}
                    getOptionId={(u) => u.id}
                    getOptionLabel={(u) => u.name}
                    getOptionDescription={(u) => u.email}
                    resolveSelected={resolveUserOption}
                    placeholder="Select a user"
                    aria-label={`Team member ${idx + 1}`}
                  />
                </div>
                <div className="flex flex-col gap-ds-1">
                  <Label>Weight</Label>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={m.weight}
                    onChange={(e) => updateMember(m.key, { weight: e.target.value })}
                    aria-label={`Weight ${idx + 1}`}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove team member ${idx + 1}`}
                  onClick={() => setMembers((rows) => rows.filter((r) => r.key !== m.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div>
              <Button variant="outline" size="sm" onClick={addMember} className="gap-ds-2">
                <Plus className="h-4 w-4" aria-hidden="true" /> Add Team Member
              </Button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default function AssignmentRulesPage() {
  return (
    <PageContainer>
      <AssignmentRulesPageContent />
    </PageContainer>
  );
}
