'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Truck, Users, MapPin, DollarSign, AlertTriangle, Star, ArrowUpRight, Calendar, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { VEHICLE_STATUS_LABELS, DRIVER_STATUS_LABELS, TRIP_STATUS_LABELS, TRIP_STATUS_COLORS, FLEET_TRIP_TYPE_LABELS } from '@travelcrm/shared';

function formatCurrency(amount: number) {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount}`;
}

function StatCard({ title, value, icon: Icon, color, subtitle }: { title: string; value: string | number; icon: React.ElementType; color: string; subtitle?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{title}</p>
            {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', color)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TripStatusBadge({ status }: { status: string }) {
  const color = TRIP_STATUS_COLORS[status as keyof typeof TRIP_STATUS_COLORS] || '#64748B';
  const label = TRIP_STATUS_LABELS[status as keyof typeof TRIP_STATUS_LABELS] || status;
  return (
    <Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${color}15`, color }}>
      {label}
    </Badge>
  );
}

export default function FleetDashboardPage() {
  const vehiclesQuery = useApiQuery(
    () => fleetApi.vehicles.list({ limit: 100 }).then(res => res.data),
    []
  );

  const driversQuery = useApiQuery(
    () => fleetApi.drivers.list({ limit: 100 }).then(res => res.data),
    []
  );

  const tripsQuery = useApiQuery(
    () => fleetApi.trips.list({ limit: 100 }).then(res => res.data),
    []
  );

  React.useEffect(() => {
    if (vehiclesQuery.error) {
      toast.error('Failed to load vehicles');
    }
    if (driversQuery.error) {
      toast.error('Failed to load drivers');
    }
    if (tripsQuery.error) {
      toast.error('Failed to load trips');
    }
  }, [vehiclesQuery.error, driversQuery.error, tripsQuery.error]);

  const vehicles: any[] = Array.isArray(vehiclesQuery.data) ? vehiclesQuery.data : (vehiclesQuery.data?.data ?? []);
  const drivers: any[] = Array.isArray(driversQuery.data) ? driversQuery.data : (driversQuery.data?.data ?? []);
  const trips: any[] = Array.isArray(tripsQuery.data) ? tripsQuery.data : (tripsQuery.data?.data ?? []);

  const availableVehicles = vehicles.filter((v: any) => v.status === 'available').length;
  const activeTrips = trips.filter((t: any) => ['assigned', 'accepted', 'en_route', 'started'].includes(t.status)).length;
  const revenueMTD = trips.filter((t: any) => t.status === 'completed').reduce((sum: any, t: any) => sum + (t.fare ?? 0), 0);
  const activeTripsCount = activeTrips;

  const activeTripsList = trips.filter((t: any) => ['assigned', 'accepted', 'en_route', 'started'].includes(t.status));
  const upcomingTrips = trips.filter((t: any) => t.status === 'assigned').slice(0, 5);
  const topDrivers = [...drivers].sort((a: any, b: any) => (b.experience ?? 0) - (a.experience ?? 0)).slice(0, 5);

  const isLoading = vehiclesQuery.loading || driversQuery.loading || tripsQuery.loading;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Fleet Management</h1>
          <p className="text-sm text-muted-foreground">Vehicles, drivers, and trip assignments</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild><Link href="/fleet/vehicles/new">Add Vehicle</Link></Button>
          <Button variant="outline" asChild><Link href="/fleet/drivers/new">Add Driver</Link></Button>
          <Button asChild><Link href="/fleet/trips/new"><Plus className="h-4 w-4 mr-1.5" />New Trip</Link></Button>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading fleet data...</span>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/fleet/vehicles">
                <StatCard title="Total Vehicles" value={vehicles.length} icon={Truck} color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" subtitle={`${availableVehicles} available`} />
              </Link>
              <Link href="/fleet/drivers">
                <StatCard title="Total Drivers" value={drivers.length} icon={Users} color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" subtitle={`${drivers.filter(d => d.status === 'active').length} active`} />
              </Link>
              <Link href="/fleet/trips">
                <StatCard title="Active Trips" value={activeTripsCount} icon={MapPin} color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
              </Link>
              <StatCard title="Revenue (MTD)" value={formatCurrency(revenueMTD)} icon={DollarSign} color="bg-primary/10 text-primary" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Active Trips */}
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">Active Trips</CardTitle>
                      <Link href="/fleet/trips" className="text-xs text-primary hover:underline flex items-center gap-0.5">View all <ArrowUpRight className="h-3 w-3" /></Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {activeTripsList.slice(0, 6).map((trip: any) => (
                      <div key={trip.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium truncate">Trip #{trip.id.slice(0, 8)}</p>
                            <TripStatusBadge status={trip.status} />
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{trip.startLocation || 'TBD'} → {trip.endLocation || 'TBD'}</p>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1"><Truck className="h-3 w-3" />{trip.vehicleId}</span>
                            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{trip.driverName || trip.driverId}</span>
                            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{(trip.startTime || '').split('T')[0] || '—'}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium">₹{(trip.fare ?? 0).toLocaleString('en-IN')}</p>
                          <p className="text-[11px] text-muted-foreground">{trip.distance ?? 0}km</p>
                        </div>
                      </div>
                    ))}
                    {activeTripsList.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No active trips</p>}
                  </CardContent>
                </Card>

                {/* Upcoming Trips */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Upcoming Trips</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {upcomingTrips.map((trip: any) => (
                      <div key={trip.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" /></div>
                          <div>
                            <p className="text-sm font-medium">Trip #{trip.id.slice(0, 8)}</p>
                            <p className="text-xs text-muted-foreground">{trip.startLocation || 'TBD'} → {trip.endLocation || 'TBD'}</p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">{(trip.startTime || '').split('T')[0] || '—'}</span>
                      </div>
                    ))}
                    {upcomingTrips.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No upcoming trips</p>}
                  </CardContent>
                </Card>
              </div>

              {/* Right column */}
              <div className="space-y-6">
                {/* System Status */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between w-full">
                      <CardTitle className="text-sm font-semibold">Fleet Status</CardTitle>
                      <Link href="/fleet/vehicles" className="text-xs text-primary hover:underline flex items-center gap-0.5">Vehicles <ArrowUpRight className="h-3 w-3" /></Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Vehicles on Trip</span>
                      <span className="text-sm font-medium">{vehicles.filter((v: any) => v.status === 'on_trip').length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Drivers Active</span>
                      <span className="text-sm font-medium">{drivers.filter((d: any) => d.status === 'active').length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Trips in Progress</span>
                      <span className="text-sm font-medium">{trips.filter((t: any) => ['en_route', 'started'].includes(t.status)).length}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Top Drivers */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">Top Drivers</CardTitle>
                      <Link href="/fleet/drivers" className="text-xs text-primary hover:underline flex items-center gap-0.5">View all <ArrowUpRight className="h-3 w-3" /></Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {topDrivers.length > 0 ? topDrivers.map((driver, rank) => (
                      <div key={driver.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50">
                        <span className="text-xs font-bold text-muted-foreground w-4">#{rank + 1}</span>
                        <Avatar className="h-8 w-8"><AvatarFallback className="text-[10px]">{(driver.name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{driver.name}</p>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">{driver.experience ?? 0} yrs exp</span>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No drivers available</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
