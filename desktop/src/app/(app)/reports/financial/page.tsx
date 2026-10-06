'use client';

import * as React from 'react';

import {
  AreaChart,
  BarChart,
  Card,
  CardContent,
  PieChart,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { ReportPageTemplate, useReportContext } from '@/components/domain/report-page-template';
import {
  ReportExportButton,
  ReportKpis,
  ReportPanel,
  ReportPanelGrid,
  ReportSection,
  ReportTable,
  ReportTabEmptyState,
  ReportTabErrorState,
  deltaOf,
  formatCount,
  formatPercent,
  formatReportCurrency,
  formatReportMoney,
  humanize,
  sumBy,
  useUserNames,
} from '@/components/domain/reports/shared';
import {
  reportsApi,
  type AgeingRow,
  type OutstandingResponse,
} from '@/lib/api/reports';
import { formatDisplayDate } from '@/lib/dates';

interface RevenueRow {
  status: string;
  type: string;
  invoice_count: number;
  total_amount: number;
  total_outstanding: number;
}

interface CollectionRow {
  method: string;
  payment_count: number;
  collected_amount: number;
}

interface PnlRow {
  lead_title: string;
  destination: string | null;
  assigned_to: string | null;
  total_invoiced: number;
  total_costs: number;
  gross_profit: number;
  margin_pct: number;
}

interface TaxRow {
  total_tax: number;
  total_revenue: number;
  effective_tax_rate: number;
}

interface PaymentMethodRow {
  method: string;
  transaction_count: number;
  total_collected: number;
  pct_of_total: number;
}

interface RefundRow {
  method: string;
  refund_count: number;
  refund_amount: number;
}

interface DailyCashRow {
  payment_date: string;
  inflow: number;
  outflow: number;
  net_cash: number;
}

const INVOICED_TYPES = new Set(['tax_invoice', 'proforma']);

function RevenueTab() {
  return (
    <ReportSection<RevenueRow>
      reportId="revenue_summary"
      comparable
      kpis={(rows, prev) => {
        const invoiced = (r: RevenueRow) => (INVOICED_TYPES.has(r.type) && r.status !== 'cancelled' ? r.total_amount : 0);
        return [
          { label: 'Total Invoiced', value: formatReportCurrency(sumBy(rows, invoiced)), hint: 'Tax invoices and proformas', delta: deltaOf(rows, prev, invoiced) },
          { label: 'Outstanding', value: formatReportCurrency(sumBy(rows, (r) => r.total_outstanding)), hint: 'Still to be collected', invertDelta: true, delta: deltaOf(rows, prev, (r) => r.total_outstanding) },
          { label: 'Invoices', value: formatCount(sumBy(rows, (r) => r.invoice_count)), hint: 'All statuses', delta: deltaOf(rows, prev, (r) => r.invoice_count) },
        ];
      }}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: `${humanize(r.status)} ${r.type === 'tax_invoice' ? 'invoices' : humanize(r.type).toLowerCase()}` }));
        return (
          <>
            <ReportPanel title="Revenue by invoice status">
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
            <ReportPanel title="Revenue summary">
              <ReportTable
                caption="Revenue summary"
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
  );
}

function CollectionsTab() {
  return (
    <ReportSection<CollectionRow>
      reportId="collections_report"
      comparable
      kpis={(rows, prev) => [
        { label: 'Total Collected', value: formatReportCurrency(sumBy(rows, (r) => r.collected_amount)), hint: 'Incoming payments', delta: deltaOf(rows, prev, (r) => r.collected_amount) },
        { label: 'Payments', value: formatCount(sumBy(rows, (r) => r.payment_count)), delta: deltaOf(rows, prev, (r) => r.payment_count) },
        { label: 'Payment Methods', value: formatCount(rows.length) },
      ]}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: humanize(r.method) }));
        return (
          <ReportPanelGrid>
            <ReportPanel title="Collections by payment method">
              <PieChart data={data} dataKey="collected_amount" nameKey="label" donut valueFormatter={(v) => formatReportCurrency(v)} />
            </ReportPanel>
            <ReportPanel title="Collections report">
              <ReportTable
                caption="Collections by payment method"
                rows={data}
                columns={[
                  { key: 'label', header: 'Method' },
                  { key: 'payment_count', header: 'Payments', align: 'right', cell: (r) => formatCount(r.payment_count) },
                  { key: 'collected_amount', header: 'Collected', align: 'right', cell: (r) => formatReportMoney(r.collected_amount) },
                ]}
              />
            </ReportPanel>
          </ReportPanelGrid>
        );
      }}
    </ReportSection>
  );
}

interface ReceivablesData {
  outstanding: OutstandingResponse;
  ageing: AgeingRow[];
}

/** Receivables come from the outstanding / ageing endpoints, which are not date-bound. */
function ReceivablesTab() {
  const { refreshKey } = useReportContext();
  const [state, setState] = React.useState<{ data: ReceivablesData | null; loading: boolean; error: boolean }>({
    data: null,
    loading: true,
    error: false,
  });
  const [retryKey, setRetryKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: false }));
    Promise.all([reportsApi.getOutstandingReport(), reportsApi.getAgeingReport()])
      .then(([outstanding, ageing]) => {
        if (cancelled) return;
        const o = outstanding.data;
        const a = ageing.data;
        setState({
          data: { outstanding: o, ageing: Array.isArray(a) ? a : [] },
          loading: false,
          error: false,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ data: null, loading: false, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, retryKey]);

  if (state.loading) {
    return (
      <div className="space-y-ds-4" aria-busy="true">
        <ReportKpis items={[]} loading />
        <Card>
          <CardContent className="pt-ds-5">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }
  if (state.error || !state.data) {
    return (
      <Card>
        <CardContent>
          <ReportTabErrorState message="Failed to load receivables" onRetry={() => setRetryKey((k) => k + 1)} />
        </CardContent>
      </Card>
    );
  }

  const { outstanding, ageing } = state.data;
  const buckets = [
    { label: '0–30 days', value: outstanding.ageing?.current ?? 0 },
    { label: '31–60 days', value: outstanding.ageing?.days30 ?? 0 },
    { label: '61–90 days', value: outstanding.ageing?.days60 ?? 0 },
    { label: '90+ days', value: outstanding.ageing?.days90Plus ?? 0 },
  ];
  const overdue = outstanding.topOverdueInvoices ?? [];

  return (
    <div className="space-y-ds-4">
      <ReportKpis
        items={[
          { label: 'Total Receivable', value: formatReportCurrency(outstanding.totalReceivable), hint: 'Sent, part-paid and overdue invoices' },
          { label: 'Overdue', value: formatReportCurrency(outstanding.overdueReceivable), hint: 'Past due date' },
          { label: 'Customers Owing', value: formatCount(ageing.length) },
        ]}
      />
      <ReportPanel title="Receivables ageing" description="Outstanding balance by days since the invoice was due">
        <BarChart
          data={buckets}
          categoryKey="label"
          series={[{ dataKey: 'value', label: 'Outstanding' }]}
          valueFormatter={(v) => formatReportCurrency(v)}
          showLegend={false}
        />
      </ReportPanel>
      <ReportPanel title="Top overdue invoices">
        {overdue.length === 0 ? (
          <ReportTabEmptyState message="No overdue invoices." />
        ) : (
          <ReportTable
            caption="Top overdue invoices"
            rows={overdue}
            columns={[
              { key: 'invoice_number', header: 'Invoice' },
              { key: 'contact_name', header: 'Customer' },
              { key: 'total', header: 'Total', align: 'right', cell: (r) => formatReportMoney(r.total) },
              { key: 'balance_due', header: 'Balance due', align: 'right', cell: (r) => formatReportMoney(r.balance_due) },
              { key: 'due_date', header: 'Due date', cell: (r) => formatDisplayDate(r.due_date) },
            ]}
          />
        )}
      </ReportPanel>
      <ReportPanel title="Outstanding by customer">
        {ageing.length === 0 ? (
          <ReportTabEmptyState message="No customer owes anything right now." />
        ) : (
          <ReportTable
            caption="Outstanding by customer"
            rows={ageing}
            columns={[
              { key: 'contact_name', header: 'Customer' },
              { key: 'total_outstanding', header: 'Outstanding', align: 'right', cell: (r) => formatReportMoney(r.total_outstanding) },
              { key: 'current_30', header: '0–30 days', align: 'right', cell: (r) => formatReportMoney(r.current_30) },
              { key: 'days_31_60', header: '31–60 days', align: 'right', cell: (r) => formatReportMoney(r.days_31_60) },
              { key: 'days_61_90', header: '61–90 days', align: 'right', cell: (r) => formatReportMoney(r.days_61_90) },
              { key: 'days_90_plus', header: '90+ days', align: 'right', cell: (r) => formatReportMoney(r.days_90_plus) },
            ]}
          />
        )}
      </ReportPanel>
    </div>
  );
}

function PnlTab() {
  const nameOf = useUserNames();
  return (
    <ReportSection<PnlRow>
      reportId="pnl_by_lead"
      comparable
      emptyMessage="No invoiced leads in this period."
      kpis={(rows, prev) => {
        const invoiced = sumBy(rows, (r) => r.total_invoiced);
        const profit = sumBy(rows, (r) => r.gross_profit);
        return [
          { label: 'Invoiced', value: formatReportCurrency(invoiced), delta: deltaOf(rows, prev, (r) => r.total_invoiced) },
          { label: 'Costs', value: formatReportCurrency(sumBy(rows, (r) => r.total_costs)), invertDelta: true, delta: deltaOf(rows, prev, (r) => r.total_costs) },
          { label: 'Gross Profit', value: formatReportCurrency(profit), delta: deltaOf(rows, prev, (r) => r.gross_profit) },
          { label: 'Margin', value: formatPercent(invoiced > 0 ? (profit / invoiced) * 100 : 0) },
        ];
      }}
    >
      {(rows) => (
        <>
          <ReportPanel title="Invoiced vs costs by lead">
            <BarChart
              data={rows}
              categoryKey="lead_title"
              series={[
                { dataKey: 'total_invoiced', label: 'Invoiced' },
                { dataKey: 'total_costs', label: 'Costs' },
                { dataKey: 'gross_profit', label: 'Gross profit' },
              ]}
              valueFormatter={(v) => formatReportCurrency(v)}
            />
          </ReportPanel>
          <ReportPanel title="Profit and loss by lead">
            <ReportTable
              caption="Profit and loss by lead"
              rows={rows}
              columns={[
                { key: 'lead_title', header: 'Lead' },
                { key: 'assigned_to', header: 'Owner', cell: (r) => nameOf(r.assigned_to) },
                { key: 'total_invoiced', header: 'Invoiced', align: 'right', cell: (r) => formatReportMoney(r.total_invoiced) },
                { key: 'total_costs', header: 'Costs', align: 'right', cell: (r) => formatReportMoney(r.total_costs) },
                { key: 'gross_profit', header: 'Gross profit', align: 'right', cell: (r) => formatReportMoney(r.gross_profit) },
                { key: 'margin_pct', header: 'Margin', align: 'right', cell: (r) => formatPercent(r.margin_pct) },
              ]}
            />
          </ReportPanel>
        </>
      )}
    </ReportSection>
  );
}

function TaxTab() {
  return (
    <ReportSection<TaxRow>
      reportId="tax_report"
      comparable
      kpis={(rows, prev) => [
        { label: 'Tax Collected', value: formatReportCurrency(sumBy(rows, (r) => r.total_tax)), delta: deltaOf(rows, prev, (r) => r.total_tax) },
        { label: 'Taxable Revenue', value: formatReportCurrency(sumBy(rows, (r) => r.total_revenue)), delta: deltaOf(rows, prev, (r) => r.total_revenue) },
        { label: 'Effective Tax Rate', value: formatPercent(rows[0]?.effective_tax_rate ?? 0, 2) },
      ]}
    >
      {(rows) => (
        <ReportPanel title="Tax report">
          <ReportTable
            caption="Tax report"
            rows={rows}
            columns={[
              { key: 'total_revenue', header: 'Revenue', align: 'right', cell: (r) => formatReportMoney(r.total_revenue) },
              { key: 'total_tax', header: 'Tax', align: 'right', cell: (r) => formatReportMoney(r.total_tax) },
              { key: 'effective_tax_rate', header: 'Effective rate', align: 'right', cell: (r) => formatPercent(r.effective_tax_rate, 2) },
            ]}
          />
        </ReportPanel>
      )}
    </ReportSection>
  );
}

function PaymentMethodsTab() {
  return (
    <ReportSection<PaymentMethodRow>
      reportId="payment_method_breakdown"
      kpis={(rows) => [
        { label: 'Total Collected', value: formatReportCurrency(sumBy(rows, (r) => r.total_collected)) },
        { label: 'Transactions', value: formatCount(sumBy(rows, (r) => r.transaction_count)) },
        { label: 'Top Method', value: humanize([...rows].sort((a, b) => b.total_collected - a.total_collected)[0]?.method) },
      ]}
    >
      {(rows) => {
        const data = rows.map((r) => ({ ...r, label: humanize(r.method) }));
        return (
          <ReportPanelGrid>
            <ReportPanel title="Payment methods distribution">
              <PieChart data={data} dataKey="total_collected" nameKey="label" donut valueFormatter={(v) => formatReportCurrency(v)} />
            </ReportPanel>
            <ReportPanel title="Payment method details">
              <ReportTable
                caption="Payment method breakdown"
                rows={data}
                columns={[
                  { key: 'label', header: 'Method' },
                  { key: 'transaction_count', header: 'Transactions', align: 'right', cell: (r) => formatCount(r.transaction_count) },
                  { key: 'total_collected', header: 'Collected', align: 'right', cell: (r) => formatReportMoney(r.total_collected) },
                  { key: 'pct_of_total', header: 'Share', align: 'right', cell: (r) => formatPercent(r.pct_of_total) },
                ]}
              />
            </ReportPanel>
          </ReportPanelGrid>
        );
      }}
    </ReportSection>
  );
}

function RefundsTab() {
  return (
    <ReportSection<RefundRow>
      reportId="refund_report"
      emptyMessage="No refunds were issued in this period."
      kpis={(rows) => [
        { label: 'Total Refunded', value: formatReportCurrency(sumBy(rows, (r) => r.refund_amount)) },
        { label: 'Refunds', value: formatCount(sumBy(rows, (r) => r.refund_count)) },
        { label: 'Methods', value: formatCount(rows.length) },
      ]}
    >
      {(rows) => (
        <ReportPanel title="Refund report">
          <ReportTable
            caption="Refunds by method"
            rows={rows}
            columns={[
              { key: 'method', header: 'Method', cell: (r) => humanize(r.method) },
              { key: 'refund_count', header: 'Refunds', align: 'right', cell: (r) => formatCount(r.refund_count) },
              { key: 'refund_amount', header: 'Amount', align: 'right', cell: (r) => formatReportMoney(r.refund_amount) },
            ]}
          />
        </ReportPanel>
      )}
    </ReportSection>
  );
}

function DailyCashTab() {
  return (
    <ReportSection<DailyCashRow>
      reportId="daily_cash"
      kpis={(rows) => [
        { label: 'Inflow', value: formatReportCurrency(sumBy(rows, (r) => r.inflow)) },
        { label: 'Outflow', value: formatReportCurrency(sumBy(rows, (r) => r.outflow)) },
        { label: 'Net Cash', value: formatReportCurrency(sumBy(rows, (r) => r.net_cash)) },
      ]}
    >
      {(rows) => {
        const data = [...rows]
          .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
          .map((r) => ({ ...r, label: formatDisplayDate(r.payment_date, 'short') }));
        return (
          <>
            <ReportPanel title="Daily cash flow">
              <AreaChart
                data={data}
                categoryKey="label"
                series={[
                  { dataKey: 'inflow', label: 'Inflow' },
                  { dataKey: 'outflow', label: 'Outflow' },
                ]}
                valueFormatter={(v) => formatReportCurrency(v)}
              />
            </ReportPanel>
            <ReportPanel title="Daily cash details">
              <ReportTable
                caption="Daily cash"
                rows={[...data].reverse()}
                columns={[
                  { key: 'label', header: 'Date' },
                  { key: 'inflow', header: 'Inflow', align: 'right', cell: (r) => formatReportMoney(r.inflow) },
                  { key: 'outflow', header: 'Outflow', align: 'right', cell: (r) => formatReportMoney(r.outflow) },
                  { key: 'net_cash', header: 'Net', align: 'right', cell: (r) => formatReportMoney(r.net_cash) },
                ]}
              />
            </ReportPanel>
          </>
        );
      }}
    </ReportSection>
  );
}

export default function FinancialReportsPage() {
  const [tab, setTab] = React.useState('revenue');
  return (
    <ReportPageTemplate
      title="Financial Reports"
      description="Revenue, collections, receivables, profit and tax"
      showCompare
      hideRange={tab === 'receivables'}
      renderExport={(ctx) => (
        <ReportExportButton
          reportId="revenue_summary"
          params={ctx.params}
          filenamePrefix="financial-report"
          rangeLabel={ctx.rangeLabel}
        />
      )}
    >
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="collections">Collections</TabsTrigger>
          <TabsTrigger value="receivables">Receivables</TabsTrigger>
          <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
          <TabsTrigger value="tax">Tax</TabsTrigger>
          <TabsTrigger value="payment-methods">Payment Methods</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
          <TabsTrigger value="daily-cash">Daily Cash</TabsTrigger>
        </TabsList>
        <TabsContent value="revenue"><RevenueTab /></TabsContent>
        <TabsContent value="collections"><CollectionsTab /></TabsContent>
        <TabsContent value="receivables"><ReceivablesTab /></TabsContent>
        <TabsContent value="pnl"><PnlTab /></TabsContent>
        <TabsContent value="tax"><TaxTab /></TabsContent>
        <TabsContent value="payment-methods"><PaymentMethodsTab /></TabsContent>
        <TabsContent value="refunds"><RefundsTab /></TabsContent>
        <TabsContent value="daily-cash"><DailyCashTab /></TabsContent>
      </Tabs>
    </ReportPageTemplate>
  );
}
