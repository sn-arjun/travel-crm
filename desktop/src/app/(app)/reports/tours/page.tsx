'use client';

import * as React from 'react';

import { BarChart, Tabs, TabsContent, TabsList, TabsTrigger, Tag } from '@/components/ui';
import { ReportPageTemplate } from '@/components/domain/report-page-template';
import {
  ReportExportButton,
  ReportPanel,
  ReportSection,
  ReportTable,
  formatCount,
  formatDecimal,
  formatReportMoney,
  sumBy,
} from '@/components/domain/reports/shared';
import { GroupToursGate } from '@/app/(app)/departures/_components/group-tours-gate';
import type { DepartureStatus } from '@/lib/api/departures';
import { formatDisplayDate } from '@/lib/dates';
import { departureStatusLabel, departureStatusTone } from '@/lib/departures';
import { useT } from '@/lib/i18n';

interface DepartureSeatsRow {
  departure_id: string;
  code: string;
  tour: string;
  start_date: string;
  status: DepartureStatus;
  capacity: number;
  held: number;
  confirmed: number;
  waitlisted: number;
  seats_left: number;
  load_pct: number;
  revenue_invoiced: number;
  revenue_collected: number;
}

interface TourSalesRow {
  tour_id: string;
  tour_code: string;
  tour: string;
  departures_run: number;
  seats_sold: number;
  avg_load_pct: number;
  revenue_invoiced: number;
  revenue_collected: number;
}

interface ExtrasRow {
  extra_id: string;
  extra: string;
  tour: string;
  quantity: number;
  passengers: number;
  revenue: number;
}

const pct = (n: number) => `${formatDecimal(n)}%`;

function DepartureSeatsTab() {
  const t = useT();
  return (
    <ReportSection<DepartureSeatsRow>
      reportId="departure_seats"
      emptyMessage={t('reports.tours.seats.empty')}
      kpis={(rows) => {
        const capacity = sumBy(rows, (r) => r.capacity);
        const used = sumBy(rows, (r) => r.held + r.confirmed);
        return [
          { label: t('reports.tours.seats.kpiDepartures'), value: formatCount(rows.length) },
          { label: t('reports.tours.seats.kpiSeatsLeft'), value: formatCount(sumBy(rows, (r) => r.seats_left)) },
          { label: t('reports.tours.seats.kpiLoad'), value: pct(capacity > 0 ? (used / capacity) * 100 : 0) },
          { label: t('reports.tours.seats.kpiRevenue'), value: formatReportMoney(sumBy(rows, (r) => r.revenue_invoiced)), hint: t('reports.tours.seats.kpiCollected', { amount: formatReportMoney(sumBy(rows, (r) => r.revenue_collected)) }) },
        ];
      }}
    >
      {(rows) => (
        <>
          <ReportPanel title={t('reports.tours.seats.chart')}>
            <BarChart
              data={rows}
              categoryKey="code"
              stacked
              series={[
                { dataKey: 'confirmed', label: t('reports.tours.seats.confirmed') },
                { dataKey: 'held', label: t('reports.tours.seats.held') },
                { dataKey: 'seats_left', label: t('reports.tours.seats.left') },
              ]}
            />
          </ReportPanel>
          <ReportPanel title={t('reports.tours.seats.details')}>
            <ReportTable
              caption={t('reports.tours.seats.details')}
              rows={rows}
              columns={[
                { key: 'code', header: t('reports.tours.col.departure') },
                { key: 'tour', header: t('reports.tours.col.tour') },
                { key: 'start_date', header: t('reports.tours.col.date'), cell: (r) => formatDisplayDate(r.start_date) },
                { key: 'status', header: t('reports.tours.col.status'), cell: (r) => <Tag tone={departureStatusTone(r.status)} size="sm">{departureStatusLabel(r.status, t)}</Tag> },
                { key: 'capacity', header: t('reports.tours.col.capacity'), align: 'right', cell: (r) => formatCount(r.capacity) },
                { key: 'confirmed', header: t('reports.tours.col.confirmed'), align: 'right', cell: (r) => formatCount(r.confirmed) },
                { key: 'held', header: t('reports.tours.col.held'), align: 'right', cell: (r) => formatCount(r.held) },
                { key: 'waitlisted', header: t('reports.tours.col.waitlisted'), align: 'right', cell: (r) => formatCount(r.waitlisted) },
                { key: 'seats_left', header: t('reports.tours.col.left'), align: 'right', cell: (r) => formatCount(r.seats_left) },
                { key: 'load_pct', header: t('reports.tours.col.load'), align: 'right', cell: (r) => pct(r.load_pct) },
                { key: 'revenue_invoiced', header: t('reports.tours.col.invoiced'), align: 'right', cell: (r) => formatReportMoney(r.revenue_invoiced) },
                { key: 'revenue_collected', header: t('reports.tours.col.collected'), align: 'right', cell: (r) => formatReportMoney(r.revenue_collected) },
              ]}
            />
          </ReportPanel>
        </>
      )}
    </ReportSection>
  );
}

function TourSalesTab() {
  const t = useT();
  return (
    <ReportSection<TourSalesRow>
      reportId="tour_sales"
      emptyMessage={t('reports.tours.sales.empty')}
      kpis={(rows) => [
        { label: t('reports.tours.sales.kpiTours'), value: formatCount(rows.length) },
        { label: t('reports.tours.sales.kpiDepartures'), value: formatCount(sumBy(rows, (r) => r.departures_run)) },
        { label: t('reports.tours.sales.kpiSeats'), value: formatCount(sumBy(rows, (r) => r.seats_sold)) },
        { label: t('reports.tours.sales.kpiRevenue'), value: formatReportMoney(sumBy(rows, (r) => r.revenue_invoiced)) },
      ]}
    >
      {(rows) => (
        <>
          <ReportPanel title={t('reports.tours.sales.chart')}>
            <BarChart data={rows} categoryKey="tour_code" series={[{ dataKey: 'seats_sold', label: t('reports.tours.col.seatsSold') }]} showLegend={false} />
          </ReportPanel>
          <ReportPanel title={t('reports.tours.sales.details')}>
            <ReportTable
              caption={t('reports.tours.sales.details')}
              rows={rows}
              columns={[
                { key: 'tour_code', header: t('reports.tours.col.code') },
                { key: 'tour', header: t('reports.tours.col.tour') },
                { key: 'departures_run', header: t('reports.tours.col.departuresRun'), align: 'right', cell: (r) => formatCount(r.departures_run) },
                { key: 'seats_sold', header: t('reports.tours.col.seatsSold'), align: 'right', cell: (r) => formatCount(r.seats_sold) },
                { key: 'avg_load_pct', header: t('reports.tours.col.avgLoad'), align: 'right', cell: (r) => pct(r.avg_load_pct) },
                { key: 'revenue_invoiced', header: t('reports.tours.col.invoiced'), align: 'right', cell: (r) => formatReportMoney(r.revenue_invoiced) },
                { key: 'revenue_collected', header: t('reports.tours.col.collected'), align: 'right', cell: (r) => formatReportMoney(r.revenue_collected) },
              ]}
            />
          </ReportPanel>
        </>
      )}
    </ReportSection>
  );
}

function ExtrasTab() {
  const t = useT();
  return (
    <ReportSection<ExtrasRow>
      reportId="extras_sales"
      emptyMessage={t('reports.tours.extras.empty')}
      kpis={(rows) => [
        { label: t('reports.tours.extras.kpiExtras'), value: formatCount(rows.length) },
        { label: t('reports.tours.extras.kpiQuantity'), value: formatCount(sumBy(rows, (r) => r.quantity)) },
        { label: t('reports.tours.extras.kpiRevenue'), value: formatReportMoney(sumBy(rows, (r) => r.revenue)) },
      ]}
    >
      {(rows) => (
        <ReportPanel title={t('reports.tours.extras.details')}>
          <ReportTable
            caption={t('reports.tours.extras.details')}
            rows={rows}
            columns={[
              { key: 'extra', header: t('reports.tours.col.extra') },
              { key: 'tour', header: t('reports.tours.col.tour') },
              { key: 'quantity', header: t('reports.tours.col.quantity'), align: 'right', cell: (r) => formatCount(r.quantity) },
              { key: 'passengers', header: t('reports.tours.col.passengers'), align: 'right', cell: (r) => formatCount(r.passengers) },
              { key: 'revenue', header: t('reports.tours.col.revenue'), align: 'right', cell: (r) => formatReportMoney(r.revenue) },
            ]}
          />
        </ReportPanel>
      )}
    </ReportSection>
  );
}

const EXPORT_IDS: Record<string, string> = { seats: 'departure_seats', sales: 'tour_sales', extras: 'extras_sales' };

export default function TourReportsPage() {
  const t = useT();
  const [tab, setTab] = React.useState('seats');
  return (
    <GroupToursGate>
      <ReportPageTemplate
        title={t('reports.tours.title')}
        description={t('reports.tours.description')}
        defaultPeriod="thisYear"
        renderExport={(ctx) => (
          <ReportExportButton reportId={EXPORT_IDS[tab] ?? 'departure_seats'} params={ctx.params} filenamePrefix={`tour-report-${tab}`} rangeLabel={ctx.rangeLabel} />
        )}
      >
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="seats" data-testid="tours-report-seats">{t('reports.tours.tab.seats')}</TabsTrigger>
            <TabsTrigger value="sales" data-testid="tours-report-sales">{t('reports.tours.tab.sales')}</TabsTrigger>
            <TabsTrigger value="extras" data-testid="tours-report-extras">{t('reports.tours.tab.extras')}</TabsTrigger>
          </TabsList>
          <TabsContent value="seats"><DepartureSeatsTab /></TabsContent>
          <TabsContent value="sales"><TourSalesTab /></TabsContent>
          <TabsContent value="extras"><ExtrasTab /></TabsContent>
        </Tabs>
      </ReportPageTemplate>
    </GroupToursGate>
  );
}
