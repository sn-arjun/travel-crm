'use client';

import * as React from 'react';
import { Minus, Plus } from 'lucide-react';

import { Button } from '@/components/ui';
import { bandCounts, setBandCount, type PartyMember, type PublicPage } from '@/lib/booking-form';
import { useT } from '@/lib/i18n';
import { money, useBandAges, useBandName } from './booking-ui';

interface PartyBuilderProps {
  page: PublicPage;
  party: readonly PartyMember[];
  onChange: (party: PartyMember[]) => void;
}

/** "How many adults, how many children": one row per age band with its price, a stepper and the live count of the party. */
export function PartyBuilder({ page, party, onChange }: PartyBuilderProps) {
  const t = useT();
  const bandName = useBandName();
  const bandAges = useBandAges();
  const counts = bandCounts(party);
  const order = page.prices.bands.slice().sort((a, b) => b.minAge - a.minAge).map((b) => b.key);
  const top = order[0];
  const atLimit = party.length >= page.maxParty;

  function set(band: string, count: number) {
    const next = setBandCount(party, band, count, order, page.maxParty);
    // The party always has someone in it, and the first person is an adult.
    onChange(next.length === 0 && top ? setBandCount(next, top, 1, order, page.maxParty) : next);
  }

  return (
    <section className="space-y-ds-3" aria-labelledby="party-title" data-testid="party-builder">
      <div>
        <h2 id="party-title" className="text-lg font-semibold">{t('booking.party.title')}</h2>
        <p className="text-sm text-ds-foreground-muted">{t('booking.party.description')}</p>
      </div>
      <ul className="divide-y divide-ds-border rounded-xl border border-ds-border bg-ds-surface">
        {page.prices.bands.map((band) => {
          const name = bandName(band);
          const count = counts[band.key] ?? 0;
          const minimum = band.key === top && party.length === count ? 1 : 0;
          return (
            <li key={band.key} className="flex items-center justify-between gap-ds-3 p-ds-3" data-testid={`band-row-${band.key}`}>
              <div className="min-w-0">
                <p className="font-medium">{name}</p>
                <p className="text-xs text-ds-foreground-muted">
                  {bandAges(band)}
                  {band.amount !== null && ` · ${band.amount > 0 ? t('booking.band.each', { price: money(band.amount, page) }) : t('booking.band.free')}`}
                </p>
              </div>
              <div className="flex items-center gap-ds-2">
                <Button type="button" variant="outline" size="icon" aria-label={t('booking.party.remove', { band: name })} disabled={count <= minimum} onClick={() => set(band.key, count - 1)} data-testid={`band-minus-${band.key}`}>
                  <Minus aria-hidden="true" />
                </Button>
                <span className="w-8 text-center text-lg font-semibold tabular-nums" role="status" aria-label={t('booking.party.count', { band: name })} data-testid={`band-count-${band.key}`}>{count}</span>
                <Button type="button" variant="outline" size="icon" aria-label={t('booking.party.add', { band: name })} disabled={atLimit} onClick={() => set(band.key, count + 1)} data-testid={`band-plus-${band.key}`}>
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-ds-foreground-muted">
        {t('booking.party.size', { count: party.length })}
        {atLimit && ` · ${t('booking.party.limit', { max: page.maxParty })}`}
      </p>
    </section>
  );
}
