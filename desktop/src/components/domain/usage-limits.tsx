'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionCard } from '@/components/ui/section-card';
import { useApiQuery } from '@/hooks/use-api';
import { usageApi, type UsageLine, type RequestUpgradeInput } from '@/lib/api/settings';
import { formatCurrency } from '@/lib/utils';

const BAR_COLOR: Record<UsageLine['state'], string> = {
  ok: 'bg-ds-primary',
  warning: 'bg-ds-warning',
  exhausted: 'bg-ds-danger',
};

const STATE_NOTE: Record<UsageLine['state'], string | null> = {
  ok: null,
  warning: '80% used. Consider requesting more before it runs out.',
  exhausted: 'Used up. New sends are refused until the allowance renews.',
};

function UsageRow({ line, onRequest, busy }: { line: UsageLine; onRequest: (input: RequestUpgradeInput) => void; busy: boolean }) {
  const note = STATE_NOTE[line.state];
  const cheapest = line.addons[0];
  const channel = line.channel as RequestUpgradeInput['channel'];
  return (
    <div className="space-y-ds-2" data-testid={`usage-row-${line.key}`} data-state={line.state}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-ds-foreground">{line.label}</span>
        <span className="text-ds-foreground-muted">
          {line.used.toLocaleString()} / {line.allowance.toLocaleString()}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-ds-full bg-ds-surface-sunken"
        role="progressbar"
        aria-label={`${line.label} used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={line.percent}
      >
        <div className={`h-full rounded-ds-full ${BAR_COLOR[line.state]}`} style={{ width: `${line.percent}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-ds-2">
        <p className={`text-xs ${line.state === 'ok' ? 'text-ds-foreground-muted' : line.state === 'warning' ? 'text-ds-warning-on-subtle' : 'text-ds-danger'}`}>
          {note ?? `Renews ${line.periodEnd}`}
          {cheapest && line.state !== 'ok' ? ` ${cheapest.name}: ${formatCurrency(cheapest.price, cheapest.currency)}.` : ''}
        </p>
        {line.state !== 'ok' && (
          <div className="flex gap-ds-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onRequest({ kind: 'top_up', channel })}>
              Request top-up
            </Button>
            <Button size="sm" disabled={busy} onClick={() => onRequest({ kind: 'plan', channel })}>
              Request upgrade
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Settings > Usage and limits: every metered channel and AI credits against the plan's monthly allowance. */
export function UsageLimits() {
  const { data, loading, error } = useApiQuery(() => usageApi.get(), []);
  const [busy, setBusy] = React.useState(false);
  const overview = data && 'data' in data ? data.data : null;

  const request = async (input: RequestUpgradeInput) => {
    setBusy(true);
    try {
      await usageApi.requestUpgrade(input);
      toast.success('Request sent. We will get back to you shortly.');
    } catch {
      toast.error('Could not send the request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title="Usage and limits"
      description={overview ? `Plan ${overview.plan}. Allowances renew on ${overview.periodEnd}.` : 'Your monthly allowances'}
    >
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : error || !overview ? (
        <p className="text-sm text-ds-foreground-muted">Usage could not be loaded. Only administrators can see it.</p>
      ) : (
        <div className="grid gap-ds-6 md:grid-cols-2">
          {overview.lines.map((line) => (
            <UsageRow key={line.key} line={line} onRequest={request} busy={busy} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
