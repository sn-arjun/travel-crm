'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { reportsApi } from '@/lib/api/reports';
import { PRESET_MAP as presetMap } from '@/components/domain/report-page-template';
import {
  ReportExportButton,
  formatReportCurrency as formatCurrency,
  useReportSemanticColors,
} from '@/components/domain/reports/shared';

export default function RevenueReportPage() {
  const semanticColors = useReportSemanticColors();
  const [dateRange, setDateRange] = React.useState('30days');
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryKey, setRetryKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    reportsApi.execute('revenue_summary', { date_preset: presetMap[dateRange] ?? 'this_month' })
      .then((res: any) => {
        if (cancelled) return;
        setRows((res?.data?.data ?? []) as any[]);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load revenue report');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [dateRange, retryKey]);

  const totalInvoiced = rows.reduce((s, r) => s + (r.total_amount ?? 0), 0);
  const totalOutstanding = rows.reduce((s, r) => s + (r.total_outstanding ?? 0), 0);
  const totalInvoiceCount = rows.reduce((s, r) => s + (r.invoice_count ?? 0), 0);

  const chartData = rows.map((r) => ({
    status: (r.status ?? '').replace(/_/g, ' '),
    'Amount': r.total_amount ?? 0,
    'Outstanding': r.total_outstanding ?? 0,
  }));

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Revenue Report</span>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 Days</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="90days">Last 90 Days</SelectItem>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="lastMonth">Last Month</SelectItem>
              <SelectItem value="thisQuarter">This Quarter</SelectItem>
              <SelectItem value="thisYear">This Year</SelectItem>
            </SelectContent>
          </Select>
          <ReportExportButton
            reportId="revenue_summary"
            params={{ date_preset: presetMap[dateRange] ?? 'this_month' }}
            filenamePrefix="revenue-report"
            rangeLabel={dateRange}
            size="sm"
          />
        </div>
      </div>

      {/* Title */}
      <div className="px-6 py-3 border-b">
        <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Revenue Report
        </h1>
        <p className="text-sm text-muted-foreground">Invoice revenue breakdown by status and type</p>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}><CardContent className="pt-4 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-20" /></CardContent></Card>
              ))}
            </div>
            <Skeleton className="h-[300px] w-full" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-[300px] gap-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground">Failed to load revenue report</p>
            <Button size="sm" variant="outline" onClick={() => setRetryKey((k) => k + 1)}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Retry
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center h-[300px]">
            <p className="text-sm text-muted-foreground">No data for selected period</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoiced</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalInvoiced)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Sum of all invoices</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    Total Outstanding
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{formatCurrency(totalOutstanding)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Pending collection</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Invoice Count</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalInvoiceCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">Total invoices</p>
                </CardContent>
              </Card>
            </div>

            {/* Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="status" angle={-30} textAnchor="end" height={60} />
                    <YAxis tickFormatter={(v) => formatCurrency(v)} />
                    <Tooltip formatter={(v) => formatCurrency(v as number)} />
                    <Legend />
                    <Bar dataKey="Amount" fill={semanticColors.primary} />
                    <Bar dataKey="Outstanding" fill={semanticColors.danger} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Revenue Breakdown Table */}
            <Card>
              <CardHeader>
                <CardTitle>Revenue Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Invoice Count</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">
                            {(row.status ?? '').replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {row.type ? (
                            <Badge variant="secondary" className="text-xs capitalize">
                              {(row.type ?? '').replace(/_/g, ' ')}
                            </Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-right">{row.invoice_count ?? 0}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(row.total_amount ?? 0)}</TableCell>
                        <TableCell className="text-right text-red-600">
                          {(row.total_outstanding ?? 0) > 0 ? formatCurrency(row.total_outstanding ?? 0) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
