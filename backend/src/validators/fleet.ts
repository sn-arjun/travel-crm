import { z } from 'zod';

// ── Vehicle Schemas ─────────────────────────────────────────

export const createVehicleSchema = z.object({
  registrationNumber: z.string().min(1, 'Registration number is required'),
  type: z.enum(['sedan', 'suv', 'muv', 'tempo_traveller', 'mini_bus', 'bus', 'luxury_coach']),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().min(1990).max(2030).optional(),
  seatingCapacity: z.number().int().min(1).max(100).optional(),
  color: z.string().optional(),
  notes: z.string().optional(),
});

export const updateVehicleSchema = createVehicleSchema.partial();

export const vehicleStatusSchema = z.object({
  status: z.enum(['available', 'on_trip', 'under_maintenance', 'out_of_service']),
  reason: z.string().optional(),
});

export const vehicleListSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(20),
  status: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
  availableFrom: z.string().optional(),
  availableTo: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});

// ── Driver Schemas ──────────────────────────────────────────

export const createDriverSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email().optional().or(z.literal('')),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.string().optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  dateOfJoining: z.string().optional(),
  notes: z.string().optional(),
  // R145: a crew member is a driver, a tour leader, or both; userId links the staff user this person is
  crewRole: z.enum(['driver', 'tour_leader', 'both']).optional(),
  userId: z.string().min(1).nullable().optional(),
});

export const updateDriverSchema = createDriverSchema.partial();

export const driverStatusSchema = z.object({
  status: z.enum(['active', 'on_trip', 'off_duty', 'on_leave']),
  reason: z.string().optional(),
});

export const driverListSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(20),
  status: z.string().optional(),
  search: z.string().optional(),
  availableFrom: z.string().optional(),
  availableTo: z.string().optional(),
  crewRole: z.enum(['driver', 'tour_leader', 'both']).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});

export const rateDriverSchema = z.object({
  tripId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  comments: z.string().optional(),
});

// ── Vehicle Rate Card Schemas ──────────────────────────────

export const vehicleTypeEnum = z.enum(['sedan', 'suv', 'muv', 'tempo_traveller', 'mini_bus', 'bus', 'luxury_coach']);
export const tripTypeEnum = z.enum(['one_way', 'round_trip', 'airport_pickup', 'airport_drop', 'local_8h80km', 'local_12h120km', 'outstation']);

export const createRateCardSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  vehicleType: vehicleTypeEnum,
  tripType: tripTypeEnum,
  baseFare: z.number().min(0).default(0),
  perKmRate: z.number().min(0).default(0),
  perHourRate: z.number().min(0).default(0),
  minKm: z.number().min(0).default(0),
  minHours: z.number().min(0).default(0),
  nightCharge: z.number().min(0).default(0),
  driverAllowance: z.number().min(0).default(0),
  flatRate: z.number().min(0).nullable().optional(),
  extraKmRate: z.number().min(0).default(0),
  extraHourRate: z.number().min(0).default(0),
  tollIncluded: z.boolean().default(false),
  parkingIncluded: z.boolean().default(false),
  // Absent means the agency currency, filled in by the handler.
  currency: z.string().length(3).optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const updateRateCardSchema = createRateCardSchema.partial();

export const rateCardListSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(20),
  vehicleType: z.string().optional(),
  tripType: z.string().optional(),
  isActive: z.string().optional(), // '1' or '0'
  search: z.string().optional(),
});

export const rateCardLookupSchema = z.object({
  vehicleType: vehicleTypeEnum,
  tripType: tripTypeEnum,
});

export const costEstimateSchema = z.object({
  rateCardId: z.string().min(1),
  distanceKm: z.number().min(0),
  durationMinutes: z.number().min(0),
  numDays: z.number().int().min(0).optional(),
  numNights: z.number().int().min(0).optional(),
  isNightTrip: z.boolean().optional(),
});

export const calculateDistanceSchema = z.object({
  originLat: z.number().min(-90).max(90),
  originLng: z.number().min(-180).max(180),
  destLat: z.number().min(-90).max(90),
  destLng: z.number().min(-180).max(180),
});

// ── Trip Assignment Schemas ─────────────────────────────────

const tripFields = z.object({
  leadId: z.string().optional(),
  vehicleId: z.string().min(1, 'Vehicle is required').optional(),
  driverId: z.string().min(1, 'Driver is required').optional(),
  pickupLocation: z.string().optional(),
  dropLocation: z.string().optional(),
  pickupDatetime: z.string().min(1, 'Pickup datetime is required'),
  dropDatetime: z.string().min(1, 'Drop datetime is required'),
  passengerName: z.string().optional(),
  passengerPhone: z.string().optional(),
  specialInstructions: z.string().optional(),
  // M20: New fields
  tripType: tripTypeEnum.optional(),
  rateCardId: z.string().optional(),
  estimatedDistanceKm: z.number().min(0).optional(),
  estimatedDurationMin: z.number().min(0).optional(),
  estimatedCost: z.number().min(0).optional(),
  estimatedBreakdown: z.string().optional(), // JSON string
  pickupLat: z.number().optional(),
  pickupLng: z.number().optional(),
  dropLat: z.number().optional(),
  dropLng: z.number().optional(),
  contactId: z.string().optional(),
  autoCreateVoucher: z.boolean().optional(),
  // R145: coach trips
  tripKind: z.enum(['transfer', 'coach']).optional(),
  tourLeaderId: z.string().min(1).nullable().optional(),
  departureId: z.string().min(1).nullable().optional(),
});

/** A transfer needs its vehicle and driver; a coach trip may have neither yet (a hired coach, a tour leader without a vehicle). */
export const createTripSchema = tripFields.extend({
  stops: z.array(coachStopItem()).max(100).optional(),
}).superRefine((v, ctx) => {
  if ((v.tripKind ?? 'transfer') === 'coach') return;
  if (!v.vehicleId) ctx.addIssue({ code: 'custom', path: ['vehicleId'], message: 'Vehicle is required' });
  if (!v.driverId) ctx.addIssue({ code: 'custom', path: ['driverId'], message: 'Driver is required' });
});

export const updateTripSchema = tripFields.partial();

export const tripStatusSchema = z.object({
  status: z.enum(['accepted', 'en_route', 'started', 'completed', 'cancelled']),
  notes: z.string().optional(),
  reason: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export const tripListSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(20),
  status: z.string().optional(),
  driverId: z.string().optional(),
  vehicleId: z.string().optional(),
  tripKind: z.enum(['transfer', 'coach']).optional(),
  departureId: z.string().optional(),
  leadId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});

// ── Trip Cost Schema ────────────────────────────────────────

export const createTripCostSchema = z.object({
  costType: z.enum(['fuel', 'toll', 'driver_allowance', 'parking', 'other']),
  amount: z.number().min(0.01, 'Amount must be positive'),
  description: z.string().optional(),
});

// ── Maintenance Schema ──────────────────────────────────────

export const createMaintenanceSchema = z.object({
  serviceType: z.enum(['regular_service', 'oil_change', 'tyre_replacement', 'brake_service', 'ac_service', 'other']),
  description: z.string().optional(),
  serviceDate: z.string().min(1),
  odometerAtService: z.number().int().optional(),
  cost: z.number().min(0).optional(),
  vendorName: z.string().optional(),
  nextServiceDueDate: z.string().optional(),
  nextServiceDueKm: z.number().int().optional(),
  notes: z.string().optional(),
});

// ── Availability / Schedule ─────────────────────────────────

export const availabilitySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.string().optional(),
});

export const scheduleSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

// ── Coach trips (R145) ──────────────────────────────────────

function coachStopItem() {
  return z.object({
    id: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(200),
    address: z.string().max(500).nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    // A UTC instant, or a local time 'YYYY-MM-DDTHH:MM' that is read in the agency's time zone
    scheduledAt: z.string().min(1).max(40).nullable().optional(),
    documentsCheck: z.boolean().optional(),
  });
}

export const tripStopsBodySchema = z.object({ stops: z.array(coachStopItem()).max(100) });

export const stopWhereSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const addTripPassengerSchema = z.object({
  tripStopId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(200),
  phone: z.string().max(40).nullable().optional(),
  seats: z.number().int().min(1).max(60).optional(),
  contactId: z.string().min(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/** One tick from the desktop or the app. `opId` makes a retry safe; `at` is the clock time of the tick (offline ticks arrive late). */
export const tickPassengerSchema = z
  .object({
    boarding: z.enum(['pending', 'boarded', 'no_show']).optional(),
    documentsChecked: z.boolean().optional(),
    opId: z.string().trim().min(1).max(100),
    at: z.string().datetime({ offset: true }).optional(),
  })
  .refine((v) => v.boarding !== undefined || v.documentsChecked !== undefined, { message: 'Give boarding or documentsChecked' });
