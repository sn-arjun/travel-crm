'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, Zap, TrendingUp, Users, Cake, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
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
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { reportsApi } from '@/lib/api/reports';

const REF_DATE = Date.now();
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

interface Customer {
  id: string;
  name: string;
  bookings: number;
  totalSpend: number;
  lastBooking: string;
  birthday?: string;
  status: 'VIP' | 'Frequent' | 'One-time' | 'Prospect' | 'Dormant';
}

const getFallbackCustomers = (): Customer[] => {
  const names = [
    'Rajesh Kumar', 'Anjali Sharma', 'Vikram Singh', 'Priya Patel',
    'Amit Gupta', 'Sneha Desai', 'Rohan Iyer', 'Neha Kapoor',
    'Arjun Reddy', 'Divya Nair', 'Sanjay Menon', 'Kavya Verma',
    'Nitin Shah', 'Simran Kaur', 'Arun Pillai', 'Pooja Sinha',
    'Karan Malik', 'Nisha Rao', 'Deepak Chopra', 'Isha Deshmukh',
  ];

  return names.map((name, idx) => {
    const seed = REF_DATE + idx;
    const bookings = 1 + (seed % 12);
    const totalSpend = bookings * (75000 + (seed % 125000));
    const daysAgo = (seed % 365);
    const date = new Date(REF_DATE - daysAgo * 24 * 60 * 60 * 1000);
    const lastBooking = date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });

    let status: Customer['status'] = 'Prospect';
    if (bookings > 8) status = 'VIP';
    else if (bookings > 5) status = 'Frequent';
    else if (bookings > 2) status = 'One-time';
    else if (daysAgo > 90) status = 'Dormant';

    const birthdaySeed = (seed % 365);
    const monthDay = ((birthdaySeed % 12) + 1).toString().padStart(2, '0') +
      '-' +
      ((birthdaySeed % 28) + 1).toString().padStart(2, '0');

    return {
      id: `cust-${idx}`,
      name,
      bookings,
      totalSpend,
      lastBooking,
      birthday: monthDay,
      status,
    };
  });
};

const getFallbackMonthlyData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((month, idx) => {
    const seed = REF_DATE + idx;
    const newCustomers = 5 + (seed % 15);
    const returning = 8 + ((seed * 2) % 20);
    return {
      month,
      New: newCustomers,
      Returning: returning,
    };
  });
};

export default function CustomerReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');

  // Fetch customer report data from API
  const { data: reportData, loading, error } = useApiQuery(
    async () => {
      try {
        const response = await reportsApi.getCustomerReport?.({ dateRange }) ??
          Promise.resolve({
            customers: getFallbackCustomers(),
            monthly: getFallbackMonthlyData(),
          });
        return response;
      } catch (err) {
        toast.error('Failed to load customer report. Showing sample data.');
        return {
          customers: getFallbackCustomers(),
          monthly: getFallbackMonthlyData(),
        };
      }
    },
    [dateRange],
  );

    // @ts-expect-error
  const customers = reportData?.customers ?? getFallbackCustomers();

  const repeatCustomers = customers.filter((c: any) => c.bookings > 1);
  const topLtvCustomers = [...customers]
    .sort((a: any, b: any) => b.totalSpend - a.totalSpend)
    .slice(0, 15);

  const upcomingCakes = customers
    .filter((c: any) => {
      const parts = (c.birthday || '').split('-');
      const month = parts[0] ?? '1';
      const day = parts[1] ?? '1';
      const today = new Date(REF_DATE);
      const birthdayThisYear = new Date(today.getFullYear(), parseInt(month) - 1, parseInt(day));
      const thirtyDaysLater = new Date(REF_DATE + 30 * 24 * 60 * 60 * 1000);
      return birthdayThisYear >= today && birthdayThisYear <= thirtyDaysLater;
    })
    .sort((a: any, b: any) => {
      const aParts = (a.birthday || '1-1').split('-');
      const bParts = (b.birthday || '1-1').split('-');
      const aDate = new Date(2026, parseInt(aParts[0] ?? '1') - 1, parseInt(aParts[1] ?? '1'));
      const bDate = new Date(2026, parseInt(bParts[0] ?? '1') - 1, parseInt(bParts[1] ?? '1'));
      return aDate.getTime() - bDate.getTime();
    });

  const dormantCustomers = customers.filter((c: any) => c.status === 'Dormant');

  const segmentationData = [
    { name: 'VIP', value: customers.filter((c: any) => c.status === 'VIP').length },
    { name: 'Frequent', value: customers.filter((c: any) => c.status === 'Frequent').length },
    { name: 'One-time', value: customers.filter((c: any) => c.status === 'One-time').length },
    { name: 'Prospect', value: customers.filter((c: any) => c.status === 'Prospect').length },
  ];

    // @ts-expect-error
  const monthlyData = reportData?.monthly ?? getFallbackMonthlyData();

  const totalCustomers = customers.length;
  const totalRevenue = customers.reduce((sum: any, c: any) => sum + c.totalSpend, 0);
  const avgLifetimeValue = (totalRevenue / totalCustomers).toFixed(0);
  const repeatRate = ((repeatCustomers.length / totalCustomers) * 100).toFixed(1);

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Link href="/reports">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Customer Reports
            </h1>
            <p className="text-sm text-muted-foreground">Customer lifetime value and segmentation analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Customers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <div className="text-2xl font-bold">{totalCustomers}</div>
                  <Users className="h-4 w-4 text-blue-500 mb-1" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Active &amp; Dormant</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₹
                  {(totalRevenue / 1000000).toFixed(1)}
                  M
                </div>
                <p className="text-xs text-muted-foreground mt-1">Lifetime value</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg LTV</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₹
                  {(parseInt(avgLifetimeValue) / 100000).toFixed(1)}
                  L
                </div>
                <p className="text-xs text-muted-foreground mt-1">Per customer</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Repeat Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <div className="text-2xl font-bold">{repeatRate}%</div>
                  <TrendingUp className="h-4 w-4 text-green-500 mb-1" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {repeatCustomers.length}
                  {' '}
                  repeat customers
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Main Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Customer LTV Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Top 15 Customers by LTV</CardTitle>
                <CardDescription>Lifetime value ranking</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={topLtvCustomers}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="name" width={145} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => `₹${(value as number / 100000).toFixed(1)}L`} />
                    <Bar dataKey="totalSpend" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Customer Segmentation */}
            <Card>
              <CardHeader>
                <CardTitle>Customer Segmentation</CardTitle>
                <CardDescription>By customer type</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={segmentationData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name} (${value})`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {segmentationData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* New vs Returning */}
            <Card>
              <CardHeader>
                <CardTitle>New vs Returning Customers</CardTitle>
                <CardDescription>Monthly acquisition trend</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="New" fill="#3b82f6" />
                    <Bar dataKey="Returning" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Upcoming Cakes Preview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cake className="h-5 w-5" />
                  Customer Satisfaction
                </CardTitle>
                <CardDescription>Overall satisfaction metrics</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center min-h-[300px]">
                <div className="text-center">
                  <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-muted-foreground">
                    Not enough data to display satisfaction metrics yet.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Collect customer feedback to populate this section.</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tables Section */}
          <div className="space-y-6">
            {/* Repeat Customers Table */}
            <Card>
              <CardHeader>
                <CardTitle>Repeat Customers</CardTitle>
                <CardDescription>
                  {repeatCustomers.length}
                  {' '}
                  customers with multiple bookings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer Name</TableHead>
                        <TableHead className="text-right">Total Bookings</TableHead>
                        <TableHead className="text-right">Total Spend</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {repeatCustomers
                        .sort((a: any, b: any) => b.bookings - a.bookings)
                        .map((customer: any) => (
                          <TableRow key={customer.id}>
                            <TableCell className="font-medium">{customer.name}</TableCell>
                            <TableCell className="text-right">{customer.bookings}</TableCell>
                            <TableCell className="text-right">
                              ₹
                              {(customer.totalSpend / 100000).toFixed(1)}
                              L
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{customer.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Upcoming Cakes Table */}
            {upcomingCakes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cake className="h-5 w-5" />
                    Upcoming Cakes
                  </CardTitle>
                  <CardDescription>Next 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer Name</TableHead>
                          <TableHead>Cake</TableHead>
                          <TableHead className="text-right">Total Spend</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {upcomingCakes.map((customer: any) => (
                          <TableRow key={customer.id}>
                            <TableCell className="font-medium">{customer.name}</TableCell>
                            <TableCell>{customer.birthday}</TableCell>
                            <TableCell className="text-right">
                              ₹
                              {(customer.totalSpend / 100000).toFixed(1)}
                              L
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{customer.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Dormant Customers Table */}
            {dormantCustomers.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Dormant Customers
                  </CardTitle>
                  <CardDescription>No activity in 90+ days</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer Name</TableHead>
                          <TableHead className="text-right">Bookings</TableHead>
                          <TableHead>Last Activity</TableHead>
                          <TableHead className="text-right">Total Spend</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dormantCustomers.map((customer: any) => (
                          <TableRow key={customer.id}>
                            <TableCell className="font-medium">{customer.name}</TableCell>
                            <TableCell className="text-right">{customer.bookings}</TableCell>
                            <TableCell>{customer.lastBooking}</TableCell>
                            <TableCell className="text-right">
                              ₹
                              {(customer.totalSpend / 100000).toFixed(1)}
                              L
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
