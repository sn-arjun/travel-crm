import { client } from './client';
import { unwrapEntity, unwrapList } from './envelope';
import { CursorPager } from './cursor-pager';
import type { Price, Stop } from './tours';

// Group departures (R139 / R143 API, R144 screens): the agency settings, departures, seat bookings and passengers.

export type ConfirmMode = 'manual' | 'auto_when_available' | 'on_deposit';
export type DepositType = 'none' | 'percent' | 'per_seat' | 'fixed';
export type ShowSeatsLeft = 'always' | 'below_threshold' | 'never';
export type DepartureStatus = 'draft' | 'open' | 'closed' | 'departed' | 'completed' | 'cancelled';
export type SeatBookingStatus = 'held' | 'confirmed' | 'waitlisted' | 'cancelled' | 'expired';
export type PassengerFieldType = 'text' | 'date' | 'select' | 'boolean';
export type CollectOn = 'booking' | 'self_service' | 'staff_only';

export interface PassengerFieldDef {
  key: string;
  label: string;
  required: boolean;
  collectOn: CollectOn;
  type?: PassengerFieldType;
  options?: string[];
  custom?: boolean;
}

export interface RoomTypeDef {
  key: string;
  label: string;
  occupancy: number;
}

/** Settings > Group tours (design 4.1). The API returns every field, merged over the defaults. */
export interface GroupToursSettings {
  enabled: boolean;
  holdExpiryHours: number;
  confirmMode: ConfirmMode;
  markLeadWonOnConfirm: boolean;
  waitlist: { enabled: boolean; offerMode: 'suggest' | 'auto_hold'; offerHoldHours: number };
  defaultVehicleCapacity: number;
  bookingCutoffDays: number;
  extrasCutoffDays: number;
  passengerFields: PassengerFieldDef[];
  roomTypes: RoomTypeDef[];
  shareMatching: boolean;
  preferredSeat: { enabled: boolean };
  showSeatsLeft: ShowSeatsLeft;
  seatsLeftThreshold: number;
  deposit: { type: DepositType; value: number | null };
  publicBooking: { requireTerms: boolean; termsText: string; marketingOptIn: boolean };
  driverSeesPassengers: boolean;
}

export interface SeatsSummary {
  capacity: number;
  held: number;
  confirmed: number;
  waitlisted: number;
  /** capacity - held - confirmed, never below 0. */
  left: number;
}

export interface Departure {
  id: string;
  tourId: string;
  tourCode?: string;
  tourTitle?: string;
  code: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  status: DepartureStatus;
  capacityMode: 'vehicles' | 'manual';
  capacity: number;
  bookingCutoffDate: string | null;
  extrasCutoffDate: string | null;
  holdExpiryHours: number | null;
  confirmMode: ConfirmMode | null;
  showSeatsLeft: ShowSeatsLeft | null;
  publicBookingEnabled: boolean;
  tourLeaderDriverId: string | null;
  tourLeaderUserId: string | null;
  notes: string | null;
  cancelledReason: string | null;
  updatedAt?: string | null;
  seats?: SeatsSummary;
}

export interface DepartureVehicle {
  id?: string;
  vehicleId?: string | null;
  label?: string | null;
  capacity: number;
  driverId?: string | null;
  registrationNumber?: string | null;
}

export interface DepartureDetail extends Departure {
  seats: SeatsSummary;
  vehicles: DepartureVehicle[];
  stops: Stop[];
  effective: {
    holdExpiryHours: number;
    confirmMode: ConfirmMode;
    showSeatsLeft: ShowSeatsLeft;
    deposit: { type: DepositType; value: number | null };
  };
}

export interface DepartureCost {
  id?: string;
  supplierId?: string | null;
  description: string;
  kind?: 'per_departure' | 'per_seat';
  amount: number;
  currency?: string | null;
}

export interface Passenger {
  id: string;
  seatBookingId: string;
  departureId: string;
  travellerId: string | null;
  firstName: string;
  lastName: string;
  gender: string | null;
  dateOfBirth: string | null;
  ageYears: number | null;
  bandKey: string | null;
  pickupStopId: string | null;
  roomType: string | null;
  shareOk: boolean;
  shareGender: boolean;
  roomGroup: string | null;
  seatNumber: string | null;
  seatSurcharge: number | null;
  mealPreference: string | null;
  documentsStatus: 'unknown' | 'provided' | 'checked' | 'problem';
  extraFields: Record<string, unknown> | null;
  status: 'active' | 'cancelled';
}

/** What the passengers editor sends; an existing passenger keeps its id (and its extras). */
export interface PassengerInput {
  id?: string;
  travellerId?: string | null;
  firstName: string;
  lastName: string;
  gender?: 'male' | 'female' | 'other' | null;
  dateOfBirth?: string | null;
  ageYears?: number | null;
  pickupStopId?: string | null;
  roomType?: string | null;
  shareOk?: boolean;
  shareGender?: boolean;
  mealPreference?: string | null;
  /** Staff-side details: left out, the saved value stays; null clears it. */
  seatNumber?: string | null;
  roomGroup?: string | null;
  documentsStatus?: Passenger['documentsStatus'];
  extraFields?: Record<string, string | number | boolean | null>;
}

export interface SeatBooking {
  id: string;
  departureId: string;
  leadId: string;
  contactId: string;
  status: SeatBookingStatus;
  seats: number;
  holdExpiresAt: string | null;
  waitlistPosition: number | null;
  offeredAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  source: string;
  notes: string | null;
  createdAt: string | null;
  contactName?: string | null;
  leadTitle?: string | null;
  departureCode?: string | null;
  passengersCount?: number;
}

export interface SeatBookingDetail extends SeatBooking {
  passengers: Passenger[];
}

export interface DepartureListParams {
  tour?: string;
  status?: DepartureStatus;
  from?: string;
  to?: string;
  hasSeats?: boolean;
  q?: string;
  /** Part of the tour's destination. */
  destination?: string;
}

export interface DepartureInput {
  code?: string;
  startDate?: string;
  endDate?: string;
  startTime?: string | null;
  capacityMode?: 'vehicles' | 'manual';
  capacity?: number;
  bookingCutoffDate?: string | null;
  extrasCutoffDate?: string | null;
  holdExpiryHours?: number | null;
  confirmMode?: ConfirmMode | null;
  showSeatsLeft?: ShowSeatsLeft | null;
  publicBookingEnabled?: boolean;
  tourLeaderDriverId?: string | null;
  tourLeaderUserId?: string | null;
  notes?: string | null;
  vehicles?: DepartureVehicle[];
}

/** One departure with its seats, as the lead, the quote and the calendar events carry it (R146). */
export interface DepartureSummary {
  id: string;
  code: string;
  status: DepartureStatus;
  tourTitle: string;
  startDate: string;
  endDate?: string;
  seats: SeatsSummary;
}

/** The `seats` field of a quote (GET /itineraries/:id) that is linked to a departure. */
export interface QuoteSeats {
  requested: number | null;
  left: number;
  /** The seats requested fit in the seats left. */
  fits: boolean;
}

export type ManifestView = 'pickup' | 'rooming' | 'full';
export type ManifestFormat = 'csv' | 'pdf';
export type ManifestCell = string | number | null;

export interface ManifestGroup {
  key: string;
  title: string;
  time: string | null;
  documentsCheck: boolean;
  rows: Array<Record<string, ManifestCell>>;
}

export interface Manifest {
  view: ManifestView;
  title: string;
  groupLabel: string | null;
  columns: Array<{ key: string; label: string }>;
  groups: ManifestGroup[];
  totals: { passengers: number; seats: number };
  documentNumbersIncluded: boolean;
}

export interface RoomSuggestion {
  room: string;
  passengers: Array<{ id: string; name: string }>;
}

export interface CoachTrip {
  id: string;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  driverId: string | null;
  driverName: string | null;
  tourLeaderId: string | null;
  tourLeaderName: string | null;
  status: string;
  pickupDatetime: string | null;
  dropDatetime: string | null;
}

export interface HoldSeatsInput {
  leadId?: string;
  contact?: { contactId?: string; name?: string; phone?: string; email?: string };
  seats?: number;
  passengers?: PassengerInput[];
  createTravellers?: boolean;
  notes?: string | null;
}

export interface BulkConfirmResult {
  results: Array<{ id: string; ok: boolean; code?: string; message?: string }>;
  confirmed: number;
  failed: number;
}

export const departuresApi = {
  getSettings: async () => unwrapEntity<GroupToursSettings>(await client.get<unknown>('/departures/settings')),

  /** Admin only. A partial input is merged over the saved settings; the whole merged value comes back. */
  saveSettings: async (input: Partial<GroupToursSettings>) =>
    unwrapEntity<GroupToursSettings>(await client.put<unknown>('/departures/settings', input)),

  pager: () =>
    new CursorPager<Departure>((cursor, p) => client.get<unknown>('/departures', { params: { ...p, cursor } })),

  /** Query parameters of the list call for the filters of the departures page. */
  listParams: (f: DepartureListParams) => ({
    tour: f.tour,
    status: f.status,
    from: f.from,
    to: f.to,
    hasSeats: f.hasSeats ? 'true' : undefined,
    q: f.q || undefined,
    destination: f.destination || undefined,
  }),

  get: async (id: string) => unwrapEntity<DepartureDetail>(await client.get<unknown>(`/departures/${id}`)),

  create: async (input: DepartureInput & { tourId: string; startDate: string }) =>
    unwrapEntity<DepartureDetail>(await client.post<unknown>('/departures', input)),

  /** Several dates of one tour; a date whose code is taken is reported in `skipped`. */
  createBulk: async (input: Omit<DepartureInput, 'code' | 'startDate' | 'endDate'> & { tourId: string; dates: string[] }) =>
    unwrapEntity<{ created: DepartureDetail[]; skipped: Array<{ date: string; code: string; message: string }> }>(
      await client.post<unknown>('/departures/bulk', input),
    ),

  update: async (id: string, input: DepartureInput) =>
    unwrapEntity<DepartureDetail>(await client.put<unknown>(`/departures/${id}`, input)),

  changeStatus: async (id: string, status: DepartureStatus, reason?: string) =>
    unwrapEntity<DepartureDetail>(await client.post<unknown>(`/departures/${id}/status`, { status, ...(reason ? { reason } : {}) })),

  remove: async (id: string) => unwrapEntity<{ id: string; deleted: boolean }>(await client.delete<unknown>(`/departures/${id}`)),

  replaceVehicles: async (id: string, vehicles: DepartureVehicle[]) =>
    unwrapEntity<DepartureVehicle[]>(await client.put<unknown>(`/departures/${id}/vehicles`, { vehicles })),

  replaceStops: async (id: string, stops: Stop[]) => unwrapEntity<Stop[]>(await client.put<unknown>(`/departures/${id}/stops`, { stops })),

  getPrices: async (id: string) => unwrapEntity<Price[]>(await client.get<unknown>(`/departures/${id}/prices`)),
  replacePrices: async (id: string, prices: Price[]) => unwrapEntity<Price[]>(await client.put<unknown>(`/departures/${id}/prices`, { prices })),

  getCosts: async (id: string) => unwrapEntity<DepartureCost[]>(await client.get<unknown>(`/departures/${id}/costs`)),
  replaceCosts: async (id: string, costs: DepartureCost[]) => unwrapEntity<DepartureCost[]>(await client.put<unknown>(`/departures/${id}/costs`, { costs })),

  bookingsPager: (departureId: string) =>
    new CursorPager<SeatBooking>((cursor, p) => client.get<unknown>(`/departures/${departureId}/bookings`, { params: { ...p, cursor } })),

  /** The pickup, rooming or full list as data (the Manifest tab); CSV and PDF come from `downloadManifest`. */
  manifest: async (id: string, view: ManifestView, bookings: 'all' | 'confirmed' = 'all') =>
    unwrapEntity<Manifest>(await client.get<unknown>(`/departures/${id}/manifest`, { params: { view, format: 'json', bookings } })),

  /** The manifest as a file. The server names it `<departure code>-<view>.<csv|pdf>`. */
  downloadManifest: async (id: string, view: ManifestView, format: ManifestFormat, bookings: 'all' | 'confirmed' = 'all') =>
    (await client.get<Blob>(`/departures/${id}/manifest`, { params: { view, format, bookings }, responseType: 'blob' })) as unknown as Blob,

  /** Pairs of passengers who agreed to share a room; nothing is saved until `saveRooms`. */
  roomSuggestions: async (id: string) => unwrapEntity<RoomSuggestion[]>(await client.get<unknown>(`/departures/${id}/rooms/suggestions`)),

  saveRooms: async (id: string, assignments: Array<{ passengerId: string; roomGroup: string | null }>) =>
    unwrapEntity<{ updated: number }>(await client.put<unknown>(`/departures/${id}/rooms`, { assignments })),

  /** One coach trip per vehicle of the departure (needs the coach_trips feature). `replace` rebuilds trips that were made before. */
  createTrips: async (id: string, replace = false) =>
    unwrapEntity<{ created: boolean; trips: CoachTrip[] }>(await client.post<unknown>(`/departures/${id}/trips`, {}, { params: replace ? { replace: '1' } : undefined })),

  /** The coach trips that were made from this departure. */
  trips: async (id: string) => unwrapList<Partial<CoachTrip> & { id: string }>(await client.get<unknown>('/fleet/trips', { params: { departureId: id, limit: 50 } })).data,

  /** Points the enquiry at a departure (or clears it) without holding seats. */
  linkLead: async (leadId: string, departureId: string | null) =>
    unwrapEntity<{ id: string; departureId: string | null }>(await client.put<unknown>(`/leads/${leadId}/departure`, { departureId })),

  /** Points a quote at a departure with the seats it asks for (default: the lead's party size). */
  linkQuote: async (itineraryId: string, departureId: string | null, seatsRequested?: number) =>
    unwrapEntity<{ id: string; departureId: string | null; seatsRequested: number | null }>(
      await client.put<unknown>(`/itineraries/${itineraryId}/departure`, { departureId, ...(seatsRequested ? { seatsRequested } : {}) }),
    ),

  /** Seats held and confirmed by one lead. */
  leadBookings: async (leadId: string) => unwrapEntity<SeatBooking[]>(await client.get<unknown>(`/leads/${leadId}/seat-bookings`)),

  /** Holds seats for a lead that already exists. */
  holdForLead: async (leadId: string, departureId: string, seats: number) =>
    unwrapEntity<SeatBooking>(await client.post<unknown>(`/leads/${leadId}/hold-seats`, { departureId, seats })),

  /** Holds seats (or joins the waitlist when the departure is full and the agency has one). */
  holdSeats: async (departureId: string, input: HoldSeatsInput) =>
    unwrapEntity<SeatBookingDetail>(await client.post<unknown>(`/departures/${departureId}/bookings`, input)),
};

export const seatBookingsApi = {
  get: async (id: string) => unwrapEntity<SeatBookingDetail>(await client.get<unknown>(`/seat-bookings/${id}`)),
  confirm: async (id: string) => unwrapEntity<SeatBookingDetail>(await client.post<unknown>(`/seat-bookings/${id}/confirm`, {})),
  bulkConfirm: async (ids: string[]) => unwrapEntity<BulkConfirmResult>(await client.post<unknown>('/seat-bookings/bulk-confirm', { ids })),
  cancel: async (id: string, reason?: string) =>
    unwrapEntity<SeatBookingDetail>(await client.post<unknown>(`/seat-bookings/${id}/cancel`, reason ? { reason } : {})),
  /** Offers the seats to a waitlisted party now. */
  offer: async (id: string) => unwrapEntity<SeatBookingDetail>(await client.post<unknown>(`/seat-bookings/${id}/offer`, {})),
  move: async (id: string, toDepartureId: string) =>
    unwrapEntity<SeatBookingDetail>(await client.post<unknown>(`/seat-bookings/${id}/move`, { toDepartureId })),
  changeSeats: async (id: string, seats: number) => unwrapEntity<SeatBookingDetail>(await client.put<unknown>(`/seat-bookings/${id}/seats`, { seats })),
  replacePassengers: async (id: string, passengers: PassengerInput[], createTravellers?: boolean) =>
    unwrapEntity<SeatBookingDetail>(await client.put<unknown>(`/seat-bookings/${id}/passengers`, { passengers, ...(createTravellers ? { createTravellers } : {}) })),
};

/** The error code of a failed call (`SEATS_UNAVAILABLE`, `ILLEGAL_TRANSITION`, ...), when the API sent one. */
export function apiErrorCode(err: unknown): string | undefined {
  return err && typeof err === 'object' && 'code' in err ? ((err as { code?: string }).code ?? undefined) : undefined;
}
