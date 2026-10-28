'use client';

import { Lock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { PageContainer } from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useFeatureGate, type GatedFeature } from '@/hooks/use-feature-gate';

const UPGRADE_HREF = '/settings/ai';

interface AiFeaturePageGateProps {
  feature: GatedFeature;
  /** Page title, shown while gated so the page always has one h1. */
  title: string;
  /** Short feature name used in the lock copy, e.g. "AI Intelligence". */
  featureName: string;
  /** What the plan unlocks, e.g. "AI-powered lead scoring". */
  benefit: string;
  children: React.ReactNode;
}

/**
 * Wraps a whole AI page. Skeleton while the plan loads, an upgrade / quota
 * state when gated, and the page itself otherwise. The page content never
 * mounts while gated, so no AI endpoint is called and no 403 can surface.
 */
export function AiFeaturePageGate({ feature, title, featureName, benefit, children }: AiFeaturePageGateProps) {
  const { enabled, reason, loading } = useFeatureGate(feature);

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  if (!enabled) {
    const capped = reason === 'cap_exceeded';
    return (
      <PageContainer>
        <PageHeader title={title} />
        <div
          data-testid="ai-feature-locked"
          className="flex flex-col items-center justify-center gap-ds-3 rounded-ds-lg border border-dashed border-ds-border py-ds-9 text-center"
        >
          <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-surface-sunken">
            <Lock className="size-5 text-ds-foreground-muted" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-ds-foreground">
              {capped ? `Today's ${featureName} quota is used up` : `${featureName} is not on your plan`}
            </p>
            <p className="mt-ds-1 text-xs text-ds-foreground-muted">
              {capped
                ? 'Your quota resets automatically tomorrow, or upgrade for a higher daily limit.'
                : `Upgrade your plan to unlock ${benefit}.`}
            </p>
          </div>
          <Button asChild size="sm" className="gap-ds-2">
            <Link href={UPGRADE_HREF}>
              <Sparkles className="size-3.5" aria-hidden="true" />
              {capped ? 'Upgrade for more' : 'Upgrade to enable'}
            </Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  return <>{children}</>;
}
