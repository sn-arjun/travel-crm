'use client';

import * as React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const statCardVariants = cva(
  'relative overflow-hidden rounded-lg border bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group',
  {
    variants: {
      variant: {
        default: 'border-border',
        primary: 'border-primary/20 bg-gradient-to-br from-primary/5 via-white to-white dark:from-primary/10 dark:via-card dark:to-card dark:border-primary/20',
        success: 'border-emerald-200/50 bg-gradient-to-br from-emerald-50/80 via-white to-white dark:from-emerald-950/20 dark:via-card dark:to-card dark:border-emerald-900/30',
        warning: 'border-amber-100 bg-gradient-to-br from-amber-50/80 via-white to-white dark:from-amber-950/20 dark:via-card dark:to-card dark:border-amber-900/30',
        danger: 'border-red-100 bg-gradient-to-br from-red-50/80 via-white to-white dark:from-red-950/20 dark:via-card dark:to-card dark:border-red-900/30',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

interface StatCardProps extends VariantProps<typeof statCardVariants> {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
  sparkline?: React.ReactNode;
  className?: string;
  prefix?: string;
  suffix?: string;
  loading?: boolean;
}

export function StatCard({
  title,
  value,
  change,
  changeLabel = 'vs last period',
  icon,
  sparkline,
  className,
  variant,
  prefix,
  suffix,
  loading,
}: StatCardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isNeutral = change !== undefined && change === 0;

  if (loading) {
    return (
      <div className={cn(statCardVariants({ variant }), className)}>
        <div className="space-y-3">
          <div className="h-4 w-24 rounded-lg bg-muted animate-shimmer bg-gradient-to-r from-muted via-border to-muted bg-[length:200%_100%]" />
          <div className="h-8 w-32 rounded-lg bg-muted animate-shimmer bg-gradient-to-r from-muted via-border to-muted bg-[length:200%_100%]" />
          <div className="h-3 w-20 rounded-lg bg-muted animate-shimmer bg-gradient-to-r from-muted via-border to-muted bg-[length:200%_100%]" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(statCardVariants({ variant }), 'animate-slide-up', className)}>
      <div className="relative">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
          {icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary dark:group-hover:bg-primary/10">
              {icon}
            </div>
          )}
        </div>

        {/* Value */}
        <div className="flex items-baseline gap-1.5 mb-2">
          {prefix && <span className="text-[13px] font-medium text-muted-foreground">{prefix}</span>}
          <span className="text-[28px] font-bold tracking-tight text-foreground tabular-nums leading-none" style={{ fontFamily: 'var(--font-display)' }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          {suffix && <span className="text-[13px] font-medium text-muted-foreground">{suffix}</span>}
        </div>

        {/* Change indicator */}
        {change !== undefined && (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                isPositive && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                isNegative && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                isNeutral && 'bg-muted text-muted-foreground',
              )}
            >
              {isPositive && <TrendingUp className="h-3 w-3" />}
              {isNegative && <TrendingDown className="h-3 w-3" />}
              {isNeutral && <Minus className="h-3 w-3" />}
              {isPositive && '+'}
              {change}%
            </span>
            <span className="text-[11px] text-muted-foreground">{changeLabel}</span>
          </div>
        )}

        {/* Optional sparkline */}
        {sparkline && <div className="mt-3 h-10">{sparkline}</div>}
      </div>
    </div>
  );
}
