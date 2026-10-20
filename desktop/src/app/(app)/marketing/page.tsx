'use client';


import { formatLocaleNumber } from '@/lib/format';
import * as React from 'react';
import Link from 'next/link';
import {
  Megaphone, Users, Image, Palette, Send, Eye, MousePointerClick,
  TrendingUp, ArrowRight, CalendarClock, Ban,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/layout/page-container';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { unwrapList } from '@/lib/api/envelope';
import { marketingApi, type MarketingCampaign, type MarketingSegment } from '@/lib/api/marketing';

function statusTone(status: string): 'success' | 'info' | 'primary' | 'neutral' {
  switch (status) {
    case 'running':
    case 'sending':
      return 'success';
    case 'scheduled':
      return 'info';
    case 'completed':
    case 'sent':
      return 'primary';
    default:
      return 'neutral';
  }
}

export default function MarketingDashboardPage() {
  const { data: campaignsResp, loading: loadingCampaigns } = useApiQuery(
    () => marketingApi.campaigns.list({ limit: 5, sortBy: 'created_at', sortOrder: 'desc' }),
    [],
  );
  const { data: segmentsResp, loading: loadingSegments } = useApiQuery(
    () => marketingApi.segments.list({ limit: 100 }),
    [],
  );

  const recentCampaigns: MarketingCampaign[] = React.useMemo(
    () => unwrapList<MarketingCampaign>(campaignsResp).data,
    [campaignsResp],
  );

  const segments: MarketingSegment[] = React.useMemo(
    () => unwrapList<MarketingSegment>(segmentsResp).data,
    [segmentsResp],
  );

  // Aggregate stats from recent campaigns
  const stats = React.useMemo(() => {
    const totalSent = recentCampaigns.reduce((s, c) => s + (c.sentCount ?? 0), 0);
    const totalOpened = recentCampaigns.reduce((s, c) => s + (c.openedCount ?? 0), 0);
    const totalClicked = recentCampaigns.reduce((s, c) => s + (c.clickedCount ?? 0), 0);
    const activeCampaigns = recentCampaigns.filter((c) => c.status === 'sending' || c.status === 'scheduled').length;
    const avgOpenRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0';
    const avgClickRate = totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(1) : '0';
    return { totalSent, activeCampaigns, avgOpenRate, avgClickRate, totalSegments: segments.length };
  }, [recentCampaigns, segments]);

  const quickLinks = [
    { title: 'New Campaign', href: '/marketing/campaigns/new', icon: Megaphone, color: 'text-ds-primary-on-subtle', bg: 'bg-ds-primary-subtle' },
    { title: 'New Segment', href: '/marketing/segments/new', icon: Users, color: 'text-ds-info-on-subtle', bg: 'bg-ds-info-subtle' },
    { title: 'Design Flyer', href: '/marketing/flyers', icon: Image, color: 'text-ds-danger-on-subtle', bg: 'bg-ds-danger-subtle' },
    { title: 'Branding', href: '/marketing/branding', icon: Palette, color: 'text-ds-warning-on-subtle', bg: 'bg-ds-warning-subtle' },
    { title: 'Festival Offers', href: '/marketing/festivals', icon: CalendarClock, color: 'text-ds-success-on-subtle', bg: 'bg-ds-success-subtle' },
    { title: 'Opted-Out', href: '/marketing/opted-out', icon: Ban, color: 'text-ds-danger-on-subtle', bg: 'bg-ds-danger-subtle' },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Marketing"
        description="Campaigns, segments, flyers & branding"
        actions={
          <Button asChild>
            <Link href="/marketing/campaigns/new">
              <Send className="h-4 w-4 mr-1.5" /> New Campaign
            </Link>
          </Button>
        }
      />

      <div className="space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {loadingCampaigns || loadingSegments ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)
          ) : (
            <>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-ds-foreground-muted mb-1">Active Campaigns</p>
                      <p className="text-2xl font-bold">{stats.activeCampaigns}</p>
                    </div>
                    <TrendingUp className="h-5 w-5 text-ds-success" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-ds-foreground-muted mb-1">Total Sent</p>
                      <p className="text-2xl font-bold">{formatLocaleNumber(stats.totalSent)}</p>
                    </div>
                    <Send className="h-5 w-5 text-ds-info" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-ds-foreground-muted mb-1">Avg Open Rate</p>
                      <p className="text-2xl font-bold">{stats.avgOpenRate}%</p>
                    </div>
                    <Eye className="h-5 w-5 text-ds-primary" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-ds-foreground-muted mb-1">Avg Click Rate</p>
                      <p className="text-2xl font-bold">{stats.avgClickRate}%</p>
                    </div>
                    <MousePointerClick className="h-5 w-5 text-ds-chart-3" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-ds-foreground-muted mb-1">Segments</p>
                      <p className="text-2xl font-bold">{stats.totalSegments}</p>
                    </div>
                    <Users className="h-5 w-5 text-ds-warning" />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-center"
                >
                  <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', link.bg)}>
                    <link.icon className={cn('h-5 w-5', link.color)} />
                  </div>
                  <span className="text-xs font-medium">{link.title}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Campaigns */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Campaigns</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/marketing/campaigns">
                  View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingCampaigns ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : recentCampaigns.length === 0 ? (
              <div className="p-8 text-center">
                <Megaphone className="h-8 w-8 mx-auto mb-2 text-ds-foreground-muted opacity-50" />
                <p className="text-sm text-ds-foreground-muted">No campaigns yet</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/marketing/campaigns/new">Create your first campaign</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {recentCampaigns.map((campaign) => (
                  <Link
                    key={campaign.id}
                    href={`/marketing/campaigns/${campaign.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Tag tone={statusTone(campaign.status ?? 'draft')} className="capitalize">
                        {campaign.status}
                      </Tag>
                      <span className="text-sm font-medium">{campaign.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-ds-foreground-muted">
                      <span>{formatLocaleNumber(campaign.sentCount ?? 0)} sent</span>
                      {(campaign.sentCount ?? 0) > 0 && (
                        <span>{Math.round(((campaign.openedCount ?? 0) / (campaign.sentCount ?? 1)) * 1000) / 10}% open</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Segments overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Audience Segments</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/marketing/segments">
                  View all <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingSegments ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : segments.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="h-8 w-8 mx-auto mb-2 text-ds-foreground-muted opacity-50" />
                <p className="text-sm text-ds-foreground-muted">No segments yet</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/marketing/segments/new">Create your first segment</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {segments.slice(0, 5).map((segment) => (
                  <Link
                    key={segment.id}
                    href={`/marketing/campaigns/new?segmentId=${segment.id}&segmentName=${encodeURIComponent(segment.name)}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm font-medium">{segment.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {formatLocaleNumber(segment.contactCount || 0)} contacts
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
