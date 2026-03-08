'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, AlertCircle, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
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

const presetMap: Record<string, string> = {
  '7days': 'this_week',
  '30days': 'this_month',
  '90days': 'this_quarter',
  thisMonth: 'this_month',
  lastMonth: 'last_month',
  thisQuarter: 'this_quarter',
  thisYear: 'this_year',
};

function formatCurrency(amount: number) {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

export default function PipelineReportPage() {
  const [dateRange, setDateRange] = React.useState('30days');
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryKey, setRetryKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    reportsApi.execute('pipeline_summary', { date_preset: presetMap[dateRange] ?? 'this_month' })
      .then((res: any) => {
        if (cancelled) return;
        setRows((res?.data?.data ?? []) as any[]);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load pipeline report');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [dateRange, retryKey]);

  const totalActiveLeads = rows.reduce((s, r) => s + (r.lead_count ?? 0), 0);
  const totalPipelineValue = rows.reduce((s, r) => s + (r.total_budget_potential ?? 0), 0);
  const avgDaysInStage =
    rows.length > 0
      ? (rows.reduce((s, r) => s + (r.avg_days_in_stage ?? 0), 0) / rows.length).toFixed(1)
      : '0';

  const chartData = rows.map((r) => ({
    status: (r.status ?? '').replace(/_/g, ' '),
    Leads: r.lead_count ?? 0,
  }));

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Pipeline Report</span>
          </nav>
        </div>
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
      </div>

      {/* Title */}
      <div className="px-6 py-3 border-b">
        <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Pipeline Report
        </h1>
        <p className="text-sm text-muted-foreground">Sales pipeline summary and lead stages</p>
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
            <p className="text-sm text-muted-foreground">Failed to load pipeline report</p>
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
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Active Leads</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalActiveLeads}</div>
                  <p className="text-xs text-muted-foreground mt-1">Across all stages</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Pipeline Value</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatCurrency(totalPipelineValue)}</div>
                  <p className="text-xs text-muted-foreground mt-1">Budget potential</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg Days In Stage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{avgDaysInStage}d</div>
                  <p className="text-xs text-muted-foreground mt-1">Average across stages</p>
                </CardContent>
              </Card>
            </div>

            {/* Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Lead Count by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="status" angle={-30} textAnchor="end" height={60} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="Leads" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Pipeline Stages Table */}
            <Card>
              <CardHeader>
                <CardTitle>Pipeline Stages</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Lead Count</TableHead>
                      <TableHead className="text-right">Budget Potential</TableHead>
                      <TableHead className="text-right">Avg Days in Stage</TableHead>
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
                        <TableCell className="text-right font-semibold">{row.lead_count ?? 0}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.total_budget_potential ?? 0)}</TableCell>
                        <TableCell className="text-right">
                          {row.avg_days_in_stage != null ? `${Number(row.avg_days_in_stage).toFixed(1)}d` : '—'}
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
