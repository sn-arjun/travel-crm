'use client';

import * as React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { cva, type VariantProps } from 'class-variance-authority';

const statCardVariants = cva(
  'relative overflow-hidden rounded-lg border bg-card p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group',
  {
    variants: {
      variant: {
        default: 'border-border',
        primary: 'border-ds-primary bg-ds-primary-subtle',
        success: 'border-ds-success bg-ds-success-subtle',
        warning: 'border-ds-warning bg-ds-warning-subtle',
        danger: 'border-ds-danger bg-ds-danger-subtle',
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
  changeLabel: changeLabelProp,
  icon,
  sparkline,
  className,
  variant,
  prefix,
  suffix,
  loading,
}: StatCardProps) {
  const t = useT();
  const changeLabel = changeLabelProp ?? t('ui.statCard.vsLastPeriod');
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
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
          {icon && (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary dark:group-hover:bg-primary/10">
              {icon}
            </div>
          )}
        </div>

        {/* Value */}
        <div className="flex items-baseline gap-1.5 mb-2">
          {prefix && <span className="text-sm font-medium text-muted-foreground">{prefix}</span>}
          <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums leading-none" style={{ fontFamily: 'var(--font-display)' }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          {suffix && <span className="text-sm font-medium text-muted-foreground">{suffix}</span>}
        </div>

        {/* Change indicator */}
        {change !== undefined && (
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold',
                isPositive && 'bg-ds-success-subtle text-ds-success-on-subtle',
                isNegative && 'bg-ds-danger-subtle text-ds-danger-on-subtle',
                isNeutral && 'bg-muted text-muted-foreground',
              )}
            >
              {isPositive && <TrendingUp className="h-3 w-3" />}
              {isNegative && <TrendingDown className="h-3 w-3" />}
              {isNeutral && <Minus className="h-3 w-3" />}
              {isPositive && '+'}
              {change}%
            </span>
            <span className="text-xs text-muted-foreground">{changeLabel}</span>
          </div>
        )}

        {/* Optional sparkline */}
        {sparkline && <div className="mt-3 h-10">{sparkline}</div>}
      </div>
    </div>
  );
}
