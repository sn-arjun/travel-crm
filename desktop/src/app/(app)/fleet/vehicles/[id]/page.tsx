'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Car, MapPin, Gauge, Calendar, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useApiQuery } from '@/hooks/use-api';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { VEHICLE_STATUS_LABELS, VEHICLE_STATUS_COLORS, TRIP_STATUS_LABELS, TRIP_STATUS_COLORS } from '@travelcrm/shared';

export default function VehicleDetailPage() {
  const router = useRouter();
  const params = useParams();
  const vehicleId = params.id as string;

  const vehicleQuery = useApiQuery(
    () => fleetApi.vehicles.getById(vehicleId).then(res => res.data),
    [vehicleId]
  );

  const tripsQuery = useApiQuery(
    // @ts-ignore-next-line
    () => fleetApi.trips.list({ limit: 100 }).then(res => res.data.filter((t: any) => t.vehicleId === vehicleId)),
    [vehicleId]
  );

  React.useEffect(() => {
    if (vehicleQuery.error) {
      toast.error('Failed to load vehicle details');
    }
  }, [vehicleQuery.error]);

  const vehicle = vehicleQuery.data;
  const vehicleTrips = tripsQuery.data ?? [];

  if (vehicleQuery.loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">Loading vehicle details...</p>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Car className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground">Vehicle not found</p>
        <Button variant="outline" onClick={() => router.push('/fleet/vehicles')}>Back to Vehicles</Button>
      </div>
    );
  }

  const statusColor = VEHICLE_STATUS_COLORS[vehicle.status as keyof typeof VEHICLE_STATUS_COLORS] || '#64748B';
  const statusLabel = VEHICLE_STATUS_LABELS[vehicle.status as keyof typeof VEHICLE_STATUS_LABELS] || vehicle.status;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {vehicle.make} {vehicle.model}
              </h1>
              <Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
                {statusLabel}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground font-mono">{vehicle.registrationNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">Edit Vehicle</Button>
          <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50">Deactivate</Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex-1 flex flex-col">
        <div className="px-6 pt-3 border-b">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="trips">Trip History ({vehicleTrips.length})</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <TabsContent value="overview" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
              <Card>
                <CardHeader><CardTitle className="text-base">Vehicle Information</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Registration</span><span className="text-sm font-medium font-mono">{vehicle.registrationNumber}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Make & Model</span><span className="text-sm font-medium">{vehicle.make} {vehicle.model}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Year</span><span className="text-sm font-medium">{vehicle.year}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Capacity</span><span className="text-sm font-medium">{vehicle.capacity} seats</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Mileage</span><span className="text-sm font-medium flex items-center gap-1"><Gauge className="h-3 w-3" />{vehicle.mileage?.toLocaleString() ?? 0} km</span></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Current Status</span><Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>{statusLabel}</Badge></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Total Trips</span><span className="text-sm font-medium">{vehicleTrips.length}</span></div>
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Total Revenue</span><span className="text-sm font-medium">₹{vehicleTrips.reduce((sum: any, t: any) => sum + t.fare, 0).toLocaleString('en-IN')}</span></div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trips" className="mt-0">
            <div className="max-w-4xl">
              {vehicleTrips.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No trips assigned to this vehicle yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {vehicleTrips.map((trip: any) => {
                    const tripStatusColor = TRIP_STATUS_COLORS[trip.status as keyof typeof TRIP_STATUS_COLORS] || '#64748B';
                    const tripStatusLabel = TRIP_STATUS_LABELS[trip.status as keyof typeof TRIP_STATUS_LABELS] || trip.status;
                    return (
                      <div key={trip.id} className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">Trip #{trip.id.slice(0, 8)}</p>
                            <Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${tripStatusColor}15`, color: tripStatusColor }}>{tripStatusLabel}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{trip.startLocation} → {trip.endLocation}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium">₹{trip.fare.toLocaleString('en-IN')}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end"><Calendar className="h-3 w-3" />{trip.startTime.split('T')[0]}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
