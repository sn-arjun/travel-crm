'use client';

import * as React from 'react';
import { z } from 'zod';
import type { UseFormReturn } from 'react-hook-form';
import { FormRow, RelationCombobox } from '@/components/domain';
import {
  AddressAutocomplete, Button, CurrencyInput, DatePicker, Input, SectionCard,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea,
} from '@/components/ui';
import { E164PhoneInput } from '@/components/ui/phone-input';
import { fleetApi } from '@/lib/api/fleet';
import type { Driver, FleetRateCard, Vehicle } from '@/lib/api/fleet';
import { leadsApi } from '@/lib/api/leads';
import { TRIP_TYPE_OPTIONS } from './trip-format';

export const tripFormSchema = z.object({
  vehicleId: z.string().min(1, 'Pick a vehicle'),
  driverId: z.string().min(1, 'Pick a driver'),
  leadId: z.string().optional(),
  contactId: z.string().optional(),
  rateCardId: z.string().optional(),
  tripType: z.string().min(1, 'Pick a trip type'),
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
export type TripFormValues = z.infer<typeof tripFormSchema>;

export const TRIP_TYPE_VALUES: string[] = TRIP_TYPE_OPTIONS.map((o) => o.value);

export function toIso(date: Date, clock: string) {
  const [h, m] = clock.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

export function splitDateTime(iso?: string): { date: Date | undefined; clock: string } {
  if (!iso) return { date: undefined, clock: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: undefined, clock: '' };
  const clock = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date: d, clock };
}

/** Normalises a `tripType` that arrived through the URL or an older record. */
export function safeTripType(raw?: string | null): string {
  return raw && TRIP_TYPE_VALUES.includes(raw) ? raw : 'one_way';
}

type ListPayload<T> = { data?: T[]; pagination?: { total?: number } } | T[] | undefined;

function toPage<T>(payload: ListPayload<T>): { items: T[]; total: number } {
  if (Array.isArray(payload)) return { items: payload, total: payload.length };
  const items = payload?.data ?? [];
  return { items, total: payload?.pagination?.total ?? items.length };
}

interface LeadOption {
  id: string;
  title?: string;
  contactId?: string;
  contactName?: string;
  contactPhone?: string;
  contact?: { id?: string; name?: string; phone?: string };
}

function leadPassenger(lead: LeadOption) {
  return {
    contactId: lead.contactId ?? lead.contact?.id,
    name: lead.contactName ?? lead.contact?.name,
    phone: lead.contactPhone ?? lead.contact?.phone,
  };
}

const inrFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

interface FareSuggestion {
  amount: number;
  rateCardId: string;
  rateCardName: string;
  exact: boolean;
}

/** Looks up the rate card for the chosen vehicle + trip type and prices the trip. */
function useFareSuggestion(
  vehicleId: string,
  tripType: string,
  distance: number | undefined,
  durationMinutes: number,
): FareSuggestion | null {
  const [vehicleType, setVehicleType] = React.useState<string | null>(null);
  const [card, setCard] = React.useState<FleetRateCard | null>(null);
  const [amount, setAmount] = React.useState<{ value: number; exact: boolean } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!vehicleId) {
      setVehicleType(null);
      return;
    }
    fleetApi.vehicles.getById(vehicleId)
      .then((res) => { if (!cancelled) setVehicleType(res.data?.type ?? null); })
      .catch(() => { if (!cancelled) setVehicleType(null); });
    return () => { cancelled = true; };
  }, [vehicleId]);

  React.useEffect(() => {
    let cancelled = false;
    if (!vehicleType || !tripType) {
      setCard(null);
      return;
    }
    fleetApi.rateCards.lookup({ vehicleType, tripType })
      .then((res) => { if (!cancelled) setCard(res.data ?? null); })
      .catch(() => { if (!cancelled) setCard(null); });
    return () => { cancelled = true; };
  }, [vehicleType, tripType]);

  React.useEffect(() => {
    let cancelled = false;
    if (!card) {
      setAmount(null);
      return;
    }
    if (!distance || distance <= 0) {
      setAmount({ value: card.baseFare, exact: false });
      return;
    }
    fleetApi.rateCards.estimate({ rateCardId: card.id, distanceKm: distance, durationMinutes: Math.max(durationMinutes, 0) })
      .then((res) => {
        if (cancelled) return;
        const total = res.data?.breakdown?.total;
        setAmount(typeof total === 'number' ? { value: total, exact: true } : { value: card.baseFare, exact: false });
      })
      .catch(() => { if (!cancelled) setAmount({ value: card.baseFare, exact: false }); });
    return () => { cancelled = true; };
  }, [card, distance, durationMinutes]);

  if (!card || !amount) return null;
  return { amount: amount.value, rateCardId: card.id, rateCardName: card.name, exact: amount.exact };
}

/** The shared body of the new / edit trip forms. */
export function TripFormSections({ form }: { form: UseFormReturn<TripFormValues> }) {
  const vehicleId = form.watch('vehicleId');
  const tripType = form.watch('tripType');
  const distance = form.watch('distance');
  const fare = form.watch('fare');
  const leadId = form.watch('leadId');
  const startDate = form.watch('startDate');
  const startClock = form.watch('startClock');
  const endDate = form.watch('endDate');
  const endClock = form.watch('endClock');

  const durationMinutes = React.useMemo(() => {
    if (!startDate || !endDate || !startClock || !endClock) return 60;
    const diff = (new Date(toIso(endDate, endClock)).getTime() - new Date(toIso(startDate, startClock)).getTime()) / 60000;
    return Number.isFinite(diff) && diff > 0 ? Math.round(diff) : 60;
  }, [startDate, endDate, startClock, endClock]);

  const suggestion = useFareSuggestion(vehicleId, tripType, distance, durationMinutes);

  // A lead supplied by the URL (Book transfer) pre-fills the passenger once.
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (prefilled.current || !leadId) return;
    prefilled.current = true;
    leadsApi.getById(leadId)
      .then((res) => {
        const p = leadPassenger(res.data as unknown as LeadOption);
        if (p.contactId && !form.getValues('contactId')) form.setValue('contactId', p.contactId, { shouldDirty: false });
        if (p.name && !form.getValues('passengerName')) form.setValue('passengerName', p.name, { shouldDirty: false });
        if (p.phone && !form.getValues('passengerPhone')) form.setValue('passengerPhone', p.phone, { shouldDirty: false });
      })
      .catch(() => { /* the lead is optional context; the form still works without it */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  return (
    <>
      <SectionCard title="Vehicle & driver" required>
        <div className="grid gap-ds-4 sm:grid-cols-2">
          <FormRow name="vehicleId" label="Vehicle" required>
            <RelationCombobox<Vehicle>
              value={form.watch('vehicleId') || null}
              onChange={(id) => form.setValue('vehicleId', id ?? '', { shouldDirty: true })}
              fetcher={async (q, page) => {
                const r = await fleetApi.vehicles.list({ search: q, page, limit: 20, status: 'available' });
                return toPage<Vehicle>(r.data as ListPayload<Vehicle>);
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
                return toPage<Driver>(r.data as ListPayload<Driver>);
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
          <FormRow name="tripType" label="Trip type" required hint="Drives the rate card used to suggest the fare.">
            <Select
              value={tripType || undefined}
              onValueChange={(v) => form.setValue('tripType', v, { shouldDirty: true })}
            >
              <SelectTrigger id="tripType" className="w-full"><SelectValue placeholder="Select trip type" /></SelectTrigger>
              <SelectContent>
                {TRIP_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormRow>
          <div className="hidden sm:block" aria-hidden="true" />
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
          <FormRow name="leadId" label="Linked lead" hint="Optional. Picking a lead fills in the passenger.">
            <RelationCombobox<LeadOption>
              value={form.watch('leadId') || null}
              onChange={(id, item) => {
                form.setValue('leadId', id ?? '', { shouldDirty: true });
                if (!item) {
                  form.setValue('contactId', '', { shouldDirty: true });
                  return;
                }
                const p = leadPassenger(item);
                form.setValue('contactId', p.contactId ?? '', { shouldDirty: true });
                if (p.name && !form.getValues('passengerName')) form.setValue('passengerName', p.name, { shouldDirty: true });
                if (p.phone && !form.getValues('passengerPhone')) form.setValue('passengerPhone', p.phone, { shouldDirty: true });
              }}
              fetcher={async (q, page) => {
                const r = await leadsApi.list({ search: q || undefined, page, limit: 20 });
                return toPage<LeadOption>(r.data as unknown as ListPayload<LeadOption>);
              }}
              getOptionId={(l) => l.id}
              getOptionLabel={(l) => l.title || 'Untitled lead'}
              getOptionDescription={(l) => leadPassenger(l).name}
              resolveSelected={async (id) => (await leadsApi.getById(id)).data as unknown as LeadOption}
              placeholder="Select lead"
              searchPlaceholder="Lead title or contact..."
            />
          </FormRow>
          <div className="hidden sm:block" aria-hidden="true" />
          <FormRow name="passengerName" label="Passenger name">
            <Input id="passengerName" {...form.register('passengerName')} placeholder="Full name" />
          </FormRow>
          <FormRow name="passengerPhone" label="Passenger phone">
            <E164PhoneInput
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
              value={distance ?? ''}
              onChange={(e) => form.setValue('distance', e.target.value ? Number(e.target.value) : undefined, { shouldDirty: true })}
            />
          </FormRow>
          <FormRow name="fare" label="Estimated fare">
            <CurrencyInput
              id="fare"
              value={fare}
              onChange={(v) => form.setValue('fare', v, { shouldDirty: true })}
            />
            {suggestion && suggestion.amount !== fare && (
              <p className="flex flex-wrap items-center gap-ds-2 text-xs text-ds-foreground-muted" data-testid="fare-suggestion">
                <span>
                  {suggestion.exact ? 'Rate card' : 'Rate card from'} {inrFormat.format(suggestion.amount)} ({suggestion.rateCardName})
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    form.setValue('fare', Math.round(suggestion.amount), { shouldDirty: true });
                    form.setValue('rateCardId', suggestion.rateCardId, { shouldDirty: true });
                  }}
                >
                  Use this fare
                </Button>
              </p>
            )}
          </FormRow>
        </div>
      </SectionCard>
    </>
  );
}
