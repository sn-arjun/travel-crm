-- Milestone 6: Itinerary & Quotation Builder schema upgrade
-- This migration handles the enhanced itinerary tables for M6

-- ============================================================
-- Drop and recreate itineraries with enhanced schema
-- ============================================================

-- Create new itineraries table
CREATE TABLE IF NOT EXISTS itineraries_new (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  parent_id TEXT,
  status TEXT DEFAULT 'draft',
  validity_date TEXT,
  notes TEXT,
  inclusions TEXT,
  exclusions TEXT,
  terms_conditions TEXT,
  currency TEXT DEFAULT 'INR',
  total_cost REAL DEFAULT 0,
  total_selling REAL DEFAULT 0,
  total_tax REAL DEFAULT 0,
  grand_total REAL DEFAULT 0,
  markup_type TEXT,
  markup_value REAL,
  share_token TEXT,
  share_link_active INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  last_viewed_at TEXT,
  is_deleted INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Migrate existing data
INSERT INTO itineraries_new (id, lead_id, title, version, status, inclusions, exclusions, terms_conditions, validity_date, total_cost, total_selling, currency, markup_type, markup_value, created_by, created_at, updated_at)
SELECT id, lead_id, title, version, status, inclusions, exclusions, terms_and_conditions, valid_until, total_cost, COALESCE(total_selling_price, 0), currency, markup_type, markup_value, created_by, created_at, updated_at
FROM itineraries;

-- Drop old and rename
DROP TABLE IF EXISTS itinerary_items;
DROP TABLE IF EXISTS itinerary_days;
DROP TABLE IF EXISTS itineraries;
ALTER TABLE itineraries_new RENAME TO itineraries;

CREATE INDEX itineraries_lead_id_idx ON itineraries(lead_id);
CREATE INDEX itineraries_status_idx ON itineraries(status);
CREATE INDEX itineraries_created_by_idx ON itineraries(created_by);
CREATE INDEX itineraries_parent_id_idx ON itineraries(parent_id);
CREATE INDEX itineraries_share_token_idx ON itineraries(share_token);
CREATE INDEX itineraries_is_deleted_idx ON itineraries(is_deleted);

-- ============================================================
-- Recreate itinerary_days with enhanced schema
-- ============================================================

CREATE TABLE itinerary_days (
  id TEXT PRIMARY KEY,
  itinerary_id TEXT NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  title TEXT,
  description TEXT,
  city TEXT,
  overnight_city TEXT,
  images TEXT,
  is_free_day INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX itinerary_days_itinerary_id_idx ON itinerary_days(itinerary_id);

-- ============================================================
-- Recreate itinerary_items with enhanced schema
-- ============================================================

CREATE TABLE itinerary_items (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  supplier_id TEXT,
  rate_card_id TEXT,
  cost_price REAL DEFAULT 0,
  selling_price REAL DEFAULT 0,
  markup_type TEXT,
  markup_value REAL,
  tax_rate REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  pax_type TEXT,
  time_start TEXT,
  time_end TEXT,
  sort_order INTEGER DEFAULT 0,
  details_json TEXT,
  internal_notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX itinerary_items_day_id_idx ON itinerary_items(day_id);
CREATE INDEX itinerary_items_type_idx ON itinerary_items(type);

-- ============================================================
-- Itinerary Templates (new table)
-- ============================================================

CREATE TABLE IF NOT EXISTS itinerary_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  destination TEXT,
  duration_days INTEGER,
  category TEXT,
  template_data TEXT,
  is_system INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX itinerary_templates_destination_idx ON itinerary_templates(destination);
CREATE INDEX itinerary_templates_category_idx ON itinerary_templates(category);

-- ============================================================
-- Enhanced rate_cards (add missing columns)
-- ============================================================

-- Create enhanced rate_cards table
CREATE TABLE IF NOT EXISTS rate_cards_new (
  id TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES suppliers(id),
  service_type TEXT NOT NULL,
  destination TEXT,
  name TEXT NOT NULL,
  description TEXT,
  season TEXT,
  cost_price REAL NOT NULL,
  selling_price REAL,
  currency TEXT DEFAULT 'INR',
  unit TEXT,
  valid_from TEXT,
  valid_to TEXT,
  child_price_percent REAL,
  group_discount_json TEXT,
  details_json TEXT,
  is_active INTEGER DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Migrate existing rate_cards data
INSERT INTO rate_cards_new (id, supplier_id, service_type, destination, name, description, season, cost_price, selling_price, currency, unit, valid_from, valid_to, child_price_percent, group_discount_json, created_at, updated_at)
SELECT id, supplier_id, service_type, destination, name, description, season, cost, selling_price, currency, unit, valid_from, valid_to, child_price_percent, group_discount_json, created_at, updated_at
FROM rate_cards;

DROP TABLE IF EXISTS rate_cards;
ALTER TABLE rate_cards_new RENAME TO rate_cards;

CREATE INDEX rate_cards_supplier_id_idx ON rate_cards(supplier_id);
CREATE INDEX rate_cards_service_type_idx ON rate_cards(service_type);
CREATE INDEX rate_cards_destination_idx ON rate_cards(destination);
CREATE INDEX rate_cards_season_idx ON rate_cards(season);
CREATE INDEX rate_cards_is_active_idx ON rate_cards(is_active);
