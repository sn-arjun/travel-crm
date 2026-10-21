'use client';

import * as React from 'react';

import { Input } from '@/components/ui';

interface IntFieldProps {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * A whole-number field that lets the text be empty while it is being typed and puts a valid, in-range number back on blur.
 * (A plain controlled number input snaps back to the minimum as soon as the field is cleared.)
 */
export function IntField({ id, value, onChange, min, max, disabled, className, ...aria }: IntFieldProps) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => {
    // Follow outside changes (a reload, a reset) but never rewrite what is being typed.
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  return (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text}
      disabled={disabled}
      className={className}
      {...aria}
      onChange={(e) => {
        setText(e.target.value);
        const n = Math.floor(Number(e.target.value));
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => {
        const n = Math.floor(Number(text));
        const next = text.trim() === '' || !Number.isFinite(n) ? value : Math.min(max, Math.max(min, n));
        setText(String(next));
        if (next !== value) onChange(next);
      }}
    />
  );
}
