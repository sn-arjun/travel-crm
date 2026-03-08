'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, Medal, TrendingUp, Users, AlertCircle, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
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
import { reportsApi } from '@/lib/api/reports';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

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

export default function TeamReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');
  const [showComparison, setShowComparison] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('dashboard');

  const [dashboardData, setDashboardData] = React.useState<any[]>([]);
  const [individualData, setIndividualData] = React.useState<any[]>([]);
  const [responseTimeData, setResponseTimeData] = React.useState<any[]>([]);
  const [activityData, setActivityData] = React.useState<any[]>([]);
  const [taskData, setTaskData] = React.useState<any[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryKey, setRetryKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = { date_preset: presetMap[dateRange] ?? 'this_month', compare: showComparison };

    const reportId = activeTab === 'dashboard' ? 'team_dashboard'
      : activeTab === 'individual' ? 'individual_performance'
      : activeTab === 'response' ? 'response_time_by_user'
      : activeTab === 'activity' ? 'activity_report'
      : 'task_completion';

    reportsApi.execute(reportId, params)
      .then((res: any) => {
        if (cancelled) return;
        const rows = Array.isArray(res) ? res : (res?.data ?? res?.rows ?? []);
        if (activeTab === 'dashboard') setDashboardData(rows);
        else if (activeTab === 'individual') setIndividualData(rows);
        else if (activeTab === 'response') setResponseTimeData(rows);
        else if (activeTab === 'activity') setActivityData(rows);
        else setTaskData(rows);
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
      await reportsApi.export('team_dashboard', 'excel', { date_preset: presetMap[dateRange] ?? 'this_month' });
      toast.success('Export started');
    } catch {
      toast.error('Export failed');
    }
  };

  const totalLeads = dashboardData.reduce((s, r) => s + (r.total_leads ?? 0), 0);
  const totalWon = dashboardData.reduce((s, r) => s + (r.won_deals ?? 0), 0);
  const totalRevenue = dashboardData.reduce((s, r) => s + (r.total_revenue ?? 0), 0);
  const avgConversion = totalLeads > 0 ? ((totalWon / totalLeads) * 100).toFixed(1) : '0.0';

  const responseChartData = responseTimeData.map((r) => ({
    name: (r.assigned_to ?? '').split(' ')[0],
    'Avg Response (hrs)': parseFloat((r.avg_response_hours ?? 0).toFixed(1)),
  }));

  const activityChartData = React.useMemo(() => {
    const byMember: Record<string, Record<string, number>> = {};
    activityData.forEach((r) => {
      const member = r.team_member ?? '';
      const type = r.type ?? 'Activity';
      if (!byMember[member]) byMember[member] = {};
      byMember[member][type] = (byMember[member][type] ?? 0) + (r.activity_count ?? 0);
    });
    return Object.entries(byMember).map(([member, types]) => ({ member, ...types }));
  }, [activityData]);

  const taskChartData = taskData.map((r) => ({
    name: (r.assigned_to ?? '').split(' ')[0],
    Completed: r.completed_tasks ?? 0,
    Pending: r.pending_tasks ?? 0,
    Overdue: r.overdue_tasks ?? 0,
  }));

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

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Team Reports</span>
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
          Team Performance Reports
        </h1>
        <p className="text-sm text-muted-foreground">Individual and team performance metrics</p>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="dashboard">Overview</TabsTrigger>
            <TabsTrigger value="individual">Individual Performance</TabsTrigger>
            <TabsTrigger value="response">Response Time</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="tasks">Task Completion</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {loading ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <Card key={i}><CardContent className="pt-4 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /></CardContent></Card>
                  ))}
                </div>
                <ChartSkeleton />
              </>
            ) : error ? renderError() : dashboardData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Leads</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        <div className="text-2xl font-bold">{totalLeads}</div>
                        <TrendingUp className="h-4 w-4 text-green-500 mb-1" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">All team members</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Deals Won</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        <div className="text-2xl font-bold">{totalWon}</div>
                        <TrendingUp className="h-4 w-4 text-green-500 mb-1" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Conversion: {avgConversion}%</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{fmt(totalRevenue)}</div>
                      <p className="text-xs text-muted-foreground mt-1">Team contribution</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Team Members</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        <div className="text-2xl font-bold">{dashboardData.length}</div>
                        <Users className="h-4 w-4 text-blue-500 mb-1" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Active consultants</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Leaderboard */}
                <Card>
                  <CardHeader>
                    <CardTitle>Team Leaderboard</CardTitle>
                    <CardDescription>Ranked by revenue contribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[...dashboardData]
                        .sort((a, b) => (b.total_revenue ?? 0) - (a.total_revenue ?? 0))
                        .map((row, idx) => {
                          let medal: React.ReactNode = null;
                          if (idx === 0) medal = <Medal className="h-4 w-4 text-yellow-500" />;
                          else if (idx === 1) medal = <Medal className="h-4 w-4 text-gray-400" />;
                          else if (idx === 2) medal = <Medal className="h-4 w-4 text-orange-600" />;
                          return (
                            <div key={idx} className="flex items-center justify-between py-2 border-b last:border-b-0">
                              <div className="flex items-center gap-3 flex-1">
                                <span className="text-sm font-semibold w-6">{idx + 1}</span>
                                {medal && <div>{medal}</div>}
                                <div>
                                  <span className="text-sm font-medium">{row.team_member ?? '—'}</span>
                                  {row.department && <span className="text-xs text-muted-foreground ml-2">{row.department}</span>}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-semibold">{fmt(row.total_revenue ?? 0)}</div>
                                <div className="text-xs text-muted-foreground">{row.conversion_rate != null ? `${Number(row.conversion_rate).toFixed(1)}% conv.` : `${row.won_deals ?? 0} won`}</div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>

                {/* Dashboard Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Revenue by Team Member</CardTitle>
                    <CardDescription>Total revenue contribution</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={dashboardData.map((r) => ({ name: (r.team_member ?? '').split(' ')[0], Revenue: r.total_revenue ?? 0, Leads: r.total_leads ?? 0 }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis yAxisId="left" tickFormatter={(v) => fmt(v)} />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip formatter={(value, name) => name === 'Revenue' ? fmt(value as number) : value} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="Revenue" fill="#3b82f6" />
                        <Bar yAxisId="right" dataKey="Leads" fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Individual Performance Tab */}
          <TabsContent value="individual" className="space-y-6">
            {loading ? <ChartSkeleton /> : error ? renderError() : individualData.length === 0 ? renderEmpty() : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Individual Performance</CardTitle>
                    <CardDescription>Monthly breakdown per team member</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={individualData.map((r) => ({ name: (r.assigned_to ?? '').split(' ')[0], Revenue: r.revenue ?? 0, Leads: r.total_leads ?? 0, Won: r.won_deals ?? 0 }))}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis yAxisId="left" tickFormatter={(v) => fmt(v)} />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip formatter={(value, name) => name === 'Revenue' ? fmt(value as number) : value} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="Revenue" fill="#3b82f6" />
                        <Bar yAxisId="right" dataKey="Leads" fill="#10b981" />
                        <Bar yAxisId="right" dataKey="Won" fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Performance Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Team Member</TableHead>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-right">Leads</TableHead>
                          <TableHead className="text-right">Won</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                          <TableHead className="text-right">Conv. Rate</TableHead>
                          <TableHead className="text-right">Avg Days to Close</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {individualData.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.assigned_to ?? '—'}</TableCell>
                            <TableCell>{row.month ?? '—'}</TableCell>
                            <TableCell className="text-right">{row.total_leads ?? 0}</TableCell>
                            <TableCell className="text-right">{row.won_deals ?? 0}</TableCell>
                            <TableCell className="text-right">{fmt(row.revenue ?? 0)}</TableCell>
                            <TableCell className="text-right">{row.conversion_rate != null ? `${Number(row.conversion_rate).toFixed(1)}%` : '—'}</TableCell>
                            <TableCell className="text-right">{row.avg_days_to_close != null ? Number(row.avg_days_to_close).toFixed(1) : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Response Time Tab */}
          <TabsContent value="response" className="space-y-6">
            {loading ? <ChartSkeleton /> : error ? renderError() : responseTimeData.length === 0 ? renderEmpty() : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Average Response Time</CardTitle>
                    <CardDescription>Hours to first response by team member</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={responseChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis unit="h" />
                        <Tooltip formatter={(v) => `${v}h`} />
                        <Bar dataKey="Avg Response (hrs)" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Response Time Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Team Member</TableHead>
                          <TableHead className="text-right">Total Leads</TableHead>
                          <TableHead className="text-right">Avg Response (hrs)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {responseTimeData.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.assigned_to ?? '—'}</TableCell>
                            <TableCell className="text-right">{row.total_leads ?? 0}</TableCell>
                            <TableCell className="text-right">{Number(row.avg_response_hours ?? 0).toFixed(1)}h</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-6">
            {loading ? <ChartSkeleton /> : error ? renderError() : activityData.length === 0 ? renderEmpty() : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Activity Report</CardTitle>
                    <CardDescription>Activity count by team member and type</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={activityChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="member" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {Array.from(new Set(activityData.map((r) => r.type ?? 'Activity'))).map((type, idx) => (
                          <Bar key={type} dataKey={type} fill={CHART_COLORS[idx % CHART_COLORS.length]} stackId="a" />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Activity Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Team Member</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Activity Count</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activityData.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.team_member ?? '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{row.type ?? '—'}</Badge></TableCell>
                            <TableCell className="text-right">{row.activity_count ?? 0}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Task Completion Tab */}
          <TabsContent value="tasks" className="space-y-6">
            {loading ? <ChartSkeleton /> : error ? renderError() : taskData.length === 0 ? renderEmpty() : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Task Completion Status</CardTitle>
                    <CardDescription>Completed vs Pending vs Overdue tasks</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={taskChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="Completed" fill="#10b981" />
                        <Bar dataKey="Pending" fill="#f59e0b" />
                        <Bar dataKey="Overdue" fill="#ef4444" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Task Completion Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Team Member</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Completed</TableHead>
                          <TableHead className="text-right">Pending</TableHead>
                          <TableHead className="text-right">Overdue</TableHead>
                          <TableHead className="text-right">Completion Rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {taskData.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.assigned_to ?? '—'}</TableCell>
                            <TableCell className="text-right">{row.total_tasks ?? 0}</TableCell>
                            <TableCell className="text-right">{row.completed_tasks ?? 0}</TableCell>
                            <TableCell className="text-right">{row.pending_tasks ?? 0}</TableCell>
                            <TableCell className="text-right text-red-600">{row.overdue_tasks ?? 0}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className="text-xs">
                                {row.completion_rate != null ? `${Number(row.completion_rate).toFixed(1)}%` : '—'}
                              </Badge>
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
        </Tabs>
      </div>
    </div>
  );
}
