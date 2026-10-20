'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FilePlus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import { Button, Tag, useConfirm } from '@/components/ui';
import { useApiMutation } from '@/hooks/use-api';
import { debitNotesApi, type CreditNote } from '@/lib/api/credit-notes';
import type { PaginatedResponse } from '@/lib/api/client';
import { formatDisplayDate, toLocalDateString } from '@/lib/dates';
import { formatCurrency as formatMoney } from '@/lib/utils';

function formatCurrency(amount: number) {
  return formatMoney(amount);
}

function statusTone(status: string): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' {
  if (status === 'applied') return 'success';
  if (status === 'issued') return 'primary';
  return 'neutral';
}

function toCsv(rows: CreditNote[]) {
  const header = ['Note #', 'Contact', 'Subtotal', 'Tax', 'Total', 'Status', 'Created'];
  const lines = rows.map((n) => [
    n.invoiceNumber ?? '',
    n.contactName ?? '',
    n.subtotal,
    n.totalTax,
    n.total,
    n.status,
    n.createdAt ? toLocalDateString(new Date(n.createdAt)) : '',
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [header.join(','), ...lines].join('\n');
}

export default function DebitNotesPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const { mutate: applyNote } = useApiMutation(
    ({ id, amount }: { id: string; amount: number }) => debitNotesApi.apply(id, { amount }),
  );

  const handleApply = async (note: CreditNote) => {
    const ok = await confirm({
      title: 'Apply debit note',
      description: `Apply debit note ${note.invoiceNumber} of ${formatCurrency(note.total)} to the linked invoice? This changes the invoice balance.`,
      confirmLabel: 'Apply',
    });
    if (!ok) return;
    try {
      await applyNote({ id: note.id, amount: note.total });
      toast.success('Debit note applied successfully');
    } catch {
      toast.error('Failed to apply debit note');
    }
  };

  return (
    <>
    <ListPage<CreditNote>
      title="Debit Notes"
      description="Debits issued against invoices."
      getRowId={(n) => n.id}
      fetcher={({ page, limit, search }) => debitNotesApi.list({ page, limit, search: search || undefined })}
      searchPlaceholder="Search debit notes..."
      columns={[
        { key: 'invoiceNumber', header: 'Note #', sortable: true, cell: (n) => <span className="font-mono">{n.invoiceNumber ?? '—'}</span> },
        { key: 'contactName', header: 'Contact', cell: (n) => n.contactName ?? 'N/A' },
        { key: 'total', header: 'Total', align: 'right', sortable: true, cell: (n) => formatCurrency(n.total) },
        { key: 'status', header: 'Status', cell: (n) => <Tag tone={statusTone(n.status)}>{n.status}</Tag> },
        {
          key: 'createdAt', header: 'Created', sortable: true,
          cell: (n) => formatDisplayDate(n.createdAt) || '—',
        },
      ]}
      primaryAction={
        <Button size="sm" onClick={() => router.push('/debit-notes/new')}>
          <Plus aria-hidden="true" /> New debit note
        </Button>
      }
      rowActions={(n) =>
        n.status === 'issued' ? (
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleApply(n); }}>
            Apply
          </Button>
        ) : null
      }
      renderDetail={(n) => (
        <div className="space-y-ds-4">
          <div className="grid grid-cols-2 gap-ds-3 text-sm">
            <div>
              <p className="text-ds-foreground-subtle text-xs mb-ds-1">Contact</p>
              <p className="font-medium">{n.contactName ?? '—'}</p>
            </div>
            <div>
              <p className="text-ds-foreground-subtle text-xs mb-ds-1">Status</p>
              <Tag tone={statusTone(n.status)}>{n.status}</Tag>
            </div>
            <div>
              <p className="text-ds-foreground-subtle text-xs mb-ds-1">Subtotal</p>
              <p className="font-medium">{formatCurrency(n.subtotal)}</p>
            </div>
            <div>
              <p className="text-ds-foreground-subtle text-xs mb-ds-1">Tax</p>
              <p className="font-medium">{formatCurrency(n.totalTax)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-ds-foreground-subtle text-xs mb-ds-1">Total</p>
              <p className="text-lg font-bold">{formatCurrency(n.total)}</p>
            </div>
            {n.notes && (
              <div className="col-span-2">
                <p className="text-ds-foreground-subtle text-xs mb-ds-1">Notes</p>
                <p className="text-sm">{n.notes}</p>
              </div>
            )}
            <div className="col-span-2">
              <p className="text-ds-foreground-subtle text-xs mb-ds-1">Created</p>
              <p className="font-medium">{formatDisplayDate(n.createdAt) || '—'}</p>
            </div>
          </div>
          {n.status === 'issued' && (
            <Button className="w-full" onClick={() => handleApply(n)}>
              Apply to Invoice
            </Button>
          )}
        </div>
      )}
      detailTitle={(n) => n.invoiceNumber ?? 'Debit Note'}
      bulkActions={[
        {
          label: 'Apply',
          onSelect: async (rows) => {
            const issued = rows.filter((r) => r.status === 'issued');
            await Promise.all(issued.map((r) => applyNote({ id: r.id, amount: r.total })));
            toast.success(`Applied ${issued.length} debit note(s)`);
          },
        },
      ]}
      onExport={async (rows) => {
        try {
          const all: CreditNote[] = [];
          let page = 1;
          const limit = 200;
          let total = Infinity;
          while (all.length < total) {
            const res: PaginatedResponse<CreditNote> = await debitNotesApi.list({ page, limit });
            all.push(...res.data);
            total = res.pagination.total;
            if (res.data.length === 0) break;
            page += 1;
          }
          const csv = toCsv(all.length > 0 ? all : rows);
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `debit-notes_${toLocalDateString(new Date())}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success('Debit notes exported');
        } catch {
          toast.error('Failed to export debit notes');
        }
      }}
      emptyIcon={<FilePlus className="h-12 w-12 text-ds-foreground-subtle" />}
      emptyTitle="No debit notes yet"
      emptyDescription="Debit notes are issued against invoices."
      emptyAction={
        <Button size="sm" onClick={() => router.push('/debit-notes/new')}>
          <Plus aria-hidden="true" /> New debit note
        </Button>
      }
    />
    {confirmDialog}
    </>
  );
}
