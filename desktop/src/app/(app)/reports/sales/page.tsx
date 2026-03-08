'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { reportsApi } from '@/lib/api/reports';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

// Fallback/sample data in case API is unavailable
const getFallbackSalesData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const baseRevenue = [1200000, 1450000, 1680000, 1550000, 1920000, 2100000, 2350000, 2200000, 2450000, 2300000, 2550000, 2800000];
  const projectedRevenue = baseRevenue.slice(0, 9).concat([2600000, 2900000, 3100000]);

  return months.map((month, i) => ({
    month,
    revenue: baseRevenue[i] ?? 0,
    projected: projectedRevenue[i] ?? 0,
    lastYear: (baseRevenue[i] ?? 0) * 0.82,
  }));
};

const getFallbackDestinationData = () => [
  { name: 'Maldives', revenue: 4200000, sales: 24 },
  { name: 'Bali', revenue: 3850000, sales: 22 },
  { name: 'Dubai', revenue: 3650000, sales: 20 },
  { name: 'Thailand', revenue: 3420000, sales: 19 },
  { name: 'Europe Tour', revenue: 3200000, sales: 18 },
  { name: 'Goa', revenue: 2950000, sales: 17 },
  { name: 'Kashmir', revenue: 2750000, sales: 16 },
  { name: 'Singapore', revenue: 2400000, sales: 14 },
  { name: 'Japan', revenue: 2200000, sales: 13 },
  { name: 'Ladakh', revenue: 1850000, sales: 12 },
];

const getFallbackSalespersonData = () => [
  { name: 'Arjun S', sales: 28, revenue: 3500000, target: 3000000 },
  { name: 'Priya M', sales: 25, revenue: 3200000, target: 3000000 },
  { name: 'Rahul K', sales: 22, revenue: 2850000, target: 2800000 },
  { name: 'Sneha D', sales: 20, revenue: 2650000, target: 2800000 },
  { name: 'Vikram P', sales: 18, revenue: 2400000, target: 2500000 },
];

const getFallbackTripTypeData = () => [
  { name: 'Honeymoon', value: 34, revenue: 4250000 },
  { name: 'Family', value: 28, revenue: 3420000 },
  { name: 'Business', value: 18, revenue: 2280000 },
  { name: 'Adventure', value: 15, revenue: 1850000 },
  { name: 'Group', value: 5, revenue: 800000 },
];

const getFallbackSourceData = () => [
  { name: 'Website', value: 35, conversion: 28.5 },
  { name: 'Referral', value: 28, conversion: 35.2 },
  { name: 'Social', value: 18, conversion: 22.3 },
  { name: 'Walk-in', value: 12, conversion: 18.4 },
  { name: 'Agent', value: 7, conversion: 42.1 },
];

const getFallbackDealSizeData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((month, i) => ({
    month,
    avgSize: 110000 + (i * 5000) + (i % 3) * 8000,
  }));
};

const getFallbackWinLossData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((month, i) => ({
    month,
    won: 18 + (i % 5),
    lost: 4 + (i % 3),
  }));
};

// Summary card component
function SummaryCard({ label, value, subtext, color = 'bg-blue-500' }: { label: string; value: string; subtext?: string; color?: string }) {
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

  // Fetch sales report data from API
  const { data: reportData, loading, error } = useApiQuery(
    async () => {
      try {
        const response = await reportsApi.getSalesReport?.({ dateRange }) ??
          Promise.resolve({
            summary: {
              totalRevenue: 0,
              totalSales: 0,
              avgRevenue: 0,
              growth: 0,
            },
            sales: getFallbackSalesData(),
            destinations: getFallbackDestinationData(),
            salespersons: getFallbackSalespersonData(),
            tripTypes: getFallbackTripTypeData(),
            sources: getFallbackSourceData(),
            dealSizes: getFallbackDealSizeData(),
            winLoss: getFallbackWinLossData(),
          });
        return response;
      } catch (err) {
        toast.error('Failed to load sales report. Showing sample data.');
        return {
          summary: {
            totalRevenue: 0,
            totalSales: 0,
            avgRevenue: 0,
            growth: 0,
          },
          sales: getFallbackSalesData(),
          destinations: getFallbackDestinationData(),
          salespersons: getFallbackSalespersonData(),
          tripTypes: getFallbackTripTypeData(),
          sources: getFallbackSourceData(),
          dealSizes: getFallbackDealSizeData(),
          winLoss: getFallbackWinLossData(),
        };
      }
    },
    [dateRange],
  );

  // Use fallback data if API is not available
    // @ts-expect-error
  const salesData = reportData?.sales ?? getFallbackSalesData();
    // @ts-expect-error
  const destinationData = reportData?.destinations ?? getFallbackDestinationData();
    // @ts-expect-error
  const salespersonData = reportData?.salespersons ?? getFallbackSalespersonData();
    // @ts-expect-error
  const tripTypeData = reportData?.tripTypes ?? getFallbackTripTypeData();
    // @ts-expect-error
  const sourceData = reportData?.sources ?? getFallbackSourceData();
    // @ts-expect-error
  const dealSizeData = reportData?.dealSizes ?? getFallbackDealSizeData();
    // @ts-expect-error
  const winLossData = reportData?.winLoss ?? getFallbackWinLossData();

  const totalRevenue = salesData.reduce((sum: any, d: any) => sum + d.revenue, 0);
  const avgRevenue = Math.floor(totalRevenue / salesData.length);
  const totalSales = destinationData.reduce((sum: any, d: any) => sum + d.sales, 0);

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="px-6 py-4 border-b">
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
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-1.5" />
              Filter
            </Button>
            <Button size="sm" className="bg-primary text-primary-foreground">
              <Download className="h-4 w-4 mr-1.5" />
              Export
            </Button>
          </div>
        </div>

        {/* Quick KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Revenue" value={`₹${(totalRevenue / 1000000).toFixed(1)}M`} subtext="12 months" />
          <SummaryCard label="Total Sales" value={totalSales.toString()} subtext="Bookings made" />
          <SummaryCard label="Avg Revenue" value={`₹${(avgRevenue / 100000).toFixed(1)}L`} subtext="Per month" />
          <SummaryCard label="Growth" value="+12.5%" subtext="YoY" />
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="px-6 py-3 border-b bg-muted/50 flex justify-between items-center">
        <DateRangeSelector value={dateRange} onChange={setDateRange} />
      </div>

      {/* Main Content - Tabs */}
      <div className="flex-1 p-6 overflow-auto">
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-5 lg:grid-cols-9 mb-6">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="destination">Destination</TabsTrigger>
            <TabsTrigger value="salesperson">Salesperson</TabsTrigger>
            <TabsTrigger value="triptype">Trip Type</TabsTrigger>
            <TabsTrigger value="source">Source</TabsTrigger>
            <TabsTrigger value="dealsize" className="hidden lg:block">Deal Size</TabsTrigger>
            <TabsTrigger value="forecast" className="hidden lg:block">Forecast</TabsTrigger>
            <TabsTrigger value="winloss" className="hidden lg:block">Win/Loss</TabsTrigger>
            <TabsTrigger value="more" className="lg:hidden">More</TabsTrigger>
          </TabsList>

          {/* Summary Tab */}
          <TabsContent value="summary" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sales Summary (12 Months)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={salesData}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => `₹${(value as number / 100000).toFixed(1)}L`} />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRevenue)" name="Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Destination Tab */}
          <TabsContent value="destination" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 10 Destinations by Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={destinationData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip formatter={(value) => `₹${(value as number / 1000000).toFixed(1)}M`} />
                    <Bar dataKey="revenue" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
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
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={salespersonData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="revenue" fill="#10b981" name="Revenue (₹)" />
                    <Bar dataKey="target" fill="#f59e0b" name="Target (₹)" />
                  </BarChart>
                </ResponsiveContainer>
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
                      {tripTypeData.map((entry: any, index: any) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value}%`} />
                  </PieChart>
                </ResponsiveContainer>
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
                      {sourceData.map((entry: any, index: any) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value}%`} />
                  </PieChart>
                </ResponsiveContainer>
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
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dealSizeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => `₹${(value as number / 100000).toFixed(1)}L`} />
                    <Legend />
                    <Line type="monotone" dataKey="avgSize" stroke="#8b5cf6" name="Average Size" />
                  </LineChart>
                </ResponsiveContainer>
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
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => `₹${(value as number / 100000).toFixed(1)}L`} />
                    <Legend />
                    <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="Actual" />
                    <Area type="monotone" dataKey="projected" stroke="#f59e0b" strokeDasharray="5 5" fill="none" name="Projected" />
                  </AreaChart>
                </ResponsiveContainer>
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* More Tab (Mobile) */}
          <TabsContent value="more" className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Average Deal Size</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={dealSizeData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => `₹${(value as number / 100000).toFixed(1)}L`} />
                      <Line type="monotone" dataKey="avgSize" stroke="#8b5cf6" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Forecast</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={salesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => `₹${(value as number / 100000).toFixed(1)}L`} />
                      <Area type="monotone" dataKey="revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Win/Loss</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={winLossData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="won" fill="#10b981" />
                      <Bar dataKey="lost" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
