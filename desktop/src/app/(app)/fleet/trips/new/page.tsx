'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Route, User, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { PhoneInput } from '@/components/ui/phone-input';
import { toast } from 'sonner';
import { fleetApi } from '@/lib/api/fleet';
import { useApiQuery } from '@/hooks/use-api';

const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

function LocationInput({ id, label, value, onChange, required }: { id: string; label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  if (mapsApiKey) {
    // When Google Maps is available, we'd use AddressAutocomplete — for now fall through to Input
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{label} {required && <span className="text-destructive">*</span>}</Label>
        <Input id={id} placeholder={`Enter ${label.toLowerCase()}`} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label} {required && <span className="text-destructive">*</span>}</Label>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input id={id} className="pl-9" placeholder={`Enter ${label.toLowerCase()}`} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
      </div>
    </div>
  );
}

export default function NewTripPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [vehicleSearch, setVehicleSearch] = React.useState('');
  const [driverSearch, setDriverSearch] = React.useState('');

  const vehiclesQuery = useApiQuery(
    () => fleetApi.vehicles.list({ limit: 50, search: vehicleSearch || undefined }).then(res => res.data),
    [vehicleSearch]
  );

  const driversQuery = useApiQuery(
    () => fleetApi.drivers.list({ limit: 50, search: driverSearch || undefined }).then(res => res.data),
    [driverSearch]
  );

  const prefillLeadId = searchParams.get('leadId') || '';
  const prefillPassengerName = searchParams.get('passengerName') || '';
  const prefillPassengerPhone = searchParams.get('passengerPhone') || '';

  const [form, setForm] = React.useState({
    vehicleId: '',
    driverId: '',
    leadId: prefillLeadId,
    passengerName: prefillPassengerName,
    passengerPhone: prefillPassengerPhone,
    specialInstructions: '',
    startLocation: '',
    endLocation: '',
    startTime: '',
    endTime: '',
    distance: '',
    fare: '',
  });

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const vehicles: any[] = Array.isArray(vehiclesQuery.data) ? vehiclesQuery.data : (vehiclesQuery.data?.data ?? []);
  const drivers: any[] = Array.isArray(driversQuery.data) ? driversQuery.data : (driversQuery.data?.data ?? []);

  const vehicleOptions = vehicles.map((v: any) => ({
    value: v.id,
    label: `${v.registrationNumber} — ${v.make} ${v.model}`,
  }));

  const driverOptions = drivers.map((d: any) => ({
    value: d.id,
    label: d.name + (d.phone ? ` (${d.phone})` : ''),
  }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.vehicleId || !form.driverId || !form.startLocation || !form.endLocation || !form.startTime || !form.endTime) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      await fleetApi.trips.create({
        vehicleId: form.vehicleId,
        driverId: form.driverId,
        leadId: form.leadId || undefined,
        passengerName: form.passengerName || undefined,
        passengerPhone: form.passengerPhone || undefined,
        specialInstructions: form.specialInstructions || undefined,
        startLocation: form.startLocation,
        endLocation: form.endLocation,
        startTime: form.startTime,
        endTime: form.endTime,
        distance: form.distance ? parseInt(form.distance) : undefined,
        fare: form.fare ? parseInt(form.fare) : undefined,
      });
      toast.success('Trip created successfully');
      router.push('/fleet/trips');
    } catch {
      toast.error('Failed to create trip');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>New Trip Assignment</h1>
            <p className="text-sm text-muted-foreground">Create a new trip and assign vehicle & driver</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Create Trip
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
          {/* Route & Schedule */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Route className="h-4 w-4" />Route & Schedule</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <LocationInput id="startLocation" label="Start Location" value={form.startLocation} onChange={(v) => updateField('startLocation', v)} required />
                <LocationInput id="endLocation" label="End Location" value={form.endLocation} onChange={(v) => updateField('endLocation', v)} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startTime">Start Time <span className="text-destructive">*</span></Label>
                  <Input id="startTime" type="datetime-local" value={form.startTime} onChange={(e) => updateField('startTime', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endTime">End Time <span className="text-destructive">*</span></Label>
                  <Input id="endTime" type="datetime-local" value={form.endTime} onChange={(e) => updateField('endTime', e.target.value)} required />
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
                  <Combobox
                    options={vehicleOptions}
                    value={form.vehicleId}
                    onValueChange={(v) => updateField('vehicleId', v)}
                    onSearch={setVehicleSearch}
                    placeholder="Search vehicles..."
                    searchPlaceholder="Registration or make/model..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Driver <span className="text-destructive">*</span></Label>
                  <Combobox
                    options={driverOptions}
                    value={form.driverId}
                    onValueChange={(v) => updateField('driverId', v)}
                    onSearch={setDriverSearch}
                    placeholder="Search drivers..."
                    searchPlaceholder="Driver name or phone..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Passenger Details */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" />Passenger Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="passengerName">Passenger Name</Label>
                  <Input id="passengerName" placeholder="Full name" value={form.passengerName} onChange={(e) => updateField('passengerName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="passengerPhone">Passenger Phone</Label>
                  <PhoneInput
                    value={form.passengerPhone}
                    onChange={(v) => updateField('passengerPhone', v)}
                    placeholder="Phone number"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="specialInstructions">Special Instructions</Label>
                <Textarea
                  id="specialInstructions"
                  placeholder="Any special requirements or instructions..."
                  value={form.specialInstructions}
                  onChange={(e) => updateField('specialInstructions', e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Trip Details */}
          <Card>
            <CardHeader><CardTitle className="text-base">Trip Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="distance">Estimated Distance (km)</Label>
                  <Input id="distance" type="number" min={0} placeholder="0" value={form.distance} onChange={(e) => updateField('distance', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fare">Estimated Fare (₹)</Label>
                  <Input id="fare" type="number" min={0} placeholder="0" value={form.fare} onChange={(e) => updateField('fare', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
