'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button, Checkbox, CurrencyInput, Input, Label } from '@/components/ui';
import type { TourExtra } from '@/lib/api/tours';
import { useT } from '@/lib/i18n';

export interface ExtraRow extends TourExtra {
  _key: string;
}

let counter = 0;
const newKey = () => `x${Date.now().toString(36)}${(counter++).toString(36)}`;

export const toExtraRows = (list: readonly TourExtra[]): ExtraRow[] => list.map((x) => ({ ...x, _key: x.id ?? newKey() }));

/** The body of PUT /tours/:id/extras. Rows of a departure (departureId set) are left to the departure and not sent. */
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
      capacity: r.capacity ?? null,
      cutoffHoursBefore: r.cutoffHoursBefore ?? null,
      isActive: r.isActive ?? true,
    }));

interface ExtrasEditorProps {
  value: ExtraRow[];
  onChange: (rows: ExtraRow[]) => void;
  currency: string;
  disabled?: boolean;
}

const optionalInt = (raw: string, min: number): number | null => (raw === '' ? null : Math.max(min, Math.floor(Number(raw) || 0)));

/** The extras catalogue of a tour (an excursion, an upgrade): what can be added to a booking and at what price. */
export function ExtrasEditor({ value, onChange, currency, disabled }: ExtrasEditorProps) {
  const t = useT();
  const patch = (key: string, change: Partial<ExtraRow>) => onChange(value.map((r) => (r._key === key ? { ...r, ...change } : r)));
  return (
    <div className="space-y-ds-3" data-testid="extras-editor">
      <p className="text-sm text-ds-foreground-muted">{t('tours.extras.intro')}</p>
      {value.length === 0 && <p className="text-sm text-ds-foreground-muted">{t('tours.extras.none')}</p>}
      {value.map((row) => (
        <div key={row._key} className="grid gap-ds-3 rounded-ds-md border border-ds-border p-ds-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="extra-row">
          <div className="space-y-ds-1 lg:col-span-2">
            <Label htmlFor={`extra-title-${row._key}`}>{t('tours.extras.title')}</Label>
            <Input id={`extra-title-${row._key}`} value={row.title} disabled={disabled} onChange={(e) => patch(row._key, { title: e.target.value })} />
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
