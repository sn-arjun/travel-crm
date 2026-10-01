'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Send, Trash2, Plus, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { ListPage } from '@/components/domain';
import { Button, ConfirmDialog, Tag, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { vouchersApi, type Voucher } from '@/lib/api/vouchers';

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'confirmed') return 'success';
  if (status === 'sent') return 'info';
  return 'neutral';
}

function typeTone(type: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (type === 'hotel') return 'info';
  if (type === 'transport') return 'warning';
  if (type === 'flight') return 'neutral';
  return 'success';
}

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportVouchersCsv(rows: Voucher[]) {
  const header = ['Title', 'Type', 'Lead', 'Supplier', 'Status', 'Language', 'Created'];
  const lines = rows.map((v) =>
    [
      v.title,
      v.type,
      v.leadName ?? '',
      v.supplierName ?? '',
      v.status,
      v.language,
      new Date(v.createdAt).toISOString().slice(0, 10),
    ]
      .map(csvEscape)
      .join(','),
  );
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vouchers_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function VouchersPage() {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [pendingDelete, setPendingDelete] = React.useState<Voucher | null>(null);
  // Bumping this re-renders the page, which hands ListPage a fresh fetcher and refetches page 1.
  const [, setRefreshTick] = React.useState(0);

  const activeFilters = [
    typeFilter && { id: 'type', label: 'Type', value: typeFilter },
    statusFilter && { id: 'status', label: 'Status', value: statusFilter },
  ].filter(Boolean) as { id: string; label: string; value: string }[];

  function removeFilter(id: string) {
    if (id === 'type') setTypeFilter('');
    if (id === 'status') setStatusFilter('');
  }

  async function fetchAllFiltered(): Promise<Voucher[]> {
    const all: Voucher[] = [];
    let page = 1;
    const limit = 100;
    for (;;) {
      const res = await vouchersApi.list({
        page,
        limit,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
      });
      const body = (res as any).data;
      const items: Voucher[] = Array.isArray(body) ? body : (body?.data ?? []);
      all.push(...items);
      const total = (res as any).pagination?.total ?? body?.pagination?.total ?? all.length;
      if (all.length >= total || items.length === 0) break;
      page += 1;
    }
    return all;
  }

  return (
    <>
    <ListPage<Voucher>
      title="Vouchers"
      description="Hotel, transport, flight & activity vouchers for your leads."
      getRowId={(v) => v.id}
      fetcher={({ page, limit, search }) =>
        vouchersApi.list({
          page,
          limit,
          search: search || undefined,
          type: typeFilter || undefined,
          status: statusFilter || undefined,
        })
      }
      searchPlaceholder="Search vouchers..."
      columns={[
        {
          key: 'title',
          header: 'Voucher',
          sortable: true,
          cell: (v) => (
            <div>
              <p className="font-medium text-sm">{v.title}</p>
              {v.leadName && <p className="text-xs text-ds-foreground-muted">{v.leadName}</p>}
            </div>
          ),
        },
        {
          key: 'type',
          header: 'Type',
          sortable: true,
          cell: (v) => <Tag tone={typeTone(v.type)}>{v.type}</Tag>,
        },
        {
          key: 'supplier',
          header: 'Supplier',
          cell: (v) => v.supplierName ?? '—',
        },
        {
          key: 'status',
          header: 'Status',
          sortable: true,
          cell: (v) => <Tag tone={statusTone(v.status)}>{v.status}</Tag>,
        },
        {
          key: 'language',
          header: 'Language',
          cell: (v) => v.language?.toUpperCase() ?? 'EN',
        },
        {
          key: 'createdAt',
          header: 'Created',
          sortable: true,
          cell: (v) =>
            new Date(v.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }),
        },
      ]}
      primaryAction={
        <Button size="sm" onClick={() => router.push('/vouchers/new')}>
          <Plus aria-hidden="true" /> New voucher
        </Button>
      }
      headerActions={
        <>
          <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="hotel">Hotel</SelectItem>
              <SelectItem value="transport">Transport</SelectItem>
              <SelectItem value="flight">Flight</SelectItem>
              <SelectItem value="activity">Activity</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
      filters={activeFilters}
      onRemoveFilter={removeFilter}
      onClearFilters={() => { setTypeFilter(''); setStatusFilter(''); }}
      rowActions={(v) => (
        <>
          <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/vouchers/${v.id}`)}>
            <Eye />
          </Button>
          {v.status === 'draft' && (
            <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/vouchers/${v.id}/edit`)}>
              <Pencil />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Send" onClick={() => router.push(`/vouchers/${v.id}`)}>
            <Send />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete"
            onClick={() => setPendingDelete(v)}
          >
            <Trash2 />
          </Button>
        </>
      )}
      onRowClick={(v) => router.push(`/vouchers/${v.id}`)}
      bulkActions={[
        {
          label: 'Delete',
          icon: <Trash2 aria-hidden="true" />,
          destructive: true,
          onSelect: async (rows) => {
            await Promise.all(rows.map((r) => vouchersApi.delete(r.id)));
            toast.success(`${rows.length} voucher(s) deleted`);
            setRefreshTick((n) => n + 1);
          },
        },
      ]}
      onExport={async () => {
        try {
          const rows = await fetchAllFiltered();
          await exportVouchersCsv(rows);
          toast.success('Vouchers exported successfully');
        } catch {
          toast.error('Failed to export vouchers');
        }
      }}
      emptyTitle="No vouchers yet"
      emptyDescription="Create your first voucher to send confirmations to travellers and suppliers."
      emptyIcon={<FileText aria-hidden="true" />}
      emptyAction={
        <Button size="sm" onClick={() => router.push('/vouchers/new')}>
          <Plus aria-hidden="true" /> New voucher
        </Button>
      }
    />
    <ConfirmDialog
      open={pendingDelete !== null}
      onOpenChange={(open) => !open && setPendingDelete(null)}
      title="Delete voucher?"
      description={`"${pendingDelete?.title ?? ''}" will be permanently deleted. This cannot be undone.`}
      confirmLabel="Delete"
      tone="destructive"
      onConfirm={async () => {
        if (!pendingDelete) return;
        try {
          await vouchersApi.delete(pendingDelete.id);
          toast.success('Voucher deleted');
          setRefreshTick((n) => n + 1);
        } catch {
          toast.error('Failed to delete voucher');
        }
      }}
    />
    </>
  );
}
