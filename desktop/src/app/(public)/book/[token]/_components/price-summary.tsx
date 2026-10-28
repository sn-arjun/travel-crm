'use client';

import * as React from 'react';

import { mayWaitlist, type PartyMember, type PublicPage, type Quote } from '@/lib/booking-form';
import { useT } from '@/lib/i18n';
import { money, useBandName } from './booking-ui';

interface PriceSummaryProps {
  page: PublicPage;
  party: readonly PartyMember[];
  quote: Quote;
}

/** The price as the invoice will carry it: bands, room supplements and the seat surcharge, the total and the deposit due now. */
export function PriceSummary({ page, party, quote }: PriceSummaryProps) {
  const t = useT();
  const bandName = useBandName();
  const roomLabel = (key: string) => page.prices.roomSupplements.find((r) => r.key === key)?.label ?? key;
  const label = (line: Quote['lines'][number]) => {
    if (line.kind === 'band') {
      const band = page.prices.bands.find((b) => b.key === line.key);
      return t('booking.summary.band', { count: line.quantity, band: band ? bandName(band) : line.key });
    }
    if (line.kind === 'room') return t('booking.summary.room', { count: line.quantity, room: roomLabel(line.key) });
    return t('booking.summary.seat', { count: line.quantity });
  };

  return (
    <section className="space-y-ds-2 rounded-xl border border-ds-border bg-ds-surface p-ds-4" aria-labelledby="summary-title" data-testid="price-summary">
      <h2 id="summary-title" className="text-lg font-semibold">{t('booking.summary.title')}</h2>
      <p className="text-sm text-ds-foreground-muted">{t('booking.party.size', { count: party.length })}</p>
      {quote.priced ? (
        <>
          <ul className="divide-y divide-ds-border text-sm">
            {quote.lines.map((l) => (
              <li key={`${l.kind}-${l.key}`} className="flex justify-between gap-ds-3 py-1.5">
                <span>{label(l)}</span>
                <span className="tabular-nums">{money(l.quantity * l.unit, page)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between border-t border-ds-border pt-ds-2 text-base font-semibold" data-testid="summary-total">
            <span>{t('booking.summary.total')}</span>
            <span className="tabular-nums">{money(quote.total, page)}</span>
          </p>
          {quote.deposit > 0 && (
            <>
              <p className="flex justify-between text-sm" data-testid="summary-deposit">
                <span>{t('booking.summary.deposit')}</span>
                <span className="tabular-nums font-medium">{money(quote.deposit, page)}</span>
              </p>
              <p className="flex justify-between text-sm text-ds-foreground-muted">
                <span>{t('booking.summary.balance')}</span>
                <span className="tabular-nums">{money(Math.max(0, quote.total - quote.deposit), page)}</span>
              </p>
            </>
          )}
        </>
      ) : (
        <p className="text-sm text-ds-foreground-muted">{t('booking.summary.noPrices')}</p>
      )}
      {mayWaitlist(page.seats, party.length) ? (
        <p className="rounded-md bg-ds-warning-subtle p-ds-2 text-xs text-ds-warning-on-subtle" data-testid="summary-waitlist-note">{t('booking.summary.waitlistNote')}</p>
      ) : (
        <p className="text-xs text-ds-foreground-muted">{t('booking.summary.holdNote', { hours: page.holdHours })}</p>
      )}
    </section>
  );
}
