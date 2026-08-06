'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, LayoutGrid, List, MoreHorizontal, Truck, Gauge, Shield, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterBar } from '@/components/domain/filter-bar';
import { cn } from '@/lib/utils';
import { useFleetStore } from '@/stores/fleet-store';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { fleetApi } from '@/lib/api/fleet';
import { VEHICLE_TYPE_LABELS, VEHICLE_STATUS_LABELS, VEHICLE_STATUS_COLORS } from '@travelcrm/shared';

function VehicleStatusBadge({ status }: { status: string }) {
  const color = VEHICLE_STATUS_COLORS[status as keyof typeof VEHICLE_STATUS_COLORS] || '#64748B';
  const label = VEHICLE_STATUS_LABELS[status as keyof typeof VEHICLE_STATUS_LABELS] || status;
  return (
    <Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${color}15`, color }}>
      {label}
    </Badge>
  );
}

function DocumentExpiryBadge({ expiryDate, label }: { expiryDate: string; label: string }) {
  const days = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
  const color = days < 0 ? 'text-red-600 bg-red-50 dark:bg-red-900/20' : days < 7 ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : days < 30 ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' : 'text-green-600 bg-green-50 dark:bg-green-900/20';
  return (
    <div className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium', color)}>
      {days < 0 ? <AlertTriangle className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
      {label}: {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
    </div>
  );
}

function VehicleCard({ vehicle }: { vehicle: any }) {
  return (
    <Link href={`/fleet/vehicles/${vehicle.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-bold font-mono">{vehicle.registrationNumber}</p>
              <p className="text-xs text-muted-foreground">{vehicle.make} {vehicle.model}</p>
            </div>
            <VehicleStatusBadge status={vehicle.status} />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Truck className="h-3 w-3" />{VEHICLE_TYPE_LABELS[vehicle.type as keyof typeof VEHICLE_TYPE_LABELS] || 'Vehicle'}</span>
            <span>{vehicle.seatingCapacity ?? vehicle.capacity} seats</span>
            <span>{vehicle.year}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {vehicle.insuranceExpiry && <DocumentExpiryBadge expiryDate={vehicle.insuranceExpiry} label="Ins" />}
            {vehicle.permitExpiry && <DocumentExpiryBadge expiryDate={vehicle.permitExpiry} label="Permit" />}
            {vehicle.pollutionExpiry && <DocumentExpiryBadge expiryDate={vehicle.pollutionExpiry} label="PUC" />}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
            <span className="flex items-center gap-1"><Gauge className="h-3 w-3" />{(vehicle.odometerKm ?? vehicle.mileage)?.toLocaleString()} km</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function VehiclesPage() {
  const router = useRouter();
  const { vehicleView, setVehicleView } = useFleetStore();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetcher = React.useCallback(
    (page: number, limit: number) =>
      fleetApi.vehicles.list({
        page,
        limit,
        search: debouncedSearch || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      }),
    [debouncedSearch, statusFilter]
  );

  const { items: vehicles, loading, loadingMore, total, sentinelRef, refetch } = useInfiniteScroll<any>({ fetcher });

  React.useEffect(() => {
    refetch();
  }, [debouncedSearch, statusFilter, refetch]);

  const activeFilters = [];
  if (statusFilter !== 'all') activeFilters.push({ id: 'status', label: 'Status', value: VEHICLE_STATUS_LABELS[statusFilter as keyof typeof VEHICLE_STATUS_LABELS] || statusFilter });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Vehicles</h1>
          <p className="text-sm text-muted-foreground">{total} vehicle{total !== 1 ? 's' : ''}</p>
        </div>
        <Button asChild><Link href="/fleet/vehicles/new"><Plus className="h-4 w-4 mr-1.5" />Add Vehicle</Link></Button>
      </div>

      <div className="px-6 py-3 border-b">
        <FilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search vehicles..."
          activeFilters={activeFilters}
          onRemoveFilter={(id) => { if (id === 'status') setStatusFilter('all'); }}
          onClearFilters={() => { setSearch(''); setStatusFilter('all'); }}
          actions={
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Object.entries(VEHICLE_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1 border rounded-md p-0.5">
                <Button variant={vehicleView === 'grid' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setVehicleView('grid')}><LayoutGrid className="h-4 w-4" /></Button>
                <Button variant={vehicleView === 'table' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setVehicleView('table')}><List className="h-4 w-4" /></Button>
              </div>
            </div>
          }
        />
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : vehicles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
            <Truck className="h-10 w-10 opacity-30" />
            <p className="text-sm">No vehicles found</p>
            {(search || statusFilter !== 'all') && (
              <Button variant="outline" size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear filters</Button>
            )}
          </div>
        ) : vehicleView === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {vehicles.map((v: any) => <VehicleCard key={v.id} vehicle={v} />)}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Registration</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Odometer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.map((v: any) => (
                <TableRow key={v.id} className="cursor-pointer" onClick={() => router.push(`/fleet/vehicles/${v.id}`)}>
                  <TableCell className="font-mono font-medium text-sm">{v.registrationNumber}</TableCell>
                  <TableCell><p className="text-sm font-medium">{v.make} {v.model}</p><p className="text-xs text-muted-foreground">{v.year}</p></TableCell>
                  <TableCell className="text-sm">{VEHICLE_TYPE_LABELS[v.type as keyof typeof VEHICLE_TYPE_LABELS] || '—'}</TableCell>
                  <TableCell className="text-sm">{v.seatingCapacity ?? v.capacity}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{(v.odometerKm ?? v.mileage)?.toLocaleString()} km</TableCell>
                  <TableCell><VehicleStatusBadge status={v.status} /></TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild><Link href={`/fleet/vehicles/${v.id}`}>View details</Link></DropdownMenuItem>
                        <DropdownMenuItem asChild><Link href={`/fleet/vehicles/${v.id}/edit`}>Edit</Link></DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-4" />
        {loadingMore && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
