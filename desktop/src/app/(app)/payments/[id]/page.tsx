'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Receipt, FileText, Trash2 } from 'lucide-react';
import { DetailPage } from '@/components/domain';
import { Badge, Tag, SectionCard, Skeleton, EmptyState, Button, useConfirm } from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { paymentsApi } from '@/lib/api/payments';
import { PaymentReceipt } from '@/components/domain/payment-receipt';
import { toast } from 'sonner';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
}

// Payment dates are date-only strings (YYYY-MM-DD); parse them as local dates so
// the displayed day does not shift with the viewer's timezone.
function parsePaymentDate(value: string): Date {
  const m = /^(d{4})-(d{2})-(d{2})/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

const methodTone: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = {
  bank_transfer: 'info', transfer: 'info', upi: 'info',
  cash: 'success', card: 'warning', cheque: 'neutral', check: 'neutral',
};

const methodLabel: Record<string, string> = {
  bank_transfer: 'Bank Transfer', transfer: 'Bank Transfer', upi: 'UPI',
  cash: 'Cash', card: 'Card', cheque: 'Cheque', check: 'Cheque', other: 'Other',
};

export default function PaymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const paymentId = params.id as string;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [showReceipt, setShowReceipt] = React.useState(false);

  const { data: response, loading } = useApiQuery<any>(
    () => paymentsApi.getById(paymentId),
    [paymentId],
  );

  const raw = response?.data as any;
  const payment = raw ? {
    ...raw,
    method: raw.method ?? raw.paymentMethod,
    paidAt: raw.paidAt ?? raw.paymentDate ?? raw.date,
    invoiceNumber: raw.invoiceNumber ?? raw.invoice?.invoiceNumber,
    invoiceId: raw.invoiceId ?? raw.invoice?.id,
    clientName: raw.clientName ?? raw.invoice?.contactName,
    clientEmail: raw.clientEmail ?? raw.invoice?.contactEmail,
    clientPhone: raw.clientPhone ?? raw.invoice?.contactPhone,
    recordedBy: raw.recordedBy ?? raw.createdBy,
  } : undefined;

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete payment',
      description: 'This will reverse the payment on the linked invoice. This action cannot be undone.',
      tone: 'destructive',
      confirmLabel: 'Delete payment',
    });
    if (!ok) return;
    try {
      await paymentsApi.delete(paymentId);
      toast.success('Payment deleted');
      router.push('/payments');
    } catch {
      toast.error('Failed to delete payment');
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

  if (!payment) {
    return (
      <EmptyState
        title="Payment not found"
        description="This payment may have been removed."
        action={<Button variant="outline" onClick={() => router.push('/payments')}>Back to payments</Button>}
      />
    );
  }

  return (
    <>
      <DetailPage
        entity={payment}
        title={formatCurrency(payment.amount ?? 0)}
        subtitle={payment.invoiceNumber ? `Against invoice ${payment.invoiceNumber}` : 'Advance payment'}
        status={<Tag tone={methodTone[payment.method] ?? 'neutral'}>{methodLabel[payment.method] ?? payment.method}</Tag>}
        onBack={() => router.push('/payments')}
        messaging={payment.clientName ? {
          recipientId: payment.invoice?.contactId ?? '',
          recipientName: payment.clientName,
          email: payment.clientEmail ?? undefined,
          phone: payment.clientPhone ?? undefined,
        } : undefined}
        actions={[
          { label: 'View invoice', icon: <FileText aria-hidden="true" />, onSelect: () => router.push(`/invoices/${payment.invoiceId}`), disabled: !payment.invoiceId },
          { label: 'Download receipt', icon: <Receipt aria-hidden="true" />, onSelect: () => setShowReceipt(true) },
          { label: 'Delete payment', icon: <Trash2 aria-hidden="true" />, onSelect: handleDelete, destructive: true, separatorBefore: true },
        ]}
        overview={
          <div className="flex flex-col gap-ds-4">
            <SectionCard title="Payment details">
              <div className="grid grid-cols-2 gap-ds-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Amount</p>
                  <p className="text-sm font-bold text-ds-success">{formatCurrency(payment.amount ?? 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Date</p>
                  <p className="text-sm font-medium">{payment.paidAt ? parsePaymentDate(payment.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Method</p>
                  <Tag tone={methodTone[payment.method] ?? 'neutral'}>{methodLabel[payment.method] ?? payment.method}</Tag>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Reference</p>
                  <p className="text-sm font-medium font-mono">{payment.reference ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Client</p>
                  <p className="text-sm font-medium">{payment.clientName ?? 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Recorded by</p>
                  <p className="text-sm font-medium">{payment.recordedBy ?? 'N/A'}</p>
                </div>
              </div>
            </SectionCard>

            {payment.notes && (
              <SectionCard title="Notes">
                <p className="text-sm">{payment.notes}</p>
              </SectionCard>
            )}
          </div>
        }
        related={payment.invoiceId ? [
          {
            title: 'Linked invoice',
            action: (
              <Button variant="outline" size="sm" onClick={() => router.push(`/invoices/${payment.invoiceId}`)}>
                <FileText className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Open invoice
              </Button>
            ),
            content: (
              <div className="flex items-center justify-between px-ds-2 py-ds-3">
                <div>
                  <p className="text-sm font-medium font-mono">{payment.invoiceNumber ?? payment.invoiceId}</p>
                  <p className="text-xs text-ds-foreground-muted">{payment.clientName ?? 'N/A'}</p>
                </div>
                <Badge variant="outline">{formatCurrency(payment.amount ?? 0)}</Badge>
              </div>
            ),
          },
        ] : undefined}
      />

      {showReceipt && (
        <PaymentReceipt
          payment={{
            id: payment.id,
            amount: payment.amount,
            paymentDate: payment.paidAt,
            paymentMethod: payment.method,
            reference: payment.reference,
            invoiceNumber: payment.invoiceNumber,
            invoiceId: payment.invoiceId,
            clientName: payment.clientName,
            recordedBy: payment.recordedBy,
          }}
          onClose={() => setShowReceipt(false)}
        />
      )}
      {confirmDialog}
    </>
  );
}
