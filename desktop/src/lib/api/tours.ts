import { client } from './client';
import { unwrapEntity } from './envelope';
import { CursorPager, toCursorPage, type CursorPage } from './cursor-pager';
import type { ConfirmMode, DepositType, PassengerFieldDef, RoomTypeDef } from './departures';

// Tours (R139 API, R144 screens): the product an agency sells departure after departure.

export type StopKind = 'pickup' | 'dropoff' | 'both' | 'waypoint';
export type PriceKind = 'age_band' | 'room_supplement' | 'seat_surcharge' | 'other';
export type TourStatus = 'active' | 'archived';

export interface Tour {
  id: string;
  code: string;
  title: string;
  description: string | null;
  destination: string | null;
  itineraryTemplateId: string | null;
  durationDays: number | null;
  currency: string | null;
  defaultCapacity: number | null;
  bookingCutoffDays: number | null;
  extrasCutoffDays: number | null;
  holdExpiryHours: number | null;
  confirmMode: ConfirmMode | null;
  depositType: DepositType | null;
  depositValue: number | null;
  passengerFields: PassengerFieldDef[] | null;
  roomTypes: RoomTypeDef[] | null;
  terms: string | null;
  status: TourStatus;
  createdAt: string | null;
  updatedAt: string | null;
  departuresCount?: number;
}

export interface Stop {
  id?: string;
  sortOrder?: number;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  localTime?: string | null;
  dayOffset?: number;
  kind?: StopKind;
  documentsCheck?: boolean;
  notes?: string | null;
  scheduledAt?: string | null;
}

export interface Price {
  id?: string;
  departureId?: string | null;
  kind: PriceKind;
  key: string;
  label?: string | null;
  amount: number;
  currency?: string | null;
  sortOrder?: number;
  /** Set on a departure's effective prices: where the amount comes from. */
  source?: 'tour' | 'departure';
}

export interface TourExtra {
  id?: string;
  tourId?: string | null;
  departureId?: string | null;
  dayNumber?: number | null;
  title: string;
  description?: string | null;
  price: number;
  currency?: string | null;
  /** Price per age band key; a band not listed pays the price above. */
  bandPrices?: Record<string, number> | null;
  rateCardId?: string | null;
  supplierId?: string | null;
  sortOrder?: number;
  capacity?: number | null;
  cutoffHoursBefore?: number | null;
  refundableUntilHours?: number | null;
  isActive?: boolean;
}

export interface TourDetail extends Tour {
  stops: Stop[];
  prices: Price[];
  extras: TourExtra[];
}

/** The fields the create and update calls take. Dates are not on a tour; times are 'HH:MM'. */
export type TourInput = Partial<
  Pick<
    Tour,
    | 'code' | 'title' | 'description' | 'destination' | 'itineraryTemplateId' | 'durationDays' | 'currency' | 'defaultCapacity'
    | 'bookingCutoffDays' | 'extrasCutoffDays' | 'holdExpiryHours' | 'confirmMode' | 'depositType' | 'depositValue'
    | 'passengerFields' | 'roomTypes' | 'terms' | 'status'
  >
>;

export interface TourListParams {
  q?: string;
  status?: TourStatus | 'all';
  destination?: string;
  limit?: number;
}

export const toursApi = {
  /** One page, by cursor. Page through with a CursorPager (see list pages) or pass `cursor` yourself. */
  listPage: async (params: TourListParams & { cursor?: string } = {}): Promise<CursorPage<Tour>> =>
    toCursorPage<Tour>(await client.get<unknown>('/tours', { params: { limit: 20, ...params } })),

  pager: () => new CursorPager<Tour>((cursor, p) => client.get<unknown>('/tours', { params: { ...p, cursor } })),

  get: async (id: string) => unwrapEntity<TourDetail>(await client.get<unknown>(`/tours/${id}`)),

  create: async (input: TourInput & { code: string; title: string }) =>
    unwrapEntity<TourDetail>(await client.post<unknown>('/tours', input)),

  update: async (id: string, input: TourInput) => unwrapEntity<TourDetail>(await client.put<unknown>(`/tours/${id}`, input)),

  /** A tour that ever had a departure is archived; one that never had one is deleted. */
  remove: async (id: string) =>
    unwrapEntity<{ id: string; archived: boolean; deleted: boolean }>(await client.delete<unknown>(`/tours/${id}`)),

  replaceStops: async (id: string, stops: Stop[]) =>
    unwrapEntity<Stop[]>(await client.put<unknown>(`/tours/${id}/stops`, { stops })),

  replacePrices: async (id: string, prices: Price[]) =>
    unwrapEntity<Price[]>(await client.put<unknown>(`/tours/${id}/prices`, { prices })),

  replaceExtras: async (id: string, extras: TourExtra[]) =>
    unwrapEntity<TourExtra[]>(await client.put<unknown>(`/tours/${id}/extras`, { extras })),
};
