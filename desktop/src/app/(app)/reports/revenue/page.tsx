'use client';

import * as React from 'react';

import { BarChart } from '@/components/ui';
import { ReportPageTemplate } from '@/components/domain/report-page-template';
import {
  ReportExportButton,
  ReportPanel,
  ReportSection,
  ReportTable,
  formatCount,
  formatReportCurrency,
  formatReportMoney,
  humanize,
  sumBy,
} from '@/components/domain/reports/shared';

interface RevenueRow {
  status: string;
  type: string;
  invoice_count: number;
  total_amount: number;
  total_outstanding: number;
}

const INVOICED_TYPES = new Set(['tax_invoice', 'proforma']);

export default function RevenueReportPage() {
  return (
    <ReportPageTemplate
      title="Revenue Report"
      description="Invoiced revenue and what is still outstanding"
      renderExport={(ctx) => (
        <ReportExportButton
          reportId="revenue_summary"
          params={ctx.params}
          filenamePrefix="revenue-report"
          rangeLabel={ctx.rangeLabel}
        />
      )}
    >
      <ReportSection<RevenueRow>
        reportId="revenue_summary"
        kpis={(rows) => [
          {
            label: 'Total Invoiced',
            value: formatReportCurrency(
              sumBy(rows, (r) => (INVOICED_TYPES.has(r.type) && r.status !== 'cancelled' ? r.total_amount : 0)),
            ),
            hint: 'Tax invoices and proformas',
          },
          { label: 'Outstanding', value: formatReportCurrency(sumBy(rows, (r) => r.total_outstanding)), hint: 'Still to be collected' },
          { label: 'Invoice Count', value: formatCount(sumBy(rows, (r) => r.invoice_count)), hint: 'All statuses' },
        ]}
      >
        {(rows) => {
          const data = rows.map((r) => ({ ...r, label: `${humanize(r.status)} · ${humanize(r.type)}` }));
          return (
            <>
              <ReportPanel title="Revenue by status">
                <BarChart
                  data={data}
                  categoryKey="label"
                  series={[
                    { dataKey: 'total_amount', label: 'Amount' },
                    { dataKey: 'total_outstanding', label: 'Outstanding' },
                  ]}
                  valueFormatter={(v) => formatReportCurrency(v)}
                />
              </ReportPanel>
              <ReportPanel title="Revenue breakdown">
                <ReportTable
                  caption="Revenue breakdown"
                  rows={data}
                  columns={[
                    { key: 'status', header: 'Status', cell: (r) => humanize(r.status) },
                    { key: 'type', header: 'Type', cell: (r) => humanize(r.type) },
                    { key: 'invoice_count', header: 'Invoices', align: 'right', cell: (r) => formatCount(r.invoice_count) },
                    { key: 'total_amount', header: 'Amount', align: 'right', cell: (r) => formatReportMoney(r.total_amount) },
                    { key: 'total_outstanding', header: 'Outstanding', align: 'right', cell: (r) => formatReportMoney(r.total_outstanding) },
                  ]}
                />
              </ReportPanel>
            </>
          );
        }}
      </ReportSection>
    </ReportPageTemplate>
  );
}
