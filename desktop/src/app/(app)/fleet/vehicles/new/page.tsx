'use client';

import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { EntityForm, FormRow } from '@/components/domain';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SectionCard, Textarea } from '@/components/ui';
import { fleetApi } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { VEHICLE_TYPE_LABELS } from '@travelcrm/shared';

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
});
type VehicleForm = z.infer<typeof schema>;

export default function NewVehiclePage() {
  const router = useRouter();

  return (
    <EntityForm<VehicleForm>
      title="Add vehicle"
      description="Register a new vehicle in the fleet."
      schema={schema}
      defaultValues={{
        registrationNumber: '',
        type: 'sedan',
        make: '',
        model: '',
        year: new Date().getFullYear(),
        seatingCapacity: 4,
        color: '',
        notes: '',
      }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        try {
          await fleetApi.vehicles.create({
            registrationNumber: v.registrationNumber.toUpperCase(),
            type: v.type as 'sedan' | 'suv' | 'muv' | 'tempo_traveller' | 'mini_bus' | 'bus' | 'luxury_coach',
            make: v.make || undefined,
            model: v.model || undefined,
            year: v.year || undefined,
            seatingCapacity: v.seatingCapacity || undefined,
            color: v.color || undefined,
            notes: v.notes || undefined,
          });
          toast.success('Vehicle created successfully');
          router.push('/fleet/vehicles');
        } catch {
          toast.error('Failed to create vehicle');
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
            <FormRow name="type" label="Vehicle type" required>
              <Select value={form.watch('type')} onValueChange={(v) => form.setValue('type', v, { shouldDirty: true })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
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
            <FormRow name="seatingCapacity" label="Seating capacity">
              <Input
                type="number"
                min={1}
                max={100}
                value={form.watch('seatingCapacity') ?? ''}
                onChange={(e) => form.setValue('seatingCapacity', e.target.value ? Number(e.target.value) : undefined, { shouldDirty: true })}
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
            <FormRow name="notes" label="Notes" wide>
              <Textarea rows={3} {...form.register('notes')} placeholder="Any notes about the vehicle..." />
            </FormRow>
          </div>
        </SectionCard>
      )}
    />
  );
}
