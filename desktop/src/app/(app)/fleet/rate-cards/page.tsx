'use client';


import { formatExactCurrency } from '@/lib/format';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { ListPage } from '@/components/domain';
import { Button, Tag, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useConfirm } from '@/components/ui';
import { fleetApi } from '@/lib/api/fleet';
import type { FleetRateCard } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { VEHICLE_TYPE_LABELS, FLEET_TRIP_TYPE_LABELS } from '@travelcrm/shared';

function exportRateCardsCsv(rows: FleetRateCard[]) {
  const header = ['Name', 'Vehicle Type', 'Trip Type', 'Base Fare', 'Per Km', 'Per Hour', 'Status'];
  const lines = rows.map((rc) => [
    rc.name,
    VEHICLE_TYPE_LABELS[rc.vehicleType as keyof typeof VEHICLE_TYPE_LABELS] || rc.vehicleType,
    rc.tripType ? (FLEET_TRIP_TYPE_LABELS[rc.tripType as keyof typeof FLEET_TRIP_TYPE_LABELS] || rc.tripType) : '',
    String(rc.baseFare ?? 0),
    String(rc.perKmRate ?? 0),
    rc.perHourRate != null ? String(rc.perHourRate) : '',
    rc.isActive !== false ? 'Active' : 'Inactive',
  ]);
  const csv = [header, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rate-cards.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function RateCardsPage() {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [vehicleTypeFilter, setVehicleTypeFilter] = React.useState('');
  const [refreshKey, setRefreshKey] = React.useState(0);

  const fetcher = React.useCallback(
    ({ page, limit, search }: { page: number; limit: number; search: string }) => {
      void refreshKey;
      return fleetApi.rateCards.list({
        page,
        limit,
        search: search || undefined,
        vehicleType: vehicleTypeFilter || undefined,
      });
    },
    [vehicleTypeFilter, refreshKey],
  );

  const filters = vehicleTypeFilter
    ? [{
        id: 'vehicleType',
        label: 'Vehicle type',
        value: VEHICLE_TYPE_LABELS[vehicleTypeFilter as keyof typeof VEHICLE_TYPE_LABELS] || vehicleTypeFilter,
      }]
    : [];

  async function handleDelete(rc: FleetRateCard) {
    const ok = await confirm({
      title: 'Delete rate card',
      description: `Delete "${rc.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await fleetApi.rateCards.delete(rc.id);
      toast.success('Rate card deleted');
      setRefreshKey((k) => k + 1);
    } catch {
      toast.error('Failed to delete rate card');
    }
  }

  return (
    <>
    {dialog}
    <ListPage<FleetRateCard>
      title="Rate Cards"
      description="Pricing for vehicle and trip type combinations."
      getRowId={(rc) => rc.id}
      fetcher={fetcher}
      refreshKey={refreshKey}
      filters={filters}
      onRemoveFilter={() => setVehicleTypeFilter('')}
      onClearFilters={() => setVehicleTypeFilter('')}
      headerActions={
        <Select value={vehicleTypeFilter || 'all'} onValueChange={(v) => setVehicleTypeFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-44 h-9" aria-label="Filter by vehicle type"><SelectValue placeholder="All vehicle types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All vehicle types</SelectItem>
            {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      columns={[
        { key: 'name', header: 'Name', sortable: true },
        {
          key: 'vehicleType',
          header: 'Vehicle Type',
          cell: (rc) => (
            <Tag>{VEHICLE_TYPE_LABELS[rc.vehicleType as keyof typeof VEHICLE_TYPE_LABELS] || rc.vehicleType}</Tag>
          ),
        },
        {
          key: 'tripType',
          header: 'Trip Type',
          cell: (rc) =>
            rc.tripType ? (FLEET_TRIP_TYPE_LABELS[rc.tripType as keyof typeof FLEET_TRIP_TYPE_LABELS] || rc.tripType) : '—',
        },
        {
          key: 'baseFare',
          header: 'Base Fare',
          align: 'right',
          sortable: true,
          cell: (rc) => formatExactCurrency(rc.baseFare ?? 0),
        },
        {
          key: 'perKmRate',
          header: 'Per Km',
          align: 'right',
          sortable: true,
          cell: (rc) => formatExactCurrency(rc.perKmRate ?? 0),
        },
        {
          key: 'perHourRate',
          header: 'Per Hour',
          align: 'right',
          cell: (rc) => (rc.perHourRate != null ? formatExactCurrency(rc.perHourRate) : '—'),
        },
        {
          key: 'isActive',
          header: 'Status',
          cell: (rc) => (
            <Tag tone={rc.isActive !== false ? 'success' : 'neutral'}>{rc.isActive !== false ? 'Active' : 'Inactive'}</Tag>
          ),
        },
      ]}
      primaryAction={
        <Button size="sm" onClick={() => router.push('/fleet/rate-cards/new')}>
          <Plus aria-hidden="true" /> New rate card
        </Button>
      }
      rowActions={(rc) => (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Edit"
            onClick={() => router.push(`/fleet/rate-cards/${rc.id}/edit`)}
          >
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => void handleDelete(rc)}>
            <Trash2 />
          </Button>
        </>
      )}
      onRowClick={(rc) => router.push(`/fleet/rate-cards/${rc.id}/edit`)}
      bulkActions={[
        {
          label: 'Delete',
          destructive: true,
          onSelect: (rows) =>
            Promise.all(rows.map((r) => fleetApi.rateCards.delete(r.id))).then(() => {
              toast.success(`${rows.length} rate card${rows.length !== 1 ? 's' : ''} deleted`);
              setRefreshKey((k) => k + 1);
            }),
        },
      ]}
      onExport={(rows) => exportRateCardsCsv(rows)}
      searchPlaceholder="Search rate cards..."
      emptyTitle="No rate cards yet"
      emptyDescription="Create a rate card to define pricing for a vehicle type."
      emptyAction={
        <Button size="sm" onClick={() => router.push('/fleet/rate-cards/new')}>
          <Plus aria-hidden="true" /> New rate card
        </Button>
      }
    />
    </>
  );
}
