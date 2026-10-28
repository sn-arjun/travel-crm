'use client';

import * as React from 'react';

import { BarChart, PieChart } from '@/components/ui';
import { ReportPageTemplate } from '@/components/domain/report-page-template';
import {
  ReportExportButton,
  ReportPanel,
  ReportPanelGrid,
  ReportSection,
  ReportTable,
  formatCount,
  formatDecimal,
  formatReportCurrency,
  formatReportMoney,
  humanize,
  sumBy,
} from '@/components/domain/reports/shared';

interface PipelineRow {
  status: string;
  lead_count: number;
  total_budget_potential: number;
  avg_days_in_stage: number;
}

const CLOSED = new Set(['won', 'lost']);

export default function PipelineReportPage() {
  return (
    <ReportPageTemplate
      title="Pipeline Report"
      description="Where every lead sits in the sales pipeline"
      renderExport={(ctx) => (
        <ReportExportButton
          reportId="pipeline_summary"
          params={ctx.params}
          filenamePrefix="pipeline-report"
          rangeLabel={ctx.rangeLabel}
        />
      )}
    >
      <ReportSection<PipelineRow>
        reportId="pipeline_summary"
        kpis={(rows) => {
          const open = rows.filter((r) => !CLOSED.has(r.status));
          const days = sumBy(open, (r) => r.avg_days_in_stage * r.lead_count);
          const openLeads = sumBy(open, (r) => r.lead_count);
          return [
            { label: 'Total Active Leads', value: formatCount(openLeads), hint: 'Excludes won and lost' },
            { label: 'Total Pipeline Value', value: formatReportCurrency(sumBy(open, (r) => r.total_budget_potential)), hint: 'Combined lead budgets' },
            { label: 'Avg Days In Stage', value: formatDecimal(openLeads > 0 ? days / openLeads : 0), hint: 'Across open leads' },
          ];
        }}
      >
        {(rows) => {
          const data = rows.map((r) => ({ ...r, label: humanize(r.status) }));
          return (
            <>
              <ReportPanelGrid>
                <ReportPanel title="Lead count by status">
                  <PieChart data={data} dataKey="lead_count" nameKey="label" donut />
                </ReportPanel>
                <ReportPanel title="Budget potential by status">
                  <BarChart
                    data={data}
                    categoryKey="label"
                    series={[{ dataKey: 'total_budget_potential', label: 'Budget potential' }]}
                    valueFormatter={(v) => formatReportCurrency(v)}
                    showLegend={false}
                  />
                </ReportPanel>
              </ReportPanelGrid>
              <ReportPanel title="Pipeline stages">
                <ReportTable
                  caption="Pipeline stages"
                  rows={data}
                  columns={[
                    { key: 'label', header: 'Status' },
                    { key: 'lead_count', header: 'Leads', align: 'right', cell: (r) => formatCount(r.lead_count) },
                    { key: 'total_budget_potential', header: 'Budget potential', align: 'right', cell: (r) => formatReportMoney(r.total_budget_potential) },
                    { key: 'avg_days_in_stage', header: 'Avg days in stage', align: 'right', cell: (r) => formatDecimal(r.avg_days_in_stage) },
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
