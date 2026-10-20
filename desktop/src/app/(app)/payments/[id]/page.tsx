'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Receipt, FileText, Trash2 } from 'lucide-react';
import { DetailPage } from '@/components/domain';
import { Badge, Tag, SectionCard, Skeleton, EmptyState, Button, useConfirm } from '@/components/ui';
import { useApiQuery } from '@/hooks/use-api';
import { paymentsApi, type PaymentRecord } from '@/lib/api/payments';
import { contactsApi } from '@/lib/api/contacts';
import { PaymentReceipt } from '@/components/domain/payment-receipt';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { formatDisplayDate } from '@/lib/dates';
import { labelForMethod, methodTone } from '../_methods';

export default function PaymentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const paymentId = params.id as string;
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [showReceipt, setShowReceipt] = React.useState(false);

  const { data: response, loading } = useApiQuery(() => paymentsApi.getById(paymentId), [paymentId]);
  const payment: PaymentRecord | undefined = response?.data ?? undefined;

  const { data: contact } = useApiQuery(
    async () => (payment?.contactId ? (await contactsApi.getById(payment.contactId)).data : null),
    [payment?.contactId],
  );

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

  const money = (amount: number) => formatCurrency(amount, payment.currency ?? undefined);
  const received = formatDisplayDate(payment.paidAt ?? payment.date, 'long');
  const clientName = payment.clientName ?? contact?.name ?? null;

  return (
    <>
      <DetailPage
        entity={payment}
        title={money(payment.amount ?? 0)}
        subtitle={payment.invoiceNumber ? `Against invoice ${payment.invoiceNumber}` : 'Advance payment'}
        status={<Tag tone={methodTone[payment.method] ?? 'neutral'}>{labelForMethod(payment.method)}</Tag>}
        onBack={() => router.push('/payments')}
        messaging={clientName && payment.contactId ? {
          recipientId: payment.contactId,
          recipientName: clientName,
          email: contact?.email ?? undefined,
          phone: contact?.phone ?? undefined,
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
                  <p className="text-sm font-bold text-ds-success">{money(payment.amount ?? 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Date</p>
                  <p className="text-sm font-medium">{received || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Method</p>
                  <Tag tone={methodTone[payment.method] ?? 'neutral'}>{labelForMethod(payment.method)}</Tag>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Reference</p>
                  <p className="text-sm font-medium font-mono">{payment.reference ?? '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Client</p>
                  {payment.contactId && clientName ? (
                    <Link href={`/contacts/${payment.contactId}`} className="text-sm font-medium text-ds-primary hover:underline">
                      {clientName}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{clientName ?? '—'}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-ds-foreground-muted mb-ds-1">Invoice</p>
                  {payment.invoiceId ? (
                    <Link href={`/invoices/${payment.invoiceId}`} className="text-sm font-medium text-ds-primary hover:underline">
                      {payment.invoiceNumber ?? 'View invoice'}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">Advance (no invoice)</p>
                  )}
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
                <FileText aria-hidden="true" />
                Open invoice
              </Button>
            ),
            content: (
              <div className="flex items-center justify-between px-ds-2 py-ds-3">
                <div>
                  <p className="text-sm font-medium font-mono">{payment.invoiceNumber ?? payment.invoiceId}</p>
                  <p className="text-xs text-ds-foreground-muted">{clientName ?? '—'}</p>
                </div>
                <Badge variant="outline">{money(payment.amount ?? 0)}</Badge>
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
            paymentDate: payment.paidAt ?? payment.date ?? undefined,
            paymentMethod: payment.method,
            reference: payment.reference ?? undefined,
            invoiceNumber: payment.invoiceNumber ?? undefined,
            invoiceId: payment.invoiceId ?? undefined,
            clientName: clientName ?? undefined,
          }}
          onClose={() => setShowReceipt(false)}
        />
      )}
      {confirmDialog}
    </>
  );
}
