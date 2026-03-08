'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, Filter, AlertCircle, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { reportsApi } from '@/lib/api/reports';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const presetMap: Record<string, string> = {
  '7days': 'this_week',
  '30days': 'this_month',
  '90days': 'this_quarter',
  'thisMonth': 'this_month',
  'lastMonth': 'last_month',
  'thisQuarter': 'this_quarter',
  'thisYear': 'this_year',
};

function SummaryCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

function DateRangeSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">Date Range:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[180px]">
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
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-[300px] w-full" />;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-[300px] gap-3 text-muted-foreground">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm font-medium">Failed to load report</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="h-4 w-4 mr-1.5" />
        Retry
      </Button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-[300px] gap-2 text-muted-foreground">
      <p className="text-sm">No data for selected period</p>
    </div>
  );
}

function useTabData<T>(
  reportId: string,
  params: Record<string, string | boolean | undefined>,
  deps: React.DependencyList,
) {
  const [data, setData] = React.useState<T[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [refetchKey, setRefetchKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    reportsApi.execute(reportId, params as any)
      .then((res: any) => {
        if (cancelled) return;
        const rows: T[] = res?.data?.data ?? res?.data ?? [];
        setData(rows);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refetchKey]);

  const refetch = React.useCallback(() => setRefetchKey((k) => k + 1), []);
  return { data, loading, error, refetch };
}

export default function LeadReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');
  const [compare, setCompare] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('pipeline');
  const [exporting, setExporting] = React.useState(false);

  const commonParams = { date_preset: presetMap[dateRange] };

  // Per-tab data fetching
  const pipeline = useTabData<{
    status: string; lead_count: number; total_budget_potential: number; avg_days_in_stage: number;
  }>('pipeline_summary', { ...commonParams, compare }, [dateRange, compare]);

  const ageing = useTabData<{
    lead_id: string; title: string; status: string; assigned_to: string;
    priority: string; budget: number; days_in_pipeline: number; health_color: string;
  }>('lead_ageing', commonParams, [dateRange]);

  const velocity = useTabData<{
    month: string; new_leads: number; qualified_won_leads: number; avg_days_to_close: number;
  }>('lead_velocity', commonParams, [dateRange]);

  const sourceAnalysis = useTabData<{
    source: string; total_leads: number; won_leads: number; lost_leads: number;
    total_revenue: number; conversion_rate: number;
  }>('lead_source_analysis', commonParams, [dateRange]);

  const responseTime = useTabData<{
    assigned_to: string; total_leads: number; avg_response_hours: number;
  }>('lead_response_time', commonParams, [dateRange]);

  const followup = useTabData<{
    assigned_to: string; total_leads: number; leads_with_followup: number;
    compliance_rate: number; overdue_followups: number;
  }>('followup_compliance', commonParams, [dateRange]);

  const hotLeads = useTabData<{
    lead_id: string; title: string; destination: string; budget: number;
    status: string; assigned_to: string; created_at: string; age_days: number;
  }>('hot_leads', commonParams, [dateRange]);

  const lostAnalysis = useTabData<{
    lost_reason: string; assigned_to: string; count: number;
    lost_value: number; avg_lost_deal_size: number;
  }>('lost_analysis', commonParams, [dateRange]);

  // Summary stats from pipeline data
  const totalLeads = (pipeline.data ?? []).reduce((s, d) => s + (d.lead_count ?? 0), 0);
  const totalValue = (pipeline.data ?? []).reduce((s, d) => s + (d.total_budget_potential ?? 0), 0);
  const avgResponse = (responseTime.data ?? []).length > 0
    ? ((responseTime.data ?? []).reduce((s, d) => s + d.avg_response_hours, 0) / (responseTime.data ?? []).length).toFixed(1) + 'h'
    : '--';

  const avgCompliance = (followup.data ?? []).length > 0
    ? ((followup.data ?? []).reduce((s, d) => s + d.compliance_rate, 0) / (followup.data ?? []).length).toFixed(1)
    : null;

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await reportsApi.export('pipeline_summary', 'excel', { date_preset: presetMap[dateRange] }) as any;
      const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `lead-report-${dateRange}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — export errors are non-critical
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Lead Reports</span>
        </nav>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link href="/reports">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Lead Reports</h1>
              <p className="text-sm text-muted-foreground">Pipeline, ageing, and conversion analysis</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-1.5" />
              Filter
            </Button>
            <Button size="sm" className="bg-primary text-primary-foreground" onClick={handleExport} disabled={exporting}>
              <Download className="h-4 w-4 mr-1.5" />
              {exporting ? 'Exporting…' : 'Export'}
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {pipeline.loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <SummaryCard label="Total Leads" value={totalLeads.toString()} subtext="In pipeline" />
              <SummaryCard label="Pipeline Value" value={totalValue > 0 ? `₹${(totalValue / 10000000).toFixed(1)}Cr` : '--'} subtext="Total budget potential" />
              <SummaryCard
                label="Avg Compliance"
                value={avgCompliance ? `${avgCompliance}%` : '--'}
                subtext="Follow-up compliance"
              />
              <SummaryCard label="Avg Response" value={avgResponse} subtext="First response (hrs)" />
            </>
          )}
        </div>
      </div>

      {/* Controls bar */}
      <div className="px-6 py-3 border-b bg-muted/50 flex flex-wrap justify-between items-center gap-3">
        <DateRangeSelector value={dateRange} onChange={setDateRange} />
        <div className="flex items-center gap-2">
          <Switch
            id="compare-toggle"
            checked={compare}
            onCheckedChange={setCompare}
          />
          <Label htmlFor="compare-toggle" className="text-sm cursor-pointer">
            Compare with previous period
          </Label>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 p-6 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 lg:grid-cols-8 mb-6">
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="ageing">Ageing</TabsTrigger>
            <TabsTrigger value="source">Source</TabsTrigger>
            <TabsTrigger value="response">Response</TabsTrigger>
            <TabsTrigger value="followup" className="hidden lg:block">Follow-up</TabsTrigger>
            <TabsTrigger value="hotleads" className="hidden lg:block">Hot Leads</TabsTrigger>
            <TabsTrigger value="lost" className="hidden lg:block">Lost</TabsTrigger>
            <TabsTrigger value="velocity" className="hidden lg:block">Velocity</TabsTrigger>
            <TabsTrigger value="more" className="lg:hidden">More</TabsTrigger>
          </TabsList>

          {/* ── Pipeline ── */}
          <TabsContent value="pipeline" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pipeline Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {pipeline.loading ? (
                  <ChartSkeleton />
                ) : pipeline.error ? (
                  <ErrorState onRetry={pipeline.refetch} />
                ) : !pipeline.data?.length ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={pipeline.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="status" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="lead_count" fill="#3b82f6" name="Lead Count" />
                      <Bar yAxisId="right" dataKey="total_budget_potential" fill="#10b981" name="Budget Potential" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Pipeline table */}
            {!pipeline.loading && !pipeline.error && pipeline.data && pipeline.data.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Stage Breakdown</CardTitle>
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
                      {pipeline.data.map((row) => (
                        <TableRow key={row.status}>
                          <TableCell className="font-medium">{row.status}</TableCell>
                          <TableCell className="text-right">{row.lead_count}</TableCell>
                          <TableCell className="text-right">
                            {row.total_budget_potential > 0 ? `₹${(row.total_budget_potential / 100000).toFixed(1)}L` : '--'}
                          </TableCell>
                          <TableCell className="text-right">{row.avg_days_in_stage?.toFixed(1) ?? '--'}d</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Ageing ── */}
          <TabsContent value="ageing" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lead Ageing Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                {ageing.loading ? (
                  <ChartSkeleton />
                ) : ageing.error ? (
                  <ErrorState onRetry={ageing.refetch} />
                ) : !ageing.data?.length ? (
                  <EmptyState />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Assigned To</TableHead>
                          <TableHead className="text-right">Budget</TableHead>
                          <TableHead className="text-right">Days in Pipeline</TableHead>
                          <TableHead>Health</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ageing.data.map((row) => (
                          <TableRow key={row.lead_id}>
                            <TableCell className="font-medium">{row.title}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{row.status}</Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                row.priority === 'high' ? 'default' : row.priority === 'medium' ? 'secondary' : 'outline'
                              }>
                                {row.priority}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{row.assigned_to}</TableCell>
                            <TableCell className="text-right text-sm">
                              {row.budget ? `₹${(row.budget / 100000).toFixed(1)}L` : '--'}
                            </TableCell>
                            <TableCell className="text-right text-sm">{row.days_in_pipeline}d</TableCell>
                            <TableCell>
                              <span
                                className="inline-block w-3 h-3 rounded-full"
                                style={{ backgroundColor: row.health_color ?? '#94a3b8' }}
                                title={row.health_color}
                              />
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

          {/* ── Source Analysis ── */}
          <TabsContent value="source" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Lead Sources Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {sourceAnalysis.loading ? (
                    <ChartSkeleton />
                  ) : sourceAnalysis.error ? (
                    <ErrorState onRetry={sourceAnalysis.refetch} />
                  ) : !sourceAnalysis.data?.length ? (
                    <EmptyState />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={sourceAnalysis.data}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry: any) => `${entry.source} (${entry.total_leads})`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="total_leads"
                          nameKey="source"
                        >
                          {sourceAnalysis.data.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => `${value} leads`} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Source Conversion Rates</CardTitle>
                </CardHeader>
                <CardContent>
                  {sourceAnalysis.loading ? (
                    <div className="space-y-4">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="space-y-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-2 w-full" />
                        </div>
                      ))}
                    </div>
                  ) : sourceAnalysis.error ? (
                    <ErrorState onRetry={sourceAnalysis.refetch} />
                  ) : !sourceAnalysis.data?.length ? (
                    <EmptyState />
                  ) : (
                    <div className="space-y-4">
                      {sourceAnalysis.data.map((source) => (
                        <div key={source.source}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{source.source}</span>
                            <span className="text-sm font-semibold">{source.conversion_rate?.toFixed(1) ?? 0}%</span>
                          </div>
                          <Progress value={source.conversion_rate ?? 0} className="h-2" />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Source table */}
            {!sourceAnalysis.loading && !sourceAnalysis.error && sourceAnalysis.data && sourceAnalysis.data.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Source Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Total Leads</TableHead>
                        <TableHead className="text-right">Won</TableHead>
                        <TableHead className="text-right">Lost</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">Conv. Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sourceAnalysis.data.map((row) => (
                        <TableRow key={row.source}>
                          <TableCell className="font-medium">{row.source}</TableCell>
                          <TableCell className="text-right">{row.total_leads}</TableCell>
                          <TableCell className="text-right text-green-600">{row.won_leads}</TableCell>
                          <TableCell className="text-right text-red-500">{row.lost_leads}</TableCell>
                          <TableCell className="text-right">
                            {row.total_revenue ? `₹${(row.total_revenue / 100000).toFixed(1)}L` : '--'}
                          </TableCell>
                          <TableCell className="text-right">{row.conversion_rate?.toFixed(1) ?? 0}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Response Time ── */}
          <TabsContent value="response" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Average Response Time by Agent (Hours)</CardTitle>
              </CardHeader>
              <CardContent>
                {responseTime.loading ? (
                  <ChartSkeleton />
                ) : responseTime.error ? (
                  <ErrorState onRetry={responseTime.refetch} />
                ) : !responseTime.data?.length ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={responseTime.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="assigned_to" />
                      <YAxis />
                      <Tooltip formatter={(value) => `${(value as number).toFixed(1)}h`} />
                      <Legend />
                      <Bar dataKey="avg_response_hours" fill="#8b5cf6" name="Avg Response (hrs)" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {!responseTime.loading && !responseTime.error && responseTime.data && responseTime.data.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Agent Response Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead className="text-right">Total Leads</TableHead>
                        <TableHead className="text-right">Avg Response (hrs)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {responseTime.data.map((row) => (
                        <TableRow key={row.assigned_to}>
                          <TableCell className="font-medium">{row.assigned_to}</TableCell>
                          <TableCell className="text-right">{row.total_leads}</TableCell>
                          <TableCell className="text-right">{row.avg_response_hours?.toFixed(1) ?? '--'}h</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Follow-Up ── */}
          <TabsContent value="followup" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Follow-up Compliance by Agent</CardTitle>
              </CardHeader>
              <CardContent>
                {followup.loading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="space-y-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                    ))}
                  </div>
                ) : followup.error ? (
                  <ErrorState onRetry={followup.refetch} />
                ) : !followup.data?.length ? (
                  <EmptyState />
                ) : (
                  <div className="space-y-5">
                    {followup.data.map((row) => (
                      <div key={row.assigned_to}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{row.assigned_to}</span>
                          <span className="text-sm font-semibold">{row.compliance_rate?.toFixed(1) ?? 0}%</span>
                        </div>
                        <Progress value={row.compliance_rate ?? 0} className="h-2 mb-1" />
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>{row.leads_with_followup} of {row.total_leads} have follow-up</span>
                          {row.overdue_followups > 0 && (
                            <span className="text-red-500">{row.overdue_followups} overdue</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {!followup.loading && !followup.error && followup.data && followup.data.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Compliance Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-green-50 dark:bg-green-950/30 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Avg Compliance</p>
                      <p className="text-lg font-bold text-green-600">
                        {(followup.data.reduce((s, d) => s + d.compliance_rate, 0) / followup.data.length).toFixed(1)}%
                      </p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Total Leads</p>
                      <p className="text-lg font-bold text-blue-600">
                        {followup.data.reduce((s, d) => s + d.total_leads, 0)}
                      </p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Total Overdue</p>
                      <p className="text-lg font-bold text-red-600">
                        {followup.data.reduce((s, d) => s + d.overdue_followups, 0)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Hot Leads ── */}
          <TabsContent value="hotleads" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hot Leads</CardTitle>
              </CardHeader>
              <CardContent>
                {hotLeads.loading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : hotLeads.error ? (
                  <ErrorState onRetry={hotLeads.refetch} />
                ) : !hotLeads.data?.length ? (
                  <EmptyState />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Assigned To</TableHead>
                          <TableHead className="text-right">Budget</TableHead>
                          <TableHead className="text-right">Age</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {hotLeads.data.map((lead) => (
                          <TableRow key={lead.lead_id}>
                            <TableCell className="font-medium">{lead.title}</TableCell>
                            <TableCell className="text-sm">{lead.destination ?? '--'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{lead.status}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{lead.assigned_to}</TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {lead.budget ? `₹${(lead.budget / 100000).toFixed(1)}L` : '--'}
                            </TableCell>
                            <TableCell className="text-right text-sm">{lead.age_days}d</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Lost Analysis ── */}
          <TabsContent value="lost" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Lost Reasons Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {lostAnalysis.loading ? (
                    <ChartSkeleton />
                  ) : lostAnalysis.error ? (
                    <ErrorState onRetry={lostAnalysis.refetch} />
                  ) : !lostAnalysis.data?.length ? (
                    <EmptyState />
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={lostAnalysis.data}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry: any) => `${entry.lost_reason} (${entry.count})`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="count"
                          nameKey="lost_reason"
                        >
                          {lostAnalysis.data.map((_entry, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Lost Deal Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {lostAnalysis.loading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : lostAnalysis.error ? (
                    <ErrorState onRetry={lostAnalysis.refetch} />
                  ) : !lostAnalysis.data?.length ? (
                    <EmptyState />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Reason</TableHead>
                          <TableHead>Agent</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">Lost Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lostAnalysis.data.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{row.lost_reason}</TableCell>
                            <TableCell className="text-sm">{row.assigned_to}</TableCell>
                            <TableCell className="text-right">{row.count}</TableCell>
                            <TableCell className="text-right text-sm">
                              {row.lost_value ? `₹${(row.lost_value / 100000).toFixed(1)}L` : '--'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Velocity ── */}
          <TabsContent value="velocity" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lead Velocity Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {velocity.loading ? (
                  <ChartSkeleton />
                ) : velocity.error ? (
                  <ErrorState onRetry={velocity.refetch} />
                ) : !velocity.data?.length ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={velocity.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="new_leads" stroke="#10b981" name="New Leads" strokeWidth={2} />
                      <Line yAxisId="left" type="monotone" dataKey="qualified_won_leads" stroke="#3b82f6" name="Qualified/Won" strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="avg_days_to_close" stroke="#f59e0b" name="Avg Days to Close" strokeWidth={2} strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── More (mobile) ── */}
          <TabsContent value="more" className="space-y-6">
            {/* Follow-up compact */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Follow-up Compliance</CardTitle>
              </CardHeader>
              <CardContent>
                {followup.loading ? (
                  <Skeleton className="h-[200px] w-full" />
                ) : followup.error ? (
                  <ErrorState onRetry={followup.refetch} />
                ) : !followup.data?.length ? (
                  <EmptyState />
                ) : (
                  <div className="space-y-3">
                    {followup.data.map((row) => (
                      <div key={row.assigned_to}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium">{row.assigned_to}</span>
                          <span className="text-sm">{row.compliance_rate?.toFixed(1) ?? 0}%</span>
                        </div>
                        <Progress value={row.compliance_rate ?? 0} className="h-2" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Lost reasons compact */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lost Reasons</CardTitle>
              </CardHeader>
              <CardContent>
                {lostAnalysis.loading ? (
                  <Skeleton className="h-[250px] w-full" />
                ) : lostAnalysis.error ? (
                  <ErrorState onRetry={lostAnalysis.refetch} />
                ) : !lostAnalysis.data?.length ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={lostAnalysis.data}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(entry: any) => entry.lost_reason}
                        outerRadius={80}
                        dataKey="count"
                        nameKey="lost_reason"
                      >
                        {lostAnalysis.data.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Velocity compact */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lead Velocity</CardTitle>
              </CardHeader>
              <CardContent>
                {velocity.loading ? (
                  <Skeleton className="h-[250px] w-full" />
                ) : velocity.error ? (
                  <ErrorState onRetry={velocity.refetch} />
                ) : !velocity.data?.length ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={velocity.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Line type="monotone" dataKey="new_leads" stroke="#10b981" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
