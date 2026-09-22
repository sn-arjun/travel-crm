'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Mail, MessageSquare, Pencil, Send, Share2, Bell, Trash2 } from 'lucide-react';
import { ListPage } from '@/components/domain';
import { Button, Tag } from '@/components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { marketingApi, type MarketingCampaign } from '@/lib/api/marketing';

function channelIcon(channel: string) {
  switch (channel) {
    case 'sms':
      return <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />;
    case 'social':
      return <Share2 className="h-3.5 w-3.5" aria-hidden="true" />;
    case 'push':
      return <Bell className="h-3.5 w-3.5" aria-hidden="true" />;
    default:
      return <Mail className="h-3.5 w-3.5" aria-hidden="true" />;
  }
}

function statusTone(status: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  switch (status) {
    case 'sent':
      return 'success';
    case 'failed':
    case 'cancelled':
      return 'danger';
    case 'sending':
      return 'warning';
    case 'scheduled':
      return 'info';
    default:
      return 'neutral';
  }
}

function toCsv(rows: MarketingCampaign[]) {
  const header = ['Name', 'Channel', 'Status', 'Sent', 'Opened', 'Clicked', 'Failed', 'Created'];
  const lines = rows.map((c) => [
    c.name,
    c.channel,
    c.status,
    c.sentCount ?? 0,
    c.openedCount ?? 0,
    c.clickedCount ?? 0,
    c.failedCount ?? 0,
    c.createdAt,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [header.join(','), ...lines].join('\n');
}

async function exportAllCampaigns(filters: { search: string; status?: string; channel?: string }) {
  const pageSize = 200;
  let page = 1;
  let all: MarketingCampaign[] = [];
  for (;;) {
    const res = await marketingApi.campaigns.list({
      page,
      limit: pageSize,
      search: filters.search || undefined,
      status: filters.status,
      channel: filters.channel,
    });
    const pageItems = res.data.data;
    all = all.concat(pageItems);
    if (all.length >= res.data.pagination.total || pageItems.length === 0) break;
    page += 1;
  }
  const csv = toCsv(all);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `marketing-campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function MarketingCampaignsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState<string | undefined>(undefined);
  const [channelFilter, setChannelFilter] = React.useState<string | undefined>(undefined);
  const [search, setSearch] = React.useState('');

  async function handleDelete(id: string) {
    try {
      await marketingApi.campaigns.delete(id);
      toast.success('Campaign deleted');
    } catch {
      toast.error('Failed to delete campaign');
    }
  }

  const activeFilters = [
    ...(statusFilter ? [{ id: 'status', label: 'Status', value: statusFilter }] : []),
    ...(channelFilter ? [{ id: 'channel', label: 'Channel', value: channelFilter }] : []),
  ];

  return (
    <ListPage<MarketingCampaign>
      title="Marketing Campaigns"
      description="Create, send, and track multi-channel campaigns."
      getRowId={(c) => c.id}
      fetcher={({ page, limit, search: s }) => {
        setSearch(s);
        return marketingApi.campaigns.list({
          page,
          limit,
          search: s,
          status: statusFilter,
          channel: channelFilter,
        });
      }}
      columns={[
        {
          key: 'name',
          header: 'Campaign',
          sortable: true,
          cell: (c) => (
            <div>
              <p className="font-medium text-ds-foreground">{c.name}</p>
              {c.subject && <p className="text-xs text-ds-foreground-muted truncate max-w-xs">{c.subject}</p>}
            </div>
          ),
        },
        {
          key: 'channel',
          header: 'Channel',
          cell: (c) => (
            <span className="flex items-center gap-ds-1 text-xs capitalize">
              {channelIcon(c.channel)}
              {c.channel}
            </span>
          ),
        },
        {
          key: 'status',
          header: 'Status',
          cell: (c) => <Tag tone={statusTone(c.status)}>{c.status}</Tag>,
        },
        { key: 'sentCount', header: 'Sent', align: 'right', sortable: true, cell: (c) => (c.sentCount ?? 0).toLocaleString() },
        {
          key: 'openedCount',
          header: 'Open rate',
          align: 'right',
          cell: (c) => {
            const rate = c.sentCount ? Math.round(((c.openedCount ?? 0) / c.sentCount) * 1000) / 10 : 0;
            return `${rate}%`;
          },
        },
        {
          key: 'createdAt',
          header: 'Created',
          sortable: true,
          cell: (c) => new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        },
      ]}
      primaryAction={
        <Button size="sm" onClick={() => router.push('/marketing/campaigns/new')}>
          <Send aria-hidden="true" /> New campaign
        </Button>
      }
      headerActions={
        <div className="flex items-center gap-ds-2">
          <Select value={statusFilter ?? 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? undefined : v)}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="sending">Sending</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter ?? 'all'} onValueChange={(v) => setChannelFilter(v === 'all' ? undefined : v)}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="push">Push</SelectItem>
              <SelectItem value="social">Social</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
      searchPlaceholder="Search campaigns..."
      filters={activeFilters}
      onRemoveFilter={(id) => {
        if (id === 'status') setStatusFilter(undefined);
        if (id === 'channel') setChannelFilter(undefined);
      }}
      onClearFilters={() => {
        setStatusFilter(undefined);
        setChannelFilter(undefined);
      }}
      rowActions={(c) => (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="View"
            onClick={() => router.push(`/marketing/campaigns/${c.id}`)}
          >
            <Eye aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Edit"
            onClick={() => router.push(`/marketing/campaigns/${c.id}?edit=1`)}
          >
            <Pencil aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete"
            onClick={() => void handleDelete(c.id)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </>
      )}
      onRowClick={(c) => router.push(`/marketing/campaigns/${c.id}`)}
      bulkActions={[
        {
          label: 'Delete',
          destructive: true,
          onSelect: (rows) => Promise.all(rows.map((r) => marketingApi.campaigns.delete(r.id))).then(() => {}),
        },
      ]}
      onExport={async () => {
        await exportAllCampaigns({ search, status: statusFilter, channel: channelFilter });
      }}
      exportLabel="Export all"
      emptyTitle="No campaigns yet"
      emptyDescription="Create your first multi-channel campaign to reach your audience."
      emptyAction={
        <Button onClick={() => router.push('/marketing/campaigns/new')}>
          <Send aria-hidden="true" /> New campaign
        </Button>
      }
    />
  );
}
