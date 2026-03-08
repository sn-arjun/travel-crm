'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Download, TrendingUp, AlertCircle, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
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
import { cn } from '@/lib/utils';
import { reportsApi } from '@/lib/api/reports';

const fmt = (n: number) =>
  n >= 10000000
    ? `₹${(n / 10000000).toFixed(1)}Cr`
    : n >= 100000
      ? `₹${(n / 100000).toFixed(1)}L`
      : `₹${n.toLocaleString('en-IN')}`;

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

export default function SupplierReportsPage() {
  const [dateRange, setDateRange] = React.useState('30days');
  const [showComparison, setShowComparison] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('usage');

  const [usageData, setUsageData] = React.useState<any[]>([]);
  const [paymentData, setPaymentData] = React.useState<any[]>([]);
  const [outstandingData, setOutstandingData] = React.useState<any[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryKey, setRetryKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = { date_preset: presetMap[dateRange] ?? 'this_month', compare: showComparison };

    const reportId =
      activeTab === 'usage' ? 'supplier_usage'
        : activeTab === 'payment' ? 'supplier_payment_summary'
          : 'supplier_outstanding';

    reportsApi.execute(reportId, params)
      .then((res: any) => {
        if (cancelled) return;
        const rows = (res?.data?.data ?? []) as any[];
        if (activeTab === 'usage') setUsageData(rows);
        else if (activeTab === 'payment') setPaymentData(rows);
        else setOutstandingData(rows);
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
      await reportsApi.export('supplier_usage', 'excel', { date_preset: presetMap[dateRange] ?? 'this_month' });
      toast.success('Export started');
    } catch {
      toast.error('Export failed');
    }
  };

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

  const renderSkeletons = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}><CardContent className="pt-4 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-16" /></CardContent></Card>
        ))}
      </div>
      <ChartSkeleton />
    </>
  );

  const totalUsageSpend = usageData.reduce((s, r) => s + (r.total_spend ?? 0), 0);
  const totalTrips = usageData.reduce((s, r) => s + (r.trips_booked ?? 0), 0);

  const totalPaid = paymentData.reduce((s, r) => s + (r.total_paid ?? 0), 0);
  const totalPaymentCount = paymentData.reduce((s, r) => s + (r.payment_count ?? 0), 0);

  const totalOutstanding = outstandingData.reduce((s, r) => s + (r.outstanding_balance ?? 0), 0);
  const totalVoucherValue = outstandingData.reduce((s, r) => s + (r.total_voucher_value ?? 0), 0);

  const usageChartData = [...usageData]
    .sort((a, b) => (b.trips_booked ?? 0) - (a.trips_booked ?? 0))
    .slice(0, 10)
    .map((r) => ({
      name: (r.supplier_name ?? '').split(' ').slice(0, 2).join(' '),
      Trips: r.trips_booked ?? 0,
      Spend: r.total_spend ?? 0,
    }));

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <Link href="/reports" className="hover:text-foreground transition-colors">Reports</Link>
            <span>/</span>
            <span className="text-foreground font-medium">Supplier Reports</span>
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
          Supplier Reports
        </h1>
        <p className="text-sm text-muted-foreground">Supplier usage, payments, and outstanding balances</p>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="payment">Payment Summary</TabsTrigger>
            <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
          </TabsList>

          {/* Usage Tab */}
          <TabsContent value="usage" className="space-y-6">
            {loading ? renderSkeletons() : error ? renderError() : usageData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Suppliers</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{usageData.length}</div>
                      <p className="text-xs text-muted-foreground mt-1">Active partnerships</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Trips Booked</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2">
                        <div className="text-2xl font-bold">{totalTrips}</div>
                        <TrendingUp className="h-4 w-4 text-green-500 mb-1" />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Across all suppliers</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{fmt(totalUsageSpend)}</div>
                      <p className="text-xs text-muted-foreground mt-1">Period spend</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Top Suppliers by Usage</CardTitle>
                    <CardDescription>Most frequently booked suppliers</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={usageChartData} margin={{ top: 5, right: 30, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => fmt(v)} />
                        <Tooltip formatter={(v, name) => name === 'Spend' ? fmt(v as number) : v} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="Trips" fill="#3b82f6" />
                        <Bar yAxisId="right" dataKey="Spend" fill="#10b981" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Supplier Usage Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Supplier Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Trips Booked</TableHead>
                          <TableHead className="text-right">Total Spend</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...usageData].sort((a, b) => (b.trips_booked ?? 0) - (a.trips_booked ?? 0)).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.supplier_name ?? '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{row.category ?? '—'}</Badge></TableCell>
                            <TableCell className="text-right">{row.trips_booked ?? 0}</TableCell>
                            <TableCell className="text-right">{fmt(row.total_spend ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Payment Summary Tab */}
          <TabsContent value="payment" className="space-y-6">
            {loading ? renderSkeletons() : error ? renderError() : paymentData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Payments</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{totalPaymentCount}</div>
                      <p className="text-xs text-muted-foreground mt-1">Payment transactions</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Paid</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{fmt(totalPaid)}</div>
                      <p className="text-xs text-muted-foreground mt-1">Completed payments</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Bank Transfers</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{fmt(paymentData.reduce((s, r) => s + (r.bank_transfers ?? 0), 0))}</div>
                      <p className="text-xs text-muted-foreground mt-1">
                        vs {fmt(paymentData.reduce((s, r) => s + (r.cash_payments ?? 0), 0))} cash
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Payment by Supplier</CardTitle>
                    <CardDescription>Bank transfer vs cash breakdown</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={paymentData.map((r) => ({
                          name: (r.supplier_name ?? '').split(' ').slice(0, 2).join(' '),
                          'Bank Transfers': r.bank_transfers ?? 0,
                          'Cash': r.cash_payments ?? 0,
                        }))}
                        margin={{ top: 5, right: 30, left: 0, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                        <YAxis tickFormatter={(v) => fmt(v)} />
                        <Tooltip formatter={(v) => fmt(v as number)} />
                        <Legend />
                        <Bar dataKey="Bank Transfers" fill="#3b82f6" stackId="a" />
                        <Bar dataKey="Cash" fill="#10b981" stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Payment Summary Details</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Supplier Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Payments</TableHead>
                          <TableHead className="text-right">Total Paid</TableHead>
                          <TableHead className="text-right">Bank Transfers</TableHead>
                          <TableHead className="text-right">Cash</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...paymentData].sort((a, b) => (b.total_paid ?? 0) - (a.total_paid ?? 0)).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.supplier_name ?? '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{row.category ?? '—'}</Badge></TableCell>
                            <TableCell className="text-right">{row.payment_count ?? 0}</TableCell>
                            <TableCell className="text-right font-semibold">{fmt(row.total_paid ?? 0)}</TableCell>
                            <TableCell className="text-right">{fmt(row.bank_transfers ?? 0)}</TableCell>
                            <TableCell className="text-right">{fmt(row.cash_payments ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Outstanding Tab */}
          <TabsContent value="outstanding" className="space-y-6">
            {loading ? renderSkeletons() : error ? renderError() : outstandingData.length === 0 ? renderEmpty() : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Voucher Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{fmt(totalVoucherValue)}</div>
                      <p className="text-xs text-muted-foreground mt-1">Issued vouchers</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Total Paid</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">
                        {fmt(outstandingData.reduce((s, r) => s + (r.total_paid ?? 0), 0))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Settled amount</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        Outstanding Balance
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">{fmt(totalOutstanding)}</div>
                      <p className="text-xs text-muted-foreground mt-1">Pending payment</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Outstanding by Supplier</CardTitle>
                    <CardDescription>Paid vs outstanding balance per supplier</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={[...outstandingData]
                          .sort((a, b) => (b.outstanding_balance ?? 0) - (a.outstanding_balance ?? 0))
                          .slice(0, 10)
                          .map((r) => ({
                            name: (r.supplier_name ?? '').split(' ').slice(0, 2).join(' '),
                            Paid: r.total_paid ?? 0,
                            Outstanding: r.outstanding_balance ?? 0,
                          }))}
                        margin={{ top: 5, right: 30, left: 0, bottom: 40 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                        <YAxis tickFormatter={(v) => fmt(v)} />
                        <Tooltip formatter={(v) => fmt(v as number)} />
                        <Legend />
                        <Bar dataKey="Paid" fill="#10b981" stackId="a" />
                        <Bar dataKey="Outstanding" fill="#ef4444" stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      Outstanding Payables
                    </CardTitle>
                    <CardDescription>Sorted by outstanding balance</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Supplier Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Vouchers</TableHead>
                          <TableHead className="text-right">Voucher Value</TableHead>
                          <TableHead className="text-right">Total Paid</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...outstandingData]
                          .sort((a, b) => (b.outstanding_balance ?? 0) - (a.outstanding_balance ?? 0))
                          .map((row, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{row.supplier_name ?? '—'}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{row.category ?? '—'}</Badge></TableCell>
                              <TableCell className="text-right">{row.total_vouchers ?? 0}</TableCell>
                              <TableCell className="text-right">{fmt(row.total_voucher_value ?? 0)}</TableCell>
                              <TableCell className="text-right text-green-600">{fmt(row.total_paid ?? 0)}</TableCell>
                              <TableCell className={cn('text-right font-semibold', (row.outstanding_balance ?? 0) > 0 ? 'text-red-600' : 'text-green-600')}>
                                {fmt(row.outstanding_balance ?? 0)}
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
