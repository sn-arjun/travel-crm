'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useApiQuery } from '@/hooks/use-api';
import { reportsApi } from '@/lib/api/reports';
import {
  SummaryCard,
  KPISkeleton,
  ReportErrorState as ErrorState,
  ChartSkeleton,
  DEFAULT_PERIOD_OPTIONS,
  PRESET_MAP as presetMap,
} from '@/components/domain/report-page-template';
import {
  ReportExportButton,
  ReportTabEmptyState,
  useReportChartColors,
  useReportSemanticColors,
} from '@/components/domain/reports/shared';

// ---------------------------------------------------------------------------
// Helper sub-components (page-local; not covered by the shared template)
// ---------------------------------------------------------------------------

function DateRangeSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Date Range:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DEFAULT_PERIOD_OPTIONS.map((p) => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmtCr(v: number) {
  return `₹${(v / 10_000_000).toFixed(2)}Cr`;
}
function fmtL(v: number) {
  return `₹${(v / 100_000).toFixed(1)}L`;
}
function fmtM(v: number) {
  return `₹${(v / 1_000_000).toFixed(1)}M`;
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function FinancialReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');
  const [comparePrev, setComparePrev] = React.useState(false);
  const CHART_COLORS = useReportChartColors();
  const semanticColors = useReportSemanticColors();

  const preset = presetMap[dateRange] ?? 'this_month';

  // ── Revenue Summary ──────────────────────────────────────────────────────
  const {
    data: revenueRes,
    loading: revenueLoading,
    error: revenueError,
    refetch: refetchRevenue,
  } = useApiQuery(
    () => reportsApi.execute('revenue_summary', { date_preset: preset, compare: comparePrev }),
    [preset, comparePrev],
  );

  // ── Collections ──────────────────────────────────────────────────────────
  const {
    data: collectionsRes,
    loading: collectionsLoading,
    error: collectionsError,
    refetch: refetchCollections,
  } = useApiQuery(
    () => reportsApi.execute('collections_report', { date_preset: preset, compare: comparePrev }),
    [preset, comparePrev],
  );

  // ── Outstanding Receivables ───────────────────────────────────────────────
  const {
    data: outstandingRes,
    loading: outstandingLoading,
    error: outstandingError,
    refetch: refetchOutstanding,
  } = useApiQuery(
    () => reportsApi.getOutstandingReport(),
    [],
  );

  // ── P&L by Lead ──────────────────────────────────────────────────────────
  const {
    data: pnlRes,
    loading: pnlLoading,
    error: pnlError,
    refetch: refetchPnl,
  } = useApiQuery(
    () => reportsApi.execute('pnl_by_lead', { date_preset: preset, compare: comparePrev }),
    [preset, comparePrev],
  );

  // ── Tax Report ───────────────────────────────────────────────────────────
  const {
    data: taxRes,
    loading: taxLoading,
    error: taxError,
    refetch: refetchTax,
  } = useApiQuery(
    () => reportsApi.execute('tax_report', { date_preset: preset }),
    [preset],
  );

  // ── Payment Methods ───────────────────────────────────────────────────────
  const {
    data: paymentMethodRes,
    loading: paymentMethodLoading,
    error: paymentMethodError,
    refetch: refetchPaymentMethod,
  } = useApiQuery(
    () => reportsApi.execute('payment_method_breakdown', { date_preset: preset }),
    [preset],
  );

  // ── Refunds ───────────────────────────────────────────────────────────────
  const {
    data: refundRes,
    loading: refundLoading,
    error: refundError,
    refetch: refetchRefunds,
  } = useApiQuery(
    () => reportsApi.execute('refund_report', { date_preset: preset }),
    [preset],
  );

  // ── Daily Cash ────────────────────────────────────────────────────────────
  const {
    data: dailyCashRes,
    loading: dailyCashLoading,
    error: dailyCashError,
    refetch: refetchDailyCash,
  } = useApiQuery(
    () => reportsApi.execute('daily_cash', { date_preset: preset }),
    [preset],
  );

  // ── Derived data ─────────────────────────────────────────────────────────
  // revenue_summary: [{status, type, invoice_count, total_amount, total_outstanding}]
  const revenueRows: Array<{ status: string; type: string; invoice_count: number; total_amount: number; total_outstanding: number }> =
    (revenueRes as any)?.data?.data ?? [];

  // collections_report: [{method, payment_count, collected_amount}]
  const collectionsRows: Array<{ method: string; payment_count: number; collected_amount: number }> =
    (collectionsRes as any)?.data?.data ?? [];

  // outstanding from getOutstandingReport():
  // { totalReceivable, overdueReceivable, ageing:{current,days30,days60,days90Plus}, topOverdueInvoices:[{id,invoice_number,total,balance_due,due_date,contact_name}] }
  const outstandingData: {
    totalReceivable?: number;
    overdueReceivable?: number;
    ageing?: { current?: number; days30?: number; days60?: number; days90Plus?: number };
    topOverdueInvoices?: Array<{ id: string; invoice_number: string; total: number; balance_due: number; due_date: string; contact_name: string }>;
  } = (outstandingRes as any)?.data?.data ?? (outstandingRes as any)?.data ?? {};

  // pnl_by_lead: [{lead_title, destination, assigned_to, total_invoiced, total_costs, gross_profit, margin_pct}]
  const pnlRows: Array<{ lead_title: string; destination: string; assigned_to: string; total_invoiced: number; total_costs: number; gross_profit: number; margin_pct: number }> =
    (pnlRes as any)?.data?.data ?? [];

  // tax_report: [{total_tax, total_revenue, effective_tax_rate}]
  const taxRows: Array<{ total_tax: number; total_revenue: number; effective_tax_rate: number }> =
    (taxRes as any)?.data?.data ?? [];

  // payment_method_breakdown: [{method, transaction_count, total_collected, pct_of_total}]
  const paymentMethodRows: Array<{ method: string; transaction_count: number; total_collected: number; pct_of_total: number }> =
    (paymentMethodRes as any)?.data?.data ?? [];

  // refund_report: [{method, refund_count, refund_amount}]
  const refundRows: Array<{ method: string; refund_count: number; refund_amount: number }> =
    (refundRes as any)?.data?.data ?? [];

  // daily_cash: [{payment_date, inflow, outflow, net_cash}]
  const dailyCashRows: Array<{ payment_date: string; inflow: number; outflow: number; net_cash: number }> =
    (dailyCashRes as any)?.data?.data ?? [];

  // ── KPI computations ─────────────────────────────────────────────────────
  const totalCollected = collectionsRows.reduce((s, r) => s + (r.collected_amount ?? 0), 0);
  const totalInvoiced = revenueRows.reduce((s, r) => s + (r.total_amount ?? 0), 0);
  const totalReceivable = outstandingData.totalReceivable ?? 0;
  const overdueReceivable = outstandingData.overdueReceivable ?? 0;
  const collectionRate = totalInvoiced > 0 ? ((totalCollected / totalInvoiced) * 100).toFixed(1) : '—';

  const kpiLoading = collectionsLoading || revenueLoading || outstandingLoading;

  // ── Pie chart data shape for payment methods ──────────────────────────────
  const pieData = paymentMethodRows.map((r) => ({
    name: r.method,
    value: r.pct_of_total,
    amount: r.total_collected,
  }));

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b">
        {/* Breadcrumb */}
        <nav className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
          <Link href="/reports" className="hover:underline">Reports</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Financial Reports</span>
        </nav>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link href="/reports">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Financial Reports</h1>
              <p className="text-sm text-muted-foreground">Revenue, collections, and P&L analysis</p>
            </div>
          </div>
          <div className="flex gap-2">
            <ReportExportButton
              reportId="revenue_summary"
              params={{ date_preset: preset }}
              filenamePrefix="financial-report"
              rangeLabel={dateRange}
              size="sm"
            />
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpiLoading ? (
            <>
              <KPISkeleton />
              <KPISkeleton />
              <KPISkeleton />
              <KPISkeleton />
            </>
          ) : (
            <>
              <SummaryCard label="Total Invoiced" value={fmtCr(totalInvoiced)} />
              <SummaryCard label="Total Collected" value={fmtCr(totalCollected)} />
              <SummaryCard label="Collection Rate" value={`${collectionRate}%`} />
              <SummaryCard
                label="Outstanding Receivable"
                value={fmtM(totalReceivable)}
                subtext={overdueReceivable > 0 ? `${fmtL(overdueReceivable)} overdue` : undefined}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Filters bar ────────────────────────────────────────────────────── */}
      <div className="px-6 py-3 border-b bg-muted/50 flex flex-wrap justify-between items-center gap-3">
        <DateRangeSelector value={dateRange} onChange={setDateRange} />
        <div className="flex items-center gap-2">
          <Switch
            id="compare-toggle"
            checked={comparePrev}
            onCheckedChange={setComparePrev}
          />
          <Label htmlFor="compare-toggle" className="text-sm cursor-pointer">
            Compare with previous period
          </Label>
        </div>
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 overflow-auto">
        <Tabs defaultValue="revenue" className="w-full">
          <TabsList className="flex flex-wrap gap-1 h-auto mb-6">
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="collections">Collections</TabsTrigger>
            <TabsTrigger value="receivables">Receivables</TabsTrigger>
            <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
            <TabsTrigger value="tax">Tax</TabsTrigger>
            <TabsTrigger value="payment-methods">Payment Methods</TabsTrigger>
            <TabsTrigger value="refunds">Refunds</TabsTrigger>
            <TabsTrigger value="daily-cash">Daily Cash</TabsTrigger>
          </TabsList>

          {/* ── Revenue tab ──────────────────────────────────────────────── */}
          <TabsContent value="revenue" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {revenueLoading && <ChartSkeleton />}
                {!revenueLoading && revenueError && (
                  <ErrorState message="Failed to load revenue data." onRetry={refetchRevenue} />
                )}
                {!revenueLoading && !revenueError && revenueRows.length === 0 && (
                  <ReportTabEmptyState message="No revenue data for this period." />
                )}
                {!revenueLoading && !revenueError && revenueRows.length > 0 && (
                  <>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={revenueRows}>
                        <defs>
                          <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.8} />
                            <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorOutstanding" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={semanticColors.warning} stopOpacity={0.8} />
                            <stop offset="95%" stopColor={semanticColors.warning} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="status" />
                        <YAxis tickFormatter={(v) => fmtL(v)} />
                        <Tooltip formatter={(value) => fmtL(value as number)} />
                        <Legend />
                        <Area
                          type="monotone"
                          dataKey="total_amount"
                          stroke={CHART_COLORS[0]}
                          fillOpacity={1}
                          fill="url(#colorAmount)"
                          name="Total Amount"
                        />
                        <Area
                          type="monotone"
                          dataKey="total_outstanding"
                          stroke={semanticColors.warning}
                          fillOpacity={1}
                          fill="url(#colorOutstanding)"
                          name="Outstanding"
                        />
                      </AreaChart>
                    </ResponsiveContainer>

                    <div className="overflow-x-auto mt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Status</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Invoice Count</TableHead>
                            <TableHead>Total Amount</TableHead>
                            <TableHead>Outstanding</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {revenueRows.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <Badge variant="outline">{row.status}</Badge>
                              </TableCell>
                              <TableCell className="capitalize">{row.type}</TableCell>
                              <TableCell>{row.invoice_count}</TableCell>
                              <TableCell>{fmtL(row.total_amount)}</TableCell>
                              <TableCell>
                                <span className={row.total_outstanding > 0 ? 'text-amber-600 font-medium' : ''}>
                                  {fmtL(row.total_outstanding)}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Collections tab ──────────────────────────────────────────── */}
          <TabsContent value="collections" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Collections Report — by Payment Method</CardTitle>
              </CardHeader>
              <CardContent>
                {collectionsLoading && <ChartSkeleton />}
                {!collectionsLoading && collectionsError && (
                  <ErrorState message="Failed to load collections data." onRetry={refetchCollections} />
                )}
                {!collectionsLoading && !collectionsError && collectionsRows.length === 0 && (
                  <ReportTabEmptyState message="No collections data for this period." />
                )}
                {!collectionsLoading && !collectionsError && collectionsRows.length > 0 && (
                  <>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={collectionsRows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="method" />
                        <YAxis tickFormatter={(v) => fmtL(v)} />
                        <Tooltip formatter={(value) => fmtL(value as number)} />
                        <Legend />
                        <Bar dataKey="collected_amount" fill={semanticColors.success} name="Collected Amount" />
                        <Bar dataKey="payment_count" fill={CHART_COLORS[0]} name="Payment Count" yAxisId="right" />
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="overflow-x-auto mt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Method</TableHead>
                            <TableHead>Payment Count</TableHead>
                            <TableHead>Collected Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {collectionsRows.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium capitalize">{row.method}</TableCell>
                              <TableCell>{row.payment_count}</TableCell>
                              <TableCell>{fmtL(row.collected_amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Outstanding Receivables tab ───────────────────────────────── */}
          <TabsContent value="receivables" className="space-y-6">
            {outstandingLoading && (
              <Card>
                <CardHeader><CardTitle className="text-base">Outstanding Receivables</CardTitle></CardHeader>
                <CardContent><TableSkeleton /></CardContent>
              </Card>
            )}
            {!outstandingLoading && outstandingError && (
              <ErrorState message="Failed to load outstanding receivables." onRetry={refetchOutstanding} />
            )}
            {!outstandingLoading && !outstandingError && (
              <>
                {/* Ageing summary */}
                {outstandingData.ageing && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Current', value: outstandingData.ageing.current ?? 0 },
                      { label: '1–30 Days', value: outstandingData.ageing.days30 ?? 0 },
                      { label: '31–60 Days', value: outstandingData.ageing.days60 ?? 0 },
                      { label: '90+ Days', value: outstandingData.ageing.days90Plus ?? 0 },
                    ].map(({ label, value }) => (
                      <Card key={label}>
                        <CardContent className="p-4">
                          <p className="text-xs text-muted-foreground mb-1">{label}</p>
                          <p className="text-xl font-bold">{fmtL(value)}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Top Overdue Invoices</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(!outstandingData.topOverdueInvoices || outstandingData.topOverdueInvoices.length === 0) ? (
                      <ReportTabEmptyState message="No overdue invoices." />
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Invoice #</TableHead>
                              <TableHead>Contact</TableHead>
                              <TableHead>Total</TableHead>
                              <TableHead>Balance Due</TableHead>
                              <TableHead>Due Date</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {outstandingData.topOverdueInvoices!.map((inv) => (
                              <TableRow key={inv.id}>
                                <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                                <TableCell>{inv.contact_name}</TableCell>
                                <TableCell>{fmtL(inv.total)}</TableCell>
                                <TableCell>
                                  <span className="text-destructive font-medium">{fmtL(inv.balance_due)}</span>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="destructive">{inv.due_date}</Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── P&L tab ──────────────────────────────────────────────────── */}
          <TabsContent value="pnl" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profit &amp; Loss by Lead</CardTitle>
              </CardHeader>
              <CardContent>
                {pnlLoading && <TableSkeleton />}
                {!pnlLoading && pnlError && (
                  <ErrorState message="Failed to load P&L data." onRetry={refetchPnl} />
                )}
                {!pnlLoading && !pnlError && pnlRows.length === 0 && (
                  <ReportTabEmptyState message="No P&L data for this period." />
                )}
                {!pnlLoading && !pnlError && pnlRows.length > 0 && (
                  <>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={pnlRows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="lead_title" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
                        <YAxis tickFormatter={(v) => fmtL(v)} />
                        <Tooltip formatter={(value) => fmtL(value as number)} />
                        <Legend />
                        <Bar dataKey="total_invoiced" fill={CHART_COLORS[0]} name="Invoiced" />
                        <Bar dataKey="total_costs" fill={semanticColors.danger} name="Costs" />
                        <Bar dataKey="gross_profit" fill={semanticColors.success} name="Gross Profit" />
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="overflow-x-auto mt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Lead</TableHead>
                            <TableHead>Destination</TableHead>
                            <TableHead>Assigned To</TableHead>
                            <TableHead>Invoiced</TableHead>
                            <TableHead>Costs</TableHead>
                            <TableHead>Gross Profit</TableHead>
                            <TableHead>Margin %</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pnlRows.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{row.lead_title}</TableCell>
                              <TableCell>{row.destination}</TableCell>
                              <TableCell>{row.assigned_to}</TableCell>
                              <TableCell>{fmtL(row.total_invoiced)}</TableCell>
                              <TableCell>{fmtL(row.total_costs)}</TableCell>
                              <TableCell>{fmtL(row.gross_profit)}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    row.margin_pct > 35
                                      ? 'default'
                                      : row.margin_pct > 25
                                        ? 'secondary'
                                        : 'outline'
                                  }
                                >
                                  {row.margin_pct.toFixed(1)}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tax tab ──────────────────────────────────────────────────── */}
          <TabsContent value="tax" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tax Report</CardTitle>
              </CardHeader>
              <CardContent>
                {taxLoading && <TableSkeleton rows={4} />}
                {!taxLoading && taxError && (
                  <ErrorState message="Failed to load tax data." onRetry={refetchTax} />
                )}
                {!taxLoading && !taxError && taxRows.length === 0 && (
                  <ReportTabEmptyState message="No tax data for this period." />
                )}
                {!taxLoading && !taxError && taxRows.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Total Revenue</TableHead>
                          <TableHead>Total Tax</TableHead>
                          <TableHead>Effective Tax Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {taxRows.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>{fmtL(row.total_revenue)}</TableCell>
                            <TableCell>{fmtL(row.total_tax)}</TableCell>
                            <TableCell>
                              <Badge variant="default">{row.effective_tax_rate.toFixed(2)}%</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Payment Methods tab ──────────────────────────────────────── */}
          <TabsContent value="payment-methods" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment Methods Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {paymentMethodLoading && <ChartSkeleton />}
                {!paymentMethodLoading && paymentMethodError && (
                  <ErrorState message="Failed to load payment method data." onRetry={refetchPaymentMethod} />
                )}
                {!paymentMethodLoading && !paymentMethodError && paymentMethodRows.length === 0 && (
                  <ReportTabEmptyState message="No payment data for this period." />
                )}
                {!paymentMethodLoading && !paymentMethodError && paymentMethodRows.length > 0 && (
                  <>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, value }) => `${name} (${value}%)`}
                          outerRadius={100}
                          dataKey="value"
                        >
                          {pieData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value}%`} />
                      </PieChart>
                    </ResponsiveContainer>

                    <div className="overflow-x-auto mt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Method</TableHead>
                            <TableHead>Transactions</TableHead>
                            <TableHead>Total Collected</TableHead>
                            <TableHead>% of Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paymentMethodRows.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium capitalize">{row.method}</TableCell>
                              <TableCell>{row.transaction_count}</TableCell>
                              <TableCell>{fmtL(row.total_collected)}</TableCell>
                              <TableCell>{row.pct_of_total.toFixed(1)}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Refunds tab ──────────────────────────────────────────────── */}
          <TabsContent value="refunds" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Refund Report</CardTitle>
              </CardHeader>
              <CardContent>
                {refundLoading && <TableSkeleton />}
                {!refundLoading && refundError && (
                  <ErrorState message="Failed to load refund data." onRetry={refetchRefunds} />
                )}
                {!refundLoading && !refundError && refundRows.length === 0 && (
                  <ReportTabEmptyState message="No refund data for this period." />
                )}
                {!refundLoading && !refundError && refundRows.length > 0 && (
                  <>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={refundRows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="method" />
                        <YAxis tickFormatter={(v) => fmtL(v)} />
                        <Tooltip formatter={(value) => fmtL(value as number)} />
                        <Legend />
                        <Bar dataKey="refund_amount" fill={semanticColors.danger} name="Refund Amount" />
                        <Bar dataKey="refund_count" fill={CHART_COLORS[4]} name="Refund Count" />
                      </BarChart>
                    </ResponsiveContainer>

                    <div className="overflow-x-auto mt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Method</TableHead>
                            <TableHead>Refund Count</TableHead>
                            <TableHead>Refund Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {refundRows.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium capitalize">{row.method}</TableCell>
                              <TableCell>{row.refund_count}</TableCell>
                              <TableCell className="text-destructive font-medium">{fmtL(row.refund_amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Daily Cash tab ───────────────────────────────────────────── */}
          <TabsContent value="daily-cash" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily Cash Flow</CardTitle>
              </CardHeader>
              <CardContent>
                {dailyCashLoading && <ChartSkeleton />}
                {!dailyCashLoading && dailyCashError && (
                  <ErrorState message="Failed to load daily cash data." onRetry={refetchDailyCash} />
                )}
                {!dailyCashLoading && !dailyCashError && dailyCashRows.length === 0 && (
                  <ReportTabEmptyState message="No cash flow data for this period." />
                )}
                {!dailyCashLoading && !dailyCashError && dailyCashRows.length > 0 && (
                  <>
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={dailyCashRows}>
                        <defs>
                          <linearGradient id="colorInflow" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={semanticColors.success} stopOpacity={0.8} />
                            <stop offset="95%" stopColor={semanticColors.success} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorOutflow" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={semanticColors.danger} stopOpacity={0.8} />
                            <stop offset="95%" stopColor={semanticColors.danger} stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.8} />
                            <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="payment_date" angle={-30} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
                        <YAxis tickFormatter={(v) => fmtL(v)} />
                        <Tooltip formatter={(value) => fmtL(value as number)} />
                        <Legend />
                        <Area type="monotone" dataKey="inflow" stroke={semanticColors.success} fillOpacity={1} fill="url(#colorInflow)" name="Inflow" />
                        <Area type="monotone" dataKey="outflow" stroke={semanticColors.danger} fillOpacity={1} fill="url(#colorOutflow)" name="Outflow" />
                        <Area type="monotone" dataKey="net_cash" stroke={CHART_COLORS[0]} fillOpacity={1} fill="url(#colorNet)" name="Net Cash" />
                      </AreaChart>
                    </ResponsiveContainer>

                    <div className="overflow-x-auto mt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Inflow</TableHead>
                            <TableHead>Outflow</TableHead>
                            <TableHead>Net Cash</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dailyCashRows.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{row.payment_date}</TableCell>
                              <TableCell className="text-green-600">{fmtL(row.inflow)}</TableCell>
                              <TableCell className="text-red-600">{fmtL(row.outflow)}</TableCell>
                              <TableCell>
                                <span className={row.net_cash >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                  {fmtL(row.net_cash)}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
