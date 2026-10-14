'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Phone, Mail, Trash2, Plus, UserPlus } from 'lucide-react';
import { ListPage } from '@/components/domain';
import type { ListFilter } from '@/components/domain/list-page';
import { Button, Tag, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { leadsApi } from '@/lib/api/leads';
import { exportsApi } from '@/lib/api/exports';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { LEAD_STATUS_LABELS } from '@travelcrm/shared';
import { toast } from 'sonner';
import { formatDisplayDate, toLocalDateString } from '@/lib/dates';
import { LeadAssignDialog } from './lead-assign-dialog';
import { PRIORITY_LABELS, leadDestination, priorityLabel, type LeadRow } from './lead-labels';

function formatCurrency(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'won') return 'success';
  if (status === 'lost') return 'danger';
  if (status === 'proposal_sent' || status === 'negotiation') return 'warning';
  return 'info';
}

export default function LeadsPage() {
  const router = useRouter();
  const [msgDialogOpen, setMsgDialogOpen] = React.useState(false);
  const [msgChannel, setMsgChannel] = React.useState<'email' | 'whatsapp' | 'sms'>('email');
  const [msgContact, setMsgContact] = React.useState<{ id: string; name: string; email?: string | null; phone?: string | null }>({ id: '', name: '' });
  const [statusFilter, setStatusFilter] = React.useState('');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [priorityFilter, setPriorityFilter] = React.useState('');
  const [assignIds, setAssignIds] = React.useState<string[]>([]);
  const [assignOpen, setAssignOpen] = React.useState(false);

  const activeFilters = React.useMemo(
    () =>
      [
        statusFilter && { id: 'status', label: 'Status', value: LEAD_STATUS_LABELS[statusFilter as keyof typeof LEAD_STATUS_LABELS] || statusFilter },
        priorityFilter && { id: 'priority', label: 'Priority', value: priorityLabel(priorityFilter) },
      ].filter(Boolean) as ListFilter[],
    [statusFilter, priorityFilter],
  );

  function removeFilter(id: string) {
    if (id === 'status') setStatusFilter('');
    if (id === 'priority') setPriorityFilter('');
  }

  function openSendMessage(lead: LeadRow, channel: 'email' | 'whatsapp' | 'sms') {
    setMsgContact({
      id: lead.contactId || lead.contact?.id || '',
      name: lead.contactName || lead.contact?.name || '',
      email: lead.contactEmail || lead.contact?.email || null,
      phone: lead.contactPhone || lead.contact?.phone || null,
    });
    setMsgChannel(channel);
    setMsgDialogOpen(true);
  }

  return (
    <>
      <ListPage<LeadRow>
        title="Leads"
        description="Track and convert your sales pipeline."
        getRowId={(l) => l.id}
        refreshKey={refreshKey}
        serverSort
        fetcher={({ page, limit, search, sort }) =>
          leadsApi.list({
            page,
            limit,
            search: search || undefined,
            status: statusFilter || undefined,
            priority: priorityFilter || undefined,
            sortBy: sort ? (sort.column === 'value' ? 'budget' : sort.column) : 'createdAt',
            sortOrder: sort?.direction ?? 'desc',
          })
        }
        searchPlaceholder="Search leads, contacts, destinations..."
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
          {
            key: 'contact', header: 'Contact',
            cell: (l) => l.contactName || l.contact?.name || '—',
          },
          {
            key: 'status', header: 'Status', sortable: true,
            cell: (l) => <Tag tone={statusTone(l.status)}>{LEAD_STATUS_LABELS[l.status as keyof typeof LEAD_STATUS_LABELS] || l.status}</Tag>,
          },
          {
            key: 'priority', header: 'Priority', sortable: true,
            cell: (l) => <span className="text-sm">{priorityLabel(l.priority)}</span>,
          },
          {
            key: 'value', header: 'Value', align: 'right', sortable: true,
            cell: (l) => l.budget ? formatCurrency(l.budget, l.currency) : '—',
          },
          {
            key: 'travelDate', header: 'Travel Date', sortable: true,
            cell: (l) => formatDisplayDate(l.travelDate, 'short') || '—',
          },
          {
            key: 'assignedTo', header: 'Assigned',
            cell: (l) => l.assignedUser?.name || l.assignedToName || 'Unassigned',
          },
        ]}
        primaryAction={
          <Button size="sm" onClick={() => router.push('/leads/new')}>
            <Plus aria-hidden="true" /> New lead
          </Button>
        }
        headerActions={
          <>
            <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-40 h-9" aria-label="Filter by status"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter || 'all'} onValueChange={(v) => setPriorityFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-32 h-9" aria-label="Filter by priority"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priority</SelectItem>
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => router.push('/leads/unassigned')}>
              <UserPlus aria-hidden="true" /> Unassigned
            </Button>
          </>
        }
        filters={activeFilters}
        onRemoveFilter={removeFilter}
        onClearFilters={() => { setStatusFilter(''); setPriorityFilter(''); }}
        rowActions={(l) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/leads/${l.id}`)}>
              <Eye />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/leads/${l.id}/edit`)}>
              <Pencil />
            </Button>
            {(l.contactPhone || l.contact?.phone) && (
              <Button variant="ghost" size="icon-sm" aria-label="Call" onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(l.contactPhone || l.contact?.phone || '')}&leadId=${encodeURIComponent(l.id)}&contactId=${encodeURIComponent(l.contactId)}`)}>
                <Phone />
              </Button>
            )}
            {(l.contactEmail || l.contact?.email) && (
              <Button variant="ghost" size="icon-sm" aria-label="Email" onClick={() => openSendMessage(l, 'email')}>
                <Mail />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={async () => {
              try {
                await leadsApi.delete(l.id);
                toast.success('Lead deleted');
                setRefreshKey((k) => k + 1);
              } catch { toast.error('Failed to delete lead'); }
            }}>
              <Trash2 />
            </Button>
          </>
        )}
        onRowClick={(l) => router.push(`/leads/${l.id}`)}
        bulkActions={[
          {
            label: 'Assign',
            icon: <UserPlus aria-hidden="true" />,
            onSelect: (rows) => {
              setAssignIds(rows.map((r) => r.id));
              setAssignOpen(true);
            },
          },
          {
            label: 'Delete',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              await leadsApi.bulkDelete({ leadIds: rows.map((r) => r.id) });
              toast.success(`${rows.length} lead(s) deleted`);
              setRefreshKey((k) => k + 1);
            },
          },
        ]}
        onExport={async () => {
          try {
            const response = await exportsApi.leads({
              filters: { status: statusFilter || undefined },
            });
            const blob = response instanceof Blob ? response : new Blob([response as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `leads_export_${toLocalDateString(new Date())}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Leads exported successfully');
          } catch {
            toast.error('Failed to export leads');
          }
        }}
        emptyTitle="No leads yet"
        emptyDescription="Start building your pipeline by adding your first lead."
        emptyAction={
          <Button size="sm" onClick={() => router.push('/leads/new')}>
            <Plus aria-hidden="true" /> New lead
          </Button>
        }
      />

      <LeadAssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        leadIds={assignIds}
        onAssigned={() => setRefreshKey((k) => k + 1)}
      />

      <SendMessageDialog
        open={msgDialogOpen}
        onOpenChange={setMsgDialogOpen}
        contact={msgContact}
        defaultChannel={msgChannel}
      />
    </>
  );
}
