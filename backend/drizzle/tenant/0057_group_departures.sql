-- R139: group departures, part 1 (docs/readiness/TOUR-OPERATOR-DESIGN.md section 3.1).
--
-- Every table of the fixed-departure domain is created here, so the later batches of the wave (seat bookings R143, screens R144,
-- manifest R146, public pages R148 and R150, departure messages R154) add behaviour and never another tenant migration for it.
-- Only the model, the tours and departures API and the calendar sync (R139) use these tables today.
--
-- A tour is the product, a departure is one dated run of it, a seat booking is one party's claim on seats of one departure
-- (always tied to a lead), and a seat passenger is one row of the manifest. "Extras" are the optional paid items of a tour; the
-- word add-on is taken by the platform's own add-on purchases.

CREATE TABLE IF NOT EXISTS tours (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  destination TEXT,
  itinerary_template_id TEXT REFERENCES itinerary_templates(id),
  duration_days INTEGER,
  currency TEXT,
  default_capacity INTEGER,
  booking_cutoff_days INTEGER,
  extras_cutoff_days INTEGER,
  hold_expiry_hours INTEGER,
  confirm_mode TEXT CHECK (confirm_mode IS NULL OR confirm_mode IN ('manual', 'auto_when_available', 'on_deposit')),
  deposit_type TEXT CHECK (deposit_type IS NULL OR deposit_type IN ('none', 'percent', 'per_seat', 'fixed')),
  deposit_value REAL,
  passenger_fields TEXT,
  room_types TEXT,
  terms TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS tours_code_idx ON tours(code);
CREATE INDEX IF NOT EXISTS tours_status_idx ON tours(status, is_deleted);
CREATE INDEX IF NOT EXISTS tours_template_idx ON tours(itinerary_template_id);

CREATE TABLE IF NOT EXISTS tour_stops (
  id TEXT PRIMARY KEY,
  tour_id TEXT NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  address TEXT,
  lat REAL,
  lng REAL,
  local_time TEXT,
  day_offset INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'pickup' CHECK (kind IN ('pickup', 'dropoff', 'both', 'waypoint')),
  documents_check INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS tour_stops_tour_idx ON tour_stops(tour_id, sort_order);

CREATE TABLE IF NOT EXISTS departures (
  id TEXT PRIMARY KEY,
  tour_id TEXT NOT NULL REFERENCES tours(id),
  code TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  start_time TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'departed', 'completed', 'cancelled')),
  capacity_mode TEXT NOT NULL DEFAULT 'manual' CHECK (capacity_mode IN ('vehicles', 'manual')),
  capacity INTEGER NOT NULL DEFAULT 0,
  booking_cutoff_date TEXT,
  extras_cutoff_date TEXT,
  hold_expiry_hours INTEGER,
  confirm_mode TEXT CHECK (confirm_mode IS NULL OR confirm_mode IN ('manual', 'auto_when_available', 'on_deposit')),
  show_seats_left TEXT CHECK (show_seats_left IS NULL OR show_seats_left IN ('always', 'below_threshold', 'never')),
  public_booking_enabled INTEGER NOT NULL DEFAULT 0,
  tour_leader_driver_id TEXT REFERENCES drivers(id),
  tour_leader_user_id TEXT REFERENCES users(id),
  calendar_event_id TEXT,
  notes TEXT,
  cancelled_reason TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  is_deleted INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS departures_code_idx ON departures(code);
CREATE INDEX IF NOT EXISTS departures_tour_start_idx ON departures(tour_id, start_date);
CREATE INDEX IF NOT EXISTS departures_status_start_idx ON departures(status, start_date);

CREATE TABLE IF NOT EXISTS departure_vehicles (
  id TEXT PRIMARY KEY,
  departure_id TEXT NOT NULL REFERENCES departures(id) ON DELETE CASCADE,
  vehicle_id TEXT REFERENCES vehicles(id),
  label TEXT,
  capacity INTEGER NOT NULL DEFAULT 0,
  driver_id TEXT REFERENCES drivers(id),
  seat_layout TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS departure_vehicles_departure_idx ON departure_vehicles(departure_id, sort_order);

CREATE TABLE IF NOT EXISTS departure_stops (
  id TEXT PRIMARY KEY,
  departure_id TEXT NOT NULL REFERENCES departures(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  address TEXT,
  lat REAL,
  lng REAL,
  local_time TEXT,
  day_offset INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'pickup' CHECK (kind IN ('pickup', 'dropoff', 'both', 'waypoint')),
  documents_check INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  scheduled_at TEXT
);
CREATE INDEX IF NOT EXISTS departure_stops_departure_idx ON departure_stops(departure_id, sort_order);

CREATE TABLE IF NOT EXISTS tour_prices (
  id TEXT PRIMARY KEY,
  tour_id TEXT NOT NULL REFERENCES tours(id) ON DELETE CASCADE,
  departure_id TEXT REFERENCES departures(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('age_band', 'room_supplement', 'seat_surcharge', 'other')),
  key TEXT NOT NULL,
  label TEXT,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tour_prices_tour_idx ON tour_prices(tour_id, departure_id);
CREATE INDEX IF NOT EXISTS tour_prices_departure_idx ON tour_prices(departure_id);

CREATE TABLE IF NOT EXISTS seat_bookings (
  id TEXT PRIMARY KEY,
  departure_id TEXT NOT NULL REFERENCES departures(id),
  lead_id TEXT NOT NULL REFERENCES leads(id),
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  itinerary_id TEXT,
  invoice_id TEXT,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'confirmed', 'waitlisted', 'cancelled', 'expired')),
  seats INTEGER NOT NULL DEFAULT 1,
  hold_expires_at TEXT,
  waitlist_position INTEGER,
  offered_at TEXT,
  confirmed_at TEXT,
  confirmed_by TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  source TEXT NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'public_page', 'quote_accept', 'assistant', 'import')),
  room_notes TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS seat_bookings_departure_status_idx ON seat_bookings(departure_id, status);
CREATE INDEX IF NOT EXISTS seat_bookings_lead_idx ON seat_bookings(lead_id);
CREATE INDEX IF NOT EXISTS seat_bookings_contact_idx ON seat_bookings(contact_id);
-- One active claim per lead and departure: a second request of the same party changes the first one.
CREATE UNIQUE INDEX IF NOT EXISTS seat_bookings_active_lead_idx ON seat_bookings(departure_id, lead_id) WHERE status IN ('held', 'confirmed', 'waitlisted');

CREATE TABLE IF NOT EXISTS seat_passengers (
  id TEXT PRIMARY KEY,
  seat_booking_id TEXT NOT NULL REFERENCES seat_bookings(id) ON DELETE CASCADE,
  departure_id TEXT NOT NULL REFERENCES departures(id),
  traveller_id TEXT REFERENCES travellers(id),
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  gender TEXT,
  date_of_birth TEXT,
  age_years INTEGER,
  band_key TEXT,
  pickup_stop_id TEXT REFERENCES departure_stops(id),
  room_type TEXT,
  share_ok INTEGER NOT NULL DEFAULT 0,
  share_gender INTEGER NOT NULL DEFAULT 0,
  room_group TEXT,
  seat_number TEXT,
  seat_surcharge REAL,
  meal_preference TEXT,
  documents_status TEXT NOT NULL DEFAULT 'unknown' CHECK (documents_status IN ('unknown', 'provided', 'checked', 'problem')),
  documents_checked_at TEXT,
  documents_checked_by_driver_id TEXT,
  documents_checked_by_user_id TEXT,
  extra_fields TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS seat_passengers_booking_idx ON seat_passengers(seat_booking_id);
CREATE INDEX IF NOT EXISTS seat_passengers_departure_idx ON seat_passengers(departure_id, status);
CREATE INDEX IF NOT EXISTS seat_passengers_traveller_idx ON seat_passengers(traveller_id);
CREATE INDEX IF NOT EXISTS seat_passengers_pickup_idx ON seat_passengers(pickup_stop_id);

CREATE TABLE IF NOT EXISTS tour_extras (
  id TEXT PRIMARY KEY,
  tour_id TEXT REFERENCES tours(id) ON DELETE CASCADE,
  departure_id TEXT REFERENCES departures(id) ON DELETE CASCADE,
  day_number INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL DEFAULT 0,
  currency TEXT,
  band_prices TEXT,
  rate_card_id TEXT REFERENCES rate_cards(id),
  supplier_id TEXT REFERENCES suppliers(id),
  capacity INTEGER,
  cutoff_hours_before INTEGER,
  refundable_until_hours INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS tour_extras_tour_idx ON tour_extras(tour_id, departure_id);
CREATE INDEX IF NOT EXISTS tour_extras_departure_idx ON tour_extras(departure_id);

CREATE TABLE IF NOT EXISTS passenger_extras (
  id TEXT PRIMARY KEY,
  seat_passenger_id TEXT NOT NULL REFERENCES seat_passengers(id) ON DELETE CASCADE,
  tour_extra_id TEXT NOT NULL REFERENCES tour_extras(id),
  departure_id TEXT NOT NULL REFERENCES departures(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'selected' CHECK (status IN ('selected', 'invoiced', 'paid', 'cancelled')),
  invoice_id TEXT,
  invoice_item_id TEXT,
  selected_via TEXT NOT NULL DEFAULT 'staff' CHECK (selected_via IN ('staff', 'self_service')),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS passenger_extras_passenger_idx ON passenger_extras(seat_passenger_id);
CREATE INDEX IF NOT EXISTS passenger_extras_extra_idx ON passenger_extras(tour_extra_id, status);
CREATE INDEX IF NOT EXISTS passenger_extras_departure_idx ON passenger_extras(departure_id);

CREATE TABLE IF NOT EXISTS departure_costs (
  id TEXT PRIMARY KEY,
  departure_id TEXT NOT NULL REFERENCES departures(id) ON DELETE CASCADE,
  supplier_id TEXT REFERENCES suppliers(id),
  description TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'per_departure' CHECK (kind IN ('per_departure', 'per_seat')),
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS departure_costs_departure_idx ON departure_costs(departure_id);

CREATE TABLE IF NOT EXISTS departure_message_rules (
  id TEXT PRIMARY KEY,
  tour_id TEXT REFERENCES tours(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  template_id TEXT REFERENCES message_templates(id),
  channel TEXT NOT NULL DEFAULT 'preferred' CHECK (channel IN ('preferred', 'whatsapp', 'email', 'sms')),
  fallback_channel TEXT CHECK (fallback_channel IS NULL OR fallback_channel IN ('whatsapp', 'email', 'sms')),
  anchor TEXT NOT NULL DEFAULT 'start' CHECK (anchor IN ('start', 'end', 'extras_cutoff')),
  offset_days INTEGER NOT NULL DEFAULT 0,
  local_time TEXT,
  audience TEXT NOT NULL DEFAULT 'confirmed' CHECK (audience IN ('confirmed', 'confirmed_and_held', 'waitlisted')),
  recipient TEXT NOT NULL DEFAULT 'booking_contact' CHECK (recipient IN ('booking_contact', 'each_passenger_with_contact')),
  purpose TEXT NOT NULL DEFAULT 'service' CHECK (purpose IN ('service', 'marketing')),
  mode TEXT NOT NULL DEFAULT 'suggest' CHECK (mode IN ('auto', 'suggest')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS departure_message_rules_tour_idx ON departure_message_rules(tour_id, is_active);

CREATE TABLE IF NOT EXISTS departure_message_sends (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES departure_message_rules(id) ON DELETE CASCADE,
  departure_id TEXT NOT NULL REFERENCES departures(id) ON DELETE CASCADE,
  seat_booking_id TEXT NOT NULL REFERENCES seat_bookings(id),
  seat_passenger_id TEXT REFERENCES seat_passengers(id),
  contact_id TEXT REFERENCES contacts(id),
  message_log_id TEXT,
  suggestion_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'suggested', 'skipped_opt_out', 'skipped_cap', 'skipped_no_address', 'failed')),
  detail TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
-- A message goes out once per rule, departure, booking and passenger.
CREATE UNIQUE INDEX IF NOT EXISTS departure_message_sends_key_idx ON departure_message_sends(rule_id, departure_id, seat_booking_id, IFNULL(seat_passenger_id, ''));
CREATE INDEX IF NOT EXISTS departure_message_sends_departure_idx ON departure_message_sends(departure_id);
CREATE INDEX IF NOT EXISTS departure_message_sends_contact_idx ON departure_message_sends(contact_id);

-- Columns added to existing tables: the quote and the enquiry know their departure, the calendar event knows its departure.
ALTER TABLE itineraries ADD COLUMN departure_id TEXT REFERENCES departures(id);
ALTER TABLE itineraries ADD COLUMN seats_requested INTEGER;
ALTER TABLE leads ADD COLUMN departure_id TEXT REFERENCES departures(id);
ALTER TABLE events ADD COLUMN related_departure_id TEXT;
CREATE INDEX IF NOT EXISTS itineraries_departure_idx ON itineraries(departure_id);
CREATE INDEX IF NOT EXISTS leads_departure_idx ON leads(departure_id);
CREATE INDEX IF NOT EXISTS events_related_departure_idx ON events(related_departure_id);
