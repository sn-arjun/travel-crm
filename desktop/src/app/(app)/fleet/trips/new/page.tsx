'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Route } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { fleetApi } from '@/lib/api/fleet';
import { useApiQuery } from '@/hooks/use-api';

export default function NewTripPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const vehiclesQuery = useApiQuery(
    () => fleetApi.vehicles.list({ limit: 100 }).then(res => res.data),
    []
  );

  const driversQuery = useApiQuery(
    () => fleetApi.drivers.list({ limit: 100 }).then(res => res.data),
    []
  );

  const [form, setForm] = React.useState({
    vehicleId: '',
    driverId: '',
    startLocation: '',
    endLocation: '',
    startTime: '',
    endTime: '',
    distance: '',
    fare: '',
    status: 'scheduled' as const,
  });

  function updateField(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  const vehicles: any[] = Array.isArray(vehiclesQuery.data) ? vehiclesQuery.data : (vehiclesQuery.data?.data ?? []);
  const drivers: any[] = Array.isArray(driversQuery.data) ? driversQuery.data : (driversQuery.data?.data ?? []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.vehicleId || !form.driverId || !form.startLocation || !form.endLocation || !form.startTime || !form.endTime || !form.distance || !form.fare) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      await fleetApi.trips.create({
        vehicleId: form.vehicleId,
        driverId: form.driverId,
        startLocation: form.startLocation,
        endLocation: form.endLocation,
        startTime: form.startTime,
        endTime: form.endTime,
        distance: parseInt(form.distance as string),
        fare: parseInt(form.fare as string),
        status: form.status,
      });
      toast.success('Trip created successfully');
      router.push('/fleet/trips');
    } catch (error) {
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
          {/* Route */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Route className="h-4 w-4" />Route & Schedule</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startLocation">Start Location <span className="text-destructive">*</span></Label>
                  <Input id="startLocation" placeholder="e.g., Mumbai Airport" value={form.startLocation} onChange={(e) => updateField('startLocation', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endLocation">End Location <span className="text-destructive">*</span></Label>
                  <Input id="endLocation" placeholder="e.g., Hotel Grand Hyatt" value={form.endLocation} onChange={(e) => updateField('endLocation', e.target.value)} required />
                </div>
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
                  <Select value={form.vehicleId} onValueChange={(v) => updateField('vehicleId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.registrationNumber} — {v.make} {v.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{vehicles.length} vehicles available</p>
                </div>
                <div className="space-y-2">
                  <Label>Driver <span className="text-destructive">*</span></Label>
                  <Select value={form.driverId} onValueChange={(v) => updateField('driverId', v)}>
                    <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                    <SelectContent>
                      {drivers.map((d: any) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{drivers.length} drivers available</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader><CardTitle className="text-base">Trip Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="distance">Distance (km) <span className="text-destructive">*</span></Label>
                  <Input id="distance" type="number" min={0} placeholder="0" value={form.distance} onChange={(e) => updateField('distance', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fare">Fare (₹) <span className="text-destructive">*</span></Label>
                  <Input id="fare" type="number" min={0} placeholder="0" value={form.fare} onChange={(e) => updateField('fare', e.target.value)} required />
                </div>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
