'use client';


import { formatLocaleDate } from '@/lib/format';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';

import { ListPage } from '@/components/domain/list-page';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/tag';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DataTableColumn } from '@/components/ui/data-table';
import type { ListFilter } from '@/components/domain/list-page';
import { useApiMutation } from '@/hooks/use-api';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { visaApi, visaService, visaTypeLabel, type VisaRecord } from '@/lib/api/visa';
import { toast } from 'sonner';

const STATUS_OPTIONS = [
  { label: 'Not Started', value: 'not_started' },
  { label: 'Documents Collecting', value: 'documents_collecting' },
  { label: 'Applied', value: 'applied' },
  { label: 'Processing', value: 'processing' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'danger' | 'warning' | 'info'> = {
  not_started: 'neutral',
  documents_collecting: 'info',
  applied: 'info',
  processing: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not Started',
  documents_collecting: 'Docs Collecting',
  applied: 'Applied',
  processing: 'Processing',
  approved: 'Approved',
  rejected: 'Rejected',
};

function toCsv(rows: VisaRecord[]): string {
  const header = ['Traveller', 'Destination', 'Visa Type', 'Application Date', 'Expiry Date', 'Status'];
  const lines = rows.map((r) =>
    [r.travellerName, r.countryName, visaTypeLabel(r.visaType), r.applicationDate ?? '', r.expiryDate ?? '', r.status]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function VisaTrackingPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState<string | undefined>(undefined);
  // Bumping this re-creates the fetcher, which makes ListPage reload from page 1.
  const [reloadKey, setReloadKey] = React.useState(0);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const { mutate: deleteVisa } = useApiMutation<string, unknown>((id) => visaApi.delete(id));

  const filters: ListFilter[] = statusFilter
    ? [{ id: 'status', label: 'Status', value: STATUS_LABEL[statusFilter] ?? statusFilter }]
    : [];

  const fetcher = React.useCallback(
    ({ page, limit, search }: { page: number; limit: number; search: string; filters: ListFilter[] }) =>
      visaService.list({ page, limit, search: search || undefined, status: statusFilter }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusFilter, reloadKey],
  );

  async function handleDelete(v: VisaRecord) {
    const ok = await confirm({
      title: 'Delete Visa Record',
      description: `Are you sure you want to delete the visa record for ${v.travellerName}? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    const result = await deleteVisa(v.id);
    if (result !== undefined) {
      toast.success('Visa record deleted');
      setReloadKey((k) => k + 1);
    } else {
      toast.error('Failed to delete visa record');
    }
  }

  async function handleExport(rows: VisaRecord[]) {
    let allRows = rows;
    try {
      const res = await visaService.list({ page: 1, limit: 100, status: statusFilter });
      const data = res.data as unknown;
      allRows = Array.isArray(data)
        ? (data as VisaRecord[])
        : ((data as { data?: VisaRecord[] })?.data ?? rows);
    } catch {
      // fall back to the loaded rows if the full export fetch fails
    }
    downloadCsv(toCsv(allRows), 'visa-applications.csv');
  }

  const columns: DataTableColumn<VisaRecord>[] = [
    { key: 'travellerName', header: 'Traveller', sortable: true },
    { key: 'countryName', header: 'Destination', sortable: true },
    { key: 'visaType', header: 'Type', cell: (v) => visaTypeLabel(v.visaType) || 'N/A' },
    {
      key: 'applicationDate',
      header: 'Applied',
      cell: (v) =>
        v.applicationDate
          ? formatLocaleDate(v.applicationDate, { day: 'numeric', month: 'short', year: 'numeric' })
          : 'N/A',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (v) => <Tag tone={STATUS_TONE[v.status] ?? 'info'}>{STATUS_LABEL[v.status] ?? v.status}</Tag>,
    },
  ];

  return (
    <>
    <ListPage<VisaRecord>
      title="Visa Tracking"
      description="Track visa applications for your travellers."
      getRowId={(v) => v.id}
      fetcher={fetcher}
      refreshKey={reloadKey}
      columns={columns}
      primaryAction={
        <Button size="sm" onClick={() => router.push('/visa/new')}>
          <Plus aria-hidden="true" /> New Application
        </Button>
      }
      headerActions={
        <Select value={statusFilter ?? 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? undefined : v)}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      searchPlaceholder="Search by destination…"
      filters={filters}
      onClearFilters={() => setStatusFilter(undefined)}
      rowActions={(v) => (
        <>
          <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/visa/${v.id}`)}>
            <Eye />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/visa/${v.id}/edit`)}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => void handleDelete(v)}>
            <Trash2 />
          </Button>
        </>
      )}
      onRowClick={(v) => router.push(`/visa/${v.id}`)}
      bulkActions={[
        {
          label: 'Delete',
          destructive: true,
          onSelect: async (rows) => {
            await Promise.all(rows.map((r) => deleteVisa(r.id)));
            toast.success(`${rows.length} visa record(s) deleted`);
            setReloadKey((k) => k + 1);
          },
        },
      ]}
      onExport={handleExport}
      exportLabel="Export CSV"
      emptyTitle="No visa applications yet"
      emptyDescription="Create your first visa application to start tracking it."
      emptyAction={
        <Button onClick={() => router.push('/visa/new')}>
          <Plus aria-hidden="true" /> New Application
        </Button>
      }
    />
      {confirmDialog}
    </>
  );
}
