'use client';

import * as React from 'react';

import { CurrencyInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { useMarginScheme } from '@/hooks/use-margin-scheme';
import type { TaxPreview } from '@/lib/api/invoices';
import { useT } from '@/lib/i18n';
import { formatCurrency } from '@/lib/utils';

/** What the person picked for the tax treatment: the agency's default (nothing sent), the margin scheme, or the ordinary regime. */
export type RegimeChoice = 'default' | 'margin' | 'standard';

/** The value the API takes: nothing for "default" (a new invoice) or "as issued" (an edit). */
export function regimeRequest(choice: RegimeChoice): 'margin' | 'standard' | undefined {
  return choice === 'default' ? undefined : choice;
}

interface RegimeSelectProps {
  value: RegimeChoice;
  onChange: (value: RegimeChoice) => void;
  /** Editing keeps the regime the invoice was issued under unless another is picked. */
  editing?: boolean;
}

/** Tax treatment of the invoice. Rendered only while the agency can use the margin scheme. */
export function RegimeSelect({ value, onChange, editing = false }: RegimeSelectProps) {
  const t = useT();
  const { available } = useMarginScheme();
  if (!available) return null;
  return (
    <div className="flex flex-col gap-ds-1" data-testid="invoice-regime">
      <div className="flex items-center justify-between gap-ds-2">
        <span className="text-sm text-ds-foreground-muted shrink-0">{t('margin.regime.label')}</span>
        <Select value={value} onValueChange={(v) => onChange(v as RegimeChoice)}>
          <SelectTrigger className="w-56 h-8 text-xs" aria-label={t('margin.regime.label')} data-testid="invoice-regime-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">{editing ? t('margin.regime.asIssued') : t('margin.regime.default')}</SelectItem>
            <SelectItem value="margin">{t('margin.regime.margin')}</SelectItem>
            <SelectItem value="standard">{t('margin.regime.standard')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

interface MarginFiguresProps {
  preview: TaxPreview | null;
  currency: string;
  /** The cost typed on this form; undefined = not typed (the cost comes from the departure or itinerary, else stays unrecorded). */
  cost: number | undefined;
  onCostChange: (cost: number | undefined) => void;
}

/**
 * Cost, margin and VAT on the margin of a margin-scheme invoice. For staff who can edit invoices only, and never on the PDF
 * or the public pages. The preview already leaves these out for anyone else.
 */
export function MarginFigures({ preview, currency, cost, onCostChange }: MarginFiguresProps) {
  const t = useT();
  const { canSeeCost } = useMarginScheme();
  if (!preview || preview.regime !== 'margin' || !canSeeCost) return null;
  const known = preview.marginCost !== null && preview.marginCost !== undefined;
  const source = preview.marginCostSource ? t(`margin.source.${preview.marginCostSource}`) : null;
  return (
    <div className="flex flex-col gap-ds-2 rounded-ds-md border border-ds-border p-ds-3" data-testid="margin-figures">
      <p className="text-xs text-ds-foreground-muted">{t('margin.figures.internal')}</p>
      <div className="flex items-center justify-between gap-ds-2">
        <label htmlFor="marginCost" className="text-sm text-ds-foreground-muted shrink-0">{t('margin.cost.label')}</label>
        <CurrencyInput
          id="marginCost"
          value={cost}
          onChange={(v) => onCostChange(v)}
          currency={currency}
          placeholder={known && cost === undefined ? String(preview.marginCost) : '0'}
          aria-label={t('margin.cost.label')}
        />
      </div>
      <p className="text-xs text-ds-foreground-muted" data-testid="margin-cost-note">
        {cost !== undefined
          ? t('margin.cost.typed')
          : known && source
            ? t('margin.cost.from', { source: source.toLowerCase(), amount: formatCurrency(preview.marginCost ?? 0, currency) })
            : t('margin.cost.missing')}
      </p>
      {preview.margin !== null && preview.margin !== undefined && (
        <div className="flex justify-between text-sm" data-testid="margin-amount">
          <span className="text-ds-foreground-muted">{t('margin.figures.margin')}</span>
          <span className="font-medium">{formatCurrency(preview.margin, currency)}</span>
        </div>
      )}
      {preview.margin !== null && preview.margin !== undefined && (
        preview.vatOnMargin !== null && preview.vatOnMargin !== undefined ? (
          <div className="flex justify-between text-sm" data-testid="margin-vat-amount">
            <span className="text-ds-foreground-muted">{t('margin.figures.vatOnMargin')}</span>
            <span className="font-medium">{formatCurrency(preview.vatOnMargin, currency)}</span>
          </div>
        ) : (
          <p className="text-xs text-ds-foreground-muted" data-testid="margin-no-rate">{t('margin.figures.noRate')}</p>
        )
      )}
    </div>
  );
}
