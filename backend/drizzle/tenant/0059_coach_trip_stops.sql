-- R145: coach trips with ordered stops and passenger check-in (docs/readiness/TOUR-OPERATOR-DESIGN.md section 3.3).
--
-- A trip_assignments row stays one vehicle with one driver. A coach trip (trip_kind = 'coach') additionally carries an ordered list of
-- stops (trip_stops) and the passengers boarding at them (trip_passengers), each with a boarded / no-show tick and a documents-checked
-- mark. A trip made from a departure remembers it (departure_id); its stops and passengers are copies, so editing the trip never
-- changes the departure.
--
-- A tour leader is a driver row with crew_role 'tour_leader' (or 'both'). drivers.user_id optionally links the crew member to a
-- staff user, so the desktop can show "my trips".

ALTER TABLE trip_assignments ADD COLUMN departure_id TEXT REFERENCES departures(id);
ALTER TABLE trip_assignments ADD COLUMN trip_kind TEXT NOT NULL DEFAULT 'transfer' CHECK (trip_kind IN ('transfer', 'coach'));
ALTER TABLE trip_assignments ADD COLUMN tour_leader_id TEXT REFERENCES drivers(id);
CREATE INDEX IF NOT EXISTS trip_assignments_departure_idx ON trip_assignments(departure_id);
CREATE INDEX IF NOT EXISTS trip_assignments_tour_leader_idx ON trip_assignments(tour_leader_id);
CREATE INDEX IF NOT EXISTS trip_assignments_kind_idx ON trip_assignments(trip_kind);

ALTER TABLE drivers ADD COLUMN crew_role TEXT NOT NULL DEFAULT 'driver' CHECK (crew_role IN ('driver', 'tour_leader', 'both'));
ALTER TABLE drivers ADD COLUMN user_id TEXT REFERENCES users(id);
CREATE INDEX IF NOT EXISTS drivers_crew_role_idx ON drivers(crew_role);
CREATE INDEX IF NOT EXISTS drivers_user_id_idx ON drivers(user_id);

CREATE TABLE IF NOT EXISTS trip_stops (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trip_assignments(id) ON DELETE CASCADE,
  departure_stop_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  address TEXT,
  lat REAL,
  lng REAL,
  scheduled_at TEXT,
  documents_check INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'arrived', 'departed', 'skipped')),
  arrived_at TEXT,
  departed_at TEXT,
  arrived_lat REAL,
  arrived_lng REAL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS trip_stops_trip_idx ON trip_stops(trip_id, sort_order);

CREATE TABLE IF NOT EXISTS trip_passengers (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trip_assignments(id) ON DELETE CASCADE,
  trip_stop_id TEXT REFERENCES trip_stops(id) ON DELETE SET NULL,
  seat_passenger_id TEXT REFERENCES seat_passengers(id) ON DELETE SET NULL,
  contact_id TEXT REFERENCES contacts(id),
  name TEXT NOT NULL,
  phone TEXT,
  seats INTEGER NOT NULL DEFAULT 1,
  boarding_status TEXT NOT NULL DEFAULT 'pending' CHECK (boarding_status IN ('pending', 'boarded', 'no_show')),
  boarded_at TEXT,
  marked_by_driver_id TEXT,
  marked_by_user_id TEXT,
  documents_checked INTEGER NOT NULL DEFAULT 0,
  documents_checked_at TEXT,
  last_op_id TEXT,
  -- Time (the app's clock) of the tick last applied to each part; an older tick that arrives later is ignored.
  boarding_op_at TEXT,
  documents_op_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS trip_passengers_trip_idx ON trip_passengers(trip_id, trip_stop_id);
CREATE INDEX IF NOT EXISTS trip_passengers_stop_idx ON trip_passengers(trip_stop_id);
CREATE INDEX IF NOT EXISTS trip_passengers_seat_passenger_idx ON trip_passengers(seat_passenger_id);
CREATE INDEX IF NOT EXISTS trip_passengers_contact_idx ON trip_passengers(contact_id);
