'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader, Loader2, AlertCircle, Download, MoreHorizontal, Printer, FileSpreadsheet, Copy, CreditCard, FileText, FileMinus, FilePlus, Send, Plus, Trash2, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useApiQuery } from '@/hooks/use-api';
import { invoicesApi } from '@/lib/api/invoices';
import { paymentsApi } from '@/lib/api/payments';
import { creditNotesApi, debitNotesApi, type CreateCreditNoteRequest, type CreateDebitNoteRequest } from '@/lib/api/credit-notes';
import type { Invoice } from '@travelcrm/shared';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { toast } from 'sonner';

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;

  const [payDialogOpen, setPayDialogOpen] = React.useState(false);
  const [payAmount, setPayAmount] = React.useState('');
  const [payMethod, setPayMethod] = React.useState<string>('transfer');
  const [payReference, setPayReference] = React.useState('');
  const [isPaying, setIsPaying] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [reminderDialogOpen, setReminderDialogOpen] = React.useState(false);

  // Credit/Debit Note state
  const [creditNoteDialogOpen, setCreditNoteDialogOpen] = React.useState(false);
  const [debitNoteDialogOpen, setDebitNoteDialogOpen] = React.useState(false);
  const [noteReason, setNoteReason] = React.useState('');
  const [noteNotes, setNoteNotes] = React.useState('');
  const [noteItems, setNoteItems] = React.useState<Array<{ id: number; description: string; quantity: number; rate: number; taxRate: number }>>([
    { id: 1, description: '', quantity: 1, rate: 0, taxRate: 18 },
  ]);
  const [isCreatingNote, setIsCreatingNote] = React.useState(false);
  let noteItemIdCounter = React.useRef(2);

  // Send Invoice state — uses SendMessageDialog
  const [sendDialogOpen, setSendDialogOpen] = React.useState(false);

  // Duplicate state
  const [isDuplicating, setIsDuplicating] = React.useState(false);

  const { data: response, loading, error, refetch } = useApiQuery<any>(
    () => invoicesApi.getById(invoiceId),
    [invoiceId],
  );

  // Payment history query
  const { data: paymentsResponse, loading: paymentsLoading, refetch: refetchPayments } = useApiQuery<any>(
    () => invoicesApi.getPayments(invoiceId),
    [invoiceId],
  );
  const payments: any[] = React.useMemo(() => {
    const raw = paymentsResponse?.data;
    if (Array.isArray(raw)) return raw;
    if (raw?.data && Array.isArray(raw.data)) return raw.data;
    return [];
  }, [paymentsResponse]);

  const rawInv = response?.data as any;
  const invoice = rawInv ? {
    ...rawInv,
    invoiceNumber: rawInv.invoiceNumber || rawInv.invoice_number,
    totalAmount: rawInv.totalAmount ?? rawInv.total ?? 0,
    paidAmount: rawInv.paidAmount ?? rawInv.paid_amount ?? 0,
    balanceDue: rawInv.balanceDue ?? rawInv.balance_due ?? 0,
    issueDate: rawInv.issueDate || rawInv.issue_date || rawInv.created_at,
    dueDate: rawInv.dueDate || rawInv.due_date,
    contactName: rawInv.contactName || rawInv.contact_name || 'N/A',
    contactEmail: rawInv.contactEmail || rawInv.contact_email,
    contactId: rawInv.contactId || rawInv.contact_id,
    leadId: rawInv.leadId || rawInv.lead_id,
    status: rawInv.status || 'draft',
    notes: rawInv.notes,
    terms: rawInv.terms,
    items: rawInv.items ?? [],
  } as Invoice & Record<string, any> : undefined;

  const generatePdf = async () => {
    if (!invoice) return;
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const inv = invoice as any;
    const items: any[] = inv.items ?? [];
    const pageW = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', 14, 22);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(inv.invoiceNumber ?? '', 14, 30);

    // Status badge
    doc.setFontSize(9);
    doc.text(`Status: ${(inv.status ?? '').replace('_', ' ').toUpperCase()}`, pageW - 14, 22, { align: 'right' });
    doc.text(`Issue: ${inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('en-IN') : '—'}`, pageW - 14, 28, { align: 'right' });
    doc.text(`Due: ${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN') : '—'}`, pageW - 14, 34, { align: 'right' });

    // Line
    doc.setDrawColor(200);
    doc.line(14, 38, pageW - 14, 38);

    // Client info
    let y = 46;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(inv.contactName || inv.contact_name || inv.clientName || 'N/A', 14, y + 6);
    if (inv.contactEmail || inv.contact_email) doc.text(inv.contactEmail || inv.contact_email, 14, y + 12);

    // Items table
    y = 70;
    if (items.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Description', 14, y);
      doc.text('Qty', 110, y);
      doc.text('Rate', 130, y);
      doc.text('Amount', pageW - 14, y, { align: 'right' });
      doc.line(14, y + 2, pageW - 14, y + 2);
      y += 8;
      doc.setFont('helvetica', 'normal');
      items.forEach((item: any) => {
        doc.text(String(item.description ?? ''), 14, y);
        doc.text(String(item.quantity ?? 0), 110, y);
        doc.text(`₹${(item.rate ?? item.unitPrice ?? 0).toLocaleString('en-IN')}`, 130, y);
        doc.text(`₹${(item.amount ?? 0).toLocaleString('en-IN')}`, pageW - 14, y, { align: 'right' });
        y += 7;
      });
    }

    // Totals
    y += 5;
    doc.line(110, y, pageW - 14, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Total:', 130, y);
    doc.text(`₹${(inv.totalAmount ?? 0).toLocaleString('en-IN')}`, pageW - 14, y, { align: 'right' });

    if ((inv.paidAmount ?? inv.paid_amount ?? 0) > 0) {
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Paid:', 130, y);
      doc.text(`₹${(inv.paidAmount ?? inv.paid_amount ?? 0).toLocaleString('en-IN')}`, pageW - 14, y, { align: 'right' });
      y += 7;
      const balance = (inv.totalAmount ?? 0) - (inv.paidAmount ?? inv.paid_amount ?? 0);
      doc.setFont('helvetica', 'bold');
      doc.text('Balance Due:', 130, y);
      doc.text(`₹${balance.toLocaleString('en-IN')}`, pageW - 14, y, { align: 'right' });
    }

    // Notes
    if (inv.notes) {
      y += 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Notes:', 14, y);
      doc.setFont('helvetica', 'normal');
      doc.text(inv.notes, 14, y + 6, { maxWidth: pageW - 28 });
    }

    return doc;
  };

  const handleDownloadPdf = async () => {
    try {
      const doc = await generatePdf();
      if (doc) {
        doc.save(`${invoice?.invoiceNumber ?? 'invoice'}.pdf`);
        toast.success('Invoice PDF downloaded!');
      }
    } catch {
      toast.error('Failed to generate PDF');
    }
  };

  const handleDownloadCsv = () => {
    if (!invoice) return;
    const inv = invoice as any;
    const items: any[] = inv.items ?? [];
    const rows = [['Description', 'Quantity', 'Rate', 'Amount']];
    items.forEach((item: any) => {
      rows.push([item.description ?? '', String(item.quantity ?? 0), String(item.rate ?? item.unitPrice ?? 0), String(item.amount ?? 0)]);
    });
    rows.push([]);
    rows.push(['', '', 'Total', String(inv.totalAmount ?? 0)]);
    rows.push(['', '', 'Paid', String(inv.paidAmount ?? inv.paid_amount ?? 0)]);
    rows.push(['', '', 'Balance', String((inv.totalAmount ?? 0) - (inv.paidAmount ?? inv.paid_amount ?? 0))]);

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([`Invoice: ${inv.invoiceNumber}\nDate: ${inv.issueDate}\nClient: ${inv.contactName || inv.contact_name || ''}\n\n${csv}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${inv.invoiceNumber ?? 'invoice'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded!');
  };

  const handlePrint = async () => {
    try {
      const doc = await generatePdf();
      if (doc) {
        const pdfBlob = doc.output('blob');
        const url = URL.createObjectURL(pdfBlob);
        const printWindow = window.open(url);
        if (printWindow) {
          printWindow.addEventListener('load', () => {
            printWindow.print();
          });
        }
      }
    } catch {
      toast.error('Failed to open print dialog');
    }
  };

  const handleMarkAsPaid = async () => {
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }
    setIsPaying(true);
    try {
      await paymentsApi.create({
        invoiceId,
        amount,
        date: new Date().toISOString().split('T')[0],
        method: payMethod as any,
        reference: payReference || undefined,
      });
      toast.success('Payment recorded successfully!');
      setPayDialogOpen(false);
      setPayAmount('');
      setPayReference('');
      refetch();
    } catch {
      toast.error('Failed to record payment');
    } finally {
      setIsPaying(false);
    }
  };


  const handleCancelInvoice = async () => {
    if (!confirm('Are you sure you want to cancel this invoice? This action cannot be undone.')) return;
    setIsCancelling(true);
    try {
      await invoicesApi.void(invoiceId, { reason: 'Cancelled by user' });
      toast.success('Invoice cancelled successfully!');
      refetch();
    } catch {
      toast.error('Failed to cancel invoice');
    } finally {
      setIsCancelling(false);
    }
  };

  // Credit/Debit Note helpers
  const resetNoteForm = () => {
    setNoteReason('');
    setNoteNotes('');
    setNoteItems([{ id: 1, description: '', quantity: 1, rate: 0, taxRate: 18 }]);
    noteItemIdCounter.current = 2;
  };

  const addNoteItem = () => {
    setNoteItems((prev) => [...prev, { id: noteItemIdCounter.current++, description: '', quantity: 1, rate: 0, taxRate: 18 }]);
  };

  const removeNoteItem = (id: number) => {
    setNoteItems((prev) => prev.length > 1 ? prev.filter((item) => item.id !== id) : prev);
  };

  const updateNoteItem = (id: number, field: string, value: string | number) => {
    setNoteItems((prev) => prev.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleCreateCreditNote = async () => {
    if (!noteReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    if (noteItems.every((item) => !item.description.trim())) {
      toast.error('At least one item with description is required');
      return;
    }
    setIsCreatingNote(true);
    try {
      const request: CreateCreditNoteRequest = {
        invoiceId,
        reason: noteReason,
        notes: noteNotes || undefined,
        items: noteItems.filter((item) => item.description.trim()).map(({ description, quantity, rate, taxRate }) => ({ description, quantity, rate, taxRate })),
      };
      await creditNotesApi.create(request);
      toast.success('Credit note created successfully');
      setCreditNoteDialogOpen(false);
      resetNoteForm();
      refetch();
    } catch {
      toast.error('Failed to create credit note');
    } finally {
      setIsCreatingNote(false);
    }
  };

  const handleCreateDebitNote = async () => {
    if (!noteReason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    if (noteItems.every((item) => !item.description.trim())) {
      toast.error('At least one item with description is required');
      return;
    }
    setIsCreatingNote(true);
    try {
      const request: CreateDebitNoteRequest = {
        invoiceId,
        reason: noteReason,
        notes: noteNotes || undefined,
        items: noteItems.filter((item) => item.description.trim()).map(({ description, quantity, rate, taxRate }) => ({ description, quantity, rate, taxRate })),
      };
      await debitNotesApi.create(request);
      toast.success('Debit note created successfully');
      setDebitNoteDialogOpen(false);
      resetNoteForm();
      refetch();
    } catch {
      toast.error('Failed to create debit note');
    } finally {
      setIsCreatingNote(false);
    }
  };

  const handleDuplicate = async () => {
    setIsDuplicating(true);
    try {
      const result = await invoicesApi.duplicate(invoiceId);
      const newInvoice = (result as any)?.data;
      const newNumber = newInvoice?.invoiceNumber || newInvoice?.invoice_number || 'New';
      toast.success(`Invoice duplicated! New invoice: ${newNumber}`);
      if (newInvoice?.id) {
        router.push(`/invoices/${newInvoice.id}`);
      }
    } catch {
      toast.error('Failed to duplicate invoice');
    } finally {
      setIsDuplicating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <p className="text-muted-foreground text-center">Failed to load invoice</p>
        <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-700',
    viewed: 'bg-purple-100 text-purple-700',
    partially_paid: 'bg-yellow-100 text-yellow-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-200 text-gray-800',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              {invoice.invoiceNumber}
            </h1>
            <p className="text-sm text-muted-foreground">Invoice details and payment status</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push(`/invoices/${invoiceId}/edit`)}>
            <Edit2 className="h-4 w-4 mr-1" />Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setSendDialogOpen(true)}
          >
            <Send className="h-4 w-4" />
            Send Invoice
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDownloadPdf}><Download className="h-4 w-4 mr-2" />Download PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadCsv}><FileSpreadsheet className="h-4 w-4 mr-2" />Download CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={handlePrint}><Printer className="h-4 w-4 mr-2" />Print Invoice</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => {
                const balance = (invoice.totalAmount ?? 0) - (invoice.paidAmount ?? 0);
                setPayAmount(String(balance > 0 ? balance : invoice.totalAmount ?? 0));
                setPayDialogOpen(true);
              }}>
                <CreditCard className="h-4 w-4 mr-2" />
                Record Payment
              </DropdownMenuItem>
              <DropdownMenuItem disabled={isDuplicating} onClick={handleDuplicate}>
                <Copy className="h-4 w-4 mr-2" />
                {isDuplicating ? 'Duplicating...' : 'Duplicate Invoice'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                resetNoteForm();
                setCreditNoteDialogOpen(true);
              }}>
                <FileMinus className="h-4 w-4 mr-2" />
                Create Credit Note
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                resetNoteForm();
                setDebitNoteDialogOpen(true);
              }}>
                <FilePlus className="h-4 w-4 mr-2" />
                Create Debit Note
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setReminderDialogOpen(true)}>
                Send Reminder
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" disabled={isCancelling} onClick={handleCancelInvoice}>
                {isCancelling ? 'Cancelling...' : 'Cancel Invoice'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl space-y-6">
          {/* Status Card */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Status</p>
                  <Badge className={statusColors[invoice.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-700'}>
                    {invoice.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Issue Date</p>
                  <p className="text-sm font-medium">{new Date(invoice.issueDate).toLocaleDateString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Due Date</p>
                  <p className="text-sm font-medium">{new Date(invoice.dueDate).toLocaleDateString('en-IN')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Amount</p>
                  <p className="text-sm font-bold">₹{invoice.totalAmount?.toLocaleString('en-IN') ?? '0'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {invoice.leadId && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Lead</p>
                    <a
                      href={`/leads/${invoice.leadId}`}
                      className="text-sm font-medium text-indigo-600 hover:underline"
                    >
                      {(invoice as any).leadTitle ?? (invoice as any).lead_title ?? invoice.leadId}
                    </a>
                  </div>
                </div>
              )}

              {(invoice as any).notes && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Notes</p>
                  <p className="text-sm">{(invoice as any).notes}</p>
                </div>
              )}

              {(invoice as any).terms && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Terms & Conditions</p>
                  <p className="text-sm">{(invoice as any).terms}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line Items */}
          {(invoice as any).items && (invoice as any).items.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Line Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Line items header */}
                  <div className="grid grid-cols-[1fr_80px_60px_80px_90px] gap-3 text-xs font-medium text-muted-foreground px-1 pb-1 border-b">
                    <span>Description</span>
                    <span>HSN/SAC</span>
                    <span>Qty</span>
                    <span>Rate</span>
                    <span className="text-right">Amount</span>
                  </div>
                  {(invoice as any).items.map((item: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-[1fr_80px_60px_80px_90px] gap-3 py-2 border-b last:border-0 items-center">
                      <p className="text-sm font-medium">{item.description ?? ''}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.hsnCode ?? item.hsn_code ?? '—'}</p>
                      <p className="text-sm text-muted-foreground">{item.quantity ?? 0}</p>
                      <p className="text-sm text-muted-foreground">₹{(item.rate ?? item.unitPrice ?? 0).toLocaleString('en-IN')}</p>
                      <p className="text-sm font-medium text-right">₹{(item.amount ?? 0).toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2 max-w-xs ml-auto">
                {/* Subtotal */}
                {(invoice as any).subtotal != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">&#x20B9;{((invoice as any).subtotal ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {/* Discount */}
                {((invoice as any).discountAmount ?? (invoice as any).discount_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>Discount</span>
                    <span className="font-medium">-&#x20B9;{((invoice as any).discountAmount ?? (invoice as any).discount_amount ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {/* GST breakdown */}
                {((invoice as any).cgstAmount ?? (invoice as any).cgst_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>CGST ({(invoice as any).cgstRate ?? (invoice as any).cgst_rate ?? 0}%)</span>
                    <span>&#x20B9;{((invoice as any).cgstAmount ?? (invoice as any).cgst_amount ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {((invoice as any).sgstAmount ?? (invoice as any).sgst_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>SGST ({(invoice as any).sgstRate ?? (invoice as any).sgst_rate ?? 0}%)</span>
                    <span>&#x20B9;{((invoice as any).sgstAmount ?? (invoice as any).sgst_amount ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {((invoice as any).igstAmount ?? (invoice as any).igst_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>IGST ({(invoice as any).igstRate ?? (invoice as any).igst_rate ?? 0}%)</span>
                    <span>&#x20B9;{((invoice as any).igstAmount ?? (invoice as any).igst_amount ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {/* Fallback: show total tax if no breakdown */}
                {((invoice as any).totalTax ?? (invoice as any).total_tax ?? 0) > 0
                  && !((invoice as any).cgstAmount || (invoice as any).igstAmount) && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Tax</span>
                    <span>&#x20B9;{((invoice as any).totalTax ?? (invoice as any).total_tax ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between">
                  <span className="text-base font-bold">Total Amount</span>
                  <span className="text-base font-bold">&#x20B9;{(invoice.totalAmount ?? 0).toLocaleString('en-IN')}</span>
                </div>
                {(invoice.paidAmount ?? 0) > 0 && (
                  <>
                    <div className="flex justify-between text-green-600 text-sm">
                      <span>Paid</span>
                      <span className="font-medium">&#x20B9;{(invoice.paidAmount ?? 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold">
                      <span>Balance Due</span>
                      <span>&#x20B9;{(invoice.balanceDue ?? ((invoice.totalAmount ?? 0) - (invoice.paidAmount ?? 0))).toLocaleString('en-IN')}</span>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Payment History */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Payment History
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const balance = (invoice.totalAmount ?? 0) - (invoice.paidAmount ?? 0);
                    setPayAmount(String(balance > 0 ? balance : invoice.totalAmount ?? 0));
                    setPayDialogOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Record Payment
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {paymentsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : payments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No payments recorded yet.</p>
              ) : (
                <div className="space-y-0">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_100px_120px_1fr] gap-3 text-xs font-medium text-muted-foreground px-2 pb-2 border-b">
                    <span>Date</span>
                    <span>Amount</span>
                    <span>Method</span>
                    <span>Reference</span>
                  </div>
                  {payments.map((payment: any, idx: number) => (
                    <div key={payment.id || idx} className="grid grid-cols-[1fr_100px_120px_1fr] gap-3 items-center px-2 py-2.5 border-b last:border-0 hover:bg-muted/50">
                      <span className="text-sm">
                        {new Date(payment.paymentDate || payment.payment_date || payment.date || payment.createdAt || payment.created_at).toLocaleDateString('en-IN')}
                      </span>
                      <span className="text-sm font-medium">
                        &#x20B9;{(payment.amount ?? 0).toLocaleString('en-IN')}
                      </span>
                      <span className="text-sm">
                        <Badge variant="outline" className="text-xs capitalize">
                          {(payment.paymentMethod || payment.payment_method || payment.method || 'N/A').replace('_', ' ')}
                        </Badge>
                      </span>
                      <span className="text-sm text-muted-foreground truncate">
                        {payment.reference || payment.transactionId || payment.transaction_id || '-'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="Enter payment amount"
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="check">Cheque</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reference / Transaction ID</Label>
              <Input
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                placeholder="e.g., UTR number"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} disabled={isPaying}>Cancel</Button>
            <Button onClick={handleMarkAsPaid} disabled={isPaying}>
              {isPaying && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Invoice Dialog — uses SendMessageDialog for consistent UX */}
      <SendMessageDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        contact={{
          id: invoice?.contactId ?? '',
          name: invoice?.contactName ?? 'Client',
          email: (invoice as any)?.contactEmail ?? (invoice as any)?.contact_email ?? null,
          phone: (invoice as any)?.contactPhone ?? (invoice as any)?.contact_phone ?? null,
        }}
        defaultChannel="email"
      />

      {/* Send Reminder Dialog */}
      <SendMessageDialog
        open={reminderDialogOpen}
        onOpenChange={setReminderDialogOpen}
        contact={{
          id: invoice?.contactId ?? '',
          name: invoice?.contactName ?? 'Client',
          email: (invoice as any)?.contactEmail ?? (invoice as any)?.contact_email ?? null,
          phone: (invoice as any)?.contactPhone ?? (invoice as any)?.contact_phone ?? null,
        }}
        defaultChannel="email"
      />

      {/* Credit Note Dialog */}
      <Dialog open={creditNoteDialogOpen} onOpenChange={(open) => { setCreditNoteDialogOpen(open); if (!open) resetNoteForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue Credit Note</DialogTitle>
            <DialogDescription>
              Create a credit note against invoice {invoice?.invoiceNumber}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Input value={noteReason} onChange={(e) => setNoteReason(e.target.value)} placeholder="e.g., Service cancellation, Overcharge correction" />
            </div>
            <div className="space-y-2">
              <Label>Items</Label>
              {noteItems.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_60px_80px_28px] gap-2 items-center">
                  <Input placeholder="Description" value={item.description} onChange={(e) => updateNoteItem(item.id, 'description', e.target.value)} />
                  <Input type="number" min={1} placeholder="Qty" value={item.quantity} onChange={(e) => updateNoteItem(item.id, 'quantity', parseInt(e.target.value) || 1)} />
                  <Input type="number" min={0} placeholder="Rate" value={item.rate || ''} onChange={(e) => updateNoteItem(item.id, 'rate', parseFloat(e.target.value) || 0)} />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeNoteItem(item.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addNoteItem}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add Item
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={noteNotes} onChange={(e) => setNoteNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreditNoteDialogOpen(false); resetNoteForm(); }} disabled={isCreatingNote}>Cancel</Button>
            <Button onClick={handleCreateCreditNote} disabled={isCreatingNote}>
              {isCreatingNote && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Create Credit Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debit Note Dialog */}
      <Dialog open={debitNoteDialogOpen} onOpenChange={(open) => { setDebitNoteDialogOpen(open); if (!open) resetNoteForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue Debit Note</DialogTitle>
            <DialogDescription>
              Create a debit note against invoice {invoice?.invoiceNumber}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Input value={noteReason} onChange={(e) => setNoteReason(e.target.value)} placeholder="e.g., Additional charges, Price adjustment" />
            </div>
            <div className="space-y-2">
              <Label>Items</Label>
              {noteItems.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_60px_80px_28px] gap-2 items-center">
                  <Input placeholder="Description" value={item.description} onChange={(e) => updateNoteItem(item.id, 'description', e.target.value)} />
                  <Input type="number" min={1} placeholder="Qty" value={item.quantity} onChange={(e) => updateNoteItem(item.id, 'quantity', parseInt(e.target.value) || 1)} />
                  <Input type="number" min={0} placeholder="Rate" value={item.rate || ''} onChange={(e) => updateNoteItem(item.id, 'rate', parseFloat(e.target.value) || 0)} />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeNoteItem(item.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addNoteItem}>
                <Plus className="h-3.5 w-3.5 mr-1" />Add Item
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={noteNotes} onChange={(e) => setNoteNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDebitNoteDialogOpen(false); resetNoteForm(); }} disabled={isCreatingNote}>Cancel</Button>
            <Button onClick={handleCreateDebitNote} disabled={isCreatingNote}>
              {isCreatingNote && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Create Debit Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
