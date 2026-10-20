'use client';


import { formatLocaleDate } from '@/lib/format';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, Lock, MessageCircle, Pause, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { ListPage } from '@/components/domain';
import { Button, Skeleton, Tag } from '@/components/ui';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useFeatureGate, UPGRADE_HREF } from '@/hooks/use-feature-gate';
import {
  whatsappCampaignsApi,
  type WhatsappCampaign,
  type WhatsappCampaignStatus,
} from '@/lib/api/whatsapp-campaigns';
import { toLocalDateString } from '@/lib/dates';

function statusTone(status: WhatsappCampaignStatus): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  switch (status) {
    case 'sent':
      return 'success';
    case 'failed':
    case 'cancelled':
      return 'danger';
    case 'sending':
    case 'paused':
      return 'warning';
    case 'scheduled':
      return 'info';
    default:
      return 'neutral';
  }
}

const STATUS_OPTIONS: WhatsappCampaignStatus[] = ['draft', 'sending', 'paused', 'sent', 'cancelled', 'failed'];

function toCsv(rows: WhatsappCampaign[]) {
  const header = ['Name', 'Template', 'Status', 'Sent', 'Delivered', 'Read', 'Replied', 'Scheduled for', 'Created'];
  const lines = rows.map((c) =>
    [
      c.name,
      c.templateName ?? '',
      c.status,
      c.sentCount ?? 0,
      c.deliveredCount ?? 0,
      c.readCount ?? 0,
      c.repliedCount ?? 0,
      c.scheduledFor ?? '',
      c.createdAt ?? '',
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

async function exportAllCampaigns(status: string | undefined) {
  const pageSize = 200;
  let page = 1;
  let all: WhatsappCampaign[] = [];
  for (;;) {
    const res = await whatsappCampaignsApi.list({ page, limit: pageSize, status });
    const items = res.data.data;
    all = all.concat(items);
    if (all.length >= res.data.pagination.total || items.length === 0) break;
    page += 1;
  }
  const csv = toCsv(all);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `whatsapp-campaigns-${toLocalDateString(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function UpsellState({ reason }: { reason: 'not_in_plan' | 'cap_exceeded' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-ds-3 rounded-ds-md border border-ds-border bg-ds-surface p-ds-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-warning-subtle text-ds-warning-on-subtle">
        <Lock className="size-6" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-medium text-ds-foreground">WhatsApp Campaigns is not available on your plan</p>
        <p className="mt-ds-1 max-w-sm text-sm text-ds-foreground-subtle">
          {reason === 'cap_exceeded'
            ? 'You have reached your WhatsApp messaging limit for this billing period.'
            : 'Upgrade your plan to send bulk WhatsApp campaigns from approved templates.'}
        </p>
      </div>
      <Button size="sm" variant="outline" asChild>
        <a href={UPGRADE_HREF}>{reason === 'cap_exceeded' ? 'View usage' : 'Upgrade plan'}</a>
      </Button>
    </div>
  );
}

export default function WhatsappCampaignsPage() {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const { enabled, reason, loading: gateLoading } = useFeatureGate('whatsapp_campaigns');
  const [statusFilter, setStatusFilter] = React.useState<string | undefined>(undefined);
  const [reloadKey, setReloadKey] = React.useState(0);

  async function handlePause(c: WhatsappCampaign) {
    try {
      await whatsappCampaignsApi.pause(c.id);
      toast.success('Campaign paused');
      setReloadKey((k) => k + 1);
    } catch {
      toast.error('Failed to pause campaign');
    }
  }

  async function handleCancel(c: WhatsappCampaign) {
    const ok = await confirm({
      title: 'Cancel campaign?',
      description: `This will stop "${c.name}" from sending further messages.`,
      confirmLabel: 'Cancel campaign',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await whatsappCampaignsApi.cancel(c.id);
      toast.success('Campaign cancelled');
      setReloadKey((k) => k + 1);
    } catch {
      toast.error('Failed to cancel campaign');
    }
  }

  async function handleDelete(c: WhatsappCampaign) {
    const ok = await confirm({
      title: 'Delete campaign?',
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await whatsappCampaignsApi.delete(c.id);
      toast.success('Campaign deleted');
      setReloadKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete campaign');
    }
  }

  if (gateLoading) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col gap-ds-6 p-ds-6">
        <UpsellState reason={reason === 'cap_exceeded' ? 'cap_exceeded' : 'not_in_plan'} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-ds-6 p-ds-6">
      <ListPage<WhatsappCampaign>
        refreshKey={reloadKey}
        title="WhatsApp Campaigns"
        description="Send bulk WhatsApp messages from approved templates and track delivery."
        getRowId={(c) => c.id}
        fetcher={({ page, limit, search }) =>
          whatsappCampaignsApi.list({ page, limit, search, status: statusFilter })
        }
        columns={[
          { key: 'name', header: 'Campaign', sortable: true, hideable: false },
          {
            key: 'templateName',
            header: 'Template',
            cell: (c) => c.templateName ?? '—',
          },
          {
            key: 'status',
            header: 'Status',
            cell: (c) => <Tag tone={statusTone(c.status)} className="capitalize">{c.status}</Tag>,
          },
          {
            key: 'sentCount',
            header: 'Sent',
            align: 'right',
            cell: (c) => (c.sentCount ?? 0).toLocaleString(),
          },
          {
            key: 'deliveredCount',
            header: 'Delivered',
            align: 'right',
            cell: (c) => (c.deliveredCount ?? 0).toLocaleString(),
          },
          {
            key: 'readCount',
            header: 'Read',
            align: 'right',
            cell: (c) => (c.readCount ?? 0).toLocaleString(),
          },
          {
            key: 'scheduledFor',
            header: 'Scheduled',
            cell: (c) =>
              c.scheduledFor
                ? formatLocaleDate(c.scheduledFor, { day: 'numeric', month: 'short', year: 'numeric' })
                : '—',
          },
        ]}
        headerActions={
          <select
            aria-label="Filter by status"
            value={statusFilter ?? ''}
            onChange={(e) => setStatusFilter(e.target.value || undefined)}
            className="h-8 rounded-ds-md border border-ds-border bg-ds-surface px-ds-2 text-sm text-ds-foreground"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s} className="capitalize">{s}</option>
            ))}
          </select>
        }
        primaryAction={
          <Button size="sm" onClick={() => router.push('/marketing/whatsapp/new')} className="gap-ds-2">
            <Plus aria-hidden="true" /> New campaign
          </Button>
        }
        searchPlaceholder="Search campaigns..."
        filters={statusFilter ? [{ id: 'status', label: 'Status', value: statusFilter }] : []}
        onRemoveFilter={() => setStatusFilter(undefined)}
        onClearFilters={() => setStatusFilter(undefined)}
        onRowClick={(c) => router.push(`/marketing/whatsapp/${c.id}`)}
        rowActions={(c) => (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="View"
              onClick={() => router.push(`/marketing/whatsapp/${c.id}`)}
            >
              <Eye aria-hidden="true" />
            </Button>
            {(c.status === 'draft' || c.status === 'scheduled') && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Send"
                onClick={() => void whatsappCampaignsApi.send(c.id).then(() => {
                  toast.success('Campaign sent');
                  setReloadKey((k) => k + 1);
                }).catch(() => toast.error('Failed to send campaign'))}
              >
                <Send aria-hidden="true" />
              </Button>
            )}
            {c.status === 'sending' && (
              <Button variant="ghost" size="icon-sm" aria-label="Pause" onClick={() => void handlePause(c)}>
                <Pause aria-hidden="true" />
              </Button>
            )}
            {(c.status === 'sending' || c.status === 'scheduled' || c.status === 'paused') && (
              <Button variant="ghost" size="icon-sm" aria-label="Cancel" onClick={() => void handleCancel(c)}>
                <X aria-hidden="true" />
              </Button>
            )}
            {c.status === 'draft' && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Edit"
                onClick={() => router.push(`/marketing/whatsapp/${c.id}/edit`)}
              >
                <Pencil aria-hidden="true" />
              </Button>
            )}
            {c.status === 'draft' && (
              <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => void handleDelete(c)}>
                <Trash2 aria-hidden="true" />
              </Button>
            )}
          </>
        )}
        bulkActions={[
          {
            label: 'Delete',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              await Promise.all(rows.map((r) => whatsappCampaignsApi.delete(r.id)));
              toast.success(`${rows.length} campaign${rows.length !== 1 ? 's' : ''} deleted`);
              setReloadKey((k) => k + 1);
            },
          },
        ]}
        onExport={async () => {
          await exportAllCampaigns(statusFilter);
        }}
        exportLabel="Export all"
        emptyIcon={<MessageCircle className="size-10" aria-hidden="true" />}
        emptyTitle="No WhatsApp campaigns yet"
        emptyDescription="Create a campaign from an approved WhatsApp template to reach your contacts in bulk."
        emptyAction={
          <Button size="sm" onClick={() => router.push('/marketing/whatsapp/new')}>
            Create your first campaign
          </Button>
        }
      />
      {dialog}
    </div>
  );
}
