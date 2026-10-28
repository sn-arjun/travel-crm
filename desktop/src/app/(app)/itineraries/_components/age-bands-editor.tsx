'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button, Input } from '@/components/ui';
import { parseBands, bandRange, MAX_AGE_BANDS, type AgeBand, type BandsErrorCode } from '@/lib/age-bands';
import { useT } from '@/lib/i18n';

/** A band as typed: the age stays text until it is saved, and a key exists once the band has been saved. */
export interface BandRow {
  /** Local id for React; never sent. */
  uid: string;
  key?: string;
  label: string;
  minAge: string;
}

const ERROR_KEYS: Record<BandsErrorCode, string> = {
  empty: 'ageBands.errors.empty',
  invalidAge: 'ageBands.errors.invalidAge',
  invalidKey: 'ageBands.errors.invalidKey',
  sameKey: 'ageBands.errors.sameKey',
  sameAge: 'ageBands.errors.sameAge',
  tooMany: 'ageBands.errors.tooMany',
  noZero: 'ageBands.errors.noZero',
};

let rowCounter = 0;
const nextUid = () => `band-row-${++rowCounter}`;

export function rowsFromBands(bands: AgeBand[]): BandRow[] {
  return bands.map((b) => ({ uid: nextUid(), key: b.key, label: b.label, minAge: String(b.minAge) }));
}

export function newBandRow(): BandRow {
  return { uid: nextUid(), label: '', minAge: '' };
}

/** What the API takes: keys stay on saved bands, new bands get theirs from the server. */
export function rowsToRequest(rows: BandRow[]): Array<{ key?: string; label: string; minAge: number }> {
  return rows.map((r) => ({ ...(r.key ? { key: r.key } : {}), label: r.label.trim(), minAge: Number(r.minAge) }));
}

/** The reason the rows cannot be saved, or null. A blank age counts as not valid (Number('') would read as 0). */
export function rowsError(rows: BandRow[]): BandsErrorCode | null {
  if (rows.length === 0) return 'empty';
  if (rows.some((r) => r.minAge.trim() === '' || r.label.trim() === '')) return 'invalidAge';
  return parseBands(rowsToRequest(rows)).error;
}

interface AgeBandsEditorProps {
  rows: BandRow[];
  onChange: (rows: BandRow[]) => void;
  disabled?: boolean;
}

/** Labels and minimum ages of an age-band list. Each band runs to the next band's minimum age, so the list has no gaps. */
export function AgeBandsEditor({ rows, onChange, disabled }: AgeBandsEditorProps) {
  const t = useT();
  const parsed = parseBands(rowsToRequest(rows.filter((r) => r.minAge.trim() !== '')));
  const error = rowsError(rows);

  // The covered ages are worked out from the list as typed, by position in the list sorted by age.
  const rangeOf = (row: BandRow): string => {
    if (row.minAge.trim() === '' || parsed.error) return '';
    const match = parsed.bands.find((b) => b.minAge === Number(row.minAge));
    return match ? bandRange(parsed.bands, match.key) : '';
  };

  function patch(uid: string, change: Partial<BandRow>) {
    onChange(rows.map((r) => (r.uid === uid ? { ...r, ...change } : r)));
  }

  return (
    <div className="space-y-ds-2">
      <div className="grid grid-cols-[1fr_6rem_5rem_auto] items-center gap-ds-2 text-xs font-medium text-ds-foreground-muted">
        <span>{t('ageBands.editor.label')}</span>
        <span>{t('ageBands.editor.minAge')}</span>
        <span>{t('ageBands.editor.covers')}</span>
        <span className="w-8" />
      </div>
      {rows.map((row, index) => (
        <div key={row.uid} className="grid grid-cols-[1fr_6rem_5rem_auto] items-center gap-ds-2" data-testid="age-band-row">
          <Input
            value={row.label}
            onChange={(e) => patch(row.uid, { label: e.target.value })}
            placeholder={t('ageBands.editor.labelPlaceholder')}
            aria-label={t('ageBands.editor.labelOf', { n: index + 1 })}
            maxLength={40}
            disabled={disabled}
            className="h-8 text-sm"
          />
          <Input
            type="number"
            min={0}
            max={120}
            step={1}
            value={row.minAge}
            onChange={(e) => patch(row.uid, { minAge: e.target.value })}
            aria-label={t('ageBands.editor.minAgeOf', { n: index + 1 })}
            disabled={disabled}
            className="h-8 text-sm"
          />
          <span className="text-sm text-ds-foreground-muted" data-testid="age-band-range">{rangeOf(row)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('ageBands.editor.remove')}
            disabled={disabled || rows.length <= 1}
            onClick={() => onChange(rows.filter((r) => r.uid !== row.uid))}
          >
            <Trash2 className="size-3.5 text-ds-danger" aria-hidden="true" />
          </Button>
        </div>
      ))}
      {error && rows.length > 0 && rows.every((r) => r.minAge.trim() !== '' && r.label.trim() !== '') && (
        <p role="alert" className="text-xs text-ds-danger">{t(ERROR_KEYS[error], { max: MAX_AGE_BANDS })}</p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-ds-1"
        disabled={disabled || rows.length >= MAX_AGE_BANDS}
        onClick={() => onChange([...rows, newBandRow()])}
        data-testid="age-band-add"
      >
        <Plus className="size-3" aria-hidden="true" /> {t('ageBands.editor.add')}
      </Button>
    </div>
  );
}
