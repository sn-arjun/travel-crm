'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Eye, Trash2, Receipt, DollarSign } from 'lucide-react';
import { ListPage, type ListFilter } from '@/components/domain';
import { Button, Tag, useConfirm, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { toast } from 'sonner';
import { paymentsApi, type PaymentRecord } from '@/lib/api/payments';
import { unwrapList } from '@/lib/api/envelope';
import { PaymentReceipt } from '@/components/domain/payment-receipt';
import { formatCurrency } from '@/lib/utils';
import { formatDisplayDate } from '@/lib/dates';
import { labelForMethod, methodTone } from './_methods';

const METHOD_FILTERS = [
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Cheque' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi', label: 'UPI' },
  { value: 'other', label: 'Other' },
];

export default function PaymentsPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [methodFilter, setMethodFilter] = React.useState<string | null>(null);
  const [receiptPayment, setReceiptPayment] = React.useState<PaymentRecord | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  // Stable identity: ListPage refetches whenever the fetcher changes, so refreshKey
  // is how mutations force a reload.
  const fetcher = React.useCallback(
    async ({ page, limit, search }: { page: number; limit: number; search: string; filters: ListFilter[] }) =>
      unwrapList<PaymentRecord>(
        await paymentsApi.list({ page, limit, search: search || undefined, paymentMethod: methodFilter ?? undefined }),
        { page, limit },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [methodFilter, refreshKey],
  );

  const handleDelete = async (payment: PaymentRecord) => {
    const ok = await confirm({
      title: 'Delete payment',
      description: 'This will reverse the payment on the linked invoice. This action cannot be undone.',
      tone: 'destructive',
      confirmLabel: 'Delete payment',
    });
    if (!ok) return;
    try {
      await paymentsApi.delete(payment.id);
      toast.success('Payment deleted');
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete payment');
    }
  };

  return (
    <>
      <ListPage<PaymentRecord>
        title="Payments"
        description="Every payment recorded against an invoice."
        getRowId={(p) => p.id}
        fetcher={fetcher}
        refreshKey={refreshKey}
        searchPlaceholder="Search payments..."
        filters={methodFilter ? [{ id: 'method', label: 'Method', value: labelForMethod(methodFilter) }] : []}
        headerActions={
          <Select value={methodFilter ?? 'all'} onValueChange={(v) => setMethodFilter(v === 'all' ? null : v)}>
            <SelectTrigger size="sm" aria-label="Filter by method" className="w-44">
              <SelectValue placeholder="All methods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All methods</SelectItem>
              {METHOD_FILTERS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        onRemoveFilter={() => setMethodFilter(null)}
        onClearFilters={() => setMethodFilter(null)}
        columns={[
          {
            key: 'date', header: 'Date', sortable: true,
            cell: (p) => formatDisplayDate(p.paidAt ?? p.date) || '—',
          },
          {
            key: 'invoiceNumber', header: 'Invoice #',
            cell: (p) => p.invoiceNumber ?? '—',
          },
          {
            key: 'clientName', header: 'Client',
            cell: (p) => p.clientName ?? '—',
          },
          {
            key: 'amount', header: 'Amount', align: 'right', sortable: true,
            cell: (p) => <span className="font-medium text-ds-success">{formatCurrency(p.amount ?? 0, p.currency ?? 'INR')}</span>,
          },
          {
            key: 'method', header: 'Method',
            cell: (p) => <Tag tone={methodTone[p.method] ?? 'neutral'}>{labelForMethod(p.method)}</Tag>,
          },
          {
            key: 'reference', header: 'Reference',
            cell: (p) => <span className="font-mono text-sm text-ds-foreground-muted">{p.reference ?? '—'}</span>,
          },
        ]}
        primaryAction={
          <Button size="sm" onClick={() => router.push('/payments/new')}>
            <Plus aria-hidden="true" /> Record payment
          </Button>
        }
        rowActions={(p) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/payments/${p.id}`)}>
              <Eye aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Receipt" onClick={() => setReceiptPayment(p)}>
              <Receipt aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => handleDelete(p)}>
              <Trash2 aria-hidden="true" />
            </Button>
          </>
        )}
        onRowClick={(p) => router.push(`/payments/${p.id}`)}
        bulkActions={[
          {
            label: 'Delete', destructive: true, icon: <Trash2 aria-hidden="true" />,
            onSelect: async (rows) => {
              const ok = await confirm({
                title: `Delete ${rows.length} payment${rows.length === 1 ? '' : 's'}`,
                description: 'This will reverse each payment on its linked invoice. This action cannot be undone.',
                tone: 'destructive',
                confirmLabel: 'Delete',
              });
              if (!ok) return;
              await Promise.all(rows.map((r) => paymentsApi.delete(r.id)));
              toast.success('Payments deleted');
              setRefreshKey((k) => k + 1);
            },
          },
        ]}
        onExport={async (rows) => {
          const header = ['Date', 'Invoice #', 'Client', 'Amount', 'Method', 'Reference'];
          const csvRows = rows.map((p) => [
            p.paidAt ?? p.date ?? '',
            p.invoiceNumber ?? '',
            p.clientName ?? '',
            String(p.amount ?? 0),
            labelForMethod(p.method),
            p.reference ?? '',
          ]);
          const csv = [header, ...csvRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'payments.csv';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          toast.success('CSV downloaded');
        }}
        exportLabel="Export CSV"
        emptyTitle="No payments yet"
        emptyDescription="Record your first payment against an outstanding invoice."
        emptyIcon={<DollarSign aria-hidden="true" />}
        emptyAction={
          <Button size="sm" onClick={() => router.push('/payments/new')}>
            <Plus aria-hidden="true" /> Record payment
          </Button>
        }
      />

      {receiptPayment && (
        <PaymentReceipt
          payment={{
            id: receiptPayment.id,
            amount: receiptPayment.amount,
            date: receiptPayment.paidAt ?? receiptPayment.date ?? undefined,
            method: receiptPayment.method,
            reference: receiptPayment.reference ?? undefined,
            invoiceNumber: receiptPayment.invoiceNumber ?? undefined,
            clientName: receiptPayment.clientName ?? undefined,
          }}
          onClose={() => setReceiptPayment(null)}
        />
      )}
      {confirmDialog}
    </>
  );
}
