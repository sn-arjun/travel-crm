'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

export interface PriorityItem {
  id: string;
  icon?: React.ReactNode;
  title: string;
  description: string;
  urgency: 'high' | 'medium' | 'low';
  action: string;
}

interface AIDailyBriefingProps {
  userName?: string;
  /** Real counts from the caller. Omit to hide the summary row. */
  followUpsDue?: number;
  leadsNeedAttention?: number;
  paymentsOverdue?: number;
  priorityItems?: PriorityItem[];
  onAskAI?: () => void;
}

const URGENCY_TONE: Record<PriorityItem['urgency'], string> = {
  high: 'bg-ds-danger-subtle text-ds-danger-on-subtle',
  medium: 'bg-ds-warning-subtle text-ds-warning-on-subtle',
  low: 'bg-ds-info-subtle text-ds-info-on-subtle',
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

export function AIDailyBriefing({
  userName, followUpsDue, leadsNeedAttention, paymentsOverdue, priorityItems = [], onAskAI,
}: AIDailyBriefingProps) {
  const authName = useAuthStore((s) => s.user?.name);
  const displayName = userName ?? authName?.trim().split(' ')[0] ?? 'there';
  const stats = [
    { label: 'Follow-ups due', value: followUpsDue, tone: 'bg-ds-info-subtle text-ds-info-on-subtle' },
    { label: 'Leads need attention', value: leadsNeedAttention, tone: 'bg-ds-warning-subtle text-ds-warning-on-subtle' },
    { label: 'Payments overdue', value: paymentsOverdue, tone: 'bg-ds-danger-subtle text-ds-danger-on-subtle' },
  ].filter((s) => s.value !== undefined);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-ds-3">
        <p className="mb-ds-1 text-sm text-ds-foreground-muted">{greeting()}</p>
        <CardTitle className="text-2xl">{displayName}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-ds-5">
        {stats.length > 0 ? (
          <div className="grid grid-cols-3 gap-ds-3">
            {stats.map((s) => (
              <div key={s.label} className={cn('rounded-ds-lg p-ds-3', s.tone)}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs font-medium">{s.label}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="space-y-ds-2">
          <p className="text-xs font-semibold tracking-widest text-ds-foreground-muted uppercase">Top Priority</p>
          {priorityItems.length === 0 ? (
            <p className="py-ds-4 text-center text-xs text-ds-foreground-muted">Nothing urgent right now.</p>
          ) : (
            priorityItems.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-ds-3 rounded-ds-lg border border-ds-border bg-ds-surface-sunken p-ds-3">
                <div className="flex flex-1 gap-ds-3">
                  <div className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', URGENCY_TONE[item.urgency])}>
                    {item.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ds-foreground">{item.title}</p>
                    <p className="mt-0.5 text-xs text-ds-foreground-muted">{item.description}</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="shrink-0 px-ds-2 text-xs">
                  {item.action}
                  <ChevronRight className="ml-ds-1 size-3" aria-hidden="true" />
                </Button>
              </div>
            ))
          )}
        </div>

        {onAskAI ? (
          <Button onClick={onAskAI} variant="outline" className="w-full justify-center text-xs font-medium text-ds-primary">
            Ask AI for more insights
            <ChevronRight className="ml-ds-1 size-3" aria-hidden="true" />
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
