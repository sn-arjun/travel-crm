'use client';

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
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { campaignsApi } from '@/lib/api/campaigns';
import { marketingApi } from '@/lib/api/marketing';

function statusColor(status: string) {
  switch (status) {
    case 'running':
    case 'sending':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'scheduled':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'completed':
    case 'sent':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
  }
}

export default function MarketingDashboardPage() {
  const { data: campaignsResp, loading: loadingCampaigns } = useApiQuery(
    () => campaignsApi.list({ limit: 5, sortBy: 'created_at', sortOrder: 'desc' }),
    [],
  );
  const { data: segmentsResp, loading: loadingSegments } = useApiQuery(
    () => marketingApi.segments.list({ limit: 100 }),
    [],
  );

  const recentCampaigns: any[] = React.useMemo(() => {
    const d = (campaignsResp as any)?.data;
    return Array.isArray(d) ? d : (d?.data ?? []);
  }, [campaignsResp]);

  const segments: any[] = React.useMemo(() => {
    const d = (segmentsResp as any)?.data;
    return Array.isArray(d) ? d : (d?.data ?? []);
  }, [segmentsResp]);

  // Aggregate stats from recent campaigns
  const stats = React.useMemo(() => {
    const totalSent = recentCampaigns.reduce((s, c) => s + (c.sentCount ?? c.sent ?? 0), 0);
    const totalOpened = recentCampaigns.reduce((s, c) => s + (c.openedCount ?? c.opened ?? 0), 0);
    const totalClicked = recentCampaigns.reduce((s, c) => s + (c.clickedCount ?? c.clicked ?? 0), 0);
    const activeCampaigns = recentCampaigns.filter((c) => c.status === 'running' || c.status === 'sending').length;
    const avgOpenRate = totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : '0';
    const avgClickRate = totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(1) : '0';
    return { totalSent, activeCampaigns, avgOpenRate, avgClickRate, totalSegments: segments.length };
  }, [recentCampaigns, segments]);

  const quickLinks = [
    { title: 'New Campaign', href: '/campaigns/new', icon: Megaphone, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
    { title: 'New Segment', href: '/marketing/segments/new', icon: Users, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/30' },
    { title: 'Design Flyer', href: '/marketing/flyers', icon: Image, color: 'text-pink-600', bg: 'bg-pink-50 dark:bg-pink-900/30' },
    { title: 'Branding', href: '/marketing/branding', icon: Palette, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/30' },
    { title: 'Festival Offers', href: '/marketing/festivals', icon: CalendarClock, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { title: 'Opted-Out', href: '/marketing/opted-out', icon: Ban, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/30' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
            Marketing
          </h1>
          <p className="text-sm text-muted-foreground">Campaigns, segments, flyers & branding</p>
        </div>
        <Button asChild>
          <Link href="/campaigns/new">
            <Send className="h-4 w-4 mr-1.5" /> New Campaign
          </Link>
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
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
                      <p className="text-xs text-muted-foreground mb-1">Active Campaigns</p>
                      <p className="text-2xl font-bold">{stats.activeCampaigns}</p>
                    </div>
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Total Sent</p>
                      <p className="text-2xl font-bold">{stats.totalSent.toLocaleString('en-IN')}</p>
                    </div>
                    <Send className="h-5 w-5 text-blue-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Avg Open Rate</p>
                      <p className="text-2xl font-bold">{stats.avgOpenRate}%</p>
                    </div>
                    <Eye className="h-5 w-5 text-purple-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Avg Click Rate</p>
                      <p className="text-2xl font-bold">{stats.avgClickRate}%</p>
                    </div>
                    <MousePointerClick className="h-5 w-5 text-indigo-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Segments</p>
                      <p className="text-2xl font-bold">{stats.totalSegments}</p>
                    </div>
                    <Users className="h-5 w-5 text-amber-500" />
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
                <Link href="/campaigns">
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
                <Megaphone className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">No campaigns yet</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/campaigns/new">Create your first campaign</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {recentCampaigns.map((campaign: any) => (
                  <Link
                    key={campaign.id}
                    href={`/campaigns/${campaign.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={cn('border-transparent text-xs capitalize', statusColor(campaign.status ?? 'draft'))}
                      >
                        {campaign.status}
                      </Badge>
                      <span className="text-sm font-medium">{campaign.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{(campaign.sentCount ?? campaign.sent ?? 0).toLocaleString()} sent</span>
                      {campaign.openRate != null && <span>{campaign.openRate}% open</span>}
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
                <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">No segments yet</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/marketing/segments/new">Create your first segment</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {segments.slice(0, 5).map((segment: any) => (
                  <Link
                    key={segment.id}
                    href={`/campaigns/new?segmentId=${segment.id}&segmentName=${encodeURIComponent(segment.name)}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm font-medium">{segment.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {(segment.contactCount || 0).toLocaleString()} contacts
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
