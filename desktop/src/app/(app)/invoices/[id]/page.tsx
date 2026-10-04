'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Download, Printer, FileSpreadsheet, Copy, CreditCard, FileMinus, FilePlus, Plus, Trash2,
} from 'lucide-react';
import { DetailPage } from '@/components/domain';
import {
  Button, Badge, Tag, SectionCard, Separator, Skeleton, EmptyState,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Input, Label, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  useConfirm,
} from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { invoicesApi } from '@/lib/api/invoices';
import { paymentsApi } from '@/lib/api/payments';
import { creditNotesApi, debitNotesApi, type CreateCreditNoteRequest, type CreateDebitNoteRequest } from '@/lib/api/credit-notes';
import { toast } from 'sonner';
import { toLocalDateString } from '@/lib/dates';

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'paid') return 'success';
  if (status === 'overdue' || status === 'cancelled') return 'danger';
  if (status === 'partially_paid') return 'warning';
  if (status === 'sent') return 'info';
  return 'neutral';
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [payDialogOpen, setPayDialogOpen] = React.useState(false);
  const [payAmount, setPayAmount] = React.useState('');
  const [payMethod, setPayMethod] = React.useState('transfer');
  const [payReference, setPayReference] = React.useState('');
  const [isPaying, setIsPaying] = React.useState(false);
  const [isVoiding, setIsVoiding] = React.useState(false);
  const [isDuplicating, setIsDuplicating] = React.useState(false);

  const [creditNoteDialogOpen, setCreditNoteDialogOpen] = React.useState(false);
  const [debitNoteDialogOpen, setDebitNoteDialogOpen] = React.useState(false);
  const [noteReason, setNoteReason] = React.useState('');
  const [noteNotes, setNoteNotes] = React.useState('');
  const [noteItems, setNoteItems] = React.useState<Array<{ id: number; description: string; quantity: number; rate: number; taxRate: number }>>([
    { id: 1, description: '', quantity: 1, rate: 0, taxRate: 18 },
  ]);
  const [isCreatingNote, setIsCreatingNote] = React.useState(false);
  const noteItemIdCounter = React.useRef(2);

  const { data: response, loading, refetch } = useApiQuery<any>(
    () => invoicesApi.getById(invoiceId),
    [invoiceId],
  );

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
    balanceDue: rawInv.balanceDue ?? rawInv.balance_due,
    issueDate: rawInv.issueDate || rawInv.issue_date || rawInv.created_at,
    dueDate: rawInv.dueDate || rawInv.due_date,
    contactName: rawInv.contactName || rawInv.contact_name || 'N/A',
    contactEmail: rawInv.contactEmail || rawInv.contact_email,
    contactPhone: rawInv.contactPhone || rawInv.contact_phone,
    contactId: rawInv.contactId || rawInv.contact_id,
    leadId: rawInv.leadId || rawInv.lead_id,
    leadTitle: rawInv.leadTitle || rawInv.lead_title,
    status: rawInv.status || 'draft',
    items: rawInv.items ?? [],
  } : undefined;

  const generatePdf = async () => {
    if (!invoice) return;
    const { default: jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const inv = invoice as any;
    const items: any[] = inv.items ?? [];
    const pageW = doc.internal.pageSize.getWidth();

    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', 14, 22);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(inv.invoiceNumber ?? '', 14, 30);

    doc.setFontSize(9);
    doc.text(`Status: ${(inv.status ?? '').replace('_', ' ').toUpperCase()}`, pageW - 14, 22, { align: 'right' });
    doc.text(`Issue: ${inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('en-IN') : '—'}`, pageW - 14, 28, { align: 'right' });
    doc.text(`Due: ${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN') : '—'}`, pageW - 14, 34, { align: 'right' });

    doc.setDrawColor(200);
    doc.line(14, 38, pageW - 14, 38);

    let y = 46;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(inv.contactName ?? 'N/A', 14, y + 6);
    if (inv.contactEmail) doc.text(inv.contactEmail, 14, y + 12);

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

    y += 5;
    doc.line(110, y, pageW - 14, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Total:', 130, y);
    doc.text(`₹${(inv.totalAmount ?? 0).toLocaleString('en-IN')}`, pageW - 14, y, { align: 'right' });

    if ((inv.paidAmount ?? 0) > 0) {
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('Paid:', 130, y);
      doc.text(`₹${(inv.paidAmount ?? 0).toLocaleString('en-IN')}`, pageW - 14, y, { align: 'right' });
      y += 7;
      const balance = (inv.totalAmount ?? 0) - (inv.paidAmount ?? 0);
      doc.setFont('helvetica', 'bold');
      doc.text('Balance Due:', 130, y);
      doc.text(`₹${balance.toLocaleString('en-IN')}`, pageW - 14, y, { align: 'right' });
    }

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
        toast.success('Invoice PDF downloaded');
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
    rows.push(['', '', 'Paid', String(inv.paidAmount ?? 0)]);
    rows.push(['', '', 'Balance', String((inv.totalAmount ?? 0) - (inv.paidAmount ?? 0))]);

    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([`Invoice: ${inv.invoiceNumber}\nDate: ${inv.issueDate}\nClient: ${inv.contactName ?? ''}\n\n${csv}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${inv.invoiceNumber ?? 'invoice'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  const handlePrint = async () => {
    try {
      const doc = await generatePdf();
      if (doc) {
        const pdfBlob = doc.output('blob');
        const url = URL.createObjectURL(pdfBlob);
        const printWindow = window.open(url);
        printWindow?.addEventListener('load', () => printWindow.print());
      }
    } catch {
      toast.error('Failed to open print dialog');
    }
  };

  const handleRecordPayment = async () => {
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
        date: toLocalDateString(new Date()),
        method: payMethod,
        reference: payReference || undefined,
      });
      toast.success('Payment recorded');
      setPayDialogOpen(false);
      setPayAmount('');
      setPayReference('');
      refetch();
      refetchPayments();
    } catch {
      toast.error('Failed to record payment');
    } finally {
      setIsPaying(false);
    }
  };

  const openPaymentDialog = () => {
    const balance = (invoice?.totalAmount ?? 0) - (invoice?.paidAmount ?? 0);
    setPayAmount(String(balance > 0 ? balance : invoice?.totalAmount ?? 0));
    setPayDialogOpen(true);
  };

  const handleVoidInvoice = async () => {
    const ok = await confirm({
      title: 'Void invoice',
      description: 'This cancels the invoice. This action cannot be undone.',
      tone: 'destructive',
      confirmLabel: 'Void invoice',
    });
    if (!ok) return;
    setIsVoiding(true);
    try {
      await invoicesApi.void(invoiceId, { reason: 'Cancelled by user' });
      toast.success('Invoice voided');
      refetch();
    } catch {
      toast.error('Failed to void invoice');
    } finally {
      setIsVoiding(false);
    }
  };

  const resetNoteForm = () => {
    setNoteReason('');
    setNoteNotes('');
    setNoteItems([{ id: 1, description: '', quantity: 1, rate: 0, taxRate: 18 }]);
    noteItemIdCounter.current = 2;
  };

  const addNoteItem = () => setNoteItems((prev) => [...prev, { id: noteItemIdCounter.current++, description: '', quantity: 1, rate: 0, taxRate: 18 }]);
  const removeNoteItem = (id: number) => setNoteItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  const updateNoteItem = (id: number, field: string, value: string | number) =>
    setNoteItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));

  const handleCreateCreditNote = async () => {
    if (!noteReason.trim()) { toast.error('Please provide a reason'); return; }
    if (noteItems.every((item) => !item.description.trim())) { toast.error('At least one item with description is required'); return; }
    setIsCreatingNote(true);
    try {
      const request: CreateCreditNoteRequest = {
        invoiceId,
        reason: noteReason,
        notes: noteNotes || undefined,
        items: noteItems.filter((item) => item.description.trim()).map(({ description, quantity, rate, taxRate }) => ({ description, quantity, rate, taxRate })),
      };
      await creditNotesApi.create(request);
      toast.success('Credit note created');
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
    if (!noteReason.trim()) { toast.error('Please provide a reason'); return; }
    if (noteItems.every((item) => !item.description.trim())) { toast.error('At least one item with description is required'); return; }
    setIsCreatingNote(true);
    try {
      const request: CreateDebitNoteRequest = {
        invoiceId,
        reason: noteReason,
        notes: noteNotes || undefined,
        items: noteItems.filter((item) => item.description.trim()).map(({ description, quantity, rate, taxRate }) => ({ description, quantity, rate, taxRate })),
      };
      await debitNotesApi.create(request);
      toast.success('Debit note created');
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
      toast.success(`Invoice duplicated: ${newInvoice?.invoiceNumber ?? newInvoice?.invoice_number ?? 'New'}`);
      if (newInvoice?.id) router.push(`/invoices/${newInvoice.id}`);
    } catch {
      toast.error('Failed to duplicate invoice');
    } finally {
      setIsDuplicating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <EmptyState
        title="Invoice not found"
        description="This invoice may have been removed."
        action={<Button variant="outline" onClick={() => router.push('/invoices')}>Back to invoices</Button>}
      />
    );
  }

  const isEditable = invoice.status === 'draft';

  return (
    <>
      <DetailPage
        entity={invoice}
        title={invoice.invoiceNumber}
        subtitle="Invoice details and payment status"
        status={<Badge className="capitalize">{invoice.status.replace('_', ' ')}</Badge>}
        onBack={() => router.push('/invoices')}
        messaging={{
          recipientId: invoice.contactId ?? '',
          recipientName: invoice.contactName ?? 'Client',
          email: invoice.contactEmail ?? undefined,
          phone: invoice.contactPhone ?? undefined,
        }}
        primaryActions={
          isEditable ? (
            <Button variant="outline" size="sm" onClick={() => router.push(`/invoices/${invoiceId}/edit`)}>
              Edit
            </Button>
          ) : undefined
        }
        actions={[
          { label: 'Download PDF', icon: <Download aria-hidden="true" />, onSelect: handleDownloadPdf },
          { label: 'Download CSV', icon: <FileSpreadsheet aria-hidden="true" />, onSelect: handleDownloadCsv },
          { label: 'Print invoice', icon: <Printer aria-hidden="true" />, onSelect: handlePrint },
          { label: 'Record payment', icon: <CreditCard aria-hidden="true" />, onSelect: openPaymentDialog, separatorBefore: true },
          { label: isDuplicating ? 'Duplicating…' : 'Duplicate invoice', icon: <Copy aria-hidden="true" />, onSelect: handleDuplicate, disabled: isDuplicating },
          { label: 'Create credit note', icon: <FileMinus aria-hidden="true" />, onSelect: () => { resetNoteForm(); setCreditNoteDialogOpen(true); }, separatorBefore: true },
          { label: 'Create debit note', icon: <FilePlus aria-hidden="true" />, onSelect: () => { resetNoteForm(); setDebitNoteDialogOpen(true); } },
          { label: isVoiding ? 'Voiding…' : 'Void invoice', onSelect: handleVoidInvoice, disabled: isVoiding || invoice.status === 'cancelled', destructive: true, separatorBefore: true },
        ]}
        overview={
          <div className="flex flex-col gap-ds-4">
            <SectionCard title="Summary">
              <div className="grid grid-cols-2 gap-ds-4 sm:grid-cols-4">
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Status</p>
                  <Tag tone={statusTone(invoice.status)}>{invoice.status.replace('_', ' ')}</Tag>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Issue Date</p>
                  <p className="text-sm font-medium">{invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString('en-IN') : '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Due Date</p>
                  <p className="text-sm font-medium">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-IN') : '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Amount</p>
                  <p className="text-sm font-bold">&#x20B9;{(invoice.totalAmount ?? 0).toLocaleString('en-IN')}</p>
                </div>
              </div>
            </SectionCard>

            {(invoice.leadId || invoice.notes || invoice.terms) && (
              <SectionCard title="Invoice Details">
                <div className="flex flex-col gap-ds-4">
                  {invoice.leadId && (
                    <div>
                      <p className="text-sm text-ds-foreground-muted">Lead</p>
                      <a href={`/leads/${invoice.leadId}`} className="text-sm font-medium text-ds-primary hover:underline">
                        {invoice.leadTitle ?? invoice.leadId}
                      </a>
                    </div>
                  )}
                  {invoice.notes && (
                    <div>
                      <p className="text-sm text-ds-foreground-muted mb-ds-1">Notes</p>
                      <p className="text-sm">{invoice.notes}</p>
                    </div>
                  )}
                  {invoice.terms && (
                    <div>
                      <p className="text-sm text-ds-foreground-muted mb-ds-1">Terms & Conditions</p>
                      <p className="text-sm">{invoice.terms}</p>
                    </div>
                  )}
                </div>
              </SectionCard>
            )}

            {invoice.items?.length > 0 && (
              <SectionCard title="Line Items">
                <div className="flex flex-col gap-ds-2">
                  <div className="grid grid-cols-[1fr_80px_60px_80px_90px] gap-ds-3 text-xs font-medium text-ds-foreground-muted px-ds-1 pb-ds-1 border-b border-ds-border">
                    <span>Description</span>
                    <span>HSN/SAC</span>
                    <span>Qty</span>
                    <span>Rate</span>
                    <span className="text-right">Amount</span>
                  </div>
                  {invoice.items.map((item: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-[1fr_80px_60px_80px_90px] gap-ds-3 py-ds-2 border-b border-ds-border last:border-0 items-center">
                      <p className="text-sm font-medium">{item.description ?? ''}</p>
                      <p className="text-xs text-ds-foreground-muted font-mono">{item.hsnCode ?? item.hsn_code ?? '—'}</p>
                      <p className="text-sm text-ds-foreground-muted">{item.quantity ?? 0}</p>
                      <p className="text-sm text-ds-foreground-muted">&#x20B9;{(item.rate ?? item.unitPrice ?? 0).toLocaleString('en-IN')}</p>
                      <p className="text-sm font-medium text-right">&#x20B9;{(item.amount ?? 0).toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            <SectionCard title="Totals">
              <div className="flex flex-col gap-ds-2 max-w-xs ml-auto">
                {invoice.subtotal != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-ds-foreground-muted">Subtotal</span>
                    <span className="font-medium">&#x20B9;{(invoice.subtotal ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {(invoice.discountAmount ?? invoice.discount_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-ds-danger">
                    <span>Discount</span>
                    <span className="font-medium">-&#x20B9;{(invoice.discountAmount ?? invoice.discount_amount ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {(invoice.cgstAmount ?? invoice.cgst_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-ds-foreground-muted">
                    <span>CGST ({invoice.cgstRate ?? invoice.cgst_rate ?? 0}%)</span>
                    <span>&#x20B9;{(invoice.cgstAmount ?? invoice.cgst_amount ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {(invoice.sgstAmount ?? invoice.sgst_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-ds-foreground-muted">
                    <span>SGST ({invoice.sgstRate ?? invoice.sgst_rate ?? 0}%)</span>
                    <span>&#x20B9;{(invoice.sgstAmount ?? invoice.sgst_amount ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {(invoice.igstAmount ?? invoice.igst_amount ?? 0) > 0 && (
                  <div className="flex justify-between text-sm text-ds-foreground-muted">
                    <span>IGST ({invoice.igstRate ?? invoice.igst_rate ?? 0}%)</span>
                    <span>&#x20B9;{(invoice.igstAmount ?? invoice.igst_amount ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                {(invoice.totalTax ?? invoice.total_tax ?? 0) > 0 && !(invoice.cgstAmount || invoice.igstAmount) && (
                  <div className="flex justify-between text-sm text-ds-foreground-muted">
                    <span>Tax</span>
                    <span>&#x20B9;{(invoice.totalTax ?? invoice.total_tax ?? 0).toLocaleString('en-IN')}</span>
                  </div>
                )}
                <Separator className="my-ds-1" />
                <div className="flex justify-between">
                  <span className="text-base font-bold">Total Amount</span>
                  <span className="text-base font-bold">&#x20B9;{(invoice.totalAmount ?? 0).toLocaleString('en-IN')}</span>
                </div>
                {(invoice.paidAmount ?? 0) > 0 && (
                  <>
                    <div className="flex justify-between text-ds-success text-sm">
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
            </SectionCard>
          </div>
        }
        related={[
          {
            title: 'Payment History',
            action: (
              <Button variant="outline" size="sm" onClick={openPaymentDialog}>
                <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Record Payment
              </Button>
            ),
            content: paymentsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : payments.length === 0 ? (
              <EmptyState title="No payments recorded yet" />
            ) : (
              <div className="flex flex-col">
                <div className="grid grid-cols-[1fr_100px_120px_1fr] gap-ds-3 text-xs font-medium text-ds-foreground-muted px-ds-2 pb-ds-2 border-b border-ds-border">
                  <span>Date</span>
                  <span>Amount</span>
                  <span>Method</span>
                  <span>Reference</span>
                </div>
                {payments.map((payment: any, idx: number) => (
                  <div key={payment.id || idx} className="grid grid-cols-[1fr_100px_120px_1fr] gap-ds-3 items-center px-ds-2 py-ds-2 border-b border-ds-border last:border-0">
                    <span className="text-sm">{new Date(payment.paymentDate || payment.payment_date || payment.date || payment.createdAt || payment.created_at).toLocaleDateString('en-IN')}</span>
                    <span className="text-sm font-medium">&#x20B9;{(payment.amount ?? 0).toLocaleString('en-IN')}</span>
                    <Badge variant="outline" className="text-xs capitalize w-fit">{(payment.paymentMethod || payment.payment_method || payment.method || 'N/A').replace('_', ' ')}</Badge>
                    <span className="text-sm text-ds-foreground-muted truncate">{payment.reference || payment.transactionId || payment.transaction_id || '-'}</span>
                  </div>
                ))}
              </div>
            ),
          },
        ]}
      />

      {/* Payment Dialog */}
      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-ds-4">
            <div className="flex flex-col gap-ds-1">
              <Label>Amount (&#x20B9;)</Label>
              <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Enter payment amount" />
            </div>
            <div className="flex flex-col gap-ds-1">
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
            <div className="flex flex-col gap-ds-1">
              <Label>Reference / Transaction ID</Label>
              <Input value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder="e.g., UTR number" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} disabled={isPaying}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={isPaying}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credit Note Dialog */}
      <Dialog open={creditNoteDialogOpen} onOpenChange={(open) => { setCreditNoteDialogOpen(open); if (!open) resetNoteForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue Credit Note</DialogTitle>
            <DialogDescription>Create a credit note against invoice {invoice.invoiceNumber}.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-ds-4">
            <div className="flex flex-col gap-ds-1">
              <Label>Reason <span className="text-ds-danger">*</span></Label>
              <Input value={noteReason} onChange={(e) => setNoteReason(e.target.value)} placeholder="e.g., Service cancellation, Overcharge correction" />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label>Items</Label>
              {noteItems.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_60px_80px_28px] gap-ds-2 items-center">
                  <Input placeholder="Description" value={item.description} onChange={(e) => updateNoteItem(item.id, 'description', e.target.value)} />
                  <Input type="number" min={1} placeholder="Qty" value={item.quantity} onChange={(e) => updateNoteItem(item.id, 'quantity', parseInt(e.target.value) || 1)} />
                  <Input type="number" min={0} placeholder="Rate" value={item.rate || ''} onChange={(e) => updateNoteItem(item.id, 'rate', parseFloat(e.target.value) || 0)} />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeNoteItem(item.id)} className="text-ds-foreground-muted hover:text-ds-danger">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addNoteItem}>
                <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Add Item
              </Button>
            </div>
            <div className="flex flex-col gap-ds-1">
              <Label>Notes (optional)</Label>
              <Textarea value={noteNotes} onChange={(e) => setNoteNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreditNoteDialogOpen(false); resetNoteForm(); }} disabled={isCreatingNote}>Cancel</Button>
            <Button onClick={handleCreateCreditNote} disabled={isCreatingNote}>Create Credit Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debit Note Dialog */}
      <Dialog open={debitNoteDialogOpen} onOpenChange={(open) => { setDebitNoteDialogOpen(open); if (!open) resetNoteForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Issue Debit Note</DialogTitle>
            <DialogDescription>Create a debit note against invoice {invoice.invoiceNumber}.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-ds-4">
            <div className="flex flex-col gap-ds-1">
              <Label>Reason <span className="text-ds-danger">*</span></Label>
              <Input value={noteReason} onChange={(e) => setNoteReason(e.target.value)} placeholder="e.g., Additional charges, Price adjustment" />
            </div>
            <div className="flex flex-col gap-ds-2">
              <Label>Items</Label>
              {noteItems.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_60px_80px_28px] gap-ds-2 items-center">
                  <Input placeholder="Description" value={item.description} onChange={(e) => updateNoteItem(item.id, 'description', e.target.value)} />
                  <Input type="number" min={1} placeholder="Qty" value={item.quantity} onChange={(e) => updateNoteItem(item.id, 'quantity', parseInt(e.target.value) || 1)} />
                  <Input type="number" min={0} placeholder="Rate" value={item.rate || ''} onChange={(e) => updateNoteItem(item.id, 'rate', parseFloat(e.target.value) || 0)} />
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeNoteItem(item.id)} className="text-ds-foreground-muted hover:text-ds-danger">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addNoteItem}>
                <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Add Item
              </Button>
            </div>
            <div className="flex flex-col gap-ds-1">
              <Label>Notes (optional)</Label>
              <Textarea value={noteNotes} onChange={(e) => setNoteNotes(e.target.value)} placeholder="Additional notes..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDebitNoteDialogOpen(false); resetNoteForm(); }} disabled={isCreatingNote}>Cancel</Button>
            <Button onClick={handleCreateDebitNote} disabled={isCreatingNote}>Create Debit Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </>
  );
}
