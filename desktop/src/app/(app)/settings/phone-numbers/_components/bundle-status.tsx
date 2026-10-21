'use client';

import * as React from 'react';
import { CheckCircle2, Clock, FileText, Hourglass, ShieldCheck, XCircle } from 'lucide-react';

import { Badge, Button } from '@/components/ui';
import { useT } from '@/lib/i18n';
import type { RegulatoryState } from '@/lib/api/voip';

/** The order the states are reached in (design 5.6); a rejection can happen at either review. */
export const BUNDLE_STATES: RegulatoryState[] = ['none', 'submitted', 'platform_review', 'provider_review', 'approved', 'rejected'];

const TONE: Record<RegulatoryState, string> = {
  none: 'bg-ds-surface-sunken text-ds-foreground-muted',
  submitted: 'bg-ds-warning-subtle text-ds-warning-on-subtle',
  platform_review: 'bg-ds-warning-subtle text-ds-warning-on-subtle',
  provider_review: 'bg-ds-warning-subtle text-ds-warning-on-subtle',
  approved: 'bg-ds-success-subtle text-ds-success-on-subtle',
  rejected: 'bg-ds-danger-subtle text-ds-danger-on-subtle',
};

const ICON: Record<RegulatoryState, React.ComponentType<{ className?: string }>> = {
  none: FileText,
  submitted: Hourglass,
  platform_review: ShieldCheck,
  provider_review: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
};

export interface BundleStatusProps {
  state: RegulatoryState;
  /** Why the set was rejected, by the platform or the provider. */
  failureReason?: string | null;
  /** The next step when nothing has been sent yet. */
  onStart?: () => void;
  /** The next step after a rejection. */
  onResubmit?: () => void;
}

/**
 * Where an agency's number documents stand, with the next step (R141-1). Every state of design 5.6 has a chip and a
 * sentence; no duration is promised for the provider's review.
 */
export function BundleStatus({ state, failureReason, onStart, onResubmit }: BundleStatusProps) {
  const t = useT();
  const Icon = ICON[state];
  return (
    <div className="flex flex-col gap-ds-2" data-testid="bundle-status" data-state={state}>
      <div className="flex flex-wrap items-center gap-ds-2">
        <Badge className={`gap-ds-1 text-xs ${TONE[state]}`} data-testid="bundle-chip">
          <Icon className="size-3" aria-hidden="true" />
          {t(`calling.bundle.${state}.chip`)}
        </Badge>
        <span className="text-sm text-ds-foreground-muted" data-testid="bundle-message">
          {t(`calling.bundle.${state}.message`)}
        </span>
      </div>
      {state === 'rejected' && (
        <p className="text-sm text-ds-danger" data-testid="bundle-reason">
          {failureReason ? t('calling.bundle.rejected.reason', { reason: failureReason }) : t('calling.bundle.rejected.noReason')}
        </p>
      )}
      {state === 'none' && onStart && (
        <div>
          <Button size="sm" variant="outline" onClick={onStart} data-testid="bundle-start">
            {t('calling.bundle.none.action')}
          </Button>
        </div>
      )}
      {state === 'rejected' && onResubmit && (
        <div>
          <Button size="sm" onClick={onResubmit} data-testid="bundle-resubmit">
            {t('calling.bundle.rejected.action')}
          </Button>
        </div>
      )}
    </div>
  );
}
