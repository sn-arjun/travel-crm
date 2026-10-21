'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarRange } from 'lucide-react';
import { toast } from 'sonner';

import { SectionCard, Switch } from '@/components/ui';
import { publishGroupToursSettings, useGroupTours } from '@/hooks/use-group-tours';
import { departuresApi } from '@/lib/api/departures';
import { departureErrorText } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { useAuthStore } from '@/stores/auth-store';

/**
 * The one card agencies see on the Settings hub for group tours: "Sell fixed-departure group tours?" with the switch while it
 * is off, and a link to Settings > Group tours. Hidden when the plan does not have the feature, so a custom-trips agency sees
 * nothing about it.
 */
export function GroupToursHubCard() {
  const t = useT();
  const { available, loading, settings, enabled } = useGroupTours();
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin');
  const [busy, setBusy] = React.useState(false);

  if (loading || !available) return null;

  async function turnOn() {
    setBusy(true);
    try {
      publishGroupToursSettings(await departuresApi.saveSettings({ enabled: true }));
      toast.success(t('groupTours.hub.switchedOn'));
    } catch (err) {
      toast.error(departureErrorText(err, t, 'groupTours.page.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t('groupTours.hub.title')}>
      <div className="flex flex-wrap items-start justify-between gap-ds-4 rounded-ds-md border border-ds-border bg-ds-surface p-ds-4" data-testid="group-tours-hub-card">
        <Link href="/settings/group-tours" className="flex min-w-0 flex-1 items-start gap-ds-3">
          <CalendarRange className="mt-0.5 size-5 text-ds-primary" aria-hidden="true" />
          <span className="min-w-0">
            <span className="flex items-center gap-ds-1 text-sm font-medium text-ds-foreground">
              {enabled ? t('groupTours.hub.cardOn') : t('groupTours.hub.cardOff')}
              <ArrowUpRight className="size-3 text-ds-foreground-subtle" aria-hidden="true" />
            </span>
            <span className="mt-ds-1 block text-xs text-ds-foreground-muted">{enabled ? t('groupTours.hub.descriptionOn') : t('groupTours.hub.descriptionOff')}</span>
          </span>
        </Link>
        {!enabled && settings && (
          <label className="flex items-center gap-ds-2 text-sm">
            <Switch checked={false} disabled={!isAdmin || busy} onCheckedChange={() => void turnOn()} aria-label={t('groupTours.hub.switchLabel')} data-testid="group-tours-hub-switch" />
            {t('groupTours.hub.switchLabel')}
          </label>
        )}
      </div>
    </SectionCard>
  );
}
