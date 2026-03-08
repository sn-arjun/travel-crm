'use client';

import * as React from 'react';
import { Heart, RefreshCw, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { aiApi, type HealthScoreResult } from '@/lib/api/ai';

function getScoreColor(score: number) {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-blue-600';
  if (score >= 40) return 'text-amber-600';
  return 'text-red-600';
}

function getScoreBg(score: number) {
  if (score >= 80) return 'bg-emerald-50 dark:bg-emerald-950/30';
  if (score >= 60) return 'bg-blue-50 dark:bg-blue-950/30';
  if (score >= 40) return 'bg-amber-50 dark:bg-amber-950/30';
  return 'bg-red-50 dark:bg-red-950/30';
}

function getScoreLabel(score: number) {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Needs Attention';
}

function getProgressColor(score: number) {
  if (score >= 80) return '[&>div]:bg-emerald-600';
  if (score >= 60) return '[&>div]:bg-blue-600';
  if (score >= 40) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-red-500';
}

const categoryIcons: Record<string, string> = {
  revenue: 'Revenue',
  pipeline: 'Pipeline',
  customerSatisfaction: 'Customer Satisfaction',
  teamProductivity: 'Team Productivity',
  leadConversion: 'Lead Conversion',
  retention: 'Retention',
};

export default function HealthScorePage() {
  const { data, loading, refetch } = useApiQuery(
    () => aiApi.bi.getHealthScore(),
    [],
  );

  const health: HealthScoreResult | null = (data as { data?: HealthScoreResult })?.data ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Business Health Score</h1>
          <p className="text-muted-foreground mt-1">
            Overall business health with category breakdowns and trends
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardContent className="pt-6">
              <Skeleton className="h-36 w-36 rounded-full mx-auto" />
              <Skeleton className="h-6 w-24 mx-auto mt-4" />
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardContent className="pt-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      ) : !health ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Heart className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Health score not available</p>
              <p className="text-xs mt-1">Not enough data to calculate a score</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Overall Score */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-center">Overall Health</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center space-y-4">
                <div
                  className={cn(
                    'flex items-center justify-center h-36 w-36 rounded-full border-4',
                    getScoreBg(health.overallScore),
                  )}
                >
                  <div className="text-center">
                    <p className={cn('text-4xl font-bold', getScoreColor(health.overallScore))}>
                      {health.overallScore}
                    </p>
                    <p className="text-xs text-muted-foreground">/100</p>
                  </div>
                </div>
                <Badge
                  className={cn(
                    'text-sm px-3 py-1',
                    getScoreBg(health.overallScore),
                    getScoreColor(health.overallScore),
                  )}
                >
                  {getScoreLabel(health.overallScore)}
                </Badge>
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Category Breakdown</CardTitle>
                <CardDescription>
                  Score distribution across business categories
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {Object.entries(health.byCategory).map(([category, score]) => {
                  const label =
                    categoryIcons[category] ||
                    category.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
                  return (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{label}</span>
                        <span className={cn('font-bold', getScoreColor(score))}>{score}/100</span>
                      </div>
                      <Progress
                        value={score}
                        className={cn('h-2.5', getProgressColor(score))}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {/* Recommendations */}
          {health.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recommendations</CardTitle>
                <CardDescription>Steps to improve your business health score</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {health.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-start gap-3 rounded-lg border p-4">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                        {idx + 1}
                      </div>
                      <p className="text-sm">{rec}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Trends */}
          {Object.keys(health.trends).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Trends
                </CardTitle>
                <CardDescription>Historical trend data by category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(health.trends).map(([category, values]) => {
                    const label =
                      categoryIcons[category] ||
                      category.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
                    const latest = values[values.length - 1] ?? 0;
                    const prev = values[values.length - 2] ?? latest;
                    const change = latest - prev;

                    return (
                      <div key={category} className="rounded-lg border p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium">{label}</p>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              change >= 0 ? 'text-emerald-600' : 'text-red-600',
                            )}
                          >
                            {change >= 0 ? '+' : ''}{change}
                          </Badge>
                        </div>
                        <div className="flex items-end gap-1 h-12">
                          {values.map((val, i) => (
                            <div
                              key={i}
                              className={cn(
                                'flex-1 rounded-sm min-h-[4px]',
                                getScoreBg(val),
                              )}
                              style={{ height: `${Math.max(val, 5)}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
