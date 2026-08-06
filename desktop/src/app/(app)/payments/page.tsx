'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, DollarSign, MoreHorizontal, AlertCircle, CheckCircle2, Clock, Loader2, Trash2, FileText, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useApiMutation, useApiQuery } from '@/hooks/use-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { FilterBar } from '@/components/domain/filter-bar';
import { paymentsApi } from '@/lib/api/payments';
import { invoicesApi } from '@/lib/api/invoices';
import { PaymentReceipt } from '@/components/domain/payment-receipt';


function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function MethodBadge({ method }: { method: string }) {
  const styles: Record<string, string> = {
    bank_transfer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    transfer: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    upi: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    cash: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    card: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    cheque: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    check: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  };
  const labels: Record<string, string> = {
    bank_transfer: 'Bank Transfer', transfer: 'Bank Transfer', upi: 'UPI',
    cash: 'Cash', card: 'Card', cheque: 'Cheque', check: 'Cheque',
  };
  return <Badge variant="outline" className={cn('border-transparent text-[10px]', styles[method] ?? 'bg-slate-100 text-slate-700')}>{labels[method] ?? method}</Badge>;
}

export default function PaymentsPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [methodFilter, setMethodFilter] = React.useState('all');

  const [receiptPayment, setReceiptPayment] = React.useState<any>(null);

  const { mutate: deletePayment } = useApiMutation(
    (id: string) => paymentsApi.delete(id),
  );

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      paymentsApi.list({ page, limit, search: search || undefined, paymentMethod: methodFilter !== 'all' ? methodFilter : undefined }),
    [search, methodFilter],
  );

  const {
    items: payments,
    loading,
    loadingMore,
    total,
    error,
    sentinelRef,
    refetch,
  } = useInfiniteScroll<any>({ fetcher, limit: 20 });

  // Fetch invoice summary for overdue count
  const { data: summaryResponse } = useApiQuery(
    () => invoicesApi.summary(),
    [],
  );
  const summaryData = (summaryResponse?.data as any) ?? {};
  const overdueCount: number = summaryData.overdueCount ?? summaryData.overdue_count ?? 0;

  const now = Date.now();
  const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const totalCollectedThisMonth = payments.filter((p: any) => {
    const payDate = new Date(p.date ?? p.paymentDate ?? '').getTime();
    return payDate >= thisMonthStart && payDate <= now;
  }).reduce((sum: number, p: any) => sum + (p.amount ?? 0), 0);
  const totalAmount = payments.reduce((sum: number, p: any) => sum + (p.amount ?? 0), 0);

  const handleDeletePayment = async (id: string) => {
    if (!confirm('Are you sure you want to delete this payment? This will reverse the payment on the invoice.')) return;
    try {
      await deletePayment(id);
      toast.success('Payment deleted successfully');
      refetch();
    } catch {
      toast.error('Failed to delete payment');
    }
  };

  const activeFilters: Array<{ id: string; label: string; value: string }> = [];
  if (methodFilter !== 'all') activeFilters.push({ id: 'method', label: 'Method', value: methodFilter });

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
          <p className="text-sm text-muted-foreground">{total} payments</p>
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
              <p className="text-lg font-bold">{formatCurrency(totalAmount)}</p>
              <p className="text-xs text-muted-foreground">Total Amount</p>
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
              <p className="text-xs text-muted-foreground">Overdue Invoices</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FilterBar */}
      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search payments..."
          activeFilters={activeFilters}
          onRemoveFilter={(id) => { if (id === 'method') setMethodFilter('all'); }}
          onClearFilters={() => setMethodFilter('all')}
          actions={
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All methods" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </div>

      {/* Loading Skeleton */}
      {loading && (
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
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="flex-1 overflow-auto">
          {payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <DollarSign className="h-12 w-12 text-muted-foreground/40" />
              <div>
                <p className="text-base font-medium">No payments found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {search || methodFilter !== 'all' ? 'Try adjusting your filters' : 'Record your first payment to get started'}
                </p>
              </div>
              {!search && methodFilter === 'all' && (
                <Button asChild size="sm"><Link href="/payments/new"><Plus className="h-4 w-4 mr-1.5" />Record Payment</Link></Button>
              )}
            </div>
          ) : (
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
                {payments.map((payment: any) => (
                  <TableRow
                    key={payment.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/invoices/${payment.invoiceId ?? ''}`)}
                  >
                    <TableCell className="text-sm">
                      {payment.paymentDate
                        ? new Date(payment.paymentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                        : payment.date
                          ? new Date(payment.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                          : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-medium">
                      <Link
                        href={`/invoices/${payment.invoiceId ?? ''}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {payment.invoiceNumber ?? '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{payment.clientName ?? 'N/A'}</TableCell>
                    <TableCell className="text-sm font-medium text-green-600">{formatCurrency(payment.amount ?? 0)}</TableCell>
                    <TableCell><MethodBadge method={payment.paymentMethod ?? payment.method ?? ''} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">{payment.reference ?? '—'}</TableCell>
                    <TableCell className="text-sm">{payment.recordedBy ?? 'N/A'}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/invoices/${payment.invoiceId ?? ''}`}>
                              <FileText className="h-3.5 w-3.5 mr-2" />View Invoice
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); setReceiptPayment(payment); }}
                          >
                            <Receipt className="h-3.5 w-3.5 mr-2" />Download Receipt
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); handleDeletePayment(payment.id); }}
                            className="text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-4" />
          {loadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      {/* Payment Receipt Overlay */}
      {receiptPayment && (
        <PaymentReceipt
          payment={receiptPayment}
          onClose={() => setReceiptPayment(null)}
        />
      )}
    </div>
  );
}
