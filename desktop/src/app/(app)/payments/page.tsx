'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Eye, Trash2, Receipt, DollarSign } from 'lucide-react';
import { ListPage, type ListFilter } from '@/components/domain';
import { Button, Tag, useConfirm, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { toast } from 'sonner';
import { paymentsApi } from '@/lib/api/payments';
import { PaymentReceipt } from '@/components/domain/payment-receipt';
import type { Payment } from '@travelcrm/shared';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

// Payment dates are date-only strings (YYYY-MM-DD); parse them as local dates so
// the displayed day does not shift with the viewer's timezone.
function parsePaymentDate(value: string): Date {
  const m = /^(d{4})-(d{2})-(d{2})/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

const methodTone: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = {
  bank_transfer: 'info',
  transfer: 'info',
  upi: 'info',
  cash: 'success',
  card: 'warning',
  cheque: 'neutral',
  check: 'neutral',
};

const methodLabel: Record<string, string> = {
  bank_transfer: 'Bank Transfer', transfer: 'Bank Transfer', upi: 'UPI',
  cash: 'Cash', card: 'Card', cheque: 'Cheque', check: 'Cheque', other: 'Other',
};

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
  const [receiptPayment, setReceiptPayment] = React.useState<any>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  // Stable identity: ListPage refetches whenever the fetcher changes, so refreshKey
  // is how mutations force a reload.
  const fetcher = React.useCallback(
    ({ page, limit, search }: { page: number; limit: number; search: string; filters: ListFilter[] }) =>
      paymentsApi.list({ page, limit, search: search || undefined, paymentMethod: methodFilter ?? undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [methodFilter, refreshKey],
  );

  const handleDelete = async (payment: any) => {
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
      <ListPage<Payment>
        title="Payments"
        description="Every payment recorded against an invoice."
        getRowId={(p) => p.id}
        fetcher={fetcher}
        extractItems={(r) => ((r as any)?.data as Payment[]) ?? []}
        extractTotal={(r) => (r as any)?.pagination?.total ?? 0}
        searchPlaceholder="Search payments..."
        filters={methodFilter ? [{ id: 'method', label: 'Method', value: methodLabel[methodFilter] ?? methodFilter }] : []}
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
            cell: (p: any) => {
              const d = p.paidAt ?? p.paymentDate ?? p.date;
              return d ? parsePaymentDate(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
            },
          },
          {
            key: 'invoiceNumber', header: 'Invoice #',
            cell: (p: any) => p.invoiceNumber ?? p.invoice?.invoiceNumber ?? '—',
          },
          {
            key: 'clientName', header: 'Client',
            cell: (p: any) => p.clientName ?? p.invoice?.contactName ?? 'N/A',
          },
          {
            key: 'amount', header: 'Amount', align: 'right', sortable: true,
            cell: (p: any) => <span className="font-medium text-ds-success">{formatCurrency(p.amount ?? 0)}</span>,
          },
          {
            key: 'method', header: 'Method',
            cell: (p: any) => {
              const m = p.method ?? p.paymentMethod ?? '';
              return <Tag tone={methodTone[m] ?? 'neutral'}>{methodLabel[m] ?? m}</Tag>;
            },
          },
          {
            key: 'reference', header: 'Reference',
            cell: (p: any) => <span className="font-mono text-sm text-ds-foreground-muted">{p.reference ?? '—'}</span>,
          },
        ]}
        primaryAction={
          <Button size="sm" onClick={() => router.push('/payments/new')}>
            <Plus aria-hidden="true" /> Record payment
          </Button>
        }
        rowActions={(p: any) => (
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
          const csvRows = rows.map((p: any) => [
            p.paidAt ?? p.paymentDate ?? p.date ?? '',
            p.invoiceNumber ?? p.invoice?.invoiceNumber ?? '',
            p.clientName ?? p.invoice?.contactName ?? '',
            String(p.amount ?? 0),
            methodLabel[p.method ?? p.paymentMethod ?? ''] ?? (p.method ?? p.paymentMethod ?? ''),
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
        <PaymentReceipt payment={receiptPayment} onClose={() => setReceiptPayment(null)} />
      )}
      {confirmDialog}
    </>
  );
}
