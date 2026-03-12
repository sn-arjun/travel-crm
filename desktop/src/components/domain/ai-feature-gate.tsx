'use client';

import * as React from 'react';
import { useAiFeature, useAiUsageCap } from '@/hooks/use-ai-feature';
import { cn } from '@/lib/utils';
import { Lock, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

/**
 * Wraps AI-powered UI elements. Shows the children when the feature is enabled,
 * or shows a locked/upgrade state when not available.
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

  // Loading state
  if (loading) {
    return (
      <div className={cn('animate-pulse rounded-lg bg-muted/50 p-4', className)}>
        <div className="h-4 w-32 rounded bg-muted" />
      </div>
    );
  }

  // Feature not enabled — show locked state
  if (!enabled) {
    if (hideWhenLocked) return null;
    if (fallback) return <>{fallback}</>;

    return (
      <div className={cn(
        'relative rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center',
        className,
      )}>
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {tier === 'enterprise' ? 'Enterprise Feature' : 'Pro Feature'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This AI feature requires the {tier === 'enterprise' ? 'Enterprise' : 'Pro'} plan.
              {plan && <span className="ml-1">You are on the <strong>{plan}</strong> plan.</span>}
            </p>
          </div>
          <Button variant="outline" size="sm" className="mt-2 gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Upgrade to {tier === 'enterprise' ? 'Enterprise' : 'Pro'}
          </Button>
        </div>
      </div>
    );
  }

  // Quota exhausted
  if (capKey && cap.isExhausted) {
    return (
      <div className={cn(
        'relative rounded-lg border border-dashed border-amber-500/30 bg-amber-50/10 p-6 text-center dark:bg-amber-950/10',
        className,
      )}>
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Quota Exhausted</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You've used {cap.used} of {cap.limit} AI actions.
              Your quota resets automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Feature enabled and quota available — render children
  return <>{children}</>;
}

/**
 * Badge showing AI tier requirement. Used in feature labels.
 */
export function AiTierBadge({ tier }: { tier: 'pro' | 'enterprise' }) {
  return (
    <span className={cn(
      'ml-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
      tier === 'enterprise'
        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    )}>
      <Sparkles className="h-2.5 w-2.5" />
      {tier}
    </span>
  );
}
