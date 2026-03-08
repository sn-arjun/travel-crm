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
  status: 'active' | 'maintenance' | 'inactive' | 'on_trip';
  mileage: number;
  odometerKm?: number;
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
  expiryDate?: string;
  isExpired?: boolean;
  daysUntilExpiry?: number;
  notes?: string;
  createdAt: string;
}

export interface VehicleMaintenance {
  id: string;
  vehicleId: string;
  serviceType: string;
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
  licenseNumber?: string;
  licenseExpiry?: string;
  status: 'active' | 'on_trip' | 'off_duty' | 'on_leave';
  experience?: number;
  rating?: number;
  totalTrips?: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
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
  costType: 'fuel' | 'toll' | 'parking' | 'driver_allowance' | 'maintenance' | 'other';
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
  minimumKm?: number;
  minimumHours?: number;
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

export interface FleetDashboard {
  totalVehicles: number;
  availableVehicles: number;
  vehiclesOnTrip: number;
  totalDrivers: number;
  activeDrivers: number;
  driversOnTrip: number;
  activeTrips: number;
  upcomingTrips: Trip[];
  recentCompletedTrips: Trip[];
  topDrivers: Driver[];
  expiringDocumentsCount: number;
  maintenanceDueCount: number;
  revenueMtd: number;
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
  make?: string;
  model?: string;
  year?: number;
  capacity?: number;
  status?: 'active' | 'maintenance' | 'inactive';
  mileage?: number;
  customFields?: Record<string, unknown>;
}

export interface CreateDriverRequest {
  name: string;
  phone: string;
  email?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  dateOfJoining?: string;
  notes?: string;
}

export interface UpdateDriverRequest {
  firstName?: string;
  lastName?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  phone?: string;
  email?: string;
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
  tripType?: string;
  baseFare: number;
  perKmRate: number;
  perHourRate?: number;
  minimumKm?: number;
  minimumHours?: number;
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
  baseFare?: number;
  perKmRate?: number;
  perHourRate?: number;
  validFrom?: string;
  validTo?: string;
  customFields?: Record<string, unknown>;
}

export interface CreateTripCostRequest {
  costType: 'fuel' | 'toll' | 'parking' | 'driver_allowance' | 'maintenance' | 'other';
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
    vehicle: t.vehicle || null,
    driver: t.driver || null,
    passengerName: t.passengerName || t.passenger_name || null,
    passengerPhone: t.passengerPhone || t.passenger_phone || null,
    specialInstructions: t.specialInstructions || t.special_instructions || null,
    leadId: t.leadId || t.lead_id || null,
    estimatedCost: t.estimatedCost || t.estimated_cost || t.fare || 0,
    estimatedDistanceKm: t.estimatedDistanceKm || t.estimated_distance_km || t.distance || 0,
  };
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
  expiringDriverDocs: '/fleet/documents/drivers/expiring',
  tripTimeline: (id: string) => `/fleet/trips/${id}/timeline`,
  tripStatus: (id: string) => `/fleet/trips/${id}/status`,
  tripCosts: (id: string) => `/fleet/trips/${id}/costs`,
  tripCostById: (tripId: string, costId: string) => `/fleet/trips/${tripId}/costs/${costId}`,
  tripCostSummary: (id: string) => `/fleet/trips/${id}/costs/summary`,
};

export const fleetApi = {
  dashboard: () =>
    client.get<ApiResponse<FleetDashboard>>(FLEET.dashboard),

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
      client.get<ApiResponse<{ url: string }>>(FLEET.vehicleDocDownload(vehicleId, docId)),

    deleteDocument: (vehicleId: string, docId: string) =>
      client.delete<ApiResponse<void>>(FLEET.vehicleDocById(vehicleId, docId)),

    getExpiringDocuments: (days = 30) =>
      client.get<ApiResponse<(VehicleDocument & { vehicleName?: string; registrationNumber?: string })[]>>(
        FLEET.expiringDocs, { params: { days } }
      ),

    recordMaintenance: (id: string, data: { serviceType: string; serviceDate: string; odometer?: number; cost?: number; vendor?: string; notes?: string; nextServiceDate?: string; nextServiceKm?: number }) =>
      client.post<ApiResponse<VehicleMaintenance>>(FLEET.vehicleMaintenance(id), data),

    getMaintenanceHistory: (id: string) =>
      client.get<ApiResponse<VehicleMaintenance[]>>(FLEET.vehicleMaintenance(id)),

    getMaintenanceDue: (days = 7) =>
      client.get<ApiResponse<(Vehicle & { daysTillService?: number })[]>>(FLEET.maintenanceDue, { params: { days } }),

    updateOdometer: (id: string, km: number) =>
      client.put<ApiResponse<Vehicle>>(FLEET.vehicleOdometer(id), { odometerKm: km }),

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
  },

  trips: {
    list: (params?: {
      page?: number;
      limit?: number;
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

    update: (id: string, data: UpdateTripRequest) =>
      client.put<ApiResponse<Trip>>(API_ENDPOINTS.fleet.trips.byId(id), data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(API_ENDPOINTS.fleet.trips.byId(id)),

    updateStatus: (id: string, status: string, notes?: string) =>
      client.put<ApiResponse<Trip>>(FLEET.tripStatus(id), { status, notes }),

    getTimeline: (id: string) =>
      client.get<ApiResponse<TripTimeline[]>>(FLEET.tripTimeline(id)),

    addCost: (tripId: string, data: CreateTripCostRequest) =>
      client.post<ApiResponse<TripCost>>(FLEET.tripCosts(tripId), data),

    listCosts: (tripId: string) =>
      client.get<ApiResponse<TripCost[]>>(FLEET.tripCosts(tripId)),

    deleteCost: (tripId: string, costId: string) =>
      client.delete<ApiResponse<void>>(FLEET.tripCostById(tripId, costId)),

    getCostSummary: (tripId: string) =>
      client.get<ApiResponse<{ total: number; byType: Record<string, number> }>>(FLEET.tripCostSummary(tripId)),
  },

  rateCards: {
    list: (params?: {
      page?: number;
      limit?: number;
      vehicleType?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }) =>
      client.get<ApiResponse<PaginatedResponse<FleetRateCard>>>(API_ENDPOINTS.fleet.rateCards.list, { params }),

    getById: (id: string) =>
      client.get<ApiResponse<FleetRateCard>>(API_ENDPOINTS.fleet.rateCards.byId(id)),

    create: (data: CreateFleetRateCardRequest) =>
      client.post<ApiResponse<FleetRateCard>>(API_ENDPOINTS.fleet.rateCards.create, data),

    update: (id: string, data: UpdateFleetRateCardRequest) =>
      client.put<ApiResponse<FleetRateCard>>(API_ENDPOINTS.fleet.rateCards.byId(id), data),

    delete: (id: string) =>
      client.delete<ApiResponse<void>>(API_ENDPOINTS.fleet.rateCards.byId(id)),
  },
};
