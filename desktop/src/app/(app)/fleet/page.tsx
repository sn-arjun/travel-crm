'use client';


import { formatCalendarDay } from '@/lib/format';
import * as React from 'react';
import Link from 'next/link';
import { Plus, Truck, Users, MapPin, DollarSign, AlertTriangle, Star, ArrowUpRight, Calendar, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Tag } from '@/components/ui/tag';
import { PageHeader } from '@/components/ui/page-header';
import { PageContainer } from '@/components/layout/page-container';
import { StatCard } from '@/components/domain/stat-card';
import { cn, formatCompactCurrency, formatCurrency } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi, type Trip, type VehicleAvailabilityRow } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { TRIP_STATUS_LABELS } from '@travelcrm/shared';
import { formatDisplayDate, parseLocalDate, toLocalDateString } from '@/lib/dates';
import { tripLabel, formatTripWhenShort } from '@/components/domain/fleet/trip-format';

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
    <div className="flex items-center gap-ds-1" role="img" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className={cn('size-3', star <= Math.round(rating) ? 'text-ds-warning fill-ds-warning' : 'text-ds-foreground-subtle')}
        />
      ))}
      <span className="text-xs ml-ds-1 font-medium">{rating.toFixed(1)}</span>
    </div>
  );
}

// ── Vehicle Availability Calendar ─────────────────────────────────────────────

type DayStatus = 'available' | 'booked' | 'maintenance';

const DAY_STATUS: Record<DayStatus, { bg: string; label: string }> = {
  available: { bg: 'bg-ds-success-subtle', label: 'Available' },
  booked: { bg: 'bg-ds-danger-subtle', label: 'On trip' },
  maintenance: { bg: 'bg-ds-surface-sunken', label: 'Maintenance' },
};

const NUM_DAYS = 14;

function weekStart(from: Date) {
  const d = new Date(from);
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return toLocalDateString(d);
}

function dayOverlapsTrip(day: string, trip: VehicleAvailabilityRow['trips'][number]) {
  const dayStart = parseLocalDate(day).getTime();
  const dayEnd = dayStart + 86400000;
  const from = new Date(trip.pickupDatetime).getTime();
  const to = new Date(trip.dropDatetime).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return false;
  return from < dayEnd && to >= dayStart;
}

function VehicleAvailabilityCalendar() {
  const [startDate, setStartDate] = React.useState(() => weekStart(new Date()));
  const [rows, setRows] = React.useState<VehicleAvailabilityRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  const dates = React.useMemo(() => {
    const start = parseLocalDate(startDate);
    return Array.from({ length: NUM_DAYS }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return toLocalDateString(d);
    });
  }, [startDate]);

  const endDate = dates[dates.length - 1] ?? startDate;

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    fleetApi.vehicles.getAvailability({ from: startDate, to: endDate })
      .then((res) => {
        if (cancelled) return;
        setRows(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (cancelled) return;
        setRows([]);
        setFailed(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const shiftDates = (direction: number) => {
    const d = parseLocalDate(startDate);
    d.setDate(d.getDate() + direction * 7);
    setStartDate(toLocalDateString(d));
  };

  const cellFor = (row: VehicleAvailabilityRow, day: string): { status: DayStatus; note?: string } => {
    const trip = row.trips.find((t) => dayOverlapsTrip(day, t));
    if (trip) return { status: 'booked', note: trip.passengerName ?? undefined };
    if (row.status === 'under_maintenance' || row.status === 'maintenance') return { status: 'maintenance' };
    return { status: 'available' };
  };

  const today = toLocalDateString(new Date());

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-ds-2">
            <Calendar className="size-4" aria-hidden="true" />
            Vehicle Availability
          </CardTitle>
          <div className="flex items-center gap-ds-1">
            <Button variant="ghost" size="icon-sm" onClick={() => shiftDates(-1)} aria-label="Previous week">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStartDate(weekStart(new Date()))}>
              Today
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => shiftDates(1)} aria-label="Next week">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-ds-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : failed ? (
          <p className="text-sm text-ds-foreground-muted text-center py-ds-6">Availability could not be loaded. Try the arrows above or refresh the page.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-ds-foreground-muted text-center py-ds-6">No vehicles to display</p>
        ) : (
          <>
            <div className="flex items-center gap-ds-4 mb-ds-3">
              {Object.entries(DAY_STATUS).map(([key, { bg, label }]) => (
                <div key={key} className="flex items-center gap-ds-2 text-xs text-ds-foreground-muted">
                  <div className={cn('size-3 rounded-ds-sm', bg)} />
                  {label}
                </div>
              ))}
            </div>

            <div data-scroll-region="availability" className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-ds-2 px-ds-2 font-medium text-ds-foreground-muted sticky left-0 bg-ds-surface z-10 min-w-48">
                      Vehicle
                    </th>
                    {dates.map((date) => {
                      const d = parseLocalDate(date);
                      const isToday = date === today;
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <th
                          key={date}
                          className={cn(
                            'text-center py-ds-2 px-0.5 font-medium min-w-9',
                            isToday ? 'text-ds-primary' : isWeekend ? 'text-ds-foreground-subtle' : 'text-ds-foreground-muted',
                          )}
                        >
                          <div>{formatCalendarDay(d, { weekday: 'short' }).slice(0, 2)}</div>
                          <div className={cn(isToday && 'bg-ds-primary text-ds-primary-foreground rounded-ds-full size-5 flex items-center justify-center mx-auto')}>
                            {d.getDate()}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row) => (
                    <tr key={row.vehicleId} className="border-t border-ds-border">
                      <td className="py-ds-1 px-ds-2 sticky left-0 bg-ds-surface z-10">
                        <Link href={`/fleet/vehicles/${row.vehicleId}`} className="hover:underline">
                          <span className="font-mono font-medium">{row.registrationNumber}</span>
                          {row.type && <span className="text-ds-foreground-muted ml-ds-2 capitalize">{row.type.replace(/_/g, ' ')}</span>}
                        </Link>
                      </td>
                      {dates.map((date) => {
                        const { status, note } = cellFor(row, date);
                        const { bg, label } = DAY_STATUS[status];
                        return (
                          <td key={date} className="py-ds-1 px-0.5">
                            <div
                              className={cn('h-6 rounded-ds-sm', bg)}
                              title={`${row.registrationNumber}: ${label}${note ? ` (${note})` : ''} on ${formatDisplayDate(date)}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rows.length > 20 && (
              <p className="text-xs text-ds-foreground-muted text-center mt-ds-2">
                Showing 20 of {rows.length} vehicles.{' '}
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
    <Link href={`/fleet/trips/${trip.id}`}>
      <div className="flex items-center gap-ds-3 p-ds-3 rounded-ds-md border border-ds-border hover:bg-ds-surface-sunken transition-colors cursor-pointer">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-ds-2 mb-ds-1">
            <p className="text-sm font-medium truncate">{tripLabel(trip)}</p>
            <TripStatusTag status={trip.status} />
          </div>
          <p className="text-xs text-ds-foreground-muted truncate">{trip.startLocation || 'TBD'} → {trip.endLocation || 'TBD'}</p>
          <div className="flex items-center gap-ds-3 mt-ds-1 text-xs text-ds-foreground-muted">
            <span className="flex items-center gap-ds-1"><Truck className="size-3" aria-hidden="true" />{trip.vehicleRegistration || '—'}</span>
            <span className="flex items-center gap-ds-1"><Users className="size-3" aria-hidden="true" />{trip.driverName || '—'}</span>
            <span className="flex items-center gap-ds-1"><Calendar className="size-3" aria-hidden="true" />{formatTripWhenShort(trip.startTime)}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-medium">{formatCurrency(trip.fare ?? 0)}</p>
          <p className="text-xs text-ds-foreground-muted">{trip.distance ?? 0} km</p>
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
    <PageContainer className="gap-ds-6">
      <PageHeader
        title="Fleet Management"
        description="Vehicles, drivers, and trip assignments"
        actions={
          <>
            <Button variant="outline" asChild><Link href="/fleet/vehicles/new">Add Vehicle</Link></Button>
            <Button variant="outline" asChild><Link href="/fleet/drivers/new">Add Driver</Link></Button>
            <Button asChild><Link href="/fleet/trips/new"><Plus aria-hidden="true" />New Trip</Link></Button>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-ds-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-ds-4">
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
            <div className="flex items-center gap-ds-3 p-ds-3 rounded-ds-md border border-ds-warning bg-ds-warning-subtle">
              <AlertTriangle className="size-5 text-ds-warning shrink-0" aria-hidden="true" />
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

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-ds-4">
            <Link href="/fleet/vehicles">
              <StatCard title="Total Vehicles" value={totalVehicles} icon={<Truck className="size-5" />} suffix={`${availableVehicles} available`} />
            </Link>
            <Link href="/fleet/drivers">
              <StatCard title="Total Drivers" value={totalDrivers} icon={<Users className="size-5" />} suffix={`${activeDrivers} active`} />
            </Link>
            <Link href="/fleet/trips">
              <StatCard title="Active Trips" value={activeTripsList.length} icon={<MapPin className="size-5" />} />
            </Link>
            <StatCard title="Revenue (MTD)" value={formatCompactCurrency(revenueMtd)} icon={<DollarSign className="size-5" />} variant="primary" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-ds-6">
            <div className="lg:col-span-2 space-y-ds-6">
              {activeTripsList.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">Active Trips</CardTitle>
                      <Link href="/fleet/trips" className="text-xs text-ds-primary hover:underline flex items-center gap-ds-1">View all <ArrowUpRight className="size-3" aria-hidden="true" /></Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-ds-2">
                    {activeTripsList.slice(0, 6).map((trip) => <TripRow key={trip.id} trip={trip} />)}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Upcoming Trips</CardTitle>
                    <Link href="/fleet/trips" className="text-xs text-ds-primary hover:underline flex items-center gap-ds-1">View all <ArrowUpRight className="size-3" aria-hidden="true" /></Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-ds-2">
                  {upcomingTrips.slice(0, 5).map((trip) => (
                    <Link key={trip.id} href={`/fleet/trips/${trip.id}`}>
                      <div className="flex items-center justify-between gap-ds-3 p-ds-2 rounded-ds-md hover:bg-ds-surface-sunken cursor-pointer">
                        <div className="flex items-center gap-ds-3 min-w-0">
                          <div className="size-8 shrink-0 rounded-ds-full bg-ds-info-subtle flex items-center justify-center"><Clock className="size-4 text-ds-info-on-subtle" aria-hidden="true" /></div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{trip.passengerName || 'Trip'}</p>
                            <p className="text-xs text-ds-foreground-muted truncate">{trip.startLocation || 'TBD'} → {trip.endLocation || 'TBD'}</p>
                          </div>
                        </div>
                        <span className="text-xs text-ds-foreground-muted shrink-0">{formatTripWhenShort(trip.startTime)}</span>
                      </div>
                    </Link>
                  ))}
                  {upcomingTrips.length === 0 && <p className="text-sm text-ds-foreground-muted text-center py-ds-4">No upcoming trips</p>}
                </CardContent>
              </Card>

              {recentCompleted.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Recently Completed</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-ds-2">
                    {recentCompleted.slice(0, 5).map((trip) => (
                      <Link key={trip.id} href={`/fleet/trips/${trip.id}`}>
                        <div className="flex items-center justify-between gap-ds-3 p-ds-2 rounded-ds-md hover:bg-ds-surface-sunken cursor-pointer">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{trip.passengerName || 'Trip'}</p>
                            <p className="text-xs text-ds-foreground-muted truncate">{trip.startLocation || 'TBD'} → {trip.endLocation || 'TBD'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-ds-success">{formatCurrency(trip.totalCost || trip.fare || 0)}</p>
                            <p className="text-xs text-ds-foreground-muted">{formatTripWhenShort(trip.startTime)}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-ds-6">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between w-full">
                    <CardTitle className="text-sm font-semibold">Fleet Status</CardTitle>
                    <Link href="/fleet/vehicles" className="text-xs text-ds-primary hover:underline flex items-center gap-ds-1">Vehicles <ArrowUpRight className="size-3" aria-hidden="true" /></Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-ds-2">
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
                    <Link href="/fleet/drivers" className="text-xs text-ds-primary hover:underline flex items-center gap-ds-1">View all <ArrowUpRight className="size-3" aria-hidden="true" /></Link>
                  </div>
                </CardHeader>
                <CardContent className="space-y-ds-2">
                  {topDrivers.length > 0 ? topDrivers.map((driver, rank) => (
                    <Link key={driver.id} href={`/fleet/drivers/${driver.id}`}>
                      <div className="flex items-center gap-ds-3 p-ds-2 rounded-ds-md hover:bg-ds-surface-sunken cursor-pointer">
                        <span className="text-xs font-bold text-ds-foreground-muted w-4">#{rank + 1}</span>
                        <Avatar className="size-8"><AvatarFallback className="text-xs">{(driver.name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{driver.name}</p>
                          <StarRating rating={driver.rating ?? 0} />
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-ds-foreground-muted">{driver.totalTrips ?? 0} {(driver.totalTrips ?? 0) === 1 ? 'trip' : 'trips'}</p>
                        </div>
                      </div>
                    </Link>
                  )) : (
                    <p className="text-sm text-ds-foreground-muted text-center py-ds-4">No drivers have completed trips yet</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <VehicleAvailabilityCalendar />
        </>
      )}
    </PageContainer>
  );
}
