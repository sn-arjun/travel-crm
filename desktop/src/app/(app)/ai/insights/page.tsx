'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Lightbulb, Sparkles, TrendingUp, X, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import { Button, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger, Tag } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { aiApi, type Insight, type Recommendation } from '@/lib/api/ai';
import { toLocalDateString } from '@/lib/dates';

const PRIORITY_TONE: Record<Recommendation['priority'], 'danger' | 'warning' | 'info'> = {
  high: 'danger',
  medium: 'warning',
  low: 'info',
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  actioned: 'success',
  dismissed: 'neutral',
  active: 'warning',
};

function toCsv<T extends Record<string, unknown>>(rows: T[], columns: string[]) {
  const lines = rows.map((r) =>
    columns.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','),
  );
  return [columns.join(','), ...lines].join('\n');
}

function downloadCsv(csv: string, name: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function InsightsListPage() {
  const [refetchKey, setRefetchKey] = React.useState(0);
  const [generating, setGenerating] = React.useState(false);

  const handleDismiss = async (id: string) => {
    try {
      await aiApi.intelligence.dismissInsight(id);
      toast.success('Insight dismissed');
      setRefetchKey((k) => k + 1);
    } catch {
      toast.error('Could not dismiss insight');
    }
  };

  const handleAction = async (id: string) => {
    try {
      await aiApi.intelligence.actionInsight(id);
      toast.success('Insight actioned');
      setRefetchKey((k) => k + 1);
    } catch {
      toast.error('Could not action insight');
    }
  };

  const handleGenerateTrends = async () => {
    setGenerating(true);
    try {
      await aiApi.intelligence.generateTrends();
      toast.success('New trend insights generated');
      setRefetchKey((k) => k + 1);
    } catch {
      toast.error('Could not generate trend insights');
    } finally {
      setGenerating(false);
    }
  };

  const columns: DataTableColumn<Insight>[] = [
    { key: 'title', header: 'Insight', sortable: true },
    { key: 'description', header: 'Description' },
    { key: 'metric', header: 'Metric' },
    { key: 'value', header: 'Value', align: 'right' },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <Tag tone={STATUS_TONE[r.status ?? 'active']}>{r.status ?? 'active'}</Tag>,
    },
  ];

  return (
    <ListPage<Insight>
      refreshKey={refetchKey}
      title="Insights"
      description="AI-generated observations about your pipeline and performance."
      getRowId={(r) => r.id}
      fetcher={({ page, limit, search }) =>
        aiApi.intelligence.getInsights({ limit }).then((res) => ({
          data: (res.data ?? []).filter(
            (i) => !search || i.title.toLowerCase().includes(search.toLowerCase()),
          ),
          pagination: { page, limit, total: res.data?.length ?? 0, totalPages: 1 },
        }))
      }
      columns={columns}
      headerActions={
        <Button variant="outline" size="sm" className="gap-ds-2" onClick={handleGenerateTrends} disabled={generating}>
          <TrendingUp aria-hidden="true" />
          {generating ? 'Analyzing…' : 'Detect trends'}
        </Button>
      }
      rowActions={(r) =>
        (r.status ?? 'active') === 'active' ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Act on insight"
              onClick={(e) => {
                e.stopPropagation();
                void handleAction(r.id);
              }}
            >
              <Check />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss insight"
              onClick={(e) => {
                e.stopPropagation();
                void handleDismiss(r.id);
              }}
            >
              <X />
            </Button>
          </>
        ) : null
      }
      onExport={(rows) =>
        downloadCsv(
          toCsv(rows as unknown as Record<string, unknown>[], ['title', 'description', 'metric', 'value', 'status']),
          `ai-insights-${toLocalDateString(new Date())}.csv`,
        )
      }
      exportLabel="Export CSV"
      emptyTitle="No insights yet"
      emptyDescription="Insights will appear here as AI analyzes your business data."
      emptyIcon={<Lightbulb className="size-10 text-ds-foreground-subtle" aria-hidden="true" />}
    />
  );
}

function RecommendationsListPage() {
  const [refetchKey, setRefetchKey] = React.useState(0);

  const handleAct = async (id: string) => {
    try {
      await aiApi.intelligence.actRecommendation(id);
      toast.success('Recommendation actioned');
      setRefetchKey((k) => k + 1);
    } catch {
      toast.error('Could not action recommendation');
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await aiApi.intelligence.dismissRecommendation(id);
      toast.success('Recommendation dismissed');
      setRefetchKey((k) => k + 1);
    } catch {
      toast.error('Could not dismiss recommendation');
    }
  };

  const columns: DataTableColumn<Recommendation>[] = [
    { key: 'category', header: 'Category', sortable: true },
    { key: 'title', header: 'Title', sortable: true },
    { key: 'description', header: 'Description' },
    {
      key: 'priority',
      header: 'Priority',
      cell: (r) => <Tag tone={PRIORITY_TONE[r.priority]}>{r.priority}</Tag>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => <Tag tone={STATUS_TONE[r.status ?? 'active']}>{r.status ?? 'active'}</Tag>,
    },
  ];

  return (
    <ListPage<Recommendation>
      refreshKey={refetchKey}
      title="Recommendations"
      description="Actionable suggestions generated from your business data."
      getRowId={(r) => r.id}
      fetcher={({ page, limit, search }) =>
        aiApi.intelligence.getRecommendations({ limit }).then((res) => ({
          data: (res.data ?? []).filter(
            (r) => !search || r.title.toLowerCase().includes(search.toLowerCase()),
          ),
          pagination: { page, limit, total: res.data?.length ?? 0, totalPages: 1 },
        }))
      }
      columns={columns}
      rowActions={(r) =>
        (r.status ?? 'active') === 'active' ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Act on recommendation"
              onClick={(e) => {
                e.stopPropagation();
                void handleAct(r.id);
              }}
            >
              <Check />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss recommendation"
              onClick={(e) => {
                e.stopPropagation();
                void handleDismiss(r.id);
              }}
            >
              <X />
            </Button>
          </>
        ) : null
      }
      onExport={(rows) =>
        downloadCsv(
          toCsv(rows as unknown as Record<string, unknown>[], ['category', 'title', 'description', 'priority', 'status']),
          `ai-recommendations-${toLocalDateString(new Date())}.csv`,
        )
      }
      exportLabel="Export CSV"
      emptyTitle="No recommendations yet"
      emptyDescription="Recommendations will appear here as AI analyzes your business data."
    />
  );
}

function AiInsightsContent() {
  return (
    <Tabs defaultValue="insights">
      <TabsList>
        <TabsTrigger value="insights">Insights</TabsTrigger>
        <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
      </TabsList>
      <TabsContent value="insights" className="mt-ds-4">
        <InsightsListPage />
      </TabsContent>
      <TabsContent value="recommendations" className="mt-ds-4">
        <RecommendationsListPage />
      </TabsContent>
    </Tabs>
  );
}

export default function InsightsPage() {
  const { enabled, reason, upgradeHref, loading } = useFeatureGate('ai_intelligence');

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 rounded-ds-lg border border-dashed border-ds-border py-ds-9 text-center">
        <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-surface-sunken">
          <Lock className="size-5 text-ds-foreground-muted" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-ds-foreground">
            {reason === 'cap_exceeded' ? "Today's AI intelligence quota is used up" : 'AI Intelligence is not on your plan'}
          </p>
          <p className="mt-ds-1 text-xs text-ds-foreground-muted">
            {reason === 'cap_exceeded'
              ? 'Your quota resets automatically tomorrow, or upgrade for a higher daily limit.'
              : 'Upgrade your plan to unlock AI-powered insights and recommendations.'}
          </p>
        </div>
        <Button asChild size="sm" className="gap-ds-2">
          <Link href={upgradeHref}>
            <Sparkles className="size-3.5" aria-hidden="true" />
            {reason === 'cap_exceeded' ? 'Upgrade for more' : 'Upgrade to enable'}
          </Link>
        </Button>
      </div>
    );
  }

  return <AiInsightsContent />;
}
