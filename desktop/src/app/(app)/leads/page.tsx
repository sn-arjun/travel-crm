'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Phone, Mail, Trash2, Plus, UserPlus } from 'lucide-react';
import { ListPage } from '@/components/domain';
import { Button, Tag, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { leadsApi } from '@/lib/api/leads';
import { usersApi } from '@/lib/api/users';
import { exportsApi } from '@/lib/api/exports';
import { useApiQuery } from '@/hooks/use-api';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { LEAD_STATUS_LABELS } from '@travelcrm/shared';
import { toast } from 'sonner';
import type { Lead } from '@travelcrm/shared';

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
  const [priorityFilter, setPriorityFilter] = React.useState('');

  const { data: usersResponse } = useApiQuery(() => usersApi.list({ limit: 100 }), []);
  const usersData = usersResponse?.data;
  const teamUsers: any[] = Array.isArray(usersData) ? usersData : ((usersData as any)?.data ?? []);

  const activeFilters = [
    statusFilter && { id: 'status', label: 'Status', value: LEAD_STATUS_LABELS[statusFilter as keyof typeof LEAD_STATUS_LABELS] || statusFilter },
    priorityFilter && { id: 'priority', label: 'Priority', value: priorityFilter },
  ].filter(Boolean) as { id: string; label: string; value: string }[];

  function removeFilter(id: string) {
    if (id === 'status') setStatusFilter('');
    if (id === 'priority') setPriorityFilter('');
  }

  function openSendMessage(lead: any, channel: 'email' | 'whatsapp' | 'sms') {
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
      <ListPage<Lead>
        title="Leads"
        description="Track and convert your sales pipeline."
        getRowId={(l) => l.id}
        fetcher={({ page, limit, search }) =>
          leadsApi.list({
            page,
            limit,
            search: search || undefined,
            status: statusFilter || undefined,
            sortBy: 'createdAt',
            sortOrder: 'desc',
          }).then((res) => {
            if (!priorityFilter) return res;
            const data = (res as any)?.data;
            const items = Array.isArray(data) ? data : (data?.data ?? []);
            const filtered = items.filter((l: any) => l.priority === priorityFilter);
            return {
              ...res,
              data: Array.isArray(data) ? filtered : { ...data, data: filtered },
            } as any;
          })
        }
        searchPlaceholder="Search leads, contacts, destinations..."
        columns={[
          {
            key: 'title', header: 'Lead', sortable: true,
            cell: (l: any) => (
              <div>
                <p className="font-medium text-sm">{l.title}</p>
                <p className="text-xs text-ds-foreground-muted">{l.destinations?.join(', ') || l.destination || '—'}</p>
              </div>
            ),
          },
          {
            key: 'contact', header: 'Contact',
            cell: (l: any) => l.contactName || l.contact?.name || '—',
          },
          {
            key: 'status', header: 'Status', sortable: true,
            cell: (l: any) => <Tag tone={statusTone(l.status)}>{LEAD_STATUS_LABELS[l.status as keyof typeof LEAD_STATUS_LABELS] || l.status}</Tag>,
          },
          {
            key: 'priority', header: 'Priority', sortable: true,
            cell: (l: any) => <span className="text-sm capitalize">{l.priority}</span>,
          },
          {
            key: 'value', header: 'Value', align: 'right', sortable: true,
            cell: (l: any) => l.budget ? formatCurrency(l.budget, l.currency) : '—',
          },
          {
            key: 'travelDate', header: 'Travel Date', sortable: true,
            cell: (l: any) => l.travelDate ? new Date(l.travelDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—',
          },
          {
            key: 'assignedTo', header: 'Assigned',
            cell: (l: any) => l.assignedUser?.name || '—',
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
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priorityFilter || 'all'} onValueChange={(v) => setPriorityFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priority</SelectItem>
                <SelectItem value="hot">Hot</SelectItem>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="cold">Cold</SelectItem>
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
        rowActions={(l: any) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/leads/${l.id}`)}>
              <Eye />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/leads/${l.id}/edit`)}>
              <Pencil />
            </Button>
            {(l.contactPhone || l.contact?.phone) && (
              <Button variant="ghost" size="icon-sm" aria-label="Call" onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(l.contactPhone || l.contact?.phone)}`)}>
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
            onSelect: async (rows) => {
              const userId = teamUsers[0]?.id;
              if (!userId) { toast.error('No team members available'); return; }
              await leadsApi.bulkAssign({ leadIds: rows.map((r) => r.id), assignedTo: userId });
              toast.success(`${rows.length} lead(s) assigned`);
            },
          },
          {
            label: 'Delete',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              await leadsApi.bulkDelete({ leadIds: rows.map((r) => r.id) });
              toast.success(`${rows.length} lead(s) deleted`);
            },
          },
        ]}
        onExport={async () => {
          try {
            const response = await exportsApi.leads({
              filters: { status: statusFilter || undefined },
            });
            const blob = response instanceof Blob ? response : new Blob([response as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `leads_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

      <SendMessageDialog
        open={msgDialogOpen}
        onOpenChange={setMsgDialogOpen}
        contact={msgContact}
        defaultChannel={msgChannel}
      />
    </>
  );
}
