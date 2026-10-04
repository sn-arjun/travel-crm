'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, UserPlus, ArrowLeft } from 'lucide-react';
import { ListPage, RelationCombobox } from '@/components/domain';
import { Button, Tag, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui';
import { leadsApi } from '@/lib/api/leads';
import { usersApi } from '@/lib/api/users';
import { LEAD_STATUS_LABELS } from '@travelcrm/shared';
import { toast } from 'sonner';
import type { Lead } from '@travelcrm/shared';

function formatCurrency(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

export default function UnassignedLeadsPage() {
  const router = useRouter();
  const [assignDialogOpen, setAssignDialogOpen] = React.useState(false);
  const [assignLeadIds, setAssignLeadIds] = React.useState<string[]>([]);
  const [assignUserId, setAssignUserId] = React.useState<string | null>(null);
  const [assigning, setAssigning] = React.useState(false);
  const [refreshKey, setRefreshKey] = React.useState(0);

  function openAssign(leadIds: string[]) {
    setAssignLeadIds(leadIds);
    setAssignUserId(null);
    setAssignDialogOpen(true);
  }

  async function handleAssign() {
    if (!assignUserId || assignLeadIds.length === 0) return;
    setAssigning(true);
    try {
      await leadsApi.bulkAssign({ leadIds: assignLeadIds, assignedTo: assignUserId });
      toast.success(`${assignLeadIds.length} lead(s) assigned`);
      setAssignDialogOpen(false);
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to assign leads');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <>
      <ListPage<Lead>
        refreshKey={refreshKey}
        title="Unassigned Leads"
        description="Leads with no owner — assign them to a team member."
        getRowId={(l) => l.id}
        fetcher={({ page, limit, search }) => leadsApi.getUnassigned({ page, limit }).then((res) => {
          if (!search) return res;
          const data = (res as any)?.data;
          const items = Array.isArray(data) ? data : (data?.data ?? []);
          const filtered = items.filter((l: any) =>
            (l.title || '').toLowerCase().includes(search.toLowerCase()) ||
            (l.contactName || l.contact?.name || '').toLowerCase().includes(search.toLowerCase()),
          );
          return { ...res, data: Array.isArray(data) ? filtered : { ...data, data: filtered } } as any;
        })}
        searchPlaceholder="Search unassigned leads..."
        headerActions={
          <Button size="sm" variant="outline" onClick={() => router.push('/leads')}>
            <ArrowLeft aria-hidden="true" /> All leads
          </Button>
        }
        columns={[
          {
            key: 'title', header: 'Lead',
            cell: (l: any) => (
              <div>
                <p className="font-medium text-sm">{l.title}</p>
                <p className="text-xs text-ds-foreground-muted">{l.destinations?.join(', ') || l.destination || '—'}</p>
              </div>
            ),
          },
          { key: 'contact', header: 'Contact', cell: (l: any) => l.contactName || l.contact?.name || '—' },
          {
            key: 'status', header: 'Status',
            cell: (l: any) => <Tag tone="info">{LEAD_STATUS_LABELS[l.status as keyof typeof LEAD_STATUS_LABELS] || l.status}</Tag>,
          },
          { key: 'priority', header: 'Priority', cell: (l: any) => <span className="text-sm capitalize">{l.priority}</span> },
          { key: 'value', header: 'Value', align: 'right', cell: (l: any) => l.budget ? formatCurrency(l.budget, l.currency) : '—' },
          {
            key: 'createdAt', header: 'Created',
            cell: (l: any) => new Date(l.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          },
        ]}
        rowActions={(l: any) => (
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

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign {assignLeadIds.length} Lead(s)</DialogTitle>
            <DialogDescription>Select a team member to take ownership.</DialogDescription>
          </DialogHeader>
          <RelationCombobox
            value={assignUserId}
            onChange={(id) => setAssignUserId(id)}
            fetcher={async (q, page) => {
              const r = await usersApi.list({ search: q, page, limit: 20 });
              return { items: r.data, total: r.pagination.total };
            }}
            getOptionId={(u: any) => u.id}
            getOptionLabel={(u: any) => u.name || u.email}
            placeholder="Select team member"
            searchPlaceholder="Search team..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)} disabled={assigning}>Cancel</Button>
            <Button onClick={handleAssign} disabled={assigning || !assignUserId}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
