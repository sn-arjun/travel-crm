'use client';

import { PageContainer } from '@/components/layout/page-container';
import * as React from 'react';
import { Users, RefreshCw, Trophy, TrendingUp, DollarSign, Download } from 'lucide-react';
import {
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
  Stat,
  Tag,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { AiGate } from '@/components/domain/ai/ai-gate';
import { useApiQuery } from '@/hooks/use-api';
import { aiApi, type TeamPerformanceMetrics } from '@/lib/api/ai';
import { toLocalDateString } from '@/lib/dates';

function toCsv(rows: TeamPerformanceMetrics[]) {
  const header = ['Agent', 'Deals closed', 'Revenue', 'Conversion rate', 'Avg deal value'];
  const lines = rows.map((r) =>
    [r.userName, r.dealsClosedCount, r.revenue, `${r.conversionRate.toFixed(1)}%`, r.avgDealValue]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

function downloadCsv(rows: TeamPerformanceMetrics[]) {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `team-performance-${toLocalDateString(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function TeamPerformanceContent() {
  const [period, setPeriod] = React.useState('month');

  const { data, loading, refetch } = useApiQuery(() => aiApi.bi.getTeamPerformance({ period }), [period]);

  const team: TeamPerformanceMetrics[] = (data as { data?: TeamPerformanceMetrics[] })?.data ?? [];
  const totalRevenue = team.reduce((s, t) => s + t.revenue, 0);
  const totalDeals = team.reduce((s, t) => s + t.dealsClosedCount, 0);
  const avgConversion = team.length ? team.reduce((s, t) => s + t.conversionRate, 0) / team.length : 0;

  const columns: DataTableColumn<TeamPerformanceMetrics>[] = [
    {
      key: 'rank',
      header: 'Rank',
      cell: (_r, index) =>
        index === 0 ? (
          <Trophy className="size-4 text-ds-warning" aria-hidden="true" />
        ) : (
          <span className="text-ds-foreground-muted">{index + 1}</span>
        ),
    },
    { key: 'userName', header: 'Agent', sortable: true },
    { key: 'dealsClosedCount', header: 'Deals', align: 'right', sortable: true },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      sortable: true,
      cell: (r) => (
        <span className="font-semibold">{r.revenue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
      ),
    },
    {
      key: 'conversionRate',
      header: 'Conversion',
      align: 'right',
      sortable: true,
      cell: (r) => (
        <Tag tone={r.conversionRate >= 30 ? 'success' : r.conversionRate >= 15 ? 'warning' : 'danger'}>
          {r.conversionRate.toFixed(1)}%
        </Tag>
      ),
    },
    {
      key: 'avgDealValue',
      header: 'Avg deal',
      align: 'right',
      cell: (r) => r.avgDealValue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
    },
  ];

  return (
    <div className="flex flex-col gap-ds-6">
      <div className="flex items-center justify-end gap-ds-3">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">This week</SelectItem>
            <SelectItem value="month">This month</SelectItem>
            <SelectItem value="quarter">This quarter</SelectItem>
            <SelectItem value="year">This year</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-ds-2" onClick={() => refetch()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-ds-2"
          disabled={team.length === 0}
          onClick={() => downloadCsv(team)}
        >
          <Download className="size-4" aria-hidden="true" />
          Export
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-3">
        <Stat
          label="Total revenue"
          value={totalRevenue.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
          icon={<DollarSign className="size-4" aria-hidden="true" />}
          loading={loading}
        />
        <Stat
          label="Total deals closed"
          value={totalDeals}
          icon={<Trophy className="size-4" aria-hidden="true" />}
          loading={loading}
        />
        <Stat
          label="Avg conversion rate"
          value={`${avgConversion.toFixed(1)}%`}
          icon={<TrendingUp className="size-4" aria-hidden="true" />}
          loading={loading}
        />
      </div>

      <SectionCard title="Team members" description="Individual performance breakdown" flush>
        <DataTable<TeamPerformanceMetrics>
          columns={columns}
          data={[...team].sort((a, b) => b.revenue - a.revenue)}
          getRowId={(r) => r.userId}
          loading={loading}
          emptyState={
            <EmptyState icon={<Users className="size-8" aria-hidden="true" />} title="No team performance data available" />
          }
        />
      </SectionCard>
    </div>
  );
}

export default function TeamPerformancePage() {
  return (
    <PageContainer>
      <PageHeader
        title="Team Performance"
        description="Agent performance metrics and comparisons"
        breadcrumbs={[
          { label: 'AI Hub', href: '/ai' },
          { label: 'Business Intelligence', href: '/ai/bi' },
          { label: 'Team Performance' },
        ]}
      />
      <AiGate>
        <TeamPerformanceContent />
      </AiGate>
    </PageContainer>
  );
}
