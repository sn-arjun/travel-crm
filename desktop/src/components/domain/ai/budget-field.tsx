'use client';

import * as React from 'react';

import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n';
import { useLocale } from '@/lib/locale';

interface BudgetFieldProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

/** Budget input of the AI pages: labelled with the agency currency, never a fixed one. */
export function BudgetField({ value, onChange }: BudgetFieldProps) {
  const t = useT();
  const { currency } = useLocale();
  return (
    <div className="space-y-2">
      <Label htmlFor="budget">{t('ai.itinerary.budgetIn', { currency })}</Label>
      <CurrencyInput id="budget" placeholder={t('ai.itinerary.budgetPlaceholder')} value={value} onChange={onChange} />
    </div>
  );
}
