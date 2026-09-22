'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, Play, Plus, Trash2 } from 'lucide-react';
import { ListPage } from '@/components/domain';
import {
  Button, Tag, Skeleton,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
} from '@/components/ui';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { voipApi, type Call } from '@/lib/api/voip';
import { toast } from 'sonner';

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function statusTone(status: Call['status']): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'completed') return 'success';
  if (status === 'no_answer' || status === 'failed') return 'danger';
  if (status === 'in_progress' || status === 'ringing') return 'info';
  return 'neutral';
}

function exportCallsCsv(rows: Call[]) {
  const header = ['Direction', 'From', 'To', 'Status', 'Duration (s)', 'Start time'];
  const lines = rows.map((c) => [
    c.direction,
    c.from,
    c.to,
    c.status,
    String(c.duration ?? 0),
    c.startTime,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `call-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CallLogPage() {
  const router = useRouter();
  const { enabled, reason, upgradeHref, loading: gateLoading } = useFeatureGate('voip_calling');
  const [directionFilter, setDirectionFilter] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null);
  const [filterMenuOpen, setFilterMenuOpen] = React.useState(false);

  if (gateLoading) {
    return <Skeleton className="h-9 w-32" />;
  }

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 p-ds-9 text-center">
        <Phone className="size-10 text-ds-foreground-subtle" aria-hidden="true" />
        <p className="text-sm text-ds-foreground-muted">
          {reason === 'cap_exceeded' ? 'Call limit reached for your plan.' : 'VoIP calling is not enabled on your plan.'}
        </p>
        <Button asChild size="sm">
          <a href={upgradeHref}>Upgrade to enable</a>
        </Button>
      </div>
    );
  }

  const filters = [
    ...(directionFilter ? [{ id: 'direction', label: `Direction: ${directionFilter}`, value: directionFilter }] : []),
    ...(statusFilter ? [{ id: 'status', label: `Status: ${statusFilter.replace('_', ' ')}`, value: statusFilter }] : []),
  ];

  return (
    <ListPage<Call>
      title="Call Log"
      description="Inbound and outbound calls across your team."
      getRowId={(c) => c.id}
      fetcher={({ page, limit, search }) =>
        voipApi.calls.list({
          page,
          limit,
          direction: directionFilter === 'incoming' ? 'inbound' : directionFilter === 'outgoing' ? 'outbound' : undefined,
          status: statusFilter ?? undefined,
          sortBy: 'startTime',
          sortOrder: 'desc',
        }).then((r) => {
          if (!search) return r;
          const q = search.toLowerCase();
          const filtered = r.data.data.filter((c) => c.from.toLowerCase().includes(q) || c.to.toLowerCase().includes(q));
          return { ...r, data: { ...r.data, data: filtered } };
        })
      }
      filters={filters}
      onRemoveFilter={(id) => {
        if (id === 'direction') setDirectionFilter(null);
        if (id === 'status') setStatusFilter(null);
      }}
      onClearFilters={() => {
        setDirectionFilter(null);
        setStatusFilter(null);
      }}
      onOpenFilters={() => setFilterMenuOpen(true)}
      searchPlaceholder="Search by phone number…"
      columns={[
        {
          key: 'direction', header: 'Direction', width: '120px',
          cell: (c) => (
            <div className="flex items-center gap-ds-2">
              {c.direction === 'inbound' ? (
                <PhoneIncoming className="size-3.5 text-ds-info" aria-hidden="true" />
              ) : (
                <PhoneOutgoing className="size-3.5 text-ds-success" aria-hidden="true" />
              )}
              <span className="text-sm">{c.direction === 'inbound' ? 'Incoming' : 'Outgoing'}</span>
            </div>
          ),
        },
        {
          key: 'number', header: 'Number', sortable: true,
          cell: (c) => <span className="font-mono text-sm">{c.direction === 'inbound' ? c.from : c.to}</span>,
        },
        {
          key: 'startTime', header: 'Date & time', sortable: true,
          cell: (c) => <span className="text-sm text-ds-foreground-muted">{new Date(c.startTime).toLocaleString('en-IN')}</span>,
        },
        {
          key: 'status', header: 'Status',
          cell: (c) => (
            <Tag tone={statusTone(c.status)}>
              {c.status === 'no_answer' && <PhoneOff className="size-3" aria-hidden="true" />}
              {c.status.replace('_', ' ')}
            </Tag>
          ),
        },
        {
          key: 'duration', header: 'Duration', align: 'right', sortable: true,
          cell: (c) => <span className="text-sm">{formatDuration(c.duration ?? 0)}</span>,
        },
        {
          key: 'recording', header: 'Recording',
          cell: (c) => (c.recordingUrl ? <Play className="size-4 text-ds-foreground-muted" aria-hidden="true" /> : <span className="text-xs text-ds-foreground-subtle">—</span>),
        },
      ]}
      primaryAction={
        <Button size="sm" onClick={() => router.push('/communication/calls/dial')} className="gap-ds-2">
          <Plus aria-hidden="true" /> Click to call
        </Button>
      }
      headerActions={
        <>
          <DropdownMenu open={filterMenuOpen} onOpenChange={setFilterMenuOpen}>
            <DropdownMenuTrigger asChild>
              <span className="sr-only">Open filters</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Direction</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={directionFilter ?? ''} onValueChange={(v) => setDirectionFilter(v || null)}>
                <DropdownMenuRadioItem value="">All</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="incoming">Incoming</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="outgoing">Outgoing</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={statusFilter ?? ''} onValueChange={(v) => setStatusFilter(v || null)}>
                <DropdownMenuRadioItem value="">All</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="completed">Completed</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="no_answer">Missed</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="failed">Failed</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={() => router.push('/communication/calls/analytics')}>
            Analytics
          </Button>
        </>
      }
      rowActions={(c) => (
        <>
          <Button variant="ghost" size="icon-sm" aria-label="View"
            onClick={() => router.push(`/communication/calls/${c.id}`)}><Eye /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Call back"
            onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(c.direction === 'inbound' ? c.from : c.to)}`)}><Phone /></Button>
          <Button variant="ghost" size="icon-sm" aria-label="Delete"
            onClick={async () => {
              const result = await voipApi.calls.remove(c.id).catch(() => null);
              if (result !== null) toast.success('Call log removed');
              else toast.error('Failed to remove call log');
            }}><Trash2 /></Button>
        </>
      )}
      onRowClick={(c) => router.push(`/communication/calls/${c.id}`)}
      bulkActions={[{
        label: 'Delete', destructive: true, icon: <Trash2 />,
        onSelect: async (rows) => {
          await Promise.all(rows.map((r) => voipApi.calls.remove(r.id)));
          toast.success(`${rows.length} call${rows.length > 1 ? 's' : ''} removed`);
        },
      }]}
      onExport={async () => {
        // Always export the full filtered dataset from the server, not just
        // what's been loaded into the table via infinite scroll.
        const direction = directionFilter === 'incoming' ? 'inbound' : directionFilter === 'outgoing' ? 'outbound' : undefined;
        const all: Call[] = [];
        let page = 1;
        const limit = 200;
        for (;;) {
          const r = await voipApi.calls.list({ page, limit, direction, status: statusFilter ?? undefined });
          all.push(...r.data.data);
          if (all.length >= r.data.pagination.total || r.data.data.length === 0) break;
          page += 1;
        }
        exportCallsCsv(all);
      }}
      emptyTitle="No calls yet"
      emptyDescription="Calls placed or received through the dialer will show up here."
      emptyAction={
        <Button size="sm" onClick={() => router.push('/communication/calls/dial')} className="gap-ds-2">
          <Plus aria-hidden="true" /> Click to call
        </Button>
      }
    />
  );
}
