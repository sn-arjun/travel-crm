'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button, CurrencyInput, Input } from '@/components/ui';
import type { DepartureCost } from '@/lib/api/departures';
import { useT } from '@/lib/i18n';
import { SimpleSelect } from './simple-select';
import { SupplierCombobox } from './relation-pickers';

export interface CostRow extends DepartureCost {
  _key: string;
}

let counter = 0;
const newKey = () => `c${Date.now().toString(36)}${(counter++).toString(36)}`;

export const toCostRows = (list: readonly DepartureCost[]): CostRow[] => list.map((c) => ({ ...c, _key: c.id ?? newKey() }));

/** The body of PUT /departures/:id/costs. */
export const fromCostRows = (rows: readonly CostRow[], currency: string): DepartureCost[] =>
  rows
    .filter((r) => r.description.trim() !== '')
    .map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      supplierId: r.supplierId ?? null,
      description: r.description.trim(),
      kind: r.kind ?? 'per_departure',
      amount: Number.isFinite(r.amount) ? r.amount : 0,
      currency: r.currency ?? currency,
    }));

interface CostsEditorProps {
  value: CostRow[];
  onChange: (rows: CostRow[]) => void;
  currency: string;
  disabled?: boolean;
}

/** What the departure costs the agency: a supplier line per departure or per seat. They feed the margin of every seat sold. */
export function CostsEditor({ value, onChange, currency, disabled }: CostsEditorProps) {
  const t = useT();
  const patch = (key: string, change: Partial<CostRow>) => onChange(value.map((r) => (r._key === key ? { ...r, ...change } : r)));
  return (
    <div className="space-y-ds-3" data-testid="costs-editor">
      {value.length === 0 && <p className="text-sm text-ds-foreground-muted">{t('departures.costs.none')}</p>}
      {value.map((row) => (
        <div key={row._key} className="grid items-end gap-ds-3 rounded-ds-md border border-ds-border p-ds-3 sm:grid-cols-2 lg:grid-cols-[1fr_14rem_10rem_12rem_auto]" data-testid="cost-row">
          <div className="space-y-ds-1">
            <span className="text-xs text-ds-foreground-muted">{t('departures.costs.descriptionLabel')}</span>
            <Input value={row.description} disabled={disabled} aria-label={t('departures.costs.descriptionLabel')} onChange={(e) => patch(row._key, { description: e.target.value })} />
          </div>
          <div className="space-y-ds-1">
            <span className="text-xs text-ds-foreground-muted">{t('departures.costs.supplier')}</span>
            <SupplierCombobox value={row.supplierId ?? null} disabled={disabled} aria-label={t('departures.costs.supplier')} onChange={(id) => patch(row._key, { supplierId: id })} />
          </div>
          <div className="space-y-ds-1">
            <span className="text-xs text-ds-foreground-muted">{t('departures.costs.kind')}</span>
            <SimpleSelect
              value={row.kind ?? 'per_departure'}
              disabled={disabled}
              aria-label={t('departures.costs.kind')}
              onChange={(v) => patch(row._key, { kind: (v as DepartureCost['kind']) ?? 'per_departure' })}
              options={[
                { value: 'per_departure', label: t('departures.costs.perDeparture') },
                { value: 'per_seat', label: t('departures.costs.perSeat') },
              ]}
            />
          </div>
          <div className="space-y-ds-1">
            <span className="text-xs text-ds-foreground-muted">{t('departures.costs.amount')}</span>
            <CurrencyInput value={row.amount} currency={row.currency ?? currency} disabled={disabled} aria-label={t('departures.costs.amount')} onChange={(v) => patch(row._key, { amount: v ?? 0 })} />
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={t('departures.costs.remove')} disabled={disabled} onClick={() => onChange(value.filter((r) => r._key !== row._key))}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...value, { _key: newKey(), description: '', kind: 'per_departure', amount: 0, currency }])} data-testid="add-cost">
        <Plus aria-hidden="true" />
        {t('departures.costs.add')}
      </Button>
    </div>
  );
}
