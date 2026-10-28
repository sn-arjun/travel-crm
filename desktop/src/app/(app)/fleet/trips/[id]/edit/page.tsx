'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { EntityForm } from '@/components/domain';
import { Skeleton } from '@/components/ui';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/page-container';
import { fleetApi } from '@/lib/api/fleet';
import {
  TripFormSections, safeTripType, splitDateTime, toIso, tripFormSchema, type TripFormValues,
} from '@/components/domain/fleet/trip-form';
import { useApiQuery } from '@/hooks/use-api';
import { toE164 } from '@/lib/phone';
import { fromTripStopRows, toTripStopRows } from '../../_components/stops-editor';
import { toast } from 'sonner';

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
      <PageContainer>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
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
    <EntityForm<TripFormValues>
      title="Edit trip"
      description={`${trip.startLocation} → ${trip.endLocation}`}
      schema={tripFormSchema}
      defaultValues={{
        tripKind: trip.tripKind === 'coach' ? 'coach' : 'transfer',
        tourLeaderId: trip.tourLeaderId || '',
        stops: toTripStopRows(trip.stops ?? []),
        vehicleId: trip.vehicleId || '',
        driverId: trip.driverId || '',
        leadId: trip.leadId || '',
        contactId: trip.contactId || '',
        rateCardId: trip.rateCardId || '',
        tripType: safeTripType(trip.tripType),
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
        // Errors propagate to EntityForm, which shows field errors and a toast.
        const isCoach = v.tripKind === 'coach';
        const stops = isCoach ? fromTripStopRows(v.stops ?? []) : undefined;
        await fleetApi.trips.update(tripId, {
          vehicleId: v.vehicleId || undefined,
          driverId: v.driverId || undefined,
          tripKind: v.tripKind,
          // an empty selection clears the tour leader
          tourLeaderId: isCoach ? v.tourLeaderId || null : undefined,
          leadId: v.leadId || undefined,
          passengerName: v.passengerName ?? '',
          passengerPhone: toE164(v.passengerPhone),
          specialInstructions: v.specialInstructions ?? '',
          startLocation: v.startLocation || stops?.[0]?.name || '',
          endLocation: v.endLocation || stops?.[stops.length - 1]?.name || '',
          startTime: toIso(v.startDate, v.startClock),
          endTime: toIso(v.endDate, v.endClock),
          distance: v.distance,
          fare: v.fare,
          tripType: safeTripType(v.tripType),
        });
        // The stops are their own list on the server: ordered replace, kept stops keep their arrival.
        if (stops) await fleetApi.trips.putStops(tripId, stops);
        toast.success('Trip updated successfully');
        router.push(`/fleet/trips/${tripId}`);
      }}
      renderSections={(form) => <TripFormSections form={form} />}
    />
  );
}
