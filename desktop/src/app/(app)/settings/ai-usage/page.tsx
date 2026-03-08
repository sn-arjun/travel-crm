'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  Brain,
  Zap,
  TrendingUp,
  DollarSign,
  BarChart3,
  MessageSquare,
  FileText,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useApiQuery } from '@/hooks/use-api';
import { client, type ApiResponse } from '@/lib/api/client';
import { cn } from '@/lib/utils';

interface AiUsageStats {
  totalCalls: number;
  totalTokensUsed: number;
  estimatedCost: number;
  period: string;
  byFeature: Array<{
    feature: string;
    calls: number;
    tokensUsed: number;
    cost: number;
  }>;
  daily: Array<{
    date: string;
    calls: number;
    tokensUsed: number;
  }>;
}

const defaultStats: AiUsageStats = {
  totalCalls: 0,
  totalTokensUsed: 0,
  estimatedCost: 0,
  period: 'current_month',
  byFeature: [],
  daily: [],
};

const featureIcons: Record<string, React.ReactNode> = {
  'lead-extraction': <FileText className="h-4 w-4" />,
  'itinerary-generation': <Sparkles className="h-4 w-4" />,
  'message-compose': <MessageSquare className="h-4 w-4" />,
  'reply-suggest': <MessageSquare className="h-4 w-4" />,
  'nl-query': <Brain className="h-4 w-4" />,
  'insights': <TrendingUp className="h-4 w-4" />,
  'ocr': <FileText className="h-4 w-4" />,
  'lead-scoring': <BarChart3 className="h-4 w-4" />,
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function AiUsagePage() {
  const router = useRouter();

  const { data: usageResponse, loading } = useApiQuery(
    () => client.get<ApiResponse<AiUsageStats>>('/ai/usage'),
    [],
  );

  const stats: AiUsageStats = React.useMemo(() => {
    if (!usageResponse || !('data' in usageResponse)) return defaultStats;
    return (usageResponse.data as AiUsageStats) ?? defaultStats;
  }, [usageResponse]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/settings')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Usage</h1>
          <p className="text-muted-foreground mt-1">Monitor your AI feature usage and estimated costs</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Zap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total API Calls</p>
                <p className="text-2xl font-bold">{formatNumber(stats.totalCalls)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Brain className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tokens Used</p>
                <p className="text-2xl font-bold">{formatNumber(stats.totalTokensUsed)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
                <DollarSign className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Estimated Cost</p>
                <p className="text-2xl font-bold">${stats.estimatedCost.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Usage by Feature */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Usage by Feature
          </CardTitle>
          <CardDescription>Breakdown of AI usage across different features</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.byFeature.length === 0 ? (
            <div className="text-center py-12">
              <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">No AI usage data available yet</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature</TableHead>
                  <TableHead className="text-right">API Calls</TableHead>
                  <TableHead className="text-right">Tokens Used</TableHead>
                  <TableHead className="text-right">Est. Cost</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.byFeature
                  .sort((a, b) => b.calls - a.calls)
                  .map((feat) => {
                    const pct = stats.totalCalls > 0 ? ((feat.calls / stats.totalCalls) * 100).toFixed(1) : '0';
                    return (
                      <TableRow key={feat.feature}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {featureIcons[feat.feature] ?? <Zap className="h-4 w-4" />}
                            <span className="font-medium text-sm capitalize">
                              {feat.feature.replace(/-/g, ' ')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(feat.calls)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatNumber(feat.tokensUsed)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          ${feat.cost.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Daily Usage */}
      {stats.daily.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Daily Usage (Last 30 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-40">
              {stats.daily.map((day, idx) => {
                const maxCalls = Math.max(...stats.daily.map((d) => d.calls), 1);
                const height = (day.calls / maxCalls) * 100;
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1" title={`${day.date}: ${day.calls} calls`}>
                    <div
                      className="w-full bg-blue-500/80 rounded-t min-h-[2px]"
                      style={{ height: `${height}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs text-muted-foreground">
                {stats.daily[0]?.date ?? ''}
              </span>
              <span className="text-xs text-muted-foreground">
                {stats.daily[stats.daily.length - 1]?.date ?? ''}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
