'use client';

import * as React from 'react';
import { Minus, Plus } from 'lucide-react';

import { Alert, AlertDescription, Button, Spinner, Tag } from '@/components/ui';
import { formatDisplayDateTime } from '@/lib/dates';
import {
  groupByDay, maxForExtra, MAX_QUANTITY, priceFor, quantityOf, sameSelection, selectionFrom, setQuantity, toChoices, totals,
  type Selection, type TripPage,
} from '@/lib/extras';
import { useI18n } from '@/lib/i18n';
import { brandStyle, money } from '@/app/(public)/book/[token]/_components/booking-ui';
import { tripRequest } from './use-trip';

interface ExtrasStepProps {
  page: TripPage;
  token: string;
  onSaved: (page: TripPage) => void;
}

/** Extras per day, per person: a quantity for each traveller, priced for their age band, locked once the cut-off has passed. */
export function ExtrasStep({ page, token, onSaved }: ExtrasStepProps) {
  const { t } = useI18n();
  const saved = React.useMemo(() => selectionFrom(page.passengers), [page.passengers]);
  const [selection, setSelection] = React.useState<Selection>(saved);
  const [message, setMessage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => setSelection(saved), [saved]);

  const sum = totals(selection, page.extras, page.passengers);
  const dirty = !sameSelection(selection, saved);
  const dayTitle = (day: number) => page.days.find((d) => d.day === day)?.title;

  async function save() {
    if (busy) return;
    setMessage(null);
    setBusy(true);
    const result = await tripRequest<TripPage>(token, 'PUT', '/extras', { choices: toChoices(selection) });
    setBusy(false);
    if (result.ok) return onSaved(result.data);
    const r = result.refusal;
    setMessage(r.status === 0 ? t('trip.error.network') : r.message || t('trip.error.generic'));
    // The page changed under the visitor (sold out, closed): show what is true now.
    if (r.code === 'EXTRA_FULL' || r.code === 'EXTRAS_CLOSED') {
      const fresh = await tripRequest<TripPage>(token, 'GET');
      if (fresh.ok) onSaved(fresh.data);
    }
  }

  if (page.extras.length === 0) {
    return <p className="rounded-xl border border-ds-border bg-ds-surface p-ds-4 text-sm text-ds-foreground-muted" data-testid="extras-none">{t('trip.extras.none')}</p>;
  }

  return (
    <div className="space-y-ds-4" data-testid="extras-step">
      <p className="text-sm text-ds-foreground-muted">{t('trip.extras.intro')}</p>
      {!page.extrasOpen && (
        <Alert role="status" data-testid="extras-locked">
          <AlertDescription>{t('trip.extras.locked')}</AlertDescription>
        </Alert>
      )}

      {groupByDay(page.extras).map((group) => (
        <section key={group.day ?? 'all'} className="space-y-ds-3" aria-label={group.day === null ? t('trip.extras.wholeTrip') : t('trip.extras.day', { day: group.day })}>
          <h3 className="text-base font-semibold">
            {group.day === null ? t('trip.extras.wholeTrip') : t('trip.extras.day', { day: group.day })}
            {group.day !== null && dayTitle(group.day) && <span className="ms-ds-2 font-normal text-ds-foreground-muted">{dayTitle(group.day)}</span>}
          </h3>
          {group.items.map((extra) => {
            const own = page.passengers.reduce((n, p) => n + (saved[p.ref]?.[extra.ref] ?? 0), 0);
            const chosen = page.passengers.reduce((n, p) => n + quantityOf(selection, p.ref, extra.ref), 0);
            const room = maxForExtra(extra, selection, own);
            return (
              <article key={extra.ref} className="space-y-ds-2 rounded-xl border border-ds-border bg-ds-surface p-ds-4" data-testid={`extra-${extra.title}`}>
                <header className="flex flex-wrap items-start justify-between gap-ds-2">
                  <div className="min-w-0">
                    <h4 className="font-semibold">{extra.title}</h4>
                    {extra.description && <p className="text-sm text-ds-foreground-muted">{extra.description}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-ds-2">
                    {extra.soldOut && <Tag tone="warning">{t('trip.extras.soldOut')}</Tag>}
                    {!extra.soldOut && extra.left !== null && <Tag tone="info">{t('trip.extras.left', { count: extra.left })}</Tag>}
                    {!extra.open && <Tag tone="warning">{t('trip.extras.closed')}</Tag>}
                  </div>
                </header>
                {extra.open && extra.cutoffAt && <p className="text-xs text-ds-foreground-muted">{t('trip.extras.closesAt', { when: formatDisplayDateTime(extra.cutoffAt) })}</p>}
                <ul className="divide-y divide-ds-border">
                  {page.passengers.map((p) => {
                    const q = quantityOf(selection, p.ref, extra.ref);
                    const price = priceFor(extra, p.bandKey);
                    const canAdd = extra.open && q < MAX_QUANTITY && (room === null || chosen < room);
                    const canRemove = extra.open && q > 0;
                    const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || t('trip.extras.traveller');
                    return (
                      <li key={p.ref} className="flex items-center justify-between gap-ds-3 py-ds-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{name}</p>
                          <p className="text-xs text-ds-foreground-muted">{price > 0 ? money(price, page) : t('trip.extras.free')}</p>
                        </div>
                        <div className="flex items-center gap-ds-2" role="group" aria-label={`${extra.title}: ${name}`}>
                          <Button type="button" size="icon-sm" variant="outline" aria-label={t('trip.extras.less', { name })} disabled={!canRemove} onClick={() => setSelection((s) => setQuantity(s, p.ref, extra.ref, q - 1))} data-testid={`less-${extra.title}-${p.firstName}`}>
                            <Minus aria-hidden="true" />
                          </Button>
                          <span className="w-6 text-center text-sm tabular-nums" aria-live="polite" data-testid={`qty-${extra.title}-${p.firstName}`}>{q}</span>
                          <Button type="button" size="icon-sm" variant="outline" aria-label={t('trip.extras.more', { name })} disabled={!canAdd} onClick={() => setSelection((s) => setQuantity(s, p.ref, extra.ref, q + 1))} data-testid={`more-${extra.title}-${p.firstName}`}>
                            <Plus aria-hidden="true" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-ds-3 rounded-xl border border-ds-border bg-ds-surface-sunken p-ds-4">
        <p className="text-sm font-semibold" data-testid="extras-total">{t('trip.extras.total', { amount: money(sum.total, page) })}</p>
        {message && <p role="alert" className="text-sm text-ds-danger" data-testid="extras-error">{message}</p>}
        {page.extrasOpen && (
          <Button type="button" onClick={() => void save()} disabled={busy || !dirty} style={brandStyle(page.agency.primaryColor)} data-testid="extras-save">
            {busy && <Spinner className="size-4" />}
            {t('trip.extras.save')}
          </Button>
        )}
      </div>
    </div>
  );
}
