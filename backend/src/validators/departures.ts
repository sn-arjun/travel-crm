import { z } from 'zod';

// Request schemas of /tours and /departures (R139). Dates are tenant-local 'YYYY-MM-DD', times 'HH:MM'.

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date as YYYY-MM-DD');
const timeStr = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Use a time as HH:MM');
const nullableInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable();
const idStr = z.string().min(1).max(64);

export const confirmModeSchema = z.enum(['manual', 'auto_when_available', 'on_deposit']);
export const depositTypeSchema = z.enum(['none', 'percent', 'per_seat', 'fixed']);
export const showSeatsLeftSchema = z.enum(['always', 'below_threshold', 'never']);
export const stopKindSchema = z.enum(['pickup', 'dropoff', 'both', 'waypoint']);
export const priceKindSchema = z.enum(['age_band', 'room_supplement', 'seat_surcharge', 'other']);
export const departureStatusSchema = z.enum(['draft', 'open', 'closed', 'departed', 'completed', 'cancelled']);

// ---- agency settings (group_tours)

export const passengerFieldSchema = z.object({
  key: z.string().min(1).max(40).regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Use letters, digits and underscores'),
  label: z.string().min(1).max(80),
  required: z.boolean().default(false),
  collectOn: z.enum(['booking', 'self_service', 'staff_only']).default('booking'),
  // Custom fields only (the built-in keys keep their own type).
  type: z.enum(['text', 'date', 'select', 'boolean']).optional(),
  options: z.array(z.string().min(1).max(80)).max(30).optional(),
  custom: z.boolean().optional(),
});

export const roomTypeSchema = z.object({
  key: z.string().min(1).max(40).regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Use letters, digits and underscores'),
  label: z.string().min(1).max(80),
  occupancy: z.number().int().min(1).max(12),
});

const depositSchema = z.object({
  type: depositTypeSchema.optional(),
  value: z.number().min(0).max(1_000_000).nullable().optional(),
});

export const groupToursSettingsSchema = z.object({
  enabled: z.boolean(),
  holdExpiryHours: z.number().int().min(1).max(24 * 60),
  confirmMode: confirmModeSchema,
  markLeadWonOnConfirm: z.boolean(),
  waitlist: z.object({
    enabled: z.boolean(),
    offerMode: z.enum(['suggest', 'auto_hold']),
    offerHoldHours: z.number().int().min(1).max(24 * 30),
  }).partial(),
  defaultVehicleCapacity: z.number().int().min(1).max(200),
  bookingCutoffDays: z.number().int().min(0).max(365),
  extrasCutoffDays: z.number().int().min(0).max(365),
  passengerFields: z.array(passengerFieldSchema).max(60),
  roomTypes: z.array(roomTypeSchema).max(30),
  shareMatching: z.boolean(),
  preferredSeat: z.object({ enabled: z.boolean() }).partial(),
  showSeatsLeft: showSeatsLeftSchema,
  seatsLeftThreshold: z.number().int().min(1).max(500),
  deposit: depositSchema,
  publicBooking: z.object({
    requireTerms: z.boolean(),
    termsText: z.string().max(20000),
    marketingOptIn: z.boolean(),
  }).partial(),
  driverSeesPassengers: z.boolean(),
}).partial();

// ---- tours

const tourBase = {
  code: z.string().trim().min(1).max(24).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Use letters, digits, dash and underscore'),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20000).nullable().optional(),
  destination: z.string().max(200).nullable().optional(),
  itineraryTemplateId: idStr.nullable().optional(),
  durationDays: z.number().int().min(1).max(365).nullable().optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/).nullable().optional(),
  defaultCapacity: z.number().int().min(0).max(1000).nullable().optional(),
  bookingCutoffDays: nullableInt(0, 365).optional(),
  extrasCutoffDays: nullableInt(0, 365).optional(),
  holdExpiryHours: nullableInt(1, 24 * 60).optional(),
  confirmMode: confirmModeSchema.nullable().optional(),
  depositType: depositTypeSchema.nullable().optional(),
  depositValue: z.number().min(0).max(1_000_000).nullable().optional(),
  passengerFields: z.array(passengerFieldSchema).max(60).nullable().optional(),
  roomTypes: z.array(roomTypeSchema).max(30).nullable().optional(),
  terms: z.string().max(20000).nullable().optional(),
  status: z.enum(['active', 'archived']).optional(),
};

export const createTourSchema = z.object(tourBase);
export const updateTourSchema = z.object(tourBase).partial();

export const tourListSchema = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(['active', 'archived', 'all']).optional(),
  destination: z.string().max(200).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const stopItem = z.object({
  id: idStr.optional(),
  name: z.string().trim().min(1).max(200),
  address: z.string().max(500).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  localTime: timeStr.nullable().optional(),
  dayOffset: z.number().int().min(0).max(60).optional(),
  kind: stopKindSchema.optional(),
  documentsCheck: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export const stopsBodySchema = z.object({ stops: z.array(stopItem).max(100) });

const priceItem = z.object({
  id: idStr.optional(),
  kind: priceKindSchema,
  key: z.string().trim().min(1).max(60),
  label: z.string().max(120).nullable().optional(),
  amount: z.number().min(0).max(100_000_000),
  currency: z.string().regex(/^[A-Za-z]{3}$/).nullable().optional(),
});
export const pricesBodySchema = z.object({ prices: z.array(priceItem).max(200) });

const extraItem = z.object({
  id: idStr.optional(),
  departureId: idStr.nullable().optional(),
  dayNumber: z.number().int().min(1).max(365).nullable().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  price: z.number().min(0).max(100_000_000),
  currency: z.string().regex(/^[A-Za-z]{3}$/).nullable().optional(),
  bandPrices: z.record(z.string(), z.number().min(0)).nullable().optional(),
  rateCardId: idStr.nullable().optional(),
  supplierId: idStr.nullable().optional(),
  capacity: z.number().int().min(0).max(100000).nullable().optional(),
  cutoffHoursBefore: z.number().int().min(0).max(24 * 365).nullable().optional(),
  refundableUntilHours: z.number().int().min(0).max(24 * 365).nullable().optional(),
  isActive: z.boolean().optional(),
});
export const extrasBodySchema = z.object({ extras: z.array(extraItem).max(200) });

// ---- departures

const vehicleItem = z.object({
  id: idStr.optional(),
  vehicleId: idStr.nullable().optional(),
  label: z.string().max(120).nullable().optional(),
  capacity: z.number().int().min(1).max(200).optional(),
  driverId: idStr.nullable().optional(),
  seatLayout: z.record(z.string(), z.unknown()).nullable().optional(),
});
export const vehiclesBodySchema = z.object({ vehicles: z.array(vehicleItem).max(20) });

const departureBase = {
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'Use letters, digits, dot, dash and underscore').optional(),
  startTime: timeStr.nullable().optional(),
  capacityMode: z.enum(['vehicles', 'manual']).optional(),
  capacity: z.number().int().min(0).max(5000).optional(),
  bookingCutoffDate: dateStr.nullable().optional(),
  extrasCutoffDate: dateStr.nullable().optional(),
  holdExpiryHours: nullableInt(1, 24 * 60).optional(),
  confirmMode: confirmModeSchema.nullable().optional(),
  showSeatsLeft: showSeatsLeftSchema.nullable().optional(),
  publicBookingEnabled: z.boolean().optional(),
  tourLeaderDriverId: idStr.nullable().optional(),
  tourLeaderUserId: idStr.nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
};

export const createDepartureSchema = z.object({
  tourId: idStr,
  startDate: dateStr,
  endDate: dateStr.optional(),
  vehicles: z.array(vehicleItem).max(20).optional(),
  ...departureBase,
});

export const bulkDepartureSchema = z.object({
  tourId: idStr,
  dates: z.array(dateStr).min(1).max(60),
  vehicles: z.array(vehicleItem).max(20).optional(),
  ...departureBase,
  // A code is per departure; bulk always derives it from the tour code and the date.
  code: z.undefined().optional(),
});

export const updateDepartureSchema = z.object({
  startDate: dateStr.optional(),
  endDate: dateStr.optional(),
  ...departureBase,
});

export const departureStatusBodySchema = z.object({
  status: departureStatusSchema,
  reason: z.string().trim().max(1000).optional(),
});

export const departureListSchema = z.object({
  tour: z.string().max(64).optional(),
  status: departureStatusSchema.optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  hasSeats: z.enum(['true', 'false', '1', '0']).optional(),
  q: z.string().max(100).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const costItem = z.object({
  id: idStr.optional(),
  supplierId: idStr.nullable().optional(),
  description: z.string().trim().min(1).max(300),
  kind: z.enum(['per_departure', 'per_seat']).optional(),
  amount: z.number().min(0).max(100_000_000),
  currency: z.string().regex(/^[A-Za-z]{3}$/).nullable().optional(),
});
export const costsBodySchema = z.object({ costs: z.array(costItem).max(100) });

export type CreateTourInput = z.infer<typeof createTourSchema>;
export type UpdateTourInput = z.infer<typeof updateTourSchema>;
export type StopInput = z.infer<typeof stopItem>;
export type PriceInput = z.infer<typeof priceItem>;
export type ExtraInput = z.infer<typeof extraItem>;
export type VehicleInput = z.infer<typeof vehicleItem>;
export type CostInput = z.infer<typeof costItem>;
export type CreateDepartureInput = z.infer<typeof createDepartureSchema>;
export type UpdateDepartureInput = z.infer<typeof updateDepartureSchema>;
export type GroupToursSettingsInput = z.infer<typeof groupToursSettingsSchema>;

// ---- manifest and rooms (R146)

export const manifestQuerySchema = z.object({
  view: z.enum(['pickup', 'rooming', 'full']).default('pickup'),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
  /** `confirmed` leaves out parties whose seats are only held. */
  bookings: z.enum(['all', 'confirmed']).default('all'),
});

export const roomAssignmentsSchema = z.object({
  assignments: z.array(z.object({ passengerId: z.string().min(1).max(64), roomGroup: z.string().trim().max(40).nullable() })).min(1).max(400),
});
