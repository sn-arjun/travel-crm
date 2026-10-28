'use client';

import * as React from 'react';

import { BarChart, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
import { ReportPageTemplate } from '@/components/domain/report-page-template';
import {
  ReportExportButton,
  ReportPanel,
  ReportSection,
  ReportTable,
  formatCount,
  formatDecimal,
  formatPercent,
  humanize,
  sumBy,
} from '@/components/domain/reports/shared';
import { formatDisplayDate } from '@/lib/dates';

interface StatusRow {
  status: string;
  country: string | null;
  application_count: number;
}

interface PendingRow {
  application_id: string;
  country: string | null;
  status: string;
  created_at: string;
  travel_date: string | null;
  total_checklist_items: number;
  pending_items: number;
  age_days: number;
}

interface SuccessRow {
  country: string | null;
  total_applications: number;
  approved: number;
  rejected: number;
  success_rate: number;
  avg_processing_days: number | null;
}

function StatusTab() {
  return (
    <ReportSection<StatusRow>
      reportId="visa_status_summary"
      emptyMessage="No visa applications were created in this period."
      kpis={(rows) => {
        const count = (s: string) => sumBy(rows, (r) => (r.status === s ? r.application_count : 0));
        return [
          { label: 'Applications', value: formatCount(sumBy(rows, (r) => r.application_count)) },
          { label: 'Approved', value: formatCount(count('approved')) },
          { label: 'Rejected', value: formatCount(count('rejected')) },
          { label: 'In Progress', value: formatCount(sumBy(rows, (r) => (['approved', 'rejected'].includes(r.status) ? 0 : r.application_count))) },
        ];
      }}
    >
      {(rows) => {
        const countries = [...new Set(rows.map((r) => r.country ?? 'Unspecified'))];
        const statuses = [...new Set(rows.map((r) => r.status))];
        const pivot = countries.map((country) => {
          const row: Record<string, string | number> = { country };
          for (const status of statuses) {
            row[status] = sumBy(rows, (r) => ((r.country ?? 'Unspecified') === country && r.status === status ? r.application_count : 0));
          }
          return row;
        });
        return (
          <>
            <ReportPanel title="Applications by country and status">
              <BarChart
                data={pivot}
                categoryKey="country"
                stacked
                series={statuses.map((s) => ({ dataKey: s, label: humanize(s) }))}
              />
            </ReportPanel>
            <ReportPanel title="Status details">
              <ReportTable
                caption="Visa status summary"
                rows={rows}
                columns={[
                  { key: 'country', header: 'Country', cell: (r) => r.country ?? 'Unspecified' },
                  { key: 'status', header: 'Status', cell: (r) => humanize(r.status) },
                  { key: 'application_count', header: 'Applications', align: 'right', cell: (r) => formatCount(r.application_count) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

function PendingTab() {
  return (
    <ReportSection<PendingRow>
      reportId="pending_documents"
      emptyMessage="No visa application is waiting on documents."
      kpis={(rows) => [
        { label: 'Pending Applications', value: formatCount(rows.length) },
        { label: 'Avg Age', value: `${formatDecimal(rows.length ? sumBy(rows, (r) => r.age_days) / rows.length : 0, 0)} days` },
        { label: 'Pending Checklist Items', value: formatCount(sumBy(rows, (r) => r.pending_items)) },
      ]}
    >
      {(rows) => (
        <ReportPanel title="Applications waiting on documents">
          <ReportTable
            caption="Pending visa documents"
            rows={rows}
            columns={[
              { key: 'country', header: 'Country', cell: (r) => r.country ?? 'Unspecified' },
              { key: 'status', header: 'Status', cell: (r) => humanize(r.status) },
              { key: 'pending_items', header: 'Pending items', align: 'right', cell: (r) => `${formatCount(r.pending_items)} of ${formatCount(r.total_checklist_items)}` },
              { key: 'travel_date', header: 'Travel date', cell: (r) => (r.travel_date ? formatDisplayDate(r.travel_date) : '—') },
              { key: 'created_at', header: 'Created', cell: (r) => formatDisplayDate(r.created_at) },
              { key: 'age_days', header: 'Age (days)', align: 'right', cell: (r) => formatCount(r.age_days) },
            ]}
          />
        </ReportPanel>
      )}
    </ReportSection>
  );
}

function SuccessTab() {
  return (
    <ReportSection<SuccessRow>
      reportId="visa_success_rate"
      emptyMessage="No visa decisions were recorded in this period."
      kpis={(rows) => {
        const approved = sumBy(rows, (r) => r.approved);
        const decided = approved + sumBy(rows, (r) => r.rejected);
        return [
          { label: 'Applications', value: formatCount(sumBy(rows, (r) => r.total_applications)) },
          { label: 'Approved', value: formatCount(approved) },
          { label: 'Success Rate', value: formatPercent(decided > 0 ? (approved / decided) * 100 : 0, 0), hint: 'Approved of decided' },
        ];
      }}
    >
      {(rows) => (
        <>
          <ReportPanel title="Visa success rate by country">
            <BarChart
              data={rows.map((r) => ({ ...r, label: r.country ?? 'Unspecified' }))}
              categoryKey="label"
              series={[{ dataKey: 'success_rate', label: 'Success rate' }]}
              valueFormatter={(v) => formatPercent(v, 0)}
              showLegend={false}
            />
          </ReportPanel>
          <ReportPanel title="Success rate details">
            <ReportTable
              caption="Visa success rate"
              rows={rows}
              columns={[
                { key: 'country', header: 'Country', cell: (r) => r.country ?? 'Unspecified' },
                { key: 'total_applications', header: 'Applications', align: 'right', cell: (r) => formatCount(r.total_applications) },
                { key: 'approved', header: 'Approved', align: 'right', cell: (r) => formatCount(r.approved) },
                { key: 'rejected', header: 'Rejected', align: 'right', cell: (r) => formatCount(r.rejected) },
                { key: 'success_rate', header: 'Success rate', align: 'right', cell: (r) => formatPercent(r.success_rate, 0) },
                { key: 'avg_processing_days', header: 'Avg processing (days)', align: 'right', cell: (r) => (r.avg_processing_days === null ? '—' : formatDecimal(r.avg_processing_days)) },
              ]}
            />
          </ReportPanel>
        </>
      )}
    </ReportSection>
  );
}

export default function VisaReportsPage() {
  return (
    <ReportPageTemplate
      title="Visa Reports"
      description="Visa applications, pending documents and approval rates"
      renderExport={(ctx) => (
        <ReportExportButton
          reportId="visa_status_summary"
          params={ctx.params}
          filenamePrefix="visa-report"
          rangeLabel={ctx.rangeLabel}
        />
      )}
    >
      <Tabs defaultValue="status" className="w-full">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="status">Status Summary</TabsTrigger>
          <TabsTrigger value="pending">Pending Documents</TabsTrigger>
          <TabsTrigger value="success">Success Rate</TabsTrigger>
        </TabsList>
        <TabsContent value="status"><StatusTab /></TabsContent>
        <TabsContent value="pending"><PendingTab /></TabsContent>
        <TabsContent value="success"><SuccessTab /></TabsContent>
      </Tabs>
    </ReportPageTemplate>
  );
}
