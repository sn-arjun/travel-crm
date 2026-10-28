'use client';


import { formatLocaleDateTime } from '@/lib/format';
import { AiFeaturePageGate } from '@/components/domain/ai/ai-feature-page-gate';
import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RefreshCw, Star, Target } from 'lucide-react';
import { toast } from 'sonner';
import { DetailPage } from '@/components/domain';
import { Badge, Button, Progress, Separator, Skeleton, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { aiApi, isAiUnavailableError, type AiUnavailableError, type LeadScore, type LeadScoreHistoryEntry } from '@/lib/api/ai';
import { AiUnavailableNotice } from '@/components/domain/ai/ai-unavailable-notice';
import { useAiAvailability, useNotConfiguredError } from '@/components/domain/ai/use-ai-availability';

function getScoreColor(score: number) {
  if (score >= 80) return 'text-ds-success-on-subtle';
  if (score >= 60) return 'text-ds-info-on-subtle';
  if (score >= 40) return 'text-ds-warning-on-subtle';
  return 'text-ds-danger-on-subtle';
}

function getScoreBg(score: number) {
  if (score >= 80) return 'bg-ds-success-subtle';
  if (score >= 60) return 'bg-ds-info-subtle';
  if (score >= 40) return 'bg-ds-warning-subtle';
  return 'bg-ds-danger-subtle';
}

function getScoreLabel(score: number) {
  if (score >= 80) return 'Hot lead';
  if (score >= 60) return 'Warm lead';
  if (score >= 40) return 'Cool lead';
  return 'Cold lead';
}

function scoreTone(score: number): 'success' | 'info' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'info';
  if (score >= 40) return 'warning';
  return 'danger';
}

function LeadScoreDetailContent({ id }: { id: string }) {
  const router = useRouter();
  const { data, loading, refetch } = useApiQuery(() => aiApi.intelligence.getLeadScore(id), [id]);
  const { data: historyData, loading: historyLoading, refetch: refetchHistory } = useApiQuery(
    () => aiApi.intelligence.getLeadScoreHistory(id),
    [id],
  );
  const [recalculating, setRecalculating] = React.useState(false);
  const [unavailable, setUnavailable] = React.useState<AiUnavailableError | null>(null);
  const availability = useAiAvailability();
  const notConfigured = useNotConfiguredError();

  const score: LeadScore | null = data?.data ?? null;
  const history: LeadScoreHistoryEntry[] = historyData?.data ?? [];

  const handleRecalculate = async () => {
    setRecalculating(true);
    setUnavailable(null);
    try {
      await aiApi.intelligence.calculateLeadScore(id);
      toast.success('Lead score recalculated');
      refetch();
      refetchHistory();
    } catch (err) {
      if (isAiUnavailableError(err)) setUnavailable(err);
      else toast.error('Could not recalculate lead score');
    } finally {
      setRecalculating(false);
    }
  };

  const unavailableNotice =
    unavailable ? (
      <AiUnavailableNotice
        error={unavailable ?? notConfigured}
        onRetry={() => {
          setUnavailable(null);
          availability.recheck();
        }}
      />
    ) : null;

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-ds-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!score && unavailableNotice) {
    return (
      <div className="flex flex-col gap-ds-4">
        {unavailableNotice}
        <div>
          <Button size="sm" variant="outline" onClick={() => router.push('/ai/lead-score')}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  if (!score) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 rounded-ds-lg border border-dashed border-ds-border py-ds-9 text-center">
        <Target className="size-10 text-ds-foreground-subtle" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-ds-foreground">No score calculated yet</p>
          <p className="mt-ds-1 text-xs text-ds-foreground-muted">Run the AI scoring model to get a breakdown for this lead</p>
        </div>
        <div className="flex gap-ds-2">
          <Button size="sm" className="gap-ds-2" onClick={handleRecalculate} disabled={recalculating}>
            <RefreshCw className="h-4 w-4" />
            {recalculating ? 'Calculating…' : 'Calculate score'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => router.push('/ai/lead-score')}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <DetailPage<LeadScore>
      entity={score}
      title="Lead score"
      subtitle={`AI-powered scoring analysis for lead ${id}`}
      status={<Tag tone={scoreTone(score.score)}>{getScoreLabel(score.score)}</Tag>}
      onBack={() => router.push('/ai/lead-score')}
      primaryActions={
        <Button variant="outline" size="sm" className="gap-ds-2" onClick={handleRecalculate} disabled={recalculating}>
          <RefreshCw className="h-4 w-4" />
          {recalculating ? 'Recalculating…' : 'Recalculate'}
        </Button>
      }
      overview={
        <div className="flex flex-col gap-ds-6">
        {unavailableNotice}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-ds-6">
          <div className="rounded-ds-lg border border-ds-border p-ds-6 flex flex-col items-center gap-ds-4">
            <p className="text-lg font-semibold text-ds-foreground">Overall score</p>
            <div
              className={cn(
                'flex items-center justify-center h-36 w-36 rounded-ds-full border-4 border-current',
                getScoreBg(score.score),
                getScoreColor(score.score),
              )}
            >
              <div className="text-center">
                <p className="text-4xl font-bold">{score.score}</p>
                <p className="text-xs text-ds-foreground-muted">/100</p>
              </div>
            </div>
            <Badge className={cn('text-sm px-ds-3 py-ds-1', getScoreBg(score.score), getScoreColor(score.score))}>
              {getScoreLabel(score.score)}
            </Badge>
            <Progress value={score.score} className="h-3 w-full" />
          </div>

          <div className="rounded-ds-lg border border-ds-border p-ds-6 lg:col-span-2 flex flex-col gap-ds-4">
            <div>
              <p className="text-lg font-semibold text-ds-foreground">Score breakdown</p>
              <p className="text-sm text-ds-foreground-muted">Factors contributing to the overall lead score</p>
            </div>
            <div className="flex flex-col gap-ds-4">
              {score.factors.map((factor, idx) => (
                <div key={idx} className="flex flex-col gap-ds-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-ds-foreground">{factor.name}</span>
                    <div className="flex items-center gap-ds-3">
                      <span className="text-xs text-ds-foreground-muted">Weight: {Math.round(factor.weight * 100)}%</span>
                      <span className="font-semibold text-ds-foreground">+{factor.contribution.toFixed(1)}</span>
                    </div>
                  </div>
                  <Progress value={(factor.contribution / score.score) * 100} className="h-2" />
                </div>
              ))}
              {score.factors.length === 0 && (
                <p className="text-sm text-ds-foreground-muted">No factor breakdown available.</p>
              )}
            </div>

            {score.recommendation && (
              <>
                <Separator />
                <div className="flex items-start gap-ds-3 rounded-ds-lg border border-ds-primary-subtle bg-ds-primary-subtle p-ds-4">
                  <Star className="h-5 w-5 text-ds-primary-on-subtle shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-ds-foreground">AI recommendation</p>
                    <p className="text-sm text-ds-foreground-muted mt-ds-1">{score.recommendation}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        </div>
      }
      activity={history.map((h) => ({
        id: h.id,
        title: `Score: ${h.score} (${h.category ?? getScoreLabel(h.score)})`,
        timestamp: formatLocaleDateTime(h.createdAt),
      }))}
      activityLoading={historyLoading}
    />
  );
}

export default function LeadScorePage() {
  const params = useParams<{ id: string }>();
  return (
    <AiFeaturePageGate feature="ai_intelligence" title="Lead Score" featureName="AI Intelligence" benefit="AI-powered lead scoring">
      <LeadScoreDetailContent id={params.id} />
    </AiFeaturePageGate>
  );
}
