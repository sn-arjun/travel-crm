'use client';

import * as React from 'react';
import { z } from 'zod';
import { useRouter, useParams } from 'next/navigation';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import {
  AddressAutocomplete, Input, PhoneInput, SectionCard, Textarea, DatePicker, Skeleton,
} from '@/components/ui';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { fleetApi } from '@/lib/api/fleet';
import type { Vehicle, Driver } from '@/lib/api/fleet';
import { useApiQuery } from '@/hooks/use-api';
import { toast } from 'sonner';

const schema = z.object({
  vehicleId: z.string().min(1, 'Pick a vehicle'),
  driverId: z.string().min(1, 'Pick a driver'),
  passengerName: z.string().optional(),
  passengerPhone: z.string().optional(),
  specialInstructions: z.string().optional(),
  startLocation: z.string().min(1, 'Start location is required'),
  endLocation: z.string().min(1, 'End location is required'),
  startDate: z.date({ error: 'Start date is required' }),
  startClock: z.string().min(1, 'Start time is required'),
  endDate: z.date({ error: 'End date is required' }),
  endClock: z.string().min(1, 'End time is required'),
  distance: z.number().optional(),
  fare: z.number().optional(),
});
type TripForm = z.infer<typeof schema>;

function toIso(date: Date, clock: string) {
  const [h, m] = clock.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

function splitDateTime(iso?: string): { date: Date | undefined; clock: string } {
  if (!iso) return { date: undefined, clock: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: undefined, clock: '' };
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date: d, clock };
}

export default function EditTripPage() {
  const router = useRouter();
  const params = useParams();
  const tripId = params.id as string;

  const { data: tripResponse, loading, error } = useApiQuery(
    () => fleetApi.trips.getById(tripId),
    [tripId],
  );

  const trip = tripResponse?.data;

  if (loading) {
    return (
      <div className="flex flex-col gap-ds-4 p-ds-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !trip) {
    return (
      <EmptyState
        title="Trip not found"
        description="This trip may have been removed."
        action={<Button variant="outline" onClick={() => router.push('/fleet/trips')}>Back to trips</Button>}
      />
    );
  }

  if (trip.status !== 'assigned') {
    return (
      <EmptyState
        title="This trip can no longer be edited"
        description="Only trips with status Assigned can be edited."
        action={<Button variant="outline" onClick={() => router.push(`/fleet/trips/${tripId}`)}>Back to trip</Button>}
      />
    );
  }

  const start = splitDateTime(trip.startTime);
  const end = splitDateTime(trip.endTime);

  return (
    <EntityForm<TripForm>
      title="Edit trip"
      description={`${trip.startLocation} → ${trip.endLocation}`}
      schema={schema}
      defaultValues={{
        vehicleId: trip.vehicleId || '',
        driverId: trip.driverId || '',
        passengerName: trip.passengerName || '',
        passengerPhone: trip.passengerPhone || '',
        specialInstructions: trip.specialInstructions || '',
        startLocation: trip.startLocation || '',
        endLocation: trip.endLocation || '',
        startDate: start.date,
        startClock: start.clock,
        endDate: end.date,
        endClock: end.clock,
        distance: trip.distance || undefined,
        fare: trip.fare || undefined,
      }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        try {
          await fleetApi.trips.update(tripId, {
            vehicleId: v.vehicleId,
            driverId: v.driverId,
            passengerName: v.passengerName ?? '',
            passengerPhone: v.passengerPhone ?? '',
            specialInstructions: v.specialInstructions ?? '',
            startLocation: v.startLocation,
            endLocation: v.endLocation,
            startTime: toIso(v.startDate, v.startClock),
            endTime: toIso(v.endDate, v.endClock),
            distance: v.distance,
            fare: v.fare,
          });
          toast.success('Trip updated successfully');
          router.push(`/fleet/trips/${tripId}`);
        } catch (e) {
          toast.error((e as { message?: string })?.message || 'Failed to update trip');
        }
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Vehicle & driver" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="vehicleId" label="Vehicle" required>
                <RelationCombobox<Vehicle>
                  value={form.watch('vehicleId') || null}
                  onChange={(id) => form.setValue('vehicleId', id ?? '', { shouldDirty: true })}
                  fetcher={async (q, page) => {
                    const r = await fleetApi.vehicles.list({ search: q, page, limit: 20 });
                    const data: any = r.data;
                    const items = Array.isArray(data) ? data : (data?.data ?? []);
                    const total = Array.isArray(data) ? items.length : (data?.pagination?.total ?? items.length);
                    return { items, total };
                  }}
                  getOptionId={(veh) => veh.id}
                  getOptionLabel={(veh) => `${veh.registrationNumber} — ${veh.make} ${veh.model}`}
                  getOptionDescription={(veh) => veh.seatingCapacity ? `${veh.seatingCapacity} seats` : undefined}
                  resolveSelected={async (id) => (await fleetApi.vehicles.getById(id)).data}
                  placeholder="Select vehicle"
                  searchPlaceholder="Registration or make/model..."
                  required
                />
              </FormRow>
              <FormRow name="driverId" label="Driver" required>
                <RelationCombobox<Driver>
                  value={form.watch('driverId') || null}
                  onChange={(id) => form.setValue('driverId', id ?? '', { shouldDirty: true })}
                  fetcher={async (q, page) => {
                    const r = await fleetApi.drivers.list({ search: q, page, limit: 20 });
                    const data: any = r.data;
                    const items = Array.isArray(data) ? data : (data?.data ?? []);
                    const total = Array.isArray(data) ? items.length : (data?.pagination?.total ?? items.length);
                    return { items, total };
                  }}
                  getOptionId={(d) => d.id}
                  getOptionLabel={(d) => d.name}
                  getOptionDescription={(d) => d.phone}
                  resolveSelected={async (id) => (await fleetApi.drivers.getById(id)).data}
                  placeholder="Select driver"
                  searchPlaceholder="Driver name or phone..."
                  required
                />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Route & schedule" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="startLocation" label="Start location" required wide>
                <AddressAutocomplete
                  value={form.watch('startLocation')}
                  onChange={(v) => form.setValue('startLocation', v, { shouldDirty: true })}
                  placeholder="Enter pickup location"
                />
              </FormRow>
              <FormRow name="endLocation" label="End location" required wide>
                <AddressAutocomplete
                  value={form.watch('endLocation')}
                  onChange={(v) => form.setValue('endLocation', v, { shouldDirty: true })}
                  placeholder="Enter drop location"
                />
              </FormRow>
              <FormRow name="startDate" label="Start date" required>
                <DatePicker value={form.watch('startDate')} onChange={(d) => form.setValue('startDate', d as Date, { shouldDirty: true })} />
              </FormRow>
              <FormRow name="startClock" label="Start time" required>
                <Input id="startClock" type="time" {...form.register('startClock')} />
              </FormRow>
              <FormRow name="endDate" label="End date" required>
                <DatePicker
                  value={form.watch('endDate')}
                  onChange={(d) => form.setValue('endDate', d as Date, { shouldDirty: true })}
                  minDate={form.watch('startDate')}
                />
              </FormRow>
              <FormRow name="endClock" label="End time" required>
                <Input id="endClock" type="time" {...form.register('endClock')} />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Passenger details">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="passengerName" label="Passenger name">
                <Input id="passengerName" {...form.register('passengerName')} placeholder="Full name" />
              </FormRow>
              <FormRow name="passengerPhone" label="Passenger phone">
                <PhoneInput
                  value={form.watch('passengerPhone') ?? ''}
                  onChange={(v) => form.setValue('passengerPhone', v, { shouldDirty: true })}
                />
              </FormRow>
              <FormRow name="specialInstructions" label="Special instructions" wide>
                <Textarea
                  id="specialInstructions"
                  rows={3}
                  {...form.register('specialInstructions')}
                  placeholder="Any special requirements or instructions..."
                />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Estimates">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="distance" label="Estimated distance (km)">
                <Input
                  id="distance"
                  type="number"
                  min={0}
                  value={form.watch('distance') ?? ''}
                  onChange={(e) => form.setValue('distance', e.target.value ? Number(e.target.value) : undefined, { shouldDirty: true })}
                />
              </FormRow>
              <FormRow name="fare" label="Estimated fare">
                <Input
                  id="fare"
                  type="number"
                  min={0}
                  value={form.watch('fare') ?? ''}
                  onChange={(e) => form.setValue('fare', e.target.value ? Number(e.target.value) : undefined, { shouldDirty: true })}
                />
              </FormRow>
            </div>
          </SectionCard>
        </>
      )}
    />
  );
}
