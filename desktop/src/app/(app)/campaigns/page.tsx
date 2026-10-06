'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pause, Plus, Trash2, Mail, MessageSquare } from 'lucide-react';
import { ListPage } from '@/components/domain';
import {
  Button, Tag, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { useApiMutation } from '@/hooks/use-api';
import { campaignsApi } from '@/lib/api/campaigns';
import type { Campaign } from '@travelcrm/shared';
import { toast } from 'sonner';
import { toLocalDateString } from '@/lib/dates';
import { unwrapList } from '@/lib/api/envelope';

function channelIcon(type: string) {
  if (type === 'email') return <Mail className="size-3.5" aria-hidden="true" />;
  if (type === 'sms' || type === 'whatsapp') return <MessageSquare className="size-3.5" aria-hidden="true" />;
  return null;
}

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'running') return 'success';
  if (status === 'completed') return 'info';
  if (status === 'scheduled' || status === 'paused') return 'warning';
  return 'neutral';
}

function toCsvValue(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function CampaignsPage() {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [refreshKey, setRefreshKey] = React.useState(0);

  const { mutate: cancelCampaign } = useApiMutation((id: string) => campaignsApi.cancel(id));
  const { mutate: deleteCampaign } = useApiMutation((id: string) => campaignsApi.delete(id));

  const activeFilters = [
    typeFilter && { id: 'type', label: 'Type', value: typeFilter },
    statusFilter && { id: 'status', label: 'Status', value: statusFilter },
  ].filter(Boolean) as { id: string; label: string; value: string }[];

  function removeFilter(id: string) {
    if (id === 'type') setTypeFilter('');
    if (id === 'status') setStatusFilter('');
  }

  return (
    <ListPage<Campaign>
      title="Campaigns"
      description="Reach your contacts with targeted email, SMS and WhatsApp campaigns."
      getRowId={(c) => c.id}
      refreshKey={refreshKey}
      fetcher={({ page, limit, search }) =>
        campaignsApi.list({
          page,
          limit,
          search: search || undefined,
          type: typeFilter || undefined,
          status: statusFilter || undefined,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })
      }
      searchPlaceholder="Search campaigns..."
      columns={[
        {
          key: 'name', header: 'Campaign', sortable: true,
          cell: (c) => <span className="text-sm font-medium">{c.name}</span>,
        },
        {
          key: 'type', header: 'Type', sortable: true,
          cell: (c) => (
            <Tag tone="neutral" className="flex w-fit items-center gap-1">
              {channelIcon(c.type)} {c.type?.toUpperCase()}
            </Tag>
          ),
        },
        {
          key: 'status', header: 'Status', sortable: true,
          cell: (c) => <Tag tone={statusTone(c.status ?? '')}>{c.status}</Tag>,
        },
        {
          key: 'sentCount', header: 'Sent', align: 'right', sortable: true,
          cell: (c) => (c.sentCount ?? 0).toLocaleString('en-IN'),
        },
        {
          key: 'openedCount', header: 'Opened', align: 'right',
          cell: (c) => {
            const sent = c.sentCount ?? 0;
            const opened = c.openedCount ?? 0;
            const rate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0';
            return (
              <span>
                {opened.toLocaleString('en-IN')}{' '}
                <span className="text-xs text-ds-foreground-muted">({rate}%)</span>
              </span>
            );
          },
        },
        {
          key: 'clickedCount', header: 'Clicked', align: 'right',
          cell: (c) => {
            const sent = c.sentCount ?? 0;
            const clicked = c.clickedCount ?? 0;
            const rate = sent > 0 ? ((clicked / sent) * 100).toFixed(1) : '0';
            return (
              <span>
                {clicked.toLocaleString('en-IN')}{' '}
                <span className="text-xs text-ds-foreground-muted">({rate}%)</span>
              </span>
            );
          },
        },
        {
          key: 'createdAt', header: 'Created', sortable: true,
          cell: (c) => (c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'),
        },
      ]}
      primaryAction={
        <Button size="sm" onClick={() => router.push('/campaigns/new')}>
          <Plus aria-hidden="true" /> New campaign
        </Button>
      }
      headerActions={
        <>
          <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
      filters={activeFilters}
      onRemoveFilter={removeFilter}
      onClearFilters={() => { setTypeFilter(''); setStatusFilter(''); }}
      rowActions={(c) => (
        <>
          <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/campaigns/${c.id}`)}>
            <Eye />
          </Button>
          {c.status === 'running' && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Pause"
              onClick={async () => {
                const result = await cancelCampaign(c.id);
                if (result) { toast.success('Campaign paused'); setRefreshKey((k) => k + 1); }
                else toast.error('Failed to pause campaign');
              }}
            >
              <Pause />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete"
            onClick={async () => {
              const result = await deleteCampaign(c.id);
              if (result !== undefined) { toast.success('Campaign deleted'); setRefreshKey((k) => k + 1); }
              else toast.error('Failed to delete campaign');
            }}
          >
            <Trash2 />
          </Button>
        </>
      )}
      onRowClick={(c) => router.push(`/campaigns/${c.id}`)}
      bulkActions={[
        {
          label: 'Delete',
          icon: <Trash2 aria-hidden="true" />,
          destructive: true,
          onSelect: async (rows) => {
            await Promise.all(rows.map((r) => campaignsApi.delete(r.id)));
            toast.success(`${rows.length} campaign(s) deleted`);
            setRefreshKey((k) => k + 1);
          },
        },
      ]}
      onExport={async (rows) => {
        try {
          const allItems: Campaign[] = [...rows];
          const seen = new Set(allItems.map((r) => r.id));
          let page = 1;
          const limit = 200;
          // page through the full filtered dataset, not just what's loaded on screen
          for (;;) {
            const res = await campaignsApi.list({
              page,
              limit,
              type: typeFilter || undefined,
              status: statusFilter || undefined,
            });
            const page_ = unwrapList<Campaign>(res);
            const items = page_.data;
            const total = page_.pagination.total;
            for (const item of items) {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                allItems.push(item);
              }
            }
            if (items.length === 0 || allItems.length >= total) break;
            page += 1;
          }

          const headers = ['Name', 'Type', 'Status', 'Sent', 'Delivered', 'Opened', 'Clicked', 'Created'];
          const csvRows = [headers.join(',')];
          for (const c of allItems) {
            csvRows.push([
              toCsvValue(c.name),
              toCsvValue(c.type),
              toCsvValue(c.status),
              toCsvValue(c.sentCount ?? 0),
              toCsvValue(c.deliveredCount ?? 0),
              toCsvValue(c.openedCount ?? 0),
              toCsvValue(c.clickedCount ?? 0),
              toCsvValue(c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN') : ''),
            ].join(','));
          }
          const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `campaigns_export_${toLocalDateString(new Date())}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success('Campaigns exported successfully');
        } catch {
          toast.error('Failed to export campaigns');
        }
      }}
      exportLabel="Export CSV"
      emptyTitle="No campaigns yet"
      emptyDescription="Reach your contacts by creating your first email, SMS or WhatsApp campaign."
      emptyIcon={<Mail className="size-8" aria-hidden="true" />}
      emptyAction={
        <Button size="sm" onClick={() => router.push('/campaigns/new')}>
          <Plus aria-hidden="true" /> New campaign
        </Button>
      }
    />
  );
}
