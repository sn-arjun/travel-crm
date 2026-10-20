'use client';

import * as React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface HealthMetric {
  label: string;
  value: number;
  previousValue: number;
}

interface AIHealthScoreProps {
  /** Real overall score (0-100). Without it the card shows an empty state. */
  overallScore?: number;
  metrics?: HealthMetric[];
}

function scoreTone(score: number): { text: string; bar: string; bg: string } {
  if (score >= 80) return { text: 'text-ds-success', bar: 'bg-ds-success', bg: 'bg-ds-success-subtle' };
  if (score >= 60) return { text: 'text-ds-warning', bar: 'bg-ds-warning', bg: 'bg-ds-warning-subtle' };
  return { text: 'text-ds-danger', bar: 'bg-ds-danger', bg: 'bg-ds-danger-subtle' };
}

export function AIHealthScore({ overallScore, metrics = [] }: AIHealthScoreProps) {
  if (overallScore === undefined) {
    return (
      <Card>
        <CardHeader className="pb-ds-4">
          <CardTitle className="text-lg">CRM Health Score</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-ds-4 text-center text-xs text-ds-foreground-muted">Not enough activity to score yet.</p>
        </CardContent>
      </Card>
    );
  }
  const overall = scoreTone(overallScore);
  return (
    <Card>
      <CardHeader className="pb-ds-4">
        <CardTitle className="text-lg">CRM Health Score</CardTitle>
      </CardHeader>

      <CardContent className="space-y-ds-6">
        <div className={cn('flex flex-col items-center justify-center rounded-ds-xl p-ds-8', overall.bg)}>
          <div className="relative flex size-24 items-center justify-center">
            <svg className="absolute -rotate-90" viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" className="text-ds-border" />
              <circle
                cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2"
                strokeDasharray={`${(overallScore / 100) * 283} 283`}
                className={cn('transition-all duration-500', overall.text)}
              />
            </svg>
            <div className="text-center">
              <p className={cn('text-3xl font-bold', overall.text)}>{overallScore}</p>
              <p className="mt-ds-1 text-xs text-ds-foreground-muted">out of 100</p>
            </div>
          </div>
        </div>

        {metrics.length > 0 ? (
          <div className="space-y-ds-3">
            <p className="text-xs font-semibold tracking-widest text-ds-foreground-muted uppercase">Breakdown</p>
            {metrics.map((metric) => {
              const change = metric.value - metric.previousValue;
              const tone = scoreTone(metric.value);
              const Icon = change < 0 ? TrendingDown : TrendingUp;
              return (
                <div key={metric.label} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-ds-foreground">{metric.label}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={cn('text-sm font-semibold', tone.text)}>{metric.value}</span>
                      {change !== 0 ? <Icon className={cn('size-4', change > 0 ? 'text-ds-success' : 'text-ds-danger')} aria-hidden="true" /> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-ds-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-ds-surface-sunken">
                      <div className={cn('h-full rounded-full transition-all duration-500', tone.bar)} style={{ width: `${metric.value}%` }} />
                    </div>
                    <span className={cn('w-12 text-end text-xs font-medium', change >= 0 ? 'text-ds-success' : 'text-ds-danger')}>
                      {change > 0 ? '+' : ''}
                      {change}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-ds-2 border-t border-ds-border pt-ds-3">
          {[
            { bar: 'bg-ds-success', label: '80-100: Excellent' },
            { bar: 'bg-ds-warning', label: '60-79: Good' },
            { bar: 'bg-ds-danger', label: '<60: Needs work' },
          ].map((l) => (
            <div key={l.label} className="text-center">
              <div className={cn('mb-ds-1 h-2 w-full rounded-full', l.bar)} />
              <p className="text-xs text-ds-foreground-muted">{l.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
