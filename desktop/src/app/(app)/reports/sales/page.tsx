'use client';

import * as React from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger, AreaChart, BarChart, LineChart, PieChart } from '@/components/ui';
import { ReportPageTemplate } from '@/components/domain/report-page-template';
import {
  ReportExportButton,
  ReportPanel,
  ReportPanelGrid,
  ReportSection,
  ReportTable,
  deltaOf,
  formatCount,
  formatDestinations,
  formatMonthKey,
  formatPercent,
  formatReportCurrency,
  formatReportMoney,
  humanize,
  sumBy,
  useUserNames,
} from '@/components/domain/reports/shared';

interface SalesSummaryRow {
  assigned_to: string | null;
  total_leads: number;
  won_leads: number;
  lost_leads: number;
  total_revenue: number;
  avg_deal_size: number;
  conversion_rate: number;
}

interface DestinationRow {
  destination: string | null;
  lead_count: number;
  total_revenue: number;
}

interface SalespersonRow {
  salesperson: string | null;
  total_leads: number;
  won_deals: number;
  lost_deals: number;
  total_revenue: number;
  avg_deal_size: number;
  conversion_rate: number;
}

interface TripTypeRow {
  trip_type: string | null;
  bookings: number;
  total_revenue: number;
  conversion_rate: number;
}

interface SourceRow {
  source: string | null;
  total_leads: number;
  won_leads: number;
  total_revenue: number;
  conversion_rate: number;
}

interface DealSizeRow {
  month: string;
  won_deals: number;
  avg_deal_size: number;
  total_revenue: number;
}

interface ForecastRow {
  expected_close_month: string | null;
  active_leads: number;
  pipeline_value: number;
  projected_revenue: number;
}

interface WinLossRow {
  status: string;
  lost_reason: string | null;
  count: number;
  total_value: number;
}

function SummaryTab() {
  const nameOf = useUserNames();
  return (
    <ReportSection<SalesSummaryRow>
      reportId="sales_summary"
      comparable
      kpis={(rows, prev) => {
        const revenue = sumBy(rows, (r) => r.total_revenue);
        const leads = sumBy(rows, (r) => r.total_leads);
        const won = sumBy(rows, (r) => r.won_leads);
        return [
          {
            label: 'Total Revenue',
            value: formatReportCurrency(revenue),
            hint: 'From won deals',
            delta: deltaOf(rows, prev, (r) => r.total_revenue),
          },
          { label: 'Total Leads', value: formatCount(leads), hint: 'Created in period', delta: deltaOf(rows, prev, (r) => r.total_leads) },
          { label: 'Deals Won', value: formatCount(won), hint: `${formatCount(sumBy(rows, (r) => r.lost_leads))} lost`, delta: deltaOf(rows, prev, (r) => r.won_leads) },
          { label: 'Conversion Rate', value: formatPercent(leads > 0 ? (won / leads) * 100 : 0), hint: 'Won / total leads' },
        ];
      }}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: nameOf(r.assigned_to) }));
        return (
          <>
            <ReportPanel title="Revenue by salesperson" description="Won-deal revenue for the selected period">
              <BarChart
                data={data}
                categoryKey="label"
                series={[{ dataKey: 'total_revenue', label: 'Revenue' }]}
                valueFormatter={(v) => formatReportCurrency(v)}
                showLegend={false}
              />
            </ReportPanel>
            <ReportPanel title="Sales summary">
              <ReportTable
                caption="Sales summary by salesperson"
                rows={data}
                columns={[
                  { key: 'label', header: 'Salesperson' },
                  { key: 'total_leads', header: 'Leads', align: 'right', cell: (r) => formatCount(r.total_leads) },
                  { key: 'won_leads', header: 'Won', align: 'right', cell: (r) => formatCount(r.won_leads) },
                  { key: 'lost_leads', header: 'Lost', align: 'right', cell: (r) => formatCount(r.lost_leads) },
                  { key: 'total_revenue', header: 'Revenue', align: 'right', cell: (r) => formatReportMoney(r.total_revenue) },
                  { key: 'avg_deal_size', header: 'Avg deal size', align: 'right', cell: (r) => formatReportMoney(r.avg_deal_size) },
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

function DestinationTab() {
  return (
    <ReportSection<DestinationRow> reportId="sales_by_destination">
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: formatDestinations(r.destination) }));
        return (
          <>
            <ReportPanel title="Top destinations by revenue">
              <BarChart
                data={data}
                categoryKey="label"
                series={[{ dataKey: 'total_revenue', label: 'Revenue' }]}
                valueFormatter={(v) => formatReportCurrency(v)}
                showLegend={false}
              />
            </ReportPanel>
            <ReportPanel title="Destination details">
              <ReportTable
                caption="Sales by destination"
                rows={data}
                columns={[
                  { key: 'label', header: 'Destination' },
                  { key: 'lead_count', header: 'Leads', align: 'right', cell: (r) => formatCount(r.lead_count) },
                  { key: 'total_revenue', header: 'Revenue', align: 'right', cell: (r) => formatReportMoney(r.total_revenue) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

function SalespersonTab() {
  const nameOf = useUserNames();
  return (
    <ReportSection<SalespersonRow> reportId="sales_by_salesperson">
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: nameOf(r.salesperson) }));
        return (
          <>
            <ReportPanel title="Won and lost deals by salesperson">
              <BarChart
                data={data}
                categoryKey="label"
                series={[
                  { dataKey: 'won_deals', label: 'Won' },
                  { dataKey: 'lost_deals', label: 'Lost' },
                ]}
              />
            </ReportPanel>
            <ReportPanel title="Salesperson details">
              <ReportTable
                caption="Sales by salesperson"
                rows={data}
                columns={[
                  { key: 'label', header: 'Salesperson' },
                  { key: 'total_leads', header: 'Leads', align: 'right', cell: (r) => formatCount(r.total_leads) },
                  { key: 'won_deals', header: 'Won', align: 'right', cell: (r) => formatCount(r.won_deals) },
                  { key: 'lost_deals', header: 'Lost', align: 'right', cell: (r) => formatCount(r.lost_deals) },
                  { key: 'total_revenue', header: 'Revenue', align: 'right', cell: (r) => formatReportMoney(r.total_revenue) },
                  { key: 'avg_deal_size', header: 'Avg deal size', align: 'right', cell: (r) => formatReportMoney(r.avg_deal_size) },
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

function TripTypeTab() {
  return (
    <ReportSection<TripTypeRow> reportId="sales_by_trip_type">
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: humanize(r.trip_type) }));
        return (
          <ReportPanelGrid>
            <ReportPanel title="Revenue by trip type">
              <PieChart
                data={data.filter((r) => r.total_revenue > 0)}
                dataKey="total_revenue"
                nameKey="label"
                donut
                valueFormatter={(v) => formatReportCurrency(v)}
                emptyMessage="No revenue booked yet"
              />
            </ReportPanel>
            <ReportPanel title="Trip type details">
              <ReportTable
                caption="Sales by trip type"
                rows={data}
                columns={[
                  { key: 'label', header: 'Trip type' },
                  { key: 'bookings', header: 'Leads', align: 'right', cell: (r) => formatCount(r.bookings) },
                  { key: 'total_revenue', header: 'Revenue', align: 'right', cell: (r) => formatReportMoney(r.total_revenue) },
                  { key: 'conversion_rate', header: 'Conversion', align: 'right', cell: (r) => formatPercent(r.conversion_rate) },
                ]}
              />
            </ReportPanel>
          </ReportPanelGrid>
        );
      }}
    </ReportSection>
  );
}

function SourceTab() {
  return (
    <ReportSection<SourceRow> reportId="sales_by_source">
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: humanize(r.source) }));
        return (
          <ReportPanelGrid>
            <ReportPanel title="Leads by source">
              <PieChart data={data} dataKey="total_leads" nameKey="label" donut />
            </ReportPanel>
            <ReportPanel title="Source details">
              <ReportTable
                caption="Sales by source"
                rows={data}
                columns={[
                  { key: 'label', header: 'Source' },
                  { key: 'total_leads', header: 'Leads', align: 'right', cell: (r) => formatCount(r.total_leads) },
                  { key: 'won_leads', header: 'Won', align: 'right', cell: (r) => formatCount(r.won_leads) },
                  { key: 'total_revenue', header: 'Revenue', align: 'right', cell: (r) => formatReportMoney(r.total_revenue) },
                  { key: 'conversion_rate', header: 'Conversion', align: 'right', cell: (r) => formatPercent(r.conversion_rate) },
                ]}
              />
            </ReportPanel>
          </ReportPanelGrid>
        );
      }}
    </ReportSection>
  );
}

function DealSizeTab() {
  return (
    <ReportSection<DealSizeRow> reportId="avg_deal_size" emptyMessage="No deals were won in this period.">
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: formatMonthKey(r.month) }));
        return (
          <>
            <ReportPanel title="Average deal size by month">
              <LineChart
                data={data}
                categoryKey="label"
                series={[{ dataKey: 'avg_deal_size', label: 'Average deal size' }]}
                valueFormatter={(v) => formatReportCurrency(v)}
                showLegend={false}
              />
            </ReportPanel>
            <ReportPanel title="Deal size details">
              <ReportTable
                caption="Average deal size by month"
                rows={data}
                columns={[
                  { key: 'label', header: 'Month' },
                  { key: 'won_deals', header: 'Won deals', align: 'right', cell: (r) => formatCount(r.won_deals) },
                  { key: 'avg_deal_size', header: 'Avg deal size', align: 'right', cell: (r) => formatReportMoney(r.avg_deal_size) },
                  { key: 'total_revenue', header: 'Revenue', align: 'right', cell: (r) => formatReportMoney(r.total_revenue) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

function ForecastTab() {
  return (
    <ReportSection<ForecastRow> reportId="revenue_forecast" emptyMessage="No open leads with an expected close date.">
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: r.expected_close_month ? formatMonthKey(r.expected_close_month) : 'No date' }));
        return (
          <>
            <ReportPanel title="Pipeline value and projected revenue by expected close month">
              <AreaChart
                data={data}
                categoryKey="label"
                series={[
                  { dataKey: 'pipeline_value', label: 'Pipeline value' },
                  { dataKey: 'projected_revenue', label: 'Projected revenue' },
                ]}
                valueFormatter={(v) => formatReportCurrency(v)}
              />
            </ReportPanel>
            <ReportPanel title="Forecast details">
              <ReportTable
                caption="Revenue forecast"
                rows={data}
                columns={[
                  { key: 'label', header: 'Expected close' },
                  { key: 'active_leads', header: 'Open leads', align: 'right', cell: (r) => formatCount(r.active_leads) },
                  { key: 'pipeline_value', header: 'Pipeline value', align: 'right', cell: (r) => formatReportMoney(r.pipeline_value) },
                  { key: 'projected_revenue', header: 'Projected revenue', align: 'right', cell: (r) => formatReportMoney(r.projected_revenue) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

function WinLossTab() {
  return (
    <ReportSection<WinLossRow> reportId="win_loss_analysis" emptyMessage="No won or lost deals in this period.">
      {(rows) => {
        const data = rows.map((r) => ({
          ...r,
          label: r.status === 'lost' ? `Lost: ${r.lost_reason ?? 'No reason recorded'}` : humanize(r.status),
        }));
        return (
          <>
            <ReportPanel title="Deals by outcome">
              <BarChart
                data={data}
                categoryKey="label"
                series={[{ dataKey: 'count', label: 'Deals' }]}
                showLegend={false}
              />
            </ReportPanel>
            <ReportPanel title="Win / loss details">
              <ReportTable
                caption="Win and loss analysis"
                rows={data}
                columns={[
                  { key: 'label', header: 'Outcome' },
                  { key: 'count', header: 'Deals', align: 'right', cell: (r) => formatCount(r.count) },
                  { key: 'total_value', header: 'Value', align: 'right', cell: (r) => formatReportMoney(r.total_value) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

export default function SalesReportsPage() {
  return (
    <ReportPageTemplate
      title="Sales Reports"
      description="Detailed sales analysis and performance metrics"
      showCompare
      renderExport={(ctx) => (
        <ReportExportButton
          reportId="sales_summary"
          params={ctx.params}
          filenamePrefix="sales-report"
          rangeLabel={ctx.rangeLabel}
          allowPdf={false}
        />
      )}
    >
      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="destination">Destination</TabsTrigger>
          <TabsTrigger value="salesperson">Salesperson</TabsTrigger>
          <TabsTrigger value="triptype">Trip Type</TabsTrigger>
          <TabsTrigger value="source">Source</TabsTrigger>
          <TabsTrigger value="dealsize">Deal Size</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="winloss">Win/Loss</TabsTrigger>
        </TabsList>
        <TabsContent value="summary"><SummaryTab /></TabsContent>
        <TabsContent value="destination"><DestinationTab /></TabsContent>
        <TabsContent value="salesperson"><SalespersonTab /></TabsContent>
        <TabsContent value="triptype"><TripTypeTab /></TabsContent>
        <TabsContent value="source"><SourceTab /></TabsContent>
        <TabsContent value="dealsize"><DealSizeTab /></TabsContent>
        <TabsContent value="forecast"><ForecastTab /></TabsContent>
        <TabsContent value="winloss"><WinLossTab /></TabsContent>
      </Tabs>
    </ReportPageTemplate>
  );
}
