'use client';

import { PageContainer } from '@/components/layout/page-container';
import * as React from 'react';
import { Heart, RefreshCw, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  EmptyState,
  LineChart,
  PageHeader,
  Progress,
  SectionCard,
  Skeleton,
} from '@/components/ui';
import { AiGate } from '@/components/domain/ai/ai-gate';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { aiApi, type HealthScoreResult, type HealthScoreHistoryEntry } from '@/lib/api/ai';

function getScoreColor(score: number) {
  if (score >= 80) return 'text-ds-success';
  if (score >= 60) return 'text-ds-info';
  if (score >= 40) return 'text-ds-warning';
  return 'text-ds-danger';
}

function getScoreLabel(score: number) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Needs attention';
}

function formatCategoryLabel(category: string) {
  return category.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

function HealthScoreContent() {
  const { data, loading, refetch } = useApiQuery(() => aiApi.bi.getHealthScore(), []);
  const { data: historyData, loading: historyLoading } = useApiQuery(
    () => aiApi.bi.getHealthScoreHistory({ limit: 12 }),
    [],
  );
  const { mutate: recalculate, loading: recalculating } = useApiMutation(() => aiApi.bi.calculateHealthScore());

  const health: HealthScoreResult | null = (data as { data?: HealthScoreResult })?.data ?? null;
  const history: HealthScoreHistoryEntry[] = (historyData as { data?: HealthScoreHistoryEntry[] })?.data ?? [];

  const handleRecalculate = async () => {
    const result = await recalculate(undefined);
    if (result) {
      toast.success('Health score recalculated');
      refetch();
    } else {
      toast.error('Could not recalculate health score');
    }
  };

  return (
    <div className="flex flex-col gap-ds-6">
      <div className="flex justify-end gap-ds-3">
        <Button variant="outline" size="sm" className="gap-ds-2" onClick={() => refetch()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Refresh
        </Button>
        <Button size="sm" className="gap-ds-2" onClick={handleRecalculate} disabled={recalculating}>
          <RotateCw className="size-4" aria-hidden="true" />
          {recalculating ? 'Recalculating…' : 'Recalculate'}
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-ds-6 lg:grid-cols-3">
          <SectionCard>
            <Skeleton className="mx-auto h-36 w-36 rounded-full" />
            <Skeleton className="mx-auto mt-ds-4 h-6 w-24" />
          </SectionCard>
          <SectionCard className="lg:col-span-2">
            <div className="flex flex-col gap-ds-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </SectionCard>
        </div>
      ) : !health ? (
        <SectionCard>
          <EmptyState
            icon={<Heart className="size-8" aria-hidden="true" />}
            title="Health score not available"
            description="Not enough data to calculate a score yet."
            action={
              <Button size="sm" onClick={handleRecalculate} disabled={recalculating}>
                {recalculating ? 'Calculating…' : 'Calculate now'}
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <div className="flex flex-col gap-ds-6">
          <div className="grid grid-cols-1 gap-ds-6 lg:grid-cols-3">
            <SectionCard title="Overall health">
              <div className="flex flex-col items-center gap-ds-4">
                <div
                  className={cn(
                    'flex h-36 w-36 items-center justify-center rounded-full border-4 border-ds-border',
                  )}
                >
                  <div className="text-center">
                    <p className={cn('text-4xl font-bold', getScoreColor(health.overallScore))}>
                      {health.overallScore}
                    </p>
                    <p className="text-xs text-ds-foreground-muted">/100</p>
                  </div>
                </div>
                <Badge className={cn('px-ds-3 py-ds-1 text-sm', getScoreColor(health.overallScore))} variant="outline">
                  {getScoreLabel(health.overallScore)}
                </Badge>
              </div>
            </SectionCard>

            <SectionCard title="Category breakdown" description="Score distribution across business categories" className="lg:col-span-2">
              <div className="flex flex-col gap-ds-5">
                {Object.entries(health.byCategory).map(([category, score]) => (
                  <div key={category} className="flex flex-col gap-ds-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-ds-foreground">{formatCategoryLabel(category)}</span>
                      <span className={cn('font-bold', getScoreColor(score))}>{score}/100</span>
                    </div>
                    <Progress value={score} className="h-2.5" />
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          {health.recommendations.length > 0 && (
            <SectionCard title="Recommendations" description="Steps to improve your business health score">
              <div className="flex flex-col gap-ds-3">
                {health.recommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-start gap-ds-3 rounded-ds-md border border-ds-border p-ds-4">
                    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ds-primary text-xs font-bold text-ds-primary-foreground">
                      {idx + 1}
                    </div>
                    <p className="text-sm text-ds-foreground">{rec}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <SectionCard title="Score trend" description="Historical health score over time">
            <LineChart
              data={history}
              loading={historyLoading}
              categoryKey="date"
              series={[{ dataKey: 'overallScore', label: 'Overall score' }]}
              emptyMessage="No trend data available yet"
            />
          </SectionCard>
        </div>
      )}
    </div>
  );
}

export default function HealthScorePage() {
  return (
    <PageContainer>
      <PageHeader
        title="Business Health Score"
        description="Overall business health with category breakdowns and trends"
        breadcrumbs={[
          { label: 'AI Hub', href: '/ai' },
          { label: 'Business Intelligence', href: '/ai/bi' },
          { label: 'Health Score' },
        ]}
      />
      <AiGate>
        <HealthScoreContent />
      </AiGate>
    </PageContainer>
  );
}
