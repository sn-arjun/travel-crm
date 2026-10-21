'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Download, Printer, FileSpreadsheet, Copy, CreditCard, FileMinus, FilePlus, Plus,
} from 'lucide-react';
import { DetailPage } from '@/components/domain';
import {
  Button, Badge, SectionCard, Separator, Skeleton, EmptyState,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  CurrencyInput, DatePicker, useConfirm,
} from '@/components/ui';
import { PageContainer } from '@/components/layout/page-container';
import { useApiQuery } from '@/hooks/use-api';
import { invoicesApi, type InvoiceDetail } from '@/lib/api/invoices';
import { paymentsApi } from '@/lib/api/payments';
import { contactsApi } from '@/lib/api/contacts';
import { leadsApi } from '@/lib/api/leads';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { formatDisplayDate, toLocalDateString } from '@/lib/dates';
import { buildInvoicePdf, downloadInvoiceCsv, pdfBankLabels } from './_documents';
import { useT } from '@/lib/i18n';
import { paymentMethodLabel, usePaymentMethodOptions } from '@/lib/payment-methods';
import { NoteDialog } from './_note-dialog';
import { PaymentLinkCard } from './_payment-link';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;
  const t = useT();
  const methodOptions = usePaymentMethodOptions();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [payDialogOpen, setPayDialogOpen] = React.useState(false);
  const [payAmount, setPayAmount] = React.useState<number | undefined>(undefined);
  const [payDate, setPayDate] = React.useState<Date | undefined>(new Date());
  const [payMethod, setPayMethod] = React.useState('bank_transfer');
  const [payReference, setPayReference] = React.useState('');
  const [payError, setPayError] = React.useState<string | null>(null);
  const [isPaying, setIsPaying] = React.useState(false);
  const [isVoiding, setIsVoiding] = React.useState(false);
  const [isDuplicating, setIsDuplicating] = React.useState(false);

  const [noteKind, setNoteKind] = React.useState<'credit' | 'debit' | null>(null);

  const { data: invoice, loading, refetch } = useApiQuery<InvoiceDetail | null>(
    () => invoicesApi.getDetail(invoiceId),
    [invoiceId],
  );

  const { data: contact } = useApiQuery(
    async () => (invoice?.contactId ? (await contactsApi.getById(invoice.contactId)).data : null),
    [invoice?.contactId],
  );
  const { data: lead } = useApiQuery(
    async () => (invoice?.leadId ? (await leadsApi.getById(invoice.leadId)).data : null),
    [invoice?.leadId],
  );

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    try {
      const doc = await buildInvoicePdf(invoice, pdfBankLabels(t));
      doc.save(`${invoice.invoiceNumber || 'invoice'}.pdf`);
      toast.success('Invoice PDF downloaded');
    } catch {
      toast.error('Failed to generate PDF');
    }
  };

  const handleDownloadCsv = () => {
    if (!invoice) return;
    downloadInvoiceCsv(invoice);
    toast.success('CSV downloaded');
  };

  const handlePrint = async () => {
    if (!invoice) return;
    try {
      const doc = await buildInvoicePdf(invoice, pdfBankLabels(t));
      const url = URL.createObjectURL(doc.output('blob'));
      const printWindow = window.open(url);
      printWindow?.addEventListener('load', () => printWindow.print());
    } catch {
      toast.error('Failed to open print dialog');
    }
  };

  const openPaymentDialog = () => {
    const balance = invoice?.balanceDue ?? 0;
    setPayAmount(balance > 0 ? balance : invoice?.totalAmount);
    setPayDate(new Date());
    setPayMethod('bank_transfer');
    setPayReference('');
    setPayError(null);
    setPayDialogOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!payAmount || payAmount <= 0) {
      setPayError('Please enter a valid payment amount greater than 0.');
      return;
    }
    if (!payDate) {
      setPayError('Choose the date the payment was received.');
      return;
    }
    setPayError(null);
    setIsPaying(true);
    try {
      await paymentsApi.create({
        invoiceId,
        amount: payAmount,
        date: toLocalDateString(payDate),
        method: payMethod,
        reference: payReference || undefined,
      });
      toast.success('Payment recorded');
      setPayDialogOpen(false);
      await refetch();
    } catch (err) {
      setPayError(errorMessage(err, 'Failed to record payment'));
    } finally {
      setIsPaying(false);
    }
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
      await refetch();
    } catch {
      toast.error('Failed to void invoice');
    } finally {
      setIsVoiding(false);
    }
  };

  const handleDuplicate = async () => {
    setIsDuplicating(true);
    try {
      const result = await invoicesApi.duplicate(invoiceId);
      const created = normalizeCreated(result);
      toast.success(`Invoice duplicated: ${created.invoiceNumber ?? 'New'}`);
      if (created.id) router.push(`/invoices/${created.id}`);
    } catch {
      toast.error('Failed to duplicate invoice');
    } finally {
      setIsDuplicating(false);
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-ds-4" data-testid="invoice-skeleton" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PageContainer>
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

  const money = (amount: number) => formatCurrency(amount, invoice.currency);
  const isEditable = invoice.status === 'draft';
  // Tax lines are the ones stored on the invoice when it was issued (regime, rates, labels)
  const taxLines = invoice.taxBreakdown;
  const addressLine = contact
    ? [contact.address, contact.city, contact.state, contact.country].filter(Boolean).join(', ')
    : '';
  const gstin = invoice.buyerTaxId
    ?? (contact?.customFields
      ? Object.entries(contact.customFields).find(([key]) => /gst/i.test(key))?.[1]
      : undefined);
  const billEmail = contact?.email ?? invoice.contactEmail ?? undefined;
  const billPhone = contact?.phone
    ? `${contact.countryCode ?? ''} ${contact.phone}`.trim()
    : (invoice.contactPhone ?? undefined);

  return (
    <>
      <DetailPage
        assistant={{ entityType: 'invoice', entityId: invoiceId, onChanged: () => void refetch() }}
        entity={invoice}
        title={invoice.invoiceNumber}
        subtitle="Invoice details and payment status"
        status={<Badge variant={invoice.status === 'cancelled' || invoice.status === 'overdue' ? 'destructive' : 'secondary'} className="capitalize">{invoice.status.replace('_', ' ')}</Badge>}
        onBack={() => router.push('/invoices')}
        messaging={{
          recipientId: invoice.contactId,
          recipientName: invoice.contactName || 'Client',
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
          { label: 'Create credit note', icon: <FileMinus aria-hidden="true" />, onSelect: () => setNoteKind('credit'), separatorBefore: true },
          { label: 'Create debit note', icon: <FilePlus aria-hidden="true" />, onSelect: () => setNoteKind('debit') },
          { label: isVoiding ? 'Voiding…' : 'Void invoice', onSelect: handleVoidInvoice, disabled: isVoiding || invoice.status === 'cancelled', destructive: true, separatorBefore: true },
        ]}
        overview={
          <div className="flex flex-col gap-ds-4">
            <SectionCard title="Summary">
              <div className="grid grid-cols-2 gap-ds-4 sm:grid-cols-4">
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Issue Date</p>
                  <p className="text-sm font-medium">{formatDisplayDate(invoice.issueDate) || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Due Date</p>
                  <p className="text-sm font-medium">{formatDisplayDate(invoice.dueDate) || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Amount</p>
                  <p className="text-sm font-bold">{money(invoice.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Balance due</p>
                  <p className="text-sm font-bold">{money(invoice.balanceDue)}</p>
                </div>
              </div>
            </SectionCard>

            <PaymentLinkCard invoice={invoice} contact={{ name: invoice.contactName || contact?.name || 'Client', email: billEmail, phone: invoice.contactPhone ?? contact?.phone }} onChanged={() => void refetch({ silent: true })} />

            <SectionCard title="Bill to">
              <div className="grid gap-ds-4 sm:grid-cols-2" data-testid="invoice-bill-to">
                <div>
                  <p className="text-sm text-ds-foreground-muted">Client</p>
                  <Link href={`/contacts/${invoice.contactId}`} className="text-sm font-medium text-ds-primary hover:underline">
                    {invoice.contactName || contact?.name || 'Unknown contact'}
                  </Link>
                  {contact?.company && <p className="text-sm text-ds-foreground-muted">{contact.company}</p>}
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted">Email</p>
                  <p className="text-sm font-medium">{billEmail ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted">Phone</p>
                  <p className="text-sm font-medium">{billPhone ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted">Address</p>
                  <p className="text-sm font-medium">{addressLine || '—'}</p>
                </div>
                {gstin && (
                  <div>
                    <p className="text-sm text-ds-foreground-muted">{invoice.taxRegime === 'gst' ? 'GSTIN' : 'Tax ID'}</p>
                    <p className="text-sm font-medium font-mono">{gstin}</p>
                  </div>
                )}
              </div>
            </SectionCard>

            {(invoice.leadId || invoice.notes || invoice.terms) && (
              <SectionCard title="Invoice Details">
                <div className="flex flex-col gap-ds-4">
                  {invoice.leadId && (
                    <div>
                      <p className="text-sm text-ds-foreground-muted">Lead</p>
                      <Link href={`/leads/${invoice.leadId}`} className="text-sm font-medium text-ds-primary hover:underline">
                        {lead?.title ?? 'View lead'}
                      </Link>
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

            {invoice.items.length > 0 && (
              <SectionCard title="Line Items">
                <div className="flex flex-col gap-ds-2">
                  <div className="grid grid-cols-[1fr_6rem_4rem_6rem_7rem] gap-ds-3 text-xs font-medium text-ds-foreground-muted px-ds-1 pb-ds-1 border-b border-ds-border">
                    <span>Description</span>
                    <span>HSN/SAC</span>
                    <span>Qty</span>
                    <span>Rate</span>
                    <span className="text-right">Amount</span>
                  </div>
                  {invoice.items.map((item, idx) => (
                    <div key={item.id ?? idx} className="grid grid-cols-[1fr_6rem_4rem_6rem_7rem] gap-ds-3 py-ds-2 border-b border-ds-border last:border-0 items-center">
                      <p className="text-sm font-medium">{item.description}</p>
                      <p className="text-xs text-ds-foreground-muted font-mono">{item.hsnCode ?? '—'}</p>
                      <p className="text-sm text-ds-foreground-muted">{item.quantity}</p>
                      <p className="text-sm text-ds-foreground-muted">{money(item.rate)}</p>
                      <p className="text-sm font-medium text-right">{money(item.amount)}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            <SectionCard title="Totals">
              <div className="flex flex-col gap-ds-2 max-w-xs ml-auto">
                <div className="flex justify-between text-sm">
                  <span className="text-ds-foreground-muted">Subtotal</span>
                  <span className="font-medium">{money(invoice.subtotal)}</span>
                </div>
                {invoice.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-ds-danger">
                    <span>
                      Discount{invoice.discountType === 'percentage' ? ` (${invoice.discountValue}%)` : ''}
                    </span>
                    <span className="font-medium">-{money(invoice.discountAmount)}</span>
                  </div>
                )}
                {taxLines.map((line) => (
                  <div key={line.code + line.rate} className="flex justify-between text-sm text-ds-foreground-muted" data-testid="invoice-tax-line">
                    <span>{line.label} ({line.rate}%)</span>
                    <span>{money(line.amount)}</span>
                  </div>
                ))}
                {taxLines.length === 0 && invoice.totalTax > 0 && (
                  <div className="flex justify-between text-sm text-ds-foreground-muted">
                    <span>Tax</span>
                    <span>{money(invoice.totalTax)}</span>
                  </div>
                )}
                {invoice.taxNotes.map((note) => (
                  <p key={note} className="text-xs text-ds-foreground-muted" data-testid="invoice-tax-note">{note}</p>
                ))}
                <Separator className="my-ds-1" />
                <div className="flex justify-between">
                  <span className="text-base font-bold">Total Amount</span>
                  <span className="text-base font-bold">{money(invoice.totalAmount)}</span>
                </div>
                {invoice.paidAmount > 0 && (
                  <>
                    <div className="flex justify-between text-ds-success text-sm">
                      <span>Paid</span>
                      <span className="font-medium">{money(invoice.paidAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold">
                      <span>Balance Due</span>
                      <span>{money(invoice.balanceDue)}</span>
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
                <Plus aria-hidden="true" />
                Record Payment
              </Button>
            ),
            content: invoice.payments.length === 0 ? (
              <EmptyState title="No payments recorded yet" />
            ) : (
              <div className="flex flex-col">
                <div className="grid grid-cols-[8rem_8rem_8rem_1fr] gap-ds-3 text-xs font-medium text-ds-foreground-muted px-ds-2 pb-ds-2 border-b border-ds-border">
                  <span>Date</span>
                  <span>Amount</span>
                  <span>Method</span>
                  <span>Reference</span>
                </div>
                {invoice.payments.map((payment, idx) => (
                  <div key={payment.id || idx} className="grid grid-cols-[8rem_8rem_8rem_1fr] gap-ds-3 items-center px-ds-2 py-ds-2 border-b border-ds-border last:border-0">
                    <span className="text-sm">{formatDisplayDate(payment.date) || '—'}</span>
                    <span className="text-sm font-medium">{money(payment.amount)}</span>
                    <Badge variant="outline" className="w-fit text-xs">{paymentMethodLabel(payment.method, t)}</Badge>
                    <span className="text-sm text-ds-foreground-muted truncate">{payment.reference ?? '—'}</span>
                  </div>
                ))}
              </div>
            ),
          },
        ]}
      />

      <Dialog open={payDialogOpen} onOpenChange={setPayDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Balance due on {invoice.invoiceNumber}: {money(invoice.balanceDue)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-ds-4">
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="invoice-pay-amount">Amount</Label>
              <CurrencyInput
                id="invoice-pay-amount"
                value={payAmount}
                onChange={setPayAmount}
                currency={invoice.currency}
                placeholder="Enter payment amount"
                aria-invalid={payError && !(payAmount && payAmount > 0) ? true : undefined}
              />
            </div>
            <div className="flex flex-col gap-ds-1">
              <Label>Payment Date</Label>
              <DatePicker value={payDate} onChange={setPayDate} maxDate={new Date()} />
            </div>
            <div className="flex flex-col gap-ds-1">
              <Label>Payment Method</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger aria-label="Payment method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {methodOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-ds-1">
              <Label htmlFor="invoice-pay-reference">Reference / Transaction ID</Label>
              <Input id="invoice-pay-reference" value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder="e.g., UTR number" />
            </div>
            {payError && (
              <p role="alert" className="text-sm text-ds-danger">{payError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogOpen(false)} disabled={isPaying}>Cancel</Button>
            <Button onClick={handleRecordPayment} disabled={isPaying}>Record Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NoteDialog
        kind="credit"
        open={noteKind === 'credit'}
        onOpenChange={(open) => setNoteKind(open ? 'credit' : null)}
        invoiceId={invoiceId}
        invoiceNumber={invoice.invoiceNumber}
        currency={invoice.currency}
        onCreated={() => void refetch()}
      />
      <NoteDialog
        kind="debit"
        open={noteKind === 'debit'}
        onOpenChange={(open) => setNoteKind(open ? 'debit' : null)}
        invoiceId={invoiceId}
        invoiceNumber={invoice.invoiceNumber}
        currency={invoice.currency}
        onCreated={() => void refetch()}
      />

      {confirmDialog}
    </>
  );
}

/** POST /invoices/:id/duplicate answers with a bare row (snake_case) or a camelCase entity. */
function normalizeCreated(result: unknown): { id?: string; invoiceNumber?: string } {
  const body = (result as { data?: unknown } | null)?.data;
  if (!body || typeof body !== 'object') return {};
  const row = body as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id : undefined;
  const number = row.invoiceNumber ?? row.invoice_number;
  return { id, invoiceNumber: typeof number === 'string' ? number : undefined };
}
