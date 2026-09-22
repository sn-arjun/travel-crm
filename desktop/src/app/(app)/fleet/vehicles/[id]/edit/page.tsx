'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { z } from 'zod';
import { EntityForm, FormRow } from '@/components/domain';
import {
  Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SectionCard, Skeleton,
} from '@/components/ui';
import { fleetApi } from '@/lib/api/fleet';
import { useApiQuery } from '@/hooks/use-api';
import { toast } from 'sonner';
import { VEHICLE_TYPE_LABELS, VEHICLE_STATUS_LABELS } from '@travelcrm/shared';

const VEHICLE_COLORS = ['White', 'Silver', 'Black', 'Grey', 'Blue', 'Red', 'Brown', 'Green', 'Maroon', 'Gold'] as const;

const schema = z.object({
  registrationNumber: z.string().min(1, 'Registration number is required'),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().optional(),
  capacity: z.number().optional(),
  color: z.string().optional(),
  status: z.string().optional(),
  mileage: z.number().optional(),
});
type VehicleForm = z.infer<typeof schema>;

export default function EditVehiclePage() {
  const router = useRouter();
  const params = useParams();
  const vehicleId = params.id as string;

  const { data: vehicleResponse, loading, error } = useApiQuery(
    () => fleetApi.vehicles.getById(vehicleId),
    [vehicleId],
  );
  const vehicle = vehicleResponse?.data;

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-ds-foreground-muted">Vehicle not found</p>
      </div>
    );
  }

  return (
    <EntityForm<VehicleForm>
      title="Edit vehicle"
      description={vehicle.registrationNumber}
      schema={schema}
      defaultValues={{
        registrationNumber: vehicle.registrationNumber || '',
        make: vehicle.make || '',
        model: vehicle.model || '',
        year: vehicle.year || new Date().getFullYear(),
        capacity: vehicle.seatingCapacity ?? vehicle.capacity ?? 4,
        color: vehicle.color || '',
        status: vehicle.status || 'active',
        mileage: vehicle.odometerKm ?? vehicle.mileage ?? 0,
      }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        try {
          await fleetApi.vehicles.update(vehicleId, {
            registrationNumber: v.registrationNumber.toUpperCase(),
            make: v.make || undefined,
            model: v.model || undefined,
            year: v.year || undefined,
            capacity: v.capacity || undefined,
            status: v.status as 'active' | 'maintenance' | 'inactive' | undefined,
            mileage: v.mileage,
          });
          toast.success('Vehicle updated successfully');
          router.push(`/fleet/vehicles/${vehicleId}`);
        } catch {
          toast.error('Failed to update vehicle');
        }
      }}
      renderSections={(form) => (
        <SectionCard title="Vehicle details" required>
          <div className="grid gap-ds-4 sm:grid-cols-2">
            <FormRow name="registrationNumber" label="Registration number" required>
              <Input
                {...form.register('registrationNumber')}
                placeholder="e.g., KA01AB1234"
                onChange={(e) => form.setValue('registrationNumber', e.target.value.toUpperCase(), { shouldDirty: true })}
              />
            </FormRow>
            <FormRow name="status" label="Status">
              <Select value={form.watch('status')} onValueChange={(v) => form.setValue('status', v, { shouldDirty: true })}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(VEHICLE_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow name="make" label="Make">
              <Input {...form.register('make')} placeholder="e.g., Toyota" />
            </FormRow>
            <FormRow name="model" label="Model">
              <Input {...form.register('model')} placeholder="e.g., Innova Crysta" />
            </FormRow>
            <FormRow name="capacity" label="Seating capacity">
              <Input
                type="number"
                min={1}
                max={100}
                value={form.watch('capacity') ?? ''}
                onChange={(e) => form.setValue('capacity', e.target.value ? Number(e.target.value) : undefined, { shouldDirty: true })}
              />
            </FormRow>
            <FormRow name="year" label="Year">
              <Input
                type="number"
                min={1990}
                max={2030}
                value={form.watch('year') ?? ''}
                onChange={(e) => form.setValue('year', e.target.value ? Number(e.target.value) : undefined, { shouldDirty: true })}
              />
            </FormRow>
            <FormRow name="color" label="Color">
              <Select value={form.watch('color') || undefined} onValueChange={(v) => form.setValue('color', v, { shouldDirty: true })}>
                <SelectTrigger><SelectValue placeholder="Select color" /></SelectTrigger>
                <SelectContent>
                  {VEHICLE_COLORS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow name="mileage" label="Odometer (km)">
              <Input
                type="number"
                min={0}
                value={form.watch('mileage') ?? ''}
                onChange={(e) => form.setValue('mileage', e.target.value ? Number(e.target.value) : undefined, { shouldDirty: true })}
              />
            </FormRow>
          </div>
        </SectionCard>
      )}
    />
  );
}
