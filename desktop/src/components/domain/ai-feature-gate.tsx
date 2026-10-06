'use client';

import { AlertTriangle, Lock, Sparkles } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useAiFeature, useAiUsageCap } from '@/hooks/use-ai-feature';
import { cn } from '@/lib/utils';

interface AiFeatureGateProps {
  featureKey: string;
  children: React.ReactNode;
  /** Optional usage cap key to also check quota */
  capKey?: string;
  /** Fallback UI when feature is locked */
  fallback?: React.ReactNode;
  /** If true, show nothing when locked (instead of upgrade prompt) */
  hideWhenLocked?: boolean;
  className?: string;
}

const UPGRADE_HREF = '/settings/ai';

/**
 * Wraps AI-powered UI elements. Shows the children when the feature is enabled,
 * or shows a locked/upgrade state when not available. Children are not mounted
 * while locked, so the gated endpoint is never called.
 *
 * Usage:
 *   <AiFeatureGate featureKey="ai_lead_scoring">
 *     <LeadScoreWidget />
 *   </AiFeatureGate>
 */
export function AiFeatureGate({
  featureKey,
  children,
  capKey,
  fallback,
  hideWhenLocked = false,
  className,
}: AiFeatureGateProps) {
  const { enabled, loading, tier, plan } = useAiFeature(featureKey);
  const cap = useAiUsageCap(capKey || '');

  if (loading) {
    return <Skeleton className={cn('h-20 w-full', className)} />;
  }

  if (!enabled) {
    if (hideWhenLocked) return null;
    if (fallback) return <>{fallback}</>;

    const planName = tier === 'enterprise' ? 'Enterprise' : 'Pro';
    return (
      <div
        className={cn(
          'relative rounded-ds-lg border border-dashed border-ds-border bg-ds-surface-sunken p-ds-6 text-center',
          className,
        )}
      >
        <div className="flex flex-col items-center gap-ds-3">
          <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-surface">
            <Lock className="size-5 text-ds-foreground-muted" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-ds-foreground">{planName} feature</p>
            <p className="mt-ds-1 text-xs text-ds-foreground-muted">
              This AI feature requires the {planName} plan.
              {plan && (
                <span className="ml-ds-1">
                  You are on the <strong>{plan}</strong> plan.
                </span>
              )}
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="mt-ds-2 gap-ds-2">
            <Link href={UPGRADE_HREF}>
              <Sparkles className="size-3.5" aria-hidden="true" />
              Upgrade to {planName}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (capKey && cap.isExhausted) {
    return (
      <div
        className={cn(
          'relative rounded-ds-lg border border-dashed border-ds-warning bg-ds-warning-subtle p-ds-6 text-center',
          className,
        )}
      >
        <div className="flex flex-col items-center gap-ds-3">
          <div className="flex size-12 items-center justify-center rounded-ds-full bg-ds-surface">
            <AlertTriangle className="size-5 text-ds-warning" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-ds-warning-on-subtle">Quota used up</p>
            <p className="mt-ds-1 text-xs text-ds-warning-on-subtle">
              You&apos;ve used {cap.used} of {cap.limit} AI actions. Your quota resets automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Badge showing AI tier requirement. Used in feature labels.
 */
export function AiTierBadge({ tier }: { tier: 'pro' | 'enterprise' }) {
  return (
    <Tag tone={tier === 'enterprise' ? 'primary' : 'info'} className="ml-ds-2 uppercase">
      <Sparkles className="size-2.5" aria-hidden="true" />
      {tier}
    </Tag>
  );
}
