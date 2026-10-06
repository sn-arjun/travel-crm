'use client';

import * as React from 'react';
import { Ban, Mail, MessageSquare, Smartphone, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tag } from '@/components/ui';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { marketingApi, type OptedOutContact } from '@/lib/api/marketing';
import { toLocalDateString } from '@/lib/dates';

function channelIcon(channel?: string) {
  switch (channel) {
    case 'email':
      return <Mail className="size-3.5" aria-hidden="true" />;
    case 'sms':
      return <MessageSquare className="size-3.5" aria-hidden="true" />;
    case 'whatsapp':
      return <Smartphone className="size-3.5" aria-hidden="true" />;
    default:
      return <Ban className="size-3.5" aria-hidden="true" />;
  }
}

function channelTone(channel?: string): 'info' | 'success' | 'danger' | 'neutral' {
  switch (channel) {
    case 'email':
      return 'info';
    case 'sms':
    case 'whatsapp':
      return 'success';
    default:
      return 'danger';
  }
}

function toCsv(rows: OptedOutContact[]) {
  const header = ['Name', 'Email', 'Phone', 'Opted Out At', 'Channel', 'Reason'];
  const lines = rows.map((c) =>
    [c.name, c.email ?? '', c.phone ?? '', c.optedOutAt ?? '', c.optOutChannel ?? 'manual', c.optOutReason ?? '']
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

async function exportAllOptedOut(search: string, channel?: string) {
  const pageSize = 200;
  let page = 1;
  let all: OptedOutContact[] = [];
  for (;;) {
    const res = await marketingApi.optedOut.list({ page, limit: pageSize, search: search || undefined, channel });
    const items = res.data;
    all = all.concat(items);
    if (all.length >= res.pagination.total || items.length === 0) break;
    page += 1;
  }
  const csv = toCsv(all);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `opted-out-contacts-${toLocalDateString(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function OptedOutPage() {
  const [channel, setChannel] = React.useState<string | undefined>(undefined);
  const [search, setSearch] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);
  const [resubscribeContact, setResubscribeContact] = React.useState<OptedOutContact | null>(null);
  const [resubscribing, setResubscribing] = React.useState(false);

  const activeFilters = channel ? [{ id: 'channel', label: 'Channel', value: channel }] : [];

  async function handleResubscribe() {
    if (!resubscribeContact) return;
    setResubscribing(true);
    try {
      await marketingApi.optedOut.resubscribe(resubscribeContact.id);
      toast.success(`${resubscribeContact.name || 'Contact'} has been re-subscribed`);
      setReloadKey((k) => k + 1);
      setResubscribeContact(null);
    } catch {
      toast.error('Failed to re-subscribe contact');
    } finally {
      setResubscribing(false);
    }
  }

  return (
    <>
      <ListPage<OptedOutContact>
        refreshKey={reloadKey}
        title="Opted-Out Contacts"
        description="Contacts who unsubscribed from marketing communications."
        getRowId={(c) => c.id}
        fetcher={({ page, limit, search: s }) => {
          setSearch(s);
          return marketingApi.optedOut.list({ page, limit, search: s, channel });
        }}
        columns={[
          {
            key: 'name',
            header: 'Name',
            sortable: true,
            cell: (c) => (
              <div className="flex items-center gap-ds-3">
                <div className="flex size-8 items-center justify-center rounded-ds-full bg-ds-danger-subtle text-ds-danger-on-subtle">
                  <Ban className="size-3.5" aria-hidden="true" />
                </div>
                <span className="font-medium text-ds-foreground">{c.name || 'Unknown'}</span>
              </div>
            ),
          },
          {
            key: 'email',
            header: 'Email',
            cell: (c) =>
              c.email ? (
                <span className="text-ds-foreground-muted">{c.email}</span>
              ) : (
                <span className="text-ds-foreground-subtle">—</span>
              ),
          },
          {
            key: 'phone',
            header: 'Phone',
            cell: (c) =>
              c.phone ? (
                <span className="text-ds-foreground-muted">{c.phone}</span>
              ) : (
                <span className="text-ds-foreground-subtle">—</span>
              ),
          },
          {
            key: 'optedOutAt',
            header: 'Opted Out',
            sortable: true,
            cell: (c) =>
              c.optedOutAt
                ? new Date(c.optedOutAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                : '—',
          },
          {
            key: 'optOutChannel',
            header: 'Channel',
            cell: (c) => (
              <Tag tone={channelTone(c.optOutChannel)} className="gap-1 capitalize">
                {channelIcon(c.optOutChannel)}
                {c.optOutChannel || 'manual'}
              </Tag>
            ),
          },
          {
            key: 'optOutReason',
            header: 'Reason',
            cell: (c) => (
              <span className="block max-w-52 truncate text-ds-foreground-subtle" title={c.optOutReason}>
                {c.optOutReason || '—'}
              </span>
            ),
          },
        ]}
        headerActions={
          <Select value={channel ?? 'all'} onValueChange={(v) => setChannel(v === 'all' ? undefined : v)}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        }
        searchPlaceholder="Search by name, email, or phone..."
        filters={activeFilters}
        onRemoveFilter={() => setChannel(undefined)}
        onClearFilters={() => setChannel(undefined)}
        rowActions={(c) => (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Re-subscribe"
            onClick={() => setResubscribeContact(c)}
          >
            <UserCheck aria-hidden="true" />
          </Button>
        )}
        bulkActions={[
          {
            label: 'Re-subscribe',
            icon: <UserCheck aria-hidden="true" />,
            onSelect: (rows) =>
              Promise.all(rows.map((r) => marketingApi.optedOut.resubscribe(r.id))).then(() => {
                toast.success(`${rows.length} contact${rows.length !== 1 ? 's' : ''} re-subscribed`);
                setReloadKey((k) => k + 1);
              }),
          },
        ]}
        onExport={async () => {
          await exportAllOptedOut(search, channel);
        }}
        exportLabel="Export all"
        emptyIcon={<Ban className="size-10" aria-hidden="true" />}
        emptyTitle="No opted-out contacts"
        emptyDescription="Contacts who unsubscribe from your marketing communications will appear here."
      />

      <Dialog open={!!resubscribeContact} onOpenChange={(open) => !open && setResubscribeContact(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-subscribe contact</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ds-foreground-muted">
            Are you sure you want to re-subscribe{' '}
            <span className="font-medium text-ds-foreground">{resubscribeContact?.name || 'this contact'}</span>?
            They will start receiving marketing communications again.
          </p>
          {resubscribeContact?.optOutReason && (
            <div className="rounded-ds-md border border-ds-border bg-ds-surface-sunken p-ds-3">
              <p className="mb-ds-1 text-xs font-medium text-ds-foreground-muted">Original opt-out reason</p>
              <p className="text-sm text-ds-foreground">{resubscribeContact.optOutReason}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResubscribeContact(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleResubscribe()} disabled={resubscribing}>
              <UserCheck aria-hidden="true" />
              {resubscribing ? 'Re-subscribing…' : 'Re-subscribe'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
