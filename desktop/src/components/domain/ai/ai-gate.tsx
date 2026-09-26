'use client';

import { Lock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAiSettings } from '@/hooks/use-ai-feature';

interface AiGateProps {
  children: React.ReactNode;
}

// Plans without the ai_assistant umbrella feature — mirrors backend
// PLAN_DEFAULTS (backend/src/middleware/feature-gate.ts). The `ai_assistant`
// key itself never appears in `aiFeatures` (that array only carries the 22
// granular Pro/Enterprise toggles), so gating must be derived from `plan`.
const PLANS_WITHOUT_AI_ASSISTANT = new Set(['starter', 'basic']);
const UPGRADE_HREF = '/settings/billing';

/**
 * Wraps a full AI Assistant page. Renders a skeleton while the plan is
 * loading and an upgrade/limit prompt instead of the page when gated — the
 * page never fires its AI request against a 403.
 */
export function AiGate({ children }: AiGateProps) {
  const { plan, usageCaps, loading } = useAiSettings();
  const cap = usageCaps.ai_requests;
  const capExhausted = !!cap && cap.remaining <= 0;
  const enabled = !loading && !!plan && !PLANS_WITHOUT_AI_ASSISTANT.has(plan) && !capExhausted;
  const reason = capExhausted ? 'cap_exceeded' : 'not_in_plan';
  const upgradeHref = UPGRADE_HREF;

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center gap-ds-3 rounded-ds-lg border border-dashed border-ds-border py-ds-9 text-center">
        <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-surface-sunken">
          <Lock className="size-5 text-ds-foreground-muted" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-medium text-ds-foreground">
            {reason === 'cap_exceeded' ? "Today's AI quota is used up" : 'AI Assistant is not on your plan'}
          </p>
          <p className="mt-ds-1 text-xs text-ds-foreground-muted">
            {reason === 'cap_exceeded'
              ? 'Your quota resets automatically tomorrow, or upgrade for a higher daily limit.'
              : 'Upgrade your plan to unlock AI-powered lead extraction, itineraries, and messaging.'}
          </p>
        </div>
        <Button asChild size="sm" className="gap-ds-2">
          <Link href={upgradeHref}>
            <Sparkles className="size-3.5" aria-hidden="true" />
            {reason === 'cap_exceeded' ? 'Upgrade for more' : 'Upgrade to enable'}
          </Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
