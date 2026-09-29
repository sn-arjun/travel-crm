'use client';

import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import {
  AddressAutocomplete, Input, PhoneInput, SectionCard, Textarea, DatePicker,
} from '@/components/ui';
import { fleetApi } from '@/lib/api/fleet';
import type { Vehicle, Driver } from '@/lib/api/fleet';
import { toast } from 'sonner';

const schema = z.object({
  vehicleId: z.string().min(1, 'Pick a vehicle'),
  driverId: z.string().min(1, 'Pick a driver'),
  leadId: z.string().optional(),
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

export default function NewTripPage() {
  const router = useRouter();

  return (
    <EntityForm<TripForm>
      title="New trip"
      description="Assign a vehicle and driver to a new trip."
      schema={schema}
      defaultValues={{
        vehicleId: '',
        driverId: '',
        leadId: '',
        passengerName: '',
        passengerPhone: '',
        specialInstructions: '',
        startLocation: '',
        endLocation: '',
        startDate: undefined,
        startClock: '',
        endDate: undefined,
        endClock: '',
        distance: undefined,
        fare: undefined,
      }}
      prefillFromParams={{ leadId: 'leadId', passengerName: 'passengerName', passengerPhone: 'passengerPhone' }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        try {
          await fleetApi.trips.create({
            vehicleId: v.vehicleId,
            driverId: v.driverId,
            leadId: v.leadId || undefined,
            passengerName: v.passengerName || undefined,
            passengerPhone: v.passengerPhone || undefined,
            specialInstructions: v.specialInstructions || undefined,
            startLocation: v.startLocation,
            endLocation: v.endLocation,
            startTime: toIso(v.startDate, v.startClock),
            endTime: toIso(v.endDate, v.endClock),
            distance: v.distance,
            fare: v.fare,
          });
          toast.success('Trip created successfully');
          router.push('/fleet/trips');
        } catch (e) {
          toast.error((e as { message?: string })?.message || 'Failed to create trip');
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
                    const r = await fleetApi.vehicles.list({ search: q, page, limit: 20, status: 'available' });
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
                    const r = await fleetApi.drivers.list({ search: q, page, limit: 20, status: 'active' });
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
