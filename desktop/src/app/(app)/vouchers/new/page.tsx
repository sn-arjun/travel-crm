'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { EntityForm, FormRow, RelationCombobox } from '@/components/domain';
import {
  Input, Textarea, SectionCard, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  DatePicker,
} from '@/components/ui';
import { vouchersApi, type CreateVoucherRequest } from '@/lib/api/vouchers';
import { leadsApi } from '@/lib/api/leads';
import { suppliersApi } from '@/lib/api/suppliers';
import type { Lead, Supplier } from '@travelcrm/shared';
import { toast } from 'sonner';

const VOUCHER_TYPES = ['hotel', 'transport', 'flight', 'activity'] as const;

const schema = z
  .object({
    leadId: z.string().min(1, 'Lead is required'),
    voucherType: z.enum(VOUCHER_TYPES, { error: 'Voucher type is required' }),
    supplierId: z.string().optional(),
    title: z.string().optional(),
    language: z.string(),
    notes: z.string().optional(),
    // Hotel
    hotelName: z.string().optional(),
    hotelAddress: z.string().optional(),
    checkIn: z.date().optional(),
    checkOut: z.date().optional(),
    roomType: z.string().optional(),
    roomCount: z.number().optional(),
    mealPlan: z.string().optional(),
    specialRequests: z.string().optional(),
    confirmationNumber: z.string().optional(),
    guestNames: z.string().optional(),
    // Transport
    vehicleType: z.string().optional(),
    driverName: z.string().optional(),
    driverPhone: z.string().optional(),
    pickupLocation: z.string().optional(),
    pickupTime: z.date().optional(),
    dropLocation: z.string().optional(),
    route: z.string().optional(),
    // Flight
    airline: z.string().optional(),
    flightNumber: z.string().optional(),
    departureAirport: z.string().optional(),
    departureTime: z.date().optional(),
    arrivalAirport: z.string().optional(),
    arrivalTime: z.date().optional(),
    pnr: z.string().optional(),
    travelClass: z.string().optional(),
    passengerNames: z.string().optional(),
    // Activity
    activityName: z.string().optional(),
    dateTime: z.date().optional(),
    meetingPoint: z.string().optional(),
    duration: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.voucherType === 'hotel') {
      if (!v.hotelName) ctx.addIssue({ code: 'custom', path: ['hotelName'], message: 'Hotel name is required' });
      if (!v.checkIn) ctx.addIssue({ code: 'custom', path: ['checkIn'], message: 'Check-in date is required' });
      if (!v.checkOut) ctx.addIssue({ code: 'custom', path: ['checkOut'], message: 'Check-out date is required' });
    }
    if (v.voucherType === 'transport') {
      if (!v.vehicleType) ctx.addIssue({ code: 'custom', path: ['vehicleType'], message: 'Vehicle type is required' });
      if (!v.pickupLocation) ctx.addIssue({ code: 'custom', path: ['pickupLocation'], message: 'Pickup location is required' });
      if (!v.dropLocation) ctx.addIssue({ code: 'custom', path: ['dropLocation'], message: 'Drop location is required' });
      if (!v.pickupTime) ctx.addIssue({ code: 'custom', path: ['pickupTime'], message: 'Pickup time is required' });
    }
    if (v.voucherType === 'flight') {
      if (!v.airline) ctx.addIssue({ code: 'custom', path: ['airline'], message: 'Airline is required' });
      if (!v.departureAirport) ctx.addIssue({ code: 'custom', path: ['departureAirport'], message: 'Departure airport is required' });
      if (!v.arrivalAirport) ctx.addIssue({ code: 'custom', path: ['arrivalAirport'], message: 'Arrival airport is required' });
      if (!v.departureTime) ctx.addIssue({ code: 'custom', path: ['departureTime'], message: 'Departure time is required' });
      if (!v.arrivalTime) ctx.addIssue({ code: 'custom', path: ['arrivalTime'], message: 'Arrival time is required' });
    }
    if (v.voucherType === 'activity') {
      if (!v.activityName) ctx.addIssue({ code: 'custom', path: ['activityName'], message: 'Activity name is required' });
      if (!v.meetingPoint) ctx.addIssue({ code: 'custom', path: ['meetingPoint'], message: 'Meeting point is required' });
      if (!v.dateTime) ctx.addIssue({ code: 'custom', path: ['dateTime'], message: 'Date & time is required' });
    }
  });

type VoucherFormValues = z.infer<typeof schema>;

function buildDetails(v: VoucherFormValues): Record<string, unknown> {
  switch (v.voucherType) {
    case 'hotel':
      return {
        hotelName: v.hotelName,
        hotelAddress: v.hotelAddress || undefined,
        checkIn: v.checkIn?.toISOString().slice(0, 10),
        checkOut: v.checkOut?.toISOString().slice(0, 10),
        roomType: v.roomType || 'Deluxe',
        roomCount: v.roomCount || 1,
        mealPlan: v.mealPlan || 'EP',
        specialRequests: v.specialRequests || undefined,
        confirmationNumber: v.confirmationNumber || undefined,
        guestNames: (v.guestNames || '').split(',').map((s) => s.trim()).filter(Boolean),
      };
    case 'transport':
      return {
        vehicleType: v.vehicleType,
        driverName: v.driverName || undefined,
        driverPhone: v.driverPhone || undefined,
        pickupLocation: v.pickupLocation,
        pickupTime: v.pickupTime?.toISOString(),
        dropLocation: v.dropLocation,
        route: v.route || undefined,
      };
    case 'flight':
      return {
        airline: v.airline,
        flightNumber: v.flightNumber || undefined,
        departureAirport: v.departureAirport,
        departureTime: v.departureTime?.toISOString(),
        arrivalAirport: v.arrivalAirport,
        arrivalTime: v.arrivalTime?.toISOString(),
        pnr: v.pnr || undefined,
        travelClass: v.travelClass || 'economy',
        passengers: (v.passengerNames || '').split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({ name })),
      };
    case 'activity':
      return {
        activityName: v.activityName,
        dateTime: v.dateTime?.toISOString(),
        meetingPoint: v.meetingPoint,
        duration: v.duration || undefined,
      };
    default:
      return {};
  }
}

function defaultTitle(v: VoucherFormValues): string {
  switch (v.voucherType) {
    case 'hotel': return `Hotel - ${v.hotelName ?? ''}`.trim();
    case 'transport': return `Transport - ${v.pickupLocation ?? ''} to ${v.dropLocation ?? ''}`.trim();
    case 'flight': return `Flight - ${v.airline ?? ''} ${v.flightNumber ?? ''}`.trim();
    case 'activity': return `Activity - ${v.activityName ?? ''}`.trim();
    default: return 'Voucher';
  }
}

export default function NewVoucherPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = (searchParams?.get('type') as (typeof VOUCHER_TYPES)[number] | null) ?? undefined;

  return (
    <EntityForm<VoucherFormValues>
      title="New voucher"
      description="Generate a voucher for a hotel, transport, flight, or activity booking."
      schema={schema}
      defaultValues={{
        leadId: '',
        voucherType: initialType ?? 'hotel',
        supplierId: '',
        title: '',
        language: 'en',
        notes: '',
        roomType: 'Deluxe',
        roomCount: 1,
        mealPlan: 'EP',
        travelClass: 'economy',
      }}
      prefillFromParams={{ leadId: 'leadId', type: 'voucherType' }}
      onCancel={() => router.back()}
      onSubmit={async (v) => {
        const data: CreateVoucherRequest = {
          leadId: v.leadId,
          type: v.voucherType,
          supplierId: v.supplierId || undefined,
          title: v.title?.trim() || defaultTitle(v),
          details: buildDetails(v),
          language: v.language,
          notes: v.notes || undefined,
        };
        try {
          const result = await vouchersApi.create(data);
          toast.success('Voucher created successfully');
          router.push(`/vouchers/${result.data.id}`);
        } catch {
          toast.error('Failed to create voucher');
        }
      }}
      renderSections={(form) => {
        const voucherType = form.watch('voucherType');
        return (
          <>
            <SectionCard title="Lead & type" required>
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="leadId" label="Lead" required wide>
                  <RelationCombobox
                    value={form.watch('leadId') || null}
                    onChange={(id) => form.setValue('leadId', id ?? '', { shouldDirty: true, shouldValidate: true })}
                    fetcher={async (q, page) => {
                      const r = await leadsApi.list({ search: q, page, limit: 20 });
                      return { items: r.data.data, total: r.data.pagination.total };
                    }}
                    getOptionId={(l: Lead) => l.id}
                    getOptionLabel={(l: Lead) => l.title}
                    getOptionDescription={(l: Lead) => l.destination ?? undefined}
                    resolveSelected={async (id) => (await leadsApi.getById(id)).data}
                    error={form.formState.errors.leadId?.message}
                  />
                </FormRow>
                <FormRow name="voucherType" label="Voucher type" required>
                  <Select
                    value={form.watch('voucherType')}
                    onValueChange={(v) => form.setValue('voucherType', v as (typeof VOUCHER_TYPES)[number], { shouldDirty: true, shouldValidate: true })}
                  >
                    <SelectTrigger id="voucherType"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hotel">Hotel</SelectItem>
                      <SelectItem value="transport">Transport</SelectItem>
                      <SelectItem value="flight">Flight</SelectItem>
                      <SelectItem value="activity">Activity</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>
                <FormRow name="supplierId" label="Supplier">
                  <RelationCombobox
                    value={form.watch('supplierId') || null}
                    onChange={(id) => form.setValue('supplierId', id ?? '', { shouldDirty: true })}
                    fetcher={async (q, page) => {
                      const r = await suppliersApi.list({ search: q, page, limit: 20 });
                      return { items: r.data.data, total: r.data.pagination.total };
                    }}
                    getOptionId={(s: Supplier) => s.id}
                    getOptionLabel={(s: Supplier) => s.name}
                    getOptionDescription={(s: Supplier) => s.type}
                    resolveSelected={async (id) => (await suppliersApi.getById(id)).data}
                    placeholder="Select supplier (optional)"
                  />
                </FormRow>
              </div>
            </SectionCard>

            {voucherType === 'hotel' && (
              <SectionCard title="Hotel details" required>
                <div className="grid gap-ds-4 sm:grid-cols-2">
                  <FormRow name="hotelName" label="Hotel name" required wide>
                    <Input id="hotelName" {...form.register('hotelName')} placeholder="e.g., Taj Hotels" />
                  </FormRow>
                  <FormRow name="hotelAddress" label="Address" wide>
                    <Input id="hotelAddress" {...form.register('hotelAddress')} placeholder="Hotel address" />
                  </FormRow>
                  <FormRow name="checkIn" label="Check-in" required>
                    <DatePicker value={form.watch('checkIn')} onChange={(d) => form.setValue('checkIn', d, { shouldDirty: true, shouldValidate: true })} />
                  </FormRow>
                  <FormRow name="checkOut" label="Check-out" required>
                    <DatePicker value={form.watch('checkOut')} onChange={(d) => form.setValue('checkOut', d, { shouldDirty: true, shouldValidate: true })} />
                  </FormRow>
                  <FormRow name="roomType" label="Room type">
                    <Select value={form.watch('roomType') || 'Deluxe'} onValueChange={(v) => form.setValue('roomType', v, { shouldDirty: true })}>
                      <SelectTrigger id="roomType"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['Standard', 'Deluxe', 'Super Deluxe', 'Suite', 'Premium', 'Executive', 'Villa'].map((r) => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormRow>
                  <FormRow name="mealPlan" label="Meal plan">
                    <Select value={form.watch('mealPlan') || 'EP'} onValueChange={(v) => form.setValue('mealPlan', v, { shouldDirty: true })}>
                      <SelectTrigger id="mealPlan"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EP">EP — Room Only</SelectItem>
                        <SelectItem value="CP">CP — Continental</SelectItem>
                        <SelectItem value="MAP">MAP — Half Board</SelectItem>
                        <SelectItem value="AP">AP — Full Board</SelectItem>
                        <SelectItem value="AI">AI — All Inclusive</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormRow>
                  <FormRow name="confirmationNumber" label="Confirmation number">
                    <Input id="confirmationNumber" {...form.register('confirmationNumber')} placeholder="Hotel confirmation #" />
                  </FormRow>
                  <FormRow name="guestNames" label="Guest names" hint="Comma-separated" wide>
                    <Input id="guestNames" {...form.register('guestNames')} placeholder="e.g., John Doe, Jane Doe" />
                  </FormRow>
                  <FormRow name="specialRequests" label="Special requests" wide>
                    <Textarea id="specialRequests" {...form.register('specialRequests')} rows={2} />
                  </FormRow>
                </div>
              </SectionCard>
            )}

            {voucherType === 'transport' && (
              <SectionCard title="Transport details" required>
                <div className="grid gap-ds-4 sm:grid-cols-2">
                  <FormRow name="vehicleType" label="Vehicle type" required>
                    <Select value={form.watch('vehicleType') || ''} onValueChange={(v) => form.setValue('vehicleType', v, { shouldDirty: true, shouldValidate: true })}>
                      <SelectTrigger id="vehicleType"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                      <SelectContent>
                        {['Sedan', 'SUV', 'Innova', 'Tempo Traveller', 'Mini Bus', 'Luxury Coach', 'Bus'].map((v) => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormRow>
                  <FormRow name="pickupTime" label="Pickup time" required>
                    <DatePicker value={form.watch('pickupTime')} onChange={(d) => form.setValue('pickupTime', d, { shouldDirty: true, shouldValidate: true })} />
                  </FormRow>
                  <FormRow name="driverName" label="Driver name">
                    <Input id="driverName" {...form.register('driverName')} />
                  </FormRow>
                  <FormRow name="driverPhone" label="Driver phone">
                    <Input id="driverPhone" {...form.register('driverPhone')} placeholder="+91 XXXXX XXXXX" />
                  </FormRow>
                  <FormRow name="pickupLocation" label="Pickup location" required>
                    <Input id="pickupLocation" {...form.register('pickupLocation')} />
                  </FormRow>
                  <FormRow name="dropLocation" label="Drop location" required>
                    <Input id="dropLocation" {...form.register('dropLocation')} />
                  </FormRow>
                  <FormRow name="route" label="Route / itinerary summary" wide>
                    <Textarea id="route" {...form.register('route')} rows={2} />
                  </FormRow>
                </div>
              </SectionCard>
            )}

            {voucherType === 'flight' && (
              <SectionCard title="Flight details" required>
                <div className="grid gap-ds-4 sm:grid-cols-2">
                  <FormRow name="airline" label="Airline" required>
                    <Input id="airline" {...form.register('airline')} />
                  </FormRow>
                  <FormRow name="flightNumber" label="Flight number">
                    <Input id="flightNumber" {...form.register('flightNumber')} />
                  </FormRow>
                  <FormRow name="departureAirport" label="From airport" required>
                    <Input id="departureAirport" {...form.register('departureAirport')} />
                  </FormRow>
                  <FormRow name="arrivalAirport" label="To airport" required>
                    <Input id="arrivalAirport" {...form.register('arrivalAirport')} />
                  </FormRow>
                  <FormRow name="departureTime" label="Departure time" required>
                    <DatePicker value={form.watch('departureTime')} onChange={(d) => form.setValue('departureTime', d, { shouldDirty: true, shouldValidate: true })} />
                  </FormRow>
                  <FormRow name="arrivalTime" label="Arrival time" required>
                    <DatePicker value={form.watch('arrivalTime')} onChange={(d) => form.setValue('arrivalTime', d, { shouldDirty: true, shouldValidate: true })} />
                  </FormRow>
                  <FormRow name="travelClass" label="Travel class">
                    <Select value={form.watch('travelClass') || 'economy'} onValueChange={(v) => form.setValue('travelClass', v, { shouldDirty: true })}>
                      <SelectTrigger id="travelClass"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="economy">Economy</SelectItem>
                        <SelectItem value="premium_economy">Premium Economy</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="first">First</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormRow>
                  <FormRow name="pnr" label="PNR">
                    <Input id="pnr" {...form.register('pnr')} />
                  </FormRow>
                  <FormRow name="passengerNames" label="Passengers" hint="Comma-separated" wide>
                    <Input id="passengerNames" {...form.register('passengerNames')} placeholder="e.g., John Doe, Jane Doe" />
                  </FormRow>
                </div>
              </SectionCard>
            )}

            {voucherType === 'activity' && (
              <SectionCard title="Activity details" required>
                <div className="grid gap-ds-4 sm:grid-cols-2">
                  <FormRow name="activityName" label="Activity name" required wide>
                    <Input id="activityName" {...form.register('activityName')} placeholder="e.g., Scuba Diving" />
                  </FormRow>
                  <FormRow name="dateTime" label="Date & time" required>
                    <DatePicker value={form.watch('dateTime')} onChange={(d) => form.setValue('dateTime', d, { shouldDirty: true, shouldValidate: true })} />
                  </FormRow>
                  <FormRow name="duration" label="Duration">
                    <Input id="duration" {...form.register('duration')} placeholder="e.g., 4 hours" />
                  </FormRow>
                  <FormRow name="meetingPoint" label="Meeting point" required wide>
                    <Input id="meetingPoint" {...form.register('meetingPoint')} />
                  </FormRow>
                </div>
              </SectionCard>
            )}

            <SectionCard title="Options">
              <div className="grid gap-ds-4 sm:grid-cols-2">
                <FormRow name="title" label="Voucher title" hint="Auto-generated if left empty" wide>
                  <Input id="title" {...form.register('title')} />
                </FormRow>
                <FormRow name="language" label="Language">
                  <Select value={form.watch('language')} onValueChange={(v) => form.setValue('language', v, { shouldDirty: true })}>
                    <SelectTrigger id="language"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                      <SelectItem value="ar">Arabic</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>
                <FormRow name="notes" label="Notes" wide>
                  <Textarea id="notes" {...form.register('notes')} rows={3} placeholder="Internal notes..." />
                </FormRow>
              </div>
            </SectionCard>
          </>
        );
      }}
    />
  );
}
