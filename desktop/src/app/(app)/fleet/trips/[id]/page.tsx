'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, MapPin, ArrowRight, Truck, User, Phone, Calendar, Clock,
  DollarSign, FileText, CheckCircle2, Circle, AlertTriangle, Plane, Train,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { fleetApi, type Trip } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  TRIP_STATUS_LABELS, TRIP_STATUS_COLORS,
  FLEET_TRIP_TYPE_LABELS, VEHICLE_TYPE_LABELS,
} from '@travelcrm/shared';

const TRIP_STATUS_ORDER = ['assigned', 'accepted', 'en_route', 'started', 'completed'] as const;

function StatusTimeline({ currentStatus, history }: { currentStatus: string; history: { status: string; timestamp: string; userName: string }[] }) {
  const currentIdx = TRIP_STATUS_ORDER.indexOf(currentStatus as typeof TRIP_STATUS_ORDER[number]);

  return (
    <div className="space-y-0">
      {TRIP_STATUS_ORDER.map((status, idx) => {
        const historyEntry = history.find((h) => h.status === status);
        const isComplete = idx <= currentIdx && currentStatus !== 'cancelled';
        const isCurrent = status === currentStatus;
        const color = TRIP_STATUS_COLORS[status as keyof typeof TRIP_STATUS_COLORS] || '#64748B';
        const label = TRIP_STATUS_LABELS[status as keyof typeof TRIP_STATUS_LABELS] || status;

        return (
          <div key={status} className="flex gap-3">
            <div className="flex flex-col items-center">
              {isComplete ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color }} />
              ) : (
                <Circle className={cn('h-5 w-5 shrink-0', isCurrent ? 'text-blue-500' : 'text-muted-foreground/30')} />
              )}
              {idx < TRIP_STATUS_ORDER.length - 1 && (
                <div className={cn('w-px flex-1 min-h-8', isComplete ? 'bg-green-300' : 'bg-border')} />
              )}
            </div>
            <div className="pb-6">
              <p className={cn('text-sm font-medium', isComplete ? 'text-foreground' : 'text-muted-foreground')}>{label}</p>
              {historyEntry && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(historyEntry.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {' · '}{historyEntry.userName}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TripDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;

  const { data: response, loading, error, refetch } = useApiQuery<any>(
    () => fleetApi.trips.getById(tripId),
    [tripId],
  );

  const { mutate: updateTrip, loading: isUpdatingStatus } = useApiMutation<any, any>(
    (data) => fleetApi.trips.update(tripId, data),
  );

  const trip = response?.data as Trip | undefined;

  const handleStatusUpdate = async (newStatus: string) => {
    const result = await updateTrip({ status: newStatus });
    if (result) {
      toast.success(`Trip status updated to ${newStatus.replace('_', ' ')}`);
      refetch();
    } else {
      toast.error('Failed to update trip status');
    }
  };

  const handleCancelTrip = async () => {
    if (!confirm('Are you sure you want to cancel this trip?')) return;
    const result = await updateTrip({ status: 'cancelled' });
    if (result) {
      toast.success('Trip cancelled successfully');
      refetch();
    } else {
      toast.error('Failed to cancel trip');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading trip details...</div>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Truck className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-muted-foreground">Trip not found</p>
        <Button variant="outline" onClick={() => router.push('/fleet/trips')}>Back to Trips</Button>
      </div>
    );
  }

  // Mock the extended trip data that our UI expects
  const extendedTrip = {
    ...trip,
    pickupLocation: trip.startLocation ?? '',
    dropLocation: trip.endLocation ?? '',
    passengerName: 'Passenger', // Will need API extension
    passengerPhone: 'N/A',
    tripType: 'standard',
    startDate: new Date(trip.startTime).toLocaleDateString('en-IN'),
    endDate: new Date(trip.endTime).toLocaleDateString('en-IN'),
    estimatedDistance: 100,
    estimatedCost: trip.fare ?? 0,
    vehicle: {
      make: 'Toyota',
      model: 'Innova',
      registrationNumber: 'KA-01-AB-1234',
      type: 'suv',
      seatingCapacity: 7,
    },
    driver: {
      name: 'Driver Name',
      phone: '+91-XXXXXX',
      rating: 4.5,
    },
    status: trip.status ?? 'scheduled',
    statusHistory: [
      { status: trip.status ?? 'scheduled', timestamp: trip.startTime, userName: 'System' },
    ],
  } as any;

  const statusColor = TRIP_STATUS_COLORS[extendedTrip.status as keyof typeof TRIP_STATUS_COLORS] || '#64748B';
  const statusLabel = TRIP_STATUS_LABELS[extendedTrip.status as keyof typeof TRIP_STATUS_LABELS] || extendedTrip.status;
  const tripTypeLabel = FLEET_TRIP_TYPE_LABELS[extendedTrip.tripType as keyof typeof FLEET_TRIP_TYPE_LABELS] || extendedTrip.tripType;
  const vehicleTypeLabel = VEHICLE_TYPE_LABELS[extendedTrip.vehicle.type as keyof typeof VEHICLE_TYPE_LABELS] || extendedTrip.vehicle.type;

  // Determine next valid status transitions
  const statusIdx = TRIP_STATUS_ORDER.indexOf(extendedTrip.status as typeof TRIP_STATUS_ORDER[number]);
  const nextStatus = statusIdx >= 0 && statusIdx < TRIP_STATUS_ORDER.length - 1 ? TRIP_STATUS_ORDER[statusIdx + 1] : null;
  const nextStatusLabel = nextStatus ? TRIP_STATUS_LABELS[nextStatus as keyof typeof TRIP_STATUS_LABELS] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                {extendedTrip.pickupLocation} → {extendedTrip.dropLocation}
              </h1>
              <Badge variant="outline" className="text-[10px] border-transparent" style={{ backgroundColor: `${statusColor}15`, color: statusColor }}>
                {statusLabel}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {extendedTrip.passengerName} · {tripTypeLabel} · {extendedTrip.startDate}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {nextStatus && nextStatusLabel && extendedTrip.status !== 'completed' && extendedTrip.status !== 'cancelled' && (
            <Button onClick={() => handleStatusUpdate(nextStatus)} disabled={isUpdatingStatus}>
              {isUpdatingStatus ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              Mark as {nextStatusLabel}
            </Button>
          )}
          {extendedTrip.status !== 'completed' && extendedTrip.status !== 'cancelled' && (
            <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleCancelTrip} disabled={isUpdatingStatus}>
              Cancel Trip
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="info" className="flex-1 flex flex-col">
        <div className="px-6 pt-3 border-b">
          <TabsList>
            <TabsTrigger value="info">Trip Info</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="costs">Costs</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Info Tab */}
          <TabsContent value="info" className="mt-0">
            <div className="max-w-4xl space-y-6">
              {/* Route Card */}
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" />Route</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Pickup</p>
                      <p className="text-sm font-medium mt-0.5">{extendedTrip.pickupLocation}</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Drop</p>
                      <p className="text-sm font-medium mt-0.5">{extendedTrip.dropLocation}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Start Date</p>
                      <p className="text-sm font-medium flex items-center gap-1 mt-0.5"><Calendar className="h-3 w-3" />{extendedTrip.startDate}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">End Date</p>
                      <p className="text-sm font-medium flex items-center gap-1 mt-0.5"><Calendar className="h-3 w-3" />{extendedTrip.endDate}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Est. Distance</p>
                      <p className="text-sm font-medium mt-0.5">{extendedTrip.estimatedDistance} km</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Passenger Card */}
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" />Passenger</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Name</span><span className="text-sm font-medium">{extendedTrip.passengerName}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Phone</span><span className="text-sm font-medium">{extendedTrip.passengerPhone}</span></div>
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Trip Type</span><Badge variant="outline" className="text-xs">{tripTypeLabel}</Badge></div>
                  </CardContent>
                </Card>

                {/* Vehicle & Driver Card */}
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" />Vehicle & Driver</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Vehicle</p>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                          <Truck className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{extendedTrip.vehicle.make} {extendedTrip.vehicle.model}</p>
                          <p className="text-xs text-muted-foreground font-mono">{extendedTrip.vehicle.registrationNumber} · {vehicleTypeLabel} · {extendedTrip.vehicle.seatingCapacity} seats</p>
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Driver</p>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="text-xs">{extendedTrip.driver.name.split(' ').map((n: any) => n[0]).join('')}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{extendedTrip.driver.name}</p>
                          <p className="text-xs text-muted-foreground">{extendedTrip.driver.phone} · ★{extendedTrip.driver.rating}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Timeline Tab */}
          <TabsContent value="timeline" className="mt-0">
            <div className="max-w-xl">
              <Card>
                <CardHeader><CardTitle className="text-base">Status Timeline</CardTitle></CardHeader>
                <CardContent>
                  {extendedTrip.status === 'cancelled' ? (
                    <div className="flex items-center gap-3 p-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                      <div>
                        <p className="text-sm font-medium text-red-700 dark:text-red-400">Trip Cancelled</p>
                        <p className="text-xs text-red-600 dark:text-red-300 mt-0.5">This trip was cancelled</p>
                      </div>
                    </div>
                  ) : (
                    <StatusTimeline currentStatus={extendedTrip.status} history={extendedTrip.statusHistory} />
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Costs Tab */}
          <TabsContent value="costs" className="mt-0">
            <div className="max-w-2xl space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><DollarSign className="h-4 w-4" />Cost Breakdown</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Estimated Cost</span><span className="text-sm font-medium">₹{extendedTrip.estimatedCost.toLocaleString('en-IN')}</span></div>
                  {extendedTrip.actualCost !== undefined && (
                    <div className="flex justify-between"><span className="text-sm text-muted-foreground">Actual Cost</span><span className="text-sm font-semibold">₹{extendedTrip.actualCost.toLocaleString('en-IN')}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-sm text-muted-foreground">Estimated Distance</span><span className="text-sm font-medium">{extendedTrip.estimatedDistance} km</span></div>
                  <Separator />
                  {extendedTrip.actualCost !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Variance</span>
                      <span className={cn('text-sm font-bold', extendedTrip.actualCost > extendedTrip.estimatedCost ? 'text-red-600' : 'text-green-600')}>
                        {extendedTrip.actualCost > extendedTrip.estimatedCost ? '+' : ''}₹{(extendedTrip.actualCost - extendedTrip.estimatedCost).toLocaleString('en-IN')}
                        {' '}({extendedTrip.actualCost > extendedTrip.estimatedCost ? '+' : ''}{(((extendedTrip.actualCost - extendedTrip.estimatedCost) / extendedTrip.estimatedCost) * 100).toFixed(1)}%)
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Generate Invoice</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">Create an invoice from this trip&apos;s cost details.</p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      const cost = extendedTrip.actualCost ?? extendedTrip.estimatedCost ?? 0;
                      const q = new URLSearchParams({
                        tripId,
                        amount: String(cost),
                        description: `Fleet Trip: ${extendedTrip.pickupLocation} → ${extendedTrip.dropoffLocation}`,
                      });
                      router.push(`/invoices/new?${q.toString()}`);
                    }}
                  >
                    <DollarSign className="h-4 w-4 mr-1.5" />
                    Create Invoice from Trip
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
