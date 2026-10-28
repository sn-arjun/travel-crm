'use client';

import { Lock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useFeatureGate } from '@/hooks/use-feature-gate';

const UPGRADE_HREF = '/settings/ai';

interface AiGateProps {
  children: React.ReactNode;
}

/**
 * Wraps the body of an AI Assistant page (the page header stays outside it).
 * Renders a skeleton while the plan is loading and an upgrade / limit prompt
 * instead of the body when gated - the page never fires its AI request
 * against a 403.
 */
export function AiGate({ children }: AiGateProps) {
  const { enabled, reason, loading } = useFeatureGate('ai_assistant');

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!enabled) {
    const capped = reason === 'cap_exceeded';
    return (
      <div
        data-testid="ai-feature-locked"
        className="flex flex-col items-center justify-center gap-ds-3 rounded-ds-lg border border-dashed border-ds-border py-ds-9 text-center"
      >
        <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-surface-sunken">
          <Lock className="size-5 text-ds-foreground-muted" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-ds-foreground">
            {capped ? "Today's AI quota is used up" : 'AI Assistant is not on your plan'}
          </p>
          <p className="mt-ds-1 text-xs text-ds-foreground-muted">
            {capped
              ? 'Your quota resets automatically tomorrow, or upgrade for a higher daily limit.'
              : 'Upgrade your plan to unlock AI-powered lead extraction, itineraries, and messaging.'}
          </p>
        </div>
        <Button asChild size="sm" className="gap-ds-2">
          <Link href={UPGRADE_HREF}>
            <Sparkles className="size-3.5" aria-hidden="true" />
            {capped ? 'Upgrade for more' : 'Upgrade to enable'}
          </Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
