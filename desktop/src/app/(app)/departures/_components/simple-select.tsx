'use client';

import * as React from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { cn } from '@/lib/utils';

export interface SimpleOption {
  value: string;
  label: string;
}

interface SimpleSelectProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  options: readonly SimpleOption[];
  placeholder?: string;
  /** When set, an extra first item with this label clears the value (Radix cannot hold an empty item value). */
  noneLabel?: string;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
  size?: 'sm' | 'default';
}

const NONE = '__none__';

/** A Select over a plain list that can be cleared. */
export function SimpleSelect({ value, onChange, options, placeholder, noneLabel, disabled, id, className, size, ...aria }: SimpleSelectProps) {
  return (
    <Select value={value ?? (noneLabel ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? null : v)} disabled={disabled}>
      <SelectTrigger id={id} size={size} className={cn('w-full', className)} {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
