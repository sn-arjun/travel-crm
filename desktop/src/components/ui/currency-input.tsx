'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  currency?: string;
  locale?: string;
}

export function CurrencyInput({
  value,
  onChange,
  currency = 'INR',
  locale = 'en-IN',
  className,
  ...props
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = React.useState('');
  const [focused, setFocused] = React.useState(false);

  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency;

  React.useEffect(() => {
    if (!focused && value !== undefined) {
      setDisplayValue(value.toLocaleString(locale));
    } else if (value === undefined && !focused) {
      setDisplayValue('');
    }
  }, [value, focused, locale]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    setDisplayValue(raw);
    const num = parseFloat(raw);
    onChange(isNaN(num) ? undefined : num);
  }

  function handleFocus() {
    setFocused(true);
    if (value !== undefined) setDisplayValue(String(value));
  }

  function handleBlur() {
    setFocused(false);
    if (value !== undefined) setDisplayValue(value.toLocaleString(locale));
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">{symbol}</span>
      <Input
        {...props}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn('pl-8 text-right font-medium', className)}
        inputMode="decimal"
      />
    </div>
  );
}
