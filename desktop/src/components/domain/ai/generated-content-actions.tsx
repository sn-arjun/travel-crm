'use client';

import { Check, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { aiApi } from '@/lib/api/ai';
import { cn } from '@/lib/utils';

interface GeneratedContentActionsProps {
  /** Id returned by the generating endpoint's `contentId` field, if any. */
  contentId?: string;
  onAccept?: () => void;
  className?: string;
}

/**
 * Accept / reject / feedback controls for AI-generated drafts. Degrades to
 * nothing when the endpoint didn't return a contentId (e.g. stubbed provider).
 */
export function GeneratedContentActions({ contentId, onAccept, className }: GeneratedContentActionsProps) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [decided, setDecided] = React.useState<'accepted' | 'rejected' | null>(null);

  if (!contentId) return null;

  const run = async (action: string, fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(action);
    try {
      await fn();
      after?.();
    } catch {
      toast.error('Could not record feedback');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn('flex items-center gap-ds-2', className)}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy !== null || decided !== null}
        onClick={() =>
          run('accept', () => aiApi.generated.accept(contentId), () => {
            setDecided('accepted');
            onAccept?.();
          })
        }
        className="gap-ds-2"
      >
        <Check className="size-3.5" aria-hidden="true" />
        {decided === 'accepted' ? 'Accepted' : 'Accept'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy !== null || decided !== null}
        onClick={() => run('reject', () => aiApi.generated.reject(contentId), () => setDecided('rejected'))}
        className="gap-ds-2"
      >
        <X className="size-3.5" aria-hidden="true" />
        {decided === 'rejected' ? 'Rejected' : 'Reject'}
      </Button>
      <span className="mx-ds-1 h-4 w-px bg-ds-border" aria-hidden="true" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Good result"
        disabled={busy !== null}
        onClick={() =>
          run('feedback-up', () => aiApi.generated.feedback(contentId, { feedback: 'positive' }), () =>
            toast.success('Thanks for the feedback'),
          )
        }
      >
        <ThumbsUp className="size-3.5" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Poor result"
        disabled={busy !== null}
        onClick={() =>
          run('feedback-down', () => aiApi.generated.feedback(contentId, { feedback: 'negative' }), () =>
            toast.success('Thanks for the feedback'),
          )
        }
      >
        <ThumbsDown className="size-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}
