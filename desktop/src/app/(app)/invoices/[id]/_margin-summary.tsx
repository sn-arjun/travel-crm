'use client';

import * as React from 'react';

import { SectionCard } from '@/components/ui';
import { usePermission } from '@/hooks/use-permission';
import type { InvoiceDetail } from '@/lib/api/invoices';
import { useT } from '@/lib/i18n';
import { marginFiguresVisible, marginPreview } from '@/lib/margin-scheme';
import { formatCurrency } from '@/lib/utils';

/**
 * Margin scheme card of the invoice page (R152). Everyone who can open the invoice sees which treatment it was issued under;
 * the cost, the margin and the VAT on the margin only show for staff who can edit invoices, and none of it is on the PDF.
 */
export function MarginSummary({ invoice }: { invoice: InvoiceDetail }) {
  const t = useT();
  const canEdit = usePermission('invoices', 'edit');
  if (invoice.taxRegime !== 'margin') return null;
  const money = (n: number) => formatCurrency(n, invoice.currency);
  const showFigures = marginFiguresVisible(canEdit, invoice.taxRegime);
  const figures = marginPreview({ price: invoice.totalAmount, cost: invoice.marginCost, vatRate: invoice.marginVatRate });
  // The VAT stored with the invoice is the one that was worked out when it was made or last edited
  const vat = invoice.marginVat?.amount ?? figures.vatOnMargin;

  return (
    <SectionCard title={t('margin.invoice.title')} description={t('margin.invoice.description')}>
      <div className="grid gap-ds-4 sm:grid-cols-2" data-testid="invoice-margin-card">
        <div className="sm:col-span-2">
          <p className="text-sm text-ds-foreground-muted">{t('margin.invoice.wording')}</p>
          <p className="text-sm font-medium" data-testid="invoice-margin-wording">{invoice.marginWording ?? t('margin.invoice.noWording')}</p>
        </div>
        {showFigures && (
          <>
            <div>
              <p className="text-sm text-ds-foreground-muted">{t('margin.cost.label')}</p>
              <p className="text-sm font-medium" data-testid="invoice-margin-cost">
                {invoice.marginCost === null ? t('margin.invoice.costMissing') : money(invoice.marginCost)}
                {invoice.marginCostSource && invoice.marginCost !== null && (
                  <span className="ms-ds-2 text-xs font-normal text-ds-foreground-muted">({t(`margin.source.${invoice.marginCostSource}`)})</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-ds-foreground-muted">{t('margin.figures.margin')}</p>
              <p className="text-sm font-medium" data-testid="invoice-margin-amount">
                {figures.margin === null ? t('margin.invoice.costMissing') : money(figures.margin)}
              </p>
            </div>
            <div>
              <p className="text-sm text-ds-foreground-muted">{t('margin.figures.vatOnMargin')}</p>
              <p className="text-sm font-medium" data-testid="invoice-margin-vat">
                {vat === null || vat === undefined ? t('margin.invoice.vatMissing') : money(vat)}
                {invoice.marginVatRate !== null && vat !== null && vat !== undefined && (
                  <span className="ms-ds-2 text-xs font-normal text-ds-foreground-muted">({invoice.marginVatRate}%)</span>
                )}
              </p>
            </div>
            <p className="text-xs text-ds-foreground-muted sm:col-span-2">{t('margin.figures.internal')}</p>
          </>
        )}
      </div>
    </SectionCard>
  );
}
