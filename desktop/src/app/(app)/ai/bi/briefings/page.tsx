'use client';

import * as React from 'react';
import { FileText, RefreshCw, Lightbulb, BarChart3, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { aiApi, type BriefingData } from '@/lib/api/ai';

const priorityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400',
};

export default function BriefingsPage() {
  const [briefingType, setBriefingType] = React.useState('daily');

  const { data, loading, refetch } = useApiQuery(
    () => aiApi.bi.getBriefing({ type: briefingType }),
    [briefingType],
  );

  const briefing: BriefingData | null = (data as { data?: BriefingData })?.data ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Briefings</h1>
          <p className="text-muted-foreground mt-1">
            AI-generated business summaries with key metrics and action items
          </p>
        </div>
        <div className="flex items-center gap-3">
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
          <Button variant="outline" className="gap-2" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="grid grid-cols-3 gap-4 mt-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : !briefing ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <FileText className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">No briefing available</p>
              <p className="text-xs mt-1">Briefings are generated as data accumulates</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Header */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">
                    {briefingType.charAt(0).toUpperCase() + briefingType.slice(1)} Briefing
                  </CardTitle>
                  <CardDescription>
                    {new Date(briefing.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-sm">
                  {briefingType}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed">{briefing.summary}</p>

              {/* Key Metrics */}
              {Object.keys(briefing.keyMetrics).length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium mb-3 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Key Metrics
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(briefing.keyMetrics).map(([key, value]) => (
                        <div key={key} className="rounded-lg border bg-muted/30 p-3 text-center">
                          <p className="text-xs text-muted-foreground capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </p>
                          <p className="text-lg font-bold mt-1">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Insights */}
          {briefing.insights.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  Insights ({briefing.insights.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {briefing.insights.map((insight, idx) => (
                    <div key={idx} className="rounded-lg border p-4 space-y-2">
                      <p className="font-medium text-sm">{insight.title}</p>
                      <p className="text-xs text-muted-foreground">{insight.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{insight.metric}</span>
                        <span className="text-sm font-semibold">{insight.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {briefing.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" />
                  Recommendations ({briefing.recommendations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {briefing.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-start gap-4 rounded-lg border p-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">{rec.category}</Badge>
                          <Badge className={cn('text-xs', priorityColors[rec.priority] || priorityColors.low)}>
                            {rec.priority}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm">{rec.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">{rec.description}</p>
                      </div>
                      <Button variant="outline" size="sm" className="shrink-0">
                        {rec.action}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
