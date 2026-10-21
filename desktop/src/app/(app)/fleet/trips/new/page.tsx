'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { EntityForm } from '@/components/domain';
import { fleetApi } from '@/lib/api/fleet';
import {
  TripFormSections, safeTripDate, safeTripType, toIso, tripFormSchema, type TripFormValues,
} from '@/components/domain/fleet/trip-form';
import { toE164 } from '@/lib/phone';
import { fromTripStopRows } from '../_components/stops-editor';
import { useT } from '@/lib/i18n';
import { toast } from 'sonner';

// Stable reference: EntityForm memoises its initial values on this object.
const PREFILL = {
  leadId: 'leadId',
  passengerName: 'passengerName',
  passengerPhone: 'passengerPhone',
  // Filled by the assistant when it has already found a free vehicle and driver for the day.
  vehicleId: 'vehicleId',
  driverId: 'driverId',
  startLocation: 'startLocation',
  endLocation: 'endLocation',
} as const;

export default function NewTripPage() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?kind=coach opens the form as a coach trip (the Create coach trip button of a departure uses it)
  const urlKind = searchParams?.get('kind') === 'coach' ? 'coach' : 'transfer';
  const urlTripType = safeTripType(searchParams?.get('tripType'));
  // The assistant passes the arrival day; the times are still the person's to enter.
  const urlDate = safeTripDate(searchParams?.get('date'));

  return (
    <EntityForm<TripFormValues>
      title="New trip"
      description="Assign a vehicle and driver to a new trip."
      schema={tripFormSchema}
      defaultValues={{
        tripKind: urlKind,
        tourLeaderId: '',
        stops: [],
        vehicleId: '',
        driverId: '',
        leadId: '',
        contactId: '',
        rateCardId: '',
        tripType: urlTripType,
        passengerName: '',
        passengerPhone: '',
        specialInstructions: '',
        startLocation: '',
        endLocation: '',
        startDate: urlDate,
        startClock: '',
        endDate: urlDate,
        endClock: '',
        distance: undefined,
        fare: undefined,
      }}
      prefillFromParams={PREFILL}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        // Errors propagate to EntityForm, which shows field errors and a toast.
        const isCoach = v.tripKind === 'coach';
        const stops = isCoach ? fromTripStopRows(v.stops ?? []) : undefined;
        await fleetApi.trips.create({
            vehicleId: v.vehicleId || undefined,
            driverId: v.driverId || undefined,
            tripKind: v.tripKind,
            tourLeaderId: isCoach ? v.tourLeaderId || undefined : undefined,
            stops,
            leadId: v.leadId || undefined,
            contactId: v.contactId || undefined,
            rateCardId: v.rateCardId || undefined,
            tripType: safeTripType(v.tripType),
            passengerName: v.passengerName || undefined,
            passengerPhone: toE164(v.passengerPhone) || undefined,
            specialInstructions: v.specialInstructions || undefined,
            // a coach trip starts at its first stop and ends at its last
            startLocation: v.startLocation || stops?.[0]?.name || '',
            endLocation: v.endLocation || stops?.[stops.length - 1]?.name || '',
            startTime: toIso(v.startDate, v.startClock),
            endTime: toIso(v.endDate, v.endClock),
            distance: v.distance,
            fare: v.fare,
        });
        toast.success(isCoach ? t('coachTrips.form.createdCoach') : 'Trip created successfully');
        router.push('/fleet/trips');
      }}
      renderSections={(form) => <TripFormSections form={form} />}
    />
  );
}
