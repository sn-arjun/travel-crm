'use client';

import * as React from 'react';

import { headcountShares } from '@/lib/headcount';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface HeadcountBarProps {
  headcount: { expected: number; boarded: number; noShow: number; pending: number; documentsChecked?: number };
  /** `compact` is one line for a stop; `full` adds the no-show, to-go and documents figures underneath. */
  variant?: 'compact' | 'full';
  className?: string;
}

/**
 * Heads on board: boarded (solid), no-show (red) and still to come (empty), as a bar and in words. The figures are also on the
 * element (data-expected, data-boarded, data-no-show, data-pending) so a test can read them without parsing text.
 */
export function HeadcountBar({ headcount, variant = 'full', className }: HeadcountBarProps) {
  const t = useT();
  const shares = headcountShares(headcount);
  const label = headcount.expected > 0
    ? t('coachTrips.headcount.label', { boarded: headcount.boarded, expected: headcount.expected })
    : t('coachTrips.headcount.empty');
  return (
    <div
      className={cn('min-w-40 space-y-ds-1', className)}
      data-testid="headcount-bar"
      data-expected={headcount.expected}
      data-boarded={headcount.boarded}
      data-no-show={headcount.noShow}
      data-pending={headcount.pending}
    >
      <p className="text-sm font-medium tabular-nums" data-testid="headcount-label">{label}</p>
      <div
        role="img"
        aria-label={t('coachTrips.headcount.aria', { boarded: headcount.boarded, noShow: headcount.noShow, pending: headcount.pending, expected: headcount.expected })}
        className="flex h-2 w-full overflow-hidden rounded-ds-full bg-ds-surface-sunken"
      >
        <div className="h-full bg-ds-success" style={{ width: `${shares.boarded}%` }} />
        <div className="h-full bg-ds-danger" style={{ width: `${shares.noShow}%` }} />
      </div>
      {variant === 'full' && headcount.expected > 0 && (
        <p className="text-xs text-ds-foreground-muted tabular-nums">
          {t('coachTrips.headcount.noShow', { count: headcount.noShow })}
          {' · '}
          {t('coachTrips.headcount.pending', { count: headcount.pending })}
          {headcount.documentsChecked !== undefined && (
            <>
              {' · '}
              {t('coachTrips.headcount.documents', { count: headcount.documentsChecked })}
            </>
          )}
        </p>
      )}
    </div>
  );
}
