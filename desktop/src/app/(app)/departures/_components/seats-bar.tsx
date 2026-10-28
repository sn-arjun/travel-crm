'use client';

import * as React from 'react';

import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { seatsBarParts, seatsBreakdown, seatsText, seatsTone } from '@/lib/departures';
import type { SeatsSummary } from '@/lib/api/departures';

const TONE_TEXT: Record<'success' | 'warning' | 'danger', string> = {
  success: 'text-ds-success-on-subtle',
  warning: 'text-ds-warning-on-subtle',
  danger: 'text-ds-danger-on-subtle',
};

interface SeatsBarProps {
  seats: SeatsSummary;
  /** `compact` is one line for table rows; `full` adds the confirmed / held / waitlist breakdown underneath. */
  variant?: 'compact' | 'full';
  className?: string;
}

/**
 * Seats of a departure: confirmed (solid), held (lighter) and what is left, as a bar and in words. The numbers are also on the
 * element (data-left, data-confirmed, data-held, data-waitlisted) so a test or a script can read them without parsing text.
 */
export function SeatsBar({ seats, variant = 'compact', className }: SeatsBarProps) {
  const t = useT();
  const parts = seatsBarParts(seats);
  const tone = seatsTone(seats);
  const text = seatsText(seats, t);
  return (
    <div
      className={cn('min-w-40 space-y-ds-1', className)}
      data-testid="seats-bar"
      data-left={seats.left}
      data-capacity={seats.capacity}
      data-confirmed={seats.confirmed}
      data-held={seats.held}
      data-waitlisted={seats.waitlisted}
    >
      <div className="flex items-baseline justify-between gap-ds-2 text-sm">
        <span className={cn('font-medium tabular-nums', TONE_TEXT[tone])}>{text}</span>
        {variant === 'compact' && seats.waitlisted > 0 && (
          <span className="text-xs text-ds-info-on-subtle">{t('departures.seats.waitlisted', { count: seats.waitlisted })}</span>
        )}
      </div>
      <div
        role="img"
        aria-label={`${text}. ${seatsBreakdown(seats, t)}`}
        className="flex h-2 w-full overflow-hidden rounded-ds-full bg-ds-surface-sunken"
      >
        <div className="h-full bg-ds-success" style={{ width: `${parts.confirmed}%` }} />
        <div className="h-full bg-ds-warning" style={{ width: `${parts.held}%` }} />
      </div>
      {variant === 'full' && <p className="text-xs text-ds-foreground-muted">{seatsBreakdown(seats, t)}</p>}
    </div>
  );
}
