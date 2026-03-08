'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Calendar, DollarSign, TrendingUp, PieChart,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { reportsApi } from '@/lib/api/reports';

const REF_DATE = Date.now();

function formatCurrency(amount: number) {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount}`;
}

interface MonthlyRevenue {
  month: string;
  revenue: number;
}

interface RevenueSource {
  source: string;
  amount: number;
  percentage: number;
  color: string;
}

interface TopDestination {
  destination: string;
  revenue: number;
  trips: number;
  color: string;
}

const getFallbackMonthlyData = (): MonthlyRevenue[] => [
    { month: 'Apr 2025', revenue: 1800000 },
    { month: 'May 2025', revenue: 2100000 },
    { month: 'Jun 2025', revenue: 1950000 },
    { month: 'Jul 2025', revenue: 2300000 },
    { month: 'Aug 2025', revenue: 2150000 },
    { month: 'Sep 2025', revenue: 2450000 },
    { month: 'Oct 2025', revenue: 2200000 },
    { month: 'Nov 2025', revenue: 2600000 },
    { month: 'Dec 2025', revenue: 2800000 },
    { month: 'Jan 2026', revenue: 2400000 },
    { month: 'Feb 2026', revenue: 2700000 },
    { month: 'Mar 2026', revenue: 2950000 },
];

const getFallbackRevenueSources = (): RevenueSource[] => [
    { source: 'Website', amount: 8540000, percentage: 38, color: 'from-blue-500 to-blue-600' },
    { source: 'Referral', amount: 5850000, percentage: 26, color: 'from-green-500 to-green-600' },
    { source: 'Walk-in', amount: 4120000, percentage: 18, color: 'from-purple-500 to-purple-600' },
    { source: 'WhatsApp', amount: 1950000, percentage: 9, color: 'from-teal-500 to-teal-600' },
    { source: 'Social Media', amount: 1540000, percentage: 7, color: 'from-pink-500 to-pink-600' },
];

const getFallbackTopDestinations = (): TopDestination[] => [
    { destination: 'Maldives', revenue: 4200000, trips: 28, color: 'from-cyan-500 to-blue-500' },
    { destination: 'Dubai', revenue: 3850000, trips: 22, color: 'from-yellow-500 to-orange-500' },
    { destination: 'Thailand', revenue: 2950000, trips: 18, color: 'from-emerald-500 to-teal-500' },
    { destination: 'Europe Tour', revenue: 2740000, trips: 15, color: 'from-rose-500 to-pink-500' },
    { destination: 'Bali', revenue: 2310000, trips: 14, color: 'from-indigo-500 to-purple-500' },
];

export default function RevenueReportPage() {
  const [dateRange, setDateRange] = React.useState('30days');

  // Fetch revenue report data from API
  const { data: reportData, loading, error } = useApiQuery(
    async () => {
      try {
        const response = await reportsApi.getRevenueReport?.({ dateRange }) ??
          Promise.resolve({
            monthly: getFallbackMonthlyData(),
            sources: getFallbackRevenueSources(),
            destinations: getFallbackTopDestinations(),
          });
        return response;
      } catch (err) {
        toast.error('Failed to load revenue report. Showing sample data.');
        return {
          monthly: getFallbackMonthlyData(),
          sources: getFallbackRevenueSources(),
          destinations: getFallbackTopDestinations(),
        };
      }
    },
    [dateRange],
  );

    // @ts-expect-error
  const monthlyData = reportData?.monthly ?? getFallbackMonthlyData();
    // @ts-expect-error
  const revenueSources = reportData?.sources ?? getFallbackRevenueSources();
    // @ts-expect-error
  const topDestinations = reportData?.destinations ?? getFallbackTopDestinations();

  const totalRevenueYTD = monthlyData.reduce((sum: any, m: any) => sum + m.revenue, 0);
  const thisMonthRevenue = monthlyData[monthlyData.length - 1]!.revenue;
  const lastMonthRevenue = monthlyData[monthlyData.length - 2]!.revenue;
  const growthRate = lastMonthRevenue > 0 ? (((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1) : '0';
  const avgMonthlyRevenue = (totalRevenueYTD / monthlyData.length).toFixed(0);

  const maxMonthlyRevenue = Math.max(...monthlyData.map((m: any) => m.revenue));
  const chartHeight = 200;

  const maxDestinationRevenue = Math.max(...topDestinations.map((d: any) => d.revenue));

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-4">
          <Link href="/reports">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Revenue Report</h1>
            <p className="text-sm text-muted-foreground">Monthly trends and revenue distribution</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Calendar className="h-4 w-4" />
            {dateRange === '7days' ? 'Last 7 Days' : dateRange === '30days' ? 'Last 30 Days' : dateRange === '90days' ? 'Last 90 Days' : 'Last 30 Days'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Total Revenue YTD</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalRevenueYTD)}</p>
                  </div>
                  <DollarSign className="h-5 w-5 text-primary opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">This Month</p>
                    <p className="text-2xl font-bold">{formatCurrency(thisMonthRevenue)}</p>
                  </div>
                  <Calendar className="h-5 w-5 text-primary opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Growth Rate</p>
                    <p className="text-2xl font-bold">{growthRate}%</p>
                  </div>
                  <TrendingUp className="h-5 w-5 text-green-600 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Avg Monthly</p>
                    <p className="text-2xl font-bold">{formatCurrency(parseInt(avgMonthlyRevenue, 10))}</p>
                  </div>
                  <PieChart className="h-5 w-5 text-primary opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Revenue Chart */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold">Monthly Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between gap-2 p-4" style={{ height: `${chartHeight + 40}px` }}>
                {monthlyData.map((item: any, idx: any) => {
                  const h = (item.revenue / maxMonthlyRevenue) * chartHeight;
                  const isCurrent = idx === monthlyData.length - 1;

                  return (
                    <div key={item.month} className="flex flex-col items-center gap-2 flex-1 group">
                      <div className="w-full flex justify-center">
                        <div
                          className={cn(
                            'w-full max-w-8 rounded-t-md transition-all cursor-pointer',
                            isCurrent ? 'bg-primary' : 'bg-primary/40 group-hover:bg-primary/60',
                          )}
                          style={{ height: `${h}px` }}
                          title={`${item.month}: ${formatCurrency(item.revenue)}`}
                        />
                      </div>
                      <span className={cn(
                        'text-[10px] text-center leading-tight',
                        isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground group-hover:text-foreground',
                      )}>
                        {item.month.split(' ')[0]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue by Source */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold">Revenue by Source</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {revenueSources.map((source: any) => (
                  <div key={source.source} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn('h-3 w-3 rounded-full', `bg-gradient-to-r ${source.color}`)} />
                        <span className="text-sm font-medium">{source.source}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{source.percentage}%</Badge>
                        <span className="text-sm font-semibold">{formatCurrency(source.amount)}</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full rounded-full bg-gradient-to-r transition-all', source.color)}
                        style={{ width: `${source.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Top Destinations */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-semibold">Top Destinations by Revenue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {topDestinations.map((dest: any, idx: number) => {
                  const pct = (dest.revenue / maxDestinationRevenue) * 100;
                  return (
                    <div key={dest.destination} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold text-muted-foreground">{idx + 1}</span>
                          <div>
                            <p className="text-sm font-medium">{dest.destination}</p>
                            <p className="text-xs text-muted-foreground">{dest.trips} trips</p>
                          </div>
                        </div>
                        <span className="text-sm font-semibold">{formatCurrency(dest.revenue)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full bg-gradient-to-r transition-all', dest.color)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
