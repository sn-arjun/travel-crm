'use client';


import { formatExactCurrency } from '@/lib/format';
import { PageContainer } from '@/components/layout/page-container';
import * as React from 'react';
import { Activity, Brain, BarChart3, RefreshCw } from 'lucide-react';
import {
  Button,
  DataTable,
  EmptyState,
  LineChart,
  PageHeader,
  Progress,
  SectionCard,
  Stat,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { AiGate } from '@/components/domain/ai/ai-gate';
import { useApiQuery } from '@/hooks/use-api';
import { aiApi, type UsageBreakdown, type UsageData } from '@/lib/api/ai';

function UsageContent() {
  const { data, loading, refetch } = useApiQuery(() => aiApi.bi.getUsage(), []);
  const usage: UsageData | null = (data as { data?: UsageData })?.data ?? null;

  const breakdown = usage?.breakdown ?? [];
  const dailyTrend = usage?.dailyTrend ?? [];
  const totalRequests = breakdown.reduce((s, b) => s + b.requestCount, 0);
  const totalCost = breakdown.reduce((s, b) => s + b.totalCost, 0);
  const totalTokens = breakdown.reduce((s, b) => s + b.totalInputTokens + b.totalOutputTokens, 0);
  const maxRequests = Math.max(...breakdown.map((b) => b.requestCount), 1);

  const columns: DataTableColumn<UsageBreakdown>[] = [
    { key: 'taskType', header: 'Feature', sortable: true },
    { key: 'modelName', header: 'Model' },
    { key: 'requestCount', header: 'Calls', align: 'right', sortable: true },
    {
      key: 'tokens',
      header: 'Tokens',
      align: 'right',
      cell: (r) => (r.totalInputTokens + r.totalOutputTokens).toLocaleString(),
    },
    {
      key: 'totalCost',
      header: 'Cost',
      align: 'right',
      sortable: true,
      cell: (r) => formatExactCurrency(r.totalCost),
    },
    {
      key: 'bar',
      header: 'Share',
      cell: (r) => <Progress value={(r.requestCount / maxRequests) * 100} className="h-2 w-32" />,
    },
  ];

  return (
    <div className="flex flex-col gap-ds-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-ds-2" onClick={() => refetch()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {usage?.quotas && usage.quotas.length > 0 && (
        <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-3">
          {usage.quotas.map((q) => (
            <Stat
              key={q.key}
              label={q.key.replace(/[_-]/g, ' ')}
              value={`${q.used} / ${q.limit}`}
              hint={`resets ${q.resetPeriod}`}
              loading={loading}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-3">
        <Stat label="Total API calls" value={totalRequests.toLocaleString()} icon={<Activity className="size-4" aria-hidden="true" />} loading={loading} />
        <Stat label="Tokens used" value={totalTokens.toLocaleString()} icon={<Brain className="size-4" aria-hidden="true" />} loading={loading} />
        <Stat
          label="Total cost"
          value={formatExactCurrency(totalCost)}
          icon={<BarChart3 className="size-4" aria-hidden="true" />}
          loading={loading}
        />
      </div>

      <SectionCard title="Daily usage trend">
        <LineChart
          data={dailyTrend}
          loading={loading}
          categoryKey="day"
          series={[
            { dataKey: 'requests', label: 'Requests' },
            { dataKey: 'cost', label: 'Cost' },
          ]}
          emptyMessage="No usage trend data yet"
        />
      </SectionCard>

      <SectionCard title="Usage by feature" description="Breakdown of AI API calls, tokens, and cost per feature" flush>
        <DataTable<UsageBreakdown>
          columns={columns}
          data={[...breakdown].sort((a, b) => b.requestCount - a.requestCount)}
          getRowId={(r) => `${r.taskType}-${r.modelName}`}
          loading={loading}
          emptyState={
            <EmptyState
              icon={<Activity className="size-8" aria-hidden="true" />}
              title="No usage data yet"
              description="Start using AI features to see usage statistics here."
            />
          }
        />
      </SectionCard>
    </div>
  );
}

export default function UsagePage() {
  return (
    <PageContainer>
      <PageHeader
        title="AI Usage Statistics"
        description="Track AI feature usage, API calls, and token consumption"
        breadcrumbs={[
          { label: 'AI Hub', href: '/ai' },
          { label: 'Business Intelligence', href: '/ai/bi' },
          { label: 'Usage' },
        ]}
      />
      <AiGate>
        <UsageContent />
      </AiGate>
    </PageContainer>
  );
}
