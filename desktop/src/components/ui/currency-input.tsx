'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/locale';
import { currencySymbol } from '@/lib/locale-options';

export interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  currency?: string;
  locale?: string;
}

export function CurrencyInput({
  value,
  onChange,
  currency: currencyProp,
  locale: localeProp,
  className,
  ...props
}: CurrencyInputProps) {
  const active = useLocale();
  const currency = currencyProp || active.currency;
  const locale = localeProp || active.intlLocale;
  const [displayValue, setDisplayValue] = React.useState('');
  const [focused, setFocused] = React.useState(false);

  const symbol = currencySymbol(currency, locale);

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

  function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
    setFocused(true);
    if (value !== undefined) setDisplayValue(String(value));
    // Select the whole amount so typing (or a test `fill()`) replaces it instead of appending.
    // The frame callback must not act late: select() can pull focus back from the next field and
    // would also swallow the first characters of a fast typist, so it only runs while this field is
    // still focused and untouched.
    const input = e.currentTarget;
    const focusText = value !== undefined ? String(value) : '';
    requestAnimationFrame(() => {
      if (document.activeElement === input && input.value === focusText) input.select();
    });
    props.onFocus?.(e);
  }

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    props.onBlur?.(e);
    setFocused(false);
    if (value !== undefined) setDisplayValue(value.toLocaleString(locale));
  }

  return (
    <div className="relative">
      <span className="absolute start-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">{symbol}</span>
      <Input
        {...props}
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn('ps-8 text-end font-medium', className)}
        inputMode="decimal"
      />
    </div>
  );
}
