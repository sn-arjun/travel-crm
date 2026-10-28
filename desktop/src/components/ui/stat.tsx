'use client';

import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { Skeleton } from './skeleton';

export interface StatProps {
  label: string;
  value: React.ReactNode;
  /** Secondary line under the value. */
  hint?: string;
  icon?: React.ReactNode;
  /** Percentage change. Positive renders success, negative renders danger. */
  delta?: number;
  /** Set when a *decrease* is good (e.g. churn, response time). */
  invertDelta?: boolean;
  loading?: boolean;
  className?: string;
}

export function Stat({
  label,
  value,
  hint,
  icon,
  delta,
  invertDelta = false,
  loading,
  className,
}: StatProps) {
  const isFlat = delta === 0 || delta === undefined;
  const isGood = delta !== undefined && (invertDelta ? delta < 0 : delta > 0);

  return (
    <div
      className={cn(
        'rounded-ds-lg border border-ds-border bg-ds-surface p-ds-4 shadow-ds-1',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-ds-2">
        <p className="text-xs font-medium text-ds-foreground-muted">{label}</p>
        {icon && <span className="text-ds-foreground-subtle">{icon}</span>}
      </div>

      {loading ? (
        <Skeleton className="mt-ds-2 h-8 w-24" />
      ) : (
        <p className="mt-ds-2 text-2xl font-semibold tabular-nums text-ds-foreground">{value}</p>
      )}

      {(hint || delta !== undefined) && !loading && (
        <div className="mt-ds-1 flex items-center gap-ds-2">
          {delta !== undefined && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
                isFlat && 'text-ds-foreground-muted',
                !isFlat && isGood && 'text-ds-success',
                !isFlat && !isGood && 'text-ds-danger',
              )}
            >
              {isFlat ? (
                <Minus className="size-3" aria-hidden="true" />
              ) : delta > 0 ? (
                <ArrowUp className="size-3" aria-hidden="true" />
              ) : (
                <ArrowDown className="size-3" aria-hidden="true" />
              )}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {hint && <span className="text-xs text-ds-foreground-muted">{hint}</span>}
        </div>
      )}
    </div>
  );
}
