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
  };
  driver?: {
    name?: string;
    phone?: string;
    rating?: number;
  };
  tripType?: string;
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

// Compute experience from dateOfJoining
function computeExperience(driver: any): number {
  const doj = driver.dateOfJoining || driver.date_of_joining;
  if (!doj) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(doj).getTime()) / (365.25 * 86400000)));
}

function mapDriverFields(d: any): any {
  if (!d) return d;
  return { ...d, experience: d.experience ?? computeExperience(d) };
}

function mapDriversResponse(res: any): any {
  if (!res) return res;
  const data = res.data;
  if (Array.isArray(data)) return { ...res, data: data.map(mapDriverFields) };
  if (data?.data && Array.isArray(data.data)) return { ...res, data: { ...data, data: data.data.map(mapDriverFields) } };
  return res;
}

function mapDriverResponse(res: any): any {
  if (!res) return res;
  if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) return { ...res, data: mapDriverFields(res.data) };
  return res;
}

// Map backend trip fields to frontend Trip interface
function mapTripFields(t: any): any {
  if (!t) return t;
  return {
    ...t,
    startLocation: t.startLocation || t.pickupLocation || t.pickup_location || '',
    endLocation: t.endLocation || t.dropLocation || t.drop_location || '',
    startTime: t.startTime || t.pickupDatetime || t.pickup_datetime || '',
    endTime: t.endTime || t.dropDatetime || t.drop_datetime || '',
    distance: t.distance || t.estimatedDistanceKm || t.estimated_distance_km || 0,
    fare: t.fare || t.estimatedCost || t.estimated_cost || 0,
    vehicleId: t.vehicleId || t.vehicle_id,
    driverId: t.driverId || t.driver_id,
    driverName: t.driverName || t.driver_name || t.driver?.name || null,
    vehicleRegistration: t.vehicleRegistration || t.registration_number || t.vehicle?.registrationNumber || null,
    vehicle: t.vehicle || (t.vehicleMake || t.vehicleModel || t.vehicleRegistration || t.registrationNumber ? {
      make: t.vehicleMake || t.vehicle_make || null,
      model: t.vehicleModel || t.vehicle_model || null,
      registrationNumber: t.vehicleRegistration || t.registrationNumber || t.registration_number || null,
      type: t.vehicleType || t.vehicle_type || null,
      seatingCapacity: t.seatingCapacity || t.seating_capacity || null,
      photoUrl: t.vehiclePhoto || t.vehicle_photo || null,
    } : null),
    driver: t.driver || (t.driverName || t.driver_name ? {
      name: t.driverName || t.driver_name || null,
      phone: t.driverPhone || t.driver_phone || null,
      photoUrl: t.driverPhoto || t.driver_photo || null,
      rating: t.driverRating || t.driver_rating || null,
    } : null),
    passengerName: t.passengerName || t.passenger_name || null,
    passengerPhone: t.passengerPhone || t.passenger_phone || null,
    specialInstructions: t.specialInstructions || t.special_instructions || null,
    leadId: t.leadId || t.lead_id || null,
    estimatedCost: t.estimatedCost || t.estimated_cost || t.fare || 0,
    estimatedDistanceKm: t.estimatedDistanceKm || t.estimated_distance_km || t.distance || 0,
  };
}

// Backend sends raw snake_case rows for trip costs and timeline entries.
function mapTripCost(c: any): TripCost {
  return {
    id: c.id,
    tripId: c.tripId ?? c.trip_id,
    costType: c.costType ?? c.cost_type,
    amount: c.amount ?? 0,
    receiptUrl: c.receiptUrl ?? c.receipt_url ?? undefined,
    notes: c.notes ?? c.description ?? undefined,
    createdAt: c.createdAt ?? c.created_at ?? '',
  };
}

function mapTripTimelineEntry(t: any): TripTimeline {
  return {
    status: t.status,
    timestamp: t.timestamp ?? t.createdAt ?? t.created_at ?? '',
    userName: t.userName ?? '',
    notes: t.notes ?? undefined,
    latitude: t.latitude ?? undefined,
    longitude: t.longitude ?? undefined,
  };
}

function mapMaintenanceRow(row: any): VehicleMaintenance {
  return {
    id: row.id,
    vehicleId: row.vehicle_id ?? row.vehicleId,
    serviceType: row.service_type ?? row.serviceType,
    description: row.description ?? undefined,
    serviceDate: row.service_date ?? row.serviceDate,
    odometer: row.odometer_at_service ?? row.odometer ?? undefined,
    cost: row.cost ?? undefined,
    vendor: row.vendor_name ?? row.vendor ?? undefined,
    notes: row.notes ?? undefined,
    nextServiceDate: row.next_service_due_date ?? row.nextServiceDate ?? undefined,
    nextServiceKm: row.next_service_due_km ?? row.nextServiceKm ?? undefined,
    createdAt: row.created_at ?? row.createdAt,
  };
}

function mapMaintenanceResponse(res: any): any {
  if (!res) return res;
  if (Array.isArray(res.data)) return { ...res, data: res.data.map(mapMaintenanceRow) };
  if (res.data && typeof res.data === 'object') return { ...res, data: mapMaintenanceRow(res.data) };
  return res;
}

function mapTripsResponse(res: any): any {
  if (!res) return res;
  const data = res.data;
  if (Array.isArray(data)) {
    return { ...res, data: data.map(mapTripFields) };
  }
  if (data?.data && Array.isArray(data.data)) {
    return { ...res, data: { ...data, data: data.data.map(mapTripFields) } };
  }
  return res;
}

function mapTripResponse(res: any): any {
  if (!res) return res;
  if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
    return { ...res, data: mapTripFields(res.data) };
  }
  return res;
}

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

function mapDashboardResponse(res: ApiResponse<any>): ApiResponse<FleetDashboard> {
  const raw = res?.data ?? {};
  const vehicleSummary: FleetDashboardVehicleSummary = raw.vehicleSummary ?? {
    total: raw.totalVehicles ?? 0,
    available: raw.availableVehicles ?? 0,
    on_trip: raw.vehiclesOnTrip ?? 0,
    under_maintenance: 0,
    out_of_service: 0,
  };
  const driverSummary: FleetDashboardDriverSummary = raw.driverSummary ?? {
    total: raw.totalDrivers ?? 0,
    active: raw.activeDrivers ?? 0,
    on_trip: raw.driversOnTrip ?? 0,
    off_duty: 0,
    on_leave: 0,
  };
  const activeTripsList = (raw.activeTrips || []).map(mapTripFields);
  const revenue: FleetDashboardRevenue = raw.revenue ?? {
    thisMonth: 0, thisMonthTrips: 0, thisMonthCosts: 0, lastMonth: 0, lastMonthTrips: 0, byVehicleType: [], byDriver: [],
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
      upcomingTrips: (raw.upcomingTrips || []).map(mapTripFields),
      recentCompletedTrips: (raw.recentCompleted || []).map((t: any) => ({ ...mapTripFields(t), totalCost: t.totalCost ?? 0 })),
      topDrivers: raw.topDrivers || [],
      expiringDocumentsCount: raw.expiringDocuments ?? 0,
      maintenanceDueCount: raw.maintenanceDue ?? 0,
      revenueMtd: revenue.thisMonth ?? 0,
      vehicleSummary,
      driverSummary,
      revenue,
    },
  };
}

function mapDocumentAlert(r: any): FleetDocumentAlert {
  const ownerType: 'vehicle' | 'driver' = r.owner_type === 'driver' ? 'driver' : 'vehicle';
  return {
    id: r.id,
    vehicleId: ownerType === 'vehicle' ? r.vehicle_id : undefined,
    driverId: ownerType === 'driver' ? r.driver_id : undefined,
    ownerType,
    entityName: r.registration_number || 'Unknown',
    type: r.type,
    expiryDate: r.expiry_date,
    isExpired: !!r.isExpired,
    daysUntilExpiry: r.daysUntilExpiry ?? null,
  };
}

export const fleetApi = {
  dashboard: () =>
    client.get<ApiResponse<FleetDashboard>>(FLEET.dashboard).then(mapDashboardResponse),

  // Unified vehicle + driver document expiry alerts (single call, avoids two round trips).
  getExpiringDocuments: (days = 30) =>
    client.get<ApiResponse<any[]>>(FLEET.expiringDocs, { params: { days } }).then((res) => ({
      ...res,
      data: (res.data || []).map(mapDocumentAlert),
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
      client.get<ApiResponse<Record<string, VehicleAvailability[]>>>(FLEET.vehiclesAvailability, { params }),

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
      client.get<ApiResponse<Record<string, any>>>(FLEET.driverSchedule, { params }),

    getSingleSchedule: (id: string, params: { from: string; to: string }) =>
      client.get<ApiResponse<any[]>>(FLEET.driverSingleSchedule(id), { params }),

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
      client.get<ApiResponse<TripTimeline[]>>(FLEET.tripTimeline(id)).then((res: any) => {
        const rows = Array.isArray(res?.data) ? res.data : [];
        return { ...res, data: rows.map(mapTripTimelineEntry) } as ApiResponse<TripTimeline[]>;
      }),

    addCost: (tripId: string, data: CreateTripCostRequest) =>
      client.post<ApiResponse<TripCost>>(FLEET.tripCosts(tripId), {
        costType: data.costType,
        amount: data.amount,
        description: data.notes,
      }),

    listCosts: (tripId: string) =>
      client.get<ApiResponse<TripCost[]>>(FLEET.tripCosts(tripId)).then((res: any) => {
        const raw = res?.data;
        const rows = Array.isArray(raw) ? raw : (raw?.costs ?? []);
        return { ...res, data: rows.map(mapTripCost) } as ApiResponse<TripCost[]>;
      }),

    deleteCost: (tripId: string, costId: string) =>
      client.delete<ApiResponse<void>>(FLEET.tripCostById(tripId, costId)),

    getCostSummary: (tripId: string) =>
      client.get<ApiResponse<{ total: number; byType: Record<string, number> }>>(FLEET.tripCostSummary(tripId)),

    generateInvoice: (tripId: string) =>
      client.post<ApiResponse<{ id: string; invoiceNumber?: string }>>(FLEET.tripGenerateInvoice(tripId)).then((res: any) => (
        res?.data ? { ...res, data: { ...res.data, id: res.data.id ?? res.data.invoiceId } } : res
      ) as ApiResponse<{ id: string; invoiceNumber?: string }>),

    generateVoucher: (tripId: string) =>
      client.post<ApiResponse<{ id: string; voucherNumber?: string; url?: string }>>(FLEET.tripGenerateVoucher(tripId)).then((res: any) => (
        res?.data ? { ...res, data: { ...res.data, id: res.data.id ?? res.data.voucherId } } : res
      ) as ApiResponse<{ id: string; voucherNumber?: string; url?: string }>),

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
