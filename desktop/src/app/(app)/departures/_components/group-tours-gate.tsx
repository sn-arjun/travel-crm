'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarRange, Lock } from 'lucide-react';

import { PageContainer } from '@/components/layout/page-container';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { useGroupTours } from '@/hooks/use-group-tours';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface GroupToursGateProps {
  children: React.ReactNode;
  /** Settings > Group tours must be reachable while the agency switch is still off (that is where it is turned on). */
  requireEnabled?: boolean;
}

/**
 * Renders its children only when group departures are available on the plan and (unless told otherwise) switched on by the
 * agency. Until both are known it shows a skeleton, never a gate, and the children are not mounted: so nothing behind it
 * calls the API while the feature is off.
 */
export function GroupToursGate({ children, requireEnabled = true }: GroupToursGateProps) {
  const t = useT();
  const { available, enabled, loading, upgradeHref } = useGroupTours();

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </PageContainer>
    );
  }

  if (!available) {
    return (
      <PageContainer>
        <EmptyState
          icon={<Lock className="size-8" aria-hidden="true" />}
          title={t('groupTours.gate.notInPlanTitle')}
          description={t('groupTours.gate.notInPlanDescription')}
          action={
            <Link href={upgradeHref} className={cn(buttonVariants({ variant: 'outline' }))}>
              {t('groupTours.gate.viewPlan')}
            </Link>
          }
        />
      </PageContainer>
    );
  }

  if (requireEnabled && !enabled) {
    return (
      <PageContainer>
        <EmptyState
          icon={<CalendarRange className="size-8" aria-hidden="true" />}
          title={t('groupTours.gate.offTitle')}
          description={t('groupTours.gate.offDescription')}
          action={
            <Link href="/settings/group-tours" className={cn(buttonVariants())}>
              {t('groupTours.gate.openSettings')}
            </Link>
          }
        />
      </PageContainer>
    );
  }

  return <>{children}</>;
}
