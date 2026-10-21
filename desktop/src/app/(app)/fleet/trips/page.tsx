'use client';


import { formatExactCurrency } from '@/lib/format';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, ListChecks, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { ListPage } from '@/components/domain';
import {
  Button, Tag, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, useConfirm,
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui';
import { fleetApi } from '@/lib/api/fleet';
import type { Trip } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { TRIP_STATUS_LABELS } from '@travelcrm/shared';
import { formatTripDateTime, formatTripWhenShort, tripStatusTone, tripTypeLabel } from '@/components/domain/fleet/trip-format';
import { formatPhone } from '@/lib/phone';
import { toLocalDateString } from '@/lib/dates';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { useT } from '@/lib/i18n';
import { CoachTripPanel } from './_components/passenger-checkin';

function toCsvValue(v: unknown) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function TripsPage() {
  const t = useT();
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const coachGate = useFeatureGate('coach_trips');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [kindFilter, setKindFilter] = React.useState<'' | 'coach' | 'transfer'>('');
  // The coach trip whose check-in drawer is open
  const [checkinTrip, setCheckinTrip] = React.useState<Trip | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const fetchTrips = React.useCallback(
    ({ page, limit, search }: { page: number; limit: number; search?: string }) =>
      fleetApi.trips.list({ page, limit, search: search || undefined, status: statusFilter || undefined, tripKind: kindFilter || undefined }),
    // refreshKey re-creates the fetcher so the list reloads after a mutation
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusFilter, kindFilter, refreshKey],
  );

  async function handleDelete(trip: Trip) {
    if (trip.status !== 'assigned') {
      toast.error('Only trips that are still Assigned can be deleted. Trips that have started stay on record.', { duration: 8000 });
      return;
    }
    const ok = await confirm({
      title: 'Delete trip',
      description: `Delete the trip from "${trip.startLocation}" to "${trip.endLocation}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'destructive',
    });
    if (!ok) return;
    try {
      await fleetApi.trips.delete(trip.id);
      toast.success('Trip deleted');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error((e as { message?: string })?.message || 'Failed to delete trip');
    }
  }

  return (
    <>
      {dialog}
      <Sheet open={checkinTrip !== null} onOpenChange={(open) => { if (!open) setCheckinTrip(null); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" data-testid="trip-checkin-drawer">
          <SheetHeader>
            <SheetTitle>{checkinTrip ? `${checkinTrip.startLocation || t('coachTrips.list.coachTrip')} → ${checkinTrip.endLocation || ''}` : ''}</SheetTitle>
          </SheetHeader>
          {checkinTrip && (
            <div className="px-ds-4 pb-ds-4">
              <CoachTripPanel
                tripId={checkinTrip.id}
                readOnly={checkinTrip.status === 'completed' || checkinTrip.status === 'cancelled'}
                onChanged={() => setRefreshKey((k) => k + 1)}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
      <ListPage<Trip>
        title="Trips"
        description="Assign vehicles and drivers to trips, and track them to completion."
        getRowId={(t) => t.id}
        fetcher={fetchTrips}
        refreshKey={refreshKey}
        searchPlaceholder="Search trips by passenger, vehicle, or driver..."
        columns={[
          {
            key: 'route',
            header: 'Route',
            cell: (t) => (
              <span className="flex items-center gap-ds-1 text-sm">
                <MapPin className="size-3.5 text-ds-foreground-muted shrink-0" aria-hidden="true" />
                <span className="truncate max-w-64">{t.startLocation || 'TBD'} → {t.endLocation || 'TBD'}</span>
              </span>
            ),
          },
          {
            key: 'passenger',
            header: 'Passenger',
            cell: (t) => (
              <span className="flex flex-col leading-tight">
                <span>{t.passengerName || '—'}</span>
                {t.passengerPhone && (
                  <span className="text-xs text-ds-foreground-muted">{formatPhone(t.passengerPhone)}</span>
                )}
              </span>
            ),
          },
          {
            key: 'tripType',
            header: 'Type',
            cell: (t) => tripTypeLabel(t.tripType),
          },
          {
            key: 'vehicle',
            header: 'Vehicle',
            cell: (t) => t.vehicle?.registrationNumber || t.vehicleRegistration || '—',
          },
          {
            key: 'driver',
            header: 'Driver',
            cell: (t) => t.driver?.name || t.driverName || '—',
          },
          {
            key: 'coach',
            header: t('coachTrips.list.column'),
            cell: (tr) =>
              tr.tripKind === 'coach' ? (
                <span className="flex flex-col leading-tight text-sm" data-testid="trip-coach-cell">
                  <span>{t('coachTrips.list.stops', { count: tr.stopCount ?? 0 })}</span>
                  <span className="text-xs text-ds-foreground-muted tabular-nums">
                    {t('coachTrips.list.onBoard', { boarded: tr.headcount?.boarded ?? 0, expected: tr.headcount?.expected ?? 0 })}
                  </span>
                </span>
              ) : (
                '—'
              ),
          },
          {
            key: 'startTime',
            header: 'Start',
            sortable: true,
            cell: (t) => formatTripWhenShort(t.startTime),
          },
          {
            key: 'distance',
            header: 'Distance',
            align: 'right',
            cell: (t) => `${t.distance ?? 0} km`,
          },
          {
            key: 'fare',
            header: 'Fare',
            align: 'right',
            sortable: true,
            cell: (t) => formatExactCurrency(t.fare ?? 0),
          },
          {
            key: 'status',
            header: 'Status',
            cell: (t) => (
              <Tag tone={tripStatusTone(t.status)}>{TRIP_STATUS_LABELS[t.status as keyof typeof TRIP_STATUS_LABELS] || t.status}</Tag>
            ),
          },
        ]}
        primaryAction={
          <Button size="sm" onClick={() => router.push('/fleet/trips/new')}>
            <Plus aria-hidden="true" /> New trip
          </Button>
        }
        headerActions={
          <>
            <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(TRIP_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(coachGate.enabled || kindFilter !== '') && (
              <Select value={kindFilter || 'all'} onValueChange={(v) => setKindFilter(v === 'all' ? '' : (v as 'coach' | 'transfer'))}>
                <SelectTrigger className="w-40 h-9" aria-label={t('coachTrips.list.kindFilter')} data-testid="trip-kind-filter"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('coachTrips.list.allKinds')}</SelectItem>
                  <SelectItem value="coach">{t('coachTrips.list.coach')}</SelectItem>
                  <SelectItem value="transfer">{t('coachTrips.list.transfer')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </>
        }
        filters={[
          ...(statusFilter ? [{ id: 'status', label: 'Status', value: TRIP_STATUS_LABELS[statusFilter as keyof typeof TRIP_STATUS_LABELS] || statusFilter }] : []),
          ...(kindFilter ? [{ id: 'kind', label: t('coachTrips.list.kindFilter'), value: kindFilter === 'coach' ? t('coachTrips.list.coach') : t('coachTrips.list.transfer') }] : []),
        ]}
        onRemoveFilter={(id) => (id === 'kind' ? setKindFilter('') : setStatusFilter(''))}
        onClearFilters={() => { setStatusFilter(''); setKindFilter(''); }}
        rowActions={(tr) => (
          <>
            {tr.tripKind === 'coach' && (
              <Button variant="ghost" size="icon-sm" aria-label={t('coachTrips.list.checkin')} onClick={() => setCheckinTrip(tr)} data-testid="trip-checkin-button">
                <ListChecks />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" aria-label="View" onClick={() => router.push(`/fleet/trips/${tr.id}`)}>
              <Eye />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => router.push(`/fleet/trips/${tr.id}/edit`)}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => void handleDelete(tr)}>
              <Trash2 />
            </Button>
          </>
        )}
        onRowClick={(tr) => router.push(`/fleet/trips/${tr.id}`)}
        bulkActions={[
          {
            label: 'Delete',
            icon: <Trash2 aria-hidden="true" />,
            destructive: true,
            onSelect: async (rows) => {
              const results = await Promise.allSettled(rows.map((r) => fleetApi.trips.delete(r.id)));
              const deleted = results.filter((r) => r.status === 'fulfilled').length;
              const blocked = rows.length - deleted;
              if (deleted > 0) toast.success(`${deleted} trip${deleted !== 1 ? 's' : ''} deleted`);
              if (blocked > 0) {
                toast.error(`${blocked} trip${blocked !== 1 ? 's were' : ' was'} not deleted: only Assigned trips can be deleted.`, { duration: 8000 });
              }
              setRefreshKey((k) => k + 1);
            },
          },
        ]}
        onExport={async (rows) => {
          try {
            let all = rows;
            if (rows.length > 0) {
              const first = await fleetApi.trips.list({ page: 1, limit: 500, status: statusFilter || undefined });
              const data = first.data as Trip[] | { data?: Trip[] };
              all = Array.isArray(data) ? data : (data?.data ?? rows);
            }
            const header = ['Route', 'Passenger', 'Type', 'Vehicle', 'Driver', 'Start', 'Distance (km)', 'Fare', 'Status'];
            const lines = [header.join(',')];
            for (const t of all) {
              lines.push([
                toCsvValue(`${t.startLocation || ''} -> ${t.endLocation || ''}`),
                toCsvValue(t.passengerName || ''),
                toCsvValue(tripTypeLabel(t.tripType)),
                toCsvValue(t.vehicle?.registrationNumber || t.vehicleRegistration || ''),
                toCsvValue(t.driver?.name || t.driverName || ''),
                toCsvValue(formatTripDateTime(t.startTime)),
                toCsvValue(t.distance ?? 0),
                toCsvValue(t.fare ?? 0),
                toCsvValue(TRIP_STATUS_LABELS[t.status as keyof typeof TRIP_STATUS_LABELS] || t.status),
              ].join(','));
            }
            const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `trips_export_${toLocalDateString(new Date())}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Trips exported successfully');
          } catch {
            toast.error('Failed to export trips');
          }
        }}
        emptyTitle="No trips yet"
        emptyDescription="Create a trip and assign a vehicle and driver."
        emptyAction={
          <Button size="sm" onClick={() => router.push('/fleet/trips/new')}>
            <Plus aria-hidden="true" /> New trip
          </Button>
        }
      />
    </>
  );
}
