'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Search, DollarSign, MoreHorizontal, AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { paymentsApi } from '@/lib/api/payments';
import type { Payment } from '@travelcrm/shared';


function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function MethodBadge({ method }: { method: string }) {
  const styles: Record<string, string> = {
    bank_transfer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    upi: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    cash: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    card: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    cheque: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  };
  const labels: Record<string, string> = { bank_transfer: 'Bank Transfer', upi: 'UPI', cash: 'Cash', card: 'Card', cheque: 'Cheque' };
  return <Badge variant="outline" className={cn('border-transparent text-[10px]', styles[method] ?? 'bg-slate-100 text-slate-700')}>{labels[method] ?? method}</Badge>;
}

export default function PaymentsPage() {
  const [search, setSearch] = React.useState('');
  const [methodFilter, setMethodFilter] = React.useState('all');
  const [page] = React.useState(1);

  const { data: response, loading, error, refetch } = useApiQuery(
    () => paymentsApi.list({ page, limit: 100, search: search || undefined, paymentMethod: methodFilter !== 'all' ? methodFilter : undefined }),
    [page, search, methodFilter],
  );

  const paymentsData = response?.data;
  const allPayments = Array.isArray(paymentsData) ? paymentsData : (paymentsData?.data ?? []);
  const displayPayments = allPayments;

  const filtered = React.useMemo(() => {
    let result = [...displayPayments];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) => ((p as any).invoiceNumber ?? '').toLowerCase().includes(q)
          || ((p as any).clientName ?? '').toLowerCase().includes(q)
          || ((p as any).reference ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [displayPayments, search]);

  const now = Date.now();
  const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const totalCollectedThisMonth = displayPayments.filter((p: any) => {
    const payDate = new Date(p.date ?? p.paymentDate ?? '').getTime();
    return payDate >= thisMonthStart && payDate <= now;
  }).reduce((sum: any, p: any) => sum + (p.amount ?? 0), 0);
  const totalOutstanding = displayPayments.reduce((sum: any, p: any) => sum + (p.amount ?? 0), 0);
  const overdueCount = 0; // Would require invoice data to calculate

  return (
    <div className="flex flex-col h-full">
      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 border-b border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
          <p className="text-sm text-amber-600 dark:text-amber-500">Failed to load payments</p>
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Payments</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} payments</p>
        </div>
        <Button asChild><Link href="/payments/new"><Plus className="h-4 w-4 mr-1.5" /> Record Payment</Link></Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{formatCurrency(totalCollectedThisMonth)}</p>
              <p className="text-xs text-muted-foreground">Collected This Month</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{formatCurrency(totalOutstanding)}</p>
              <p className="text-xs text-muted-foreground">Pending Amount</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{overdueCount}</p>
              <p className="text-xs text-muted-foreground">Overdue Count</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search payments..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All methods" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
            <SelectItem value="upi">UPI</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="cheque">Cheque</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading payments...</p>
          </div>
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Recorded By</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((payment: any) => (
                <TableRow key={payment.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell className="text-sm">{payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : payment.date ? new Date(payment.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</TableCell>
                  <TableCell className="font-mono text-sm font-medium"><Link href={`/invoices/${payment.invoiceId ?? ''}`} className="hover:underline">{payment.invoiceNumber ?? '—'}</Link></TableCell>
                  <TableCell className="text-sm">{payment.clientName ?? 'N/A'}</TableCell>
                  <TableCell className="text-sm font-medium text-green-600">{formatCurrency(payment.amount ?? 0)}</TableCell>
                  <TableCell><MethodBadge method={payment.paymentMethod ?? payment.method ?? ''} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono">{payment.reference ?? '—'}</TableCell>
                  <TableCell className="text-sm">{payment.recordedBy ?? 'N/A'}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/invoices/${payment.invoiceId ?? ''}`}>View invoice</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>View details</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
