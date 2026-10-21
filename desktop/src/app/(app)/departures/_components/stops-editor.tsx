'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

import { AddressAutocomplete, Button, Checkbox, Input, Label } from '@/components/ui';
import type { Stop, StopKind } from '@/lib/api/tours';
import { useT } from '@/lib/i18n';
import { SimpleSelect } from './simple-select';

export interface StopRow extends Stop {
  _key: string;
}

let counter = 0;
const newKey = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;

export const toStopRows = (list: readonly Stop[]): StopRow[] => list.map((s) => ({ ...s, _key: s.id ?? newKey() }));

/** The body of PUT .../stops: order is the array order. */
export const fromStopRows = (rows: readonly StopRow[]): Stop[] =>
  rows.map(({ _key, sortOrder: _o, scheduledAt: _s, ...s }) => ({
    ...(s.id ? { id: s.id } : {}),
    name: s.name.trim(),
    address: s.address ? s.address : null,
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    localTime: s.localTime ? s.localTime : null,
    dayOffset: s.dayOffset ?? 0,
    kind: s.kind ?? 'pickup',
    documentsCheck: s.documentsCheck ?? false,
    notes: s.notes ? s.notes : null,
  }));

interface StopsEditorProps {
  value: StopRow[];
  onChange: (rows: StopRow[]) => void;
  disabled?: boolean;
}

/**
 * Ordered stops: name, address (Google Places when a key is set, a plain field otherwise), local time, day offset, kind and
 * whether documents are checked there. The first pickup is where the coach starts.
 */
export function StopsEditor({ value, onChange, disabled }: StopsEditorProps) {
  const t = useT();
  const patch = (key: string, change: Partial<StopRow>) => onChange(value.map((r) => (r._key === key ? { ...r, ...change } : r)));
  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    const a = value[index];
    const b = value[to];
    if (!a || !b) return;
    const next = [...value];
    next[index] = b;
    next[to] = a;
    onChange(next);
  };

  return (
    <div className="space-y-ds-3" data-testid="stops-editor">
      {value.length === 0 && <p className="text-sm text-ds-foreground-muted">{t('tours.stops.none')}</p>}
      {value.map((row, i) => (
        <div key={row._key} className="rounded-ds-md border border-ds-border p-ds-3" data-testid="stop-row">
          <div className="mb-ds-2 flex items-center justify-between">
            <span className="text-sm font-medium">{t('tours.stops.number', { n: i + 1 })}</span>
            <div className="flex items-center gap-ds-1">
              <Button variant="ghost" size="icon-sm" aria-label={t('tours.stops.up')} disabled={disabled || i === 0} onClick={() => move(i, -1)}>
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={t('tours.stops.down')} disabled={disabled || i === value.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label={t('tours.stops.remove')} disabled={disabled} onClick={() => onChange(value.filter((r) => r._key !== row._key))}>
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="grid gap-ds-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-ds-1 lg:col-span-2">
              <Label htmlFor={`stop-name-${row._key}`}>{t('tours.stops.name')}</Label>
              <Input id={`stop-name-${row._key}`} value={row.name} disabled={disabled} onChange={(e) => patch(row._key, { name: e.target.value })} />
            </div>
            <div className="space-y-ds-1">
              <Label htmlFor={`stop-time-${row._key}`}>{t('tours.stops.time')}</Label>
              <Input id={`stop-time-${row._key}`} type="time" value={row.localTime ?? ''} disabled={disabled} onChange={(e) => patch(row._key, { localTime: e.target.value || null })} />
            </div>
            <div className="space-y-ds-1">
              <Label htmlFor={`stop-day-${row._key}`}>{t('tours.stops.dayOffset')}</Label>
              <Input
                id={`stop-day-${row._key}`}
                type="number"
                min={0}
                max={60}
                value={row.dayOffset ?? 0}
                disabled={disabled}
                onChange={(e) => patch(row._key, { dayOffset: Math.max(0, Math.min(60, Math.floor(Number(e.target.value) || 0))) })}
              />
            </div>
            <div className="space-y-ds-1 sm:col-span-2">
              <Label>{t('tours.stops.address')}</Label>
              <AddressAutocomplete
                value={row.address ?? ''}
                disabled={disabled}
                placeholder={t('tours.stops.addressPlaceholder')}
                onChange={(v) => patch(row._key, { address: v || null })}
                onAddressSelect={(p) => patch(row._key, { address: p.address, lat: p.lat ?? null, lng: p.lng ?? null })}
              />
            </div>
            <div className="space-y-ds-1">
              <Label htmlFor={`stop-kind-${row._key}`}>{t('tours.stops.kind')}</Label>
              <SimpleSelect
                id={`stop-kind-${row._key}`}
                value={row.kind ?? 'pickup'}
                disabled={disabled}
                onChange={(v) => patch(row._key, { kind: (v as StopKind) ?? 'pickup' })}
                options={[
                  { value: 'pickup', label: t('tours.stops.kindPickup') },
                  { value: 'dropoff', label: t('tours.stops.kindDropoff') },
                  { value: 'both', label: t('tours.stops.kindBoth') },
                  { value: 'waypoint', label: t('tours.stops.kindWaypoint') },
                ]}
              />
            </div>
            <label className="flex items-end gap-ds-2 pb-ds-2 text-sm">
              <Checkbox checked={row.documentsCheck ?? false} disabled={disabled} onCheckedChange={(c) => patch(row._key, { documentsCheck: c === true })} />
              {t('tours.stops.documentsCheck')}
            </label>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...value, { _key: newKey(), name: '', kind: value.length === 0 ? 'pickup' : 'waypoint', dayOffset: 0 }])} data-testid="add-stop">
        <Plus aria-hidden="true" />
        {t('tours.stops.add')}
      </Button>
    </div>
  );
}
