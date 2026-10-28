'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { z } from 'zod';
import { EntityForm, FormRow } from '@/components/domain';
import {
  Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SectionCard, Skeleton, Textarea,
} from '@/components/ui';
import { fleetApi } from '@/lib/api/fleet';
import type { CreateVehicleRequest } from '@/lib/api/fleet';
import { useApiQuery } from '@/hooks/use-api';
import { toast } from 'sonner';
import { VEHICLE_TYPE_LABELS, VEHICLE_STATUS_LABELS } from '@travelcrm/shared';

const VEHICLE_COLORS = ['White', 'Silver', 'Black', 'Grey', 'Blue', 'Red', 'Brown', 'Green', 'Maroon', 'Gold'] as const;

const schema = z.object({
  registrationNumber: z.string().min(1, 'Registration number is required'),
  type: z.string().min(1, 'Vehicle type is required'),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().optional(),
  seatingCapacity: z.number().optional(),
  color: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
  odometerKm: z.number().optional(),
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

  const initialOdometer = vehicle.odometerKm ?? undefined;
  const initialStatus = vehicle.status || 'available';
  const colorOptions: string[] = vehicle.color && !(VEHICLE_COLORS as readonly string[]).includes(vehicle.color)
    ? [...VEHICLE_COLORS, vehicle.color]
    : [...VEHICLE_COLORS];

  return (
    <EntityForm<VehicleForm>
      title="Edit vehicle"
      description={vehicle.registrationNumber}
      schema={schema}
      defaultValues={{
        registrationNumber: vehicle.registrationNumber || '',
        type: vehicle.type || 'sedan',
        make: vehicle.make || '',
        model: vehicle.model || '',
        year: vehicle.year ?? undefined,
        seatingCapacity: vehicle.seatingCapacity ?? undefined,
        color: vehicle.color || '',
        notes: vehicle.notes || '',
        status: initialStatus,
        odometerKm: initialOdometer,
      }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        try {
          await fleetApi.vehicles.update(vehicleId, {
            registrationNumber: v.registrationNumber.toUpperCase(),
            type: v.type as CreateVehicleRequest['type'],
            make: v.make || undefined,
            model: v.model || undefined,
            year: v.year || undefined,
            seatingCapacity: v.seatingCapacity || undefined,
            color: v.color || undefined,
            notes: v.notes || undefined,
          });
          if (v.status && v.status !== initialStatus) {
            await fleetApi.vehicles.updateStatus(vehicleId, v.status);
          }
          if (v.odometerKm && v.odometerKm !== initialOdometer) {
            await fleetApi.vehicles.updateOdometer(vehicleId, v.odometerKm);
          }
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
                id="registrationNumber"
                {...form.register('registrationNumber')}
                placeholder="e.g., KA01AB1234"
                onChange={(e) => form.setValue('registrationNumber', e.target.value.toUpperCase(), { shouldDirty: true })}
              />
            </FormRow>
            <FormRow name="type" label="Vehicle type" required>
              <Select value={form.watch('type')} onValueChange={(v) => form.setValue('type', v, { shouldDirty: true })}>
                <SelectTrigger id="type"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow name="make" label="Make">
              <Input id="make" {...form.register('make')} placeholder="e.g., Toyota" />
            </FormRow>
            <FormRow name="model" label="Model">
              <Input id="model" {...form.register('model')} placeholder="e.g., Innova Crysta" />
            </FormRow>
            <FormRow name="seatingCapacity" label="Seating capacity">
              <Input
                id="seatingCapacity"
                type="number"
                min={1}
                max={100}
                value={form.watch('seatingCapacity') ?? ''}
                onChange={(e) => form.setValue('seatingCapacity', e.target.value ? Number(e.target.value) : undefined, { shouldDirty: true })}
              />
            </FormRow>
            <FormRow name="year" label="Year">
              <Input
                id="year"
                type="number"
                min={1990}
                max={2030}
                value={form.watch('year') ?? ''}
                onChange={(e) => form.setValue('year', e.target.value ? Number(e.target.value) : undefined, { shouldDirty: true })}
              />
            </FormRow>
            <FormRow name="color" label="Color">
              <Select value={form.watch('color') || undefined} onValueChange={(v) => form.setValue('color', v, { shouldDirty: true })}>
                <SelectTrigger id="color"><SelectValue placeholder="Select color" /></SelectTrigger>
                <SelectContent>
                  {colorOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow name="status" label="Status">
              <Select value={form.watch('status')} onValueChange={(v) => form.setValue('status', v, { shouldDirty: true })}>
                <SelectTrigger id="status"><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(VEHICLE_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow name="odometerKm" label="Odometer (km)">
              <Input
                id="odometerKm"
                type="number"
                min={0}
                value={form.watch('odometerKm') ?? ''}
                onChange={(e) => form.setValue('odometerKm', e.target.value ? Number(e.target.value) : undefined, { shouldDirty: true })}
              />
            </FormRow>
            <FormRow name="notes" label="Notes" wide>
              <Textarea id="notes" rows={3} {...form.register('notes')} placeholder="Any notes about the vehicle..." />
            </FormRow>
          </div>
        </SectionCard>
      )}
    />
  );
}
