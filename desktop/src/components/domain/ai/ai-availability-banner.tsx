'use client';

import { CloudOff } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

import { useAiAvailability } from './use-ai-availability';

interface AiAvailabilityBannerProps {
  /** What still works, e.g. "Existing briefings stay available." */
  note?: string;
  className?: string;
}

/**
 * Slim inline notice for pages that mix stored data with AI generation: the
 * stored data still renders, and the page says plainly that generating new
 * results needs AI to be set up. Renders nothing when AI is available.
 */
export function AiAvailabilityBanner({ note, className }: AiAvailabilityBannerProps) {
  const { unavailable } = useAiAvailability();
  if (!unavailable) return null;
  return (
    <div
      role="status"
      data-testid="ai-unavailable-banner"
      className={cn(
        'flex items-start gap-ds-3 rounded-ds-md border border-ds-border bg-ds-surface-sunken px-ds-4 py-ds-3',
        className,
      )}
    >
      <CloudOff className="mt-0.5 size-4 shrink-0 text-ds-foreground-muted" aria-hidden="true" />
      <p className="text-sm text-ds-foreground-muted">
        <span className="font-medium text-ds-foreground">AI is not configured yet.</span>{' '}
        Generating new AI results is unavailable until your administrator enables it.
        {note ? ` ${note}` : ''}
      </p>
    </div>
  );
}
