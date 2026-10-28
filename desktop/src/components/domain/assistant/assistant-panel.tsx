'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { SuggestionFilter } from '@/lib/api/assistant';
import { useSuggestions } from '@/hooks/use-suggestions';
import { SuggestionCard } from './suggestion-card';

export interface AssistantPanelProps {
  /** Which record the panel is about. Pass the ids the screen already has. */
  leadId?: string;
  contactId?: string;
  entityType?: string;
  entityId?: string;
  /** Called after any suggestion was applied, dismissed or undone, so the host page can refetch. */
  onChanged?: () => void;
  /** How many completed actions to keep visible under the pending ones. */
  recentLimit?: number;
  className?: string;
}

/**
 * The assistant, embedded in a record's screen: what it suggests doing next and what it
 * has already done here. Renders nothing when it has nothing to say.
 */
export function AssistantPanel({ leadId, contactId, entityType, entityId, onChanged, recentLimit = 4, className }: AssistantPanelProps) {
  const filter = React.useMemo<SuggestionFilter>(
    () => ({ leadId, contactId, entityType, entityId, status: 'all', limit: 40 }),
    [leadId, contactId, entityType, entityId],
  );
  const hasTarget = !!(leadId || contactId || (entityType && entityId));
  const { suggestions, refresh } = useSuggestions(filter, hasTarget);

  const pending = suggestions.filter((s) => s.status === 'pending');
  // Most recently completed first, so what just happened is what stays visible.
  const recent = suggestions
    .filter((s) => s.status === 'applied' || s.status === 'auto_applied')
    .sort((a, b) => (b.appliedAt ?? b.createdAt).localeCompare(a.appliedAt ?? a.createdAt))
    .slice(0, recentLimit);
  if (pending.length === 0 && recent.length === 0) return null;

  const handleChanged = () => {
    void refresh();
    onChanged?.();
  };

  return (
    <section aria-label="Assistant" data-testid="assistant-panel" className={cn('flex flex-col gap-ds-3', className)}>
      <div className="flex items-center gap-ds-2">
        <Sparkles className="size-4 text-ds-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ds-foreground">Assistant</h2>
        {pending.length > 0 && (
          <span className="text-sm text-ds-foreground-muted">
            {pending.length} suggestion{pending.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-ds-3 xl:grid-cols-2">
        {pending.map((suggestion) => (
          <SuggestionCard key={suggestion.id} suggestion={suggestion} onChanged={handleChanged} />
        ))}
        {recent.map((suggestion) => (
          <SuggestionCard key={suggestion.id} suggestion={suggestion} onChanged={handleChanged} />
        ))}
      </div>
    </section>
  );
}
