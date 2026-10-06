import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface Vehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  capacity: number;
  seatingCapacity?: number;
  type?: string;
  color?: string;
  status: 'available' | 'on_trip' | 'under_maintenance' | 'out_of_service' | 'active' | 'maintenance' | 'inactive';
  mileage: number;
  odometerKm?: number | null;
  notes?: string | null;
  lastServiceDate?: string | null;
  nextServiceDue?: string | null;
  purchaseDate?: string;
  photoUrl?: string;
  insuranceExpiry?: string;
  permitExpiry?: string;
  pollutionExpiry?: string;
  rcExpiry?: string;
  nextServiceKm?: number;
  nextServiceDate?: string;
  customFields?: Record<string, unknown>;
}

export interface VehicleDocument {
  id: string;
  vehicleId: string;
  type: 'rc' | 'insurance' | 'permit' | 'pollution';
  documentUrl?: string;
  documentNumber?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  issuedDate?: string | null;
  expiryDate?: string | null;
  isExpired?: boolean;
  daysUntilExpiry?: number | null;
  notes?: string;
  createdAt: string;
}

export interface RecordMaintenanceRequest {
  serviceType: 'regular_service' | 'oil_change' | 'tyre_replacement' | 'brake_service' | 'ac_service' | 'other';
  serviceDate: string;
  description?: string;
  odometerAtService?: number;
  cost?: number;
  vendorName?: string;
  nextServiceDueDate?: string;
  nextServiceDueKm?: number;
  notes?: string;
}

export interface VehicleMaintenance {
  id: string;
  vehicleId: string;
  serviceType: string;
  description?: string;
  serviceDate: string;
  odometer?: number;
  cost?: number;
  vendor?: string;
  notes?: string;
  nextServiceDate?: string;
  nextServiceKm?: number;
  createdAt: string;
}

export interface VehicleAvailability {
  date: string;
  status: 'available' | 'on_trip' | 'maintenance';
  tripId?: string;
}

/** One row of GET /fleet/vehicles/availability: a vehicle and the trips booked in range. */
export interface VehicleAvailabilityRow {
  vehicleId: string;
  registrationNumber: string;
  type?: string;
  status: string;
  seatingCapacity?: number;
  trips: {
    tripId: string;
    pickupDatetime: string;
    dropDatetime: string;
    passengerName?: string | null;
    status: string;
  }[];
}

/** One row of GET /fleet/drivers/schedule: a driver and the trips booked in range. */
export interface DriverScheduleRow {
  driverId: string;
  name: string;
  phone?: string;
  status: string;
  rating?: number;
  trips: {
    tripId: string;
    pickupDatetime: string;
    dropDatetime: string;
    pickupLocation?: string | null;
    passengerName?: string | null;
    status: string;
  }[];
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  licenseType?: string;
  badgeNumber?: string;
  status: 'active' | 'on_trip' | 'off_duty' | 'on_leave';
  experience?: number;
  rating?: number;
  totalTrips?: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIFSC?: string;
  dateOfJoining?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
}

export interface DriverDocument {
  id: string;
  driverId: string;
  type: 'license' | 'id_proof' | 'police_verification';
  documentUrl?: string;
  expiryDate?: string;
  isExpired?: boolean;
  daysUntilExpiry?: number;
  notes?: string;
  createdAt: string;
}

export interface Trip {
  id: string;
  vehicleId: string;
  driverId: string;
  leadId?: string;
  passengerName?: string;
  passengerPhone?: string;
  specialInstructions?: string;
  startLocation: string;
  endLocation: string;
  startTime: string;
  endTime: string;
  distance: number;
  fare: number;
  status: 'assigned' | 'accepted' | 'en_route' | 'started' | 'completed' | 'cancelled';
  driverName?: string;
  vehicleRegistration?: string;
  vehicle?: {
    make?: string;
    model?: string;
    registrationNumber?: string;
    type?: string;
    seatingCapacity?: number;
    photoUrl?: string;
  };
  driver?: {
    name?: string;
    phone?: string;
    rating?: number;
    photoUrl?: string;
  };
  tripType?: string;
  rateCardId?: string | null;
  contactId?: string | null;
  invoiceId?: string | null;
  voucherId?: string | null;
  estimatedCost?: number;
  actualCost?: number;
  estimatedDistanceKm?: number;
  customFields?: Record<string, unknown>;
}

export interface TripTimeline {
  status: string;
  timestamp: string;
  userName: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
}

export interface TripCost {
  id: string;
  tripId: string;
  costType: 'fuel' | 'toll' | 'parking' | 'driver_allowance' | 'other';
  amount: number;
  receiptUrl?: string;
  notes?: string;
  createdAt: string;
}

export interface FleetRateCard {
  id: string;
  name: string;
  vehicleType: string;
  tripType?: string;
  baseFare: number;
  perKmRate: number;
  perHourRate?: number;
  minKm?: number;
  minHours?: number;
  extraKmRate?: number;
  extraHourRate?: number;
  nightCharge?: number;
  driverAllowance?: number;
  tollIncluded?: boolean;
  parkingIncluded?: boolean;
  isActive?: boolean;
  validFrom?: string;
  validTo?: string;
  customFields?: Record<string, unknown>;
}

export interface FleetDashboardVehicleSummary {
  total: number;
  available: number;
  on_trip: number;
  under_maintenance: number;
  out_of_service: number;
}

export interface FleetDashboardDriverSummary {
  total: number;
  active: number;
  on_trip: number;
  off_duty: number;
  on_leave: number;
}

export interface FleetDashboardRevenue {
  thisMonth: number;
  thisMonthTrips: number;
  thisMonthCosts: number;
  lastMonth: number;
  lastMonthTrips: number;
  byVehicleType: { vehicleType: string; trips: number; revenue: number }[];
  byDriver: { id: string; name: string; trips: number; revenue: number }[];
}

export interface FleetDashboard {
  totalVehicles: number;
  availableVehicles: number;
  vehiclesOnTrip: number;
  totalDrivers: number;
  activeDrivers: number;
  driversOnTrip: number;
  activeTrips: number;
  activeTripsList: Trip[];
  upcomingTrips: Trip[];
  recentCompletedTrips: (Trip & { totalCost: number })[];
  topDrivers: Pick<Driver, 'id' | 'name' | 'phone' | 'rating' | 'totalTrips'>[];
  expiringDocumentsCount: number;
  maintenanceDueCount: number;
  revenueMtd: number;
  vehicleSummary: FleetDashboardVehicleSummary;
  driverSummary: FleetDashboardDriverSummary;
  revenue: FleetDashboardRevenue;
}

export interface FleetDocumentAlert {
  id: string;
  vehicleId?: string;
  driverId?: string;
  ownerType: 'vehicle' | 'driver';
  entityName: string;
  type: string;
  expiryDate: string;
  isExpired: boolean;
  daysUntilExpiry: number | null;
}

export interface CreateVehicleRequest {
  registrationNumber: string;
  type: 'sedan' | 'suv' | 'muv' | 'tempo_traveller' | 'mini_bus' | 'bus' | 'luxury_coach';
  make?: string;
  model?: string;
  year?: number;
  seatingCapacity?: number;
  color?: string;
  notes?: string;
}

export interface UpdateVehicleRequest {
  registrationNumber?: string;
  type?: CreateVehicleRequest['type'];
  make?: string;
  model?: string;
  year?: number;
  seatingCapacity?: number;
  color?: string;
  notes?: string;
}

export interface CreateDriverRequest {
  name: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  licenseType?: string;
  badgeNumber?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  dateOfJoining?: string;
  notes?: string;
}

export interface UpdateDriverRequest {
  name?: string;
  phone?: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  licenseType?: string;
  badgeNumber?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankIFSC?: string;
  notes?: string;
  status?: 'active' | 'inactive' | 'on_leave';
  experience?: number;
  customFields?: Record<string, unknown>;
}

export interface CreateTripRequest {
  vehicleId: string;
  driverId: string;
  leadId?: string;
  passengerName?: string;
  passengerPhone?: string;
  specialInstructions?: string;
  startLocation: string;
  endLocation: string;
  startTime: string;
  endTime: string;
  distance?: number;
  fare?: number;
  tripType?: string;
  contactId?: string;
  rateCardId?: string;
  status?: 'assigned' | 'accepted' | 'en_route' | 'started' | 'completed' | 'cancelled';
  customFields?: Record<string, unknown>;
}

export interface UpdateTripRequest {
  vehicleId?: string;
  driverId?: string;
  leadId?: string;
  passengerName?: string;
  passengerPhone?: string;
  specialInstructions?: string;
  startLocation?: string;
  endLocation?: string;
  startTime?: string;
  endTime?: string;
  distance?: number;
  fare?: number;
  tripType?: string;
  status?: string;
  customFields?: Record<string, unknown>;
}

export interface CreateFleetRateCardRequest {
  name: string;
  vehicleType: string;
  tripType: string;
  baseFare: number;
  perKmRate: number;
  perHourRate?: number;
  minKm?: number;
  minHours?: number;
  extraKmRate?: number;
  extraHourRate?: number;
  nightCharge?: number;
  driverAllowance?: number;
  tollIncluded?: boolean;
  parkingIncluded?: boolean;
  isActive?: boolean;
  validFrom?: string;
  validTo?: string;
  customFields?: Record<string, unknown>;
}

export interface UpdateFleetRateCardRequest {
  name?: string;
  vehicleType?: string;
  tripType?: string;
  baseFare?: number;
  perKmRate?: number;
  perHourRate?: number;
  minKm?: number;
  minHours?: number;
  extraKmRate?: number;
  extraHourRate?: number;
  nightCharge?: number;
  driverAllowance?: number;
  tollIncluded?: boolean;
  parkingIncluded?: boolean;
  isActive?: boolean;
  validFrom?: string;
  validTo?: string;
  customFields?: Record<string, unknown>;
}

export interface RateCardEstimateRequest {
  rateCardId: string;
  distanceKm: number;
  durationMinutes: number;
  numDays?: number;
  numNights?: number;
  isNightTrip?: boolean;
}

export interface RateCardEstimateResult {
  rateCard: FleetRateCard;
  breakdown: Record<string, unknown> & { total?: number };
}

export interface CreateTripCostRequest {
  costType: 'fuel' | 'toll' | 'parking' | 'driver_allowance' | 'other';
  amount: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Response mapping. The backend returns a mix of camelCase and snake_case
// rows; these helpers normalise them into the interfaces above.
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

function asRaw(v: unknown): Raw {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Raw) : {};
}

function str(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === 'string' && v !== '') return v;
  return undefined;
}

function num(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

/** Applies `fn` to a list payload that is either a bare array or `{ data: [] }`. */
function mapList<T>(payload: unknown, fn: (row: Raw) => T): { rows: T[]; wrapper: Raw | null } | null {
  if (Array.isArray(payload)) return { rows: payload.map((r) => fn(asRaw(r))), wrapper: null };
  const w = asRaw(payload);
  if (Array.isArray(w.data)) return { rows: w.data.map((r) => fn(asRaw(r))), wrapper: w };
  return null;
}

function mapListResponse<R, T>(res: R, fn: (row: Raw) => T): R {
  const body = asRaw(res);
  const mapped = mapList(body.data, fn);
  if (!mapped) return res;
  const data = mapped.wrapper ? { ...mapped.wrapper, data: mapped.rows } : mapped.rows;
  return { ...body, data } as R;
}

function mapOneResponse<R, T>(res: R, fn: (row: Raw) => T): R {
  const body = asRaw(res);
  const d = body.data;
  if (d && typeof d === 'object' && !Array.isArray(d)) return { ...body, data: fn(d as Raw) } as R;
  return res;
}

// Compute experience from dateOfJoining
function computeExperience(driver: Raw): number {
  const doj = str(driver.dateOfJoining, driver.date_of_joining);
  if (!doj) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(doj).getTime()) / (365.25 * 86400000)));
}

function mapDriverFields(d: Raw): Driver {
  return { ...d, experience: num(d.experience) ?? computeExperience(d) } as unknown as Driver;
}

const mapDriversResponse = <R>(res: R): R => mapListResponse(res, mapDriverFields);
const mapDriverResponse = <R>(res: R): R => mapOneResponse(res, mapDriverFields);

// Map backend trip fields to frontend Trip interface
function mapTripFields(t: Raw): Trip {
  const veh = asRaw(t.vehicle);
  const drv = asRaw(t.driver);
  const hasVehicle = t.vehicle || t.vehicleMake || t.vehicleModel || t.vehicleRegistration || t.registrationNumber;
  const driverName = str(t.driverName, t.driver_name, drv.name);
  const fare = num(t.fare, t.estimatedCost, t.estimated_cost) ?? 0;
  const distance = num(t.distance, t.estimatedDistanceKm, t.estimated_distance_km) ?? 0;
  return {
    ...t,
    startLocation: str(t.startLocation, t.pickupLocation, t.pickup_location) ?? '',
    endLocation: str(t.endLocation, t.dropLocation, t.drop_location) ?? '',
    startTime: str(t.startTime, t.pickupDatetime, t.pickup_datetime) ?? '',
    endTime: str(t.endTime, t.dropDatetime, t.drop_datetime) ?? '',
    distance,
    fare,
    vehicleId: str(t.vehicleId, t.vehicle_id),
    driverId: str(t.driverId, t.driver_id),
    driverName: driverName ?? null,
    vehicleRegistration: str(t.vehicleRegistration, t.registration_number, veh.registrationNumber) ?? null,
    vehicle: t.vehicle
      ? (t.vehicle as Trip['vehicle'])
      : hasVehicle
        ? {
            make: str(t.vehicleMake, t.vehicle_make),
            model: str(t.vehicleModel, t.vehicle_model),
            registrationNumber: str(t.vehicleRegistration, t.registrationNumber, t.registration_number),
            type: str(t.vehicleType, t.vehicle_type),
            seatingCapacity: num(t.seatingCapacity, t.seating_capacity),
            photoUrl: str(t.vehiclePhoto, t.vehicle_photo),
          }
        : undefined,
    driver: t.driver
      ? (t.driver as Trip['driver'])
      : driverName
        ? {
            name: driverName,
            phone: str(t.driverPhone, t.driver_phone),
            photoUrl: str(t.driverPhoto, t.driver_photo),
            rating: num(t.driverRating, t.driver_rating),
          }
        : undefined,
    passengerName: str(t.passengerName, t.passenger_name),
    passengerPhone: str(t.passengerPhone, t.passenger_phone),
    specialInstructions: str(t.specialInstructions, t.special_instructions),
    leadId: str(t.leadId, t.lead_id),
    contactId: str(t.contactId, t.contact_id),
    invoiceId: str(t.invoiceId, t.invoice_id),
    voucherId: str(t.voucherId, t.voucher_id),
    estimatedCost: fare,
    estimatedDistanceKm: distance,
  } as unknown as Trip;
}

// Backend sends raw snake_case rows for trip costs and timeline entries.
function mapTripCost(c: Raw): TripCost {
  return {
    id: str(c.id) ?? '',
    tripId: str(c.tripId, c.trip_id) ?? '',
    costType: (str(c.costType, c.cost_type) ?? 'other') as TripCost['costType'],
    amount: num(c.amount) ?? 0,
    receiptUrl: str(c.receiptUrl, c.receipt_url),
    notes: str(c.notes, c.description),
    createdAt: str(c.createdAt, c.created_at) ?? '',
  };
}

function mapTripTimelineEntry(t: Raw): TripTimeline {
  return {
    status: str(t.status) ?? '',
    timestamp: str(t.timestamp, t.createdAt, t.created_at) ?? '',
    userName: str(t.userName) ?? '',
    notes: str(t.notes),
    latitude: num(t.latitude),
    longitude: num(t.longitude),
  };
}

function mapMaintenanceRow(row: Raw): VehicleMaintenance {
  return {
    id: str(row.id) ?? '',
    vehicleId: str(row.vehicle_id, row.vehicleId) ?? '',
    serviceType: str(row.service_type, row.serviceType) ?? '',
    description: str(row.description),
    serviceDate: str(row.service_date, row.serviceDate) ?? '',
    odometer: num(row.odometer_at_service, row.odometer),
    cost: num(row.cost),
    vendor: str(row.vendor_name, row.vendor),
    notes: str(row.notes),
    nextServiceDate: str(row.next_service_due_date, row.nextServiceDate),
    nextServiceKm: num(row.next_service_due_km, row.nextServiceKm),
    createdAt: str(row.created_at, row.createdAt) ?? '',
  };
}

const mapMaintenanceResponse = <R,>(res: R): R => {
  const body = asRaw(res);
  if (Array.isArray(body.data)) return mapListResponse(res, mapMaintenanceRow);
  return mapOneResponse(res, mapMaintenanceRow);
};

function mapTripRows(v: unknown): Trip[] {
  return Array.isArray(v) ? v.map((r) => mapTripFields(asRaw(r))) : [];
}

const mapTripsResponse = <R,>(res: R): R => mapListResponse(res, mapTripFields);
const mapTripResponse = <R,>(res: R): R => mapOneResponse(res, mapTripFields);

// Fleet API endpoints (not in config.ts yet, use inline strings for new endpoints)
const FLEET = {
  dashboard: '/fleet/dashboard',
  vehicleStatus: (id: string) => `/fleet/vehicles/${id}/status`,
  vehiclePhoto: (id: string) => `/fleet/vehicles/${id}/photo`,
  vehicleDocs: (id: string) => `/fleet/vehicles/${id}/documents`,
  vehicleDocById: (vehicleId: string, docId: string) => `/fleet/vehicles/${vehicleId}/documents/${docId}`,
  vehicleDocDownload: (vehicleId: string, docId: string) => `/fleet/vehicles/${vehicleId}/documents/${docId}/download`,
  vehicleMaintenance: (id: string) => `/fleet/vehicles/${id}/maintenance`,
  vehicleOdometer: (id: string) => `/fleet/vehicles/${id}/odometer`,
  vehicleAvailability: (id: string) => `/fleet/vehicles/${id}/availability`,
  vehiclesAvailability: '/fleet/vehicles/availability',
  vehicleTrips: (id: string) => `/fleet/vehicles/${id}/trips`,
  expiringDocs: '/fleet/documents/expiring',
  maintenanceDue: '/fleet/maintenance/due',
  driverStatus: (id: string) => `/fleet/drivers/${id}/status`,
  driverDocs: (id: string) => `/fleet/drivers/${id}/documents`,
  driverDocById: (driverId: string, docId: string) => `/fleet/drivers/${driverId}/documents/${docId}`,
  driverDocDownload: (driverId: string, docId: string) => `/fleet/drivers/${driverId}/documents/${docId}/download`,
  driverSchedule: '/fleet/drivers/schedule',
  driverSingleSchedule: (id: string) => `/fleet/drivers/${id}/schedule`,
  driverTrips: (id: string) => `/fleet/drivers/${id}/trips`,
  driverRate: (id: string) => `/fleet/drivers/${id}/rate`,
  expiringDriverDocs: '/fleet/documents/drivers/expiring',
  tripTimeline: (id: string) => `/fleet/trips/${id}/timeline`,
  tripStatus: (id: string) => `/fleet/trips/${id}/status`,
  tripCosts: (id: string) => `/fleet/trips/${id}/costs`,
  tripCostById: (tripId: string, costId: string) => `/fleet/trips/${tripId}/costs/${costId}`,
  tripCostSummary: (id: string) => `/fleet/trips/${id}/costs/summary`,
  tripGenerateInvoice: (id: string) => `/fleet/trips/${id}/generate-invoice`,
  tripGenerateVoucher: (id: string) => `/fleet/trips/${id}/generate-voucher`,
  calculateDistance: '/fleet/calculate-distance',
};

function mapDashboardResponse(res: ApiResponse<unknown>): ApiResponse<FleetDashboard> {
  const raw = asRaw(res?.data);
  const vs = asRaw(raw.vehicleSummary);
  const ds = asRaw(raw.driverSummary);
  const rv = asRaw(raw.revenue);
  const vehicleSummary: FleetDashboardVehicleSummary = {
    total: num(vs.total, raw.totalVehicles) ?? 0,
    available: num(vs.available, raw.availableVehicles) ?? 0,
    on_trip: num(vs.on_trip, raw.vehiclesOnTrip) ?? 0,
    under_maintenance: num(vs.under_maintenance) ?? 0,
    out_of_service: num(vs.out_of_service) ?? 0,
  };
  const driverSummary: FleetDashboardDriverSummary = {
    total: num(ds.total, raw.totalDrivers) ?? 0,
    active: num(ds.active, raw.activeDrivers) ?? 0,
    on_trip: num(ds.on_trip, raw.driversOnTrip) ?? 0,
    off_duty: num(ds.off_duty) ?? 0,
    on_leave: num(ds.on_leave) ?? 0,
  };
  const rows = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(asRaw) : []);
  const activeTripsList = rows(raw.activeTrips).map(mapTripFields);
  const revenue: FleetDashboardRevenue = {
    thisMonth: num(rv.thisMonth) ?? 0,
    thisMonthTrips: num(rv.thisMonthTrips) ?? 0,
    thisMonthCosts: num(rv.thisMonthCosts) ?? 0,
    lastMonth: num(rv.lastMonth) ?? 0,
    lastMonthTrips: num(rv.lastMonthTrips) ?? 0,
    byVehicleType: Array.isArray(rv.byVehicleType) ? (rv.byVehicleType as FleetDashboardRevenue['byVehicleType']) : [],
    byDriver: Array.isArray(rv.byDriver) ? (rv.byDriver as FleetDashboardRevenue['byDriver']) : [],
  };

  return {
    ...res,
    data: {
      totalVehicles: vehicleSummary.total,
      availableVehicles: vehicleSummary.available,
      vehiclesOnTrip: vehicleSummary.on_trip,
      totalDrivers: driverSummary.total,
      activeDrivers: driverSummary.active,
      driversOnTrip: driverSummary.on_trip,
      activeTrips: activeTripsList.length,
      activeTripsList,
      upcomingTrips: rows(raw.upcomingTrips).map(mapTripFields),
      recentCompletedTrips: rows(raw.recentCompleted).map((t) => ({ ...mapTripFields(t), totalCost: num(t.totalCost) ?? 0 })),
      topDrivers: (Array.isArray(raw.topDrivers) ? raw.topDrivers : []) as FleetDashboard['topDrivers'],
      expiringDocumentsCount: num(raw.expiringDocuments) ?? 0,
      maintenanceDueCount: num(raw.maintenanceDue) ?? 0,
      revenueMtd: revenue.thisMonth,
      vehicleSummary,
      driverSummary,
      revenue,
    },
  };
}

function mapDocumentAlert(r: Raw): FleetDocumentAlert {
  const ownerType: 'vehicle' | 'driver' = r.owner_type === 'driver' ? 'driver' : 'vehicle';
  return {
    id: str(r.id) ?? '',
    vehicleId: ownerType === 'vehicle' ? str(r.vehicle_id) : undefined,
    driverId: ownerType === 'driver' ? str(r.driver_id) : undefined,
    ownerType,
    entityName: str(r.registration_number) || 'Unknown',
    type: str(r.type) ?? '',
    expiryDate: str(r.expiry_date) ?? '',
    isExpired: !!r.isExpired,
    daysUntilExpiry: num(r.daysUntilExpiry) ?? null,
  };
}

export const fleetApi = {
  dashboard: () =>
    client.get<ApiResponse<FleetDashboard>>(FLEET.dashboard).then(mapDashboardResponse),

  // Unified vehicle + driver document expiry alerts (single call, avoids two round trips).
  getExpiringDocuments: (days = 30) =>
    client.get<ApiResponse<unknown[]>>(FLEET.expiringDocs, { params: { days } }).then((res) => ({
      ...res,
      data: (res.data || []).map((r) => mapDocumentAlert(asRaw(r))),
    })),

  getMaintenanceDue: (days = 15) =>
    client.get<ApiResponse<(Vehicle & { daysTillService?: number })[]>>(FLEET.maintenanceDue, { params: { days } }),

  vehicles: {
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      type?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<Vehicle>>>(API_ENDPOINTS.fleet.vehicles.list, { params }),

    getById: (id: string) =>
      client.get<ApiResponse<Vehicle>>(API_ENDPOINTS.fleet.vehicles.byId(id)),

    create: (data: CreateVehicleRequest) =>
      client.post<ApiResponse<Vehicle>>(API_ENDPOINTS.fleet.vehicles.create, data),

    update: (id: string, data: UpdateVehicleRequest) =>
      client.put<ApiResponse<Vehicle>>(API_ENDPOINTS.fleet.vehicles.byId(id), data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(API_ENDPOINTS.fleet.vehicles.byId(id)),

    updateStatus: (id: string, status: string) =>
      client.put<ApiResponse<Vehicle>>(FLEET.vehicleStatus(id), { status }),

    uploadPhoto: (id: string, file: File) => {
      const fd = new FormData();
      fd.append('photo', file);
      return client.post<ApiResponse<{ photoUrl: string }>>(FLEET.vehiclePhoto(id), fd);
    },

    getPhotoUrl: (id: string) =>
      client.get<ApiResponse<{ url: string }>>(FLEET.vehiclePhoto(id)),

    listDocuments: (id: string) =>
      client.get<ApiResponse<VehicleDocument[]>>(FLEET.vehicleDocs(id)),

    uploadDocument: (id: string, formData: FormData) =>
      client.post<ApiResponse<VehicleDocument>>(FLEET.vehicleDocs(id), formData),

    downloadDocument: (vehicleId: string, docId: string) =>
      client.get<ApiResponse<{ downloadUrl: string; fileName?: string }>>(FLEET.vehicleDocDownload(vehicleId, docId)),

    deleteDocument: (vehicleId: string, docId: string) =>
      client.delete<ApiResponse<void>>(FLEET.vehicleDocById(vehicleId, docId)),

    getExpiringDocuments: (days = 30) =>
      client.get<ApiResponse<(VehicleDocument & { vehicleName?: string; registrationNumber?: string })[]>>(
        FLEET.expiringDocs, { params: { days } }
      ),

    recordMaintenance: (id: string, data: RecordMaintenanceRequest) =>
      client.post<ApiResponse<VehicleMaintenance>>(FLEET.vehicleMaintenance(id), data).then(mapMaintenanceResponse),

    getMaintenanceHistory: (id: string) =>
      client.get<ApiResponse<VehicleMaintenance[]>>(FLEET.vehicleMaintenance(id)).then(mapMaintenanceResponse),

    getMaintenanceDue: (days = 7) =>
      client.get<ApiResponse<(Vehicle & { daysTillService?: number })[]>>(FLEET.maintenanceDue, { params: { days } }),

    updateOdometer: (id: string, km: number) =>
      client.put<ApiResponse<{ odometerKm: number }>>(FLEET.vehicleOdometer(id), { km }),

    getAvailability: (params: { from: string; to: string; type?: string }) =>
      client.get<ApiResponse<VehicleAvailabilityRow[]>>(FLEET.vehiclesAvailability, { params }),

    getSingleAvailability: (id: string, params: { from: string; to: string }) =>
      client.get<ApiResponse<VehicleAvailability[]>>(FLEET.vehicleAvailability(id), { params }),

    getTrips: (id: string, params?: { page?: number; limit?: number }) =>
      client.get<ApiResponse<PaginatedResponse<Trip>>>(FLEET.vehicleTrips(id), { params }).then(mapTripsResponse),
  },

  drivers: {
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<Driver>>>(API_ENDPOINTS.fleet.drivers.list, { params }).then(mapDriversResponse),

    getById: (id: string) =>
      client.get<ApiResponse<Driver>>(API_ENDPOINTS.fleet.drivers.byId(id)).then(mapDriverResponse),

    create: (data: CreateDriverRequest) =>
      client.post<ApiResponse<Driver>>(API_ENDPOINTS.fleet.drivers.create, data),

    update: (id: string, data: UpdateDriverRequest) =>
      client.put<ApiResponse<Driver>>(API_ENDPOINTS.fleet.drivers.byId(id), data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(API_ENDPOINTS.fleet.drivers.byId(id)),

    updateStatus: (id: string, status: string) =>
      client.put<ApiResponse<Driver>>(FLEET.driverStatus(id), { status }),

    listDocuments: (id: string) =>
      client.get<ApiResponse<DriverDocument[]>>(FLEET.driverDocs(id)),

    uploadDocument: (id: string, formData: FormData) =>
      client.post<ApiResponse<DriverDocument>>(FLEET.driverDocs(id), formData),

    downloadDocument: (driverId: string, docId: string) =>
      client.get<ApiResponse<{ url: string }>>(FLEET.driverDocDownload(driverId, docId)),

    deleteDocument: (driverId: string, docId: string) =>
      client.delete<ApiResponse<void>>(FLEET.driverDocById(driverId, docId)),

    getExpiringDocuments: (days = 30) =>
      client.get<ApiResponse<(DriverDocument & { driverName?: string })[]>>(
        FLEET.expiringDriverDocs, { params: { days } }
      ),

    getSchedule: (params: { from: string; to: string }) =>
      client.get<ApiResponse<DriverScheduleRow[]>>(FLEET.driverSchedule, { params }),

    getSingleSchedule: (id: string, params: { from: string; to: string }) =>
      client.get<ApiResponse<unknown>>(FLEET.driverSingleSchedule(id), { params }).then((res) => ({
        ...res,
        // The endpoint answers { driver, trips }; callers only need the trips.
        data: mapTripRows(Array.isArray(res.data) ? res.data : asRaw(res.data).trips),
      })),

    getTrips: (id: string, params?: { page?: number; limit?: number }) =>
      client.get<ApiResponse<PaginatedResponse<Trip>>>(FLEET.driverTrips(id), { params }).then(mapTripsResponse),

    rate: (id: string, data: { rating: number; tripId?: string; comment?: string }) =>
      client.post<ApiResponse<Driver>>(FLEET.driverRate(id), data).then(mapDriverResponse),
  },

  trips: {
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      vehicleId?: string;
      driverId?: string;
      leadId?: string;
      status?: string;
      from?: string;
      to?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<Trip>>>(API_ENDPOINTS.fleet.trips.list, { params }).then(mapTripsResponse),

    getById: (id: string) =>
      client.get<ApiResponse<Trip>>(API_ENDPOINTS.fleet.trips.byId(id)).then(mapTripResponse),

    create: (data: CreateTripRequest) =>
      client.post<ApiResponse<Trip>>(API_ENDPOINTS.fleet.trips.create, {
        vehicleId: data.vehicleId,
        driverId: data.driverId,
        leadId: data.leadId,
        passengerName: data.passengerName,
        passengerPhone: data.passengerPhone,
        specialInstructions: data.specialInstructions,
        pickupLocation: data.startLocation,
        dropLocation: data.endLocation,
        pickupDatetime: data.startTime ? new Date(data.startTime).toISOString() : undefined,
        dropDatetime: data.endTime ? new Date(data.endTime).toISOString() : undefined,
        estimatedDistanceKm: data.distance || undefined,
        estimatedCost: data.fare || undefined,
        tripType: data.tripType || undefined,
        contactId: data.contactId || undefined,
        rateCardId: data.rateCardId || undefined,
      }),

    update: (id: string, data: UpdateTripRequest) => {
      const body: Record<string, unknown> = {
        vehicleId: data.vehicleId,
        driverId: data.driverId,
        leadId: data.leadId,
        passengerName: data.passengerName,
        passengerPhone: data.passengerPhone,
        specialInstructions: data.specialInstructions,
        pickupLocation: data.startLocation,
        dropLocation: data.endLocation,
        pickupDatetime: data.startTime ? new Date(data.startTime).toISOString() : undefined,
        dropDatetime: data.endTime ? new Date(data.endTime).toISOString() : undefined,
        estimatedDistanceKm: data.distance,
        estimatedCost: data.fare,
        tripType: data.tripType,
        status: data.status,
        customFields: data.customFields,
      };
      for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
      return client.put<ApiResponse<Trip>>(API_ENDPOINTS.fleet.trips.byId(id), body);
    },

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(API_ENDPOINTS.fleet.trips.byId(id)),

    updateStatus: (id: string, status: string, notes?: string) =>
      client.put<ApiResponse<Trip>>(FLEET.tripStatus(id), { status, notes }),

    getTimeline: (id: string) =>
      client.get<ApiResponse<TripTimeline[]>>(FLEET.tripTimeline(id)).then((res) => {
        const rows: unknown[] = Array.isArray(res?.data) ? res.data : [];
        return { ...res, data: rows.map((r) => mapTripTimelineEntry(asRaw(r))) } as ApiResponse<TripTimeline[]>;
      }),

    addCost: (tripId: string, data: CreateTripCostRequest) =>
      client.post<ApiResponse<TripCost>>(FLEET.tripCosts(tripId), {
        costType: data.costType,
        amount: data.amount,
        description: data.notes,
      }),

    listCosts: (tripId: string) =>
      client.get<ApiResponse<TripCost[]>>(FLEET.tripCosts(tripId)).then((res) => {
        const raw: unknown = res?.data;
        const rows: unknown[] = Array.isArray(raw) ? raw : (Array.isArray(asRaw(raw).costs) ? (asRaw(raw).costs as unknown[]) : []);
        return { ...res, data: rows.map((r) => mapTripCost(asRaw(r))) } as ApiResponse<TripCost[]>;
      }),

    deleteCost: (tripId: string, costId: string) =>
      client.delete<ApiResponse<void>>(FLEET.tripCostById(tripId, costId)),

    getCostSummary: (tripId: string) =>
      client.get<ApiResponse<{ total: number; byType: Record<string, number> }>>(FLEET.tripCostSummary(tripId)),

    generateInvoice: (tripId: string) =>
      client.post<ApiResponse<{ id: string; invoiceNumber?: string }>>(FLEET.tripGenerateInvoice(tripId)).then((res) => {
        const d = asRaw(res?.data);
        return (res?.data ? { ...res, data: { ...d, id: str(d.id, d.invoiceId) ?? '' } } : res) as ApiResponse<{ id: string; invoiceNumber?: string }>;
      }),

    generateVoucher: (tripId: string) =>
      client.post<ApiResponse<{ id: string; voucherNumber?: string; url?: string }>>(FLEET.tripGenerateVoucher(tripId)).then((res) => {
        const d = asRaw(res?.data);
        return (res?.data ? { ...res, data: { ...d, id: str(d.id, d.voucherId) ?? '' } } : res) as ApiResponse<{ id: string; voucherNumber?: string; url?: string }>;
      }),

    calculateDistance: (data: { startLocation: string; endLocation: string }) =>
      client.post<ApiResponse<{ distanceKm: number; durationMinutes?: number }>>(FLEET.calculateDistance, data),
  },

  rateCards: {
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      vehicleType?: string;
      tripType?: string;
      isActive?: '1' | '0';
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<FleetRateCard>>>('/fleet/vehicle-rate-cards', { params }),

    getById: (id: string) =>
      client.get<ApiResponse<FleetRateCard>>(`/fleet/vehicle-rate-cards/${id}`),

    create: (data: CreateFleetRateCardRequest) =>
      client.post<ApiResponse<FleetRateCard>>('/fleet/vehicle-rate-cards', data),

    update: (id: string, data: UpdateFleetRateCardRequest) =>
      client.put<ApiResponse<FleetRateCard>>(`/fleet/vehicle-rate-cards/${id}`, data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(`/fleet/vehicle-rate-cards/${id}`),

    lookup: (params: { vehicleType: string; tripType: string }) =>
      client.get<ApiResponse<FleetRateCard | null>>('/fleet/vehicle-rate-cards/lookup', { params }),

    estimate: (data: RateCardEstimateRequest) =>
      client.post<ApiResponse<RateCardEstimateResult>>('/fleet/vehicle-rate-cards/estimate', data),
  },
};
