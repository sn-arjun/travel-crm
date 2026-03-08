'use client';

import * as React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface HealthMetric {
  label: string;
  value: number;
  trend: 'up' | 'down' | 'stable';
  previousValue: number;
}

interface AIHealthScoreProps {
  overallScore?: number;
}

export function AIHealthScore({ overallScore = 79 }: AIHealthScoreProps) {
  const metrics: HealthMetric[] = [
    { label: 'Lead Response', value: 85, trend: 'up', previousValue: 82 },
    { label: 'Follow-up Rate', value: 72, trend: 'down', previousValue: 76 },
    { label: 'Conversion', value: 68, trend: 'stable', previousValue: 68 },
    { label: 'Revenue Trend', value: 91, trend: 'up', previousValue: 87 },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 60) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'from-emerald-50 to-emerald-50/50 dark:from-emerald-950/30 dark:to-emerald-950/10';
    if (score >= 60) return 'from-amber-50 to-amber-50/50 dark:from-amber-950/30 dark:to-amber-950/10';
    return 'from-red-50 to-red-50/50 dark:from-red-950/30 dark:to-red-950/10';
  };

  const getTrendIcon = (trend: HealthMetric['trend'], value: number, previous: number) => {
    if (trend === 'up') {
      return <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
    }
    if (trend === 'down') {
      return <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />;
    }
    return <div className="h-4 w-4 rounded-full bg-gray-300 dark:bg-gray-600" />;
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">CRM Health Score</CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Overall Score Circle */}
        <div className={cn('rounded-2xl bg-gradient-to-br p-8 flex flex-col items-center justify-center', getScoreBg(overallScore))}>
          <div className="relative w-24 h-24 flex items-center justify-center">
            <svg className="absolute transform -rotate-90" viewBox="0 0 100 100" width="100" height="100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted/30" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeDasharray={`${(overallScore / 100) * 283} 283`}
                className={cn('transition-all duration-500', getScoreColor(overallScore))}
              />
            </svg>
            <div className="text-center">
              <p className={cn('text-3xl font-bold', getScoreColor(overallScore))}>{overallScore}</p>
              <p className="text-xs text-muted-foreground mt-1">out of 100</p>
            </div>
          </div>
        </div>

        {/* Metric Breakdown */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Breakdown</p>
          {metrics.map((metric, idx) => {
            const change = metric.value - metric.previousValue;
            return (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{metric.label}</p>
                  <div className="flex items-center gap-1.5">
                    <span className={cn('text-sm font-semibold', getScoreColor(metric.value))}>{metric.value}</span>
                    {getTrendIcon(metric.trend, metric.value, metric.previousValue)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        metric.value >= 80 && 'bg-emerald-600',
                        metric.value >= 60 && metric.value < 80 && 'bg-amber-600',
                        metric.value < 60 && 'bg-red-600',
                      )}
                      style={{ width: `${metric.value}%` }}
                    />
                  </div>
                  <span className={cn('text-xs font-medium w-12 text-right', change >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                    {change > 0 ? '+' : ''}
                    {change}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-2 pt-3 border-t">
          <div className="text-center">
            <div className="h-2 w-full rounded-full bg-emerald-600 mb-1" />
            <p className="text-xs text-muted-foreground">80-100: Excellent</p>
          </div>
          <div className="text-center">
            <div className="h-2 w-full rounded-full bg-amber-600 mb-1" />
            <p className="text-xs text-muted-foreground">60-79: Good</p>
          </div>
          <div className="text-center">
            <div className="h-2 w-full rounded-full bg-red-600 mb-1" />
            <p className="text-xs text-muted-foreground">&lt;60: Needs work</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
