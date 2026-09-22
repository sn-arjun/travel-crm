'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, Send, Trash2 } from 'lucide-react';
import { DetailPage } from '@/components/domain';
import { DataTable } from '@/components/ui/data-table';
import { SectionCard } from '@/components/ui/section-card';
import { Stat } from '@/components/ui/stat';
import { Tag } from '@/components/ui/tag';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  marketingApi,
  type MarketingCampaign,
  type MarketingCampaignAnalytics,
  type MarketingCampaignRecipient,
} from '@/lib/api/marketing';

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

export default function MarketingCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [campaign, setCampaign] = React.useState<MarketingCampaign | null>(null);
  const [analytics, setAnalytics] = React.useState<MarketingCampaignAnalytics | null>(null);
  const [recipients, setRecipients] = React.useState<MarketingCampaignRecipient[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [recipientsLoading, setRecipientsLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await marketingApi.campaigns.get(params.id);
      setCampaign(res.data);
    } catch {
      toast.error('Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  const loadAnalytics = React.useCallback(async () => {
    try {
      const res = await marketingApi.campaigns.analytics(params.id);
      setAnalytics(res.data);
    } catch {
      setAnalytics(null);
    }
  }, [params.id]);

  const loadRecipients = React.useCallback(async () => {
    setRecipientsLoading(true);
    try {
      const res = await marketingApi.campaigns.recipients(params.id, { limit: 100 });
      setRecipients(res.data.data);
    } catch {
      setRecipients([]);
    } finally {
      setRecipientsLoading(false);
    }
  }, [params.id]);

  React.useEffect(() => {
    void load();
    void loadAnalytics();
    void loadRecipients();
  }, [load, loadAnalytics, loadRecipients]);

  async function handleSend() {
    const ok = await confirm({
      title: 'Send campaign?',
      description: `This will send "${campaign?.name}" to the target audience now.`,
      confirmLabel: 'Send',
    });
    if (!ok || !campaign) return;
    try {
      await marketingApi.campaigns.send(campaign.id);
      toast.success('Campaign sent');
      void load();
      void loadRecipients();
    } catch {
      toast.error('Failed to send campaign');
    }
  }

  async function handleCancel() {
    const ok = await confirm({
      title: 'Cancel campaign?',
      description: 'This will stop the campaign from sending further messages.',
      confirmLabel: 'Cancel campaign',
      tone: 'destructive',
    });
    if (!ok || !campaign) return;
    try {
      await marketingApi.campaigns.cancel(campaign.id);
      toast.success('Campaign cancelled');
      void load();
    } catch {
      toast.error('Failed to cancel campaign');
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete campaign?',
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok || !campaign) return;
    try {
      await marketingApi.campaigns.delete(campaign.id);
      toast.success('Campaign deleted');
      router.push('/marketing/campaigns');
    } catch {
      toast.error('Failed to delete campaign');
    }
  }

  if (loading || !campaign) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <>
    <DetailPage<MarketingCampaign>
      entity={campaign}
      title={campaign.name}
      subtitle={campaign.subject}
      status={<Tag tone={statusTone(campaign.status)}>{campaign.status}</Tag>}
      onBack={() => router.push('/marketing/campaigns')}
      primaryActions={
        campaign.status === 'draft' || campaign.status === 'scheduled' ? (
          <button
            type="button"
            onClick={handleSend}
            className="inline-flex h-9 items-center gap-ds-2 rounded-ds-md bg-ds-primary px-ds-3 text-sm font-medium text-ds-primary-foreground hover:bg-ds-primary-hover"
          >
            <Send className="size-4" aria-hidden="true" /> Send now
          </button>
        ) : undefined
      }
      actions={[
        ...(campaign.status === 'sending' || campaign.status === 'scheduled'
          ? [{ label: 'Cancel campaign', icon: <Ban aria-hidden="true" />, onSelect: handleCancel }]
          : []),
        {
          label: 'Delete',
          icon: <Trash2 aria-hidden="true" />,
          onSelect: handleDelete,
          destructive: true,
          separatorBefore: true,
        },
      ]}
      overview={
        <div className="grid gap-ds-4">
          <div className="grid grid-cols-2 gap-ds-4 sm:grid-cols-4">
            <Stat label="Sent" value={(analytics?.sentCount ?? campaign.sentCount ?? 0).toLocaleString()} loading={!analytics && loading} />
            <Stat label="Delivered" value={(analytics?.deliveredCount ?? campaign.deliveredCount ?? 0).toLocaleString()} />
            <Stat label="Open rate" value={`${analytics?.openRate ?? 0}%`} />
            <Stat label="Click rate" value={`${analytics?.clickRate ?? 0}%`} />
          </div>
          <SectionCard title="Campaign details">
            <dl className="grid gap-ds-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ds-foreground-muted">Channel</dt>
                <dd className="text-sm capitalize">{campaign.channel}</dd>
              </div>
              <div>
                <dt className="text-xs text-ds-foreground-muted">Scheduled for</dt>
                <dd className="text-sm">
                  {campaign.scheduledFor ? new Date(campaign.scheduledFor).toLocaleString('en-IN') : 'Not scheduled'}
                </dd>
              </div>
              {campaign.description && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-ds-foreground-muted">Description</dt>
                  <dd className="text-sm">{campaign.description}</dd>
                </div>
              )}
              {campaign.content && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-ds-foreground-muted">Message</dt>
                  <dd className="whitespace-pre-wrap text-sm">{campaign.content}</dd>
                </div>
              )}
            </dl>
          </SectionCard>
        </div>
      }
      related={[
        {
          title: 'Recipients',
          content: (
            <DataTable<MarketingCampaignRecipient>
              columns={[
                { key: 'name', header: 'Name' },
                { key: 'email', header: 'Contact', cell: (r) => r.email ?? r.phone ?? '—' },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (r) => <Tag tone={r.status === 'failed' ? 'danger' : r.status === 'clicked' || r.status === 'opened' ? 'success' : 'neutral'}>{r.status}</Tag>,
                },
                {
                  key: 'sentAt',
                  header: 'Sent',
                  cell: (r) => (r.sentAt ? new Date(r.sentAt).toLocaleString('en-IN') : '—'),
                },
              ]}
              data={recipients}
              getRowId={(r) => r.id}
              loading={recipientsLoading}
              emptyState={<p className="py-ds-6 text-center text-sm text-ds-foreground-muted">No recipients yet.</p>}
            />
          ),
        },
      ]}
    />
    {dialog}
    </>
  );
}
