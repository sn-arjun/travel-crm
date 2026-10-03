'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Users, TrendingUp, Cake, Clock, AlertCircle, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
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
import { unwrapReport } from '@/lib/api/envelope';
import { PRESET_MAP as presetMap } from '@/components/domain/report-page-template';
import {
  ReportExportButton,
  formatReportCurrency as fmt,
  useReportChartColors,
} from '@/components/domain/reports/shared';

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

export default function CustomerReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');
  const [showComparison, setShowComparison] = React.useState(false);
  const CHART_COLORS = useReportChartColors();
  const [activeTab, setActiveTab] = React.useState('repeat');

  const [repeatData, setRepeatData] = React.useState<any[]>([]);
  const [ltvData, setLtvData] = React.useState<any[]>([]);
  const [birthdayData, setBirthdayData] = React.useState<any[]>([]);
  const [dormantData, setDormantData] = React.useState<any[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryKey, setRetryKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = { date_preset: presetMap[dateRange] ?? 'this_month', compare: showComparison };

    const reportId = activeTab === 'repeat' ? 'repeat_customers'
      : activeTab === 'ltv' ? 'customer_ltv'
      : activeTab === 'birthday' ? 'birthday_upcoming'
      : 'dormant_customers';

    reportsApi.execute(reportId, params)
      .then((res: any) => {
        if (cancelled) return;
        // /reports/:id answers { success, data: { data: rows, columns, meta } }
        const rows = unwrapReport(res).data;
        if (activeTab === 'repeat') setRepeatData(rows);
        else if (activeTab === 'ltv') setLtvData(rows);
        else if (activeTab === 'birthday') setBirthdayData(rows);
        else setDormantData(rows);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load report data');
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [dateRange, showComparison, activeTab, retryKey]);

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

  const topLtv = [...ltvData].sort((a, b) => (b.total_ltv ?? 0) - (a.total_ltv ?? 0)).slice(0, 15);

  const repeatTotal = repeatData.reduce((s, r) => s + (r.total_spent ?? 0), 0);
  const repeatCount = repeatData.length;

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Customer Reports</span>
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
          <ReportExportButton
            reportId="repeat_customers"
            params={{ date_preset: presetMap[dateRange] ?? 'this_month' }}
            filenamePrefix="customer-report"
            rangeLabel={dateRange}
            size="sm"
          />
        </div>
      </div>

      {/* Title */}
      <div className="px-6 py-3 border-b">
        <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Customer Reports
        </h1>
        <p className="text-sm text-muted-foreground">Customer lifetime value and segmentation analysis</p>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="repeat">Repeat Customers</TabsTrigger>
            <TabsTrigger value="ltv">Lifetime Value</TabsTrigger>
            <TabsTrigger value="birthday">Upcoming Birthdays</TabsTrigger>
            <TabsTrigger value="dormant">Dormant</TabsTrigger>
          </TabsList>

          {/* Repeat Customers Tab */}
          <TabsContent value="repeat" className="space-y-6">
            {loading ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i}><CardContent className="pt-4 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /></CardContent></Card>
                  ))}
                </div>
                <ChartSkeleton />
              </>
            ) : error ? renderError() : repeatData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Repeat Customers</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        <div className="text-2xl font-bold">{repeatCount}</div>
                        <Users className="h-4 w-4 text-blue-500 mb-1" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Multiple bookings</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{fmt(repeatTotal)}</div>
                      <p className="text-xs text-muted-foreground mt-1">Repeat customer revenue</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Avg Bookings</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        <div className="text-2xl font-bold">
                          {repeatCount > 0 ? (repeatData.reduce((s, r) => s + (r.booking_count ?? 0), 0) / repeatCount).toFixed(1) : '0'}
                        </div>
                        <TrendingUp className="h-4 w-4 text-green-500 mb-1" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Per customer</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Top Repeat Customers by Spend</CardTitle>
                    <CardDescription>Customers with highest total booking value</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={[...repeatData].sort((a, b) => (b.total_spent ?? 0) - (a.total_spent ?? 0)).slice(0, 10).map((r) => ({
                          name: (r.customer_name ?? '').split(' ').slice(0, 1).join(''),
                          Spend: r.total_spent ?? 0,
                          Bookings: r.booking_count ?? 0,
                        }))}
                        margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis tickFormatter={(v) => fmt(v)} />
                        <Tooltip formatter={(v, name) => name === 'Spend' ? fmt(v as number) : v} />
                        <Legend />
                        <Bar dataKey="Spend" fill={CHART_COLORS[0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Repeat Customers</CardTitle>
                    <CardDescription>{repeatCount} customers with multiple bookings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="text-right">Bookings</TableHead>
                          <TableHead className="text-right">Total Spent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...repeatData].sort((a, b) => (b.booking_count ?? 0) - (a.booking_count ?? 0)).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.customer_name ?? '—'}</TableCell>
                            <TableCell className="text-muted-foreground">{row.email ?? '—'}</TableCell>
                            <TableCell className="text-right">{row.booking_count ?? 0}</TableCell>
                            <TableCell className="text-right">{fmt(row.total_spent ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* LTV Tab */}
          <TabsContent value="ltv" className="space-y-6">
            {loading ? <ChartSkeleton /> : error ? renderError() : ltvData.length === 0 ? renderEmpty() : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Top 15 Customers by Lifetime Value</CardTitle>
                    <CardDescription>Ranked by total LTV</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={topLtv.map((r) => ({ name: (r.customer_name ?? '').split(' ')[0], LTV: r.total_ltv ?? 0 }))}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tickFormatter={(v) => fmt(v)} />
                        <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v) => fmt(v as number)} />
                        <Bar dataKey="LTV" fill={CHART_COLORS[0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Customer LTV Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer Name</TableHead>
                          <TableHead className="text-right">Total Bookings</TableHead>
                          <TableHead className="text-right">Total LTV</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ltvData.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.customer_name ?? '—'}</TableCell>
                            <TableCell className="text-right">{row.total_bookings ?? 0}</TableCell>
                            <TableCell className="text-right font-semibold">{fmt(row.total_ltv ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Birthday Tab */}
          <TabsContent value="birthday" className="space-y-6">
            {loading ? <ChartSkeleton /> : error ? renderError() : birthdayData.length === 0 ? renderEmpty() : (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cake className="h-5 w-5" />
                    Upcoming Birthdays
                  </CardTitle>
                  <CardDescription>{birthdayData.length} customers with upcoming birthdays</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Date of Birth</TableHead>
                        <TableHead className="text-right">Days Until Birthday</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...birthdayData].sort((a, b) => (a.days_until_birthday ?? 0) - (b.days_until_birthday ?? 0)).map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{row.customer_name ?? '—'}</TableCell>
                          <TableCell className="text-muted-foreground">{row.email ?? '—'}</TableCell>
                          <TableCell>{row.phone ?? '—'}</TableCell>
                          <TableCell>{row.date_of_birth ?? '—'}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={row.days_until_birthday <= 7 ? 'default' : 'outline'} className="text-xs">
                              {row.days_until_birthday ?? 0} days
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Dormant Tab */}
          <TabsContent value="dormant" className="space-y-6">
            {loading ? <ChartSkeleton /> : error ? renderError() : dormantData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Dormant Customers</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        <div className="text-2xl font-bold">{dormantData.length}</div>
                        <Clock className="h-4 w-4 text-orange-500 mb-1" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">No recent activity</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Avg Days Inactive</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {dormantData.length > 0 ? Math.round(dormantData.reduce((s, r) => s + (r.days_since_last_booking ?? 0), 0) / dormantData.length) : 0}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Days since last booking</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Recoverable Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{fmt(dormantData.reduce((s, r) => s + (r.total_past_bookings ?? 0) * 50000, 0))}</div>
                      <p className="text-xs text-muted-foreground mt-1">Est. re-engagement value</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Dormant Customers
                    </CardTitle>
                    <CardDescription>No activity — re-engagement opportunities</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Last Booking</TableHead>
                          <TableHead className="text-right">Past Bookings</TableHead>
                          <TableHead className="text-right">Days Inactive</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...dormantData].sort((a, b) => (b.days_since_last_booking ?? 0) - (a.days_since_last_booking ?? 0)).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.customer_name ?? '—'}</TableCell>
                            <TableCell className="text-muted-foreground">{row.email ?? '—'}</TableCell>
                            <TableCell>{row.phone ?? '—'}</TableCell>
                            <TableCell>{row.last_booking_date ?? '—'}</TableCell>
                            <TableCell className="text-right">{row.total_past_bookings ?? 0}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant={row.days_since_last_booking > 180 ? 'destructive' : 'secondary'} className="text-xs">
                                {row.days_since_last_booking ?? 0}d
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
