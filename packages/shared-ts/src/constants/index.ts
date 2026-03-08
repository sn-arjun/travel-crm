// ─── User Roles ────────────────────────────────────────────
export const USER_ROLES = {
  ADMIN: 'admin',
  SALES_MANAGER: 'sales_manager',
  SALESPERSON: 'salesperson',
  OPERATIONS: 'operations',
  ACCOUNTANT: 'accountant',
  VIEW_ONLY: 'view_only',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// ─── Lead Statuses ─────────────────────────────────────────
export const LEAD_STATUSES = {
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFIED: 'qualified',
  PROPOSAL_SENT: 'proposal_sent',
  NEGOTIATION: 'negotiation',
  WON: 'won',
  LOST: 'lost',
  ON_HOLD: 'on_hold',
} as const;

export type LeadStatus = (typeof LEAD_STATUSES)[keyof typeof LEAD_STATUSES];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal_sent: 'Proposal Sent',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
  on_hold: 'On Hold',
};

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new: '#8B5CF6',
  contacted: '#3B82F6',
  qualified: '#06B6D4',
  proposal_sent: '#F59E0B',
  negotiation: '#F97316',
  won: '#10B981',
  lost: '#EF4444',
  on_hold: '#6B7280',
};

// ─── Lead Priority ─────────────────────────────────────────
export const LEAD_PRIORITIES = {
  HOT: 'hot',
  WARM: 'warm',
  COLD: 'cold',
} as const;

export type LeadPriority = (typeof LEAD_PRIORITIES)[keyof typeof LEAD_PRIORITIES];

export const LEAD_PRIORITY_COLORS: Record<LeadPriority, string> = {
  hot: '#EF4444',
  warm: '#F59E0B',
  cold: '#3B82F6',
};

// ─── Contact Types ─────────────────────────────────────────
export const CONTACT_TYPES = {
  CUSTOMER: 'customer',
  SUPPLIER: 'supplier',
  AGENT: 'agent',
  PARTNER: 'partner',
} as const;

export type ContactType = (typeof CONTACT_TYPES)[keyof typeof CONTACT_TYPES];

// ─── Invoice Statuses ──────────────────────────────────────
export const INVOICE_STATUSES = {
  DRAFT: 'draft',
  SENT: 'sent',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
} as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[keyof typeof INVOICE_STATUSES];

// ─── Currencies ────────────────────────────────────────────
export const SUPPORTED_CURRENCIES = [
  'INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'THB', 'SGD', 'MYR', 'AUD',
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

// ─── Trip Types ────────────────────────────────────────────
export const TRIP_TYPES = {
  DOMESTIC: 'domestic',
  INTERNATIONAL: 'international',
} as const;

export type TripType = (typeof TRIP_TYPES)[keyof typeof TRIP_TYPES];

// ─── Lead Sources ──────────────────────────────────────────
export const LEAD_SOURCES = [
  'manual', 'website', 'facebook', 'google', 'referral', 'walkin',
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

// ─── Pagination Defaults ───────────────────────────────────
export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

// ─── API Config ────────────────────────────────────────────
export const API_VERSION = 'v1';

// ─── Vehicle Types ────────────────────────────────────────
export const VEHICLE_TYPES = {
  SEDAN: 'sedan',
  SUV: 'suv',
  MUV: 'muv',
  TEMPO_TRAVELLER: 'tempo_traveller',
  MINI_BUS: 'mini_bus',
  BUS: 'bus',
  LUXURY_COACH: 'luxury_coach',
} as const;

export type VehicleType = (typeof VEHICLE_TYPES)[keyof typeof VEHICLE_TYPES];

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  sedan: 'Sedan',
  suv: 'SUV',
  muv: 'MUV',
  tempo_traveller: 'Tempo Traveller',
  mini_bus: 'Mini Bus',
  bus: 'Bus',
  luxury_coach: 'Luxury Coach',
};

// ─── Vehicle Statuses ─────────────────────────────────────
export const VEHICLE_STATUSES = {
  AVAILABLE: 'available',
  ON_TRIP: 'on_trip',
  UNDER_MAINTENANCE: 'under_maintenance',
  OUT_OF_SERVICE: 'out_of_service',
} as const;

export type VehicleStatus = (typeof VEHICLE_STATUSES)[keyof typeof VEHICLE_STATUSES];

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  available: 'Available',
  on_trip: 'On Trip',
  under_maintenance: 'Under Maintenance',
  out_of_service: 'Out of Service',
};

export const VEHICLE_STATUS_COLORS: Record<VehicleStatus, string> = {
  available: '#10B981',
  on_trip: '#3B82F6',
  under_maintenance: '#F59E0B',
  out_of_service: '#EF4444',
};

// ─── Driver Statuses ──────────────────────────────────────
export const DRIVER_STATUSES = {
  ACTIVE: 'active',
  ON_TRIP: 'on_trip',
  OFF_DUTY: 'off_duty',
  ON_LEAVE: 'on_leave',
} as const;

export type DriverStatus = (typeof DRIVER_STATUSES)[keyof typeof DRIVER_STATUSES];

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  active: 'Active',
  on_trip: 'On Trip',
  off_duty: 'Off Duty',
  on_leave: 'On Leave',
};

export const DRIVER_STATUS_COLORS: Record<DriverStatus, string> = {
  active: '#10B981',
  on_trip: '#3B82F6',
  off_duty: '#64748B',
  on_leave: '#F59E0B',
};

// ─── Trip Statuses ────────────────────────────────────────
export const TRIP_STATUSES = {
  ASSIGNED: 'assigned',
  ACCEPTED: 'accepted',
  EN_ROUTE: 'en_route',
  STARTED: 'started',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type TripStatus = (typeof TRIP_STATUSES)[keyof typeof TRIP_STATUSES];

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  assigned: 'Assigned',
  accepted: 'Accepted',
  en_route: 'En Route',
  started: 'Started',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const TRIP_STATUS_COLORS: Record<TripStatus, string> = {
  assigned: '#64748B',
  accepted: '#3B82F6',
  en_route: '#F59E0B',
  started: '#10B981',
  completed: '#059669',
  cancelled: '#EF4444',
};

// ─── Fleet Trip Types ─────────────────────────────────────
export const FLEET_TRIP_TYPES = {
  ONE_WAY: 'one_way',
  ROUND_TRIP: 'round_trip',
  AIRPORT_PICKUP: 'airport_pickup',
  AIRPORT_DROP: 'airport_drop',
  LOCAL_8H80KM: 'local_8h80km',
  LOCAL_12H120KM: 'local_12h120km',
  OUTSTATION: 'outstation',
} as const;

export type FleetTripType = (typeof FLEET_TRIP_TYPES)[keyof typeof FLEET_TRIP_TYPES];

export const FLEET_TRIP_TYPE_LABELS: Record<FleetTripType, string> = {
  one_way: 'One Way',
  round_trip: 'Round Trip',
  airport_pickup: 'Airport Pickup',
  airport_drop: 'Airport Drop',
  local_8h80km: 'Local 8hr/80km',
  local_12h120km: 'Local 12hr/120km',
  outstation: 'Outstation',
};
