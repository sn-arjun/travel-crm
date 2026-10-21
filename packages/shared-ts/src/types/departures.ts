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
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  source: SeatBookingSource;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
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
  seatNumber: string | null;
  mealPreference: string | null;
  documentsStatus: 'unknown' | 'provided' | 'checked' | 'problem';
  extraFields: Record<string, unknown> | null;
  status: 'active' | 'cancelled';
}
