'use client';

import * as React from 'react';

import { RelationCombobox } from '@/components/domain';
import { contactsApi } from '@/lib/api/contacts';
import { leadsApi } from '@/lib/api/leads';
import { itineraryTemplatesApi } from '@/lib/api/itineraries';
import { fleetApi } from '@/lib/api/fleet';
import { usersApi } from '@/lib/api/users';
import { suppliersApi } from '@/lib/api/suppliers';
import { travellersApi } from '@/lib/api/visa';
import { toursApi, type Tour } from '@/lib/api/tours';
import { departuresApi, type Departure } from '@/lib/api/departures';
import { unwrapEntity, unwrapList } from '@/lib/api/envelope';
import { formatDisplayDate } from '@/lib/dates';
import { useT } from '@/lib/i18n';

// Searchable pickers for every relation of the group tours screens: a raw id is never typed.

interface PickerProps {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  placeholder?: string;
  'aria-label'?: string;
  className?: string;
}

interface Named {
  id: string;
  name?: string;
  title?: string;
  email?: string | null;
  phone?: string | null;
}

/** One page of options from a list the API pages by number. */
async function page<T>(res: unknown, limit: number): Promise<{ items: T[]; total: number }> {
  const list = unwrapList<T>(res, { limit });
  return { items: list.data, total: list.pagination?.total ?? list.data.length };
}

export function TourCombobox({ placeholder, ...props }: PickerProps) {
  const t = useT();
  return (
    <RelationCombobox<Tour>
      {...props}
      onChange={(id) => props.onChange(id)}
      fetcher={async (q) => {
        const r = await toursApi.listPage({ q: q || undefined, status: 'active', limit: 50 });
        return { items: r.items, total: r.items.length };
      }}
      getOptionId={(x) => x.id}
      getOptionLabel={(x) => `${x.code} · ${x.title}`}
      getOptionDescription={(x) => x.destination ?? undefined}
      resolveSelected={async (id) => toursApi.get(id)}
      placeholder={placeholder ?? t('departures.pickers.tour')}
      searchPlaceholder={t('departures.pickers.tourSearch')}
      emptyText={t('departures.pickers.tourEmpty')}
    />
  );
}

export function DepartureCombobox({
  excludeId,
  tourId,
  placeholder,
  ...props
}: PickerProps & { excludeId?: string; tourId?: string }) {
  const t = useT();
  return (
    <RelationCombobox<Departure>
      {...props}
      onChange={(id) => props.onChange(id)}
      fetcher={async (q) => {
        const p = departuresApi.pager();
        const r = await p.fetch(1, 50, { ...departuresApi.listParams({ status: 'open', q, tour: tourId }) });
        const items = r.data.filter((d) => d.id !== excludeId);
        return { items, total: items.length };
      }}
      getOptionId={(x) => x.id}
      getOptionLabel={(x) => `${x.code} · ${formatDisplayDate(x.startDate)}`}
      getOptionDescription={(x) =>
        x.seats ? t('departures.seats.left', { left: x.seats.left, capacity: x.seats.capacity }) : (x.tourTitle ?? undefined)
      }
      resolveSelected={async (id) => departuresApi.get(id)}
      placeholder={placeholder ?? t('departures.pickers.departure')}
      searchPlaceholder={t('departures.pickers.departureSearch')}
      emptyText={t('departures.pickers.departureEmpty')}
    />
  );
}

export function ContactCombobox({ placeholder, ...props }: PickerProps) {
  const t = useT();
  return (
    <RelationCombobox<Named>
      {...props}
      onChange={(id) => props.onChange(id)}
      fetcher={async (q, p) => page<Named>(await contactsApi.list({ search: q || undefined, page: p, limit: 20 }), 20)}
      getOptionId={(x) => x.id}
      getOptionLabel={(x) => x.name ?? x.id}
      getOptionDescription={(x) => x.email ?? x.phone ?? undefined}
      resolveSelected={async (id) => unwrapEntity<Named>(await contactsApi.getById(id))}
      placeholder={placeholder ?? t('departures.pickers.contact')}
      searchPlaceholder={t('departures.pickers.contactSearch')}
      emptyText={t('departures.pickers.contactEmpty')}
    />
  );
}

export function LeadCombobox({ placeholder, ...props }: PickerProps) {
  const t = useT();
  const label = (l: Named & { contactName?: string | null }) => {
    const title = l.title ?? l.id;
    return l.contactName ? `${title} - ${l.contactName}` : title;
  };
  return (
    <RelationCombobox<Named & { contactName?: string | null }>
      {...props}
      onChange={(id) => props.onChange(id)}
      fetcher={async (q, p) => page(await leadsApi.list({ search: q || undefined, page: p, limit: 20 }), 20)}
      getOptionId={(x) => x.id}
      getOptionLabel={label}
      resolveSelected={async (id) => unwrapEntity<Named & { contactName?: string | null }>(await leadsApi.getById(id))}
      placeholder={placeholder ?? t('departures.pickers.lead')}
      searchPlaceholder={t('departures.pickers.leadSearch')}
      emptyText={t('departures.pickers.leadEmpty')}
    />
  );
}

type TemplateOption = Named & { destination?: string | null; durationDays?: number | null };

export function ItineraryTemplateCombobox({ placeholder, onPick, ...props }: PickerProps & { onPick?: (template: TemplateOption | null) => void }) {
  const t = useT();
  return (
    <RelationCombobox<TemplateOption>
      {...props}
      onChange={(id, item) => {
        props.onChange(id);
        onPick?.(item);
      }}
      fetcher={async (q, p) => page(await itineraryTemplatesApi.list({ search: q || undefined, page: p, limit: 20 }), 20)}
      getOptionId={(x) => x.id}
      getOptionLabel={(x) => x.title ?? x.id}
      getOptionDescription={(x) => x.destination ?? undefined}
      resolveSelected={async (id) => unwrapEntity<Named>(await itineraryTemplatesApi.getById(id))}
      placeholder={placeholder ?? t('tours.pickers.template')}
      searchPlaceholder={t('tours.pickers.templateSearch')}
      emptyText={t('tours.pickers.templateEmpty')}
    />
  );
}

interface DriverOption {
  id: string;
  name: string;
  phone?: string;
}

export function DriverCombobox({ placeholder, ...props }: PickerProps) {
  const t = useT();
  return (
    <RelationCombobox<DriverOption>
      {...props}
      onChange={(id) => props.onChange(id)}
      fetcher={async (q, p) => page<DriverOption>(await fleetApi.drivers.list({ search: q || undefined, page: p, limit: 20 }), 20)}
      getOptionId={(x) => x.id}
      getOptionLabel={(x) => x.name}
      getOptionDescription={(x) => x.phone}
      resolveSelected={async (id) => unwrapEntity<DriverOption>(await fleetApi.drivers.getById(id))}
      placeholder={placeholder ?? t('departures.pickers.driver')}
      searchPlaceholder={t('departures.pickers.driverSearch')}
      emptyText={t('departures.pickers.driverEmpty')}
    />
  );
}

export function UserCombobox({ placeholder, ...props }: PickerProps) {
  const t = useT();
  return (
    <RelationCombobox<{ id: string; name?: string; email?: string }>
      {...props}
      onChange={(id) => props.onChange(id)}
      fetcher={async (q, p) => {
        const r = await usersApi.list({ search: q || undefined, page: p, limit: 20 });
        return { items: r.data as Array<{ id: string; name?: string; email?: string }>, total: r.pagination?.total ?? r.data.length };
      }}
      getOptionId={(x) => x.id}
      getOptionLabel={(x) => x.name ?? x.email ?? x.id}
      getOptionDescription={(x) => x.email}
      resolveSelected={async (id) => {
        const all = await usersApi.list({ limit: 200 });
        return (all.data as Array<{ id: string; name?: string; email?: string }>).find((u) => u.id === id) ?? null;
      }}
      placeholder={placeholder ?? t('departures.pickers.user')}
      searchPlaceholder={t('departures.pickers.userSearch')}
      emptyText={t('departures.pickers.userEmpty')}
    />
  );
}

interface VehicleOption {
  id: string;
  make?: string;
  model?: string;
  registrationNumber?: string;
  capacity?: number;
  seatingCapacity?: number;
}

const vehicleLabel = (v: VehicleOption) => [[v.make, v.model].filter(Boolean).join(' '), v.registrationNumber].filter(Boolean).join(' · ') || v.id;

export function VehicleCombobox({
  onPick,
  placeholder,
  ...props
}: PickerProps & { onPick?: (vehicle: VehicleOption | null) => void }) {
  const t = useT();
  return (
    <RelationCombobox<VehicleOption>
      {...props}
      onChange={(id, item) => {
        props.onChange(id);
        onPick?.(item);
      }}
      fetcher={async (q, p) => page<VehicleOption>(await fleetApi.vehicles.list({ search: q || undefined, page: p, limit: 20 }), 20)}
      getOptionId={(x) => x.id}
      getOptionLabel={vehicleLabel}
      getOptionDescription={(x) => {
        const seats = x.seatingCapacity ?? x.capacity;
        return seats ? t('departures.vehicles.seatsOption', { count: seats }) : undefined;
      }}
      resolveSelected={async (id) => unwrapEntity<VehicleOption>(await fleetApi.vehicles.getById(id))}
      placeholder={placeholder ?? t('departures.pickers.vehicle')}
      searchPlaceholder={t('departures.pickers.vehicleSearch')}
      emptyText={t('departures.pickers.vehicleEmpty')}
    />
  );
}

export function SupplierCombobox({ placeholder, ...props }: PickerProps) {
  const t = useT();
  return (
    <RelationCombobox<{ id: string; companyName: string; email?: string }>
      {...props}
      onChange={(id) => props.onChange(id)}
      fetcher={async (q, p) => {
        const r = await suppliersApi.listRecords({ search: q || undefined, page: p, limit: 20 });
        return { items: r.data, total: r.pagination?.total ?? r.data.length };
      }}
      getOptionId={(x) => x.id}
      getOptionLabel={(x) => x.companyName || x.id}
      getOptionDescription={(x) => x.email}
      resolveSelected={async (id) => {
        const r = await suppliersApi.getRecord(id);
        return r.data;
      }}
      placeholder={placeholder ?? t('departures.pickers.supplier')}
      searchPlaceholder={t('departures.pickers.supplierSearch')}
      emptyText={t('departures.pickers.supplierEmpty')}
    />
  );
}

interface TravellerOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  dateOfBirth?: string;
  nationality?: string;
}

export function TravellerCombobox({
  onPick,
  placeholder,
  ...props
}: PickerProps & { onPick?: (traveller: TravellerOption | null) => void }) {
  const t = useT();
  return (
    <RelationCombobox<TravellerOption>
      {...props}
      onChange={(id, item) => {
        props.onChange(id);
        onPick?.(item);
      }}
      fetcher={async (q, p) => {
        const r = await travellersApi.list({ search: q || undefined, page: p, limit: 20 });
        return { items: r.data as TravellerOption[], total: r.pagination?.total ?? r.data.length };
      }}
      getOptionId={(x) => x.id}
      getOptionLabel={(x) => `${x.firstName} ${x.lastName}`.trim() || x.id}
      getOptionDescription={(x) => x.email}
      resolveSelected={async (id) => (await travellersApi.getById(id)).data as TravellerOption}
      placeholder={placeholder ?? t('departures.pickers.traveller')}
      searchPlaceholder={t('departures.pickers.travellerSearch')}
      emptyText={t('departures.pickers.travellerEmpty')}
    />
  );
}
