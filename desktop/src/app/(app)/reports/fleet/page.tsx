'use client';

import * as React from 'react';

import { BarChart, PieChart, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui';
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

interface UtilizationRow {
  vehicle_reg: string;
  type: string | null;
  trip_count: number;
  estimated_revenue: number;
}

interface DriverRow {
  driver_name: string;
  license_number: string | null;
  trip_count: number;
  avg_rating: number | null;
}

interface AvailabilityRow {
  type: string | null;
  status: string;
  vehicle_count: number;
  available: number;
  in_maintenance: number;
  inactive: number;
}

interface TripCostRow {
  trip_type: string | null;
  trip_count: number;
  avg_distance_km: number | null;
  avg_trip_cost: number | null;
  total_cost: number;
}

function UtilizationTab() {
  return (
    <ReportSection<UtilizationRow>
      reportId="fleet_utilization"
      emptyMessage="No vehicle ran a trip in this period."
      kpis={(rows) => [
        { label: 'Vehicles Used', value: formatCount(rows.length) },
        { label: 'Total Trips', value: formatCount(sumBy(rows, (r) => r.trip_count)) },
        { label: 'Est. Revenue', value: formatReportCurrency(sumBy(rows, (r) => r.estimated_revenue)), hint: 'From trip rates' },
      ]}
    >
      {(rows) => (
        <>
          <ReportPanel title="Trips per vehicle">
            <BarChart
              data={rows}
              categoryKey="vehicle_reg"
              series={[{ dataKey: 'trip_count', label: 'Trips' }]}
              showLegend={false}
            />
          </ReportPanel>
          <ReportPanel title="Fleet utilization details">
            <ReportTable
              caption="Fleet utilization"
              rows={rows}
              columns={[
                { key: 'vehicle_reg', header: 'Vehicle' },
                { key: 'type', header: 'Type', cell: (r) => humanize(r.type) },
                { key: 'trip_count', header: 'Trips', align: 'right', cell: (r) => formatCount(r.trip_count) },
                { key: 'estimated_revenue', header: 'Est. revenue', align: 'right', cell: (r) => formatReportMoney(r.estimated_revenue) },
              ]}
            />
          </ReportPanel>
        </>
      )}
    </ReportSection>
  );
}

function DriverTab() {
  return (
    <ReportSection<DriverRow>
      reportId="driver_performance"
      emptyMessage="No driver completed a trip in this period."
      kpis={(rows) => {
        const rated = rows.filter((r) => r.avg_rating !== null);
        return [
          { label: 'Drivers', value: formatCount(rows.length) },
          { label: 'Total Trips', value: formatCount(sumBy(rows, (r) => r.trip_count)) },
          { label: 'Avg Rating', value: rated.length ? `${formatDecimal(sumBy(rated, (r) => r.avg_rating) / rated.length)} / 5` : '—' },
        ];
      }}
    >
      {(rows) => (
        <>
          <ReportPanel title="Trips per driver">
            <BarChart
              data={rows}
              categoryKey="driver_name"
              series={[{ dataKey: 'trip_count', label: 'Trips' }]}
              showLegend={false}
            />
          </ReportPanel>
          <ReportPanel title="Driver performance details">
            <ReportTable
              caption="Driver performance"
              rows={rows}
              columns={[
                { key: 'driver_name', header: 'Driver' },
                { key: 'license_number', header: 'Licence' },
                { key: 'trip_count', header: 'Trips', align: 'right', cell: (r) => formatCount(r.trip_count) },
                { key: 'avg_rating', header: 'Avg rating', align: 'right', cell: (r) => (r.avg_rating === null ? '—' : formatDecimal(r.avg_rating)) },
              ]}
            />
          </ReportPanel>
        </>
      )}
    </ReportSection>
  );
}

function AvailabilityTab() {
  return (
    <ReportSection<AvailabilityRow>
      reportId="fleet_availability"
      ignoreRange
      emptyMessage="No vehicles have been added yet."
      kpis={(rows) => [
        { label: 'Total Vehicles', value: formatCount(sumBy(rows, (r) => r.vehicle_count)) },
        { label: 'Available', value: formatCount(sumBy(rows, (r) => r.available)) },
        { label: 'In Maintenance', value: formatCount(sumBy(rows, (r) => r.in_maintenance)) },
        { label: 'Inactive', value: formatCount(sumBy(rows, (r) => r.inactive)) },
      ]}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: humanize(r.type) }));
        const byType = new Map<string, { label: string; vehicle_count: number }>();
        for (const r of data) {
          const cur = byType.get(r.label) ?? { label: r.label, vehicle_count: 0 };
          cur.vehicle_count += r.vehicle_count;
          byType.set(r.label, cur);
        }
        return (
          <>
            <ReportPanelGrid>
              <ReportPanel title="Fleet by vehicle type">
                <PieChart data={[...byType.values()]} dataKey="vehicle_count" nameKey="label" donut />
              </ReportPanel>
              <ReportPanel title="Status by type">
                <BarChart
                  data={data}
                  categoryKey="label"
                  stacked
                  series={[
                    { dataKey: 'available', label: 'Available' },
                    { dataKey: 'in_maintenance', label: 'In maintenance' },
                    { dataKey: 'inactive', label: 'Inactive' },
                  ]}
                />
              </ReportPanel>
            </ReportPanelGrid>
            <ReportPanel title="Availability details">
              <ReportTable
                caption="Fleet availability"
                rows={data}
                columns={[
                  { key: 'label', header: 'Vehicle type' },
                  { key: 'vehicle_count', header: 'Vehicles', align: 'right', cell: (r) => formatCount(r.vehicle_count) },
                  { key: 'available', header: 'Available', align: 'right', cell: (r) => formatCount(r.available) },
                  { key: 'in_maintenance', header: 'In maintenance', align: 'right', cell: (r) => formatCount(r.in_maintenance) },
                  { key: 'inactive', header: 'Inactive', align: 'right', cell: (r) => formatCount(r.inactive) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

function TripCostTab() {
  return (
    <ReportSection<TripCostRow>
      reportId="trip_cost_analysis"
      emptyMessage="No trips with a recorded cost in this period."
      kpis={(rows) => {
        const trips = sumBy(rows, (r) => r.trip_count);
        const cost = sumBy(rows, (r) => r.total_cost);
        const distance = sumBy(rows, (r) => (r.avg_distance_km ?? 0) * r.trip_count);
        return [
          { label: 'Total Cost', value: formatReportCurrency(cost) },
          { label: 'Avg Trip Cost', value: formatReportCurrency(trips > 0 ? cost / trips : 0) },
          { label: 'Avg Distance', value: `${formatDecimal(trips > 0 ? distance / trips : 0, 0)} km` },
        ];
      }}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: humanize(r.trip_type) }));
        return (
          <>
            <ReportPanel title="Trip cost by type">
              <BarChart
                data={data}
                categoryKey="label"
                series={[{ dataKey: 'total_cost', label: 'Total cost' }]}
                valueFormatter={(v) => formatReportCurrency(v)}
                showLegend={false}
              />
            </ReportPanel>
            <ReportPanel title="Trip cost analysis">
              <ReportTable
                caption="Trip cost analysis"
                rows={data}
                columns={[
                  { key: 'label', header: 'Trip type' },
                  { key: 'trip_count', header: 'Trips', align: 'right', cell: (r) => formatCount(r.trip_count) },
                  { key: 'avg_distance_km', header: 'Avg distance', align: 'right', cell: (r) => (r.avg_distance_km === null ? '—' : `${formatDecimal(r.avg_distance_km, 0)} km`) },
                  { key: 'avg_trip_cost', header: 'Avg trip cost', align: 'right', cell: (r) => formatReportMoney(r.avg_trip_cost) },
                  { key: 'total_cost', header: 'Total cost', align: 'right', cell: (r) => formatReportMoney(r.total_cost) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

export default function FleetReportsPage() {
  const [tab, setTab] = React.useState('utilization');
  return (
    <ReportPageTemplate
      title="Fleet Reports"
      description="Vehicle utilization, driver performance and trip costs"
      hideRange={tab === 'availability'}
      renderExport={(ctx) => (
        <ReportExportButton
          reportId={tab === 'driver' ? 'driver_performance' : tab === 'availability' ? 'fleet_availability' : tab === 'tripcost' ? 'trip_cost_analysis' : 'fleet_utilization'}
          params={tab === 'availability' ? undefined : ctx.params}
          filenamePrefix={`fleet-report-${tab}`}
          rangeLabel={tab === 'availability' ? 'current' : ctx.rangeLabel}
        />
      )}
    >
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="utilization">Utilization</TabsTrigger>
          <TabsTrigger value="driver">Driver Performance</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="tripcost">Trip Cost Analysis</TabsTrigger>
        </TabsList>
        <TabsContent value="utilization"><UtilizationTab /></TabsContent>
        <TabsContent value="driver"><DriverTab /></TabsContent>
        <TabsContent value="availability"><AvailabilityTab /></TabsContent>
        <TabsContent value="tripcost"><TripCostTab /></TabsContent>
      </Tabs>
    </ReportPageTemplate>
  );
}
