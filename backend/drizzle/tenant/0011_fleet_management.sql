-- Migration: Fleet Management tables (M18)
-- Tables: vehicles, vehicle_documents, vehicle_maintenance, drivers, driver_documents,
--         driver_ratings, trip_assignments, trip_costs, trip_timeline, reminder_log
--
-- NOTE: Drops old fleet tables (vehicles, drivers, trip_assignments) from earlier
-- milestone and recreates with expanded schema (is_deleted, registration_number, etc.)

-- Drop old tables in dependency order (trip_assignments refs vehicles & drivers)
DROP TABLE IF EXISTS trip_timeline;
DROP TABLE IF EXISTS trip_costs;
DROP TABLE IF EXISTS driver_ratings;
DROP TABLE IF EXISTS driver_documents;
DROP TABLE IF EXISTS vehicle_maintenance;
DROP TABLE IF EXISTS vehicle_documents;
DROP TABLE IF EXISTS trip_assignments;
DROP TABLE IF EXISTS drivers;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS reminder_log;

-- ── VEHICLES ──────────────────────────────────────────────────
CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  registration_number TEXT NOT NULL,
  type TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  seating_capacity INTEGER,
  color TEXT,
  photo_url TEXT,
  status TEXT DEFAULT 'available',
  insurance_expiry TEXT,
  permit_expiry TEXT,
  pollution_expiry TEXT,
  last_service_date TEXT,
  next_service_due TEXT,
  odometer_km INTEGER,
  notes TEXT,
  is_deleted INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS vehicles_tenant_id_idx ON vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS vehicles_registration_number_idx ON vehicles(registration_number);
CREATE INDEX IF NOT EXISTS vehicles_status_idx ON vehicles(status);
CREATE INDEX IF NOT EXISTS vehicles_type_idx ON vehicles(type);
CREATE INDEX IF NOT EXISTS vehicles_is_deleted_idx ON vehicles(is_deleted);
CREATE INDEX IF NOT EXISTS vehicles_created_by_idx ON vehicles(created_by);

-- ── VEHICLE DOCUMENTS ─────────────────────────────────────────
CREATE TABLE vehicle_documents (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  document_number TEXT,
  file_url TEXT,
  file_name TEXT,
  expiry_date TEXT,
  issued_date TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS vehicle_documents_vehicle_id_idx ON vehicle_documents(vehicle_id);
CREATE INDEX IF NOT EXISTS vehicle_documents_type_idx ON vehicle_documents(type);
CREATE INDEX IF NOT EXISTS vehicle_documents_expiry_date_idx ON vehicle_documents(expiry_date);
CREATE INDEX IF NOT EXISTS vehicle_documents_is_active_idx ON vehicle_documents(is_active);

-- ── VEHICLE MAINTENANCE ───────────────────────────────────────
CREATE TABLE vehicle_maintenance (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  description TEXT,
  service_date TEXT,
  odometer_at_service INTEGER,
  cost REAL,
  vendor_name TEXT,
  next_service_due_date TEXT,
  next_service_due_km INTEGER,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS vehicle_maintenance_vehicle_id_idx ON vehicle_maintenance(vehicle_id);
CREATE INDEX IF NOT EXISTS vehicle_maintenance_service_date_idx ON vehicle_maintenance(service_date);

-- ── DRIVERS ───────────────────────────────────────────────────
CREATE TABLE drivers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  photo_url TEXT,
  license_number TEXT,
  license_expiry TEXT,
  address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  status TEXT DEFAULT 'active',
  rating REAL DEFAULT 0,
  total_trips INTEGER DEFAULT 0,
  date_of_joining TEXT,
  notes TEXT,
  is_deleted INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS drivers_tenant_id_idx ON drivers(tenant_id);
CREATE INDEX IF NOT EXISTS drivers_phone_idx ON drivers(phone);
CREATE INDEX IF NOT EXISTS drivers_status_idx ON drivers(status);
CREATE INDEX IF NOT EXISTS drivers_is_deleted_idx ON drivers(is_deleted);
CREATE INDEX IF NOT EXISTS drivers_created_by_idx ON drivers(created_by);

-- ── DRIVER DOCUMENTS ──────────────────────────────────────────
CREATE TABLE driver_documents (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  document_number TEXT,
  file_url TEXT,
  file_name TEXT,
  expiry_date TEXT,
  issued_date TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS driver_documents_driver_id_idx ON driver_documents(driver_id);
CREATE INDEX IF NOT EXISTS driver_documents_type_idx ON driver_documents(type);
CREATE INDEX IF NOT EXISTS driver_documents_expiry_date_idx ON driver_documents(expiry_date);
CREATE INDEX IF NOT EXISTS driver_documents_is_active_idx ON driver_documents(is_active);

-- ── DRIVER RATINGS ────────────────────────────────────────────
CREATE TABLE driver_ratings (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  trip_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comments TEXT,
  rated_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS driver_ratings_driver_id_idx ON driver_ratings(driver_id);
CREATE INDEX IF NOT EXISTS driver_ratings_trip_id_idx ON driver_ratings(trip_id);

-- ── TRIP ASSIGNMENTS ──────────────────────────────────────────
CREATE TABLE trip_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  lead_id TEXT REFERENCES leads(id),
  vehicle_id TEXT REFERENCES vehicles(id),
  driver_id TEXT REFERENCES drivers(id),
  pickup_location TEXT,
  drop_location TEXT,
  pickup_datetime TEXT,
  drop_datetime TEXT,
  status TEXT DEFAULT 'assigned',
  passenger_name TEXT,
  passenger_phone TEXT,
  special_instructions TEXT,
  assigned_by TEXT REFERENCES users(id),
  accepted_at TEXT,
  en_route_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  is_deleted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS trip_assignments_tenant_id_idx ON trip_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS trip_assignments_lead_id_idx ON trip_assignments(lead_id);
CREATE INDEX IF NOT EXISTS trip_assignments_vehicle_id_idx ON trip_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS trip_assignments_driver_id_idx ON trip_assignments(driver_id);
CREATE INDEX IF NOT EXISTS trip_assignments_status_idx ON trip_assignments(status);
CREATE INDEX IF NOT EXISTS trip_assignments_pickup_datetime_idx ON trip_assignments(pickup_datetime);
CREATE INDEX IF NOT EXISTS trip_assignments_is_deleted_idx ON trip_assignments(is_deleted);

-- ── TRIP COSTS ────────────────────────────────────────────────
CREATE TABLE trip_costs (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trip_assignments(id) ON DELETE CASCADE,
  cost_type TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  receipt_url TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS trip_costs_trip_id_idx ON trip_costs(trip_id);
CREATE INDEX IF NOT EXISTS trip_costs_cost_type_idx ON trip_costs(cost_type);

-- ── TRIP TIMELINE ─────────────────────────────────────────────
CREATE TABLE trip_timeline (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trip_assignments(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_by TEXT REFERENCES users(id),
  latitude REAL,
  longitude REAL,
  notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS trip_timeline_trip_id_idx ON trip_timeline(trip_id);
CREATE INDEX IF NOT EXISTS trip_timeline_status_idx ON trip_timeline(status);

-- ── REMINDER LOG ──────────────────────────────────────────────
CREATE TABLE reminder_log (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  sent_date TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS reminder_log_entity_idx ON reminder_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS reminder_log_sent_date_idx ON reminder_log(sent_date);
