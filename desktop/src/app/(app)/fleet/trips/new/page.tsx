'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { EntityForm } from '@/components/domain';
import { fleetApi } from '@/lib/api/fleet';
import {
  TripFormSections, safeTripDate, safeTripType, toIso, tripFormSchema, type TripFormValues,
} from '@/components/domain/fleet/trip-form';
import { toE164 } from '@/lib/phone';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTripType = safeTripType(searchParams?.get('tripType'));
  // The assistant passes the arrival day; the times are still the person's to enter.
  const urlDate = safeTripDate(searchParams?.get('date'));

  return (
    <EntityForm<TripFormValues>
      title="New trip"
      description="Assign a vehicle and driver to a new trip."
      schema={tripFormSchema}
      defaultValues={{
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
        await fleetApi.trips.create({
            vehicleId: v.vehicleId,
            driverId: v.driverId,
            leadId: v.leadId || undefined,
            contactId: v.contactId || undefined,
            rateCardId: v.rateCardId || undefined,
            tripType: safeTripType(v.tripType),
            passengerName: v.passengerName || undefined,
            passengerPhone: toE164(v.passengerPhone) || undefined,
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
      }}
      renderSections={(form) => <TripFormSections form={form} />}
    />
  );
}
