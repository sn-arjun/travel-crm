'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Heart,
  DollarSign,
  TrendingUp,
  Users,
  Globe,
  FileText,
  Activity,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { aiApi, type HealthScoreResult, type RevenuePulseData, type TrendingDestination } from '@/lib/api/ai';

const BI_SECTIONS = [
  {
    title: 'Daily Briefings',
    description: 'AI-generated daily business summaries and action items',
    icon: FileText,
    href: '/ai/bi/briefings',
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
  },
  {
    title: 'Health Score',
    description: 'Overall business health with category breakdowns',
    icon: Heart,
    href: '/ai/bi/health-score',
    color: 'text-red-600',
    bg: 'bg-red-50 dark:bg-red-950/30',
  },
  {
    title: 'Team Performance',
    description: 'Agent performance metrics and comparisons',
    icon: Users,
    href: '/ai/bi/team',
    color: 'text-purple-600',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
  },
  {
    title: 'Destination Analytics',
    description: 'Profitability, demand, and trending destinations',
    icon: Globe,
    href: '/ai/bi/destinations',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
  {
    title: 'AI Usage Stats',
    description: 'AI feature usage, API calls, and consumption metrics',
    icon: Activity,
    href: '/ai/bi/usage',
    color: 'text-orange-600',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
  },
];

export default function BIDashboardPage() {
  const { data: healthData, loading: healthLoading } = useApiQuery(
    () => aiApi.bi.getHealthScore(),
    [],
  );
  const { data: pulseData, loading: pulseLoading } = useApiQuery(
    () => aiApi.bi.getRevenuePulse(),
    [],
  );
  const { data: trendingData, loading: trendingLoading } = useApiQuery(
    () => aiApi.bi.getTrendingDestinations({ limit: 3 }),
    [],
  );

  const health: HealthScoreResult | null = (healthData as { data?: HealthScoreResult })?.data ?? null;
  const pulse: RevenuePulseData | null = (pulseData as { data?: RevenuePulseData })?.data ?? null;
  const trending: TrendingDestination[] = (trendingData as { data?: TrendingDestination[] })?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Business Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          AI-driven analytics, health scores, and trend analysis for your business
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Health Score */}
        <Card>
          <CardContent className="pt-6">
            {healthLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-16" />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Health Score</p>
                  <p className="text-3xl font-bold mt-1">{health?.overallScore ?? '--'}</p>
                  <p className="text-xs text-muted-foreground">/100</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
                  <Heart className="h-6 w-6 text-red-600" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Revenue Pulse */}
        <Card>
          <CardContent className="pt-6">
            {pulseLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-24" />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Monthly Revenue</p>
                  <p className="text-3xl font-bold mt-1">
                    ${pulse?.currentMonth?.toLocaleString() ?? '--'}
                  </p>
                  {pulse?.growth !== undefined && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'mt-1',
                        pulse.growth >= 0 ? 'text-emerald-600' : 'text-red-600',
                      )}
                    >
                      {pulse.growth >= 0 ? '+' : ''}
                      {pulse.growth.toFixed(1)}%
                    </Badge>
                  )}
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950/30">
                  <DollarSign className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Trending */}
        <Card>
          <CardContent className="pt-6">
            {trendingLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-28" />
              </div>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-2">Trending Destinations</p>
                {trending.length > 0 ? (
                  <div className="space-y-2">
                    {trending.map((dest, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="text-sm font-medium">{dest.name}</span>
                        <div className="flex items-center gap-1">
                          <TrendingUp
                            className={cn(
                              'h-3.5 w-3.5',
                              dest.trend === 'up' ? 'text-emerald-600' : 'text-red-600',
                            )}
                          />
                          <span className="text-xs text-muted-foreground">
                            {dest.bookings} bookings
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No data yet</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BI_SECTIONS.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="h-full transition-all hover:shadow-md hover:border-primary/30 cursor-pointer">
              <CardHeader className="pb-3">
                <div className={cn('inline-flex h-10 w-10 items-center justify-center rounded-lg', section.bg)}>
                  <section.icon className={cn('h-5 w-5', section.color)} />
                </div>
                <CardTitle className="text-lg mt-3">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm text-primary font-medium">View Details &rarr;</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
