'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Truck, Users, MapPin, DollarSign, AlertTriangle, Star, ArrowUpRight, Calendar, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { TRIP_STATUS_LABELS, TRIP_STATUS_COLORS } from '@travelcrm/shared';

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

export default function FleetDashboardPage() {
  const dashboardQuery = useApiQuery(
    () => fleetApi.dashboard().then(res => res.data),
    []
  );

  React.useEffect(() => {
    if (dashboardQuery.error) {
      toast.error('Failed to load fleet dashboard');
    }
  }, [dashboardQuery.error]);

  const dashboard = dashboardQuery.data as any;

  const totalVehicles = dashboard?.totalVehicles ?? 0;
  const availableVehicles = dashboard?.availableVehicles ?? 0;
  const totalDrivers = dashboard?.totalDrivers ?? 0;
  const activeDrivers = dashboard?.activeDrivers ?? 0;
  const activeTrips = dashboard?.activeTrips ?? 0;
  const revenueMtd = dashboard?.revenueMtd ?? 0;
  const activeTripsList: any[] = dashboard?.activeTrips && Array.isArray(dashboard?.activeTrips) ? dashboard.activeTrips : [];
  const upcomingTrips: any[] = dashboard?.upcomingTrips ?? [];
  const recentCompleted: any[] = dashboard?.recentCompletedTrips ?? [];
  const topDrivers: any[] = (dashboard?.topDrivers ?? []).slice(0, 5);
  const expiringDocumentsCount = dashboard?.expiringDocumentsCount ?? 0;
  const maintenanceDueCount = dashboard?.maintenanceDueCount ?? 0;

  const isLoading = dashboardQuery.loading;

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
            {/* Alerts Banner */}
            {(expiringDocumentsCount > 0 || maintenanceDueCount > 0) && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <div className="flex-1 text-sm text-amber-800 dark:text-amber-300">
                  {expiringDocumentsCount > 0 && <span><strong>{expiringDocumentsCount}</strong> expiring documents</span>}
                  {expiringDocumentsCount > 0 && maintenanceDueCount > 0 && ' · '}
                  {maintenanceDueCount > 0 && <span><strong>{maintenanceDueCount}</strong> vehicles due for maintenance</span>}
                </div>
                <Button variant="outline" size="sm" asChild className="border-amber-400 text-amber-700 hover:bg-amber-100">
                  <Link href="/fleet/alerts">View Alerts</Link>
                </Button>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/fleet/vehicles">
                <StatCard title="Total Vehicles" value={totalVehicles} icon={Truck} color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" subtitle={`${availableVehicles} available`} />
              </Link>
              <Link href="/fleet/drivers">
                <StatCard title="Total Drivers" value={totalDrivers} icon={Users} color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" subtitle={`${activeDrivers} active`} />
              </Link>
              <Link href="/fleet/trips">
                <StatCard title="Active Trips" value={typeof activeTrips === 'number' ? activeTrips : activeTripsList.length} icon={MapPin} color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
              </Link>
              <StatCard title="Revenue (MTD)" value={formatCurrency(revenueMtd)} icon={DollarSign} color="bg-primary/10 text-primary" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Active / Upcoming Trips */}
              <div className="lg:col-span-2 space-y-6">
                {/* Active Trips */}
                {activeTripsList.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">Active Trips</CardTitle>
                        <Link href="/fleet/trips" className="text-xs text-primary hover:underline flex items-center gap-0.5">View all <ArrowUpRight className="h-3 w-3" /></Link>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {activeTripsList.slice(0, 6).map((trip: any) => (
                        <Link key={trip.id} href={`/fleet/trips/${trip.id}`}>
                          <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-medium truncate">Trip #{trip.id.slice(0, 8)}</p>
                                <TripStatusBadge status={trip.status} />
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{trip.startLocation || 'TBD'} → {trip.endLocation || 'TBD'}</p>
                              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                                <span className="flex items-center gap-1"><Truck className="h-3 w-3" />{trip.vehicleRegistration || trip.vehicleId}</span>
                                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{trip.driverName || trip.driverId}</span>
                                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{(trip.startTime || '').split('T')[0] || '—'}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-medium">₹{(trip.fare ?? 0).toLocaleString('en-IN')}</p>
                              <p className="text-[11px] text-muted-foreground">{trip.distance ?? 0}km</p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Upcoming Trips */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">Upcoming Trips</CardTitle>
                      <Link href="/fleet/trips" className="text-xs text-primary hover:underline flex items-center gap-0.5">View all <ArrowUpRight className="h-3 w-3" /></Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {upcomingTrips.slice(0, 5).map((trip: any) => (
                      <Link key={trip.id} href={`/fleet/trips/${trip.id}`}>
                        <div className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" /></div>
                            <div>
                              <p className="text-sm font-medium">Trip #{trip.id.slice(0, 8)}</p>
                              <p className="text-xs text-muted-foreground">{trip.startLocation || 'TBD'} → {trip.endLocation || 'TBD'}</p>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">{(trip.startTime || '').split('T')[0] || '—'}</span>
                        </div>
                      </Link>
                    ))}
                    {upcomingTrips.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No upcoming trips</p>}
                  </CardContent>
                </Card>

                {/* Recent Completed Trips */}
                {recentCompleted.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Recently Completed</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {recentCompleted.slice(0, 5).map((trip: any) => (
                        <Link key={trip.id} href={`/fleet/trips/${trip.id}`}>
                          <div className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                            <div>
                              <p className="text-sm font-medium">Trip #{trip.id.slice(0, 8)}</p>
                              <p className="text-xs text-muted-foreground">{trip.startLocation || 'TBD'} → {trip.endLocation || 'TBD'}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-green-600">₹{(trip.actualCost || trip.fare || 0).toLocaleString('en-IN')}</p>
                              <p className="text-xs text-muted-foreground">{(trip.startTime || '').split('T')[0] || '—'}</p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Right column */}
              <div className="space-y-6">
                {/* Fleet Status */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between w-full">
                      <CardTitle className="text-sm font-semibold">Fleet Status</CardTitle>
                      <Link href="/fleet/vehicles" className="text-xs text-primary hover:underline flex items-center gap-0.5">Vehicles <ArrowUpRight className="h-3 w-3" /></Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Available</span>
                      <span className="text-sm font-medium text-green-600">{availableVehicles}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">On Trip</span>
                      <span className="text-sm font-medium text-blue-600">{dashboard?.vehiclesOnTrip ?? 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Drivers Active</span>
                      <span className="text-sm font-medium">{activeDrivers}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Drivers On Trip</span>
                      <span className="text-sm font-medium">{dashboard?.driversOnTrip ?? 0}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Top Drivers (sorted by rating) */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">Top Drivers</CardTitle>
                      <Link href="/fleet/drivers" className="text-xs text-primary hover:underline flex items-center gap-0.5">View all <ArrowUpRight className="h-3 w-3" /></Link>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {topDrivers.length > 0 ? topDrivers.map((driver, rank) => (
                      <Link key={driver.id} href={`/fleet/drivers/${driver.id}`}>
                        <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer">
                          <span className="text-xs font-bold text-muted-foreground w-4">#{rank + 1}</span>
                          <Avatar className="h-8 w-8"><AvatarFallback className="text-[10px]">{(driver.name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</AvatarFallback></Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{driver.name}</p>
                            <StarRating rating={driver.rating ?? 0} />
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-muted-foreground">{driver.totalTrips ?? 0} trips</p>
                          </div>
                        </div>
                      </Link>
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
