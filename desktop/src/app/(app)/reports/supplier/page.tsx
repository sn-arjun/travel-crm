'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, TrendingUp, DollarSign, AlertCircle, Star,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
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

interface Supplier {
  id: string;
  name: string;
  category: 'Hotels' | 'Airlines' | 'Transport' | 'Activities' | 'Restaurants';
  bookingCount: number;
  totalOwed: number;
  totalPaid: number;
  rating: number;
  overdueDays: number;
}

const suppliersList = [
  { name: 'Taj Hotels', category: 'Hotels' as const },
  { name: 'Oberoi Resorts', category: 'Hotels' as const },
  { name: 'ITC Hotels', category: 'Hotels' as const },
  { name: 'Air India', category: 'Airlines' as const },
  { name: 'IndiGo', category: 'Airlines' as const },
  { name: 'SpiceJet', category: 'Airlines' as const },
  { name: 'Uber', category: 'Transport' as const },
  { name: 'Ola Cabs', category: 'Transport' as const },
  { name: 'Adventure Sports Co', category: 'Activities' as const },
  { name: 'Delhi Tours', category: 'Activities' as const },
  { name: 'Taj Kitchen', category: 'Restaurants' as const },
  { name: 'Bukhara Restaurant', category: 'Restaurants' as const },
];

const getFallbackSuppliers = (): Supplier[] => {
  return suppliersList.map((supplier, idx) => {
    const seed = REF_DATE + idx;
    const bookingCount = 50 + (seed % 200);
    const totalOwed = bookingCount * (10000 + (seed % 50000));
    const totalPaid = Math.floor(totalOwed * (0.7 + (seed % 30) / 100));
    const rating = 3.5 + ((seed % 15) / 10);
    const overdueDays = seed % 90;

    return {
      id: `supplier-${idx}`,
      name: supplier.name,
      category: supplier.category,
      bookingCount,
      totalOwed,
      totalPaid,
      rating: parseFloat(rating.toFixed(1)),
      overdueDays,
    };
  });
};

const getFallbackMonthlySpendData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const supplierNames = ['Hotels', 'Airlines', 'Transport', 'Activities', 'Restaurants'];

  return months.map((month, idx) => {
    const entry: Record<string, string | number> = { month };
    supplierNames.forEach((supplier, sidx) => {
      const seed = REF_DATE + idx + sidx;
      entry[supplier] = 150000 + (seed % 300000);
    });
    return entry;
  });
};

export default function SupplierReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');

  // Fetch supplier report data from API
  const { data: reportData, loading, error } = useApiQuery(
    async () => {
      try {
        const response = await reportsApi.getSupplierReport?.({ dateRange }) ??
          Promise.resolve({
            suppliers: getFallbackSuppliers(),
            monthlySpend: getFallbackMonthlySpendData(),
          });
        return response;
      } catch (err) {
        toast.error('Failed to load supplier report. Showing sample data.');
        return {
          suppliers: getFallbackSuppliers(),
          monthlySpend: getFallbackMonthlySpendData(),
        };
      }
    },
    [dateRange],
  );

    // @ts-expect-error
  const supplierData = reportData?.suppliers ?? getFallbackSuppliers();

  const topSuppliers = [...supplierData]
    .sort((a: any, b: any) => b.bookingCount - a.bookingCount)
    .slice(0, 8);

  const outstandingPayables = supplierData
    .filter((s: any) => s.totalOwed > s.totalPaid)
    .map((s: any) => ({
      ...s,
      outstanding: s.totalOwed - s.totalPaid,
    }))
    .sort((a: any, b: any) => b.overdueDays - a.overdueDays);

  const categoryBreakdown = [
    { name: 'Hotels', value: supplierData.filter((s: any) => s.category === 'Hotels').length },
    { name: 'Airlines', value: supplierData.filter((s: any) => s.category === 'Airlines').length },
    { name: 'Transport', value: supplierData.filter((s: any) => s.category === 'Transport').length },
    { name: 'Activities', value: supplierData.filter((s: any) => s.category === 'Activities').length },
    { name: 'Restaurants', value: supplierData.filter((s: any) => s.category === 'Restaurants').length },
  ];

  const topSuppliersByUsage = topSuppliers.map((s: any) => ({
    name: s.name,
    Bookings: s.bookingCount,
  }));

    // @ts-expect-error
  const monthlySpendData = reportData?.monthlySpend ?? getFallbackMonthlySpendData();

  const totalOwed = supplierData.reduce((sum: any, s: any) => sum + s.totalOwed, 0);
  const totalPaid = supplierData.reduce((sum: any, s: any) => sum + s.totalPaid, 0);
  const totalOutstanding = totalOwed - totalPaid;
  const avgRating = (supplierData.reduce((sum: any, s: any) => sum + s.rating, 0) / supplierData.length).toFixed(1);

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
              Supplier Reports
            </h1>
            <p className="text-sm text-muted-foreground">Supplier usage, ratings, and payment tracking</p>
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
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Suppliers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{supplierData.length}</div>
                <p className="text-xs text-muted-foreground mt-1">Active partnerships</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Owed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₹
                  {(totalOwed / 100000).toFixed(1)}
                  L
                </div>
                <p className="text-xs text-muted-foreground mt-1">Outstanding payables</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Paid</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ₹
                  {(totalPaid / 100000).toFixed(1)}
                  L
                </div>
                <p className="text-xs text-muted-foreground mt-1">Completed payments</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Rating</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2">
                  <div className="text-2xl font-bold">{avgRating}</div>
                  <Star className="h-4 w-4 text-yellow-500 mb-1 fill-yellow-500" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Overall satisfaction</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Suppliers by Usage */}
            <Card>
              <CardHeader>
                <CardTitle>Top Suppliers by Booking Count</CardTitle>
                <CardDescription>Most frequently used suppliers</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={topSuppliersByUsage}
                    margin={{ top: 5, right: 30, left: 0, bottom: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="Bookings" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Supplier Category Breakdown</CardTitle>
                <CardDescription>Distribution by category</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={categoryBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name} (${value})`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryBreakdown.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Monthly Spend */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Monthly Spend by Category</CardTitle>
                <CardDescription>Spending trend over 12 months</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={monthlySpendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => `₹${(value as number / 100000).toFixed(1)}L`} />
                    <Legend />
                    <Area type="monotone" dataKey="Hotels" stackId="1" fill={CHART_COLORS[0]} />
                    <Area type="monotone" dataKey="Airlines" stackId="1" fill={CHART_COLORS[1]} />
                    <Area type="monotone" dataKey="Transport" stackId="1" fill={CHART_COLORS[2]} />
                    <Area type="monotone" dataKey="Activities" stackId="1" fill={CHART_COLORS[3]} />
                    <Area type="monotone" dataKey="Restaurants" stackId="1" fill={CHART_COLORS[4]} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Tables */}
          <div className="space-y-6">
            {/* Payment Summary Table */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Summary</CardTitle>
                <CardDescription>Supplier payment status</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Total Owed</TableHead>
                        <TableHead className="text-right">Total Paid</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplierData.map((supplier: any) => {
                        const outstanding = supplier.totalOwed - supplier.totalPaid;
                        return (
                          <TableRow key={supplier.id}>
                            <TableCell className="font-medium">{supplier.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{supplier.category}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              ₹
                              {(supplier.totalOwed / 100000).toFixed(1)}
                              L
                            </TableCell>
                            <TableCell className="text-right">
                              ₹
                              {(supplier.totalPaid / 100000).toFixed(1)}
                              L
                            </TableCell>
                            <TableCell className={cn('text-right font-medium', outstanding > 0 && 'text-orange-600')}>
                              ₹
                              {(outstanding / 100000).toFixed(1)}
                              L
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Outstanding Payables Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  Outstanding Payables
                </CardTitle>
                <CardDescription>Sorted by overdue days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier Name</TableHead>
                        <TableHead className="text-right">Outstanding Amount</TableHead>
                        <TableHead className="text-right">Overdue Days</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outstandingPayables.map((supplier: any) => (
                        <TableRow key={supplier.id}>
                          <TableCell className="font-medium">{supplier.name}</TableCell>
                          <TableCell className="text-right">
                            ₹
                            {(supplier.outstanding / 100000).toFixed(1)}
                            L
                          </TableCell>
                          <TableCell className={cn('text-right font-medium', supplier.overdueDays > 30 && 'text-red-600')}>
                            {supplier.overdueDays}
                            {' '}
                            days
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={supplier.overdueDays > 60 ? 'destructive' : supplier.overdueDays > 30 ? 'secondary' : 'outline'}
                              className="text-xs"
                            >
                              {supplier.overdueDays > 60 ? 'Critical' : supplier.overdueDays > 30 ? 'Overdue' : 'Due Soon'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Supplier Ratings Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  Supplier Ratings
                </CardTitle>
                <CardDescription>Quality and performance ratings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Booking Count</TableHead>
                        <TableHead className="text-right">Rating</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...supplierData]
                        .sort((a: any, b: any) => b.rating - a.rating)
                        .map((supplier: any) => (
                          <TableRow key={supplier.id}>
                            <TableCell className="font-medium">{supplier.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{supplier.category}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{supplier.bookingCount}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <span className="font-semibold">{supplier.rating}</span>
                                <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
