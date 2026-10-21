'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react';

import { AddressAutocomplete, Button, Checkbox, Input, Label, Tag } from '@/components/ui';
import type { TripStop, TripStopStatus } from '@/lib/api/fleet';
import type { TripStopInput } from '@/lib/api/fleet';
import { toLocalDateTimeInput } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** A stop in the editor. `scheduledLocal` is the value of a datetime-local input (the browser's zone). */
export interface TripStopRow {
  _key: string;
  id?: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  scheduledLocal: string;
  documentsCheck: boolean;
  status?: TripStopStatus;
}

let counter = 0;
const newKey = () => `ts${Date.now().toString(36)}${(counter++).toString(36)}`;

export const emptyTripStopRow = (): TripStopRow => ({ _key: newKey(), name: '', address: null, lat: null, lng: null, scheduledLocal: '', documentsCheck: false });

export const toTripStopRows = (stops: readonly TripStop[]): TripStopRow[] =>
  stops.map((s) => ({
    _key: s.id,
    id: s.id,
    name: s.name,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    scheduledLocal: s.scheduledAt && !Number.isNaN(new Date(s.scheduledAt).getTime()) ? toLocalDateTimeInput(new Date(s.scheduledAt)) : '',
    documentsCheck: s.documentsCheck,
    status: s.status,
  }));

/** The body of PUT .../stops: the array order is the stop order. Rows with no name are left out. */
export const fromTripStopRows = (rows: readonly TripStopRow[]): TripStopInput[] =>
  rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      name: r.name.trim(),
      address: r.address ? r.address : null,
      lat: r.lat,
      lng: r.lng,
      scheduledAt: r.scheduledLocal && !Number.isNaN(new Date(r.scheduledLocal).getTime()) ? new Date(r.scheduledLocal).toISOString() : null,
      documentsCheck: r.documentsCheck,
    }));

/** Moves the row at `from` to position `to`; out-of-range moves leave the list as it was. */
export function moveRow<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1) as [T];
  next.splice(to, 0, item);
  return next;
}

const STATUS_TONE: Record<TripStopStatus, 'neutral' | 'info' | 'success' | 'warning'> = {
  pending: 'neutral',
  arrived: 'info',
  departed: 'success',
  skipped: 'warning',
};

interface TripStopsEditorProps {
  value: TripStopRow[];
  onChange: (rows: TripStopRow[]) => void;
  disabled?: boolean;
}

/**
 * The ordered stops of a coach trip: name, address (Google Places when a key is set, a plain field otherwise), time and whether
 * documents are checked there. Rows are reordered by dragging the handle; the arrow buttons do the same from the keyboard.
 */
export function TripStopsEditor({ value, onChange, disabled }: TripStopsEditorProps) {
  const t = useT();
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<number | null>(null);
  const patch = (key: string, change: Partial<TripStopRow>) => onChange(value.map((r) => (r._key === key ? { ...r, ...change } : r)));

  return (
    <div className="space-y-ds-3" data-testid="trip-stops-editor">
      {value.length === 0 && <p className="text-sm text-ds-foreground-muted">{t('coachTrips.stops.none')}</p>}
      {value.map((row, i) => (
        <div
          key={row._key}
          className={cn('rounded-ds-md border border-ds-border p-ds-3', dragOver === i && dragFrom !== null && dragFrom !== i && 'border-ds-primary bg-ds-surface-sunken')}
          data-testid="trip-stop-row"
          onDragOver={(e) => {
            if (dragFrom === null) return;
            e.preventDefault();
            setDragOver(i);
          }}
          onDrop={(e) => {
            if (dragFrom === null) return;
            e.preventDefault();
            onChange(moveRow(value, dragFrom, i));
            setDragFrom(null);
            setDragOver(null);
          }}
        >
          <div className="mb-ds-2 flex items-center justify-between gap-ds-2">
            <span className="flex items-center gap-ds-2 text-sm font-medium">
              <span
                draggable={!disabled}
                onDragStart={(e) => {
                  setDragFrom(i);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', row._key);
                }}
                onDragEnd={() => {
                  setDragFrom(null);
                  setDragOver(null);
                }}
                className={cn('cursor-grab text-ds-foreground-muted', disabled && 'cursor-not-allowed opacity-50')}
                title={t('coachTrips.stops.drag')}
                data-testid="trip-stop-handle"
              >
                <GripVertical className="size-4" aria-hidden="true" />
                <span className="sr-only">{t('coachTrips.stops.drag')}</span>
              </span>
              {t('coachTrips.stops.number', { n: i + 1 })}
              {row.status && row.status !== 'pending' && <Tag tone={STATUS_TONE[row.status]}>{t(`coachTrips.stopStatus.${row.status}`)}</Tag>}
            </span>
            <div className="flex items-center gap-ds-1">
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t('coachTrips.stops.up')} disabled={disabled || i === 0} onClick={() => onChange(moveRow(value, i, i - 1))}>
                <ArrowUp aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t('coachTrips.stops.down')} disabled={disabled || i === value.length - 1} onClick={() => onChange(moveRow(value, i, i + 1))}>
                <ArrowDown aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t('coachTrips.stops.remove')} disabled={disabled} onClick={() => onChange(value.filter((r) => r._key !== row._key))}>
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="grid gap-ds-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-ds-1 lg:col-span-2">
              <Label htmlFor={`trip-stop-name-${row._key}`}>{t('coachTrips.stops.name')}</Label>
              <Input id={`trip-stop-name-${row._key}`} value={row.name} disabled={disabled} onChange={(e) => patch(row._key, { name: e.target.value })} />
            </div>
            <div className="space-y-ds-1 lg:col-span-2">
              <Label htmlFor={`trip-stop-time-${row._key}`}>{t('coachTrips.stops.time')}</Label>
              <Input
                id={`trip-stop-time-${row._key}`}
                type="datetime-local"
                value={row.scheduledLocal}
                disabled={disabled}
                onChange={(e) => patch(row._key, { scheduledLocal: e.target.value })}
              />
            </div>
            <div className="space-y-ds-1 sm:col-span-2">
              <Label>{t('coachTrips.stops.address')}</Label>
              <AddressAutocomplete
                value={row.address ?? ''}
                disabled={disabled}
                placeholder={t('coachTrips.stops.addressPlaceholder')}
                onChange={(v) => patch(row._key, { address: v || null })}
                onAddressSelect={(p) => patch(row._key, { address: p.address, lat: p.lat ?? null, lng: p.lng ?? null })}
              />
            </div>
            <label className="flex items-end gap-ds-2 pb-ds-2 text-sm sm:col-span-2">
              <Checkbox checked={row.documentsCheck} disabled={disabled} onCheckedChange={(c) => patch(row._key, { documentsCheck: c === true })} />
              {t('coachTrips.stops.documentsCheck')}
            </label>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...value, emptyTripStopRow()])} data-testid="add-trip-stop">
        <Plus aria-hidden="true" />
        {t('coachTrips.stops.add')}
      </Button>
    </div>
  );
}
