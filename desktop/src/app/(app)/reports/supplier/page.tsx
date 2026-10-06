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
  formatReportCurrency,
  formatReportMoney,
  humanize,
  sumBy,
} from '@/components/domain/reports/shared';

interface UsageRow {
  supplier_name: string;
  category: string | null;
  trips_booked: number;
  total_spend: number;
}

interface PaymentRow {
  supplier_name: string;
  category: string | null;
  payment_count: number;
  total_paid: number;
  bank_transfers: number;
  cash_payments: number;
}

interface OutstandingRow {
  supplier_name: string;
  category: string | null;
  total_vouchers: number;
  total_voucher_value: number;
  total_paid: number;
  outstanding_balance: number;
}

function UsageTab() {
  return (
    <ReportSection<UsageRow>
      reportId="supplier_usage"
      emptyMessage="No supplier was booked in this period."
      kpis={(rows) => [
        { label: 'Suppliers Used', value: formatCount(rows.length) },
        { label: 'Total Trips Booked', value: formatCount(sumBy(rows, (r) => r.trips_booked)) },
        { label: 'Total Spend', value: formatReportCurrency(sumBy(rows, (r) => r.total_spend)) },
      ]}
    >
      {(rows) => (
        <>
          <ReportPanel title="Top suppliers by usage">
            <BarChart
              data={rows}
              categoryKey="supplier_name"
              series={[{ dataKey: 'trips_booked', label: 'Trips booked' }]}
              showLegend={false}
            />
          </ReportPanel>
          <ReportPanel title="Supplier usage details">
            <ReportTable
              caption="Supplier usage"
              rows={rows}
              columns={[
                { key: 'supplier_name', header: 'Supplier' },
                { key: 'category', header: 'Category', cell: (r) => humanize(r.category) },
                { key: 'trips_booked', header: 'Trips booked', align: 'right', cell: (r) => formatCount(r.trips_booked) },
                { key: 'total_spend', header: 'Spend', align: 'right', cell: (r) => formatReportMoney(r.total_spend) },
              ]}
            />
          </ReportPanel>
        </>
      )}
    </ReportSection>
  );
}

function PaymentTab() {
  return (
    <ReportSection<PaymentRow>
      reportId="supplier_payment_summary"
      emptyMessage="No supplier payments were made in this period."
      kpis={(rows) => [
        { label: 'Payments', value: formatCount(sumBy(rows, (r) => r.payment_count)) },
        { label: 'Total Paid', value: formatReportCurrency(sumBy(rows, (r) => r.total_paid)) },
        { label: 'Bank Transfers', value: formatReportCurrency(sumBy(rows, (r) => r.bank_transfers)) },
      ]}
    >
      {(rows) => (
        <>
          <ReportPanel title="Payments by supplier">
            <BarChart
              data={rows}
              categoryKey="supplier_name"
              stacked
              series={[
                { dataKey: 'bank_transfers', label: 'Bank transfers' },
                { dataKey: 'cash_payments', label: 'Cash' },
              ]}
              valueFormatter={(v) => formatReportCurrency(v)}
            />
          </ReportPanel>
          <ReportPanel title="Payment summary details">
            <ReportTable
              caption="Supplier payment summary"
              rows={rows}
              columns={[
                { key: 'supplier_name', header: 'Supplier' },
                { key: 'category', header: 'Category', cell: (r) => humanize(r.category) },
                { key: 'payment_count', header: 'Payments', align: 'right', cell: (r) => formatCount(r.payment_count) },
                { key: 'total_paid', header: 'Total paid', align: 'right', cell: (r) => formatReportMoney(r.total_paid) },
                { key: 'bank_transfers', header: 'Bank transfers', align: 'right', cell: (r) => formatReportMoney(r.bank_transfers) },
                { key: 'cash_payments', header: 'Cash', align: 'right', cell: (r) => formatReportMoney(r.cash_payments) },
              ]}
            />
          </ReportPanel>
        </>
      )}
    </ReportSection>
  );
}

function OutstandingTab() {
  return (
    <ReportSection<OutstandingRow>
      reportId="supplier_outstanding"
      emptyMessage="You do not owe any supplier right now."
      kpis={(rows) => [
        { label: 'Total Voucher Value', value: formatReportCurrency(sumBy(rows, (r) => r.total_voucher_value)) },
        { label: 'Total Paid', value: formatReportCurrency(sumBy(rows, (r) => r.total_paid)) },
        { label: 'Outstanding', value: formatReportCurrency(sumBy(rows, (r) => r.outstanding_balance)) },
      ]}
    >
      {(rows) => (
        <>
          <ReportPanel title="Outstanding by supplier">
            <BarChart
              data={rows}
              categoryKey="supplier_name"
              series={[{ dataKey: 'outstanding_balance', label: 'Outstanding' }]}
              valueFormatter={(v) => formatReportCurrency(v)}
              showLegend={false}
            />
          </ReportPanel>
          <ReportPanel title="Outstanding details">
            <ReportTable
              caption="Supplier outstanding"
              rows={rows}
              columns={[
                { key: 'supplier_name', header: 'Supplier' },
                { key: 'category', header: 'Category', cell: (r) => humanize(r.category) },
                { key: 'total_vouchers', header: 'Vouchers', align: 'right', cell: (r) => formatCount(r.total_vouchers) },
                { key: 'total_voucher_value', header: 'Voucher value', align: 'right', cell: (r) => formatReportMoney(r.total_voucher_value) },
                { key: 'total_paid', header: 'Paid', align: 'right', cell: (r) => formatReportMoney(r.total_paid) },
                { key: 'outstanding_balance', header: 'Outstanding', align: 'right', cell: (r) => formatReportMoney(r.outstanding_balance) },
              ]}
            />
          </ReportPanel>
        </>
      )}
    </ReportSection>
  );
}

export default function SupplierReportsPage() {
  return (
    <ReportPageTemplate
      title="Supplier Reports"
      description="Supplier usage, payments and outstanding balances"
      renderExport={(ctx) => (
        <ReportExportButton
          reportId="supplier_usage"
          params={ctx.params}
          filenamePrefix="supplier-report"
          rangeLabel={ctx.rangeLabel}
        />
      )}
    >
      <Tabs defaultValue="usage" className="w-full">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="payment">Payment Summary</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
        </TabsList>
        <TabsContent value="usage"><UsageTab /></TabsContent>
        <TabsContent value="payment"><PaymentTab /></TabsContent>
        <TabsContent value="outstanding"><OutstandingTab /></TabsContent>
      </Tabs>
    </ReportPageTemplate>
  );
}
