'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button, Checkbox, CurrencyInput, Input, Label } from '@/components/ui';
import { unwrapEntity } from '@/lib/api/envelope';
import { ageBandsApi } from '@/lib/api/itineraries';
import type { TourExtra } from '@/lib/api/tours';
import { bandLabel } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { RateCardCombobox, SupplierCombobox } from '../../departures/_components/relation-pickers';

export interface ExtraRow extends TourExtra {
  _key: string;
}

let counter = 0;
const newKey = () => `x${Date.now().toString(36)}${(counter++).toString(36)}`;

export const toExtraRows = (list: readonly TourExtra[]): ExtraRow[] => list.map((x) => ({ ...x, _key: x.id ?? newKey() }));

/** Band prices that are set (a number of 0 or more), or null when there are none. */
function cleanBandPrices(prices: Record<string, number> | null | undefined): Record<string, number> | null {
  const entries = Object.entries(prices ?? {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  return entries.length ? Object.fromEntries(entries) : null;
}

/** The body of PUT /tours/:id/extras or /departures/:id/extras. Rows of a departure (departureId set) are left to the departure and not sent from the tour. */
export const fromExtraRows = (rows: readonly ExtraRow[], currency: string | null): TourExtra[] =>
  rows
    .filter((r) => r.title.trim() !== '')
    .map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      dayNumber: r.dayNumber ?? null,
      title: r.title.trim(),
      description: r.description ? r.description : null,
      price: Number.isFinite(r.price) ? r.price : 0,
      currency: r.currency ?? currency,
      bandPrices: cleanBandPrices(r.bandPrices),
      rateCardId: r.rateCardId ?? null,
      supplierId: r.supplierId ?? null,
      capacity: r.capacity ?? null,
      cutoffHoursBefore: r.cutoffHoursBefore ?? null,
      refundableUntilHours: r.refundableUntilHours ?? null,
      isActive: r.isActive ?? true,
    }));

interface ExtrasEditorProps {
  value: ExtraRow[];
  onChange: (rows: ExtraRow[]) => void;
  currency: string;
  disabled?: boolean;
}

const optionalInt = (raw: string, min: number): number | null => (raw === '' ? null : Math.max(min, Math.floor(Number(raw) || 0)));

/** The age bands a price can be set for: the agency's list, else adult, child and infant. */
function useBands(): Array<{ key: string; label: string }> {
  const t = useT();
  const [bands, setBands] = React.useState<Array<{ key: string; label: string }> | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    ageBandsApi
      .get()
      .then((res) => {
        const found = unwrapEntity<{ bands: Array<{ key: string; label: string }> }>(res).bands;
        if (!cancelled && found?.length) setBands(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return bands ?? ['adult', 'child', 'infant'].map((key) => ({ key, label: bandLabel(key, t) }));
}

/**
 * The extras of a tour (an excursion, an upgrade, a dinner): what can be added to a booking, on which day, for what price (one price
 * or one per age band, or the selling price of a rate card), how many places there are, when it closes and until when it is refundable.
 */
export function ExtrasEditor({ value, onChange, currency, disabled }: ExtrasEditorProps) {
  const t = useT();
  const bands = useBands();
  const patch = (key: string, change: Partial<ExtraRow>) => onChange(value.map((r) => (r._key === key ? { ...r, ...change } : r)));
  return (
    <div className="space-y-ds-3" data-testid="extras-editor">
      <p className="text-sm text-ds-foreground-muted">{t('extras.editor.intro')}</p>
      {value.length === 0 && <p className="text-sm text-ds-foreground-muted">{t('tours.extras.none')}</p>}
      {value.map((row) => (
        <div key={row._key} className="grid gap-ds-3 rounded-ds-md border border-ds-border p-ds-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="extra-row">
          <div className="space-y-ds-1 lg:col-span-2">
            <Label htmlFor={`extra-title-${row._key}`}>{t('tours.extras.title')}</Label>
            <Input id={`extra-title-${row._key}`} value={row.title} disabled={disabled} onChange={(e) => patch(row._key, { title: e.target.value })} data-testid="extra-title" />
          </div>
          <div className="space-y-ds-1">
            <Label>{t('tours.extras.price')}</Label>
            <CurrencyInput value={row.price} currency={row.currency ?? currency} disabled={disabled} aria-label={t('tours.extras.price')} onChange={(v) => patch(row._key, { price: v ?? 0 })} />
          </div>
          <div className="space-y-ds-1">
            <Label htmlFor={`extra-day-${row._key}`}>{t('tours.extras.day')}</Label>
            <Input id={`extra-day-${row._key}`} type="number" min={1} value={row.dayNumber ?? ''} disabled={disabled} onChange={(e) => patch(row._key, { dayNumber: optionalInt(e.target.value, 1) })} />
          </div>
          <div className="space-y-ds-1 lg:col-span-2">
            <Label htmlFor={`extra-desc-${row._key}`}>{t('tours.extras.description')}</Label>
            <Input id={`extra-desc-${row._key}`} value={row.description ?? ''} disabled={disabled} onChange={(e) => patch(row._key, { description: e.target.value })} />
          </div>
          <div className="space-y-ds-1">
            <Label htmlFor={`extra-cap-${row._key}`}>{t('tours.extras.capacity')}</Label>
            <Input id={`extra-cap-${row._key}`} type="number" min={0} value={row.capacity ?? ''} disabled={disabled} onChange={(e) => patch(row._key, { capacity: optionalInt(e.target.value, 0) })} />
          </div>
          <div className="space-y-ds-1">
            <Label htmlFor={`extra-cutoff-${row._key}`}>{t('extras.editor.cutoffHours')}</Label>
            <Input id={`extra-cutoff-${row._key}`} type="number" min={0} value={row.cutoffHoursBefore ?? ''} placeholder={t('extras.editor.cutoffDefault')} disabled={disabled} onChange={(e) => patch(row._key, { cutoffHoursBefore: optionalInt(e.target.value, 0) })} />
          </div>

          <div className="space-y-ds-1 sm:col-span-2">
            <Label>{t('extras.editor.rateCard')}</Label>
            <RateCardCombobox value={row.rateCardId ?? null} onChange={(id) => patch(row._key, { rateCardId: id })} disabled={disabled} aria-label={t('extras.editor.rateCard')} />
            <p className="text-xs text-ds-foreground-muted">{t('extras.editor.rateCardHint')}</p>
          </div>
          <div className="space-y-ds-1 sm:col-span-2">
            <Label>{t('extras.editor.supplier')}</Label>
            <SupplierCombobox value={row.supplierId ?? null} onChange={(id) => patch(row._key, { supplierId: id })} disabled={disabled} aria-label={t('extras.editor.supplier')} />
          </div>
          <div className="space-y-ds-1">
            <Label htmlFor={`extra-refund-${row._key}`}>{t('extras.editor.refundHours')}</Label>
            <Input id={`extra-refund-${row._key}`} type="number" min={0} value={row.refundableUntilHours ?? ''} placeholder={t('extras.editor.refundNone')} disabled={disabled} onChange={(e) => patch(row._key, { refundableUntilHours: optionalInt(e.target.value, 0) })} />
          </div>

          <fieldset className="space-y-ds-1 sm:col-span-2 lg:col-span-3">
            <legend className="text-sm font-medium">{t('extras.editor.bandPrices')}</legend>
            <div className="flex flex-wrap gap-ds-3">
              {bands.map((b) => (
                <div key={b.key} className="w-36 space-y-ds-1" data-testid={`extra-band-${b.key}`}>
                  <Label className="text-xs text-ds-foreground-muted">{b.label}</Label>
                  <CurrencyInput
                    value={row.bandPrices?.[b.key]}
                    currency={row.currency ?? currency}
                    disabled={disabled}
                    aria-label={`${t('extras.editor.bandPrices')}: ${b.label}`}
                    onChange={(v) => {
                      const next = { ...(row.bandPrices ?? {}) };
                      if (v === undefined || v === null) delete next[b.key];
                      else next[b.key] = v;
                      patch(row._key, { bandPrices: Object.keys(next).length ? next : null });
                    }}
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-ds-foreground-muted">{t('extras.editor.bandPricesHint')}</p>
          </fieldset>
          <div className="flex items-end justify-between gap-ds-2 pb-ds-1">
            <label className="flex items-center gap-ds-2 text-sm">
              <Checkbox checked={row.isActive ?? true} disabled={disabled} onCheckedChange={(c) => patch(row._key, { isActive: c === true })} />
              {t('tours.extras.active')}
            </label>
            <Button variant="ghost" size="icon-sm" aria-label={t('tours.extras.remove')} disabled={disabled} onClick={() => onChange(value.filter((r) => r._key !== row._key))}>
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...value, { _key: newKey(), title: '', price: 0, currency, isActive: true }])} data-testid="add-extra">
        <Plus aria-hidden="true" />
        {t('tours.extras.add')}
      </Button>
    </div>
  );
}
