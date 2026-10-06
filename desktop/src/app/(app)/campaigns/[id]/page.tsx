'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Send, Pause, XCircle, Clock, Pencil, Users, Mail, MessageSquare,
} from 'lucide-react';
import { DetailPage } from '@/components/domain';
import {
  Button, Tag, SectionCard, Skeleton, EmptyState, DataTable, Dialog, DialogContent,
  DialogHeader, DialogTitle, DialogFooter, DatePicker, Input, Label, useConfirm,
} from '@/components/ui';
import { PageContainer } from '@/components/layout/page-container';
import { formatDisplayDate } from '@/lib/dates';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import {
  campaignsApi, type SendCampaignRequest, type ScheduleCampaignRequest, type CampaignRecipient,
} from '@/lib/api/campaigns';
import type { Campaign } from '@travelcrm/shared';
import { useRealtimeEvent, useRealtimeConnected } from '@/hooks/use-realtime-event';
import { toast } from 'sonner';

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'running') return 'success';
  if (status === 'completed') return 'info';
  if (status === 'scheduled' || status === 'paused') return 'warning';
  return 'neutral';
}

function channelIcon(type: string) {
  if (type === 'email') return <Mail className="size-3.5" aria-hidden="true" />;
  if (type === 'sms' || type === 'whatsapp') return <MessageSquare className="size-3.5" aria-hidden="true" />;
  return null;
}

function recipientStatusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'opened' || status === 'clicked') return 'success';
  if (status === 'bounced') return 'warning';
  if (status === 'failed') return 'danger';
  if (status === 'delivered') return 'info';
  return 'neutral';
}

export default function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;

  const { confirm, dialog: confirmDialog } = useConfirm();
  const [showScheduleDialog, setShowScheduleDialog] = React.useState(false);
  const [scheduleDate, setScheduleDate] = React.useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = React.useState('');

  const { data: campaignResponse, loading, error, refetch } = useApiQuery(
    () => campaignsApi.getById(campaignId),
    [campaignId],
  );

  const campaign = (campaignResponse?.data ?? null) as Campaign | null;

  const { mutate: sendCampaign, loading: isSending } = useApiMutation(
    (data: SendCampaignRequest) => campaignsApi.send(campaignId, data),
  );
  const { mutate: scheduleCampaign, loading: isScheduling } = useApiMutation(
    (data: ScheduleCampaignRequest) => campaignsApi.schedule(campaignId, data),
  );
  const { mutate: cancelCampaign, loading: isCancelling } = useApiMutation(
    (data: { reason?: string }) => campaignsApi.cancel(campaignId, data),
  );
  const { mutate: deleteCampaign } = useApiMutation(() => campaignsApi.delete(campaignId));

  const recipientFetcher = React.useCallback(
    (page: number, limit: number) => campaignsApi.getRecipients(campaignId, { page, limit }),
    [campaignId],
  );
  const {
    items: recipients,
    loading: recipientsLoading,
    total: recipientTotal,
  } = useInfiniteScroll<CampaignRecipient>({ fetcher: recipientFetcher, limit: 25 });

  const campaignStatus = campaign?.status ?? '';
  useRealtimeEvent(['campaign:progress', 'campaign:completed', 'campaign:failed'], (data) => {
    if (data?.campaignId === campaignId) refetch();
  });

  const wsConnected = useRealtimeConnected();
  React.useEffect(() => {
    if (wsConnected) return;
    if (campaignStatus !== 'running') return;
    const interval = setInterval(() => { refetch(); }, 30_000);
    return () => clearInterval(interval);
  }, [wsConnected, campaignStatus, refetch]);

  async function handleSendNow() {
    const ok = await confirm({
      title: 'Send this campaign now?',
      description: 'Messages go out to every recipient straight away and cannot be recalled.',
      confirmLabel: 'Send now',
    });
    if (!ok) return;
    const result = await sendCampaign({ sendImmediately: true });
    if (result) {
      toast.success('Campaign sent!');
      await refetch();
    } else {
      toast.error('Failed to send campaign');
    }
  }

  async function handleSchedule() {
    if (!scheduleDate || !scheduleTime) {
      toast.error('Please select a date and time');
      return;
    }
    const [hours, minutes] = scheduleTime.split(':').map(Number);
    const scheduledAt = new Date(scheduleDate);
    scheduledAt.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    const result = await scheduleCampaign({ scheduledAt: scheduledAt.toISOString() });
    if (result) {
      toast.success('Campaign scheduled!');
      setShowScheduleDialog(false);
      await refetch();
    } else {
      toast.error('Failed to schedule campaign');
    }
  }

  async function handleCancel() {
    const ok = await confirm({
      title: 'Cancel this campaign?',
      description: 'Pending messages will not be sent. Messages already delivered are not affected.',
      confirmLabel: 'Cancel campaign',
      cancelLabel: 'Keep campaign',
      tone: 'destructive',
    });
    if (!ok) return;
    const result = await cancelCampaign({ reason: 'Cancelled by user' });
    if (result) {
      toast.success('Campaign cancelled');
      await refetch();
    } else {
      toast.error('Failed to cancel campaign');
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: 'Delete this campaign?',
      description: 'The campaign and its recipient history will be removed permanently.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    const result = await deleteCampaign(undefined);
    if (result !== undefined) {
      toast.success('Campaign deleted');
      router.push('/campaigns');
    } else {
      toast.error('Failed to delete campaign');
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  if (error || !campaign) {
    return (
      <EmptyState
        title="Campaign not found"
        description="This campaign could not be loaded."
        action={<Button variant="outline" onClick={() => router.back()}>Go back</Button>}
      />
    );
  }

  const sent = campaign.sentCount ?? 0;
  const delivered = campaign.deliveredCount ?? 0;
  const opened = campaign.openedCount ?? 0;
  const clicked = campaign.clickedCount ?? 0;

  const deliveryRate = sent > 0 ? ((delivered / sent) * 100).toFixed(1) : '0';
  const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0';
  const clickRate = sent > 0 ? ((clicked / sent) * 100).toFixed(1) : '0';

  const canEdit = campaign.status === 'draft' || campaign.status === 'scheduled';

  return (
    <>
      <DetailPage<Campaign>
        entity={campaign}
        title={campaign.name}
        status={<Tag tone={statusTone(campaign.status ?? '')}>{campaign.status}</Tag>}
        onBack={() => router.back()}
        primaryActions={
          canEdit ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowScheduleDialog(true)} className="gap-ds-2">
                <Clock aria-hidden="true" /> Schedule
              </Button>
              <Button size="sm" onClick={handleSendNow} disabled={isSending} className="gap-ds-2">
                <Send aria-hidden="true" /> Send now
              </Button>
            </>
          ) : campaign.status === 'running' ? (
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={isCancelling} className="gap-ds-2">
              <Pause aria-hidden="true" /> Pause
            </Button>
          ) : undefined
        }
        actions={[
          ...(canEdit
            ? [{ label: 'Edit', icon: <Pencil />, onSelect: () => router.push(`/campaigns/${campaign.id}/edit`) }]
            : []),
          ...(campaign.status === 'scheduled'
            ? [{ label: 'Cancel schedule', icon: <XCircle />, onSelect: handleCancel, destructive: true }]
            : []),
          { label: 'Delete', icon: <XCircle />, onSelect: handleDelete, destructive: true, separatorBefore: true },
        ]}
        overview={
          <div className="grid gap-ds-4 sm:grid-cols-2">
            <SectionCard title="Performance">
              <div className="grid grid-cols-2 gap-ds-4 sm:grid-cols-4">
                <div>
                  <p className="mb-ds-1 text-xs text-ds-foreground-muted">Sent</p>
                  <p className="text-lg font-semibold">{sent.toLocaleString('en-IN')}</p>
                </div>
                <div>
                  <p className="mb-ds-1 text-xs text-ds-foreground-muted">Delivered</p>
                  <p className="text-lg font-semibold">{delivered.toLocaleString('en-IN')}</p>
                  <p className="text-xs text-ds-foreground-muted">{deliveryRate}%</p>
                </div>
                <div>
                  <p className="mb-ds-1 text-xs text-ds-foreground-muted">Opened</p>
                  <p className="text-lg font-semibold">{opened.toLocaleString('en-IN')}</p>
                  <p className="text-xs text-ds-foreground-muted">{openRate}%</p>
                </div>
                <div>
                  <p className="mb-ds-1 text-xs text-ds-foreground-muted">Clicked</p>
                  <p className="text-lg font-semibold">{clicked.toLocaleString('en-IN')}</p>
                  <p className="text-xs text-ds-foreground-muted">{clickRate}%</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Campaign info">
              <div className="flex flex-col gap-ds-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ds-foreground-muted">Channel</span>
                  <span className="flex items-center gap-ds-1 font-medium">
                    {channelIcon(campaign.type)} {campaign.type?.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ds-foreground-muted">Status</span>
                  <Tag tone={statusTone(campaign.status ?? '')}>{campaign.status}</Tag>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ds-foreground-muted">Created</span>
                  <span className="font-medium">
                    {campaign.createdAt ? formatDisplayDate(new Date(campaign.createdAt)) : '—'}
                  </span>
                </div>
                {campaign.scheduledAt && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ds-foreground-muted">Scheduled for</span>
                    <span className="font-medium">
                      {new Date(campaign.scheduledAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </div>
            </SectionCard>

            {(campaign.subject || campaign.body) && (
              <SectionCard title="Content preview" className="sm:col-span-2">
                {campaign.subject && (
                  <div className="mb-ds-3">
                    <p className="mb-ds-1 text-xs text-ds-foreground-muted">Subject</p>
                    <p className="text-sm font-medium">{campaign.subject}</p>
                  </div>
                )}
                {campaign.body && (
                  <div className="max-h-40 overflow-auto rounded-ds-md border border-ds-border bg-ds-surface-sunken p-ds-3">
                    <pre className="whitespace-pre-wrap font-sans text-xs">{campaign.body}</pre>
                  </div>
                )}
              </SectionCard>
            )}
          </div>
        }
        related={[
          {
            title: `Recipients (${recipientTotal})`,
            content: recipientsLoading ? (
              <div className="flex flex-col gap-ds-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <DataTable<CampaignRecipient>
                columns={[
                  { key: 'name', header: 'Name', cell: (r) => r.name || '—' },
                  { key: 'email', header: 'Email', cell: (r) => r.email || '—' },
                  {
                    key: 'status', header: 'Status',
                    cell: (r) => <Tag tone={recipientStatusTone(r.status)}>{r.status}</Tag>,
                  },
                  {
                    key: 'openedAt', header: 'Opened',
                    cell: (r) => (r.openedAt ? new Date(r.openedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'),
                  },
                  {
                    key: 'clickedAt', header: 'Clicked',
                    cell: (r) => (r.clickedAt ? new Date(r.clickedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'),
                  },
                ]}
                data={recipients}
                getRowId={(r) => r.id}
                emptyState={
                  <EmptyState icon={<Users className="size-8" />} title="No recipients yet" description="Recipients will appear once this campaign is sent." />
                }
              />
            ),
          },
        ]}
      />

      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-ds-4">
            <div>
              <Label className="mb-ds-1 block text-sm">Date</Label>
              <DatePicker
                value={scheduleDate}
                onChange={setScheduleDate}
                minDate={new Date()}
                placeholder="Pick a date"
              />
            </div>
            <div>
              <Label className="mb-ds-1 block text-sm">Time</Label>
              <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>Cancel</Button>
            <Button onClick={handleSchedule} disabled={isScheduling} className="gap-ds-2">
              <Clock aria-hidden="true" /> Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
