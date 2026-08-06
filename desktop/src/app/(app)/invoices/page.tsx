'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, DollarSign, MoreHorizontal, Download, Send, AlertCircle, CheckCircle2, Clock, FileText, Loader2, Trash2, CheckSquare, Square, X, Eye, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useApiMutation } from '@/hooks/use-api';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { FilterBar } from '@/components/domain/filter-bar';
import { invoicesApi } from '@/lib/api/invoices';
import { exportsApi } from '@/lib/api/exports';
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
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkDownloading, setBulkDownloading] = React.useState(false);

  const { mutate: deleteInvoice, loading: isDeleting } = useApiMutation(
    (id: string) => invoicesApi.delete(id),
  );

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      invoicesApi.list({ page, limit, search: search || undefined, status: statusFilter !== 'all' ? statusFilter : undefined }),
    [search, statusFilter],
  );

  const {
    items: invoices,
    loading,
    loadingMore,
    total,
    error,
    sentinelRef,
    refetch,
  } = useInfiniteScroll<any>({ fetcher, limit: 20 });

  const displayInvoices = invoices.map((inv: any) => ({
    ...inv,
    invoiceNumber: inv.invoiceNumber || inv.invoice_number,
    totalAmount: inv.totalAmount ?? inv.total ?? 0,
    paidAmount: inv.paidAmount ?? inv.paid_amount ?? 0,
    balanceDue: inv.balanceDue ?? inv.balance_due ?? 0,
    issueDate: inv.issueDate || inv.issue_date || inv.created_at,
    dueDate: inv.dueDate || inv.due_date,
    clientName: inv.clientName || inv.contact_name || 'N/A',
  }));

  const totalOutstanding = displayInvoices.reduce((sum: number, inv: any) => sum + ((inv.totalAmount ?? 0) - (inv.paidAmount ?? 0)), 0);
  const totalCollected = displayInvoices.reduce((sum: number, inv: any) => sum + (inv.paidAmount ?? 0), 0);
  const overdueCount = displayInvoices.filter((inv: any) => inv.status === 'overdue').length;

  const handleDeleteInvoice = async (id: string) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;
    try {
      await deleteInvoice(id);
      toast.success('Invoice deleted successfully');
      refetch();
    } catch {
      toast.error('Failed to delete invoice');
    }
  };

  const handleDownloadPdf = async (inv: any) => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      const pageW = doc.internal.pageSize.getWidth();
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('INVOICE', 14, 22);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(inv.invoiceNumber ?? '', 14, 30);
      doc.setFontSize(9);
      doc.text(`Status: ${(inv.status ?? '').replace('_', ' ').toUpperCase()}`, pageW - 14, 22, { align: 'right' });
      doc.text(`Due: ${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN') : '—'}`, pageW - 14, 28, { align: 'right' });
      doc.setDrawColor(200);
      doc.line(14, 38, pageW - 14, 38);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Bill To:', 14, 46);
      doc.setFont('helvetica', 'normal');
      doc.text(inv.clientName ?? 'N/A', 14, 52);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Total:', 130, 70);
      doc.text(`₹${(inv.totalAmount ?? 0).toLocaleString('en-IN')}`, pageW - 14, 70, { align: 'right' });
      doc.save(`${inv.invoiceNumber ?? 'invoice'}.pdf`);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to generate PDF');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === displayInvoices.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayInvoices.map((inv: any) => inv.id)));
    }
  };

  const handleBulkDownloadPdf = async () => {
    setBulkDownloading(true);
    try {
      const blob = await exportsApi.invoicesBulkPdf({ invoiceIds: [...selectedIds] }) as unknown as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoices_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${selectedIds.size} invoice(s)`);
      setSelectedIds(new Set());
    } catch {
      toast.error('Failed to download invoices');
    } finally {
      setBulkDownloading(false);
    }
  };

  const activeFilters: Array<{ id: string; label: string; value: string }> = [];
  if (statusFilter !== 'all') activeFilters.push({ id: 'status', label: 'Status', value: statusFilter });

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
          <p className="text-sm text-muted-foreground">{total} invoices</p>
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

      {/* FilterBar */}
      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search invoices..."
          activeFilters={activeFilters}
          onRemoveFilter={(id) => { if (id === 'status') setStatusFilter('all'); }}
          onClearFilters={() => setStatusFilter('all')}
          actions={
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="partially_paid">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-6 py-2 bg-primary/5 border-b border-primary/20">
          <button onClick={() => setSelectedIds(new Set())} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-1.5"
            onClick={handleBulkDownloadPdf}
            disabled={bulkDownloading}
          >
            {bulkDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Download as PDF
          </Button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
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
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
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
          {displayInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground/40" />
              <div>
                <p className="text-base font-medium">No invoices found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first invoice to get started'}
                </p>
              </div>
              {!search && statusFilter === 'all' && (
                <Button asChild size="sm"><Link href="/invoices/new"><Plus className="h-4 w-4 mr-1.5" />New Invoice</Link></Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <button onClick={toggleSelectAll} className="flex items-center justify-center text-muted-foreground hover:text-foreground">
                      {selectedIds.size === displayInvoices.length && displayInvoices.length > 0
                        ? <CheckSquare className="h-4 w-4 text-primary" />
                        : <Square className="h-4 w-4" />}
                    </button>
                  </TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Issue Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-36" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayInvoices.map((inv: any) => {
                  const balance = (inv.totalAmount ?? 0) - (inv.paidAmount ?? 0);
                  const invNum = inv.invoiceNumber ?? '—';
                  const isSelected = selectedIds.has(inv.id);
                  return (
                    <TableRow key={inv.id} className={cn('cursor-pointer group', isSelected && 'bg-primary/5')} onClick={() => router.push(`/invoices/${inv.id}`)}>
                      <TableCell onClick={(e) => { e.stopPropagation(); toggleSelect(inv.id); }}>
                        <div className="flex items-center justify-center text-muted-foreground hover:text-foreground">
                          {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium">
                        <Link href={`/invoices/${inv.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{invNum}</Link>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{inv.clientName}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</TableCell>
                      <TableCell className="text-sm font-medium">{formatCurrency(inv.totalAmount ?? 0)}</TableCell>
                      <TableCell className="text-sm text-green-600">{formatCurrency(inv.paidAmount ?? 0)}</TableCell>
                      <TableCell className={cn('text-sm font-medium', balance > 0 ? 'text-amber-600' : 'text-green-600')}>{formatCurrency(balance)}</TableCell>
                      <TableCell><StatusBadge status={inv.status} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={(e) => { e.stopPropagation(); router.push(`/invoices/${inv.id}`); }}
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={(e) => { e.stopPropagation(); handleDownloadPdf(inv); }}
                            title="Download PDF"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDeleteInvoice(inv.id); }}
                            disabled={isDeleting}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/invoices/${inv.id}?tab=payments`}><DollarSign className="h-3.5 w-3.5 mr-2" />Record Payment</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/invoices/${inv.id}`}><FileText className="h-3.5 w-3.5 mr-2" />View Details</Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
    </div>
  );
}
