import type {
  UserRole,
  LeadStatus,
  LeadPriority,
  ContactType,
  InvoiceStatus,
  SupportedCurrency,
  TripType,
  LeadSource,
} from '../constants/index';

// ─── Common Types ──────────────────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, string[]>;
}

export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

export interface FilterConfig {
  [key: string]: string | string[] | number | boolean | undefined;
}

// ─── Auth Types ────────────────────────────────────────────
export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  tenant: Tenant;
}

export interface OtpLoginRequest {
  phone: string;
  countryCode: string;
}

export interface OtpVerifyRequest {
  phone: string;
  countryCode: string;
  code: string;
}

// ─── User Types ────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  avatarUrl?: string;
  department?: string;
  language: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  currency: SupportedCurrency;
  /** IANA zone: the user's own when set, else the agency's. */
  timezone: string;
  /** BCP 47 tag: the user's own when set, else the agency's. Absent on sessions saved before R202. */
  locale?: string;
  country?: string;
  phoneDefaultCountry?: string;
  language: string;
  plan: string;
  isActive: boolean;
}

// ─── Contact Types ─────────────────────────────────────────
export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  countryCode?: string;
  company?: string;
  type: ContactType;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  tags: string[];
  notes?: string;
  source?: string;
  birthday?: string;
  anniversary?: string;
  preferredLanguage?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactCreateRequest {
  name: string;
  email?: string;
  phone?: string;
  countryCode?: string;
  company?: string;
  type: ContactType;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  tags?: string[];
  notes?: string;
  source?: string;
  birthday?: string;
  anniversary?: string;
  preferredLanguage?: string;
}

// ─── Lead Types ────────────────────────────────────────────
export interface Lead {
  id: string;
  contactId: string;
  contact?: Contact;
  title: string;
  destination?: string;
  travelDate?: string;
  returnDate?: string;
  paxAdults: number;
  paxChildren: number;
  paxInfants: number;
  budget?: number;
  currency: SupportedCurrency;
  tripType?: TripType;
  source?: LeadSource;
  status: LeadStatus;
  priority: LeadPriority;
  assignedTo?: string;
  assignedUser?: User;
  lostReason?: string;
  passportAvailable?: boolean;
  travelClass?: string;
  hotelPreference?: string;
  mealPreference?: string;
  specialRequirements?: string;
  aiScore?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadCreateRequest {
  contactId: string;
  title: string;
  destination?: string;
  travelDate?: string;
  returnDate?: string;
  paxAdults?: number;
  paxChildren?: number;
  paxInfants?: number;
  budget?: number;
  currency?: SupportedCurrency;
  tripType?: TripType;
  source?: LeadSource;
  status?: LeadStatus;
  priority?: LeadPriority;
  assignedTo?: string;
  specialRequirements?: string;
}

// ─── Follow-up Types ───────────────────────────────────────
export interface FollowUp {
  id: string;
  leadId: string;
  lead?: Lead;
  userId: string;
  user?: User;
  type: 'call' | 'email' | 'whatsapp' | 'meeting' | 'task';
  scheduledAt: string;
  completedAt?: string;
  notes?: string;
  outcome?: string;
  createdAt: string;
}

// ─── Invoice Types ─────────────────────────────────────────
export interface Invoice {
  id: string;
  invoiceNumber: string;
  contactId: string;
  contact?: Contact;
  leadId?: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  currency: SupportedCurrency;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  lineItems: InvoiceLineItem[];
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  amount: number;
}

// ─── Itinerary Types ───────────────────────────────────────
export interface Itinerary {
  id: string;
  leadId: string;
  lead?: Lead;
  title: string;
  startDate: string;
  endDate: string;
  currency: SupportedCurrency;
  totalCost: number;
  sellingPrice: number;
  markupPercent: number;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  days: ItineraryDay[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItineraryDay {
  id: string;
  dayNumber: number;
  date: string;
  title: string;
  activities: ItineraryActivity[];
}

export interface ItineraryActivity {
  id: string;
  type: 'hotel' | 'flight' | 'transfer' | 'activity' | 'meal' | 'cruise' | 'free_day';
  title: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  supplierId?: string;
  supplierName?: string;
  cost: number;
  sellingPrice: number;
  notes?: string;
}

// ─── Dashboard Types ───────────────────────────────────────
export interface DashboardKPIs {
  newLeads: { count: number; trend: number };
  followUpsToday: { count: number };
  revenueThisMonth: { amount: number; currency: SupportedCurrency; trend: number };
  bookingsThisMonth: { count: number; trend: number };
  collectionRate: { percentage: number };
}

export interface PipelineOverview {
  stages: {
    status: LeadStatus;
    count: number;
    totalValue: number;
  }[];
}

// ─── Activity Types ────────────────────────────────────────
export interface ActivityLogEntry {
  id: string;
  userId: string;
  user?: User;
  action: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// Re-export constant types
export type {
  UserRole,
  LeadStatus,
  LeadPriority,
  ContactType,
  InvoiceStatus,
  SupportedCurrency,
  TripType,
  LeadSource,
};

// ─── Fleet Types ──────────────────────────────────────────
import type {
  VehicleType,
  VehicleStatus,
  DriverStatus,
  TripStatus,
  FleetTripType,
} from '../constants/index';

export type { VehicleType, VehicleStatus, DriverStatus, TripStatus, FleetTripType };

export interface Vehicle {
  id: string;
  registrationNumber: string;
  type: VehicleType;
  make: string;
  model: string;
  year: number;
  color?: string;
  seatingCapacity: number;
  status: VehicleStatus;
  odometerReading?: number;
  insuranceExpiry?: string;
  permitExpiry?: string;
  pollutionExpiry?: string;
  nextServiceDate?: string;
  nextServiceOdometer?: number;
  features?: string[];
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleCreateRequest {
  registrationNumber: string;
  type: VehicleType;
  make: string;
  model: string;
  year: number;
  color?: string;
  seatingCapacity: number;
  insuranceExpiry?: string;
  permitExpiry?: string;
  pollutionExpiry?: string;
  nextServiceDate?: string;
  nextServiceOdometer?: number;
  features?: string[];
  notes?: string;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatarUrl?: string;
  licenseNumber: string;
  licenseExpiry: string;
  status: DriverStatus;
  rating: number;
  totalTrips: number;
  totalRevenue: number;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  dateOfJoining?: string;
  address?: string;
  idProofExpiry?: string;
  addressProofExpiry?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DriverCreateRequest {
  name: string;
  phone: string;
  email?: string;
  licenseNumber: string;
  licenseExpiry: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  dateOfJoining?: string;
  address?: string;
  notes?: string;
}

export interface TripAssignment {
  id: string;
  leadId?: string;
  lead?: Lead;
  contactId?: string;
  contact?: Contact;
  vehicleId: string;
  vehicle?: Vehicle;
  driverId: string;
  driver?: Driver;
  rateCardId?: string;
  rateCard?: VehicleRateCard;
  passengerName: string;
  passengerPhone?: string;
  pickupLocation: string;
  dropLocation: string;
  tripType: FleetTripType;
  status: TripStatus;
  startDate: string;
  endDate?: string;
  estimatedDistance?: number;
  actualDistance?: number;
  estimatedCost: number;
  actualCost?: number;
  costOverrideReason?: string;
  specialInstructions?: string;
  statusHistory: TripStatusChange[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TripStatusChange {
  status: TripStatus;
  timestamp: string;
  userId: string;
  userName?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
}

export interface TripAssignmentCreateRequest {
  leadId?: string;
  contactId?: string;
  vehicleId: string;
  driverId: string;
  rateCardId?: string;
  passengerName: string;
  passengerPhone?: string;
  pickupLocation: string;
  dropLocation: string;
  tripType: FleetTripType;
  startDate: string;
  endDate?: string;
  estimatedDistance?: number;
  estimatedCost?: number;
  specialInstructions?: string;
}

export interface VehicleRateCard {
  id: string;
  name: string;
  vehicleType: VehicleType;
  tripType: FleetTripType;
  baseFare: number;
  perKmRate: number;
  perHourRate: number;
  minimumKm: number;
  minimumHours: number;
  nightCharge: number;
  driverAllowance: number;
  flatRate?: number;
  extraKmRate: number;
  extraHourRate: number;
  tollIncluded: boolean;
  parkingIncluded: boolean;
  validFrom?: string;
  validTo?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleRateCardCreateRequest {
  name: string;
  vehicleType: VehicleType;
  tripType: FleetTripType;
  baseFare: number;
  perKmRate: number;
  perHourRate: number;
  minimumKm?: number;
  minimumHours?: number;
  nightCharge?: number;
  driverAllowance?: number;
  flatRate?: number;
  extraKmRate?: number;
  extraHourRate?: number;
  tollIncluded?: boolean;
  parkingIncluded?: boolean;
  validFrom?: string;
  validTo?: string;
  isActive?: boolean;
}

export interface FleetDashboard {
  totalVehicles: number;
  vehiclesByStatus: Record<VehicleStatus, number>;
  totalDrivers: number;
  driversByStatus: Record<DriverStatus, number>;
  activeTrips: number;
  revenueMTD: number;
  activeTripsList: TripAssignment[];
  upcomingTrips: TripAssignment[];
  topDrivers: Driver[];
  expiringDocuments: FleetAlert[];
  maintenanceDue: FleetAlert[];
}

export interface FleetAlert {
  id: string;
  type: 'document_expiry' | 'maintenance_due';
  entityType: 'vehicle' | 'driver';
  entityId: string;
  entityName: string;
  documentType?: string;
  expiryDate?: string;
  daysRemaining: number;
  urgency: 'overdue' | 'critical' | 'warning';
}

export interface TripCostEstimate {
  rateCardId: string;
  rateCardName: string;
  baseFare: number;
  distanceCharge: number;
  durationCharge: number;
  nightCharge: number;
  driverAllowance: number;
  extras: number;
  total: number;
}

// ─── Supplier Types ───────────────────────────────────────
export interface Supplier {
  id: string;
  name: string;
  type: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  website?: string;
  gstNumber?: string;
  panNumber?: string;
  bankDetails?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierCreateRequest {
  name: string;
  type: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  website?: string;
  gstNumber?: string;
  panNumber?: string;
  bankDetails?: string;
  notes?: string;
}

// ─── Payment Types ────────────────────────────────────────
export interface Payment {
  id: string;
  invoiceId: string;
  invoice?: Invoice;
  amount: number;
  method: 'cash' | 'bank_transfer' | 'cheque' | 'upi' | 'card' | 'other';
  reference?: string;
  paidAt: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

// ─── Campaign Types ───────────────────────────────────────
export interface Campaign {
  id: string;
  name: string;
  type: 'email' | 'sms' | 'whatsapp';
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'paused';
  subject?: string;
  body: string;
  templateId?: string;
  segmentFilters: Record<string, unknown>;
  scheduledAt?: string;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  clickedCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Report Types ─────────────────────────────────────────
export interface ReportConfig {
  id: string;
  name: string;
  type: string;
  dateRange: { start: string; end: string };
  filters?: Record<string, unknown>;
}

export * from './departures';
