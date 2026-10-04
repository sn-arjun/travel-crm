'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Trash2, Plus, Send, Download, DollarSign } from 'lucide-react';
import { ListPage } from '@/components/domain';
import {
  Button, Tag, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useConfirm,
} from '@/components/ui';
import { SendMessageDialog } from '@/components/communication/send-message-dialog';
import { invoicesApi } from '@/lib/api/invoices';
import { exportsApi } from '@/lib/api/exports';
import { toast } from 'sonner';
import { unwrapList } from '@/lib/api/envelope';
import type { Invoice } from '@travelcrm/shared';

function formatCurrency(amount: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

async function downloadInvoicesZip(invoiceIds: string[]) {
  const queued = await exportsApi.invoicesBulkPdf({ invoiceIds });
  const jobId = (queued as any)?.data?.id;
  if (!jobId) throw new Error('Export job was not created');

  let job = (queued as any).data;
  const deadline = Date.now() + 30_000;
  while (job.status !== 'completed' && job.status !== 'failed' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const statusRes = await exportsApi.getJobStatus(jobId);
    job = (statusRes as any).data;
  }
  if (job.status !== 'completed') throw new Error('Export did not complete in time');

  const blob = await exportsApi.downloadJob(jobId) as unknown as Blob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoices_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'paid') return 'success';
  if (status === 'overdue' || status === 'cancelled') return 'danger';
  if (status === 'partially_paid') return 'warning';
  if (status === 'sent') return 'info';
  return 'neutral';
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', partially_paid: 'Partial', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled',
};

export default function InvoicesPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [statusFilter, setStatusFilter] = React.useState('');
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [msgDialogOpen, setMsgDialogOpen] = React.useState(false);
  const [msgContact, setMsgContact] = React.useState<{ id: string; name: string; email?: string | null; phone?: string | null }>({ id: '', name: '' });

  const activeFilters = [
    statusFilter && { id: 'status', label: 'Status', value: STATUS_LABELS[statusFilter] ?? statusFilter },
  ].filter(Boolean) as { id: string; label: string; value: string }[];

  function normalize(inv: any) {
    return {
      ...inv,
      invoiceNumber: inv.invoiceNumber || inv.invoice_number,
      totalAmount: inv.totalAmount ?? inv.total ?? 0,
      paidAmount: inv.paidAmount ?? inv.paid_amount ?? 0,
      balanceDue: inv.balanceDue ?? inv.balance_due ?? ((inv.totalAmount ?? inv.total ?? 0) - (inv.paidAmount ?? inv.paid_amount ?? 0)),
      issueDate: inv.issueDate || inv.issue_date || inv.created_at,
      dueDate: inv.dueDate || inv.due_date,
      clientName: inv.clientName || inv.contactName || inv.contact_name || 'N/A',
      contactEmail: inv.contactEmail ?? inv.contact_email ?? null,
      contactPhone: inv.contactPhone ?? inv.contact_phone ?? null,
      contactId: inv.contactId ?? inv.contact_id ?? '',
    };
  }

  function openSendMessage(inv: any) {
    setMsgContact({
      id: inv.contactId || '',
      name: inv.clientName,
      email: inv.contactEmail,
      phone: inv.contactPhone,
    });
    setMsgDialogOpen(true);
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: 'Delete invoice',
      description: 'This permanently removes the invoice. This action cannot be undone.',
      tone: 'destructive',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      await invoicesApi.delete(id);
      toast.success('Invoice deleted');
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete invoice');
    }
  }

  return (
    <>
      <ListPage<Invoice>
        title="Invoices"
        description="Track billing, payments, and outstanding balances."
        getRowId={(inv: any) => inv.id}
        refreshKey={refreshKey}
        fetcher={async ({ page, limit, search }) => {
          const res = unwrapList<Invoice>(
            await invoicesApi.list({ page, limit, search: search || undefined, status: statusFilter || undefined }),
          );
          return { ...res, data: res.data.map(normalize) };
        }}
        searchPlaceholder="Search invoices, clients..."
        columns={[
          { key: 'invoiceNumber', header: 'Invoice #', sortable: true, cell: (inv: any) => <span className="font-mono text-sm font-medium">{inv.invoiceNumber ?? '—'}</span> },
          { key: 'clientName', header: 'Client', cell: (inv: any) => <span className="text-sm font-medium">{inv.clientName}</span> },
          { key: 'issueDate', header: 'Issue Date', sortable: true, cell: (inv: any) => inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—' },
          { key: 'dueDate', header: 'Due Date', sortable: true, cell: (inv: any) => inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—' },
          { key: 'totalAmount', header: 'Amount', align: 'right', sortable: true, cell: (inv: any) => formatCurrency(inv.totalAmount, inv.currency) },
          { key: 'balanceDue', header: 'Balance', align: 'right', cell: (inv: any) => (
              <span className={inv.balanceDue > 0 ? 'text-ds-warning' : 'text-ds-success'}>{formatCurrency(inv.balanceDue, inv.currency)}</span>
            ) },
          { key: 'status', header: 'Status', sortable: true, cell: (inv: any) => <Tag tone={statusTone(inv.status)}>{STATUS_LABELS[inv.status] ?? inv.status}</Tag> },
        ]}
        primaryAction={
          <Button size="sm" onClick={() => router.push('/invoices/new')}>
            <Plus aria-hidden="true" /> New invoice
          </Button>
        }
        headerActions={
          <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        filters={activeFilters}
        onRemoveFilter={() => setStatusFilter('')}
        onClearFilters={() => setStatusFilter('')}
        rowActions={(inv: any) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/invoices/${inv.id}`)}>
              <Eye />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/invoices/${inv.id}/edit`)}>
              <Pencil />
            </Button>
            {inv.contactEmail && (
              <Button variant="ghost" size="icon-sm" aria-label="Send" onClick={() => openSendMessage(inv)}>
                <Send />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" aria-label="Record payment" onClick={() => router.push(`/invoices/${inv.id}?tab=payments`)}>
              <DollarSign />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => handleDelete(inv.id)}>
              <Trash2 />
            </Button>
          </>
        )}
        onRowClick={(inv: any) => router.push(`/invoices/${inv.id}`)}
        bulkActions={[
          {
            label: 'Download PDFs',
            icon: <Download aria-hidden="true" />,
            onSelect: async (rows) => {
              try {
                await downloadInvoicesZip(rows.map((r: any) => r.id));
                toast.success(`Downloaded ${rows.length} invoice(s)`);
              } catch {
                toast.error('Failed to download invoices');
              }
            },
          },
          {
            label: 'Delete',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              const ok = await confirm({
                title: 'Delete invoices',
                description: `This permanently removes ${rows.length} invoice(s). This action cannot be undone.`,
                tone: 'destructive',
                confirmLabel: 'Delete',
              });
              if (!ok) return;
              await Promise.all(rows.map((r: any) => invoicesApi.delete(r.id)));
              toast.success(`${rows.length} invoice(s) deleted`);
              setRefreshKey((k) => k + 1);
            },
          },
        ]}
        onExport={async (rows) => {
          try {
            await downloadInvoicesZip(rows.map((r: any) => r.id));
            toast.success('Invoices exported');
          } catch {
            toast.error('Failed to export invoices');
          }
        }}
        emptyTitle="No invoices yet"
        emptyDescription="Create your first invoice to start billing clients."
        emptyAction={
          <Button size="sm" onClick={() => router.push('/invoices/new')}>
            <Plus aria-hidden="true" /> New invoice
          </Button>
        }
      />

      <SendMessageDialog
        open={msgDialogOpen}
        onOpenChange={setMsgDialogOpen}
        contact={msgContact}
        defaultChannel="email"
      />

      {confirmDialog}
    </>
  );
}
