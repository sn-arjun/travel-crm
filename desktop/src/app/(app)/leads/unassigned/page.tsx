'use client';

import { formatWholeCurrency } from '@/lib/format';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, UserPlus, ArrowLeft } from 'lucide-react';
import { ListPage } from '@/components/domain';
import { Button, Tag } from '@/components/ui';
import { leadsApi } from '@/lib/api/leads';
import { unwrapList } from '@/lib/api/envelope';
import { LEAD_STATUS_LABELS } from '@travelcrm/shared';

import { formatDisplayDate } from '@/lib/dates';
import { LeadAssignDialog } from '../lead-assign-dialog';
import { leadDestination, priorityLabel, type LeadRow } from '../lead-labels';

function formatCurrency(amount: number, currency?: string | null) {
  return formatWholeCurrency(amount, currency || undefined);
}

export default function UnassignedLeadsPage() {
  const router = useRouter();
  const [assignDialogOpen, setAssignDialogOpen] = React.useState(false);
  const [assignLeadIds, setAssignLeadIds] = React.useState<string[]>([]);
  const [refreshKey, setRefreshKey] = React.useState(0);

  function openAssign(leadIds: string[]) {
    setAssignLeadIds(leadIds);
    setAssignDialogOpen(true);
  }

  return (
    <>
      <ListPage<LeadRow>
        refreshKey={refreshKey}
        title="Unassigned Leads"
        description="Leads with no owner — assign them to a team member."
        getRowId={(l) => l.id}
        fetcher={async ({ page, limit, search }) => {
          const res = await leadsApi.getUnassigned({ page, limit });
          if (!search) return res;
          const needle = search.toLowerCase();
          const list = unwrapList<LeadRow>(res, { page, limit });
          const filtered = list.data.filter(
            (l) =>
              (l.title || '').toLowerCase().includes(needle) ||
              (l.contactName || l.contact?.name || '').toLowerCase().includes(needle),
          );
          return { ...list, data: filtered };
        }}
        searchPlaceholder="Search unassigned leads..."
        headerActions={
          <Button size="sm" variant="outline" onClick={() => router.push('/leads')}>
            <ArrowLeft aria-hidden="true" /> All leads
          </Button>
        }
        columns={[
          {
            key: 'title', header: 'Lead',
            cell: (l) => (
              <div>
                <p className="font-medium text-sm">{l.title}</p>
                <p className="text-xs text-ds-foreground-muted">{leadDestination(l)}</p>
              </div>
            ),
          },
          { key: 'contact', header: 'Contact', cell: (l) => l.contactName || l.contact?.name || '—' },
          {
            key: 'status', header: 'Status',
            cell: (l) => <Tag tone="info">{LEAD_STATUS_LABELS[l.status as keyof typeof LEAD_STATUS_LABELS] || l.status}</Tag>,
          },
          { key: 'priority', header: 'Priority', cell: (l) => <span className="text-sm">{priorityLabel(l.priority)}</span> },
          { key: 'value', header: 'Value', align: 'right', cell: (l) => l.budget ? formatCurrency(l.budget, l.currency) : '—' },
          {
            key: 'createdAt', header: 'Created',
            cell: (l) => formatDisplayDate(l.createdAt, 'short') || '—',
          },
        ]}
        rowActions={(l) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/leads/${l.id}`)}>
              <Eye />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Assign" onClick={() => openAssign([l.id])}>
              <UserPlus />
            </Button>
          </>
        )}
        onRowClick={(l) => router.push(`/leads/${l.id}`)}
        bulkActions={[
          {
            label: 'Assign',
            icon: <UserPlus aria-hidden="true" />,
            onSelect: (rows) => openAssign(rows.map((r) => r.id)),
          },
        ]}
        emptyTitle="No unassigned leads"
        emptyDescription="Every lead currently has an owner."
      />

      <LeadAssignDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        leadIds={assignLeadIds}
        onAssigned={() => setRefreshKey((k) => k + 1)}
      />
    </>
  );
}
