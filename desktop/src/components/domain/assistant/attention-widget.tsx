'use client';

import * as React from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';

import { SectionCard } from '@/components/ui/section-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSuggestions } from '@/hooks/use-suggestions';
import { suggestionHref } from './suggestion-target';

const SHOWN = 5;

/**
 * Dashboard card: what the assistant has waiting for the signed-in user.
 * Each row opens the record where the suggestion can be read and applied.
 */
export function AttentionWidget() {
  const { suggestions, loading } = useSuggestions({ status: 'pending', limit: 50 });
  const actionable = suggestions.filter((s) => s.canApply);

  return (
    <SectionCard
      title="Needs your attention"
      description={
        loading
          ? undefined
          : actionable.length === 0
            ? 'Nothing is waiting. The assistant will list its suggestions here.'
            : `${actionable.length} suggestion${actionable.length === 1 ? '' : 's'} from the assistant`
      }
      actions={
        <Link href="/assistant" className="inline-flex items-center gap-ds-1 text-sm font-medium text-ds-primary hover:underline">
          Open assistant
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-ds-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        actionable.length > 0 && (
          <ul className="flex flex-col divide-y divide-ds-border" data-testid="attention-list">
            {actionable.slice(0, SHOWN).map((s) => (
              <li key={s.id}>
                <Link href={suggestionHref(s)} className="flex items-start gap-ds-3 py-ds-2 hover:bg-ds-surface-sunken">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-ds-primary" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-ds-foreground">{s.title}</span>
                    {s.reason && <span className="truncate text-xs text-ds-foreground-muted">{s.reason}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
    </SectionCard>
  );
}
