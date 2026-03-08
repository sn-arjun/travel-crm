'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { VEHICLE_TYPE_LABELS, FLEET_TRIP_TYPE_LABELS } from '@travelcrm/shared';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';

export default function EditTripPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;

  const { data: tripResponse, loading: tripLoading, error: tripError } = useApiQuery(
    () => fleetApi.trips.getById(tripId),
    [tripId],
  );

  const { data: vehiclesResponse } = useApiQuery(
    () => fleetApi.vehicles.list({ limit: 100 }),
    [],
  );

  const { data: driversResponse } = useApiQuery(
    () => fleetApi.drivers.list({ limit: 100 }),
    [],
  );

  const { mutate: updateTrip, loading: isSubmitting } = useApiMutation(
    (data: any) => fleetApi.trips.update(tripId, data),
  );

  const trip = tripResponse?.data;

  const vehiclesData = vehiclesResponse?.data;
  const allVehicles = Array.isArray(vehiclesData) ? vehiclesData : (vehiclesData?.data ?? []);
  const availableVehicles = allVehicles.filter((v: any) => v.status === 'active');

  const driversData = driversResponse?.data;
  const allDrivers = Array.isArray(driversData) ? driversData : (driversData?.data ?? []);
  const availableDrivers = allDrivers.filter((d: any) => d.status === 'active');

  const [form, setForm] = React.useState({
    vehicleId: '',
    driverId: '',
    startLocation: '',
    endLocation: '',
    startTime: '',
    endTime: '',
    distance: 0,
    fare: 0,
    status: 'scheduled' as any,
  });

  // Initialize form when trip loads
  React.useEffect(() => {
    if (trip) {
      setForm({
        vehicleId: trip.vehicleId || '',
        driverId: trip.driverId || '',
        startLocation: trip.startLocation || '',
        endLocation: trip.endLocation || '',
        startTime: trip.startTime || '',
        endTime: trip.endTime || '',
        distance: trip.distance || 0,
        fare: trip.fare || 0,
        status: trip.status || 'scheduled',
      });
    }
  }, [trip]);

  function updateField(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await updateTrip(form);
    if (result) {
      toast.success('Trip updated successfully');
      router.push('/fleet/trips');
    } else {
      toast.error('Failed to update trip');
    }
  }

  if (tripLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading trip...</p>
      </div>
    );
  }

  if (tripError || !trip) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Trip not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Edit Trip</h1>
            // @ts-ignore-next-line
            <p className="text-sm text-muted-foreground">{(trip as any).passengerName} • {(trip as any).pickupLocation}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
          {/* Passenger Info */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Route className="h-4 w-4" />Passenger Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="passengerName">Passenger Name <span className="text-destructive">*</span></Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="passengerName" placeholder="e.g., Rahul Sharma" value={(form as any).passengerName} onChange={(e) => updateField('passengerName', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="passengerPhone">Passenger Phone</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="passengerPhone" placeholder="+91 XXXXX XXXXX" value={(form as any).passengerPhone} onChange={(e) => updateField('passengerPhone', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="passengers">Number of Passengers</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="passengers" type="number" min={1} max={60} value={(form as any).passengers} onChange={(e) => updateField('passengers', parseInt(e.target.value) || 1)} />
                </div>
                <div className="space-y-2">
                  <Label>Trip Type <span className="text-destructive">*</span></Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Select value={(form as any).tripType} onValueChange={(v) => updateField('tripType', v)}>
                    <SelectTrigger><SelectValue placeholder="Select trip type" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FLEET_TRIP_TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Route */}
          <Card>
            <CardHeader><CardTitle className="text-base">Route & Schedule</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pickupLocation">Pickup Location <span className="text-destructive">*</span></Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="pickupLocation" placeholder="e.g., Mumbai Airport T2" value={(form as any).pickupLocation} onChange={(e) => updateField('pickupLocation', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dropLocation">Drop Location <span className="text-destructive">*</span></Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="dropLocation" placeholder="e.g., Hotel Grand Hyatt" value={(form as any).dropLocation} onChange={(e) => updateField('dropLocation', e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pickupDate">Pickup Date <span className="text-destructive">*</span></Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="pickupDate" type="date" value={(form as any).pickupDate} onChange={(e) => updateField('pickupDate', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pickupTime">Pickup Time</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="pickupTime" type="time" value={(form as any).pickupTime} onChange={(e) => updateField('pickupTime', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="returnDate">Return Date</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="returnDate" type="date" value={(form as any).returnDate} onChange={(e) => updateField('returnDate', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="flightNumber">Flight Number</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="flightNumber" placeholder="e.g., AI-302" value={(form as any).flightNumber} onChange={(e) => updateField('flightNumber', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trainNumber">Train Number</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="trainNumber" placeholder="e.g., 12951" value={(form as any).trainNumber} onChange={(e) => updateField('trainNumber', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vehicle & Driver Assignment */}
          <Card>
            <CardHeader><CardTitle className="text-base">Vehicle & Driver Assignment</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vehicle <span className="text-destructive">*</span></Label>
                  <Select value={(form as any).vehicleId} onValueChange={(v) => updateField('vehicleId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                    <SelectContent>
                      {availableVehicles.map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.registrationNumber} — {v.make} {v.model} ({v.seatingCapacity} seats)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{availableVehicles.length} vehicles available</p>
                </div>
                <div className="space-y-2">
                  <Label>Driver <span className="text-destructive">*</span></Label>
                  <Select value={(form as any).driverId} onValueChange={(v) => updateField('driverId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                    <SelectContent>
                      {availableDrivers.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} (★{d.rating} · {d.totalTrips} trips)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{availableDrivers.length} drivers available</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader><CardTitle className="text-base">Pricing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="estimatedKm">Estimated KM</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="estimatedKm" type="number" min={0} placeholder="0" value={(form as any).estimatedKm} onChange={(e) => updateField('estimatedKm', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estimatedCost">Estimated Cost (₹) <span className="text-destructive">*</span></Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="estimatedCost" type="number" min={0} placeholder="0" value={(form as any).estimatedCost} onChange={(e) => updateField('estimatedCost', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="advanceAmount">Advance Amount (₹)</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="advanceAmount" type="number" min={0} placeholder="0" value={(form as any).advanceAmount} onChange={(e) => updateField('advanceAmount', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Special Instructions */}
          <Card>
            <CardHeader><CardTitle className="text-base">Special Instructions</CardTitle></CardHeader>
            <CardContent>
              // @ts-ignore-next-line
        // @ts-expect-error
              <Textarea id="specialInstructions" placeholder="e.g., Guest is VIP, needs water bottles, wheelchair access..." value={(form as any).specialInstructions} onChange={(e) => updateField('specialInstructions', e.target.value)} rows={3} />
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
