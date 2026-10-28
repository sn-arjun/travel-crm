'use client';

import * as React from 'react';
import { X, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  priority: 'high' | 'medium' | 'low';
  action: string;
}

interface AIRecommendationsProps {
  /** Real recommendations from the caller; an empty list shows the "all caught up" state. */
  recommendations?: Recommendation[];
  onDismiss?: (id: string) => void;
  onAction?: (id: string, action: string) => void;
}

const PRIORITY_BADGE: Record<Recommendation['priority'], string> = {
  high: 'border-ds-danger bg-ds-danger-subtle text-ds-danger-on-subtle',
  medium: 'border-ds-warning bg-ds-warning-subtle text-ds-warning-on-subtle',
  low: 'border-ds-info bg-ds-info-subtle text-ds-info-on-subtle',
};

const PRIORITY_ICON: Record<Recommendation['priority'], string> = {
  high: 'text-ds-danger',
  medium: 'text-ds-warning',
  low: 'text-ds-info',
};

export function AIRecommendations({ recommendations = [], onDismiss, onAction }: AIRecommendationsProps) {
  const [dismissedIds, setDismissedIds] = React.useState<Set<string>>(new Set());

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
    onDismiss?.(id);
  };

  const visible = recommendations.filter((rec) => !dismissedIds.has(rec.id));

  return (
    <Card>
      <CardHeader className="pb-ds-3">
        <CardTitle className="text-lg">AI Recommendations</CardTitle>
        <p className="mt-ds-1 text-xs text-ds-foreground-muted">{visible.length} actionable items</p>
      </CardHeader>

      <CardContent className="space-y-ds-3">
        {visible.length === 0 ? (
          <div className="py-ds-8 text-center">
            <CheckCircle2 className="mx-auto mb-ds-2 size-8 text-ds-success" aria-hidden="true" />
            <p className="text-sm font-medium text-ds-foreground">All caught up!</p>
            <p className="mt-ds-1 text-xs text-ds-foreground-muted">Nothing needs your attention right now.</p>
          </div>
        ) : (
          visible.map((rec) => (
            <div key={rec.id} className="space-y-ds-2 rounded-ds-lg border border-ds-border bg-ds-surface p-ds-3 transition-shadow hover:shadow-sm">
              <div className="flex items-start justify-between gap-ds-2">
                <div className="flex flex-1 items-start gap-ds-2">
                  {rec.icon ? <div className={cn('mt-0.5 shrink-0', PRIORITY_ICON[rec.priority])}>{rec.icon}</div> : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ds-foreground">{rec.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ds-foreground-muted">{rec.description}</p>
                  </div>
                </div>
                <Button onClick={() => handleDismiss(rec.id)} variant="ghost" size="icon-sm" className="shrink-0" aria-label="Dismiss recommendation">
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </div>
              <div className="flex items-center justify-between border-t border-ds-border pt-ds-2">
                <Badge variant="outline" className={cn('text-xs', PRIORITY_BADGE[rec.priority])}>
                  {rec.priority.charAt(0).toUpperCase() + rec.priority.slice(1)} Priority
                </Badge>
                <Button onClick={() => onAction?.(rec.id, rec.action)} size="sm" variant="ghost" className="px-ds-2 text-xs text-ds-primary">
                  {rec.action}
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
