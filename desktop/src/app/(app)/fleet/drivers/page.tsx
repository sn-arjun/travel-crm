'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Pencil, Phone, Star, Trash2, UserPlus } from 'lucide-react';
import { ListPage } from '@/components/domain';
import {
  Button, Tag, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui';
import { fleetApi, type Driver } from '@/lib/api/fleet';
import { DRIVER_STATUS_LABELS } from '@travelcrm/shared';
import { toast } from 'sonner';
import { toLocalDateString } from '@/lib/dates';

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'on_trip') return 'info';
  if (status === 'on_leave') return 'warning';
  return 'neutral';
}

function licenseTone(licenseExpiry?: string): { tone: 'success' | 'danger' | 'warning' | 'neutral'; label: string } {
  if (!licenseExpiry) return { tone: 'neutral', label: 'No license date' };
  const days = Math.ceil((new Date(licenseExpiry).getTime() - Date.now()) / 86400000);
  if (days < 0) return { tone: 'danger', label: `Expired ${Math.abs(days)}d ago` };
  if (days < 30) return { tone: 'warning', label: `Expires in ${days}d` };
  return { tone: 'success', label: 'Valid' };
}

function toCsvValue(v: unknown) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function DriversPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState('');
  const [refreshKey, setRefreshKey] = React.useState(0);

  return (
    <ListPage<Driver>
      title="Drivers"
      description="Manage your fleet drivers, licenses, and schedules."
      getRowId={(d) => d.id}
      refreshKey={refreshKey}
      fetcher={({ page, limit, search }) =>
        fleetApi.drivers.list({
          page,
          limit,
          search: search || undefined,
          status: statusFilter || undefined,
        })
      }
      searchPlaceholder="Search drivers by name or phone..."
      columns={[
        {
          key: 'name', header: 'Driver', sortable: true,
          cell: (d) => (
            <div>
              <p className="font-medium text-sm">{d.name}</p>
              <p className="text-xs text-ds-foreground-muted flex items-center gap-1"><Phone className="h-3 w-3" />{d.phone}</p>
            </div>
          ),
        },
        {
          key: 'rating', header: 'Rating', sortable: true,
          cell: (d) => (
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-warning fill-warning" />
              <span className="text-sm font-medium">{d.rating ? d.rating.toFixed(1) : '—'}</span>
            </div>
          ),
        },
        {
          key: 'licenseExpiry', header: 'License',
          cell: (d) => {
            const { tone, label } = licenseTone(d.licenseExpiry);
            return <Tag tone={tone}>{label}</Tag>;
          },
        },
        {
          key: 'experience', header: 'Experience', align: 'right',
          cell: (d) => `${d.experience ?? 0} yr${(d.experience ?? 0) === 1 ? '' : 's'}`,
        },
        {
          key: 'status', header: 'Status', sortable: true,
          cell: (d) => <Tag tone={statusTone(d.status)}>{DRIVER_STATUS_LABELS[d.status as keyof typeof DRIVER_STATUS_LABELS] || d.status}</Tag>,
        },
      ]}
      primaryAction={
        <Button size="sm" onClick={() => router.push('/fleet/drivers/new')}>
          <UserPlus aria-hidden="true" /> Add driver
        </Button>
      }
      headerActions={
        <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(DRIVER_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      filters={statusFilter ? [{ id: 'status', label: 'Status', value: DRIVER_STATUS_LABELS[statusFilter as keyof typeof DRIVER_STATUS_LABELS] || statusFilter }] : []}
      onRemoveFilter={() => setStatusFilter('')}
      onClearFilters={() => setStatusFilter('')}
      rowActions={(d) => (
        <>
          <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/fleet/drivers/${d.id}`)}>
            <Eye />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/fleet/drivers/${d.id}/edit`)}>
            <Pencil />
          </Button>
          {d.phone && (
            <Button variant="ghost" size="icon-sm" aria-label="Call" onClick={() => router.push(`/communication/calls/dial?phone=${encodeURIComponent(d.phone)}`)}>
              <Phone />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={async () => {
            try {
              await fleetApi.drivers.delete(d.id);
              toast.success('Driver deleted');
              setRefreshKey((k) => k + 1);
            } catch { toast.error('Failed to delete driver'); }
          }}>
            <Trash2 />
          </Button>
        </>
      )}
      onRowClick={(d) => router.push(`/fleet/drivers/${d.id}`)}
      bulkActions={[
        {
          label: 'Delete',
          icon: <Trash2 aria-hidden="true" />,
          destructive: true,
          onSelect: async (rows) => {
            await Promise.all(rows.map((r) => fleetApi.drivers.delete(r.id)));
            toast.success(`${rows.length} driver(s) deleted`);
            setRefreshKey((k) => k + 1);
          },
        },
      ]}
      onExport={async (rows) => {
        try {
          let all = rows;
          const total = rows.length;
          if (total > 0) {
            const first = await fleetApi.drivers.list({ page: 1, limit: 500, search: undefined, status: statusFilter || undefined });
            const data: any = first.data;
            all = Array.isArray(data) ? data : (data?.data ?? rows);
          }
          const header = ['Name', 'Phone', 'Email', 'License Number', 'License Expiry', 'Rating', 'Experience (yrs)', 'Status'];
          const lines = [header.join(',')];
          for (const d of all) {
            lines.push([
              toCsvValue(d.name), toCsvValue(d.phone), toCsvValue(d.email ?? ''),
              toCsvValue(d.licenseNumber ?? ''), toCsvValue(d.licenseExpiry ?? ''),
              toCsvValue(d.rating ?? ''), toCsvValue(d.experience ?? 0),
              toCsvValue(DRIVER_STATUS_LABELS[d.status as keyof typeof DRIVER_STATUS_LABELS] || d.status),
            ].join(','));
          }
          const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `drivers_export_${toLocalDateString(new Date())}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success('Drivers exported successfully');
        } catch {
          toast.error('Failed to export drivers');
        }
      }}
      emptyTitle="No drivers yet"
      emptyDescription="Add your first driver to start assigning trips."
      emptyAction={
        <Button size="sm" onClick={() => router.push('/fleet/drivers/new')}>
          <UserPlus aria-hidden="true" /> Add driver
        </Button>
      }
    />
  );
}
