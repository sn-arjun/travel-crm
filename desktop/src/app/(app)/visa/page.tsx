'use client';

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
import { visaApi, type VisaRecord } from '@/lib/api/visa';
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
    [r.travellerName, r.countryName, r.visaType ?? '', r.applicationDate ?? '', r.expiryDate ?? '', r.status]
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

  const { mutate: deleteVisa } = useApiMutation<string, unknown>((id) => visaApi.delete(id));

  const filters: ListFilter[] = statusFilter
    ? [{ id: 'status', label: 'Status', value: STATUS_LABEL[statusFilter] ?? statusFilter }]
    : [];

  const fetcher = React.useCallback(
    ({ page, limit, search }: { page: number; limit: number; search: string; filters: ListFilter[] }) =>
      visaApi.list({ page, limit, search: search || undefined, status: statusFilter }),
    [statusFilter],
  );

  async function handleDelete(v: VisaRecord) {
    const result = await deleteVisa(v.id);
    if (result !== undefined) {
      toast.success('Visa record deleted');
    } else {
      toast.error('Failed to delete visa record');
    }
  }

  async function handleExport(rows: VisaRecord[]) {
    let allRows = rows;
    try {
      const res = await visaApi.list({ page: 1, limit: 1000, status: statusFilter });
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
    { key: 'visaType', header: 'Type', cell: (v) => v.visaType ?? 'N/A' },
    {
      key: 'applicationDate',
      header: 'Applied',
      cell: (v) =>
        v.applicationDate
          ? new Date(v.applicationDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
          : 'N/A',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (v) => <Tag tone={STATUS_TONE[v.status] ?? 'info'}>{STATUS_LABEL[v.status] ?? v.status}</Tag>,
    },
  ];

  return (
    <ListPage<VisaRecord>
      title="Visa Tracking"
      description="Track visa applications for your travellers."
      getRowId={(v) => v.id}
      fetcher={fetcher}
      extractItems={(r) => {
        const data = (r as { data?: unknown })?.data;
        if (Array.isArray(data)) return data as VisaRecord[];
        return ((data as { data?: VisaRecord[] })?.data ?? []) as VisaRecord[];
      }}
      extractTotal={(r) => {
        const data = (r as { data?: unknown })?.data;
        return (data as { pagination?: { total?: number } })?.pagination?.total ?? 0;
      }}
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
      searchPlaceholder="Search by traveller or destination…"
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
          onSelect: (rows) => Promise.all(rows.map((r) => deleteVisa(r.id))).then(() => {}),
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
  );
}
