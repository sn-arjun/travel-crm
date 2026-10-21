// ─── Group departures (R139) ───────────────────────────────
// Shapes of the /tours and /departures API. Seat booking behaviour arrives with later batches; the types are here so
// desktop batches share one definition.

export type DepartureStatus = 'draft' | 'open' | 'closed' | 'departed' | 'completed' | 'cancelled';
export type TourStatus = 'active' | 'archived';
export type ConfirmMode = 'manual' | 'auto_when_available' | 'on_deposit';
export type DepositType = 'none' | 'percent' | 'per_seat' | 'fixed';
export type ShowSeatsLeft = 'always' | 'below_threshold' | 'never';
export type StopKind = 'pickup' | 'dropoff' | 'both' | 'waypoint';
export type PriceKind = 'age_band' | 'room_supplement' | 'seat_surcharge' | 'other';
export type SeatBookingStatus = 'held' | 'confirmed' | 'waitlisted' | 'cancelled' | 'expired';
export type SeatBookingSource = 'staff' | 'public_page' | 'quote_accept' | 'assistant' | 'import';

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
  terms: string | null;
  status: TourStatus;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  departuresCount?: number;
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
  calendarEventId: string | null;
  notes: string | null;
  cancelledReason: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  seats?: SeatsSummary;
}

export interface DepartureStop {
  id: string;
  sortOrder: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  localTime: string | null;
  dayOffset: number;
  kind: StopKind;
  documentsCheck: boolean;
  notes: string | null;
  /** UTC instant computed in the agency's time zone. */
  scheduledAt?: string | null;
}

export interface TourPrice {
  id: string;
  departureId: string | null;
  kind: PriceKind;
  key: string;
  label: string | null;
  amount: number;
  currency: string | null;
  sortOrder: number;
}

export interface SeatBooking {
  id: string;
  departureId: string;
  leadId: string;
  contactId: string;
  itineraryId: string | null;
  invoiceId: string | null;
  status: SeatBookingStatus;
  seats: number;
  holdExpiresAt: string | null;
  waitlistPosition: number | null;
  /** Set when a waitlisted party was offered seats (R143). */
  offeredAt?: string | null;
  confirmedAt: string | null;
  /** A user id, or auto, deposit or quote_accept (R143). */
  confirmedBy?: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  source: SeatBookingSource;
  roomNotes?: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Joined fields of the list and detail endpoints (R143). */
  contactName?: string | null;
  leadTitle?: string | null;
  departureCode?: string | null;
  passengersCount?: number;
}

/** GET /seat-bookings/:id and the results of the actions on it (R143). */
export interface SeatBookingDetail extends SeatBooking {
  passengers: SeatPassenger[];
}

/** One row of GET /leads/:id/seat-bookings (R143). */
export interface LeadSeatBooking extends SeatBooking {
  departureStartDate: string;
  departureEndDate: string;
  departureStatus: DepartureStatus;
  tourTitle: string;
}

/** Why a seat request was refused: 409 SEATS_UNAVAILABLE carries the seats that are left. */
export interface SeatsUnavailableDetails {
  seatsLeft: number;
}

export interface SeatPassenger {
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
  shareOk?: boolean;
  shareGender?: boolean;
  roomGroup?: string | null;
  seatNumber: string | null;
  mealPreference: string | null;
  documentsStatus: 'unknown' | 'provided' | 'checked' | 'problem';
  extraFields: Record<string, unknown> | null;
  status: 'active' | 'cancelled';
}

// ---------------------------------------------------------------- coach trips (R145)

/** A crew member is a driver, a tour leader, or both (drivers.crew_role). */
export type CrewRole = 'driver' | 'tour_leader' | 'both';

/** trip_assignments.trip_kind: a coach trip has ordered stops and passengers to tick off. */
export type TripKind = 'transfer' | 'coach';

export type TripStopStatus = 'pending' | 'arrived' | 'departed' | 'skipped';

export type BoardingStatus = 'pending' | 'boarded' | 'no_show';

/** One stop of a coach trip (GET /fleet/trips/:id/stops). */
export interface TripStop {
  id: string;
  tripId: string;
  /** The departure stop this one was copied from; null for a trip without a departure. */
  departureStopId: string | null;
  sortOrder: number;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** UTC instant. */
  scheduledAt: string | null;
  documentsCheck: boolean;
  status: TripStopStatus;
  arrivedAt: string | null;
  departedAt: string | null;
  arrivedLat: number | null;
  arrivedLng: number | null;
}

/** One person on a coach trip, at one stop. */
export interface TripPassenger {
  id: string;
  tripId: string;
  tripStopId: string | null;
  /** The manifest row this was copied from; null for a passenger added by hand. */
  seatPassengerId: string | null;
  contactId: string | null;
  name: string;
  phone: string | null;
  seats: number;
  boarding: BoardingStatus;
  boardedAt: string | null;
  documentsChecked: boolean;
  documentsCheckedAt: string | null;
  notes: string | null;
}

/** GET /fleet/trips/:id/passengers: by stop, in stop order; people without a stop last. */
export interface TripPassengersByStop {
  stops: Array<TripStop & { passengers: TripPassenger[] }>;
  unassigned: TripPassenger[];
}

/** Heads (seats) expected, boarded and marked no-show (GET .../headcount). */
export interface TripHeadcount {
  expected: number;
  boarded: number;
  noShow: number;
  pending: number;
  /** Passengers with the documents-checked mark. */
  documentsChecked: number;
  byStop: Array<{ stopId: string | null; name: string | null; sortOrder: number; expected: number; boarded: number; noShow: number; pending: number }>;
}

/** The body of PUT .../passengers/:pid. `opId` makes a retry safe; `at` is the clock time of the tick. */
export interface TripTickRequest {
  boarding?: BoardingStatus;
  documentsChecked?: boolean;
  opId: string;
  at?: string;
}

/** The answer to a tick. Nothing changed when `applied` is false: a repeated opId (`duplicate`) or an older tick (`stale`). */
export interface TripTickResult {
  passenger: TripPassenger;
  applied: boolean;
  duplicate: boolean;
  stale: boolean;
}
