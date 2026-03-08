'use client';

import * as React from 'react';
import {
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Loader2,
  AlertCircle,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { aiApi, type Insight, type Recommendation } from '@/lib/api/ai';

const trendIcons = {
  up: TrendingUp,
  down: TrendingDown,
  stable: Minus,
};

const trendColors = {
  up: 'text-emerald-600',
  down: 'text-red-600',
  stable: 'text-amber-600',
};

const priorityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
};

export default function InsightsPage() {
  const {
    data: insightsData,
    loading: insightsLoading,
    refetch: refetchInsights,
  } = useApiQuery(() => aiApi.intelligence.getInsights(), []);

  const {
    data: recsData,
    loading: recsLoading,
    refetch: refetchRecs,
  } = useApiQuery(() => aiApi.intelligence.getRecommendations(), []);

  const insights: Insight[] = (insightsData as { data?: Insight[] })?.data ?? [];
  const recommendations: Recommendation[] = (recsData as { data?: Recommendation[] })?.data ?? [];

  const handleRefresh = () => {
    refetchInsights();
    refetchRecs();
    toast.success('Refreshing insights...');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Insights</h1>
          <p className="text-muted-foreground mt-1">
            AI-generated insights and recommendations for your business
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="insights">
        <TabsList>
          <TabsTrigger value="insights">
            Insights {insights.length > 0 && `(${insights.length})`}
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            Recommendations {recommendations.length > 0 && `(${recommendations.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="insights" className="mt-4">
          {insightsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-6 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : insights.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <Lightbulb className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">No insights available yet</p>
                  <p className="text-xs mt-1">Insights will appear as AI analyzes your data</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.map((insight, idx) => {
                const TrendIcon = insight.trend ? trendIcons[insight.trend] : Minus;
                const trendColor = insight.trend ? trendColors[insight.trend] : 'text-muted-foreground';

                return (
                  <Card key={idx}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base">{insight.title}</CardTitle>
                        {insight.trend && (
                          <TrendIcon className={cn('h-5 w-5 shrink-0', trendColor)} />
                        )}
                      </div>
                      <CardDescription>{insight.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                        <span className="text-sm text-muted-foreground">{insight.metric}</span>
                        <span className="text-lg font-bold">{insight.value}</span>
                      </div>

                      {insight.recommendation && (
                        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                          <Star className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <p className="text-xs text-foreground">{insight.recommendation}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recommendations" className="mt-4">
          {recsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="pt-6 space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : recommendations.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <AlertCircle className="h-12 w-12 mb-3 opacity-30" />
                  <p className="text-sm">No recommendations available yet</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec, idx) => (
                <Card key={idx}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {rec.category}
                          </Badge>
                          <Badge
                            className={cn(
                              'text-xs',
                              priorityColors[rec.priority] || priorityColors.low,
                            )}
                          >
                            {rec.priority}
                          </Badge>
                        </div>
                        <p className="font-semibold">{rec.title}</p>
                        <p className="text-sm text-muted-foreground">{rec.description}</p>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0">
                        {rec.action}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
