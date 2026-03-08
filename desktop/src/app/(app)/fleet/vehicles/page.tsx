'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, LayoutGrid, List, MoreHorizontal, Truck, Calendar, Gauge, Shield, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useFleetStore } from '@/stores/fleet-store';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';
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
          <span className="flex items-center gap-1"><Truck className="h-3 w-3" />Vehicle</span>
          <span>{vehicle.seatingCapacity ?? vehicle.capacity} seats</span>
          <span>{vehicle.year}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[10px]">Registered</Badge>
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

  const vehiclesQuery = useApiQuery(
    () => fleetApi.vehicles.list({ limit: 100 }).then(res => res.data),
    []
  );

  React.useEffect(() => {
    if (vehiclesQuery.error) {
      toast.error('Failed to load vehicles');
    }
  }, [vehiclesQuery.error]);

  const vehicles: any[] = Array.isArray(vehiclesQuery.data) ? vehiclesQuery.data : (vehiclesQuery.data?.data ?? []);

  const filtered = React.useMemo(() => {
    let result = [...vehicles];
    if (search) { const q = search.toLowerCase(); result = result.filter((v: any) => v.registrationNumber.toLowerCase().includes(q) || v.make.toLowerCase().includes(q) || v.model.toLowerCase().includes(q)); }
    if (statusFilter && statusFilter !== 'all') result = result.filter((v: any) => v.status === statusFilter);
    return result;
  }, [search, statusFilter, vehicles]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Vehicles</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} vehicles {vehiclesQuery.loading && '(loading...)'}</p>
        </div>
        <Button asChild><Link href="/fleet/vehicles/new"><Plus className="h-4 w-4 mr-1.5" />Add Vehicle</Link></Button>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search vehicles..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {Object.entries(VEHICLE_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-1 border rounded-md p-0.5">
          <Button variant={vehicleView === 'grid' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setVehicleView('grid')}><LayoutGrid className="h-4 w-4" /></Button>
          <Button variant={vehicleView === 'table' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setVehicleView('table')}><List className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {vehiclesQuery.loading ? (
          <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading vehicles...</span>
          </div>
        ) : vehicleView === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((v: any) => <VehicleCard key={v.id} vehicle={v} />)}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Registration</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Mileage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v: any) => (
                <TableRow key={v.id} className="cursor-pointer" onClick={() => router.push(`/fleet/vehicles/${v.id}`)}>
                  <TableCell className="font-mono font-medium text-sm">{v.registrationNumber}</TableCell>
                  <TableCell><p className="text-sm font-medium">{v.make} {v.model}</p><p className="text-xs text-muted-foreground">{v.year}</p></TableCell>
                  <TableCell className="text-sm">{v.seatingCapacity ?? v.capacity}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{(v.odometerKm ?? v.mileage)?.toLocaleString()} km</TableCell>
                  <TableCell><VehicleStatusBadge status={v.status} /></TableCell>
                  <TableCell>
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
      </div>
    </div>
  );
}
