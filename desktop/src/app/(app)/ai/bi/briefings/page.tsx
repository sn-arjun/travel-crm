'use client';

import { PageContainer } from '@/components/layout/page-container';
import * as React from 'react';
import { FileText, RefreshCw, Lightbulb, BarChart3, Star, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Badge, EmptyState, PageHeader, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Separator, Skeleton, Tag } from '@/components/ui';
import { AiGate } from '@/components/domain/ai/ai-gate';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { aiApi, type BriefingData } from '@/lib/api/ai';

const priorityTone: Record<string, 'danger' | 'warning' | 'info'> = {
  high: 'danger',
  medium: 'warning',
  low: 'info',
};

function BriefingsContent() {
  const [briefingType, setBriefingType] = React.useState('daily');

  const { data, loading, refetch } = useApiQuery(
    () => aiApi.bi.getBriefing({ type: briefingType }),
    [briefingType],
  );
  const { mutate: generate, loading: generating } = useApiMutation(
    () => aiApi.bi.generateBriefing({ type: briefingType }),
  );

  const briefing: BriefingData | null = (data as { data?: BriefingData })?.data ?? null;

  const handleGenerate = async () => {
    const result = await generate(undefined);
    if (result) {
      toast.success("Briefing generated");
      refetch();
    } else {
      toast.error('Could not generate briefing');
    }
  };

  return (
    <div className="flex flex-col gap-ds-6">
      <div className="flex items-center justify-end gap-ds-3">
        <Select value={briefingType} onValueChange={setBriefingType}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-ds-2" onClick={() => refetch()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Refresh
        </Button>
        <Button size="sm" className="gap-ds-2" onClick={handleGenerate} disabled={generating}>
          <Sparkles className="size-4" aria-hidden="true" />
          {generating ? 'Generating…' : "Generate today's briefing"}
        </Button>
      </div>

      {loading ? (
        <SectionCard>
          <div className="flex flex-col gap-ds-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <div className="grid grid-cols-3 gap-ds-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          </div>
        </SectionCard>
      ) : !briefing ? (
        <SectionCard>
          <EmptyState
            icon={<FileText className="size-8" aria-hidden="true" />}
            title="No briefing available"
            description="Briefings are generated as data accumulates, or generate one now."
            action={
              <Button size="sm" onClick={handleGenerate} disabled={generating}>
                {generating ? 'Generating…' : "Generate today's briefing"}
              </Button>
            }
          />
        </SectionCard>
      ) : (
        <div className="flex flex-col gap-ds-6">
          <SectionCard
            title={`${briefingType.charAt(0).toUpperCase() + briefingType.slice(1)} briefing`}
            description={new Date(briefing.date).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
            actions={<Badge variant="outline">{briefingType}</Badge>}
          >
            <p className="text-sm leading-relaxed text-ds-foreground">{briefing.summary}</p>

            {Object.keys(briefing.keyMetrics).length > 0 && (
              <>
                <Separator className="my-ds-4" />
                <div>
                  <p className="mb-ds-3 flex items-center gap-ds-2 text-sm font-medium text-ds-foreground">
                    <BarChart3 className="size-4" aria-hidden="true" />
                    Key metrics
                  </p>
                  <div className="grid grid-cols-2 gap-ds-3 md:grid-cols-4">
                    {Object.entries(briefing.keyMetrics).map(([key, value]) => (
                      <div key={key} className="rounded-ds-md border border-ds-border bg-ds-surface-sunken p-ds-3 text-center">
                        <p className="text-xs capitalize text-ds-foreground-muted">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </p>
                        <p className="mt-ds-1 text-lg font-bold text-ds-foreground">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </SectionCard>

          {briefing.insights.length > 0 && (
            <SectionCard
              title={`Insights (${briefing.insights.length})`}
              actions={<Lightbulb className="size-5 text-ds-warning" aria-hidden="true" />}
            >
              <div className="grid grid-cols-1 gap-ds-3 md:grid-cols-2">
                {briefing.insights.map((insight, idx) => (
                  <div key={idx} className="rounded-ds-md border border-ds-border p-ds-4">
                    <p className="text-sm font-medium text-ds-foreground">{insight.title}</p>
                    <p className="mt-ds-1 text-xs text-ds-foreground-muted">{insight.description}</p>
                    <div className="mt-ds-2 flex items-center justify-between">
                      <span className="text-xs text-ds-foreground-muted">{insight.metric}</span>
                      <span className="text-sm font-semibold text-ds-foreground">{insight.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {briefing.recommendations.length > 0 && (
            <SectionCard
              title={`Recommendations (${briefing.recommendations.length})`}
              actions={<Star className="size-5 text-ds-primary" aria-hidden="true" />}
            >
              <div className="flex flex-col gap-ds-3">
                {briefing.recommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-start gap-ds-4 rounded-ds-md border border-ds-border p-ds-4">
                    <div className="flex-1">
                      <div className="mb-ds-1 flex items-center gap-ds-2">
                        <Badge variant="outline" className="text-xs">{rec.category}</Badge>
                        <Tag tone={priorityTone[rec.priority] ?? 'info'}>{rec.priority}</Tag>
                      </div>
                      <p className="text-sm font-medium text-ds-foreground">{rec.title}</p>
                      <p className="mt-ds-1 text-xs text-ds-foreground-muted">{rec.description}</p>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0">
                      {rec.action}
                    </Button>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}

export default function BriefingsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Daily Briefings"
        description="AI-generated business summaries with key metrics and action items"
        breadcrumbs={[
          { label: 'AI Hub', href: '/ai' },
          { label: 'Business Intelligence', href: '/ai/bi' },
          { label: 'Briefings' },
        ]}
      />
      <AiGate>
        <BriefingsContent />
      </AiGate>
    </PageContainer>
  );
}
