'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, Gauge, Pencil, Plus, Trash2 } from 'lucide-react';
import { ListPage } from '@/components/domain';
import {
  Button, Tag, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useConfirm,
} from '@/components/ui';
import { fleetApi } from '@/lib/api/fleet';
import type { Vehicle } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { VEHICLE_TYPE_LABELS, VEHICLE_STATUS_LABELS } from '@travelcrm/shared';

function statusTone(status: string): 'success' | 'danger' | 'info' | 'warning' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'inactive') return 'danger';
  if (status === 'on_trip') return 'info';
  if (status === 'maintenance') return 'warning';
  return 'neutral';
}

function toCsvValue(v: unknown) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function VehiclesPage() {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [statusFilter, setStatusFilter] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState('');

  async function handleDelete(vehicle: Vehicle) {
    const ok = await confirm({
      title: 'Delete vehicle',
      description: `Delete "${vehicle.registrationNumber}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await fleetApi.vehicles.delete(vehicle.id);
      toast.success('Vehicle deleted');
    } catch {
      toast.error('Failed to delete vehicle');
    }
  }

  const filters = [
    ...(statusFilter ? [{ id: 'status', label: 'Status', value: VEHICLE_STATUS_LABELS[statusFilter as keyof typeof VEHICLE_STATUS_LABELS] || statusFilter }] : []),
    ...(typeFilter ? [{ id: 'type', label: 'Type', value: VEHICLE_TYPE_LABELS[typeFilter as keyof typeof VEHICLE_TYPE_LABELS] || typeFilter }] : []),
  ];

  return (
    <>
      {dialog}
      <ListPage<Vehicle>
        title="Vehicles"
        description="Manage your fleet's vehicles, documents, and maintenance."
        getRowId={(v) => v.id}
        fetcher={({ page, limit, search }) =>
          fleetApi.vehicles.list({
            page,
            limit,
            search: search || undefined,
            status: statusFilter || undefined,
            type: typeFilter || undefined,
          })
        }
        searchPlaceholder="Search by registration, make, or model..."
        columns={[
          {
            key: 'registrationNumber',
            header: 'Registration',
            sortable: true,
            cell: (v) => <span className="font-mono text-sm font-medium">{v.registrationNumber}</span>,
          },
          {
            key: 'vehicle',
            header: 'Vehicle',
            cell: (v) => (
              <div>
                <p className="text-sm font-medium">{v.make} {v.model}</p>
                <p className="text-xs text-ds-foreground-muted">{v.year}</p>
              </div>
            ),
          },
          {
            key: 'type',
            header: 'Type',
            cell: (v) => VEHICLE_TYPE_LABELS[v.type as keyof typeof VEHICLE_TYPE_LABELS] || v.type || '—',
          },
          {
            key: 'capacity',
            header: 'Capacity',
            align: 'right',
            cell: (v) => `${v.seatingCapacity ?? v.capacity} seats`,
          },
          {
            key: 'odometer',
            header: 'Odometer',
            align: 'right',
            cell: (v) => (
              <span className="inline-flex items-center gap-ds-1 text-sm text-ds-foreground-muted">
                <Gauge className="size-3.5" aria-hidden="true" />
                {(v.odometerKm ?? v.mileage)?.toLocaleString() ?? 0} km
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (v) => <Tag tone={statusTone(v.status)}>{VEHICLE_STATUS_LABELS[v.status as keyof typeof VEHICLE_STATUS_LABELS] || v.status}</Tag>,
          },
        ]}
        primaryAction={
          <Button size="sm" onClick={() => router.push('/fleet/vehicles/new')}>
            <Plus aria-hidden="true" /> Add vehicle
          </Button>
        }
        headerActions={
          <div className="flex items-center gap-ds-2">
            <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(VEHICLE_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        filters={filters}
        onRemoveFilter={(id) => { if (id === 'status') setStatusFilter(''); if (id === 'type') setTypeFilter(''); }}
        onClearFilters={() => { setStatusFilter(''); setTypeFilter(''); }}
        rowActions={(v) => (
          <>
            <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/fleet/vehicles/${v.id}`)}>
              <Eye />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/fleet/vehicles/${v.id}/edit`)}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => void handleDelete(v)}>
              <Trash2 />
            </Button>
          </>
        )}
        onRowClick={(v) => router.push(`/fleet/vehicles/${v.id}`)}
        bulkActions={[
          {
            label: 'Delete',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              await Promise.all(rows.map((r) => fleetApi.vehicles.delete(r.id)));
              toast.success(`${rows.length} vehicle${rows.length !== 1 ? 's' : ''} deleted`);
            },
          },
        ]}
        onExport={async (rows) => {
          try {
            let all = rows;
            if (rows.length > 0) {
              const first = await fleetApi.vehicles.list({ page: 1, limit: 500, status: statusFilter || undefined, type: typeFilter || undefined });
              const data: any = first.data;
              all = Array.isArray(data) ? data : (data?.data ?? rows);
            }
            const header = ['Registration', 'Make', 'Model', 'Year', 'Type', 'Capacity', 'Odometer (km)', 'Status'];
            const lines = [header.join(',')];
            for (const v of all) {
              lines.push([
                toCsvValue(v.registrationNumber),
                toCsvValue(v.make),
                toCsvValue(v.model),
                toCsvValue(v.year),
                toCsvValue(VEHICLE_TYPE_LABELS[v.type as keyof typeof VEHICLE_TYPE_LABELS] || v.type || ''),
                toCsvValue(v.seatingCapacity ?? v.capacity),
                toCsvValue(v.odometerKm ?? v.mileage ?? 0),
                toCsvValue(VEHICLE_STATUS_LABELS[v.status as keyof typeof VEHICLE_STATUS_LABELS] || v.status),
              ].join(','));
            }
            const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vehicles_export_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Vehicles exported successfully');
          } catch {
            toast.error('Failed to export vehicles');
          }
        }}
        emptyTitle="No vehicles yet"
        emptyDescription="Register your first vehicle to start building your fleet."
        emptyAction={
          <Button size="sm" onClick={() => router.push('/fleet/vehicles/new')}>
            <Plus aria-hidden="true" /> Add vehicle
          </Button>
        }
      />
    </>
  );
}
