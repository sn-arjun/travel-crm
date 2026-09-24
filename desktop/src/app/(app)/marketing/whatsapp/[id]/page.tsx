'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, Lock, Pause, Send, Trash2 } from 'lucide-react';
import { DetailPage } from '@/components/domain';
import { DataTable } from '@/components/ui/data-table';
import { SectionCard } from '@/components/ui/section-card';
import { Stat } from '@/components/ui/stat';
import { Tag } from '@/components/ui/tag';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import {
  whatsappCampaignsApi,
  type WhatsappCampaign,
  type WhatsappCampaignAnalytics,
  type WhatsappCampaignRecipient,
  type WhatsappCampaignStatus,
} from '@/lib/api/whatsapp-campaigns';

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

export default function WhatsappCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const { enabled, reason, loading: gateLoading } = useFeatureGate('whatsapp_campaigns');
  const [campaign, setCampaign] = React.useState<WhatsappCampaign | null>(null);
  const [analytics, setAnalytics] = React.useState<WhatsappCampaignAnalytics | null>(null);
  const [recipients, setRecipients] = React.useState<WhatsappCampaignRecipient[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [recipientsLoading, setRecipientsLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await whatsappCampaignsApi.getById(params.id);
      setCampaign(res.data);
    } catch {
      toast.error('Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  const loadAnalytics = React.useCallback(async () => {
    try {
      const res = await whatsappCampaignsApi.getAnalytics(params.id);
      setAnalytics(res.data);
    } catch {
      setAnalytics(null);
    }
  }, [params.id]);

  const loadRecipients = React.useCallback(async () => {
    setRecipientsLoading(true);
    try {
      const res = await whatsappCampaignsApi.getRecipients(params.id, { limit: 100 });
      setRecipients(res.data.data);
    } catch {
      setRecipients([]);
    } finally {
      setRecipientsLoading(false);
    }
  }, [params.id]);

  React.useEffect(() => {
    if (gateLoading || !enabled) return;
    void load();
    void loadAnalytics();
    void loadRecipients();
  }, [gateLoading, enabled, load, loadAnalytics, loadRecipients]);

  async function handleSend() {
    const ok = await confirm({
      title: 'Send campaign?',
      description: `This will send "${campaign?.name}" to the target audience now.`,
      confirmLabel: 'Send',
    });
    if (!ok || !campaign) return;
    try {
      await whatsappCampaignsApi.send(campaign.id);
      toast.success('Campaign sent');
      void load();
      void loadRecipients();
    } catch {
      toast.error('Failed to send campaign');
    }
  }

  async function handlePause() {
    if (!campaign) return;
    try {
      await whatsappCampaignsApi.pause(campaign.id);
      toast.success('Campaign paused');
      void load();
    } catch {
      toast.error('Failed to pause campaign');
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
      await whatsappCampaignsApi.cancel(campaign.id);
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
      await whatsappCampaignsApi.delete(campaign.id);
      toast.success('Campaign deleted');
      router.push('/marketing/whatsapp');
    } catch {
      toast.error('Failed to delete campaign');
    }
  }

  if (gateLoading) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 p-ds-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-warning-subtle text-ds-warning-on-subtle">
          <Lock className="size-6" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-ds-foreground">WhatsApp Campaigns is not available on your plan</p>
        <p className="max-w-sm text-sm text-ds-foreground-subtle">
          {reason === 'cap_exceeded'
            ? 'You have reached your WhatsApp messaging limit for this billing period.'
            : 'Upgrade your plan to send bulk WhatsApp campaigns from approved templates.'}
        </p>
        <Button size="sm" variant="outline" asChild>
          <a href="/settings/billing">{reason === 'cap_exceeded' ? 'View usage' : 'Upgrade plan'}</a>
        </Button>
      </div>
    );
  }

  if (loading || !campaign) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <>
      <DetailPage<WhatsappCampaign>
        entity={campaign}
        title={campaign.name}
        subtitle={campaign.templateName}
        status={<Tag tone={statusTone(campaign.status)} className="capitalize">{campaign.status}</Tag>}
        onBack={() => router.push('/marketing/whatsapp')}
        primaryActions={
          campaign.status === 'draft' || campaign.status === 'scheduled' ? (
            <Button size="sm" onClick={() => void handleSend()} className="gap-ds-2">
              <Send className="size-4" aria-hidden="true" /> Send now
            </Button>
          ) : campaign.status === 'sending' ? (
            <Button size="sm" variant="outline" onClick={() => void handlePause()} className="gap-ds-2">
              <Pause className="size-4" aria-hidden="true" /> Pause
            </Button>
          ) : undefined
        }
        actions={[
          ...(campaign.status === 'sending' || campaign.status === 'scheduled' || campaign.status === 'paused'
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
              <Stat label="Read" value={(analytics?.readCount ?? campaign.readCount ?? 0).toLocaleString()} />
              <Stat label="Replied" value={(analytics?.repliedCount ?? campaign.repliedCount ?? 0).toLocaleString()} />
            </div>
            <SectionCard title="Campaign details">
              <dl className="grid gap-ds-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-ds-foreground-muted">Template</dt>
                  <dd className="text-sm">{campaign.templateName ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ds-foreground-muted">Audience</dt>
                  <dd className="text-sm">{campaign.segmentName ?? 'All contacts'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ds-foreground-muted">Scheduled for</dt>
                  <dd className="text-sm">
                    {campaign.scheduledFor ? new Date(campaign.scheduledFor).toLocaleString('en-IN') : 'Not scheduled'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-ds-foreground-muted">Recipients</dt>
                  <dd className="text-sm">{(campaign.recipientCount ?? recipients.length).toLocaleString()}</dd>
                </div>
              </dl>
            </SectionCard>
          </div>
        }
        related={[
          {
            title: 'Recipients',
            content: (
              <DataTable<WhatsappCampaignRecipient>
                columns={[
                  { key: 'name', header: 'Name' },
                  { key: 'phone', header: 'Phone' },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (r) => (
                      <Tag tone={r.status === 'failed' ? 'danger' : r.status === 'replied' || r.status === 'read' ? 'success' : 'neutral'} className="capitalize">
                        {r.status}
                      </Tag>
                    ),
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
