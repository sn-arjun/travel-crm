'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button, Input, Label } from '@/components/ui';
import type { DepartureVehicle } from '@/lib/api/departures';
import { useT } from '@/lib/i18n';
import { DriverCombobox, VehicleCombobox } from './relation-pickers';

export interface VehicleRow extends DepartureVehicle {
  _key: string;
}

let counter = 0;
const newKey = () => `v${Date.now().toString(36)}${(counter++).toString(36)}`;

export const toVehicleRows = (list: readonly DepartureVehicle[]): VehicleRow[] => list.map((v) => ({ ...v, _key: v.id ?? newKey() }));

/** The body of PUT /departures/:id/vehicles. */
export const fromVehicleRows = (rows: readonly VehicleRow[]): DepartureVehicle[] =>
  rows.map(({ _key, registrationNumber: _r, ...v }) => ({
    ...(v.id ? { id: v.id } : {}),
    vehicleId: v.vehicleId ?? null,
    label: v.label ? v.label : null,
    capacity: v.capacity,
    driverId: v.driverId ?? null,
  }));

interface VehiclesEditorProps {
  value: VehicleRow[];
  onChange: (rows: VehicleRow[]) => void;
  /** Used when a vehicle has no seating capacity of its own (the agency setting). */
  defaultCapacity: number;
  disabled?: boolean;
}

/** The coaches of a departure: a vehicle from the fleet (or just a label), its seats and its driver. Capacity follows their sum. */
export function VehiclesEditor({ value, onChange, defaultCapacity, disabled }: VehiclesEditorProps) {
  const t = useT();
  const patch = (key: string, change: Partial<VehicleRow>) => onChange(value.map((r) => (r._key === key ? { ...r, ...change } : r)));
  const total = value.reduce((n, v) => n + (Number.isFinite(v.capacity) ? v.capacity : 0), 0);

  return (
    <div className="space-y-ds-3" data-testid="vehicles-editor">
      {value.length === 0 && <p className="text-sm text-ds-foreground-muted">{t('departures.vehicles.none')}</p>}
      {value.map((row, i) => (
        <div key={row._key} className="grid gap-ds-3 rounded-ds-md border border-ds-border p-ds-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="vehicle-row">
          <div className="space-y-ds-1">
            <Label>{t('departures.vehicles.vehicle')}</Label>
            <VehicleCombobox
              value={row.vehicleId ?? null}
              disabled={disabled}
              aria-label={t('departures.vehicles.vehicleN', { n: i + 1 })}
              onChange={(id) => patch(row._key, { vehicleId: id })}
              onPick={(v) => {
                if (!v) return;
                const seats = v.seatingCapacity ?? v.capacity ?? defaultCapacity;
                patch(row._key, {
                  vehicleId: v.id,
                  capacity: seats,
                  label: row.label || [v.make, v.model].filter(Boolean).join(' ') || v.registrationNumber || null,
                });
              }}
            />
          </div>
          <div className="space-y-ds-1">
            <Label htmlFor={`veh-label-${row._key}`}>{t('departures.vehicles.label')}</Label>
            <Input id={`veh-label-${row._key}`} value={row.label ?? ''} disabled={disabled} onChange={(e) => patch(row._key, { label: e.target.value })} />
          </div>
          <div className="space-y-ds-1">
            <Label htmlFor={`veh-cap-${row._key}`}>{t('departures.vehicles.capacity')}</Label>
            <Input
              id={`veh-cap-${row._key}`}
              type="number"
              min={1}
              max={200}
              value={row.capacity}
              disabled={disabled}
              onChange={(e) => patch(row._key, { capacity: Math.max(1, Math.min(200, Math.floor(Number(e.target.value) || 1))) })}
            />
          </div>
          <div className="space-y-ds-1">
            <Label>{t('departures.vehicles.driver')}</Label>
            <div className="flex items-start gap-ds-1">
              <div className="min-w-0 flex-1">
                <DriverCombobox value={row.driverId ?? null} disabled={disabled} aria-label={t('departures.vehicles.driver')} onChange={(id) => patch(row._key, { driverId: id })} />
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={t('departures.vehicles.remove')} disabled={disabled} onClick={() => onChange(value.filter((r) => r._key !== row._key))}>
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between gap-ds-3">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...value, { _key: newKey(), capacity: defaultCapacity }])} data-testid="add-vehicle">
          <Plus aria-hidden="true" />
          {t('departures.vehicles.add')}
        </Button>
        {value.length > 0 && <span className="text-sm text-ds-foreground-muted tabular-nums">{t('departures.vehicles.total', { count: total })}</span>}
      </div>
    </div>
  );
}
