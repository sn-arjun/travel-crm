'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

import { Skeleton } from './skeleton';

export interface TimelineItem {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Pre-formatted timestamp — the primitive does no date formatting. */
  timestamp: string;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  /** Right-aligned per-item actions. */
  actions?: React.ReactNode;
}

export interface TimelineProps {
  items: TimelineItem[];
  loading?: boolean;
  emptyState?: React.ReactNode;
  className?: string;
}

const TONE_DOT: Record<NonNullable<TimelineItem['tone']>, string> = {
  neutral: 'bg-ds-surface-sunken border-ds-border-strong text-ds-foreground-muted',
  primary: 'bg-ds-primary-subtle border-ds-primary text-ds-primary-on-subtle',
  success: 'bg-ds-success-subtle border-ds-success text-ds-success-on-subtle',
  warning: 'bg-ds-warning-subtle border-ds-warning text-ds-warning-on-subtle',
  danger: 'bg-ds-danger-subtle border-ds-danger text-ds-danger-on-subtle',
  info: 'bg-ds-info-subtle border-ds-info text-ds-info-on-subtle',
};

export function Timeline({ items, loading, emptyState, className }: TimelineProps) {
  if (loading) {
    return (
      <div className={cn('space-y-ds-4', className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-ds-3">
            <Skeleton className="size-8 shrink-0 rounded-ds-full" />
            <div className="flex-1 space-y-ds-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <div className={className}>{emptyState}</div>;
  }

  return (
    <ol className={cn('relative space-y-ds-4', className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <li key={item.id} className="relative flex gap-ds-3">
            {/* Connector */}
            {!isLast && (
              <span
                aria-hidden="true"
                className="absolute top-8 start-4 h-[calc(100%+var(--spacing-ds-4)-var(--spacing-ds-6))] w-px -translate-x-1/2 rtl:translate-x-1/2 bg-ds-border"
              />
            )}

            <span
              className={cn(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-ds-full border',
                TONE_DOT[item.tone ?? 'neutral'],
                '[&_svg]:size-4',
              )}
            >
              {item.icon}
            </span>

            <div className="min-w-0 flex-1 pb-ds-1">
              <div className="flex items-start justify-between gap-ds-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ds-foreground">{item.title}</p>
                  {item.description && (
                    <div className="mt-0.5 text-sm text-ds-foreground-muted">
                      {item.description}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-ds-2">
                  <time className="text-xs whitespace-nowrap text-ds-foreground-subtle">
                    {item.timestamp}
                  </time>
                  {item.actions}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
