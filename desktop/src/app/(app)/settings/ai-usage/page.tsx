'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Brain,
  Zap,
  DollarSign,
  BarChart3,
  MessageSquare,
  FileText,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Stat } from '@/components/ui/stat';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiQuery } from '@/hooks/use-api';
import { aiApi } from '@/lib/api/ai';
import { PageContainer } from '@/components/layout/page-container';

const taskIcons: Record<string, React.ReactNode> = {
  lead_extraction: <FileText className="size-4" />,
  itinerary_generation: <Sparkles className="size-4" />,
  message_compose: <MessageSquare className="size-4" />,
  reply_suggest: <MessageSquare className="size-4" />,
  nl_query: <Brain className="size-4" />,
  insights: <TrendingUp className="size-4" />,
  ocr: <FileText className="size-4" />,
  lead_scoring: <BarChart3 className="size-4" />,
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function AiUsagePageContent() {
  const router = useRouter();

  const { data: usageResponse, loading } = useApiQuery(() => aiApi.settings.getUsage(), []);

  const usage = React.useMemo(() => {
    if (!usageResponse || !('data' in usageResponse)) return null;
    return usageResponse.data ?? null;
  }, [usageResponse]);

  const totalRequests = React.useMemo(
    () => usage?.breakdown.reduce((sum, b) => sum + b.requestCount, 0) ?? 0,
    [usage],
  );
  const totalTokens = React.useMemo(
    () => usage?.breakdown.reduce((sum, b) => sum + b.totalInputTokens + b.totalOutputTokens, 0) ?? 0,
    [usage],
  );
  const totalCost = React.useMemo(
    () => usage?.breakdown.reduce((sum, b) => sum + b.totalCost, 0) ?? 0,
    [usage],
  );

  return (
    <div className="space-y-ds-6">
      <PageHeader
        title="AI Usage"
        description="Monitor your AI feature usage and estimated costs"
        back={
          <Button variant="ghost" size="icon" onClick={() => router.push('/settings/ai')} aria-label="Back to AI settings">
            <ArrowLeft className="size-5" />
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-ds-4 md:grid-cols-3">
        <Stat label="Total API Calls" value={formatNumber(totalRequests)} icon={<Zap className="size-5" />} loading={loading} />
        <Stat label="Tokens Used" value={formatNumber(totalTokens)} icon={<Brain className="size-5" />} loading={loading} />
        <Stat label="Estimated Cost" value={`$${totalCost.toFixed(2)}`} icon={<DollarSign className="size-5" />} loading={loading} />
      </div>

      <SectionCard title="Usage by Feature" description="Breakdown of AI usage across task types" flush>
        {loading ? (
          <div className="space-y-ds-2 p-ds-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !usage || usage.breakdown.length === 0 ? (
          <div className="py-ds-8 text-center">
            <Brain className="mx-auto mb-ds-4 size-12 text-ds-foreground-subtle" />
            <p className="text-sm text-ds-foreground-muted">No AI usage data available yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ds-border text-left text-ds-foreground-muted">
                  <th className="px-ds-4 py-ds-2 font-medium">Task</th>
                  <th className="px-ds-4 py-ds-2 font-medium">Model</th>
                  <th className="px-ds-4 py-ds-2 text-right font-medium">Requests</th>
                  <th className="px-ds-4 py-ds-2 text-right font-medium">Tokens</th>
                  <th className="px-ds-4 py-ds-2 text-right font-medium">Est. Cost</th>
                  <th className="px-ds-4 py-ds-2 text-right font-medium">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {[...usage.breakdown]
                  .sort((a, b) => b.requestCount - a.requestCount)
                  .map((row, i) => {
                    const pct = totalRequests > 0 ? ((row.requestCount / totalRequests) * 100).toFixed(1) : '0';
                    return (
                      <tr key={`${row.taskType}-${i}`} className="border-b border-ds-border/50 last:border-0">
                        <td className="px-ds-4 py-ds-2">
                          <div className="flex items-center gap-ds-2">
                            {taskIcons[row.taskType] ?? <Zap className="size-4" />}
                            <span className="font-medium capitalize text-ds-foreground">
                              {row.taskType.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </td>
                        <td className="px-ds-4 py-ds-2 text-xs text-ds-foreground-muted">{row.modelName}</td>
                        <td className="px-ds-4 py-ds-2 text-right font-mono text-ds-foreground">
                          {formatNumber(row.requestCount)}
                        </td>
                        <td className="px-ds-4 py-ds-2 text-right font-mono text-ds-foreground">
                          {formatNumber(row.totalInputTokens + row.totalOutputTokens)}
                        </td>
                        <td className="px-ds-4 py-ds-2 text-right font-mono text-ds-foreground">
                          ${row.totalCost.toFixed(2)}
                        </td>
                        <td className="px-ds-4 py-ds-2 text-right">
                          <div className="flex items-center justify-end gap-ds-2">
                            <div className="h-2 w-16 overflow-hidden rounded-ds-full bg-ds-surface-sunken">
                              <div className="h-full rounded-ds-full bg-ds-primary" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-10 text-right text-xs text-ds-foreground-muted">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Usage Quotas" description="Current usage against your plan limits">
        {loading ? (
          <Skeleton className="h-24 w-full" />
        ) : !usage || usage.quotas.length === 0 ? (
          <p className="text-sm text-ds-foreground-muted">No usage caps configured for your plan.</p>
        ) : (
          <div className="grid gap-ds-4 md:grid-cols-2">
            {usage.quotas.map((cap) => (
              <div key={cap.key} className="space-y-ds-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium capitalize text-ds-foreground">{cap.key.replace(/_/g, ' ')}</span>
                  <span className="text-ds-foreground-muted">
                    {cap.used} / {cap.limit}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-ds-full bg-ds-surface-sunken">
                  <div
                    className="h-full rounded-ds-full bg-ds-primary"
                    style={{ width: `${Math.min(cap.percentUsed, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-ds-foreground-muted">
                  {cap.remaining} remaining — resets {cap.resetPeriod}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {!loading && usage?.dailyTrend && usage.dailyTrend.length > 0 && (
        <SectionCard title="Daily Usage (Last 30 Days)">
          <div className="flex h-40 items-end gap-ds-1">
            {usage.dailyTrend.map((day, idx) => {
              const maxReq = Math.max(...usage.dailyTrend.map((d) => d.requests), 1);
              const height = (day.requests / maxReq) * 100;
              return (
                <div
                  key={idx}
                  className="flex flex-1 flex-col items-center gap-ds-1"
                  title={`${day.day}: ${day.requests} requests`}
                >
                  <div
                    className="min-h-0.5 w-full rounded-t bg-ds-primary/80"
                    style={{ height: `${height}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-ds-2 flex justify-between">
            <span className="text-xs text-ds-foreground-muted">{usage.dailyTrend[0]?.day ?? ''}</span>
            <span className="text-xs text-ds-foreground-muted">
              {usage.dailyTrend[usage.dailyTrend.length - 1]?.day ?? ''}
            </span>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

export default function AiUsagePage() {
  return (
    <PageContainer>
      <AiUsagePageContent />
    </PageContainer>
  );
}
