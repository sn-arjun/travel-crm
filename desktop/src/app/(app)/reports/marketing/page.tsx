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
  formatPercent,
  formatReportCurrency,
  formatReportMoney,
  humanize,
  sumBy,
} from '@/components/domain/reports/shared';

interface CampaignRow {
  campaign_name: string | null;
  total_leads: number;
  won_leads: number;
  total_pipeline_value: number;
  conversion_rate: number;
}

interface RoiRow {
  source: string | null;
  total_leads: number;
  won_leads: number;
  total_revenue: number;
  conversion_rate: number;
  revenue_per_lead: number;
}

interface DeliveryRow {
  channel: string;
  status: string;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  delivery_rate: number;
}

function CampaignsTab() {
  return (
    <ReportSection<CampaignRow>
      reportId="campaign_performance"
      kpis={(rows) => [
        { label: 'Campaigns', value: formatCount(rows.length) },
        { label: 'Total Leads', value: formatCount(sumBy(rows, (r) => r.total_leads)) },
        { label: 'Pipeline Value', value: formatReportCurrency(sumBy(rows, (r) => r.total_pipeline_value)) },
      ]}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: humanize(r.campaign_name) }));
        return (
          <>
            <ReportPanel title="Campaign performance">
              <BarChart
                data={data}
                categoryKey="label"
                series={[
                  { dataKey: 'total_leads', label: 'Leads' },
                  { dataKey: 'won_leads', label: 'Won' },
                ]}
              />
            </ReportPanel>
            <ReportPanel title="Campaign details">
              <ReportTable
                caption="Campaign performance"
                rows={data}
                columns={[
                  { key: 'label', header: 'Campaign' },
                  { key: 'total_leads', header: 'Leads', align: 'right', cell: (r) => formatCount(r.total_leads) },
                  { key: 'won_leads', header: 'Won', align: 'right', cell: (r) => formatCount(r.won_leads) },
                  { key: 'total_pipeline_value', header: 'Pipeline value', align: 'right', cell: (r) => formatReportMoney(r.total_pipeline_value) },
                  { key: 'conversion_rate', header: 'Conversion', align: 'right', cell: (r) => formatPercent(r.conversion_rate) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

function RoiTab() {
  return (
    <ReportSection<RoiRow>
      reportId="lead_source_roi"
      kpis={(rows) => [
        { label: 'Lead Sources', value: formatCount(rows.length) },
        { label: 'Total Leads', value: formatCount(sumBy(rows, (r) => r.total_leads)) },
        { label: 'Total Revenue', value: formatReportCurrency(sumBy(rows, (r) => r.total_revenue)) },
      ]}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: humanize(r.source) }));
        return (
          <>
            <ReportPanel title="Revenue by lead source">
              <BarChart
                data={data}
                categoryKey="label"
                series={[{ dataKey: 'total_revenue', label: 'Revenue' }]}
                valueFormatter={(v) => formatReportCurrency(v)}
                showLegend={false}
              />
            </ReportPanel>
            <ReportPanel title="Lead source ROI details">
              <ReportTable
                caption="Lead source ROI"
                rows={data}
                columns={[
                  { key: 'label', header: 'Source' },
                  { key: 'total_leads', header: 'Leads', align: 'right', cell: (r) => formatCount(r.total_leads) },
                  { key: 'won_leads', header: 'Won', align: 'right', cell: (r) => formatCount(r.won_leads) },
                  { key: 'total_revenue', header: 'Revenue', align: 'right', cell: (r) => formatReportMoney(r.total_revenue) },
                  { key: 'revenue_per_lead', header: 'Revenue per lead', align: 'right', cell: (r) => formatReportMoney(r.revenue_per_lead) },
                  { key: 'conversion_rate', header: 'Conversion', align: 'right', cell: (r) => formatPercent(r.conversion_rate) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

function DeliveryTab() {
  return (
    <ReportSection<DeliveryRow>
      reportId="bulk_message_delivery"
      emptyMessage="No bulk messages were sent in this period."
      kpis={(rows) => {
        const sent = sumBy(rows, (r) => r.sent_count);
        const delivered = sumBy(rows, (r) => r.delivered_count);
        return [
          { label: 'Sent', value: formatCount(sent) },
          { label: 'Delivered', value: formatCount(delivered) },
          { label: 'Delivery Rate', value: formatPercent(sent > 0 ? (delivered / sent) * 100 : 0, 0) },
        ];
      }}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: `${humanize(r.channel)} · ${humanize(r.status)}` }));
        return (
          <>
            <ReportPanel title="Delivery by channel">
              <BarChart
                data={data}
                categoryKey="label"
                series={[
                  { dataKey: 'delivered_count', label: 'Delivered' },
                  { dataKey: 'failed_count', label: 'Failed' },
                ]}
              />
            </ReportPanel>
            <ReportPanel title="Delivery details">
              <ReportTable
                caption="Bulk message delivery"
                rows={data}
                columns={[
                  { key: 'channel', header: 'Channel', cell: (r) => humanize(r.channel) },
                  { key: 'status', header: 'Status', cell: (r) => humanize(r.status) },
                  { key: 'sent_count', header: 'Sent', align: 'right', cell: (r) => formatCount(r.sent_count) },
                  { key: 'delivered_count', header: 'Delivered', align: 'right', cell: (r) => formatCount(r.delivered_count) },
                  { key: 'failed_count', header: 'Failed', align: 'right', cell: (r) => formatCount(r.failed_count) },
                  { key: 'delivery_rate', header: 'Delivery rate', align: 'right', cell: (r) => formatPercent(r.delivery_rate, 0) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

export default function MarketingReportsPage() {
  return (
    <ReportPageTemplate
      title="Marketing Reports"
      description="Campaign performance, lead source ROI and message delivery"
      renderExport={(ctx) => (
        <ReportExportButton
          reportId="campaign_performance"
          params={ctx.params}
          filenamePrefix="marketing-report"
          rangeLabel={ctx.rangeLabel}
        />
      )}
    >
      <Tabs defaultValue="campaigns" className="w-full">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="roi">ROI</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
        </TabsList>
        <TabsContent value="campaigns"><CampaignsTab /></TabsContent>
        <TabsContent value="roi"><RoiTab /></TabsContent>
        <TabsContent value="delivery"><DeliveryTab /></TabsContent>
      </Tabs>
    </ReportPageTemplate>
  );
}
