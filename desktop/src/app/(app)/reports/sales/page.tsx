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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
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

// Summary card component
function SummaryCard({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground mb-1">{label}</p>
        <p className="text-2xl font-bold mb-1">{value}</p>
        {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

// KPI skeleton card
function KPISkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}

// Error state
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <p className="text-sm font-medium text-destructive">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="h-4 w-4 mr-1.5" />
        Retry
      </Button>
    </div>
  );
}

// Empty state
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
      <p className="text-sm">No data for selected period.</p>
    </div>
  );
}

// Date range selector component
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

export default function SalesReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');
  const [compareEnabled, setCompareEnabled] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('summary');
  const [retryKey, setRetryKey] = React.useState(0);

  const currentPreset = presetMap[dateRange] ?? 'this_month';
  const baseParams = { date_preset: currentPreset, compare: compareEnabled };

  // Summary tab
  const { data: summaryResp, loading: summaryLoading, error: summaryError } = useApiQuery(
    () => reportsApi.execute('sales_summary', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  // Destination tab
  const { data: destResp, loading: destLoading, error: destError } = useApiQuery(
    () => reportsApi.execute('sales_by_destination', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  // Salesperson tab
  const { data: salesPersonResp, loading: salesPersonLoading, error: salesPersonError } = useApiQuery(
    () => reportsApi.execute('sales_by_salesperson', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  // Trip Type tab
  const { data: tripTypeResp, loading: tripTypeLoading, error: tripTypeError } = useApiQuery(
    () => reportsApi.execute('sales_by_trip_type', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  // Source tab
  const { data: sourceResp, loading: sourceLoading, error: sourceError } = useApiQuery(
    () => reportsApi.execute('sales_by_source', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  // Deal Size tab
  const { data: dealSizeResp, loading: dealSizeLoading, error: dealSizeError } = useApiQuery(
    () => reportsApi.execute('avg_deal_size', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  // Forecast tab
  const { data: forecastResp, loading: forecastLoading, error: forecastError } = useApiQuery(
    () => reportsApi.execute('revenue_forecast', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  // Win/Loss tab
  const { data: winLossResp, loading: winLossLoading, error: winLossError } = useApiQuery(
    () => reportsApi.execute('win_loss_analysis', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  const summaryData: any[] = (summaryResp as any)?.data?.data ?? [];
  const destData: any[] = (destResp as any)?.data?.data ?? [];
  const salesPersonData: any[] = (salesPersonResp as any)?.data?.data ?? [];
  const tripTypeData: any[] = (tripTypeResp as any)?.data?.data ?? [];
  const sourceData: any[] = (sourceResp as any)?.data?.data ?? [];
  const dealSizeData: any[] = (dealSizeResp as any)?.data?.data ?? [];
  const forecastData: any[] = (forecastResp as any)?.data?.data ?? [];
  const winLossData: any[] = (winLossResp as any)?.data?.data ?? [];

  // KPI derivations from summary data
  const totalRevenue = summaryData.reduce((sum: number, d: any) => sum + (d.total_revenue ?? 0), 0);
  const totalSalesCount = summaryData.reduce((sum: number, d: any) => sum + (d.total_leads ?? 0), 0);
  const avgConversionRate = summaryData.length > 0
    ? (summaryData.reduce((sum: number, d: any) => sum + (d.conversion_rate ?? 0), 0) / summaryData.length).toFixed(1)
    : '0';

  const growthLabel = compareEnabled
    ? (() => {
        const prev = (summaryResp as any)?.data?.previous_period;
        if (prev && typeof prev === 'object' && 'total_revenue' in prev) {
          const prevRev = (prev as any).total_revenue ?? 0;
          if (prevRev > 0) {
            const pct = (((totalRevenue - prevRev) / prevRev) * 100).toFixed(1);
            return `${Number(pct) >= 0 ? '+' : ''}${pct}% vs previous period`;
          }
        }
        return '+0% vs previous period';
      })()
    : '+0% from previous period';

  const handleExport = async () => {
    try {
      const resp = await reportsApi.export('sales_summary', 'excel', { date_preset: currentPreset });
      const blob = (resp as any)?.data instanceof Blob ? (resp as any).data : new Blob([resp as any]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales-report-${currentPreset}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch {
      toast.error('Failed to export report');
    }
  };

  const handleRetry = () => setRetryKey((k) => k + 1);

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
          <span>/</span>
          <span className="text-foreground font-medium">Sales Reports</span>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link href="/reports">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Sales Reports</h1>
              <p className="text-sm text-muted-foreground">Detailed sales analysis and performance metrics</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1.5" />
              Export
            </Button>
          </div>
        </div>

        {/* Quick KPI Cards */}
        {summaryLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPISkeleton />
            <KPISkeleton />
            <KPISkeleton />
            <KPISkeleton />
          </div>
        ) : summaryError ? (
          <ErrorState message="Failed to load report" onRetry={handleRetry} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryCard
              label="Total Revenue"
              value={totalRevenue >= 100000 ? `\u20B9${(totalRevenue / 100000).toFixed(1)}L` : `\u20B9${totalRevenue.toLocaleString()}`}
              subtext="Selected period"
            />
            <SummaryCard
              label="Total Sales"
              value={String(totalSalesCount)}
              subtext="Bookings made"
            />
            <SummaryCard
              label="Conversion Rate"
              value={`${avgConversionRate}%`}
              subtext="Avg across period"
            />
            <SummaryCard
              label="Growth"
              value={growthLabel.split('%')[0] + '%'}
              subtext={growthLabel.split('% ').slice(1).join('% ')}
            />
          </div>
        )}
      </div>

      {/* Date Range + Compare Filter */}
      <div className="px-6 py-3 border-b bg-muted/50 flex flex-wrap justify-between items-center gap-3">
        <DateRangeSelector value={dateRange} onChange={setDateRange} />
        <div className="flex items-center gap-2">
          <Switch
            id="compare-toggle"
            checked={compareEnabled}
            onCheckedChange={setCompareEnabled}
          />
          <Label htmlFor="compare-toggle" className="text-sm cursor-pointer">
            Compare with previous period
          </Label>
        </div>
      </div>

      {/* Main Content - Tabs */}
      <div className="flex-1 p-6 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 lg:grid-cols-8 mb-6">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="destination">Destination</TabsTrigger>
            <TabsTrigger value="salesperson">Salesperson</TabsTrigger>
            <TabsTrigger value="triptype">Trip Type</TabsTrigger>
            <TabsTrigger value="source">Source</TabsTrigger>
            <TabsTrigger value="dealsize" className="hidden lg:flex">Deal Size</TabsTrigger>
            <TabsTrigger value="forecast" className="hidden lg:flex">Forecast</TabsTrigger>
            <TabsTrigger value="winloss" className="hidden lg:flex">Win/Loss</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sales Summary</CardTitle>
              </CardHeader>
              <CardContent>
                {summaryLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : summaryError ? (
                  <ErrorState message="Failed to load report" onRetry={handleRetry} />
                ) : summaryData.length === 0 ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={summaryData}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => `\u20B9${((value as number) / 100000).toFixed(1)}L`} />
                      <Legend />
                      <Area type="monotone" dataKey="total_revenue" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRevenue)" name="Revenue" />
                      {compareEnabled && (
                        <Area type="monotone" dataKey="prev_revenue" stroke="#f59e0b" strokeDasharray="5 5" fill="none" name="Prev Period" />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Destination Tab */}
          <TabsContent value="destination" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Destinations by Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                {destLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : destError ? (
                  <ErrorState message="Failed to load report" onRetry={handleRetry} />
                ) : destData.length === 0 ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={destData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={100} />
                      <Tooltip formatter={(value) => `\u20B9${((value as number) / 1000000).toFixed(1)}M`} />
                      <Bar dataKey="revenue" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Salesperson Tab */}
          <TabsContent value="salesperson" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sales by Salesperson</CardTitle>
              </CardHeader>
              <CardContent>
                {salesPersonLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : salesPersonError ? (
                  <ErrorState message="Failed to load report" onRetry={handleRetry} />
                ) : salesPersonData.length === 0 ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={salesPersonData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="revenue" fill="#10b981" name="Revenue (\u20B9)" />
                      <Bar dataKey="target" fill="#f59e0b" name="Target (\u20B9)" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Trip Type Tab */}
          <TabsContent value="triptype" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sales by Trip Type</CardTitle>
              </CardHeader>
              <CardContent>
                {tripTypeLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : tripTypeError ? (
                  <ErrorState message="Failed to load report" onRetry={handleRetry} />
                ) : tripTypeData.length === 0 ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={tripTypeData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name} (${value}%)`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {tripTypeData.map((_entry: any, index: any) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `${value}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Source Tab */}
          <TabsContent value="source" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sales by Source</CardTitle>
              </CardHeader>
              <CardContent>
                {sourceLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : sourceError ? (
                  <ErrorState message="Failed to load report" onRetry={handleRetry} />
                ) : sourceData.length === 0 ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={sourceData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name} (${value}%)`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {sourceData.map((_entry: any, index: any) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `${value}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Deal Size Tab */}
          <TabsContent value="dealsize" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Average Deal Size Trend</CardTitle>
              </CardHeader>
              <CardContent>
                {dealSizeLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : dealSizeError ? (
                  <ErrorState message="Failed to load report" onRetry={handleRetry} />
                ) : dealSizeData.length === 0 ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dealSizeData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => `\u20B9${((value as number) / 100000).toFixed(1)}L`} />
                      <Legend />
                      <Line type="monotone" dataKey="avgSize" stroke="#8b5cf6" name="Average Size" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Forecast Tab */}
          <TabsContent value="forecast" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sales Forecast with Projection</CardTitle>
              </CardHeader>
              <CardContent>
                {forecastLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : forecastError ? (
                  <ErrorState message="Failed to load report" onRetry={handleRetry} />
                ) : forecastData.length === 0 ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={forecastData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => `\u20B9${((value as number) / 100000).toFixed(1)}L`} />
                      <Legend />
                      <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="Actual" />
                      <Area type="monotone" dataKey="projected" stroke="#f59e0b" strokeDasharray="5 5" fill="none" name="Projected" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Win/Loss Tab */}
          <TabsContent value="winloss" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Win/Loss Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                {winLossLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : winLossError ? (
                  <ErrorState message="Failed to load report" onRetry={handleRetry} />
                ) : winLossData.length === 0 ? (
                  <EmptyState />
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={winLossData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="won" fill="#10b981" name="Won" />
                      <Bar dataKey="lost" fill="#ef4444" name="Lost" />
                    </BarChart>
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
