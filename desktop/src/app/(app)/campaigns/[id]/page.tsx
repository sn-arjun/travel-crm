'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Mail, MessageSquare, Send, Pause, XCircle, Loader2,
  TrendingUp, Eye, MousePointerClick, AlertCircle, CheckCircle2,
  Clock, BarChart3, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { campaignsApi, type SendCampaignRequest, type ScheduleCampaignRequest, type CampaignRecipient } from '@/lib/api/campaigns';
import type { Campaign } from '@travelcrm/shared';

function getStatusColor(status: string) {
  switch (status) {
    case 'draft':
      return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400';
    case 'running':
    case 'active':
      return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400';
    case 'completed':
      return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400';
    case 'paused':
    case 'scheduled':
      return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

function getChannelIcon(type: string) {
  switch (type) {
    case 'email': return <Mail className="h-4 w-4" />;
    case 'sms': return <MessageSquare className="h-4 w-4" />;
    case 'whatsapp': return <MessageSquare className="h-4 w-4" />;
    default: return <Mail className="h-4 w-4" />;
  }
}


function getRecipientStatusBadge(status: string) {
  switch (status) {
    case 'delivered':
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">Delivered</Badge>;
    case 'opened':
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]">Opened</Badge>;
    case 'clicked':
      return <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-[10px]">Clicked</Badge>;
    case 'bounced':
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">Bounced</Badge>;
    case 'failed':
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]">Failed</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

export default function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.id as string;

  const [showScheduleDialog, setShowScheduleDialog] = React.useState(false);
  const [scheduleDate, setScheduleDate] = React.useState('');
  const [scheduleTime, setScheduleTime] = React.useState('');

  const { data: campaignResponse, loading, error, refetch } = useApiQuery(
    () => campaignsApi.getById(campaignId),
    [campaignId],
  );

  const campaign = (campaignResponse?.data ?? null) as (Campaign & {
    description?: string;
    sent?: number;
    delivered?: number;
    opened?: number;
    clicked?: number;
    bounced?: number;
    failed?: number;
  }) | null;

  const { mutate: sendCampaign, loading: isSending } = useApiMutation(
    (data: SendCampaignRequest) => campaignsApi.send(campaignId, data),
  );

  const { mutate: scheduleCampaign, loading: isScheduling } = useApiMutation(
    (data: ScheduleCampaignRequest) => campaignsApi.schedule(campaignId, data),
  );

  const { mutate: cancelCampaign, loading: isCancelling } = useApiMutation(
    (data: { reason?: string }) => campaignsApi.cancel(campaignId, data),
  );

  // Infinite scroll for recipients
  const recipientFetcher = React.useCallback(
    (page: number, limit: number) => campaignsApi.getRecipients(campaignId, { page, limit }),
    [campaignId],
  );
  const {
    items: recipients,
    loading: recipientsLoading,
    loadingMore: recipientsLoadingMore,
    total: recipientTotal,
    sentinelRef: recipientSentinelRef,
  } = useInfiniteScroll<CampaignRecipient>({
    fetcher: recipientFetcher,
    limit: 25,
  });

  // Auto-refresh every 30s while campaign is sending/running
  const campaignStatus = (campaign?.status ?? '') as string;
  React.useEffect(() => {
    if (campaignStatus !== 'sending' && campaignStatus !== 'running') return;
    const interval = setInterval(() => { refetch(); }, 30_000);
    return () => clearInterval(interval);
  }, [campaignStatus, refetch]);

  const handleSendNow = async () => {
    if (!confirm('Are you sure you want to send this campaign now?')) return;

    const result = await sendCampaign({ sendImmediately: true });
    if (result) {
      toast.success('Campaign sent!');
      await refetch();
    } else {
      toast.error('Failed to send campaign');
    }
  };

  const handleSchedule = async () => {
    if (!scheduleDate || !scheduleTime) {
      toast.error('Please select date and time');
      return;
    }

    const result = await scheduleCampaign({
      scheduledFor: `${scheduleDate}T${scheduleTime}:00`,
    });
    if (result) {
      toast.success('Campaign scheduled!');
      setShowScheduleDialog(false);
      await refetch();
    } else {
      toast.error('Failed to schedule campaign');
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this campaign?')) return;

    const result = await cancelCampaign({ reason: 'Cancelled by user' });
    if (result) {
      toast.success('Campaign cancelled');
      await refetch();
    } else {
      toast.error('Failed to cancel campaign');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-6 py-4 border-b flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-6 w-64" />
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-muted-foreground">Failed to load campaign</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  const sent = campaign.sent ?? 0;
  const delivered = campaign.delivered ?? 0;
  const opened = campaign.opened ?? 0;
  const clicked = campaign.clicked ?? 0;
  const bounced = campaign.bounced ?? 0;
  const failed = campaign.failed ?? 0;

  const deliveryRate = sent > 0 ? ((delivered / sent) * 100).toFixed(1) : '0';
  const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0';
  const clickRate = sent > 0 ? ((clicked / sent) * 100).toFixed(1) : '0';
  const bounceRate = sent > 0 ? ((bounced / sent) * 100).toFixed(1) : '0';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {campaign.name}
              </h1>
              <Badge variant="outline" className={cn('capitalize', getStatusColor(campaign.status ?? ''))}>
                {campaign.status}
              </Badge>
              <Badge variant="outline" className="text-xs flex items-center gap-1">
                {getChannelIcon(campaign.type)}
                {campaign.type?.toUpperCase()}
              </Badge>
            </div>
            {campaign.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{campaign.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowScheduleDialog(true)}>
                <Clock className="h-4 w-4 mr-1.5" />
                Schedule
              </Button>
              <Button size="sm" onClick={handleSendNow} disabled={isSending}>
                {isSending ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1.5" />
                )}
                Send Now
              </Button>
            </>
          )}
          {campaign.status === 'running' && (
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Pause className="h-4 w-4 mr-1.5" />
              )}
              Pause
            </Button>
          )}
          {campaign.status === 'scheduled' && (
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handleCancel} disabled={isCancelling}>
              <XCircle className="h-4 w-4 mr-1.5" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Sent', value: sent, icon: Send, color: 'text-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-900/20' },
            { label: 'Delivered', value: delivered, icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-50 dark:bg-green-900/20', rate: deliveryRate },
            { label: 'Opened', value: opened, icon: Eye, color: 'text-purple-500', bgColor: 'bg-purple-50 dark:bg-purple-900/20', rate: openRate },
            { label: 'Clicked', value: clicked, icon: MousePointerClick, color: 'text-indigo-500', bgColor: 'bg-indigo-50 dark:bg-indigo-900/20', rate: clickRate },
            { label: 'Bounced', value: bounced, icon: AlertCircle, color: 'text-amber-500', bgColor: 'bg-amber-50 dark:bg-amber-900/20', rate: bounceRate },
            { label: 'Failed', value: failed, icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-50 dark:bg-red-900/20' },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value.toLocaleString('en-IN')}</p>
                    {stat.rate && (
                      <p className="text-xs text-muted-foreground">{stat.rate}%</p>
                    )}
                  </div>
                  <div className={cn('p-2 rounded-lg', stat.bgColor)}>
                    <stat.icon className={cn('h-4 w-4', stat.color)} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Progress Bar */}
        {sent > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Delivery Funnel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { label: 'Delivered', value: delivered, total: sent, color: 'bg-green-500' },
                  { label: 'Opened', value: opened, total: sent, color: 'bg-purple-500' },
                  { label: 'Clicked', value: clicked, total: sent, color: 'bg-indigo-500' },
                ].map((bar) => {
                  const pct = bar.total > 0 ? (bar.value / bar.total) * 100 : 0;
                  return (
                    <div key={bar.label} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{bar.label}</span>
                        <span className="font-medium">{bar.value.toLocaleString('en-IN')} ({pct.toFixed(1)}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', bar.color)}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Campaign Details */}
        <div className="grid grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaign Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Channel</span>
                <span className="flex items-center gap-1.5 font-medium">
                  {getChannelIcon(campaign.type)} {campaign.type?.toUpperCase()}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className={cn('capitalize', getStatusColor(campaign.status ?? ''))}>
                  {campaign.status}
                </Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">
                  {campaign.createdAt
                    ? new Date(campaign.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '-'}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Target Segment</span>
                <span className="font-medium">{(campaign as any).targetSegment || 'All Contacts'}</span>
              </div>
            </CardContent>
          </Card>

          {((campaign as any).body || (campaign as any).subject) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Content Preview</CardTitle>
              </CardHeader>
              <CardContent>
                {(campaign as any).subject && (
                  <div className="mb-3">
                    <p className="text-xs text-muted-foreground mb-1">Subject</p>
                    <p className="text-sm font-medium">{(campaign as any).subject}</p>
                  </div>
                )}
                {(campaign as any).body && (
                  <div className="rounded-lg border p-3 bg-muted/30 max-h-40 overflow-auto">
                    <pre className="text-xs whitespace-pre-wrap font-sans">{(campaign as any).body}</pre>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recipients Table — with infinite scroll */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Recipients ({recipientTotal})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recipientsLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Opened</TableHead>
                      <TableHead>Clicked</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipients.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-6 text-sm">
                          No recipient data available yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      recipients.map((recipient) => (
                        <TableRow key={recipient.id}>
                          <TableCell className="text-sm font-medium">{(recipient as any).name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{recipient.email}</TableCell>
                          <TableCell>{getRecipientStatusBadge(recipient.status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {(recipient as any).openedAt
                              ? new Date((recipient as any).openedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                              : '-'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {(recipient as any).clickedAt
                              ? new Date((recipient as any).clickedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                <div ref={recipientSentinelRef} className="flex items-center justify-center py-3">
                  {recipientsLoadingMore && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm mb-1.5 block">Date</Label>
              <Input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Time</Label>
              <Input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>Cancel</Button>
            <Button onClick={handleSchedule} disabled={isScheduling}>
              {isScheduling ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Clock className="h-4 w-4 mr-1.5" />
              )}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
