'use client';

import { PageContainer } from '@/components/layout/page-container';
import * as React from 'react';
import { Globe, RefreshCw, TrendingUp, TrendingDown, Download } from 'lucide-react';
import {
  BarChart,
  Button,
  DataTable,
  EmptyState,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SectionCard,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { AiGate } from '@/components/domain/ai/ai-gate';
import { useApiQuery } from '@/hooks/use-api';
import {
  aiApi,
  type ProfitabilityAnalysis,
  type SeasonalDemandData,
  type TrendingDestination,
} from '@/lib/api/ai';
import { toLocalDateString } from '@/lib/dates';

function toCsv(rows: ProfitabilityAnalysis[]) {
  const header = ['Destination', 'Revenue', 'Costs', 'Profit', 'Margin', 'Trend'];
  const lines = rows.map((r) =>
    [r.destination, r.revenue, r.costs, r.profit, `${r.margin.toFixed(1)}%`, r.trend]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

function downloadCsv(rows: ProfitabilityAnalysis[]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `destination-profitability-${toLocalDateString(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function DestinationsContent() {
  const [profitPeriod, setProfitPeriod] = React.useState('month');

  const { data: profitData, loading: profitLoading, refetch: refetchProfit } = useApiQuery(
    () => aiApi.bi.getDestinationProfitability({ period: profitPeriod }),
    [profitPeriod],
  );
  const { data: trendingData, loading: trendingLoading } = useApiQuery(() => aiApi.bi.getTrendingDestinations(), []);
  const { data: demandData, loading: demandLoading } = useApiQuery(() => aiApi.bi.getSeasonalDemand(), []);

  const profitability: ProfitabilityAnalysis[] = (profitData as { data?: ProfitabilityAnalysis[] })?.data ?? [];
  const trending: TrendingDestination[] = (trendingData as { data?: TrendingDestination[] })?.data ?? [];
  const demand: SeasonalDemandData[] = (demandData as { data?: SeasonalDemandData[] })?.data ?? [];

  const columns: DataTableColumn<ProfitabilityAnalysis>[] = [
    { key: 'destination', header: 'Destination', sortable: true },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      sortable: true,
      cell: (r) => r.revenue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
    },
    {
      key: 'costs',
      header: 'Costs',
      align: 'right',
      cell: (r) => r.costs.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
    },
    {
      key: 'profit',
      header: 'Profit',
      align: 'right',
      sortable: true,
      cell: (r) => (
        <span className="font-semibold text-ds-success">
          {r.profit.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
        </span>
      ),
    },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right',
      sortable: true,
      cell: (r) => (
        <Tag tone={r.margin >= 30 ? 'success' : r.margin >= 15 ? 'warning' : 'danger'}>
          {r.margin.toFixed(1)}%
        </Tag>
      ),
    },
    {
      key: 'trend',
      header: 'Trend',
      align: 'center',
      cell: (r) =>
        r.trend === 'up' ? (
          <TrendingUp className="mx-auto size-4 text-ds-success" aria-hidden="true" />
        ) : r.trend === 'down' ? (
          <TrendingDown className="mx-auto size-4 text-ds-danger" aria-hidden="true" />
        ) : (
          <span className="text-xs text-ds-foreground-muted">--</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-ds-2" onClick={() => refetchProfit()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="profitability">
        <TabsList>
          <TabsTrigger value="profitability">Profitability</TabsTrigger>
          <TabsTrigger value="trending">Trending</TabsTrigger>
          <TabsTrigger value="seasonal">Seasonal demand</TabsTrigger>
        </TabsList>

        <TabsContent value="profitability" className="mt-ds-4 flex flex-col gap-ds-4">
          <div className="flex items-center justify-between">
            <Select value={profitPeriod} onValueChange={setProfitPeriod}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="quarter">This quarter</SelectItem>
                <SelectItem value="year">This year</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="gap-ds-2"
              disabled={profitability.length === 0}
              onClick={() => downloadCsv(profitability)}
            >
              <Download className="size-4" aria-hidden="true" />
              Export
            </Button>
          </div>

          <SectionCard flush>
            <DataTable<ProfitabilityAnalysis>
              columns={columns}
              data={[...profitability].sort((a, b) => b.profit - a.profit)}
              getRowId={(r) => r.destination}
              loading={profitLoading}
              emptyState={
                <EmptyState
                  icon={<Globe className="size-8" aria-hidden="true" />}
                  title="No profitability data available"
                />
              }
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="trending" className="mt-ds-4">
          {trendingLoading ? (
            <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <SectionCard key={i}>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="mt-ds-2 h-4 w-full" />
                </SectionCard>
              ))}
            </div>
          ) : trending.length === 0 ? (
            <SectionCard>
              <EmptyState icon={<TrendingUp className="size-8" aria-hidden="true" />} title="No trending data available" />
            </SectionCard>
          ) : (
            <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-2">
              {trending.map((dest) => (
                <SectionCard key={dest.name}>
                  <div className="mb-ds-3 flex items-center justify-between">
                    <div className="flex items-center gap-ds-2">
                      <Globe className="size-5 text-ds-foreground-muted" aria-hidden="true" />
                      <p className="font-semibold text-ds-foreground">{dest.name}</p>
                    </div>
                    <Tag tone={dest.trend === 'up' ? 'success' : 'danger'}>
                      {dest.trend === 'up' ? (
                        <TrendingUp className="size-3" aria-hidden="true" />
                      ) : (
                        <TrendingDown className="size-3" aria-hidden="true" />
                      )}
                      {dest.trend === 'up' ? 'Trending up' : 'Trending down'}
                    </Tag>
                  </div>
                  <div className="grid grid-cols-3 gap-ds-3">
                    <div className="rounded-ds-md bg-ds-surface-sunken p-ds-2 text-center">
                      <p className="text-xs text-ds-foreground-muted">Bookings</p>
                      <p className="font-bold text-ds-foreground">{dest.bookings}</p>
                    </div>
                    <div className="rounded-ds-md bg-ds-surface-sunken p-ds-2 text-center">
                      <p className="text-xs text-ds-foreground-muted">Revenue</p>
                      <p className="font-bold text-ds-foreground">₹{dest.revenue.toLocaleString()}</p>
                    </div>
                    <div className="rounded-ds-md bg-ds-surface-sunken p-ds-2 text-center">
                      <p className="text-xs text-ds-foreground-muted">Avg deal</p>
                      <p className="font-bold text-ds-foreground">₹{dest.avgDealValue.toLocaleString()}</p>
                    </div>
                  </div>
                </SectionCard>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="seasonal" className="mt-ds-4">
          <SectionCard title="Monthly demand pattern">
            <BarChart
              data={demand}
              loading={demandLoading}
              categoryKey="month"
              series={[{ dataKey: 'demand', label: 'Inquiries' }]}
              emptyMessage="No seasonal demand data available"
            />
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function DestinationsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Destination Analytics"
        description="Profitability, demand patterns, and trending destinations"
        breadcrumbs={[
          { label: 'AI Hub', href: '/ai' },
          { label: 'Business Intelligence', href: '/ai/bi' },
          { label: 'Destinations' },
        ]}
      />
      <AiGate>
        <DestinationsContent />
      </AiGate>
    </PageContainer>
  );
}
