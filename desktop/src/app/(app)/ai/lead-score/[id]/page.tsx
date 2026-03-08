'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Target,
  ArrowLeft,
  Loader2,
  RefreshCw,
  TrendingUp,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { aiApi, type LeadScore } from '@/lib/api/ai';

function getScoreColor(score: number) {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-blue-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function getScoreBg(score: number) {
  if (score >= 80) return 'bg-emerald-100 dark:bg-emerald-950/30';
  if (score >= 60) return 'bg-blue-100 dark:bg-blue-950/30';
  if (score >= 40) return 'bg-amber-100 dark:bg-amber-950/30';
  return 'bg-red-100 dark:bg-red-950/30';
}

function getScoreLabel(score: number) {
  if (score >= 80) return 'Hot Lead';
  if (score >= 60) return 'Warm Lead';
  if (score >= 40) return 'Cool Lead';
  return 'Cold Lead';
}

function getProgressColor(score: number) {
  if (score >= 80) return '[&>div]:bg-emerald-600';
  if (score >= 60) return '[&>div]:bg-blue-600';
  if (score >= 40) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-red-500';
}

export default function LeadScorePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data, loading, refetch } = useApiQuery(
    () => aiApi.intelligence.getLeadScore(id),
    [id],
  );

  const score: LeadScore | null = (data as { data?: LeadScore })?.data ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">Lead Score</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered scoring analysis for lead {id}
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Recalculate
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-32 w-32 rounded-full mx-auto" />
              <Skeleton className="h-6 w-24 mx-auto" />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardContent className="pt-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      ) : !score ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Target className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Unable to calculate lead score</p>
              <p className="text-xs mt-1">This lead may not have enough data for scoring</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Score Gauge */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-center">Overall Score</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center space-y-4">
              <div
                className={cn(
                  'flex items-center justify-center h-36 w-36 rounded-full border-4',
                  getScoreBg(score.score),
                )}
                style={{ borderColor: 'currentColor' }}
              >
                <div className="text-center">
                  <p className={cn('text-4xl font-bold', getScoreColor(score.score))}>
                    {score.score}
                  </p>
                  <p className="text-xs text-muted-foreground">/100</p>
                </div>
              </div>
              <Badge className={cn('text-sm px-3 py-1', getScoreBg(score.score), getScoreColor(score.score))}>
                {getScoreLabel(score.score)}
              </Badge>
              <Progress
                value={score.score}
                className={cn('h-3 w-full', getProgressColor(score.score))}
              />
            </CardContent>
          </Card>

          {/* Factor Breakdown */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Score Breakdown</CardTitle>
              <CardDescription>
                Factors contributing to the overall lead score
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {score.factors.map((factor, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{factor.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        Weight: {Math.round(factor.weight * 100)}%
                      </span>
                      <span className="font-semibold">
                        +{factor.contribution.toFixed(1)}
                      </span>
                    </div>
                  </div>
                  <Progress
                    value={(factor.contribution / score.score) * 100}
                    className="h-2"
                  />
                </div>
              ))}

              {score.recommendation && (
                <>
                  <Separator />
                  <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <Star className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">AI Recommendation</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {score.recommendation}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
