'use client';

import * as React from 'react';
import { z } from 'zod';
import { useParams, useRouter } from 'next/navigation';
import { EntityForm, FormRow } from '@/components/domain';
import { CurrencyInput, DatePicker, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SectionCard, Skeleton, Switch } from '@/components/ui';
import { fleetApi } from '@/lib/api/fleet';
import type { FleetRateCard } from '@/lib/api/fleet';
import { toast } from 'sonner';
import { VEHICLE_TYPE_LABELS, FLEET_TRIP_TYPE_LABELS } from '@travelcrm/shared';

const schema = z.object({
  name: z.string().min(1, 'Rate card name is required'),
  vehicleType: z.string().min(1, 'Vehicle type is required'),
  tripType: z.string().optional(),
  baseFare: z.number({ error: 'Base fare is required' }),
  perKmRate: z.number({ error: 'Per km rate is required' }),
  perHourRate: z.number().optional(),
  minimumKm: z.number().optional(),
  minimumHours: z.number().optional(),
  extraKmRate: z.number().optional(),
  extraHourRate: z.number().optional(),
  nightCharge: z.number().optional(),
  driverAllowance: z.number().optional(),
  tollIncluded: z.boolean(),
  parkingIncluded: z.boolean(),
  isActive: z.boolean(),
  validFrom: z.date().optional(),
  validTo: z.date().optional(),
});
type RateCardForm = z.infer<typeof schema>;

function toIso(d: Date | undefined) {
  return d ? d.toISOString().slice(0, 10) : undefined;
}
function toDate(s: string | undefined) {
  return s ? new Date(s) : undefined;
}

function toDefaults(rc: FleetRateCard): RateCardForm {
  return {
    name: rc.name,
    vehicleType: rc.vehicleType,
    tripType: rc.tripType || '',
    baseFare: rc.baseFare ?? 0,
    perKmRate: rc.perKmRate ?? 0,
    perHourRate: rc.perHourRate,
    minimumKm: rc.minimumKm,
    minimumHours: rc.minimumHours,
    extraKmRate: rc.extraKmRate,
    extraHourRate: rc.extraHourRate,
    nightCharge: rc.nightCharge,
    driverAllowance: rc.driverAllowance,
    tollIncluded: !!rc.tollIncluded,
    parkingIncluded: !!rc.parkingIncluded,
    isActive: rc.isActive !== false,
    validFrom: toDate(rc.validFrom),
    validTo: toDate(rc.validTo),
  };
}

export default function EditRateCardPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [rateCard, setRateCard] = React.useState<FleetRateCard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fleetApi.rateCards
      .getById(id)
      .then((res) => {
        if (!cancelled) setRateCard(res.data);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load rate card.');
          toast.error('Failed to load rate card');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="p-ds-6 space-y-ds-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!rateCard) {
    return <div className="p-ds-6 text-ds-danger">{error ?? 'Rate card not found.'}</div>;
  }

  return (
    <EntityForm<RateCardForm>
      title="Edit rate card"
      description="Update pricing for this vehicle and trip type combination."
      schema={schema}
      defaultValues={toDefaults(rateCard)}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        try {
          await fleetApi.rateCards.update(id, {
            name: v.name,
            vehicleType: v.vehicleType,
            tripType: v.tripType || undefined,
            baseFare: v.baseFare,
            perKmRate: v.perKmRate,
            perHourRate: v.perHourRate,
            minimumKm: v.minimumKm,
            minimumHours: v.minimumHours,
            extraKmRate: v.extraKmRate,
            extraHourRate: v.extraHourRate,
            nightCharge: v.nightCharge,
            driverAllowance: v.driverAllowance,
            tollIncluded: v.tollIncluded,
            parkingIncluded: v.parkingIncluded,
            isActive: v.isActive,
            validFrom: toIso(v.validFrom),
            validTo: toIso(v.validTo),
          });
          toast.success('Rate card updated');
          router.push('/fleet/rate-cards');
        } catch {
          toast.error('Failed to update rate card');
        }
      }}
      renderSections={(form) => (
        <>
          <SectionCard title="Basic information" required>
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="name" label="Rate card name" required wide>
                <Input {...form.register('name')} id="name" placeholder="e.g., SUV Outstation" />
              </FormRow>
              <FormRow name="vehicleType" label="Vehicle type" required>
                <Select value={form.watch('vehicleType')} onValueChange={(v) => form.setValue('vehicleType', v, { shouldDirty: true })}>
                  <SelectTrigger id="vehicleType"><SelectValue placeholder="Select vehicle type" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(VEHICLE_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>
              <FormRow name="tripType" label="Trip type">
                <Select value={form.watch('tripType')} onValueChange={(v) => form.setValue('tripType', v, { shouldDirty: true })}>
                  <SelectTrigger id="tripType"><SelectValue placeholder="Select trip type" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FLEET_TRIP_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Base pricing" required>
            <div className="grid gap-ds-4 sm:grid-cols-3">
              <FormRow name="baseFare" label="Base fare" required>
                <CurrencyInput value={form.watch('baseFare')} onChange={(v) => form.setValue('baseFare', v ?? 0, { shouldDirty: true })} />
              </FormRow>
              <FormRow name="perKmRate" label="Per km rate" required>
                <CurrencyInput value={form.watch('perKmRate')} onChange={(v) => form.setValue('perKmRate', v ?? 0, { shouldDirty: true })} />
              </FormRow>
              <FormRow name="perHourRate" label="Per hour rate">
                <CurrencyInput value={form.watch('perHourRate')} onChange={(v) => form.setValue('perHourRate', v, { shouldDirty: true })} />
              </FormRow>
              <FormRow name="minimumKm" label="Minimum km">
                <Input
                  type="number"
                  min={0}
                  value={form.watch('minimumKm') ?? ''}
                  onChange={(e) => form.setValue('minimumKm', e.target.value ? Number(e.target.value) : undefined, { shouldDirty: true })}
                />
              </FormRow>
              <FormRow name="minimumHours" label="Minimum hours">
                <Input
                  type="number"
                  min={0}
                  value={form.watch('minimumHours') ?? ''}
                  onChange={(e) => form.setValue('minimumHours', e.target.value ? Number(e.target.value) : undefined, { shouldDirty: true })}
                />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Extra & additional charges">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="extraKmRate" label="Extra km rate" hint="Charged per km beyond minimum">
                <CurrencyInput value={form.watch('extraKmRate')} onChange={(v) => form.setValue('extraKmRate', v, { shouldDirty: true })} />
              </FormRow>
              <FormRow name="extraHourRate" label="Extra hour rate" hint="Charged per hour beyond minimum">
                <CurrencyInput value={form.watch('extraHourRate')} onChange={(v) => form.setValue('extraHourRate', v, { shouldDirty: true })} />
              </FormRow>
              <FormRow name="nightCharge" label="Night charge" hint="Applied for trips after 10 PM">
                <CurrencyInput value={form.watch('nightCharge')} onChange={(v) => form.setValue('nightCharge', v, { shouldDirty: true })} />
              </FormRow>
              <FormRow name="driverAllowance" label="Driver allowance" hint="Per-day driver allowance">
                <CurrencyInput value={form.watch('driverAllowance')} onChange={(v) => form.setValue('driverAllowance', v, { shouldDirty: true })} />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Validity">
            <div className="grid gap-ds-4 sm:grid-cols-2">
              <FormRow name="validFrom" label="Valid from">
                <DatePicker value={form.watch('validFrom')} onChange={(d) => form.setValue('validFrom', d, { shouldDirty: true })} />
              </FormRow>
              <FormRow name="validTo" label="Valid to">
                <DatePicker
                  value={form.watch('validTo')}
                  onChange={(d) => form.setValue('validTo', d, { shouldDirty: true })}
                  minDate={form.watch('validFrom')}
                />
              </FormRow>
            </div>
          </SectionCard>

          <SectionCard title="Inclusions & status">
            <div className="space-y-ds-4">
              <FormRow name="tollIncluded" label="Toll included" hint="Include toll charges in the rate">
                <Switch checked={form.watch('tollIncluded')} onCheckedChange={(v) => form.setValue('tollIncluded', v, { shouldDirty: true })} />
              </FormRow>
              <FormRow name="parkingIncluded" label="Parking included" hint="Include parking charges in the rate">
                <Switch checked={form.watch('parkingIncluded')} onCheckedChange={(v) => form.setValue('parkingIncluded', v, { shouldDirty: true })} />
              </FormRow>
              <FormRow name="isActive" label="Active" hint="Enable this rate card for use">
                <Switch checked={form.watch('isActive')} onCheckedChange={(v) => form.setValue('isActive', v, { shouldDirty: true })} />
              </FormRow>
            </div>
          </SectionCard>
        </>
      )}
    />
  );
}
