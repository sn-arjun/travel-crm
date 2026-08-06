'use client';

import * as React from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { reportsApi } from '@/lib/api/reports';
import {
  ReportPageTemplate,
  SummaryCard,
  KPISkeleton,
  ReportErrorState,
  ReportEmptyState,
  PRESET_MAP,
} from '@/components/domain/report-page-template';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export default function SalesReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');
  const [compareEnabled, setCompareEnabled] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('summary');
  const [retryKey, setRetryKey] = React.useState(0);

  const currentPreset = PRESET_MAP[dateRange] ?? 'this_month';
  const baseParams = { date_preset: currentPreset, compare: compareEnabled };

  // ── Data fetching ────────────────────────────────────────────────────────

  const { data: summaryResp, loading: summaryLoading, error: summaryError } = useApiQuery(
    () => reportsApi.execute('sales_summary', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  const { data: destResp, loading: destLoading, error: destError } = useApiQuery(
    () => reportsApi.execute('sales_by_destination', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  const { data: salesPersonResp, loading: salesPersonLoading, error: salesPersonError } = useApiQuery(
    () => reportsApi.execute('sales_by_salesperson', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  const { data: tripTypeResp, loading: tripTypeLoading, error: tripTypeError } = useApiQuery(
    () => reportsApi.execute('sales_by_trip_type', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  const { data: sourceResp, loading: sourceLoading, error: sourceError } = useApiQuery(
    () => reportsApi.execute('sales_by_source', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  const { data: dealSizeResp, loading: dealSizeLoading, error: dealSizeError } = useApiQuery(
    () => reportsApi.execute('avg_deal_size', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  const { data: forecastResp, loading: forecastLoading, error: forecastError } = useApiQuery(
    () => reportsApi.execute('revenue_forecast', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  const { data: winLossResp, loading: winLossLoading, error: winLossError } = useApiQuery(
    () => reportsApi.execute('win_loss_analysis', baseParams),
    [dateRange, compareEnabled, retryKey],
  );

  // ── Derived data ─────────────────────────────────────────────────────────

  const summaryData: any[] = (summaryResp as any)?.data?.data ?? [];
  const destData: any[] = (destResp as any)?.data?.data ?? [];
  const salesPersonData: any[] = (salesPersonResp as any)?.data?.data ?? [];
  const tripTypeData: any[] = (tripTypeResp as any)?.data?.data ?? [];
  const sourceData: any[] = (sourceResp as any)?.data?.data ?? [];
  const dealSizeData: any[] = (dealSizeResp as any)?.data?.data ?? [];
  const forecastData: any[] = (forecastResp as any)?.data?.data ?? [];
  const winLossData: any[] = (winLossResp as any)?.data?.data ?? [];

  // ── KPI derivations ──────────────────────────────────────────────────────

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

  // ── Handlers ─────────────────────────────────────────────────────────────

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

  // ── KPI header cards ─────────────────────────────────────────────────────

  const kpiCards = summaryLoading ? (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KPISkeleton />
      <KPISkeleton />
      <KPISkeleton />
      <KPISkeleton />
    </div>
  ) : summaryError ? (
    <ReportErrorState message="Failed to load report" onRetry={handleRetry} />
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
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ReportPageTemplate
      title="Sales Reports"
      description="Detailed sales analysis and performance metrics"
      selectedPeriod={dateRange}
      onPeriodChange={setDateRange}
      isLoading={summaryLoading}
      error={undefined}
      onRetry={handleRetry}
      exportFn={handleExport}
      compareEnabled={compareEnabled}
      onCompareChange={setCompareEnabled}
      headerCards={kpiCards}
    >
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
                <ReportErrorState message="Failed to load report" onRetry={handleRetry} />
              ) : summaryData.length === 0 ? (
                <ReportEmptyState />
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
                <ReportErrorState message="Failed to load report" onRetry={handleRetry} />
              ) : destData.length === 0 ? (
                <ReportEmptyState />
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
                <ReportErrorState message="Failed to load report" onRetry={handleRetry} />
              ) : salesPersonData.length === 0 ? (
                <ReportEmptyState />
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
                <ReportErrorState message="Failed to load report" onRetry={handleRetry} />
              ) : tripTypeData.length === 0 ? (
                <ReportEmptyState />
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
                <ReportErrorState message="Failed to load report" onRetry={handleRetry} />
              ) : sourceData.length === 0 ? (
                <ReportEmptyState />
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
                <ReportErrorState message="Failed to load report" onRetry={handleRetry} />
              ) : dealSizeData.length === 0 ? (
                <ReportEmptyState />
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
                <ReportErrorState message="Failed to load report" onRetry={handleRetry} />
              ) : forecastData.length === 0 ? (
                <ReportEmptyState />
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
                <ReportErrorState message="Failed to load report" onRetry={handleRetry} />
              ) : winLossData.length === 0 ? (
                <ReportEmptyState />
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
    </ReportPageTemplate>
  );
}
