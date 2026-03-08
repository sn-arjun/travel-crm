'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Download, CheckCircle2, Clock, AlertCircle, FileText, Calendar, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { reportsApi } from '@/lib/api/reports';

const fmt = (n: number) => n >= 10000000 ? `₹${(n / 10000000).toFixed(1)}Cr` : n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${n.toLocaleString('en-IN')}`;

const presetMap: Record<string, string> = {
  '7days': 'this_week',
  '30days': 'this_month',
  '90days': 'this_quarter',
  'thisMonth': 'this_month',
  'lastMonth': 'last_month',
  'thisQuarter': 'this_quarter',
  'thisYear': 'this_year',
};

function ChartSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-[300px] w-full" />
    </div>
  );
}

export default function VisaReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');
  const [showComparison, setShowComparison] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('status');

  const [statusData, setStatusData] = React.useState<any[]>([]);
  const [pendingDocsData, setPendingDocsData] = React.useState<any[]>([]);
  const [successRateData, setSuccessRateData] = React.useState<any[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryKey, setRetryKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = { date_preset: presetMap[dateRange] ?? 'this_month', compare: showComparison };

    const reportId = activeTab === 'status' ? 'visa_status_summary'
      : activeTab === 'pending' ? 'pending_documents'
      : 'visa_success_rate';

    reportsApi.execute(reportId, params)
      .then((res: any) => {
        if (cancelled) return;
        const rows = Array.isArray(res) ? res : (res?.data ?? res?.rows ?? []);
        if (activeTab === 'status') setStatusData(rows);
        else if (activeTab === 'pending') setPendingDocsData(rows);
        else setSuccessRateData(rows);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load report data');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [dateRange, showComparison, activeTab, retryKey]);

  const handleExport = async () => {
    try {
      await reportsApi.export('visa_status_summary', 'excel', { date_preset: presetMap[dateRange] ?? 'this_month' });
      toast.success('Export started');
    } catch {
      toast.error('Export failed');
    }
  };

  const renderError = () => (
    <div className="flex flex-col items-center justify-center h-[300px] gap-3">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <p className="text-sm text-muted-foreground">Failed to load report data</p>
      <Button size="sm" variant="outline" onClick={() => setRetryKey((k) => k + 1)}>
        <RefreshCw className="h-4 w-4 mr-1.5" />
        Retry
      </Button>
    </div>
  );

  const renderEmpty = () => (
    <div className="flex items-center justify-center h-[300px]">
      <p className="text-sm text-muted-foreground">No data for selected period</p>
    </div>
  );

  // Aggregate status summary
  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    statusData.forEach((r) => {
      const s = r.status ?? 'Unknown';
      counts[s] = (counts[s] ?? 0) + (r.application_count ?? 0);
    });
    return counts;
  }, [statusData]);

  const totalApplications = Object.values(statusCounts).reduce((s, v) => s + v, 0);
  const approvedCount = statusCounts['approved'] ?? statusCounts['Approved'] ?? 0;
  const approvalRate = totalApplications > 0 ? ((approvedCount / totalApplications) * 100).toFixed(1) : '0.0';

  const statusChartData = React.useMemo(() => {
    const byCountry: Record<string, Record<string, number>> = {};
    statusData.forEach((r) => {
      const country = r.country ?? 'Unknown';
      const status = r.status ?? 'Unknown';
      if (!byCountry[country]) byCountry[country] = {};
      byCountry[country][status] = (byCountry[country][status] ?? 0) + (r.application_count ?? 0);
    });
    return Object.entries(byCountry).slice(0, 10).map(([country, statuses]) => ({ country, ...statuses }));
  }, [statusData]);

  const allStatuses = Array.from(new Set(statusData.map((r) => r.status ?? 'Unknown')));
  const STATUS_COLORS: Record<string, string> = {
    approved: '#10b981', Approved: '#10b981',
    rejected: '#ef4444', Rejected: '#ef4444',
    pending: '#f59e0b', Pending: '#f59e0b',
    'in progress': '#3b82f6', 'In Progress': '#3b82f6',
    applied: '#8b5cf6', Applied: '#8b5cf6',
    expired: '#6b7280', Expired: '#6b7280',
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Visa Reports</span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id="compare" checked={showComparison} onCheckedChange={setShowComparison} />
            <Label htmlFor="compare" className="text-sm cursor-pointer">Compare with previous period</Label>
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
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Title */}
      <div className="px-6 py-3 border-b">
        <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Visa Reports
        </h1>
        <p className="text-sm text-muted-foreground">Visa application tracking and success analytics</p>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="status">Status Summary</TabsTrigger>
            <TabsTrigger value="pending">Pending Documents</TabsTrigger>
            <TabsTrigger value="success">Success Rate</TabsTrigger>
          </TabsList>

          {/* Status Summary Tab */}
          <TabsContent value="status" className="space-y-6">
            {loading ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <Card key={i}><CardContent className="pt-4 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /></CardContent></Card>
                  ))}
                </div>
                <ChartSkeleton />
              </>
            ) : error ? renderError() : statusData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Total Applications
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{totalApplications}</div>
                      <p className="text-xs text-muted-foreground mt-1">All statuses</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Approved
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-green-600">{approvedCount}</div>
                      <p className="text-xs text-muted-foreground mt-1">{approvalRate}% success rate</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-500" />
                        In Progress
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-blue-600">
                        {(statusCounts['in progress'] ?? 0) + (statusCounts['In Progress'] ?? 0) + (statusCounts['applied'] ?? 0) + (statusCounts['Applied'] ?? 0)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Pending decision</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        Rejected
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-red-600">
                        {statusCounts['rejected'] ?? statusCounts['Rejected'] ?? 0}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Requires reapplication</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Applications by Country &amp; Status</CardTitle>
                    <CardDescription>Breakdown per destination country</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={statusChartData} margin={{ top: 5, right: 30, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="country" angle={-45} textAnchor="end" height={80} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {allStatuses.map((s) => (
                          <Bar key={s} dataKey={s} fill={STATUS_COLORS[s] ?? '#6b7280'} stackId="a" />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Status Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>Country</TableHead>
                          <TableHead className="text-right">Applications</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {statusData.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{row.status ?? '—'}</Badge>
                            </TableCell>
                            <TableCell>{row.country ?? '—'}</TableCell>
                            <TableCell className="text-right">{row.application_count ?? 0}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Pending Documents Tab */}
          <TabsContent value="pending" className="space-y-6">
            {loading ? <ChartSkeleton /> : error ? renderError() : pendingDocsData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Pending Applications</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{pendingDocsData.length}</div>
                      <p className="text-xs text-muted-foreground mt-1">Missing documents</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Avg Age (days)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {pendingDocsData.length > 0 ? Math.round(pendingDocsData.reduce((s, r) => s + (r.age_days ?? 0), 0) / pendingDocsData.length) : 0}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Average pending age</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Pending Items</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-orange-600">
                        {pendingDocsData.reduce((s, r) => s + (r.pending_items ?? 0), 0)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Documents to collect</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Applications with Pending Documents
                    </CardTitle>
                    <CardDescription>Sorted by urgency (age)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Application ID</TableHead>
                          <TableHead>Country</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Travel Date</TableHead>
                          <TableHead className="text-right">Checklist Items</TableHead>
                          <TableHead className="text-right">Pending Items</TableHead>
                          <TableHead className="text-right">Age (days)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...pendingDocsData].sort((a, b) => (b.age_days ?? 0) - (a.age_days ?? 0)).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium font-mono text-xs">{row.application_id ?? '—'}</TableCell>
                            <TableCell>{row.country ?? '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{row.status ?? '—'}</Badge></TableCell>
                            <TableCell>{row.travel_date ?? '—'}</TableCell>
                            <TableCell className="text-right">{row.total_checklist_items ?? 0}</TableCell>
                            <TableCell className="text-right text-orange-600 font-medium">{row.pending_items ?? 0}</TableCell>
                            <TableCell className={cn('text-right font-medium', (row.age_days ?? 0) > 30 ? 'text-red-600' : '')}>
                              {row.age_days ?? 0}d
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Success Rate Tab */}
          <TabsContent value="success" className="space-y-6">
            {loading ? <ChartSkeleton /> : error ? renderError() : successRateData.length === 0 ? renderEmpty() : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Visa Success Rate by Country</CardTitle>
                    <CardDescription>Approval percentage and processing time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={successRateData.map((r) => ({
                          country: r.country ?? '—',
                          'Success Rate %': parseFloat((r.success_rate ?? 0).toFixed(1)),
                          'Avg Processing Days': parseFloat((r.avg_processing_days ?? 0).toFixed(1)),
                        }))}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 90, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="country" width={85} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v, name) => name === 'Success Rate %' ? `${v}%` : `${v} days`} />
                        <Legend />
                        <Bar dataKey="Success Rate %" fill="#10b981" />
                        <Bar dataKey="Avg Processing Days" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Success Rate Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Country</TableHead>
                          <TableHead className="text-right">Total Applications</TableHead>
                          <TableHead className="text-right">Approved</TableHead>
                          <TableHead className="text-right">Rejected</TableHead>
                          <TableHead className="text-right">Success Rate</TableHead>
                          <TableHead className="text-right">Avg Processing Days</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...successRateData].sort((a, b) => (b.success_rate ?? 0) - (a.success_rate ?? 0)).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.country ?? '—'}</TableCell>
                            <TableCell className="text-right">{row.total_applications ?? 0}</TableCell>
                            <TableCell className="text-right text-green-600">{row.approved ?? 0}</TableCell>
                            <TableCell className="text-right text-red-600">{row.rejected ?? 0}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={Number(row.success_rate) >= 70 ? 'default' : 'secondary'} className="text-xs">
                                {Number(row.success_rate ?? 0).toFixed(1)}%
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{Number(row.avg_processing_days ?? 0).toFixed(1)}d</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
