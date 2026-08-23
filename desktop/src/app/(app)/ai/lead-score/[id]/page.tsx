'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, RefreshCw, Sparkles, Star, Target } from 'lucide-react';
import { toast } from 'sonner';
import { DetailPage } from '@/components/domain';
import { Badge, Button, Progress, Separator, Skeleton, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { aiApi, type LeadScore, type LeadScoreHistoryEntry } from '@/lib/api/ai';

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
  const { data: historyData, loading: historyLoading } = useApiQuery(
    () => aiApi.intelligence.getLeadScoreHistory(id),
    [id],
  );
  const { mutate: recalculate, loading: recalculating } = useApiMutation(() =>
    aiApi.intelligence.calculateLeadScore(id),
  );

  const score: LeadScore | null = data?.data ?? null;
  const history: LeadScoreHistoryEntry[] = historyData?.data ?? [];

  const handleRecalculate = async () => {
    const result = await recalculate(undefined);
    if (result) {
      toast.success('Lead score recalculated');
      refetch();
    } else {
      toast.error('Could not recalculate lead score');
    }
  };

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

  if (!score) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 rounded-ds-lg border border-dashed border-ds-border py-ds-9 text-center">
        <Target className="size-10 text-ds-foreground-subtle" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-ds-foreground">Unable to calculate lead score</p>
          <p className="mt-ds-1 text-xs text-ds-foreground-muted">This lead may not have enough data for scoring</p>
        </div>
        <Button size="sm" onClick={() => router.push('/ai/lead-score')}>
          Back
        </Button>
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
      }
      activity={history.map((h) => ({
        id: h.id,
        title: `Score: ${h.score} (${h.category ?? getScoreLabel(h.score)})`,
        timestamp: new Date(h.createdAt).toLocaleString('en-IN'),
      }))}
      activityLoading={historyLoading}
    />
  );
}

export default function LeadScorePage() {
  const params = useParams<{ id: string }>();
  const { enabled, reason, upgradeHref, loading } = useFeatureGate('ai_intelligence');

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
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
              : 'Upgrade your plan to unlock AI-powered lead scoring.'}
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

  return <LeadScoreDetailContent id={params.id} />;
}
