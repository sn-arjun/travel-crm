'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, Save, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { VEHICLE_TYPE_LABELS } from '@travelcrm/shared';
import { useApiQuery, useApiMutation } from '@/hooks/use-api';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';

const VEHICLE_COLORS = ['White', 'Silver', 'Black', 'Grey', 'Blue', 'Red', 'Brown', 'Green', 'Maroon', 'Gold'] as const;

export default function EditVehiclePage() {
  const router = useRouter();
  const params = useParams();
  const vehicleId = params.id as string;

  const { data: vehicleResponse, loading: vehicleLoading, error: vehicleError } = useApiQuery(
    () => fleetApi.vehicles.getById(vehicleId),
    [vehicleId],
  );

  const { mutate: updateVehicle, loading: isSubmitting } = useApiMutation(
    (data: any) => fleetApi.vehicles.update(vehicleId, data),
  );

  const vehicle = vehicleResponse?.data;

  const [form, setForm] = React.useState({
    registrationNumber: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    capacity: 4,
  });

  // Initialize form when vehicle loads
  React.useEffect(() => {
    if (vehicle) {
      setForm({
        registrationNumber: vehicle.registrationNumber || '',
        make: vehicle.make || '',
        model: vehicle.model || '',
        year: vehicle.year || new Date().getFullYear(),
        capacity: vehicle.capacity || 4,
      });
    }
  }, [vehicle]);

  function updateField(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await updateVehicle(form);
    if (result) {
      toast.success('Vehicle updated successfully');
      router.push('/fleet/vehicles');
    } else {
      toast.error('Failed to update vehicle');
    }
  }

  if (vehicleLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading vehicle...</p>
      </div>
    );
  }

  if (vehicleError || !vehicle) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Vehicle not found</p>
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
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Edit Vehicle</h1>
            <p className="text-sm text-muted-foreground">{vehicle.registrationNumber}</p>
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
          {/* Vehicle Identity */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Car className="h-4 w-4" />Vehicle Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">Registration Number <span className="text-destructive">*</span></Label>
                  <Input id="registrationNumber" placeholder="e.g., KA01AB1234" value={(form as any).registrationNumber} onChange={(e) => updateField('registrationNumber', e.target.value.toUpperCase())} required />
                </div>
                <div className="space-y-2">
                  <Label>Vehicle Type <span className="text-destructive">*</span></Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Select value={(form as any).type} onValueChange={(v) => updateField('type', v)}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(VEHICLE_TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="make">Make <span className="text-destructive">*</span></Label>
                  <Input id="make" placeholder="e.g., Toyota" value={(form as any).make} onChange={(e) => updateField('make', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="model">Model <span className="text-destructive">*</span></Label>
                  <Input id="model" placeholder="e.g., Innova Crysta" value={(form as any).model} onChange={(e) => updateField('model', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <Input id="year" type="number" min={2000} max={2030} value={(form as any).year} onChange={(e) => updateField('year', parseInt(e.target.value) || 2024)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Color</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Select value={(form as any).color} onValueChange={(v) => updateField('color', v)}>
                    <SelectTrigger><SelectValue placeholder="Select color" /></SelectTrigger>
                    <SelectContent>
                      {VEHICLE_COLORS.map((c: any) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="seatingCapacity">Seating Capacity</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="seatingCapacity" type="number" min={1} max={60} value={(form as any).seatingCapacity} onChange={(e) => updateField('seatingCapacity', parseInt(e.target.value) || 4)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="odometerReading">Odometer (km)</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="odometerReading" type="number" min={0} value={(form as any).odometerReading} onChange={(e) => updateField('odometerReading', parseInt(e.target.value) || 0)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader><CardTitle className="text-base">Document Expiry Dates</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="insuranceExpiry">Insurance Expiry</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="insuranceExpiry" type="date" value={(form as any).insuranceExpiry} onChange={(e) => updateField('insuranceExpiry', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="permitExpiry">Permit Expiry</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="permitExpiry" type="date" value={(form as any).permitExpiry} onChange={(e) => updateField('permitExpiry', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pollutionExpiry">Pollution Certificate Expiry</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="pollutionExpiry" type="date" value={(form as any).pollutionExpiry} onChange={(e) => updateField('pollutionExpiry', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Owner Info */}
          <Card>
            <CardHeader><CardTitle className="text-base">Owner Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ownerName">Owner Name</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="ownerName" placeholder="Vehicle owner name" value={(form as any).ownerName} onChange={(e) => updateField('ownerName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ownerPhone">Owner Phone</Label>
                  // @ts-ignore-next-line
        // @ts-expect-error
                  <Input id="ownerPhone" placeholder="+91 XXXXX XXXXX" value={(form as any).ownerPhone} onChange={(e) => updateField('ownerPhone', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                // @ts-ignore-next-line
        // @ts-expect-error
                <Textarea id="notes" placeholder="Any notes about the vehicle..." value={(form as any).notes} onChange={(e) => updateField('notes', e.target.value)} rows={3} />
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
