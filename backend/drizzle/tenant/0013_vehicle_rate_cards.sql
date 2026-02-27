-- Migration: Vehicle Rate Cards + Trip Costing (M20)
-- New table: vehicle_rate_cards
-- Alter: trip_assignments (add trip type, costing, lat/lng, linked invoice/voucher)

-- ── VEHICLE RATE CARDS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_rate_cards (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  trip_type TEXT NOT NULL,
  base_fare REAL NOT NULL DEFAULT 0,
  per_km_rate REAL DEFAULT 0,
  per_hour_rate REAL DEFAULT 0,
  min_km REAL DEFAULT 0,
  min_hours REAL DEFAULT 0,
  night_charge REAL DEFAULT 0,
  driver_allowance REAL DEFAULT 0,
  flat_rate REAL,
  extra_km_rate REAL DEFAULT 0,
  extra_hour_rate REAL DEFAULT 0,
  toll_included INTEGER DEFAULT 0,
  parking_included INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  valid_from TEXT,
  valid_to TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_vrc_tenant ON vehicle_rate_cards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vrc_vehicle_type ON vehicle_rate_cards(vehicle_type);
CREATE INDEX IF NOT EXISTS idx_vrc_trip_type ON vehicle_rate_cards(trip_type);
CREATE INDEX IF NOT EXISTS idx_vrc_type_combo ON vehicle_rate_cards(vehicle_type, trip_type);
CREATE INDEX IF NOT EXISTS idx_vrc_is_active ON vehicle_rate_cards(is_active);
CREATE INDEX IF NOT EXISTS idx_vrc_is_deleted ON vehicle_rate_cards(is_deleted);

-- ── EXTEND TRIP ASSIGNMENTS WITH COSTING + LAT/LNG + LINKS ───
ALTER TABLE trip_assignments ADD COLUMN trip_type TEXT DEFAULT 'one_way';
ALTER TABLE trip_assignments ADD COLUMN rate_card_id TEXT REFERENCES vehicle_rate_cards(id);
ALTER TABLE trip_assignments ADD COLUMN estimated_distance_km REAL;
ALTER TABLE trip_assignments ADD COLUMN estimated_duration_min REAL;
ALTER TABLE trip_assignments ADD COLUMN estimated_cost REAL;
ALTER TABLE trip_assignments ADD COLUMN estimated_breakdown TEXT;
ALTER TABLE trip_assignments ADD COLUMN actual_distance_km REAL;
ALTER TABLE trip_assignments ADD COLUMN actual_duration_min REAL;
ALTER TABLE trip_assignments ADD COLUMN actual_cost REAL;
ALTER TABLE trip_assignments ADD COLUMN actual_breakdown TEXT;
ALTER TABLE trip_assignments ADD COLUMN cost_override REAL;
ALTER TABLE trip_assignments ADD COLUMN cost_override_reason TEXT;
ALTER TABLE trip_assignments ADD COLUMN pickup_lat REAL;
ALTER TABLE trip_assignments ADD COLUMN pickup_lng REAL;
ALTER TABLE trip_assignments ADD COLUMN drop_lat REAL;
ALTER TABLE trip_assignments ADD COLUMN drop_lng REAL;
ALTER TABLE trip_assignments ADD COLUMN contact_id TEXT REFERENCES contacts(id);
ALTER TABLE trip_assignments ADD COLUMN invoice_id TEXT REFERENCES invoices(id);
ALTER TABLE trip_assignments ADD COLUMN voucher_id TEXT REFERENCES vouchers(id);
