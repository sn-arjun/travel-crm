// Fleet mock data — all values are deterministic to avoid SSR hydration mismatches
// Use a fixed reference date instead of Date.now() so server & client always agree
const REF_DATE = Date.now();

const vehicleRegs = ['KA01AB1234', 'MH02CD5678', 'DL03EF9012', 'TN04GH3456', 'KA05IJ7890', 'MH06KL1234', 'DL07MN5678', 'TN08OP9012', 'KA09QR3456', 'MH10ST7890', 'DL11UV1234', 'KA12WX5678'] as const;
const makes = ['Toyota', 'Maruti', 'Mahindra', 'Force', 'Tata', 'Ashok Leyland', 'Mercedes', 'BMW', 'Hyundai', 'Kia', 'MG', 'Honda'] as const;
const models = ['Innova Crysta', 'Ertiga', 'XUV700', 'Traveller', 'Winger', 'Bus', 'V-Class', '7 Series', 'Alcazar', 'Carnival', 'Hector Plus', 'City'] as const;
const vTypes = ['suv', 'muv', 'suv', 'tempo_traveller', 'mini_bus', 'bus', 'luxury_coach', 'sedan', 'suv', 'muv', 'suv', 'sedan'] as const;
const vStatuses = ['available', 'on_trip', 'available', 'under_maintenance', 'available', 'on_trip', 'available', 'out_of_service', 'available', 'on_trip', 'available', 'available'] as const;
const caps = [7, 7, 7, 12, 20, 45, 8, 4, 7, 7, 7, 5] as const;

export const mockVehicles = Array.from({ length: 12 }, (_, i) => ({
  id: `vehicle-${i + 1}`,
  registrationNumber: vehicleRegs[i]!,
  type: vTypes[i]! as 'sedan' | 'suv' | 'muv' | 'tempo_traveller' | 'mini_bus' | 'bus' | 'luxury_coach',
  make: makes[i]!,
  model: models[i]!,
  year: 2020 + (i % 5),
  color: ['White', 'Silver', 'Black', 'Grey', 'Blue', 'Red'][i % 6]!,
  seatingCapacity: caps[i]!,
  status: vStatuses[i]! as 'available' | 'on_trip' | 'under_maintenance' | 'out_of_service',
  odometerReading: 25000 + i * 8000,
  insuranceExpiry: new Date(REF_DATE + (30 - i * 5) * 86400000).toISOString().split('T')[0]!,
  permitExpiry: new Date(REF_DATE + (60 - i * 8) * 86400000).toISOString().split('T')[0]!,
  pollutionExpiry: new Date(REF_DATE + (45 - i * 6) * 86400000).toISOString().split('T')[0]!,
  isActive: true,
  createdAt: new Date(REF_DATE - i * 86400000 * 30).toISOString(),
  updatedAt: new Date(REF_DATE - i * 86400000).toISOString(),
}));

const driverNames = ['Rajesh Kumar', 'Sunil Yadav', 'Mohammed Farhan', 'Ganesh Patil', 'Ravi Shankar', 'Deepak Singh', 'Mohan Das', 'Prakash Jha', 'Vijay Nair', 'Anil Sharma'] as const;
const driverPhones = ['+91 98765 43210', '+91 87654 32109', '+91 76543 21098', '+91 65432 10987', '+91 54321 09876', '+91 98765 11111', '+91 87654 22222', '+91 76543 33333', '+91 65432 44444', '+91 54321 55555'] as const;
const dStatuses = ['active', 'on_trip', 'active', 'off_duty', 'active', 'on_trip', 'active', 'on_leave', 'active', 'on_trip'] as const;
// Deterministic ratings (no Math.random) to prevent hydration mismatches
const driverRatings = [4.5, 4.2, 3.8, 4.7, 4.0, 3.5, 4.9, 4.3, 4.6, 5.0] as const;

export const mockDrivers = Array.from({ length: 10 }, (_, i) => ({
  id: `driver-${i + 1}`,
  name: driverNames[i]!,
  phone: driverPhones[i]!,
  email: `driver${i + 1}@example.com`,
  licenseNumber: `DL-${String(i + 1).padStart(4, '0')}-2024`,
  licenseExpiry: new Date(REF_DATE + (90 - i * 15) * 86400000).toISOString().split('T')[0]!,
  status: dStatuses[i]! as 'active' | 'on_trip' | 'off_duty' | 'on_leave',
  rating: driverRatings[i]!,
  totalTrips: 50 + i * 12,
  totalRevenue: 150000 + i * 35000,
  emergencyContactName: `Emergency ${i + 1}`,
  emergencyContactPhone: `+91 99999 ${String(10000 + i).slice(0, 5)}`,
  dateOfJoining: new Date(REF_DATE - (365 + i * 60) * 86400000).toISOString().split('T')[0]!,
  isActive: true,
  createdAt: new Date(REF_DATE - i * 86400000 * 30).toISOString(),
  updatedAt: new Date(REF_DATE - i * 86400000).toISOString(),
}));

const tripStatuses = ['assigned', 'accepted', 'en_route', 'started', 'completed', 'completed', 'completed', 'started', 'assigned', 'accepted', 'cancelled', 'completed', 'en_route', 'completed', 'assigned'] as const;
const tripTypes = ['one_way', 'round_trip', 'airport_pickup', 'airport_drop', 'local_8h80km', 'outstation', 'local_12h120km', 'one_way', 'round_trip', 'airport_pickup', 'outstation', 'local_8h80km', 'airport_drop', 'round_trip', 'one_way'] as const;
const passengers = ['Rahul Sharma', 'Priya Patel', 'Amit Kumar', 'Sneha Reddy', 'Vikram Singh', 'Ananya Gupta', 'Kiran Desai', 'Meera Nair', 'Rajesh Joshi', 'Pooja Verma', 'Suresh Menon', 'Deepa Iyer', 'Arjun Rao', 'Kavitha Pillai', 'Nikhil Saxena'] as const;
const pickups = ['Mumbai Airport', 'Pune Station', 'Delhi Airport', 'Bengaluru Hotel Taj', 'Chennai Central', 'Hyderabad Airport', 'Goa Airport', 'Jaipur Station', 'Kochi Airport', 'Ahmedabad Hotel', 'Kolkata Airport', 'Lucknow Station', 'Chandigarh Airport', 'Udaipur Hotel', 'Amritsar Station'] as const;
const drops = ['Hotel Grand Hyatt', 'Lonavala Resort', 'Agra Taj Mahal', 'Mysore Palace', 'Mahabalipuram', 'Ramoji Film City', 'Calangute Beach', 'Amber Fort', 'Munnar Hills', 'Rann of Kutch', 'Darjeeling', 'Taj Mahal', 'Shimla Mall Road', 'City Palace', 'Golden Temple'] as const;

export const mockTrips = Array.from({ length: 15 }, (_, i) => ({
  id: `trip-${i + 1}`,
  vehicleId: mockVehicles[i % mockVehicles.length]!.id,
  vehicle: mockVehicles[i % mockVehicles.length]!,
  driverId: mockDrivers[i % mockDrivers.length]!.id,
  driver: mockDrivers[i % mockDrivers.length]!,
  passengerName: passengers[i]!,
  passengerPhone: `+91 ${String(9876500000 + i * 111).slice(0, 5)} ${String(43210 + i * 111).slice(0, 5)}`,
  pickupLocation: pickups[i]!,
  dropLocation: drops[i]!,
  tripType: tripTypes[i]! as 'one_way' | 'round_trip' | 'airport_pickup' | 'airport_drop' | 'local_8h80km' | 'local_12h120km' | 'outstation',
  status: tripStatuses[i]! as 'assigned' | 'accepted' | 'en_route' | 'started' | 'completed' | 'cancelled',
  startDate: new Date(REF_DATE + (i - 7) * 86400000).toISOString().split('T')[0]!,
  endDate: new Date(REF_DATE + (i - 5) * 86400000).toISOString().split('T')[0]!,
  estimatedDistance: 50 + i * 30,
  estimatedCost: 3000 + i * 1500,
  actualCost: i < 8 ? 3200 + i * 1400 : undefined,
  statusHistory: [
    { status: 'assigned' as const, timestamp: new Date(REF_DATE - 3 * 86400000).toISOString(), userId: 'user-1', userName: 'Arjun S' },
  ],
  createdBy: 'user-1',
  createdAt: new Date(REF_DATE - i * 86400000 * 2).toISOString(),
  updatedAt: new Date(REF_DATE - i * 86400000).toISOString(),
}));

export const mockRateCards = Array.from({ length: 8 }, (_, i) => ({
  id: `rc-${i + 1}`,
  name: ['Sedan Local', 'Sedan Outstation', 'SUV Local', 'SUV Outstation', 'MUV Local', 'Tempo Local', 'Mini Bus', 'Luxury Coach'][i]!,
  vehicleType: (['sedan', 'sedan', 'suv', 'suv', 'muv', 'tempo_traveller', 'mini_bus', 'luxury_coach'] as const)[i]!,
  tripType: (['local_8h80km', 'outstation', 'local_8h80km', 'outstation', 'local_8h80km', 'local_12h120km', 'outstation', 'outstation'] as const)[i]!,
  baseFare: [1500, 2500, 2000, 3500, 2500, 4000, 8000, 12000][i]!,
  perKmRate: [12, 14, 16, 18, 14, 20, 30, 45][i]!,
  perHourRate: [100, 0, 150, 0, 120, 200, 0, 0][i]!,
  minimumKm: [80, 250, 80, 250, 80, 120, 250, 250][i]!,
  minimumHours: [8, 0, 8, 0, 8, 12, 0, 0][i]!,
  nightCharge: [250, 300, 300, 400, 300, 500, 700, 1000][i]!,
  driverAllowance: [200, 300, 250, 350, 250, 400, 500, 800][i]!,
  extraKmRate: [14, 16, 18, 20, 16, 22, 35, 50][i]!,
  extraHourRate: [120, 0, 180, 0, 140, 240, 0, 0][i]!,
  tollIncluded: false,
  parkingIncluded: false,
  isActive: i !== 5,
  createdAt: new Date(REF_DATE - i * 86400000 * 10).toISOString(),
  updatedAt: new Date(REF_DATE - i * 86400000).toISOString(),
}));

export const mockFleetAlerts = [
  { id: 'alert-1', type: 'document_expiry' as const, entityType: 'vehicle' as const, entityId: 'vehicle-2', entityName: 'MH02CD5678', documentType: 'Insurance', expiryDate: new Date(REF_DATE + 5 * 86400000).toISOString().split('T')[0]!, daysRemaining: 5, urgency: 'critical' as const },
  { id: 'alert-2', type: 'document_expiry' as const, entityType: 'vehicle' as const, entityId: 'vehicle-4', entityName: 'TN04GH3456', documentType: 'Pollution Certificate', expiryDate: new Date(REF_DATE - 2 * 86400000).toISOString().split('T')[0]!, daysRemaining: -2, urgency: 'overdue' as const },
  { id: 'alert-3', type: 'document_expiry' as const, entityType: 'driver' as const, entityId: 'driver-3', entityName: 'Mohammed Farhan', documentType: 'License', expiryDate: new Date(REF_DATE + 20 * 86400000).toISOString().split('T')[0]!, daysRemaining: 20, urgency: 'warning' as const },
  { id: 'alert-4', type: 'maintenance_due' as const, entityType: 'vehicle' as const, entityId: 'vehicle-1', entityName: 'KA01AB1234', documentType: 'Oil Change', expiryDate: new Date(REF_DATE + 3 * 86400000).toISOString().split('T')[0]!, daysRemaining: 3, urgency: 'critical' as const },
  { id: 'alert-5', type: 'document_expiry' as const, entityType: 'vehicle' as const, entityId: 'vehicle-6', entityName: 'MH06KL1234', documentType: 'Permit', expiryDate: new Date(REF_DATE + 12 * 86400000).toISOString().split('T')[0]!, daysRemaining: 12, urgency: 'warning' as const },
];
