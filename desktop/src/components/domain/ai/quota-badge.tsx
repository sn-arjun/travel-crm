'use client';

import { Gauge } from 'lucide-react';
import * as React from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { useAiUsageCap } from '@/hooks/use-ai-feature';
import { cn } from '@/lib/utils';

interface AiQuotaBadgeProps {
  capKey?: string;
  className?: string;
}

/**
 * Shows the remaining daily AI action quota. Renders nothing once the cap
 * itself resolves as absent — some plans aren't metered.
 */
export function AiQuotaBadge({ capKey = 'ai_requests', className }: AiQuotaBadgeProps) {
  const { loading, limit, remaining, isExhausted } = useAiUsageCap(capKey);

  if (loading) return <Skeleton className={cn('h-6 w-28', className)} />;
  if (!limit) return null;

  return (
    <Tag tone={isExhausted ? 'danger' : remaining <= limit * 0.2 ? 'warning' : 'neutral'} className={className}>
      <Gauge className="size-3" aria-hidden="true" />
      {isExhausted ? 'Daily AI quota used up' : `${remaining} / ${limit} AI actions left today`}
    </Tag>
  );
}
