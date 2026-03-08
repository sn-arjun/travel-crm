'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, LayoutGrid, List, Truck, Users, Calendar, MapPin, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilterBar } from '@/components/domain/filter-bar';
import { cn } from '@/lib/utils';
import { useFleetStore } from '@/stores/fleet-store';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { fleetApi } from '@/lib/api/fleet';
import { TRIP_STATUS_LABELS, TRIP_STATUS_COLORS } from '@travelcrm/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function TripStatusBadge({ status }: { status: string }) {
  const color = TRIP_STATUS_COLORS[status as keyof typeof TRIP_STATUS_COLORS] || '#64748B';
  const label = TRIP_STATUS_LABELS[status as keyof typeof TRIP_STATUS_LABELS] || status;
  return <Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${color}15`, color }}>{label}</Badge>;
}

function KanbanColumn({ status, trips }: { status: string; trips: any[] }) {
  const color = TRIP_STATUS_COLORS[status as keyof typeof TRIP_STATUS_COLORS] || '#64748B';
  const label = TRIP_STATUS_LABELS[status as keyof typeof TRIP_STATUS_LABELS] || status;
  return (
    <div className="flex flex-col w-72 shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <h3 className="text-sm font-semibold">{label}</h3>
        <Badge variant="secondary" className="text-[10px] ml-auto">{trips.length}</Badge>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto max-h-[calc(100vh-260px)]">
        {trips.map((trip: any) => (
          <Link key={trip.id} href={`/fleet/trips/${trip.id}`}>
            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-medium">Trip #{trip.id.slice(0, 8)}</p>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{trip.startLocation || 'TBD'}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><ArrowRight className="h-3 w-3 shrink-0" />{trip.endLocation || 'TBD'}</p>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                  <span className="flex items-center gap-1"><Truck className="h-3 w-3" />{trip.vehicleRegistration || trip.vehicleId?.slice(0, 8) || '—'}</span>
                  <span className="font-medium text-foreground">₹{(trip.fare ?? 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />{(trip.startTime || '').split('T')[0] || '—'}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {trips.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No trips</p>}
      </div>
    </div>
  );
}

export default function TripsPage() {
  const router = useRouter();
  const { tripView, setTripView } = useFleetStore();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      fleetApi.trips.list({
        page, limit,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
    [statusFilter]
  );

  const { items: trips, loading, loadingMore, total, sentinelRef, refetch } = useInfiniteScroll<any>({ fetcher, limit: 50 });

  React.useEffect(() => { refetch(); }, [statusFilter, refetch]);

  // For kanban we need all trips - use local filter on loaded items
  const filtered = React.useMemo(() => {
    if (!debouncedSearch) return trips;
    const q = debouncedSearch.toLowerCase();
    return trips.filter((t: any) =>
      (t.startLocation || '').toLowerCase().includes(q) ||
      (t.endLocation || '').toLowerCase().includes(q) ||
      (t.vehicleRegistration || '').toLowerCase().includes(q) ||
      (t.driverName || '').toLowerCase().includes(q)
    );
  }, [trips, debouncedSearch]);

  const kanbanStatuses = ['assigned', 'accepted', 'en_route', 'started', 'completed', 'cancelled'];
  const activeFilters = [];
  if (statusFilter !== 'all') activeFilters.push({ id: 'status', label: 'Status', value: TRIP_STATUS_LABELS[statusFilter as keyof typeof TRIP_STATUS_LABELS] || statusFilter });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Trip Assignments</h1>
          <p className="text-sm text-muted-foreground">{total} trip{total !== 1 ? 's' : ''}</p>
        </div>
        <Button asChild><Link href="/fleet/trips/new"><Plus className="h-4 w-4 mr-1.5" />New Trip</Link></Button>
      </div>

      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search trips..."
          activeFilters={activeFilters}
          onRemoveFilter={(id) => { if (id === 'status') setStatusFilter('all'); }}
          onClearFilters={() => { setSearch(''); setStatusFilter('all'); }}
          actions={
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(TRIP_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <Button variant={tripView === 'kanban' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setTripView('kanban')}><LayoutGrid className="h-4 w-4" /></Button>
                <Button variant={tripView === 'table' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setTripView('table')}><List className="h-4 w-4" /></Button>
              </div>
            </div>
          }
        />
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /><span>Loading trips...</span>
          </div>
        ) : tripView === 'kanban' ? (
          <div className="flex gap-4 p-6 overflow-x-auto">
            {kanbanStatuses.map((status: any) => (
              <KanbanColumn key={status} status={status} trips={filtered.filter((t: any) => t.status === status)} />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Route</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Distance</TableHead>
                <TableHead>Fare</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t: any) => (
                <TableRow key={t.id} className="cursor-pointer" onClick={() => router.push(`/fleet/trips/${t.id}`)}>
                  <TableCell><p className="text-xs truncate max-w-48">{t.startLocation || 'TBD'} → {t.endLocation || 'TBD'}</p></TableCell>
                  <TableCell className="text-xs font-mono">{t.vehicleRegistration || t.vehicleId?.slice(0, 8) || '—'}</TableCell>
                  <TableCell className="text-sm">{t.driverName || t.driverId?.slice(0, 8) || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{(t.startTime || '').split('T')[0] || '—'}</TableCell>
                  <TableCell className="text-sm">{t.distance ?? 0}km</TableCell>
                  <TableCell className="text-sm font-medium">₹{(t.fare ?? 0).toLocaleString('en-IN')}</TableCell>
                  <TableCell><TripStatusBadge status={t.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div ref={sentinelRef} className="h-4" />
        {loadingMore && (<div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>)}
      </div>
    </div>
  );
}
