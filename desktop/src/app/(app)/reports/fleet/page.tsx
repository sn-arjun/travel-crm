'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Truck, Star, TrendingUp, AlertCircle, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
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
import { PRESET_MAP as presetMap } from '@/components/domain/report-page-template';
import {
  ReportExportButton,
  formatReportCurrency as fmt,
  useReportChartColors,
  useReportSemanticColors,
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

export default function FleetReportsPage() {
  const CHART_COLORS = useReportChartColors();
  const semanticColors = useReportSemanticColors();
  const [dateRange, setDateRange] = React.useState('30days');
  const [showComparison, setShowComparison] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('utilization');

  const [utilizationData, setUtilizationData] = React.useState<any[]>([]);
  const [driverData, setDriverData] = React.useState<any[]>([]);
  const [availabilityData, setAvailabilityData] = React.useState<any[]>([]);
  const [tripCostData, setTripCostData] = React.useState<any[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryKey, setRetryKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = { date_preset: presetMap[dateRange] ?? 'this_month', compare: showComparison };

    const reportId =
      activeTab === 'utilization' ? 'fleet_utilization'
        : activeTab === 'driver' ? 'driver_performance'
          : activeTab === 'availability' ? 'fleet_availability'
            : 'trip_cost_analysis';

    reportsApi.execute(reportId, params)
      .then((res: any) => {
        if (cancelled) return;
        const rows = (res?.data?.data ?? []) as any[];
        if (activeTab === 'utilization') setUtilizationData(rows);
        else if (activeTab === 'driver') setDriverData(rows);
        else if (activeTab === 'availability') setAvailabilityData(rows);
        else setTripCostData(rows);
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

  const totalTrips = utilizationData.reduce((s, r) => s + (r.trip_count ?? 0), 0);
  const totalRevenue = utilizationData.reduce((s, r) => s + (r.estimated_revenue ?? 0), 0);
  const totalVehicles = availabilityData.reduce((s, r) => s + (r.vehicle_count ?? 0), 0);
  const totalAvailable = availabilityData.reduce((s, r) => s + (r.available ?? 0), 0);
  const maxDriverTrips = Math.max(...driverData.map((r) => r.trip_count ?? 0), 1);

  const availabilityPieData = availabilityData.map((r) => ({
    name: r.type ?? r.status ?? '—',
    value: r.vehicle_count ?? 0,
  }));

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Breadcrumb + Controls */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Fleet Reports</span>
        </nav>
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
            reportId="fleet_utilization"
            params={{ date_preset: presetMap[dateRange] ?? 'this_month' }}
            filenamePrefix="fleet-report"
            rangeLabel={dateRange}
            size="sm"
          />
        </div>
      </div>

      {/* Title */}
      <div className="px-6 py-3 border-b">
        <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
          Fleet Reports
        </h1>
        <p className="text-sm text-muted-foreground">Vehicle utilization, driver performance, and trip cost analysis</p>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="utilization">Utilization</TabsTrigger>
            <TabsTrigger value="driver">Driver Performance</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
            <TabsTrigger value="tripcost">Trip Cost Analysis</TabsTrigger>
          </TabsList>

          {/* Utilization Tab */}
          <TabsContent value="utilization" className="space-y-6">
            {loading ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                      <CardContent className="pt-4 space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-8 w-16" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <ChartSkeleton />
              </>
            ) : error ? renderError() : utilizationData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Truck className="h-4 w-4" />
                        Total Vehicles
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{utilizationData.length}</div>
                      <p className="text-xs text-muted-foreground mt-1">In fleet</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Trips</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        <div className="text-2xl font-bold">{totalTrips}</div>
                        <TrendingUp className="h-4 w-4 text-green-500 mb-1" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">This period</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Est. Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{fmt(totalRevenue)}</div>
                      <p className="text-xs text-muted-foreground mt-1">Fleet revenue</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Vehicle Utilization</CardTitle>
                    <CardDescription>Trip count and estimated revenue per vehicle</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={[...utilizationData].sort((a, b) => (b.trip_count ?? 0) - (a.trip_count ?? 0)).slice(0, 15).map((r) => ({
                          reg: r.vehicle_reg ?? '—',
                          Trips: r.trip_count ?? 0,
                          Revenue: r.estimated_revenue ?? 0,
                        }))}
                        margin={{ top: 5, right: 30, left: 0, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="reg" angle={-45} textAnchor="end" height={80} />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => fmt(v)} />
                        <Tooltip formatter={(v, name) => name === 'Revenue' ? fmt(v as number) : v} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="Trips" fill={CHART_COLORS[0]} />
                        <Bar yAxisId="right" dataKey="Revenue" fill={semanticColors.success} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Fleet Utilization Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vehicle Reg</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Trip Count</TableHead>
                          <TableHead className="text-right">Est. Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...utilizationData].sort((a, b) => (b.trip_count ?? 0) - (a.trip_count ?? 0)).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium font-mono">{row.vehicle_reg ?? '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{row.type ?? '—'}</Badge></TableCell>
                            <TableCell className="text-right">{row.trip_count ?? 0}</TableCell>
                            <TableCell className="text-right">{fmt(row.estimated_revenue ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Driver Performance Tab */}
          <TabsContent value="driver" className="space-y-6">
            {loading ? <ChartSkeleton /> : error ? renderError() : driverData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Drivers</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{driverData.length}</div>
                      <p className="text-xs text-muted-foreground mt-1">Active drivers</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Trips</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{driverData.reduce((s, r) => s + (r.trip_count ?? 0), 0)}</div>
                      <p className="text-xs text-muted-foreground mt-1">Across all drivers</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                        Avg Rating
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {driverData.length > 0
                          ? (driverData.reduce((s, r) => s + (r.avg_rating ?? 0), 0) / driverData.length).toFixed(1)
                          : '—'}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Fleet average</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Driver Trip Count &amp; Rating</CardTitle>
                    <CardDescription>Trips completed and average rating per driver</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={[...driverData].sort((a, b) => (b.trip_count ?? 0) - (a.trip_count ?? 0)).map((r) => ({
                          name: (r.driver_name ?? '').split(' ')[0],
                          Trips: r.trip_count ?? 0,
                          Rating: parseFloat((r.avg_rating ?? 0).toFixed(1)),
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" domain={[0, 5]} />
                        <Tooltip />
                        <Legend />
                        <Bar yAxisId="left" dataKey="Trips" fill={CHART_COLORS[0]} />
                        <Bar yAxisId="right" dataKey="Rating" fill={semanticColors.warning} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Driver Performance Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Driver Name</TableHead>
                          <TableHead>License Number</TableHead>
                          <TableHead className="text-right">Trips</TableHead>
                          <TableHead className="text-right">Avg Rating</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...driverData].sort((a, b) => (b.trip_count ?? 0) - (a.trip_count ?? 0)).map((row, idx) => {
                          const pct = ((row.trip_count ?? 0) / maxDriverTrips) * 100;
                          return (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{row.driver_name ?? '—'}</TableCell>
                              <TableCell className="font-mono text-xs text-muted-foreground">{row.license_number ?? '—'}</TableCell>
                              <TableCell className="text-right">
                                <div className="space-y-1">
                                  <div className="text-sm font-semibold">{row.trip_count ?? 0}</div>
                                  <div className="h-1.5 rounded-full bg-muted overflow-hidden w-full">
                                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                  <span className="font-medium">{Number(row.avg_rating ?? 0).toFixed(1)}</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Availability Tab */}
          <TabsContent value="availability" className="space-y-6">
            {loading ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <Card key={i}>
                      <CardContent className="pt-4 space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-8 w-16" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <ChartSkeleton />
              </>
            ) : error ? renderError() : availabilityData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Vehicles</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{totalVehicles}</div>
                      <p className="text-xs text-muted-foreground mt-1">In fleet</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-green-600">Available</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">{totalAvailable}</div>
                      <p className="text-xs text-muted-foreground mt-1">Ready to deploy</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-yellow-600">In Maintenance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-yellow-600">
                        {availabilityData.reduce((s, r) => s + (r.in_maintenance ?? 0), 0)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Under service</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-red-600">Inactive</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">
                        {availabilityData.reduce((s, r) => s + (r.inactive ?? 0), 0)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Out of service</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Fleet Distribution</CardTitle>
                      <CardDescription>Vehicle count by type</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={availabilityPieData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, value }) => `${name} (${value})`}
                            outerRadius={80}
                            dataKey="value"
                          >
                            {availabilityPieData.map((_, idx) => (
                              <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Status by Type</CardTitle>
                      <CardDescription>Available vs maintenance vs inactive</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={availabilityData.map((r) => ({
                            type: r.type ?? r.status ?? '—',
                            Available: r.available ?? 0,
                            Maintenance: r.in_maintenance ?? 0,
                            Inactive: r.inactive ?? 0,
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="type" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="Available" fill={semanticColors.success} stackId="a" />
                          <Bar dataKey="Maintenance" fill={semanticColors.warning} stackId="a" />
                          <Bar dataKey="Inactive" fill={semanticColors.danger} stackId="a" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader><CardTitle>Availability Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Available</TableHead>
                          <TableHead className="text-right">In Maintenance</TableHead>
                          <TableHead className="text-right">Inactive</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {availabilityData.map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.type ?? '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{row.status ?? '—'}</Badge></TableCell>
                            <TableCell className="text-right">{row.vehicle_count ?? 0}</TableCell>
                            <TableCell className="text-right text-green-600">{row.available ?? 0}</TableCell>
                            <TableCell className="text-right text-yellow-600">{row.in_maintenance ?? 0}</TableCell>
                            <TableCell className="text-right text-red-600">{row.inactive ?? 0}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Trip Cost Analysis Tab */}
          <TabsContent value="tripcost" className="space-y-6">
            {loading ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                      <CardContent className="pt-4 space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-8 w-16" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <ChartSkeleton />
              </>
            ) : error ? renderError() : tripCostData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{fmt(tripCostData.reduce((s, r) => s + (r.total_cost ?? 0), 0))}</div>
                      <p className="text-xs text-muted-foreground mt-1">All trip types</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Avg Trip Cost</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {tripCostData.length > 0
                          ? fmt(tripCostData.reduce((s, r) => s + (r.avg_trip_cost ?? 0), 0) / tripCostData.length)
                          : '—'}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Average across types</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Avg Distance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {tripCostData.length > 0
                          ? `${(tripCostData.reduce((s, r) => s + (r.avg_distance_km ?? 0), 0) / tripCostData.length).toFixed(0)} km`
                          : '—'}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Per trip average</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Trip Cost by Type</CardTitle>
                    <CardDescription>Average and total cost per trip type</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={tripCostData.map((r) => ({
                          name: r.trip_type ?? '—',
                          'Avg Cost': r.avg_trip_cost ?? 0,
                          'Total Cost': r.total_cost ?? 0,
                          Trips: r.trip_count ?? 0,
                        }))}
                        margin={{ top: 5, right: 30, left: 0, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-35} textAnchor="end" height={80} />
                        <YAxis yAxisId="left" tickFormatter={(v) => fmt(v)} />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip formatter={(v, name) => name === 'Trips' ? v : fmt(v as number)} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="Avg Cost" fill={CHART_COLORS[0]} />
                        <Bar yAxisId="left" dataKey="Total Cost" fill={semanticColors.success} />
                        <Bar yAxisId="right" dataKey="Trips" fill={semanticColors.warning} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Trip Cost Analysis Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Trip Type</TableHead>
                          <TableHead className="text-right">Trips</TableHead>
                          <TableHead className="text-right">Avg Distance (km)</TableHead>
                          <TableHead className="text-right">Avg Trip Cost</TableHead>
                          <TableHead className="text-right">Total Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...tripCostData].sort((a, b) => (b.total_cost ?? 0) - (a.total_cost ?? 0)).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.trip_type ?? '—'}</TableCell>
                            <TableCell className="text-right">{row.trip_count ?? 0}</TableCell>
                            <TableCell className="text-right">{Number(row.avg_distance_km ?? 0).toFixed(1)}</TableCell>
                            <TableCell className="text-right">{fmt(row.avg_trip_cost ?? 0)}</TableCell>
                            <TableCell className="text-right font-semibold">{fmt(row.total_cost ?? 0)}</TableCell>
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
