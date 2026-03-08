'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Download, Filter, TrendingUp, TrendingDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useApiQuery } from '@/hooks/use-api';
import { reportsApi } from '@/lib/api/reports';
import { client } from '@/lib/api/client';
import { API_ENDPOINTS } from '@/lib/api/config';

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const getFallbackRevenueOverviewData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((month, i) => ({
    month,
    current: 1200000 + (i * 100000) + (i % 2) * 150000,
    previous: 980000 + (i * 80000) + (i % 2) * 100000,
  }));
};

const getFallbackCollectionData = () => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map((month, i) => ({
    month,
    collected: 1100000 + (i * 95000) + (i % 2) * 120000,
    outstanding: 150000 + (i * 15000) + (i % 3) * 40000,
  }));
};

const getFallbackOutstandingReceivablesData = () => [
  { client: 'ABC Travels Ltd', amount: 450000, daysOverdue: 32, invoices: 3 },
  { client: 'XYZ Holidays', amount: 380000, daysOverdue: 28, invoices: 2 },
  { client: 'Global Tours', amount: 320000, daysOverdue: 45, invoices: 4 },
  { client: 'Dream Vacations', amount: 290000, daysOverdue: 18, invoices: 2 },
  { client: 'Premier Journeys', amount: 250000, daysOverdue: 25, invoices: 1 },
  { client: 'Wanderlust Travel', amount: 210000, daysOverdue: 12, invoices: 2 },
  { client: 'Compass Tours', amount: 180000, daysOverdue: 38, invoices: 3 },
  { client: 'Voyager Holidays', amount: 150000, daysOverdue: 5, invoices: 1 },
];

const getFallbackOutstandingPayablesData = () => [
  { supplier: 'Hotel Partners Inc', amount: 580000, daysUntilDue: 5, invoices: 4 },
  { supplier: 'Flight Aggregator', amount: 520000, daysUntilDue: 12, invoices: 3 },
  { supplier: 'Ground Services Ltd', amount: 380000, daysUntilDue: 8, invoices: 5 },
  { supplier: 'Visa Processing Co', amount: 280000, daysUntilDue: 15, invoices: 2 },
  { supplier: 'Travel Insurance Corp', amount: 240000, daysUntilDue: 20, invoices: 3 },
  { supplier: 'Commission Agents', amount: 190000, daysUntilDue: 3, invoices: 6 },
];

const getFallbackPnLByLeadData = () => [
  { lead: 'Maldives Honeymoon', revenue: 450000, cost: 320000, margin: 28.9 },
  { lead: 'Bali Family Tour', revenue: 380000, cost: 250000, margin: 34.2 },
  { lead: 'Dubai Shopping Trip', revenue: 420000, cost: 280000, margin: 33.3 },
  { lead: 'Thailand Adventure', revenue: 360000, cost: 220000, margin: 38.9 },
  { lead: 'Europe Group Tour', revenue: 520000, cost: 380000, margin: 26.9 },
  { lead: 'Goa Beach Getaway', revenue: 280000, cost: 150000, margin: 46.4 },
  { lead: 'Kashmir Trek', revenue: 320000, cost: 200000, margin: 37.5 },
  { lead: 'Singapore Business', revenue: 290000, cost: 180000, margin: 37.9 },
];

const getFallbackGSTTaxData = () => [
  { period: 'Jan-Mar 2026', taxCollected: 580000, taxPaid: 420000, netTax: 160000 },
  { period: 'Oct-Dec 2025', taxCollected: 620000, taxPaid: 450000, netTax: 170000 },
  { period: 'Jul-Sep 2025', taxCollected: 580000, taxPaid: 410000, netTax: 170000 },
  { period: 'Apr-Jun 2025', taxCollected: 510000, taxPaid: 380000, netTax: 130000 },
];

const getFallbackPaymentMethodsData = () => [
  { name: 'Bank Transfer', value: 42, amount: 4200000 },
  { name: 'Credit Card', value: 28, amount: 2800000 },
  { name: 'UPI', value: 18, amount: 1800000 },
  { name: 'Cheque', value: 8, amount: 800000 },
  { name: 'Cash', value: 4, amount: 400000 },
];

const getFallbackDailyCashReportData = () => {
  const dates = Array.from({ length: 30 }, (_, i) => ({
    date: `${String((i % 28) + 1).padStart(2, '0')}/03`,
    collections: 45000 + (i * 2000) + (i % 5) * 8000,
    payments: 35000 + (i * 1500) + (i % 4) * 6000,
  }));
  return dates;
};

const getFallbackRefundTrackerData = () => [
  { leadId: 'LEAD-001', customer: 'Rahul Sharma', amount: 50000, reason: 'Trip Cancelled', status: 'Completed', date: '2026-02-28' },
  { leadId: 'LEAD-045', customer: 'Priya Patel', amount: 35000, reason: 'Date Change', status: 'Pending', date: '2026-03-02' },
  { leadId: 'LEAD-023', customer: 'Amit Kumar', amount: 80000, reason: 'Partner Refund', status: 'In Progress', date: '2026-02-25' },
  { leadId: 'LEAD-089', customer: 'Sneha Reddy', amount: 25000, reason: 'Partial Refund', status: 'Completed', date: '2026-02-15' },
  { leadId: 'LEAD-056', customer: 'Vikram Singh', amount: 120000, reason: 'Dissatisfaction', status: 'Pending', date: '2026-03-01' },
  { leadId: 'LEAD-071', customer: 'Ananya Gupta', amount: 45000, reason: 'Price Match', status: 'In Progress', date: '2026-02-20' },
];

function SummaryCard({ label, value, subtext, trend }: { label: string; value: string; subtext?: string; trend?: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground mb-1">{label}</p>
        <div className="flex items-end gap-2">
          <p className="text-2xl font-bold">{value}</p>
          {trend !== undefined && (
            <div className="flex items-center gap-1 mb-1">
              {trend >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span className={trend >= 0 ? 'text-xs text-green-600' : 'text-xs text-red-600'}>
                {Math.abs(trend)}%
              </span>
            </div>
          )}
        </div>
        {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
      </CardContent>
    </Card>
  );
}

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

export default function FinancialReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');

  // Fetch financial report data from API
  const { data: reportData, loading, error } = useApiQuery(
    async () => {
      try {
        const response = await reportsApi.getFinancialReport?.({ dateRange }) ??
          Promise.resolve({
            revenue: getFallbackRevenueOverviewData(),
            collections: getFallbackCollectionData(),
            receivables: getFallbackOutstandingReceivablesData(),
            payables: getFallbackOutstandingPayablesData(),
            pnl: getFallbackPnLByLeadData(),
            tax: getFallbackGSTTaxData(),
            payments: getFallbackPaymentMethodsData(),
            cash: getFallbackDailyCashReportData(),
            refunds: getFallbackRefundTrackerData(),
          });
        return response;
      } catch (err) {
        toast.error('Failed to load financial report. Showing sample data.');
        return {
          revenue: getFallbackRevenueOverviewData(),
          collections: getFallbackCollectionData(),
          receivables: getFallbackOutstandingReceivablesData(),
          payables: getFallbackOutstandingPayablesData(),
          pnl: getFallbackPnLByLeadData(),
          tax: getFallbackGSTTaxData(),
          payments: getFallbackPaymentMethodsData(),
          cash: getFallbackDailyCashReportData(),
          refunds: getFallbackRefundTrackerData(),
        };
      }
    },
    [dateRange],
  );

  // Fetch outstanding report from API
  const { data: outstandingRes } = useApiQuery(
    () => client.get<any>(API_ENDPOINTS.reports.outstanding, { params: { dateRange } }),
    [dateRange],
  );

  // Fetch ageing report from API
  const { data: ageingRes } = useApiQuery(
    () => client.get<any>(API_ENDPOINTS.reports.ageing, { params: { dateRange } }),
    [dateRange],
  );

  // Use API data when available, fallback to report bundle or hardcoded data
  const reportBundle = reportData as any;
  const revenueData = reportBundle?.data?.revenue ?? reportBundle?.revenue ?? getFallbackRevenueOverviewData();
  const collectionData = reportBundle?.data?.collections ?? reportBundle?.collections ?? getFallbackCollectionData();
  const receivablesData = (outstandingRes as any)?.data?.receivables
    ?? (outstandingRes as any)?.data
    ?? reportBundle?.data?.receivables
    ?? reportBundle?.receivables
    ?? getFallbackOutstandingReceivablesData();
  const payablesData = (outstandingRes as any)?.data?.payables
    ?? reportBundle?.data?.payables
    ?? reportBundle?.payables
    ?? getFallbackOutstandingPayablesData();
  const pnlData = reportBundle?.data?.pnl ?? reportBundle?.pnl ?? getFallbackPnLByLeadData();
  const gstData = reportBundle?.data?.tax ?? reportBundle?.tax ?? getFallbackGSTTaxData();
  const paymentData = reportBundle?.data?.payments ?? reportBundle?.payments ?? getFallbackPaymentMethodsData();
  const cashData = reportBundle?.data?.cash ?? reportBundle?.cash ?? getFallbackDailyCashReportData();
  const refundData = reportBundle?.data?.refunds ?? reportBundle?.refunds ?? getFallbackRefundTrackerData();

  const totalCollected = collectionData.reduce((sum: any, d: any) => sum + d.collected, 0);
  const totalOutstanding = receivablesData.reduce((sum: any, d: any) => sum + d.amount, 0);
  const totalPayables = payablesData.reduce((sum: any, d: any) => sum + d.amount, 0);
  const collectionRate = ((totalCollected / (totalCollected + totalOutstanding)) * 100).toFixed(1);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link href="/reports">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Financial Reports</h1>
              <p className="text-sm text-muted-foreground">Revenue, collections, and P&L analysis</p>
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Total Collections" value={`₹${(totalCollected / 10000000).toFixed(1)}Cr`} trend={8.5} />
          <SummaryCard label="Collection Rate" value={`${collectionRate}%`} trend={3.2} />
          <SummaryCard label="Outstanding" value={`₹${(totalOutstanding / 1000000).toFixed(1)}M`} trend={-2.1} />
          <SummaryCard label="Payables Due" value={`₹${(totalPayables / 1000000).toFixed(1)}M`} trend={1.5} />
        </div>
      </div>

      <div className="px-6 py-3 border-b bg-muted/50 flex justify-between items-center">
        <DateRangeSelector value={dateRange} onChange={setDateRange} />
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <Tabs defaultValue="revenue" className="w-full">
          <TabsList className="grid w-full grid-cols-5 lg:grid-cols-9 mb-6">
            <TabsTrigger value="revenue">Revenue</TabsTrigger>
            <TabsTrigger value="collection">Collection</TabsTrigger>
            <TabsTrigger value="receivables">Receivables</TabsTrigger>
            <TabsTrigger value="payables">Payables</TabsTrigger>
            <TabsTrigger value="pnl" className="hidden lg:block">P&L</TabsTrigger>
            <TabsTrigger value="tax" className="hidden lg:block">Tax</TabsTrigger>
            <TabsTrigger value="payment" className="hidden lg:block">Payment</TabsTrigger>
            <TabsTrigger value="cash" className="hidden lg:block">Cash</TabsTrigger>
            <TabsTrigger value="refund" className="hidden lg:block">Refunds</TabsTrigger>
            <TabsTrigger value="more" className="lg:hidden">More</TabsTrigger>
          </TabsList>

          <TabsContent value="revenue" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue Overview - Monthly Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorPrevious" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => `₹${(value as number / 1000000).toFixed(1)}M`} />
                    <Legend />
                    <Area type="monotone" dataKey="current" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCurrent)" name="Current Period" />
                    <Area type="monotone" dataKey="previous" stroke="#10b981" fillOpacity={1} fill="url(#colorPrevious)" name="Previous Period" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="collection" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Collection Report - Collected vs Outstanding</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={collectionData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => `₹${(value as number / 1000000).toFixed(1)}M`} />
                    <Legend />
                    <Bar dataKey="collected" fill="#10b981" name="Collected" />
                    <Bar dataKey="outstanding" fill="#f59e0b" name="Outstanding" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="receivables" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Outstanding Receivables - Sorted by Days Overdue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Client</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Days Overdue</TableHead>
                        <TableHead>Invoices</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receivablesData.map((item: any) => (
                        <TableRow key={item.client}>
                          <TableCell className="font-medium">{item.client}</TableCell>
                          <TableCell>₹{(item.amount / 100000).toFixed(1)}L</TableCell>
                          <TableCell>
                            <Badge variant={item.daysOverdue > 30 ? 'destructive' : 'secondary'}>
                              {item.daysOverdue}d
                            </Badge>
                          </TableCell>
                          <TableCell>{item.invoices}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payables" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Outstanding Payables - Due Soon</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Days Until Due</TableHead>
                        <TableHead>Invoices</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payablesData.map((item: any) => (
                        <TableRow key={item.supplier}>
                          <TableCell className="font-medium">{item.supplier}</TableCell>
                          <TableCell>₹{(item.amount / 100000).toFixed(1)}L</TableCell>
                          <TableCell>
                            <Badge variant={item.daysUntilDue <= 7 ? 'destructive' : 'secondary'}>
                              {item.daysUntilDue}d
                            </Badge>
                          </TableCell>
                          <TableCell>{item.invoices}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pnl" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Profit & Loss by Lead - Margin Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Revenue</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Margin %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pnlData.map((item: any) => (
                        <TableRow key={item.lead}>
                          <TableCell className="font-medium">{item.lead}</TableCell>
                          <TableCell>₹{(item.revenue / 100000).toFixed(1)}L</TableCell>
                          <TableCell>₹{(item.cost / 100000).toFixed(1)}L</TableCell>
                          <TableCell>
                            <Badge variant={item.margin > 35 ? 'default' : item.margin > 25 ? 'secondary' : 'outline'}>
                              {item.margin.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tax" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">GST/Tax Report - Quarterly</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead>Tax Collected</TableHead>
                        <TableHead>Tax Paid</TableHead>
                        <TableHead>Net Tax</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gstData.map((item: any) => (
                        <TableRow key={item.period}>
                          <TableCell className="font-medium">{item.period}</TableCell>
                          <TableCell>₹{(item.taxCollected / 100000).toFixed(1)}L</TableCell>
                          <TableCell>₹{(item.taxPaid / 100000).toFixed(1)}L</TableCell>
                          <TableCell>
                            <Badge variant="default">₹{(item.netTax / 100000).toFixed(1)}L</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payment" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment Methods Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={paymentData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name} (${value}%)`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {paymentData.map((entry: any, index: any) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${value}%`} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cash" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily Cash Report - Last 30 Days</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={cashData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} />
                    <YAxis />
                    <Tooltip formatter={(value) => `₹${(value as number / 100000).toFixed(1)}L`} />
                    <Legend />
                    <Bar dataKey="collections" fill="#10b981" name="Collections" />
                    <Bar dataKey="payments" fill="#ef4444" name="Payments" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="refund" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Refund Tracker - Recent Requests</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead ID</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {refundData.map((item: any) => (
                        <TableRow key={item.leadId}>
                          <TableCell className="font-medium">{item.leadId}</TableCell>
                          <TableCell>{item.customer}</TableCell>
                          <TableCell>₹{(item.amount / 100000).toFixed(1)}L</TableCell>
                          <TableCell className="text-sm">{item.reason}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                item.status === 'Completed'
                                  ? 'default'
                                  : item.status === 'In Progress'
                                    ? 'secondary'
                                    : 'outline'
                              }
                            >
                              {item.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{item.date}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="more" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">P&L Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Margin %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pnlData.slice(0, 5).map((item: any) => (
                        <TableRow key={item.lead}>
                          <TableCell className="font-medium text-xs">{item.lead}</TableCell>
                          <TableCell>
                            <Badge>{item.margin.toFixed(1)}%</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Payment Methods</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={paymentData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name }) => name}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {paymentData.map((entry: any, index: any) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tax Report</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {gstData.map((item: any) => (
                    <div key={item.period} className="flex items-center justify-between p-2 bg-muted rounded">
                      <span className="text-sm font-medium">{item.period}</span>
                      <span className="text-sm">₹{(item.netTax / 100000).toFixed(1)}L</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
