'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, DollarSign, MoreHorizontal, Download, Send, AlertCircle, CheckCircle2, Clock, FileText, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { invoicesApi } from '@/lib/api/invoices';
import type { Invoice } from '@travelcrm/shared';


function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    partially_paid: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    paid: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    overdue: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  };
  const labels: Record<string, string> = { draft: 'Draft', sent: 'Sent', partially_paid: 'Partial', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled' };
  return <Badge variant="outline" className={cn('border-transparent text-[11px]', styles[status] ?? 'bg-slate-100 text-slate-700')}>{labels[status] ?? status}</Badge>;
}

export default function InvoicesPage() {
  const router = useRouter();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [page, setPage] = React.useState(1);

  const { data: response, loading, error, refetch } = useApiQuery(
    () => invoicesApi.list({ page, limit: 100, search: search || undefined, status: statusFilter !== 'all' ? statusFilter : undefined }),
    [page, search, statusFilter],
  );

  const { mutate: deleteInvoice, loading: isDeleting } = useApiMutation(
    (id: string) => invoicesApi.delete(id),
  );

  const handleDeleteInvoice = async (id: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;

    try {
      await deleteInvoice(id);
      toast.success('Invoice deleted successfully');
      await refetch();
    } catch (err) {
      toast.error('Failed to delete invoice');
    }
  };

  const invoicesData = response?.data;
  const rawInvoices = Array.isArray(invoicesData) ? invoicesData : (invoicesData?.data ?? []);
  const displayInvoices = rawInvoices.map((inv: any) => ({
    ...inv,
    invoiceNumber: inv.invoiceNumber || inv.invoice_number,
    totalAmount: inv.totalAmount ?? inv.total ?? 0,
    paidAmount: inv.paidAmount ?? inv.paid_amount ?? 0,
    balanceDue: inv.balanceDue ?? inv.balance_due ?? 0,
    issueDate: inv.issueDate || inv.issue_date || inv.created_at,
    dueDate: inv.dueDate || inv.due_date,
    clientName: inv.clientName || inv.contact_name || 'N/A',
    contactEmail: inv.contactEmail || inv.contact_email,
    contactId: inv.contactId || inv.contact_id,
    leadId: inv.leadId || inv.lead_id,
  }));

  const filtered = React.useMemo(() => {
    let result = [...displayInvoices];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((inv: any) => {
        const num = (inv.invoiceNumber ?? '').toLowerCase();
        return num.includes(q);
      });
    }
    return result;
  }, [displayInvoices, search]);

  const totalOutstanding = displayInvoices.reduce((sum: any, inv: any) => sum + ((inv.totalAmount ?? 0) - (inv.paidAmount ?? 0)), 0);
  const totalCollected = displayInvoices.reduce((sum: any, inv: any) => sum + (inv.paidAmount ?? 0), 0);
  const overdueCount = displayInvoices.filter((inv: any) => inv.status === 'overdue').length;

  return (
    <div className="flex flex-col h-full">
      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 border-b border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500 shrink-0" />
          <p className="text-sm text-amber-600 dark:text-amber-500">Failed to load invoices</p>
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Invoices</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} invoices</p>
        </div>
        <Button asChild><Link href="/invoices/new"><Plus className="h-4 w-4 mr-1.5" /> New Invoice</Link></Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-lg font-bold">{formatCurrency(totalCollected)}</p>
              <p className="text-xs text-muted-foreground">Collected</p>
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
              <p className="text-xs text-muted-foreground">Outstanding</p>
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
              <p className="text-xs text-muted-foreground">Overdue</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="partially_paid">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading invoices...</p>
          </div>
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Issue Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv, idx) => {
                const balance = (inv.totalAmount ?? 0) - (inv.paidAmount ?? 0);
                const clientName = inv.clientName || 'N/A';
                const invNum = inv.invoiceNumber ?? (filtered[idx] ?? {}).invoiceNumber ?? '—';
                return (
                  <TableRow key={inv.id} className="cursor-pointer" onClick={() => router.push(`/invoices/${inv.id}`)}>
                    <TableCell className="font-mono text-sm font-medium">
                      <Link href={`/invoices/${inv.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{invNum}</Link>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{clientName}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</TableCell>
                    <TableCell className="text-sm font-medium">{formatCurrency(inv.totalAmount ?? 0)}</TableCell>
                    <TableCell className="text-sm text-green-600">{formatCurrency(inv.paidAmount ?? 0)}</TableCell>
                    <TableCell className={cn('text-sm font-medium', balance > 0 ? 'text-amber-600' : 'text-green-600')}>{formatCurrency(balance)}</TableCell>
                    <TableCell><StatusBadge status={inv.status} /></TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/invoices/${inv.id}`}><FileText className="h-3.5 w-3.5 mr-2" />View Details</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/invoices/${inv.id}?tab=payments`}><DollarSign className="h-3.5 w-3.5 mr-2" />Record Payment</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Download className="h-3.5 w-3.5 mr-2" />Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteInvoice(inv.id)}
                            disabled={isDeleting}
                            className="text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
