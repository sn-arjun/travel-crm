'use client';

import { CloudOff, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import type { AiUnavailableError } from '@/lib/api/ai';
import { cn } from '@/lib/utils';

interface AiUnavailableNoticeProps {
  error: AiUnavailableError;
  onRetry?: () => void;
  className?: string;
}

/**
 * Shown in place of a result when the feature is on but the AI provider
 * could not produce a usable answer. Honest copy, one clear retry action.
 */
export function AiUnavailableNotice({ error, onRetry, className }: AiUnavailableNoticeProps) {
  const notConfigured = error.reason === 'not_configured';
  return (
    <div
      role="status"
      data-testid="ai-unavailable"
      className={cn(
        'flex flex-col items-center justify-center gap-ds-3 rounded-ds-lg border border-dashed border-ds-border px-ds-4 py-ds-8 text-center',
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-surface-sunken">
        <CloudOff className="size-5 text-ds-foreground-muted" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-medium text-ds-foreground">
          {notConfigured ? 'AI is not configured yet' : 'The AI could not produce a usable answer'}
        </p>
        <p className="mt-ds-1 max-w-sm text-xs text-ds-foreground-muted">
          {notConfigured
            ? 'The AI service is not connected for this workspace. Ask your administrator to enable it, then try again.'
            : 'The AI service replied, but the answer was incomplete. Nothing was saved. Please try again.'}
        </p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" className="gap-ds-2" onClick={onRetry}>
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}
