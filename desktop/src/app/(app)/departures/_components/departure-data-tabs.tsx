'use client';

import * as React from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, Button, SectionCard, Skeleton, Spinner, Tag } from '@/components/ui';
import { departuresApi, type DepartureDetail, type RoomTypeDef } from '@/lib/api/departures';
import type { Price } from '@/lib/api/tours';
import { departureErrorText } from '@/lib/departures';
import { formatExactCurrency } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { CostsEditor, fromCostRows, toCostRows, type CostRow } from './costs-editor';
import { PricesEditor, fromPriceRows, toPriceRows, type PriceRow } from './prices-editor';
import { StopsEditor, fromStopRows, toStopRows, type StopRow } from './stops-editor';

interface TabProps {
  departure: DepartureDetail;
  canEdit: boolean;
  currency: string;
}

const editableStatus = (d: DepartureDetail) => !['cancelled', 'completed'].includes(d.status);

function SaveBar({ saving, onSave, label }: { saving: boolean; onSave: () => void; label: string }) {
  return (
    <div className="mt-ds-4">
      <Button onClick={onSave} disabled={saving} data-testid="tab-save">
        {saving && <Spinner className="size-4" />}
        {label}
      </Button>
    </div>
  );
}

/** Pickup and drop-off points of this departure (copied from the tour when it was created); changes stay on this departure. */
export function DepartureStopsTab({ departure, canEdit }: TabProps) {
  const t = useT();
  const [rows, setRows] = React.useState<StopRow[]>(() => toStopRows(departure.stops));
  const [saving, setSaving] = React.useState(false);
  const locked = !canEdit || !editableStatus(departure);

  async function save() {
    setSaving(true);
    try {
      setRows(toStopRows(await departuresApi.replaceStops(departure.id, fromStopRows(rows))));
      toast.success(t('departures.stopsTab.saved'));
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.stopsTab.failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title={t('departures.stopsTab.title')} description={t('departures.stopsTab.description')}>
      <StopsEditor value={rows} onChange={setRows} disabled={locked} />
      {!locked && <SaveBar saving={saving} onSave={() => void save()} label={t('departures.stopsTab.save')} />}
    </SectionCard>
  );
}

/** The prices that apply (the tour's, and this departure's own where it overrides one) and the overrides themselves. */
export function DeparturePricesTab({ departure, canEdit, currency, roomTypes }: TabProps & { roomTypes: readonly RoomTypeDef[] }) {
  const t = useT();
  const [effective, setEffective] = React.useState<Price[] | null>(null);
  const [rows, setRows] = React.useState<PriceRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const locked = !canEdit || !editableStatus(departure);

  const load = React.useCallback(async () => {
    try {
      const list = await departuresApi.getPrices(departure.id);
      setEffective(list);
      setRows(toPriceRows(list.filter((p) => p.source === 'departure')));
      setError(null);
    } catch (err) {
      setError(departureErrorText(err, t, 'departures.pricesTab.loadFailed'));
    }
  }, [departure.id, t]);

  React.useEffect(() => {
    void load();
    // Load once per departure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departure.id]);

  async function save() {
    setSaving(true);
    try {
      await departuresApi.replacePrices(departure.id, fromPriceRows(rows, currency));
      toast.success(t('departures.pricesTab.saved'));
      await load();
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.pricesTab.failed'));
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!effective) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-ds-4">
      <SectionCard title={t('departures.pricesTab.effective')} description={t('departures.pricesTab.effectiveDescription')}>
        {effective.length === 0 ? (
          <p className="text-sm text-ds-foreground-muted">{t('tours.prices.none')}</p>
        ) : (
          <ul className="divide-y divide-ds-border text-sm" data-testid="effective-prices">
            {effective.map((p, i) => (
              <li key={p.id ?? i} className="flex items-center justify-between gap-ds-3 py-ds-2">
                <span>{p.label || p.key}</span>
                <span className="flex items-center gap-ds-2">
                  <Tag tone={p.source === 'departure' ? 'primary' : 'neutral'}>{p.source === 'departure' ? t('departures.pricesTab.fromDeparture') : t('departures.pricesTab.fromTour')}</Tag>
                  <span className="tabular-nums">{formatExactCurrency(p.amount, p.currency ?? currency)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title={t('departures.pricesTab.overrides')} description={t('departures.pricesTab.overridesDescription')}>
        <PricesEditor value={rows} onChange={setRows} currency={currency} roomTypes={roomTypes} disabled={locked} />
        {!locked && <SaveBar saving={saving} onSave={() => void save()} label={t('departures.pricesTab.save')} />}
      </SectionCard>
    </div>
  );
}

/** What the departure costs the agency; the totals show the cost of a full departure next to the seats sold. */
export function DepartureCostsTab({ departure, canEdit, currency }: TabProps) {
  const t = useT();
  const [rows, setRows] = React.useState<CostRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const locked = !canEdit || !editableStatus(departure);

  React.useEffect(() => {
    let cancelled = false;
    departuresApi
      .getCosts(departure.id)
      .then((list) => !cancelled && setRows(toCostRows(list)))
      .catch((err) => !cancelled && setError(departureErrorText(err, t, 'departures.costs.loadFailed')));
    return () => {
      cancelled = true;
    };
    // Load once per departure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departure.id]);

  async function save() {
    if (!rows) return;
    setSaving(true);
    try {
      setRows(toCostRows(await departuresApi.replaceCosts(departure.id, fromCostRows(rows, currency))));
      toast.success(t('departures.costs.saved'));
    } catch (err) {
      toast.error(departureErrorText(err, t, 'departures.costs.failed'));
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!rows) return <Skeleton className="h-40 w-full" />;

  const seats = Math.max(1, departure.seats.capacity);
  const total = rows.reduce((n, r) => n + (r.kind === 'per_seat' ? r.amount * seats : r.amount), 0);
  return (
    <SectionCard title={t('departures.costs.title')} description={t('departures.costs.description')}>
      <CostsEditor value={rows} onChange={setRows} currency={currency} disabled={locked} />
      <p className="mt-ds-3 text-sm text-ds-foreground-muted" data-testid="costs-total">
        {t('departures.costs.total', { amount: formatExactCurrency(total, currency), seats: departure.seats.capacity })}
      </p>
      {!locked && <SaveBar saving={saving} onSave={() => void save()} label={t('departures.costs.save')} />}
    </SectionCard>
  );
}
