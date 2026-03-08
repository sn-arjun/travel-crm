import { client, type ApiResponse, type PaginatedResponse } from './client';
import { API_ENDPOINTS } from './config';

export interface Vehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  capacity: number;
  status: 'active' | 'maintenance' | 'inactive';
  mileage: number;
  purchaseDate: string;
  customFields?: Record<string, unknown>;
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
  emergencyContact?: string;
  emergencyContactPhone?: string;
  dateOfJoining?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
}

export interface Trip {
  id: string;
  vehicleId: string;
  driverId: string;
  startLocation: string;
  endLocation: string;
  startTime: string;
  endTime: string;
  distance: number;
  fare: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  customFields?: Record<string, unknown>;
}

export interface FleetRateCard {
  id: string;
  name: string;
  vehicleType: string;
  baseFare: number;
  perKmRate: number;
  perHourRate: number;
  validFrom: string;
  validTo: string;
  customFields?: Record<string, unknown>;
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
  startLocation: string;
  endLocation: string;
  startTime: string;
  endTime: string;
  distance: number;
  fare: number;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
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
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  customFields?: Record<string, unknown>;
}

export interface CreateFleetRateCardRequest {
  name: string;
  vehicleType: string;
  baseFare: number;
  perKmRate: number;
  perHourRate: number;
  validFrom: string;
  validTo: string;
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
    driverName: t.driverName || t.driver_name || null,
    vehicleRegistration: t.vehicleRegistration || t.registration_number || null,
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

export const fleetApi = {
  vehicles: {
    list: (params?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
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
  },

  trips: {
    list: (params?: {
      page?: number;
      limit?: number;
      vehicleId?: string;
      driverId?: string;
      status?: string;
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
