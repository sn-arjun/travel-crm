'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button, CurrencyInput, Input } from '@/components/ui';
import type { RoomTypeDef } from '@/lib/api/departures';
import type { Price, PriceKind } from '@/lib/api/tours';
import { bandLabel, customFieldKey } from '@/lib/departures';
import { useT } from '@/lib/i18n';
import { SimpleSelect } from './simple-select';

export interface PriceRow extends Price {
  _key: string;
}

let counter = 0;
const newKey = () => `pr${Date.now().toString(36)}${(counter++).toString(36)}`;

export const toPriceRows = (list: readonly Price[]): PriceRow[] => list.map((p) => ({ ...p, _key: p.id ?? newKey() }));

/** The body of PUT .../prices. */
export const fromPriceRows = (rows: readonly PriceRow[], currency: string | null): Price[] =>
  rows
    .filter((r) => r.key.trim() !== '')
    .map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      kind: r.kind,
      key: r.key.trim(),
      label: r.label ? r.label : null,
      amount: Number.isFinite(r.amount) ? r.amount : 0,
      currency: r.currency ?? currency,
    }));

/** The age bands offered by default; an agency's own band keys already on a price stay selectable. */
const DEFAULT_BAND_KEYS = ['adult', 'child', 'infant'];

interface PricesEditorProps {
  value: PriceRow[];
  onChange: (rows: PriceRow[]) => void;
  currency: string;
  roomTypes: readonly RoomTypeDef[];
  disabled?: boolean;
}

/**
 * The price list of a tour (or the overrides of one departure): a price per age band, supplements per room type, a preferred-seat
 * surcharge and free-form extras. Amounts are in the tour's currency.
 */
export function PricesEditor({ value, onChange, currency, roomTypes, disabled }: PricesEditorProps) {
  const t = useT();
  const patch = (key: string, change: Partial<PriceRow>) => onChange(value.map((r) => (r._key === key ? { ...r, ...change } : r)));
  const taken = value.map((r) => r.key);

  const add = (kind: PriceKind) => {
    const used = new Set(value.filter((r) => r.kind === kind).map((r) => r.key));
    let key = '';
    let label: string | null = null;
    if (kind === 'age_band') {
      key = DEFAULT_BAND_KEYS.find((k) => !used.has(k)) ?? '';
      label = key ? bandLabel(key, t) : null;
    } else if (kind === 'room_supplement') {
      const room = roomTypes.find((r) => !used.has(r.key));
      key = room?.key ?? '';
      label = room?.label ?? null;
    } else if (kind === 'seat_surcharge') {
      key = 'preferred_seat';
      label = t('tours.prices.preferredSeat');
    }
    onChange([...value, { _key: newKey(), kind, key, label, amount: 0, currency }]);
  };

  const kindLabel: Record<PriceKind, string> = {
    age_band: t('tours.prices.kindAgeBand'),
    room_supplement: t('tours.prices.kindRoom'),
    seat_surcharge: t('tours.prices.kindSeat'),
    other: t('tours.prices.kindOther'),
  };

  return (
    <div className="space-y-ds-3" data-testid="prices-editor">
      {value.length === 0 && <p className="text-sm text-ds-foreground-muted">{t('tours.prices.none')}</p>}
      {value.map((row) => (
        <div key={row._key} className="grid items-end gap-ds-3 rounded-ds-md border border-ds-border p-ds-3 sm:grid-cols-[10rem_1fr_12rem_auto]" data-testid="price-row">
          <div className="space-y-ds-1">
            <span className="text-xs text-ds-foreground-muted">{t('tours.prices.kind')}</span>
            <p className="text-sm font-medium">{kindLabel[row.kind]}</p>
          </div>
          <div className="space-y-ds-1">
            <span className="text-xs text-ds-foreground-muted">{t('tours.prices.item')}</span>
            {row.kind === 'age_band' ? (
              <SimpleSelect
                value={row.key || null}
                disabled={disabled}
                aria-label={t('tours.prices.item')}
                placeholder={t('tours.prices.pick')}
                onChange={(v) => patch(row._key, { key: v ?? '', label: v ? bandLabel(v, t) : null })}
                options={[...new Set([...DEFAULT_BAND_KEYS, ...(row.key ? [row.key] : [])])].map((k) => ({ value: k, label: bandLabel(k, t) }))}
              />
            ) : row.kind === 'room_supplement' ? (
              <SimpleSelect
                value={row.key || null}
                disabled={disabled}
                aria-label={t('tours.prices.item')}
                placeholder={t('tours.prices.pick')}
                onChange={(v) => patch(row._key, { key: v ?? '', label: roomTypes.find((r) => r.key === v)?.label ?? null })}
                options={[...roomTypes.map((r) => ({ value: r.key, label: r.label })), ...(row.key && !roomTypes.some((r) => r.key === row.key) ? [{ value: row.key, label: row.label ?? row.key }] : [])]}
              />
            ) : (
              <Input
                value={row.label ?? ''}
                disabled={disabled}
                aria-label={t('tours.prices.item')}
                placeholder={t('tours.prices.labelPlaceholder')}
                onChange={(e) =>
                  patch(row._key, {
                    label: e.target.value,
                    ...(row.kind === 'other' ? { key: customFieldKey(e.target.value, taken.filter((k) => k !== row.key)) } : {}),
                  })
                }
              />
            )}
          </div>
          <div className="space-y-ds-1">
            <span className="text-xs text-ds-foreground-muted">{t('tours.prices.amount')}</span>
            <CurrencyInput value={row.amount} currency={row.currency ?? currency} disabled={disabled} aria-label={t('tours.prices.amount')} onChange={(v) => patch(row._key, { amount: v ?? 0 })} />
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={t('tours.prices.remove')} disabled={disabled} onClick={() => onChange(value.filter((r) => r._key !== row._key))}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-ds-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => add('age_band')} data-testid="add-price-band">
          <Plus aria-hidden="true" />
          {t('tours.prices.addBand')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || roomTypes.length === 0} onClick={() => add('room_supplement')}>
          <Plus aria-hidden="true" />
          {t('tours.prices.addRoom')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || value.some((r) => r.kind === 'seat_surcharge')} onClick={() => add('seat_surcharge')}>
          <Plus aria-hidden="true" />
          {t('tours.prices.addSeat')}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => add('other')}>
          <Plus aria-hidden="true" />
          {t('tours.prices.addOther')}
        </Button>
      </div>
    </div>
  );
}
