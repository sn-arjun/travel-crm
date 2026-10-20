'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Calendar, Download, Edit, ExternalLink, Eye, Globe, ListChecks, Mail, MapPin, MessageCircle,
  Phone, Plus, Send, Trash2, Upload, Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { ListPage } from '@/components/domain';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import type { DataTableColumn } from '@/components/ui/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { useApiQuery } from '@/hooks/use-api';
import { contactsApi, type ContactRecord } from '@/lib/api/contacts';
import { formatDisplayDate, toLocalDateString } from '@/lib/dates';
import { formatCurrency, getInitials } from '@/lib/utils';

import { formatRevenue, humanize, leadTone } from './_lib/contact-utils';

type MessageChannel = 'email' | 'whatsapp' | 'sms';

interface MessageTarget {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
}

function DetailLine({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-ds-3 text-sm">
      <span className="shrink-0 text-ds-foreground-muted">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

/* Contact detail drawer. Related leads are fetched server-side by contactId. */
function ContactDetailPanel({ contactId, onDeleted }: { contactId: string; onDeleted: () => void }) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [sendOpen, setSendOpen] = React.useState(false);
  const [sendChannel, setSendChannel] = React.useState<MessageChannel | undefined>(undefined);

  const contactQuery = useApiQuery(() => contactsApi.getById(contactId), [contactId]);
  const leadsQuery = useApiQuery(() => contactsApi.related.leads(contactId, { limit: 5 }), [contactId]);
  const wonQuery = useApiQuery(() => contactsApi.related.leads(contactId, { status: 'won', limit: 1 }), [contactId]);

  const contact = contactQuery.data?.data;
  const leads = leadsQuery.data?.data ?? [];

  async function handleDelete() {
    if (!contact) return;
    const ok = await confirm({
      title: `Delete ${contact.name}?`,
      description: 'This removes the contact and its history from your CRM. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await contactsApi.delete(contactId);
      toast.success('Contact deleted');
      onDeleted();
    } catch {
      toast.error('Failed to delete contact');
    }
  }

  if (contactQuery.loading) {
    return (
      <div className="flex flex-col gap-ds-3" aria-busy="true">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (contactQuery.error || !contact) {
    return (
      <div role="alert" className="flex flex-col items-center gap-ds-3 py-ds-8 text-center">
        <p className="text-sm text-ds-foreground-muted">Could not load this contact.</p>
        <Button variant="outline" size="sm" onClick={() => void contactQuery.refetch()}>Try again</Button>
      </div>
    );
  }

  const address = [contact.address, contact.city, contact.state, contact.country].filter(Boolean).join(', ');

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex items-center gap-ds-4">
        <Avatar className="size-14">
          <AvatarFallback className="text-lg font-semibold">{getInitials(contact.name)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-wrap items-center gap-ds-2">
          <Tag tone="neutral" className="capitalize">{contact.type}</Tag>
          {contact.source && <Tag tone="primary">{humanize(contact.source)}</Tag>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-ds-2">
        <TooltipProvider delayDuration={300}>
          {contact.phone && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(contact.phone ?? '')}&contactId=${encodeURIComponent(contact.id)}`)}
                >
                  <Phone aria-hidden="true" /> Call
                </Button>
              </TooltipTrigger>
              <TooltipContent>Call {contact.phone}</TooltipContent>
            </Tooltip>
          )}
          {contact.phone && (
            <Button variant="outline" size="sm" onClick={() => { setSendChannel('whatsapp'); setSendOpen(true); }}>
              <MessageCircle aria-hidden="true" /> WhatsApp
            </Button>
          )}
          {contact.email && (
            <Button variant="outline" size="sm" onClick={() => { setSendChannel('email'); setSendOpen(true); }}>
              <Send aria-hidden="true" /> Email
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => { setSendChannel(undefined); setSendOpen(true); }}>
            <Mail aria-hidden="true" /> Message
          </Button>
          <Button size="sm" onClick={() => router.push(`/contacts/${contactId}/edit`)}>
            <Edit aria-hidden="true" /> Edit
          </Button>
        </TooltipProvider>
      </div>

      <div className="flex items-center gap-ds-2">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/leads/new?contactId=${contactId}`)}>
          <Zap aria-hidden="true" /> Create lead
        </Button>
        <Button variant="ghost" size="sm" onClick={() => router.push(`/contacts/${contactId}`)}>
          <ExternalLink aria-hidden="true" /> Full profile
        </Button>
        <Button variant="ghost" size="sm" className="text-ds-danger hover:text-ds-danger" onClick={() => void handleDelete()}>
          <Trash2 aria-hidden="true" /> Delete
        </Button>
      </div>

      <Separator />

      <div className="grid grid-cols-3 gap-ds-3 text-center">
        <div>
          <p className="text-2xl font-semibold">{contact.leadsCount ?? leadsQuery.data?.pagination.total ?? 0}</p>
          <p className="text-xs text-ds-foreground-muted">Leads</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{wonQuery.data?.pagination.total ?? 0}</p>
          <p className="text-xs text-ds-foreground-muted">Won</p>
        </div>
        <div>
          <p className="text-2xl font-semibold">{formatRevenue(contact.paymentsTotal ?? 0)}</p>
          <p className="text-xs text-ds-foreground-muted">Revenue</p>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-ds-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ds-foreground-muted">Contact details</h4>
        {contact.email && <DetailLine icon={<Mail className="size-4" aria-hidden="true" />}>{contact.email}</DetailLine>}
        {contact.phone && <DetailLine icon={<Phone className="size-4" aria-hidden="true" />}>{contact.phone}</DetailLine>}
        {contact.company && <DetailLine icon={<Building2 className="size-4" aria-hidden="true" />}>{contact.company}</DetailLine>}
        {address && <DetailLine icon={<MapPin className="size-4" aria-hidden="true" />}>{address}</DetailLine>}
        {contact.birthday && (
          <DetailLine icon={<Calendar className="size-4" aria-hidden="true" />}>Birthday: {formatDisplayDate(contact.birthday, 'short')}</DetailLine>
        )}
        {contact.anniversary && (
          <DetailLine icon={<Calendar className="size-4" aria-hidden="true" />}>Anniversary: {formatDisplayDate(contact.anniversary, 'short')}</DetailLine>
        )}
        {contact.preferredLanguage && contact.preferredLanguage !== 'en' && (
          <DetailLine icon={<Globe className="size-4" aria-hidden="true" />}>Language: {contact.preferredLanguage.toUpperCase()}</DetailLine>
        )}
      </div>

      {(contact.tags ?? []).length > 0 && (
        <div className="flex flex-col gap-ds-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ds-foreground-muted">Tags</h4>
          <div className="flex flex-wrap gap-ds-2">
            {(contact.tags ?? []).map((tag) => <Tag key={tag} tone="primary">{tag}</Tag>)}
          </div>
        </div>
      )}

      {contact.notes && (
        <div className="flex flex-col gap-ds-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-ds-foreground-muted">Notes</h4>
          <p className="whitespace-pre-wrap text-sm text-ds-foreground-muted">{contact.notes}</p>
        </div>
      )}

      <Separator />

      <div className="flex flex-col gap-ds-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ds-foreground-muted">Recent leads</h4>
        {leadsQuery.loading ? (
          <Skeleton className="h-16 w-full" />
        ) : leadsQuery.error ? (
          <Button variant="outline" size="sm" onClick={() => void leadsQuery.refetch()}>Could not load leads. Try again</Button>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center gap-ds-2 py-ds-4 text-center">
            <p className="text-sm text-ds-foreground-muted">No leads yet</p>
            <Button variant="outline" size="sm" onClick={() => router.push(`/leads/new?contactId=${contactId}`)}>
              <Plus aria-hidden="true" /> Create lead
            </Button>
          </div>
        ) : (
          leads.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => router.push(`/leads/${lead.id}`)}
              className="flex items-start justify-between gap-ds-2 rounded-ds-md border border-ds-border p-ds-3 text-left hover:bg-ds-surface-sunken"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{lead.title}</span>
                <span className="block text-xs text-ds-foreground-muted">
                  {lead.budget ? formatCurrency(lead.budget, lead.currency || undefined) : 'No budget'}
                </span>
              </span>
              <Tag tone={leadTone(lead.status)}>{humanize(lead.status)}</Tag>
            </button>
          ))
        )}
      </div>

      <p className="text-xs text-ds-foreground-muted">
        Created {formatDisplayDate(new Date(contact.createdAt))} - Updated {formatDisplayDate(new Date(contact.updatedAt))}
      </p>

      {dialog}
      <SendMessageDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        contact={{ id: contactId, name: contact.name, email: contact.email, phone: contact.phone }}
        defaultChannel={sendChannel}
      />
    </div>
  );
}

/* Main contacts list */
export default function ContactsPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [tagFilter, setTagFilter] = React.useState('all');
  const [sendTarget, setSendTarget] = React.useState<MessageTarget | null>(null);
  const [sendChannel, setSendChannel] = React.useState<MessageChannel | undefined>(undefined);
  const [refetchKey, setRefetchKey] = React.useState(0);

  const { data: tagsResponse } = useApiQuery(() => contactsApi.getTags(), []);
  const allTags: string[] = Array.isArray(tagsResponse?.data) ? tagsResponse.data : [];

  const activeFilters = React.useMemo(() => {
    const f: { id: string; label: string; value: string }[] = [];
    if (typeFilter !== 'all') f.push({ id: 'type', label: 'Type', value: typeFilter });
    if (tagFilter !== 'all') f.push({ id: 'tag', label: 'Tag', value: tagFilter });
    return f;
  }, [typeFilter, tagFilter]);

  const columns: DataTableColumn<ContactRecord>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      hideable: false,
      cell: (c) => (
        <div className="flex items-center gap-ds-3">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{getInitials(c.name)}</AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium">{c.name}</span>
        </div>
      ),
    },
    { key: 'email', header: 'Email', cell: (c) => <span className="text-sm text-ds-foreground-muted">{c.email ?? '—'}</span> },
    { key: 'phone', header: 'Phone', cell: (c) => <span className="text-sm">{c.phone ?? '—'}</span> },
    { key: 'type', header: 'Type', cell: (c) => <Tag tone="neutral" className="capitalize">{c.type}</Tag> },
    {
      key: 'tags',
      header: 'Tags',
      cell: (c) => (
        <div className="flex gap-ds-1">
          {(c.tags ?? []).slice(0, 2).map((tag) => <Tag key={tag} tone="primary" size="sm">{tag}</Tag>)}
          {(c.tags ?? []).length > 2 && <Tag tone="neutral" size="sm">+{(c.tags ?? []).length - 2}</Tag>}
        </div>
      ),
    },
    { key: 'source', header: 'Source', cell: (c) => <span className="text-sm text-ds-foreground-muted">{humanize(c.source) || '—'}</span> },
    {
      key: 'createdAt',
      header: 'Created',
      sortable: true,
      cell: (c) => <span className="text-sm text-ds-foreground-muted">{formatDisplayDate(new Date(c.createdAt), 'short')}</span>,
    },
  ];

  async function deleteContact(c: ContactRecord) {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      description: 'This removes the contact and its history from your CRM. This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await contactsApi.delete(c.id);
      toast.success('Contact deleted');
      setRefetchKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete');
    }
  }

  return (
    <>
      <ListPage<ContactRecord>
        title="Contacts"
        description="Every customer, supplier, agent, and partner in one place."
        getRowId={(c) => c.id}
        serverSort
        fetcher={({ page, limit, search, sort }) =>
          contactsApi.list({
            page,
            limit,
            search: search || undefined,
            sortBy: sort?.column,
            sortOrder: sort?.direction,
            type: typeFilter !== 'all' ? typeFilter : undefined,
            tag: tagFilter !== 'all' ? tagFilter : undefined,
          })
        }
        columns={columns}
        searchPlaceholder="Search contacts..."
        filters={activeFilters}
        onRemoveFilter={(id) => {
          if (id === 'type') setTypeFilter('all');
          if (id === 'tag') setTagFilter('all');
        }}
        onClearFilters={() => { setTypeFilter('all'); setTagFilter('all'); }}
        headerActions={
          <>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-36" aria-label="Filter by type">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="customer">Customer</SelectItem>
                <SelectItem value="supplier">Supplier</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="partner">Partner</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="h-9 w-36" aria-label="Filter by tag">
                <SelectValue placeholder="All tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {allTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => router.push('/contacts/import')}>
              <Upload aria-hidden="true" /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push('/settings/custom-fields')}>
              <ListChecks aria-hidden="true" /> Custom Fields
            </Button>
          </>
        }
        primaryAction={
          <Button size="sm" onClick={() => router.push('/contacts/new')}>
            <Plus aria-hidden="true" /> New Contact
          </Button>
        }
        rowActions={(c) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/contacts/${c.id}`)}>
              <Eye aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/contacts/${c.id}/edit`)}>
              <Edit aria-hidden="true" />
            </Button>
            {c.phone && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Call"
                onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(c.phone ?? '')}&contactId=${encodeURIComponent(c.id)}`)}
              >
                <Phone aria-hidden="true" />
              </Button>
            )}
            {c.email && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Email"
                onClick={() => { setSendTarget({ id: c.id, name: c.name, email: c.email, phone: c.phone }); setSendChannel('email'); }}
              >
                <Mail aria-hidden="true" />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => void deleteContact(c)}>
              <Trash2 aria-hidden="true" />
            </Button>
          </>
        )}
        refreshKey={refetchKey}
        renderDetail={(c) => <ContactDetailPanel contactId={c.id} onDeleted={() => setRefetchKey((k) => k + 1)} />}
        detailTitle={(c) => c.name}
        bulkActions={[
          {
            label: 'Delete',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              const ok = await confirm({
                title: `Delete ${rows.length} contact${rows.length === 1 ? '' : 's'}?`,
                description: 'This removes the selected contacts and their history. This cannot be undone.',
                confirmLabel: 'Delete',
                tone: 'destructive',
              });
              if (!ok) return;
              await Promise.all(rows.map((r) => contactsApi.delete(r.id)));
              toast.success(`${rows.length} contact(s) deleted`);
              setRefetchKey((k) => k + 1);
            },
          },
        ]}
        onExport={async (rows) => {
          try {
            const blob = await contactsApi.export({
              format: 'csv',
              filters: {
                type: typeFilter !== 'all' ? typeFilter : undefined,
                tag: tagFilter !== 'all' ? tagFilter : undefined,
                ids: rows.length > 0 && rows.length < 1000 ? rows.map((r) => r.id) : undefined,
              },
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `contacts-${toLocalDateString(new Date())}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('Contacts exported');
          } catch {
            toast.error('Export failed');
          }
        }}
        exportLabel="Export"
        emptyTitle="No contacts yet"
        emptyDescription="Add your first contact to start building your customer base."
        emptyIcon={<Download aria-hidden="true" />}
      />

      {confirmDialog}
      {sendTarget && (
        <SendMessageDialog
          open={!!sendTarget}
          onOpenChange={(open) => { if (!open) { setSendTarget(null); setSendChannel(undefined); } }}
          contact={sendTarget}
          defaultChannel={sendChannel}
        />
      )}
    </>
  );
}
