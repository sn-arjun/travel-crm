'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Truck, Users, MapPin, DollarSign, AlertTriangle, Star, ArrowUpRight, Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/domain/stat-card';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi, type Trip, type Vehicle } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { TRIP_STATUS_LABELS, TRIP_STATUS_COLORS } from '@travelcrm/shared';
import { toLocalDateString } from '@/lib/dates';

function formatCurrency(amount: number) {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(0)}K`;
  return `₹${amount}`;
}

function tripStatusTone(status: string): 'success' | 'danger' | 'info' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  return 'info';
}

function TripStatusTag({ status }: { status: string }) {
  const label = TRIP_STATUS_LABELS[status as keyof typeof TRIP_STATUS_LABELS] || status;
  return <Tag tone={tripStatusTone(status)} size="sm">{label}</Tag>;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={cn('h-3 w-3', star <= Math.round(rating) ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30')} />
      ))}
      <span className="text-xs ml-1 font-medium">{rating.toFixed(1)}</span>
    </div>
  );
}

// ── Vehicle Availability Calendar ─────────────────────────────────────────────
function VehicleAvailabilityCalendar() {
  const [startDate, setStartDate] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay()); // start of this week (Sunday)
    return toLocalDateString(d);
  });
  const [availabilityData, setAvailabilityData] = React.useState<Record<string, Array<{ date: string; status: string; tripId?: string }>>>({});
  const [vehicles, setVehicles] = React.useState<Vehicle[]>([]);
  const [loading, setLoading] = React.useState(true);

  const numDays = 14; // Show 2 weeks

  const dates = React.useMemo(() => {
    const result: string[] = [];
    const start = new Date(startDate);
    for (let i = 0; i < numDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      result.push(toLocalDateString(d));
    }
    return result;
  }, [startDate]);

  const endDate = dates[dates.length - 1] ?? startDate;

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fleetApi.vehicles.list({ limit: 50 }).catch(() => null),
      fleetApi.vehicles.getAvailability({ from: startDate, to: endDate }).catch(() => null),
    ]).then(([vehiclesRes, availRes]) => {
      if (cancelled) return;

      const vData = vehiclesRes?.data;
      const vItems = Array.isArray(vData) ? vData : (vData as any)?.data ?? [];
      setVehicles(vItems);

      const rawAvail = (availRes as any)?.data ?? availRes ?? {};
      const availMap: Record<string, Array<{ date: string; status: string; tripId?: string }>> = {};

      if (typeof rawAvail === 'object' && !Array.isArray(rawAvail)) {
        for (const [vehicleId, entries] of Object.entries(rawAvail)) {
          if (Array.isArray(entries)) {
            availMap[vehicleId] = entries as Array<{ date: string; status: string; tripId?: string }>;
          }
        }
      }

      for (const v of vItems) {
        if (!availMap[v.id]) {
          availMap[v.id] = dates.map((date) => ({
            date,
            status: v.status === 'maintenance' ? 'maintenance' : v.status === 'on_trip' ? 'on_trip' : 'available',
          }));
        }
      }

      setAvailabilityData(availMap);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [startDate, endDate, dates]);

  const shiftDates = (direction: number) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + direction * 7);
    setStartDate(toLocalDateString(d));
  };

  const getStatusForDate = (vehicleId: string, date: string): string => {
    const entries = availabilityData[vehicleId];
    if (!entries) return 'available';
    const entry = entries.find((e) => e.date === date);
    return entry?.status ?? 'available';
  };

  const statusColors: Record<string, { bg: string; label: string }> = {
    available: { bg: 'bg-ds-success-subtle', label: 'Available' },
    on_trip: { bg: 'bg-ds-danger-subtle', label: 'On Trip' },
    maintenance: { bg: 'bg-ds-surface-sunken', label: 'Maintenance' },
    inactive: { bg: 'bg-ds-surface-sunken', label: 'Inactive' },
  };

  const today = toLocalDateString(new Date());

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Vehicle Availability
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => shiftDates(-1)} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - d.getDay());
                setStartDate(toLocalDateString(d));
              }}
            >
              Today
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => shiftDates(1)} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : vehicles.length === 0 ? (
          <p className="text-sm text-ds-foreground-muted text-center py-6">No vehicles to display</p>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-3">
              {Object.entries(statusColors).map(([key, { bg, label }]) => (
                <div key={key} className="flex items-center gap-1.5 text-[11px] text-ds-foreground-muted">
                  <div className={cn('h-3 w-3 rounded-ds-sm', bg)} />
                  {label}
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-1.5 px-2 font-medium text-ds-foreground-muted sticky left-0 bg-ds-background z-10 min-w-[140px]">
                      Vehicle
                    </th>
                    {dates.map((date) => {
                      const d = new Date(date);
                      const isToday = date === today;
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <th
                          key={date}
                          className={cn(
                            'text-center py-1.5 px-0.5 font-medium min-w-[36px]',
                            isToday ? 'text-ds-primary' : isWeekend ? 'text-ds-foreground-subtle' : 'text-ds-foreground-muted',
                          )}
                        >
                          <div className="text-[10px]">{d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 2)}</div>
                          <div className={cn('text-xs', isToday && 'bg-ds-primary text-ds-primary-foreground rounded-ds-full w-5 h-5 flex items-center justify-center mx-auto')}>
                            {d.getDate()}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {vehicles.slice(0, 20).map((vehicle) => (
                    <tr key={vehicle.id} className="border-t border-ds-border/50">
                      <td className="py-1 px-2 sticky left-0 bg-ds-background z-10">
                        <Link href={`/fleet/vehicles/${vehicle.id}`} className="hover:underline">
                          <span className="font-mono font-medium text-[11px]">{vehicle.registrationNumber}</span>
                          <span className="text-ds-foreground-muted ml-1.5 text-[10px]">{vehicle.make} {vehicle.model}</span>
                        </Link>
                      </td>
                      {dates.map((date) => {
                        const status = getStatusForDate(vehicle.id, date);
                        const { bg, label } = statusColors[status] ?? statusColors.available!;
                        return (
                          <td key={date} className="py-1 px-0.5">
                            <div
                              className={cn('h-6 rounded-ds-sm', bg)}
                              title={`${vehicle.registrationNumber}: ${label} on ${date}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {vehicles.length > 20 && (
              <p className="text-xs text-ds-foreground-muted text-center mt-2">
                Showing 20 of {vehicles.length} vehicles.{' '}
                <Link href="/fleet/vehicles" className="text-ds-primary hover:underline">View all</Link>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TripRow({ trip }: { trip: Trip }) {
  return (
    <Link key={trip.id} href={`/fleet/trips/${trip.id}`}>
      <div className="flex items-center gap-3 p-3 rounded-ds-md border border-ds-border hover:bg-ds-surface-sunken transition-colors cursor-pointer">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium truncate">Trip #{trip.id.slice(0, 8)}</p>
            <TripStatusTag status={trip.status} />
          </div>
          <p className="text-xs text-ds-foreground-muted truncate">{trip.startLocation || 'TBD'} → {trip.endLocation || 'TBD'}</p>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-ds-foreground-muted">
            <span className="flex items-center gap-1"><Truck className="h-3 w-3" />{trip.vehicleRegistration || trip.vehicleId}</span>
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{trip.driverName || trip.driverId}</span>
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{(trip.startTime || '').split('T')[0] || '—'}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-medium">₹{(trip.fare ?? 0).toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-ds-foreground-muted">{trip.distance ?? 0}km</p>
        </div>
      </div>
    </Link>
  );
}

export default function FleetDashboardPage() {
  const dashboardQuery = useApiQuery(
    () => fleetApi.dashboard().then((res) => res.data),
    [],
  );

  React.useEffect(() => {
    if (dashboardQuery.error) {
      toast.error('Failed to load fleet dashboard');
    }
  }, [dashboardQuery.error]);

  const dashboard = dashboardQuery.data;

  const vehicleSummary = dashboard?.vehicleSummary;
  const driverSummary = dashboard?.driverSummary;
  const totalVehicles = vehicleSummary?.total ?? 0;
  const availableVehicles = vehicleSummary?.available ?? 0;
  const totalDrivers = driverSummary?.total ?? 0;
  const activeDrivers = driverSummary?.active ?? 0;
  const activeTripsList = dashboard?.activeTripsList ?? [];
  const upcomingTrips = dashboard?.upcomingTrips ?? [];
  const recentCompleted = dashboard?.recentCompletedTrips ?? [];
  const topDrivers = (dashboard?.topDrivers ?? []).slice(0, 5);
  const expiringDocumentsCount = dashboard?.expiringDocumentsCount ?? 0;
  const maintenanceDueCount = dashboard?.maintenanceDueCount ?? 0;
  const revenueMtd = dashboard?.revenueMtd ?? 0;

  const isLoading = dashboardQuery.loading;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-6 pt-4">
        <PageHeader
          title="Fleet Management"
          description="Vehicles, drivers, and trip assignments"
          actions={
            <>
              <Button variant="outline" asChild><Link href="/fleet/vehicles/new">Add Vehicle</Link></Button>
              <Button variant="outline" asChild><Link href="/fleet/drivers/new">Add Driver</Link></Button>
              <Button asChild><Link href="/fleet/trips/new"><Plus className="h-4 w-4 mr-1.5" />New Trip</Link></Button>
            </>
          }
        />
      </div>

      <div className="flex-1 p-6 space-y-6">
        {isLoading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            {(expiringDocumentsCount > 0 || maintenanceDueCount > 0) && (
              <div className="flex items-center gap-3 p-3 rounded-ds-md border border-ds-warning bg-ds-warning-subtle">
                <AlertTriangle className="h-5 w-5 text-ds-warning shrink-0" />
                <div className="flex-1 text-sm text-ds-warning-on-subtle">
                  {expiringDocumentsCount > 0 && <span><strong>{expiringDocumentsCount}</strong> expiring documents</span>}
                  {expiringDocumentsCount > 0 && maintenanceDueCount > 0 && ' · '}
                  {maintenanceDueCount > 0 && <span><strong>{maintenanceDueCount}</strong> vehicles due for maintenance</span>}
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/fleet/alerts">View Alerts</Link>
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/fleet/vehicles">
                <StatCard title="Total Vehicles" value={totalVehicles} icon={<Truck className="h-5 w-5" />} suffix={`${availableVehicles} available`} />
              </Link>
              <Link href="/fleet/drivers">
                <StatCard title="Total Drivers" value={totalDrivers} icon={<Users className="h-5 w-5" />} suffix={`${activeDrivers} active`} />
              </Link>
              <Link href="/fleet/trips">
                <StatCard title="Active Trips" value={activeTripsList.length} icon={<MapPin className="h-5 w-5" />} />
              </Link>
              <StatCard title="Revenue (MTD)" value={formatCurrency(revenueMtd)} icon={<DollarSign className="h-5 w-5" />} variant="primary" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {activeTripsList.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">Active Trips</CardTitle>
                        <Link href="/fleet/trips" className="text-xs text-ds-primary hover:underline flex items-center gap-0.5">View all <ArrowUpRight className="h-3 w-3" /></Link>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {activeTripsList.slice(0, 6).map((trip) => <TripRow key={trip.id} trip={trip} />)}
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">Upcoming Trips</CardTitle>
                      <Link href="/fleet/trips" className="text-xs text-ds-primary hover:underline flex items-center gap-0.5">View all <ArrowUpRight className="h-3 w-3" /></Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {upcomingTrips.slice(0, 5).map((trip) => (
                      <Link key={trip.id} href={`/fleet/trips/${trip.id}`}>
                        <div className="flex items-center justify-between p-2 rounded-ds-md hover:bg-ds-surface-sunken cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-ds-full bg-ds-info-subtle flex items-center justify-center"><Clock className="h-4 w-4 text-ds-info-on-subtle" /></div>
                            <div>
                              <p className="text-sm font-medium">Trip #{trip.id.slice(0, 8)}</p>
                              <p className="text-xs text-ds-foreground-muted">{trip.startLocation || 'TBD'} → {trip.endLocation || 'TBD'}</p>
                            </div>
                          </div>
                          <span className="text-xs text-ds-foreground-muted">{(trip.startTime || '').split('T')[0] || '—'}</span>
                        </div>
                      </Link>
                    ))}
                    {upcomingTrips.length === 0 && <p className="text-sm text-ds-foreground-muted text-center py-4">No upcoming trips</p>}
                  </CardContent>
                </Card>

                {recentCompleted.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Recently Completed</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {recentCompleted.slice(0, 5).map((trip) => (
                        <Link key={trip.id} href={`/fleet/trips/${trip.id}`}>
                          <div className="flex items-center justify-between p-2 rounded-ds-md hover:bg-ds-surface-sunken cursor-pointer">
                            <div>
                              <p className="text-sm font-medium">Trip #{trip.id.slice(0, 8)}</p>
                              <p className="text-xs text-ds-foreground-muted">{trip.startLocation || 'TBD'} → {trip.endLocation || 'TBD'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-ds-success">₹{(trip.totalCost || trip.fare || 0).toLocaleString('en-IN')}</p>
                              <p className="text-xs text-ds-foreground-muted">{(trip.startTime || '').split('T')[0] || '—'}</p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between w-full">
                      <CardTitle className="text-sm font-semibold">Fleet Status</CardTitle>
                      <Link href="/fleet/vehicles" className="text-xs text-ds-primary hover:underline flex items-center gap-0.5">Vehicles <ArrowUpRight className="h-3 w-3" /></Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-ds-foreground-muted">Available</span>
                      <span className="text-sm font-medium text-ds-success">{availableVehicles}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-ds-foreground-muted">On Trip</span>
                      <span className="text-sm font-medium text-ds-info">{vehicleSummary?.on_trip ?? 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-ds-foreground-muted">Drivers Active</span>
                      <span className="text-sm font-medium">{activeDrivers}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-ds-foreground-muted">Drivers On Trip</span>
                      <span className="text-sm font-medium">{driverSummary?.on_trip ?? 0}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">Top Drivers</CardTitle>
                      <Link href="/fleet/drivers" className="text-xs text-ds-primary hover:underline flex items-center gap-0.5">View all <ArrowUpRight className="h-3 w-3" /></Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {topDrivers.length > 0 ? topDrivers.map((driver, rank) => (
                      <Link key={driver.id} href={`/fleet/drivers/${driver.id}`}>
                        <div className="flex items-center gap-3 p-2 rounded-ds-md hover:bg-ds-surface-sunken cursor-pointer">
                          <span className="text-xs font-bold text-ds-foreground-muted w-4">#{rank + 1}</span>
                          <Avatar className="h-8 w-8"><AvatarFallback className="text-[10px]">{(driver.name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{driver.name}</p>
                            <StarRating rating={driver.rating ?? 0} />
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-ds-foreground-muted">{driver.totalTrips ?? 0} trips</p>
                          </div>
                        </div>
                      </Link>
                    )) : (
                      <p className="text-sm text-ds-foreground-muted text-center py-4">No drivers available</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <VehicleAvailabilityCalendar />
          </>
        )}
      </div>
    </div>
  );
}
