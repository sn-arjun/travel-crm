'use client';

import * as React from 'react';
import Link from 'next/link';

import { Badge, Card, CardContent } from '@/components/ui';
import {
  ReportExportButton, ReportKpis, ReportPanel, ReportTabEmptyState, ReportTabErrorState, ReportTable,
  formatReportMoney, useReport,
} from '@/components/domain/reports/shared';
import { useReportContext } from '@/components/domain/report-page-template';
import { Skeleton } from '@/components/ui';
import { formatDisplayDate } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { formatCurrency } from '@/lib/utils';

interface MarginRow {
  invoice_id: string;
  invoice_number: string;
  contact_name: string | null;
  invoice_date: string | null;
  currency: string;
  total_amount: number;
  cost: number | null;
  margin: number | null;
  vat_rate: number | null;
  vat_on_margin: number | null;
  completeness: 'complete' | 'costs_missing';
}

export interface MarginSummary {
  notice?: string;
  complete?: number;
  incomplete?: number;
  rateMissing?: number;
  totals?: Array<{ currency: string; invoices: number; total: number; cost: number; margin: number; vatOnMargin: number | null }>;
  creditNotes?: { count: number; total: number };
}

/** A blank cell for a figure that was not recorded or could not be worked out; nothing is shown as zero. */
const blank = '—';

/**
 * Margin scheme report tab (R152, design 12): one row per margin invoice of the period, the VAT blank without the agency's
 * rate, "Costs not recorded" rows, totals over the complete rows with the count of incomplete ones, and the accountant banner.
 */
export function MarginReportTab() {
  const t = useT();
  const ctx = useReportContext();
  const q = useReport<MarginRow>('margin_scheme_report');
  const summary = (q.summary ?? {}) as MarginSummary;

  if (q.loading) {
    return (
      <div className="space-y-ds-4" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (q.error) {
    return (
      <Card>
        <CardContent><ReportTabErrorState message={q.error} onRetry={q.retry} /></CardContent>
      </Card>
    );
  }
  if (q.rows.length === 0) {
    return (
      <Card>
        <CardContent><ReportTabEmptyState message={t('margin.report.empty')} /></CardContent>
      </Card>
    );
  }

  const totals = summary.totals ?? [];
  const incomplete = summary.incomplete ?? 0;
  const money = (n: number | null, currency: string) => (n === null || n === undefined ? blank : formatCurrency(n, currency));

  return (
    <div className="space-y-ds-4" data-testid="margin-report">
      <p className="rounded-ds-md border border-ds-border bg-ds-surface-sunken p-ds-3 text-sm" role="note" data-testid="margin-report-notice">
        {t('margin.report.notice')}
      </p>

      <ReportKpis
        items={[
          ...totals.map((tot) => ({
            label: totals.length > 1 ? t('margin.report.marginIn', { currency: tot.currency }) : t('margin.report.margin'),
            value: formatCurrency(tot.margin, tot.currency),
            hint: t('margin.report.completeHint', { count: tot.invoices }),
          })),
          ...totals.map((tot) => ({
            label: totals.length > 1 ? t('margin.report.vatIn', { currency: tot.currency }) : t('margin.report.vat'),
            value: tot.vatOnMargin === null ? blank : formatCurrency(tot.vatOnMargin, tot.currency),
            hint: tot.vatOnMargin === null ? t('margin.report.vatBlankHint') : t('margin.report.vatHint'),
          })),
          { label: t('margin.report.incomplete'), value: String(incomplete), hint: t('margin.report.incompleteHint') },
        ]}
      />

      <ReportPanel title={t('margin.report.title')}>
        <ReportTable<MarginRow>
          caption={t('margin.report.title')}
          rows={q.rows}
          columns={[
            {
              key: 'invoice_number',
              header: t('margin.report.col.invoice'),
              cell: (r) => <Link href={`/invoices/${r.invoice_id}`} className="text-ds-primary hover:underline">{r.invoice_number}</Link>,
            },
            { key: 'contact_name', header: t('margin.report.col.contact'), cell: (r) => r.contact_name ?? blank },
            { key: 'invoice_date', header: t('margin.report.col.date'), cell: (r) => formatDisplayDate(r.invoice_date) || blank },
            { key: 'total_amount', header: t('margin.report.col.total'), align: 'right', cell: (r) => money(r.total_amount, r.currency) },
            { key: 'cost', header: t('margin.report.col.cost'), align: 'right', cell: (r) => money(r.cost, r.currency) },
            { key: 'margin', header: t('margin.report.col.margin'), align: 'right', cell: (r) => money(r.margin, r.currency) },
            {
              key: 'vat_on_margin',
              header: t('margin.report.col.vat'),
              align: 'right',
              cell: (r) => (
                <span data-testid="margin-report-vat">{r.vat_on_margin === null ? blank : formatCurrency(r.vat_on_margin, r.currency)}</span>
              ),
            },
            {
              key: 'completeness',
              header: t('margin.report.col.status'),
              cell: (r) => (r.completeness === 'costs_missing'
                ? <Badge variant="outline" data-testid="margin-report-missing">{t('margin.report.costsMissing')}</Badge>
                : null),
            },
          ]}
        />
      </ReportPanel>

      {(summary.rateMissing ?? 0) > 0 && (
        <p className="text-sm text-ds-foreground-muted" data-testid="margin-report-no-rate">{t('margin.report.noRate')}</p>
      )}
      {summary.creditNotes && summary.creditNotes.count > 0 && (
        <p className="text-sm text-ds-foreground-muted" data-testid="margin-report-credit-notes">
          {t('margin.report.creditNotes', { count: summary.creditNotes.count, total: formatReportMoney(summary.creditNotes.total) })}
        </p>
      )}
      <div className="flex justify-end">
        <ReportExportButton
          reportId="margin_scheme_report"
          params={ctx.params}
          filenamePrefix="margin-scheme-report"
          rangeLabel={ctx.rangeLabel}
          allowPdf={false}
          size="sm"
        />
      </div>
    </div>
  );
}

/** Line under the tax report: margin invoices are not in "taxes invoiced" and live in the margin report. */
export function MarginPointer({ summary, onOpen }: { summary: Record<string, unknown> | null; onOpen: () => void }) {
  const t = useT();
  const pointer = (summary?.pointer ?? null) as { reportId?: string; invoices?: number } | null;
  if (!pointer || pointer.reportId !== 'margin_scheme_report' || !pointer.invoices) return null;
  return (
    <p className="text-sm text-ds-foreground-muted" data-testid="tax-margin-pointer">
      {t('margin.report.pointer', { count: pointer.invoices })}{' '}
      <button type="button" className="text-ds-primary hover:underline" onClick={onOpen}>{t('margin.report.pointerOpen')}</button>
    </p>
  );
}
