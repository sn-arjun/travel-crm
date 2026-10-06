'use client';

import { PageContainer } from '@/components/layout/page-container';
import * as React from 'react';
import Link from 'next/link';
import {
  Heart,
  DollarSign,
  TrendingUp,
  Users,
  Globe,
  FileText,
  Activity,
  Layers,
} from 'lucide-react';
import { AreaChart, DataTable, EmptyState, PageHeader, SectionCard, Stat, Tag } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { AiGate } from '@/components/domain/ai/ai-gate';
import {
  aiApi,
  type CashFlowForecast,
  type HealthScoreResult,
  type LeadSourceRoi,
  type LostDealAnalysis,
  type RevenuePulseData,
  type TrendingDestination,
} from '@/lib/api/ai';

const BI_SECTIONS = [
  {
    title: 'Daily Briefings',
    description: 'AI-generated business summaries and action items',
    icon: FileText,
    href: '/ai/bi/briefings',
  },
  {
    title: 'Health Score',
    description: 'Overall business health with category breakdowns',
    icon: Heart,
    href: '/ai/bi/health-score',
  },
  {
    title: 'Team Performance',
    description: 'Agent performance metrics and comparisons',
    icon: Users,
    href: '/ai/bi/team',
  },
  {
    title: 'Destination Analytics',
    description: 'Profitability, demand, and trending destinations',
    icon: Globe,
    href: '/ai/bi/destinations',
  },
  {
    title: 'Customer Segments',
    description: 'AI-clustered customer segments with lifetime value',
    icon: Layers,
    href: '/ai/bi/segments',
  },
  {
    title: 'AI Usage Stats',
    description: 'AI feature usage, API calls, and consumption metrics',
    icon: Activity,
    href: '/ai/bi/usage',
  },
];

function BiDashboardContent() {
  const { data: healthData, loading: healthLoading } = useApiQuery(() => aiApi.bi.getHealthScore(), []);
  const { data: pulseData, loading: pulseLoading } = useApiQuery(() => aiApi.bi.getRevenuePulse(), []);
  const { data: trendingData, loading: trendingLoading } = useApiQuery(
    () => aiApi.bi.getTrendingDestinations({ limit: 3 }),
    [],
  );
  const { data: cashFlowData, loading: cashFlowLoading } = useApiQuery(() => aiApi.bi.getCashFlowForecast(), []);
  const { data: roiData, loading: roiLoading } = useApiQuery(() => aiApi.bi.getLeadSourceRoi(), []);
  const { data: lostDealData, loading: lostDealLoading } = useApiQuery(
    () => aiApi.bi.getLostDealAnalysis({ limit: 5 }),
    [],
  );

  const health: HealthScoreResult | null = (healthData as { data?: HealthScoreResult })?.data ?? null;
  const pulse: RevenuePulseData | null = (pulseData as { data?: RevenuePulseData })?.data ?? null;
  const trending: TrendingDestination[] = (trendingData as { data?: TrendingDestination[] })?.data ?? [];
  const cashFlow: CashFlowForecast[] = (cashFlowData as { data?: CashFlowForecast[] })?.data ?? [];
  const leadSourceRoi: LeadSourceRoi[] = (roiData as { data?: LeadSourceRoi[] })?.data ?? [];
  const lostDeals: LostDealAnalysis[] = (lostDealData as { data?: LostDealAnalysis[] })?.data ?? [];

  const roiColumns: DataTableColumn<LeadSourceRoi>[] = [
    { key: 'source', header: 'Source', sortable: true },
    { key: 'leadsGenerated', header: 'Leads', align: 'right' },
    { key: 'dealsClosedCount', header: 'Deals', align: 'right' },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      cell: (r) => r.revenue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
    },
    {
      key: 'roi',
      header: 'ROI',
      align: 'right',
      sortable: true,
      cell: (r) => (
        <Tag tone={r.roi >= 0 ? 'success' : 'danger'}>{r.roi >= 0 ? '+' : ''}{r.roi.toFixed(1)}%</Tag>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-ds-6">
      <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-3">
        <Stat
          label="Health Score"
          value={health ? `${health.overallScore}/100` : '--'}
          icon={<Heart className="size-4" aria-hidden="true" />}
          loading={healthLoading}
        />
        <Stat
          label="Monthly Revenue"
          value={
            pulse
              ? pulse.currentMonthRevenue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })
              : '--'
          }
          delta={pulse?.momChange}
          icon={<DollarSign className="size-4" aria-hidden="true" />}
          loading={pulseLoading}
        />
        <SectionCard title="Trending destinations">
          {trendingLoading ? (
            <p className="text-xs text-ds-foreground-muted">Loading…</p>
          ) : trending.length === 0 ? (
            <p className="text-xs text-ds-foreground-muted">No data yet</p>
          ) : (
            <div className="flex flex-col gap-ds-2">
              {trending.map((dest) => (
                <div key={dest.name} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ds-foreground">{dest.name}</span>
                  <Tag tone={dest.trend === 'up' ? 'success' : 'danger'}>
                    <TrendingUp className="size-3" aria-hidden="true" />
                    {dest.bookings} bookings
                  </Tag>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-2 lg:grid-cols-3">
        {BI_SECTIONS.map((section) => (
          <Link key={section.href} href={section.href}>
            <SectionCard className="h-full transition-shadow hover:shadow-ds-2">
              <div className="flex items-start gap-ds-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-ds-lg bg-ds-primary-subtle">
                  <section.icon className="size-5 text-ds-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ds-foreground">{section.title}</p>
                  <p className="mt-ds-1 text-xs text-ds-foreground-muted">{section.description}</p>
                </div>
              </div>
              <p className="mt-ds-3 text-xs font-medium text-ds-primary">View details &rarr;</p>
            </SectionCard>
          </Link>
        ))}
      </div>

      <SectionCard title="Cash-flow forecast" description="Projected inflow, outflow, and balance">
        <AreaChart
          data={cashFlow}
          loading={cashFlowLoading}
          categoryKey="period"
          series={[
            { dataKey: 'inflow', label: 'Inflow' },
            { dataKey: 'outflow', label: 'Outflow' },
            { dataKey: 'balance', label: 'Balance' },
          ]}
          emptyMessage="No cash-flow forecast available yet"
        />
      </SectionCard>

      <div className="grid grid-cols-1 gap-ds-4 lg:grid-cols-2">
        <SectionCard title="Lead source ROI" flush>
          <DataTable<LeadSourceRoi>
            columns={roiColumns}
            data={leadSourceRoi}
            getRowId={(r) => r.source}
            loading={roiLoading}
            emptyState={<EmptyState title="No lead source ROI data available" />}
          />
        </SectionCard>

        <SectionCard title="Lost deal analysis">
          {lostDealLoading ? (
            <p className="text-xs text-ds-foreground-muted">Loading…</p>
          ) : lostDeals.length === 0 ? (
            <EmptyState title="No lost deal analysis available" />
          ) : (
            <div className="flex flex-col gap-ds-3">
              {lostDeals.map((deal) => (
                <div key={deal.dealId} className="rounded-ds-md border border-ds-border p-ds-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ds-foreground">{deal.reason}</p>
                    <span className="text-sm font-semibold text-ds-danger">
                      -{deal.estimatedLoss.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                    </span>
                  </div>
                  <p className="mt-ds-1 text-xs text-ds-foreground-muted">{deal.preventionStrategy}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

export default function BIDashboardPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Business Intelligence"
        description="AI-driven analytics, health scores, and trend analysis for your business"
        breadcrumbs={[{ label: 'AI Hub', href: '/ai' }, { label: 'Business Intelligence' }]}
      />
      <AiGate>
        <BiDashboardContent />
      </AiGate>
    </PageContainer>
  );
}
