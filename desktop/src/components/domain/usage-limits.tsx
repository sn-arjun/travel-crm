'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionCard } from '@/components/ui/section-card';
import { useApiQuery } from '@/hooks/use-api';
import { usageApi, type UsageLine, type RequestUpgradeInput } from '@/lib/api/settings';
import { formatCurrency } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { BuyMoreDialog, useCanBuyAddons, type BuyMoreFocus } from './buy-more-dialog';

const BAR_COLOR: Record<UsageLine['state'], string> = {
  ok: 'bg-ds-primary',
  warning: 'bg-ds-warning',
  exhausted: 'bg-ds-danger',
};

const STATE_NOTE_KEY: Record<UsageLine['state'], string | null> = {
  ok: null,
  warning: 'usage.note.warning',
  exhausted: 'usage.note.exhausted',
};

/** R130: the two WhatsApp allowances (utility and marketing) are separate lines, each with its own label. */
const CHANNEL_LABEL_KEY: Record<string, string> = {
  ai_credits: 'usage.channel.ai_credits',
  sms: 'usage.channel.sms',
  whatsapp: 'usage.channel.whatsapp',
  whatsapp_marketing: 'usage.channel.whatsapp_marketing',
  otp: 'usage.channel.otp',
  call_minute: 'usage.channel.call_minute',
  email: 'usage.channel.email',
};

function UsageRow({ line, onRequest, onBuy, busy }: { line: UsageLine; onRequest: (input: RequestUpgradeInput) => void; onBuy?: (focus: BuyMoreFocus) => void; busy: boolean }) {
  const t = useT();
  const noteKey = STATE_NOTE_KEY[line.state];
  const note = noteKey ? t(noteKey) : null;
  const labelKey = CHANNEL_LABEL_KEY[line.key];
  const label = labelKey ? t(labelKey) : line.label;
  const cheapest = line.addons[0];
  const channel = line.channel as RequestUpgradeInput['channel'];
  return (
    <div className="space-y-ds-2" data-testid={`usage-row-${line.key}`} data-state={line.state}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-ds-foreground">{label}</span>
        <span className="text-ds-foreground-muted">
          {line.used.toLocaleString()} / {line.allowance.toLocaleString()}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-ds-full bg-ds-surface-sunken"
        role="progressbar"
        aria-label={t('usage.progress', { label })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={line.percent}
      >
        <div className={`h-full rounded-ds-full ${BAR_COLOR[line.state]}`} style={{ width: `${line.percent}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-ds-2">
        <p className={`text-xs ${line.state === 'ok' ? 'text-ds-foreground-muted' : line.state === 'warning' ? 'text-ds-warning-on-subtle' : 'text-ds-danger'}`}>
          {note ?? t('usage.renews', { date: line.periodEnd })}
          {cheapest && line.state !== 'ok' ? ` ${cheapest.name}: ${formatCurrency(cheapest.price, cheapest.currency)}.` : ''}
        </p>
        {line.state !== 'ok' && (
          <div className="flex gap-ds-2">
            {onBuy ? (
              <Button size="sm" variant="outline" disabled={busy} data-testid={`buy-more-${line.key}`} onClick={() => onBuy({ channel: line.channel })}>
                {t('usage.buyMore')}
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onRequest({ kind: 'top_up', channel })}>
                {t('usage.requestTopUp')}
              </Button>
            )}
            <Button size="sm" disabled={busy} onClick={() => onRequest({ kind: 'plan', channel })}>
              {t('usage.requestUpgrade')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Settings > Usage and limits: every metered channel and AI credits against the plan's monthly allowance. */
export function UsageLimits() {
  const t = useT();
  const { data, loading, error } = useApiQuery(() => usageApi.get(), []);
  const [busy, setBusy] = React.useState(false);
  const canBuy = useCanBuyAddons();
  const [buyFocus, setBuyFocus] = React.useState<BuyMoreFocus | null>(null);
  const overview = data && 'data' in data ? data.data : null;

  const request = async (input: RequestUpgradeInput) => {
    setBusy(true);
    try {
      await usageApi.requestUpgrade(input);
      toast.success(t('usage.requestSent'));
    } catch {
      toast.error(t('usage.requestFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard
      title={t('usage.title')}
      description={overview ? t('usage.description.plan', { plan: overview.plan, date: overview.periodEnd }) : t('usage.description.default')}
    >
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : error || !overview ? (
        <p className="text-sm text-ds-foreground-muted">{t('usage.error')}</p>
      ) : (
        <div className="grid gap-ds-6 md:grid-cols-2">
          {overview.lines.map((line) => (
            <UsageRow key={line.key} line={line} onRequest={request} onBuy={canBuy ? setBuyFocus : undefined} busy={busy} />
          ))}
        </div>
      )}
      {canBuy && <BuyMoreDialog open={buyFocus !== null} focus={buyFocus ?? undefined} onClose={() => setBuyFocus(null)} />}
    </SectionCard>
  );
}
