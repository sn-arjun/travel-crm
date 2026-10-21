'use client';

import { formatWholeCurrency } from '@/lib/format';
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
import { TripStopsEditor, type TripStopRow } from '@/app/(app)/fleet/trips/_components/stops-editor';
import { useFeatureGate } from '@/hooks/use-feature-gate';
import { useT } from '@/lib/i18n';

export const tripFormSchema = z.object({
  // R145: a coach trip may have no vehicle or driver yet, and has stops and a tour leader
  tripKind: z.enum(['transfer', 'coach']),
  tourLeaderId: z.string().optional(),
  stops: z.array(z.custom<TripStopRow>()),
  vehicleId: z.string().optional(),
  driverId: z.string().optional(),
  leadId: z.string().optional(),
  contactId: z.string().optional(),
  rateCardId: z.string().optional(),
  tripType: z.string().min(1, 'Pick a trip type'),
  passengerName: z.string().optional(),
  passengerPhone: z.string().optional(),
  specialInstructions: z.string().optional(),
  startLocation: z.string().optional(),
  endLocation: z.string().optional(),
  startDate: z.date({ error: 'Start date is required' }),
  startClock: z.string().min(1, 'Start time is required'),
  endDate: z.date({ error: 'End date is required' }),
  endClock: z.string().min(1, 'End time is required'),
  distance: z.number().optional(),
  fare: z.number().optional(),
}).superRefine((v, ctx) => {
  // A transfer is one vehicle, one driver and one route; a coach trip gets its route from the stops.
  if (v.tripKind === 'coach') return;
  if (!v.vehicleId) ctx.addIssue({ code: 'custom', path: ['vehicleId'], message: 'Pick a vehicle' });
  if (!v.driverId) ctx.addIssue({ code: 'custom', path: ['driverId'], message: 'Pick a driver' });
  if (!v.startLocation) ctx.addIssue({ code: 'custom', path: ['startLocation'], message: 'Start location is required' });
  if (!v.endLocation) ctx.addIssue({ code: 'custom', path: ['endLocation'], message: 'End location is required' });
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

/** A `date` (YYYY-MM-DD) that arrived through the URL, as that calendar day; anything else is ignored. */
export function safeTripDate(raw?: string | null): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw ?? '');
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  // new Date() rolls 31 February over to March; reject instead.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
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
  const t = useT();
  const coachGate = useFeatureGate('coach_trips');
  const tripKind = form.watch('tripKind');
  const isCoach = tripKind === 'coach';
  // The kind choice is offered when the agency has coach trips; a coach trip that exists keeps its fields either way.
  const offerKind = coachGate.enabled || isCoach;
  const vehicleId = form.watch('vehicleId') ?? '';
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
      {offerKind && (
        <SectionCard title={t('coachTrips.form.kindTitle')}>
          <div className="grid gap-ds-4 sm:grid-cols-2">
            <FormRow name="tripKind" label={t('coachTrips.form.kind')} hint={t('coachTrips.form.kindHint')}>
              <Select value={tripKind} onValueChange={(v) => form.setValue('tripKind', v as 'transfer' | 'coach', { shouldDirty: true })}>
                <SelectTrigger id="tripKind" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">{t('coachTrips.form.kindTransfer')}</SelectItem>
                  <SelectItem value="coach">{t('coachTrips.form.kindCoach')}</SelectItem>
                </SelectContent>
              </Select>
            </FormRow>
            {isCoach && (
              <FormRow name="tourLeaderId" label={t('coachTrips.form.tourLeader')} hint={t('coachTrips.form.tourLeaderHint')}>
                <RelationCombobox<Driver>
                  value={form.watch('tourLeaderId') || null}
                  onChange={(id) => form.setValue('tourLeaderId', id ?? '', { shouldDirty: true })}
                  fetcher={async (q, page) => {
                    const r = await fleetApi.drivers.list({ search: q, page, limit: 20, crewRole: 'tour_leader' });
                    return toPage<Driver>(r.data as ListPayload<Driver>);
                  }}
                  getOptionId={(d) => d.id}
                  getOptionLabel={(d) => d.name}
                  getOptionDescription={(d) => d.phone}
                  resolveSelected={async (id) => (await fleetApi.drivers.getById(id)).data}
                  placeholder={t('coachTrips.form.tourLeaderPlaceholder')}
                  searchPlaceholder={t('coachTrips.form.tourLeaderSearch')}
                />
              </FormRow>
            )}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Vehicle & driver" required={!isCoach}>
        <div className="grid gap-ds-4 sm:grid-cols-2">
          <FormRow name="vehicleId" label="Vehicle" required={!isCoach}>
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
              required={!isCoach}
            />
          </FormRow>
          <FormRow name="driverId" label="Driver" required={!isCoach}>
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
              required={!isCoach}
            />
          </FormRow>
        </div>
      </SectionCard>

      {isCoach && (
        <SectionCard title={t('coachTrips.form.stopsTitle')} description={t('coachTrips.form.stopsHint')}>
          <TripStopsEditor value={form.watch('stops') ?? []} onChange={(rows) => form.setValue('stops', rows, { shouldDirty: true })} />
        </SectionCard>
      )}

      <SectionCard title="Route & schedule" required={!isCoach}>
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
          <FormRow name="startLocation" label="Start location" required={!isCoach} wide>
            <AddressAutocomplete
              value={form.watch('startLocation') ?? ''}
              onChange={(v) => form.setValue('startLocation', v, { shouldDirty: true })}
              placeholder="Enter pickup location"
            />
          </FormRow>
          <FormRow name="endLocation" label="End location" required={!isCoach} wide>
            <AddressAutocomplete
              value={form.watch('endLocation') ?? ''}
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
                  {suggestion.exact ? 'Rate card' : 'Rate card from'} {formatWholeCurrency(suggestion.amount)} ({suggestion.rateCardName})
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
