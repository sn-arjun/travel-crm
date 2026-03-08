'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Save, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VEHICLE_TYPE_LABELS, FLEET_TRIP_TYPE_LABELS } from '@travelcrm/shared';
import { useApiMutation } from '@/hooks/use-api';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';

export default function NewRateCardPage() {
  const router = useRouter();

  const { mutate: createRateCard, loading: isSubmitting } = useApiMutation(
    (data: any) => fleetApi.rateCards.create(data),
  );

  const [form, setForm] = React.useState({
    name: '',
    vehicleType: '',
    tripType: '',
    baseFare: '',
    perKmRate: '',
    perHourRate: '',
    minimumKm: '',
    minimumHours: '',
    extraKmRate: '',
    extraHourRate: '',
    nightCharge: '',
    driverAllowance: '',
    tollIncluded: false,
    parkingIncluded: false,
    isActive: true,
    validFrom: '',
    validTo: '',
  });

  function updateField(field: string, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.vehicleType) {
      toast.error('Name and vehicle type are required');
      return;
    }
    const result = await createRateCard({
      name: form.name,
      vehicleType: form.vehicleType,
      tripType: form.tripType || undefined,
      baseFare: parseFloat(form.baseFare) || 0,
      perKmRate: parseFloat(form.perKmRate) || 0,
      perHourRate: form.perHourRate ? parseFloat(form.perHourRate) : undefined,
      minimumKm: form.minimumKm ? parseFloat(form.minimumKm) : undefined,
      minimumHours: form.minimumHours ? parseFloat(form.minimumHours) : undefined,
      extraKmRate: form.extraKmRate ? parseFloat(form.extraKmRate) : undefined,
      extraHourRate: form.extraHourRate ? parseFloat(form.extraHourRate) : undefined,
      nightCharge: form.nightCharge ? parseFloat(form.nightCharge) : undefined,
      driverAllowance: form.driverAllowance ? parseFloat(form.driverAllowance) : undefined,
      tollIncluded: form.tollIncluded,
      parkingIncluded: form.parkingIncluded,
      isActive: form.isActive,
      validFrom: form.validFrom || undefined,
      validTo: form.validTo || undefined,
    });
    if (result) {
      toast.success('Rate card created successfully');
      router.push('/fleet/rate-cards');
    } else {
      toast.error('Failed to create rate card');
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
            <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>New Rate Card</h1>
            <p className="text-sm text-muted-foreground">Define pricing for a vehicle and trip type combination</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Create Rate Card
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" />Basic Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Rate Card Name <span className="text-destructive">*</span></Label>
                <Input id="name" placeholder="e.g., SUV Outstation" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vehicle Type <span className="text-destructive">*</span></Label>
                  <Select value={form.vehicleType} onValueChange={(v) => updateField('vehicleType', v)}>
                    <SelectTrigger><SelectValue placeholder="Select vehicle type" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(VEHICLE_TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Trip Type</Label>
                  <Select value={form.tripType} onValueChange={(v) => updateField('tripType', v)}>
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

          <Card>
            <CardHeader><CardTitle className="text-base">Base Pricing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="baseFare">Base Fare (₹) <span className="text-destructive">*</span></Label>
                  <Input id="baseFare" type="number" min={0} placeholder="0" value={form.baseFare} onChange={(e) => updateField('baseFare', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="perKmRate">Per KM Rate (₹) <span className="text-destructive">*</span></Label>
                  <Input id="perKmRate" type="number" min={0} placeholder="0" value={form.perKmRate} onChange={(e) => updateField('perKmRate', e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="perHourRate">Per Hour Rate (₹)</Label>
                  <Input id="perHourRate" type="number" min={0} placeholder="0" value={form.perHourRate} onChange={(e) => updateField('perHourRate', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="minimumKm">Minimum KM</Label>
                  <Input id="minimumKm" type="number" min={0} placeholder="0" value={form.minimumKm} onChange={(e) => updateField('minimumKm', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minimumHours">Minimum Hours</Label>
                  <Input id="minimumHours" type="number" min={0} placeholder="0" value={form.minimumHours} onChange={(e) => updateField('minimumHours', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Extra & Additional Charges</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="extraKmRate">Extra KM Rate (₹)</Label>
                  <Input id="extraKmRate" type="number" min={0} placeholder="0" value={form.extraKmRate} onChange={(e) => updateField('extraKmRate', e.target.value)} />
                  <p className="text-xs text-muted-foreground">Charged per km beyond minimum</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="extraHourRate">Extra Hour Rate (₹)</Label>
                  <Input id="extraHourRate" type="number" min={0} placeholder="0" value={form.extraHourRate} onChange={(e) => updateField('extraHourRate', e.target.value)} />
                  <p className="text-xs text-muted-foreground">Charged per hour beyond minimum</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nightCharge">Night Charge (₹)</Label>
                  <Input id="nightCharge" type="number" min={0} placeholder="0" value={form.nightCharge} onChange={(e) => updateField('nightCharge', e.target.value)} />
                  <p className="text-xs text-muted-foreground">Applied for trips after 10 PM</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="driverAllowance">Driver Allowance (₹)</Label>
                  <Input id="driverAllowance" type="number" min={0} placeholder="0" value={form.driverAllowance} onChange={(e) => updateField('driverAllowance', e.target.value)} />
                  <p className="text-xs text-muted-foreground">Per-day driver allowance</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Inclusions & Status</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Toll Included</p>
                  <p className="text-xs text-muted-foreground">Include toll charges in the rate</p>
                </div>
                <Switch checked={form.tollIncluded} onCheckedChange={(v) => updateField('tollIncluded', v)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Parking Included</p>
                  <p className="text-xs text-muted-foreground">Include parking charges in the rate</p>
                </div>
                <Switch checked={form.parkingIncluded} onCheckedChange={(v) => updateField('parkingIncluded', v)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-xs text-muted-foreground">Enable this rate card for use</p>
                </div>
                <Switch checked={form.isActive} onCheckedChange={(v) => updateField('isActive', v)} />
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  );
}
