'use client';

import * as React from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { formatExactCurrency } from '@/lib/format';
import { useT } from '@/lib/i18n';
import type { PublicBand, PublicField, PublicPage } from '@/lib/booking-form';
import { cn } from '@/lib/utils';

/** Money in the departure's currency and the agency's locale (the page sets the locale context when it loads). */
export const money = (amount: number, page: Pick<PublicPage, 'currency'>): string => formatExactCurrency(amount, page.currency);

/* eslint-disable no-restricted-syntax -- the agency's own brand colour is data (a hex value it chose), not a design token */
/** Black or white, whichever reads better on the agency's colour. */
export function readableOn(hex: string | null): string {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.6 ? '#111111' : '#ffffff';
}

/** The agency's colour as inline style for its main button; the app's own primary colour when the agency set none. */
export function brandStyle(color: string | null): React.CSSProperties | undefined {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? { backgroundColor: color, color: readableOn(color), borderColor: color } : undefined;
}

/* eslint-enable no-restricted-syntax */

const BUILT_IN_FIELDS = new Set(['nationality', 'documentType', 'documentNumber', 'documentExpiry', 'documentExpiry2']);

/** The built-in optional fields are translated; the agency's own fields show the agency's label. */
export function useFieldLabel(): (f: Pick<PublicField, 'key' | 'label' | 'custom'>) => string {
  const t = useT();
  return (f) => (!f.custom && BUILT_IN_FIELDS.has(f.key) ? t(`booking.field.${f.key}`) : f.label);
}

/** The three built-in bands are translated; an agency's own bands show their label (or key). */
export function useBandName(): (b: Pick<PublicBand, 'key' | 'label'>) => string {
  const t = useT();
  return (b) => {
    if (b.label && !['adult', 'child', 'infant'].includes(b.key)) return b.label;
    if (['adult', 'child', 'infant'].includes(b.key) && (!b.label || b.label.toLowerCase() === b.key)) return t(`booking.band.${b.key}`);
    return b.label ?? b.key;
  };
}

/** Age range of a band for display, e.g. "2 to 11 years" or "12 years and older". */
export function useBandAges(): (b: Pick<PublicBand, 'minAge' | 'maxAge'>) => string {
  const t = useT();
  return (b) => (b.maxAge === null ? t('booking.band.agesFrom', { min: b.minAge }) : t('booking.band.ages', { min: b.minAge, max: b.maxAge }));
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** A label, the control, an optional hint and the error under it. */
export function Field({ id, label, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className="text-sm font-medium text-ds-foreground">
        {label}
        {required && <span aria-hidden="true" className="ms-1 text-ds-danger">*</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-ds-foreground-muted">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-ds-danger">{error}</p>}
    </div>
  );
}

interface ChoiceProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** When set, an item with this label clears the choice. */
  noneLabel?: string;
  invalid?: boolean;
  'data-testid'?: string;
}

const NONE = '__none__';

/** A list to pick one from (Radix cannot hold an empty item value, so "no choice" is a labelled item). */
export function Choice({ id, value, onChange, options, noneLabel, invalid, ...rest }: ChoiceProps) {
  const t = useT();
  return (
    <Select value={value || (noneLabel ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} data-testid={rest['data-testid']}>
        <SelectValue placeholder={t('booking.select.placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
