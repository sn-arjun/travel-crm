'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const VEHICLE_TYPES = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'muv', label: 'MUV' },
  { value: 'tempo_traveller', label: 'Tempo Traveller' },
  { value: 'mini_bus', label: 'Mini Bus' },
  { value: 'bus', label: 'Bus' },
  { value: 'luxury_coach', label: 'Luxury Coach' },
] as const;

export default function NewVehiclePage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [form, setForm] = React.useState({
    registrationNumber: '',
    type: 'sedan',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    seatingCapacity: 4,
    color: '',
    notes: '',
  });

  function updateField(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.registrationNumber || !form.type) {
      toast.error('Registration number and vehicle type are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const { fleetApi } = await import('@/lib/api/fleet');
      await fleetApi.vehicles.create({
        registrationNumber: form.registrationNumber,
        type: form.type as 'sedan' | 'suv' | 'muv' | 'tempo_traveller' | 'mini_bus' | 'bus' | 'luxury_coach',
        make: form.make || undefined,
        model: form.model || undefined,
        year: form.year || undefined,
        seatingCapacity: form.seatingCapacity || undefined,
        color: form.color || undefined,
        notes: form.notes || undefined,
      });
      toast.success('Vehicle created successfully');
      router.push('/fleet/vehicles');
    } catch (error) {
      toast.error('Failed to create vehicle');
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
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Add Vehicle</h1>
            <p className="text-sm text-muted-foreground">Register a new vehicle in the fleet</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Vehicle
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
          {/* Vehicle Identity */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Car className="h-4 w-4" />Vehicle Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">Registration Number <span className="text-destructive">*</span></Label>
                  <Input id="registrationNumber" placeholder="e.g., KA01AB1234" value={form.registrationNumber} onChange={(e) => updateField('registrationNumber', e.target.value.toUpperCase())} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Vehicle Type <span className="text-destructive">*</span></Label>
                  <Select value={form.type} onValueChange={(v) => updateField('type', v)}>
                    <SelectTrigger id="type"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {VEHICLE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="make">Make</Label>
                  <Input id="make" placeholder="e.g., Toyota" value={form.make} onChange={(e) => updateField('make', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model</Label>
                  <Input id="model" placeholder="e.g., Innova Crysta" value={form.model} onChange={(e) => updateField('model', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seatingCapacity">Seating Capacity</Label>
                  <Input id="seatingCapacity" type="number" min={1} max={100} value={form.seatingCapacity} onChange={(e) => updateField('seatingCapacity', parseInt(e.target.value) || 4)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="color">Color</Label>
                  <Input id="color" placeholder="e.g., White" value={form.color} onChange={(e) => updateField('color', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Input id="year" type="number" min={1990} max={2030} value={form.year} onChange={(e) => updateField('year', parseInt(e.target.value) || 2024)} />
                </div>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
