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
  formatReportCurrency,
  formatReportMoney,
  sumBy,
} from '@/components/domain/reports/shared';
import { formatDisplayDate } from '@/lib/dates';

interface RepeatRow {
  customer_name: string;
  email: string | null;
  booking_count: number;
  total_spent: number;
}

interface LtvRow {
  customer_name: string;
  total_bookings: number;
  total_ltv: number;
}

interface BirthdayRow {
  customer_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  days_until_birthday: number;
}

interface DormantRow {
  customer_name: string;
  email: string | null;
  phone: string | null;
  last_booking_date: string | null;
  total_past_bookings: number;
  days_since_last_booking: number | null;
}

/** Report endpoints cap rows per request; the chart shows the top 15. */
const TOP_N = 15;

function RepeatTab() {
  return (
    <ReportSection<RepeatRow>
      reportId="repeat_customers"
      emptyMessage="No customer booked more than once in this period."
      kpis={(rows) => [
        { label: 'Repeat Customers', value: formatCount(rows.length) },
        { label: 'Total Spend', value: formatReportCurrency(sumBy(rows, (r) => r.total_spent)) },
        { label: 'Avg Bookings', value: formatDecimal(rows.length ? sumBy(rows, (r) => r.booking_count) / rows.length : 0) },
      ]}
    >
      {(rows) => (
        <>
          <ReportPanel title="Top repeat customers by spend">
            <BarChart
              data={[...rows].sort((a, b) => b.total_spent - a.total_spent).slice(0, TOP_N)}
              categoryKey="customer_name"
              series={[{ dataKey: 'total_spent', label: 'Total spent' }]}
              valueFormatter={(v) => formatReportCurrency(v)}
              showLegend={false}
            />
          </ReportPanel>
          <ReportPanel title="Repeat customers">
            <ReportTable
              caption="Repeat customers"
              rows={rows}
              columns={[
                { key: 'customer_name', header: 'Customer' },
                { key: 'email', header: 'Email' },
                { key: 'booking_count', header: 'Bookings', align: 'right', cell: (r) => formatCount(r.booking_count) },
                { key: 'total_spent', header: 'Total spent', align: 'right', cell: (r) => formatReportMoney(r.total_spent) },
              ]}
            />
          </ReportPanel>
        </>
      )}
    </ReportSection>
  );
}

function LtvTab() {
  return (
    <ReportSection<LtvRow>
      reportId="customer_ltv"
      emptyMessage="No paid bookings in this period yet."
      kpis={(rows) => [
        { label: 'Customers', value: formatCount(rows.length) },
        { label: 'Total Lifetime Value', value: formatReportCurrency(sumBy(rows, (r) => r.total_ltv)) },
        { label: 'Avg Lifetime Value', value: formatReportCurrency(rows.length ? sumBy(rows, (r) => r.total_ltv) / rows.length : 0) },
      ]}
    >
      {(rows) => (
        <>
          <ReportPanel title={`Top ${TOP_N} customers by lifetime value`}>
            <BarChart
              data={[...rows].sort((a, b) => b.total_ltv - a.total_ltv).slice(0, TOP_N)}
              categoryKey="customer_name"
              series={[{ dataKey: 'total_ltv', label: 'Lifetime value' }]}
              valueFormatter={(v) => formatReportCurrency(v)}
              showLegend={false}
            />
          </ReportPanel>
          <ReportPanel title="Customer lifetime value details">
            <ReportTable
              caption="Customer lifetime value"
              rows={rows}
              columns={[
                { key: 'customer_name', header: 'Customer' },
                { key: 'total_bookings', header: 'Bookings', align: 'right', cell: (r) => formatCount(r.total_bookings) },
                { key: 'total_ltv', header: 'Lifetime value', align: 'right', cell: (r) => formatReportMoney(r.total_ltv) },
              ]}
            />
          </ReportPanel>
        </>
      )}
    </ReportSection>
  );
}

function BirthdayTab() {
  return (
    <ReportSection<BirthdayRow>
      reportId="birthday_upcoming"
      ignoreRange
      emptyMessage="No customer birthdays are coming up soon."
      kpis={(rows) => [
        { label: 'Upcoming Birthdays', value: formatCount(rows.length) },
        { label: 'This Week', value: formatCount(rows.filter((r) => r.days_until_birthday <= 7).length) },
        { label: 'Next Birthday', value: rows.length ? `${formatCount(Math.min(...rows.map((r) => r.days_until_birthday)))} days` : '—' },
      ]}
    >
      {(rows) => (
        <ReportPanel title="Upcoming birthdays" description="Customers with a birthday coming up, soonest first">
          <ReportTable
            caption="Upcoming birthdays"
            rows={[...rows].sort((a, b) => a.days_until_birthday - b.days_until_birthday)}
            columns={[
              { key: 'customer_name', header: 'Customer' },
              { key: 'date_of_birth', header: 'Birthday', cell: (r) => formatDisplayDate(r.date_of_birth, 'short') || '—' },
              { key: 'days_until_birthday', header: 'In', align: 'right', cell: (r) => `${formatCount(r.days_until_birthday)} days` },
              { key: 'phone', header: 'Phone' },
              { key: 'email', header: 'Email' },
            ]}
          />
        </ReportPanel>
      )}
    </ReportSection>
  );
}

function DormantTab() {
  return (
    <ReportSection<DormantRow>
      reportId="dormant_customers"
      ignoreRange
      emptyMessage="No dormant customers. Everyone has booked recently."
      kpis={(rows) => {
        const known = rows.filter((r) => r.days_since_last_booking !== null);
        return [
          { label: 'Dormant Customers', value: formatCount(rows.length) },
          { label: 'Never Booked', value: formatCount(rows.filter((r) => r.last_booking_date === null).length) },
          {
            label: 'Avg Days Inactive',
            value: known.length ? formatDecimal(sumBy(known, (r) => r.days_since_last_booking) / known.length, 0) : '—',
            hint: 'Customers who have booked before',
          },
        ];
      }}
    >
      {(rows) => (
        <ReportPanel title="Dormant customers" description="No booking recently. Good candidates for a win-back message.">
          <ReportTable
            caption="Dormant customers"
            rows={rows}
            columns={[
              { key: 'customer_name', header: 'Customer' },
              { key: 'last_booking_date', header: 'Last booking', cell: (r) => (r.last_booking_date ? formatDisplayDate(r.last_booking_date) : 'Never booked') },
              { key: 'days_since_last_booking', header: 'Days inactive', align: 'right', cell: (r) => (r.days_since_last_booking === null ? '—' : formatCount(r.days_since_last_booking)) },
              { key: 'total_past_bookings', header: 'Past bookings', align: 'right', cell: (r) => formatCount(r.total_past_bookings) },
              { key: 'phone', header: 'Phone' },
              { key: 'email', header: 'Email' },
            ]}
          />
        </ReportPanel>
      )}
    </ReportSection>
  );
}

const RANGE_FREE_TABS = new Set(['birthday', 'dormant']);

export default function CustomerReportsPage() {
  const [tab, setTab] = React.useState('repeat');
  return (
    <ReportPageTemplate
      title="Customer Reports"
      description="Repeat customers, lifetime value, birthdays and win-back lists"
      hideRange={RANGE_FREE_TABS.has(tab)}
      renderExport={(ctx) => (
        <ReportExportButton
          reportId={tab === 'ltv' ? 'customer_ltv' : tab === 'birthday' ? 'birthday_upcoming' : tab === 'dormant' ? 'dormant_customers' : 'repeat_customers'}
          params={RANGE_FREE_TABS.has(tab) ? undefined : ctx.params}
          filenamePrefix={`customer-report-${tab}`}
          rangeLabel={RANGE_FREE_TABS.has(tab) ? 'current' : ctx.rangeLabel}
        />
      )}
    >
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="repeat">Repeat Customers</TabsTrigger>
          <TabsTrigger value="ltv">Lifetime Value</TabsTrigger>
          <TabsTrigger value="birthday">Upcoming Birthdays</TabsTrigger>
          <TabsTrigger value="dormant">Dormant</TabsTrigger>
        </TabsList>
        <TabsContent value="repeat"><RepeatTab /></TabsContent>
        <TabsContent value="ltv"><LtvTab /></TabsContent>
        <TabsContent value="birthday"><BirthdayTab /></TabsContent>
        <TabsContent value="dormant"><DormantTab /></TabsContent>
      </Tabs>
    </ReportPageTemplate>
  );
}
