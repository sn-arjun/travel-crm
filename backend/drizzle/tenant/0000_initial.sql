-- ============================================================
-- Tenant D1 — Initial Schema
-- Incremental migrations (0001+) build on top of this.
-- NOTE: contacts.is_deleted added in 0001, leads.is_deleted in 0003.
-- ============================================================

-- ── Users & Auth ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL, -- admin, sales_manager, salesperson, operations, accountant, view_only
  avatar_url TEXT,
  department TEXT,
  language TEXT DEFAULT 'en',
  is_active INTEGER DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE INDEX IF NOT EXISTS users_is_active_idx ON users(is_active);

-- ── Contacts ────────────────────────────────────────────────
-- NOTE: is_deleted column added in migration 0001

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  type TEXT NOT NULL, -- customer, supplier, agent, partner
  address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  postal_code TEXT,
  tags TEXT,          -- JSON array
  notes TEXT,
  source TEXT,        -- manual, website, referral, ad, facebook, google
  birthday TEXT,
  anniversary TEXT,
  preferred_language TEXT DEFAULT 'en',
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS contacts_type_idx ON contacts(type);
CREATE INDEX IF NOT EXISTS contacts_city_idx ON contacts(city);
CREATE INDEX IF NOT EXISTS contacts_country_idx ON contacts(country);
CREATE INDEX IF NOT EXISTS contacts_source_idx ON contacts(source);
CREATE INDEX IF NOT EXISTS contacts_created_by_idx ON contacts(created_by);
CREATE INDEX IF NOT EXISTS contacts_created_at_idx ON contacts(created_at);

-- ── Suppliers ────────────────────────────────────────────────
-- Created before itinerary_items and payments (they FK to suppliers)

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  category TEXT, -- hotel, transport, airline, activity, guide, visa_agent, insurance
  gst_number TEXT,
  pan_number TEXT,
  bank_details TEXT, -- JSON
  rating REAL,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS suppliers_category_idx ON suppliers(category);
CREATE INDEX IF NOT EXISTS suppliers_city_idx ON suppliers(city);
CREATE INDEX IF NOT EXISTS suppliers_is_active_idx ON suppliers(is_active);

-- ── Leads ───────────────────────────────────────────────────
-- NOTE: is_deleted column added in migration 0003

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  title TEXT NOT NULL,
  destination TEXT,   -- JSON array as text
  travel_date TEXT,
  return_date TEXT,
  pax_adults INTEGER DEFAULT 1,
  pax_children INTEGER DEFAULT 0,
  pax_infants INTEGER DEFAULT 0,
  budget REAL,
  currency TEXT DEFAULT 'INR',
  trip_type TEXT,     -- domestic, international, honeymoon, family, group, corporate, adventure, pilgrimage
  source TEXT,        -- manual, website, facebook, google, referral, walkin
  status TEXT NOT NULL DEFAULT 'new', -- new, contacted, requirement_gathered, proposal_sent, negotiation, booking_confirmed, completed, lost
  priority TEXT DEFAULT 'warm',       -- hot, warm, cold
  assigned_to TEXT REFERENCES users(id),
  lost_reason TEXT,
  passport_available INTEGER DEFAULT 0,
  travel_class TEXT,  -- economy, premium_economy, business, first
  hotel_preference TEXT, -- budget, standard, premium, luxury
  meal_preference TEXT,  -- veg, non_veg, vegan, jain, halal
  special_requirements TEXT,
  notes TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS leads_contact_id_idx ON leads(contact_id);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
CREATE INDEX IF NOT EXISTS leads_priority_idx ON leads(priority);
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS leads_source_idx ON leads(source);
CREATE INDEX IF NOT EXISTS leads_destination_idx ON leads(destination);
CREATE INDEX IF NOT EXISTS leads_travel_date_idx ON leads(travel_date);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads(created_at);
CREATE INDEX IF NOT EXISTS leads_created_by_idx ON leads(created_by);

-- ── Lead Activities ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lead_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  type TEXT NOT NULL, -- note, call, email, whatsapp, sms, status_change, assignment, follow_up
  content TEXT,
  metadata TEXT,      -- JSON (old_status, new_status, etc.)
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS lead_activities_lead_id_idx ON lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS lead_activities_type_idx ON lead_activities(type);
CREATE INDEX IF NOT EXISTS lead_activities_created_at_idx ON lead_activities(created_at);

-- ── Follow-Ups ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  scheduled_at TEXT NOT NULL,
  type TEXT NOT NULL, -- call, email, whatsapp, visit
  notes TEXT,
  outcome TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, missed
  completed_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS follow_ups_lead_id_idx ON follow_ups(lead_id);
CREATE INDEX IF NOT EXISTS follow_ups_scheduled_at_idx ON follow_ups(scheduled_at);
CREATE INDEX IF NOT EXISTS follow_ups_status_idx ON follow_ups(status);
CREATE INDEX IF NOT EXISTS follow_ups_created_by_idx ON follow_ups(created_by);

-- ── Itineraries ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS itineraries (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  title TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'draft', -- draft, sent, approved, rejected
  inclusions TEXT,
  exclusions TEXT,
  terms_and_conditions TEXT,
  valid_until TEXT,
  total_cost REAL DEFAULT 0,
  total_selling_price REAL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  markup_type TEXT,  -- percentage, fixed
  markup_value REAL,
  is_template INTEGER DEFAULT 0,
  template_name TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS itineraries_lead_id_idx ON itineraries(lead_id);
CREATE INDEX IF NOT EXISTS itineraries_status_idx ON itineraries(status);
CREATE INDEX IF NOT EXISTS itineraries_is_template_idx ON itineraries(is_template);

CREATE TABLE IF NOT EXISTS itinerary_days (
  id TEXT PRIMARY KEY,
  itinerary_id TEXT NOT NULL REFERENCES itineraries(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,
  title TEXT,
  description TEXT,
  city TEXT,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS itinerary_days_itinerary_id_idx ON itinerary_days(itinerary_id);

CREATE TABLE IF NOT EXISTS itinerary_items (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- hotel, transport, activity, meal, flight, sightseeing
  title TEXT NOT NULL,
  description TEXT,
  supplier_id TEXT REFERENCES suppliers(id),
  cost REAL DEFAULT 0,
  selling_price REAL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  time_start TEXT,
  time_end TEXT,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS itinerary_items_day_id_idx ON itinerary_items(day_id);
CREATE INDEX IF NOT EXISTS itinerary_items_type_idx ON itinerary_items(type);
CREATE INDEX IF NOT EXISTS itinerary_items_supplier_id_idx ON itinerary_items(supplier_id);

-- ── Rate Cards ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_cards (
  id TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES suppliers(id),
  service_type TEXT NOT NULL, -- hotel, transport, activity, flight, meal, guide
  destination TEXT,
  name TEXT NOT NULL,
  description TEXT,
  season TEXT,        -- peak, off_peak, shoulder
  cost REAL NOT NULL,
  selling_price REAL,
  currency TEXT DEFAULT 'INR',
  unit TEXT,          -- per_person, per_room, per_vehicle, per_day
  valid_from TEXT,
  valid_to TEXT,
  child_price_percent REAL,
  group_discount_json TEXT, -- JSON: [{min_pax, discount_percent}]
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS rate_cards_supplier_id_idx ON rate_cards(supplier_id);
CREATE INDEX IF NOT EXISTS rate_cards_service_type_idx ON rate_cards(service_type);
CREATE INDEX IF NOT EXISTS rate_cards_destination_idx ON rate_cards(destination);
CREATE INDEX IF NOT EXISTS rate_cards_season_idx ON rate_cards(season);

-- ── Invoices ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES leads(id),
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  invoice_number TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'tax_invoice', -- tax_invoice, proforma, receipt, credit_note, debit_note
  subtotal REAL NOT NULL DEFAULT 0,
  discount_type TEXT,   -- percentage, fixed
  discount_value REAL,
  discount_amount REAL DEFAULT 0,
  taxable_amount REAL DEFAULT 0,
  tax_type TEXT,        -- gst, vat, none
  cgst REAL DEFAULT 0,
  sgst REAL DEFAULT 0,
  igst REAL DEFAULT 0,
  vat_amount REAL DEFAULT 0,
  total_tax REAL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'INR',
  status TEXT DEFAULT 'draft', -- draft, sent, paid, partially_paid, overdue, cancelled
  due_date TEXT,
  paid_amount REAL DEFAULT 0,
  balance_due REAL DEFAULT 0,
  notes TEXT,
  bank_details TEXT,    -- JSON
  payment_link TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_number_idx ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS invoices_lead_id_idx ON invoices(lead_id);
CREATE INDEX IF NOT EXISTS invoices_contact_id_idx ON invoices(contact_id);
CREATE INDEX IF NOT EXISTS invoices_type_idx ON invoices(type);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);
CREATE INDEX IF NOT EXISTS invoices_due_date_idx ON invoices(due_date);
CREATE INDEX IF NOT EXISTS invoices_created_at_idx ON invoices(created_at);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  hsn_code TEXT,
  quantity INTEGER DEFAULT 1,
  rate REAL NOT NULL,
  discount_percent REAL DEFAULT 0,
  taxable_amount REAL DEFAULT 0,
  tax_rate REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  amount REAL NOT NULL,
  sort_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON invoice_items(invoice_id);

-- ── Payments ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  invoice_id TEXT REFERENCES invoices(id),
  contact_id TEXT REFERENCES contacts(id),
  supplier_id TEXT REFERENCES suppliers(id),
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'INR',
  method TEXT,        -- cash, bank_transfer, upi, card, cheque, online
  reference TEXT,     -- transaction ID, cheque number
  type TEXT NOT NULL DEFAULT 'incoming', -- incoming, outgoing
  date TEXT NOT NULL,
  notes TEXT,
  receipt_url TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS payments_invoice_id_idx ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS payments_contact_id_idx ON payments(contact_id);
CREATE INDEX IF NOT EXISTS payments_supplier_id_idx ON payments(supplier_id);
CREATE INDEX IF NOT EXISTS payments_type_idx ON payments(type);
CREATE INDEX IF NOT EXISTS payments_date_idx ON payments(date);

-- ── Vouchers ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vouchers (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id),
  type TEXT NOT NULL, -- hotel, transport, flight, activity
  supplier_id TEXT REFERENCES suppliers(id),
  details_json TEXT,  -- type-specific JSON
  status TEXT DEFAULT 'draft', -- draft, sent, confirmed
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS vouchers_lead_id_idx ON vouchers(lead_id);
CREATE INDEX IF NOT EXISTS vouchers_type_idx ON vouchers(type);
CREATE INDEX IF NOT EXISTS vouchers_status_idx ON vouchers(status);

-- ── Travellers ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS travellers (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth TEXT,
  gender TEXT,        -- male, female, other
  nationality TEXT,
  passport_number TEXT,
  passport_expiry TEXT,
  passport_issuing_country TEXT,
  frequent_flyer_number TEXT,
  meal_preference TEXT,
  seat_preference TEXT,
  medical_notes TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS travellers_contact_id_idx ON travellers(contact_id);
CREATE INDEX IF NOT EXISTS travellers_passport_expiry_idx ON travellers(passport_expiry);

CREATE TABLE IF NOT EXISTS visa_applications (
  id TEXT PRIMARY KEY,
  traveller_id TEXT NOT NULL REFERENCES travellers(id),
  lead_id TEXT REFERENCES leads(id),
  country TEXT NOT NULL,
  visa_type TEXT,     -- tourist, business, transit, student
  status TEXT DEFAULT 'not_started', -- not_started, documents_collecting, applied, processing, approved, rejected
  applied_date TEXT,
  result_date TEXT,
  expiry_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS visa_apps_traveller_id_idx ON visa_applications(traveller_id);
CREATE INDEX IF NOT EXISTS visa_apps_lead_id_idx ON visa_applications(lead_id);
CREATE INDEX IF NOT EXISTS visa_apps_status_idx ON visa_applications(status);
CREATE INDEX IF NOT EXISTS visa_apps_country_idx ON visa_applications(country);

CREATE TABLE IF NOT EXISTS visa_checklist_items (
  id TEXT PRIMARY KEY,
  visa_application_id TEXT NOT NULL REFERENCES visa_applications(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  is_received INTEGER DEFAULT 0,
  received_date TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS visa_checklist_visa_app_id_idx ON visa_checklist_items(visa_application_id);

-- ── Communications ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_templates (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,  -- whatsapp, sms, email
  name TEXT NOT NULL,
  subject TEXT,
  content TEXT NOT NULL,
  variables TEXT,     -- JSON array of variable names
  category TEXT,      -- greeting, follow_up, quotation, booking, reminder, wish, offer, visa
  language TEXT DEFAULT 'en',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS msg_templates_channel_idx ON message_templates(channel);
CREATE INDEX IF NOT EXISTS msg_templates_category_idx ON message_templates(category);

CREATE TABLE IF NOT EXISTS message_log (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id),
  lead_id TEXT REFERENCES leads(id),
  channel TEXT NOT NULL,
  template_id TEXT REFERENCES message_templates(id),
  subject TEXT,
  content TEXT,
  status TEXT DEFAULT 'queued', -- queued, sent, delivered, read, failed
  external_id TEXT,
  error_message TEXT,
  sent_by TEXT REFERENCES users(id),
  sent_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS msg_log_contact_id_idx ON message_log(contact_id);
CREATE INDEX IF NOT EXISTS msg_log_lead_id_idx ON message_log(lead_id);
CREATE INDEX IF NOT EXISTS msg_log_channel_idx ON message_log(channel);
CREATE INDEX IF NOT EXISTS msg_log_status_idx ON message_log(status);
CREATE INDEX IF NOT EXISTS msg_log_sent_at_idx ON message_log(sent_at);

-- ── Tasks ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT REFERENCES users(id),
  assigned_by TEXT REFERENCES users(id),
  due_date TEXT,
  priority TEXT DEFAULT 'medium', -- low, medium, high, urgent
  status TEXT DEFAULT 'todo',     -- todo, in_progress, done
  category TEXT, -- follow_up, voucher_creation, payment_collection, document_collection, visa_processing, general
  related_lead_id TEXT REFERENCES leads(id),
  parent_task_id TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks(due_date);
CREATE INDEX IF NOT EXISTS tasks_priority_idx ON tasks(priority);
CREATE INDEX IF NOT EXISTS tasks_related_lead_id_idx ON tasks(related_lead_id);

-- ── Events / Planner ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  all_day INTEGER DEFAULT 0,
  type TEXT,          -- trip, meeting, follow_up, deadline, reminder, holiday
  color TEXT,
  related_id TEXT,
  related_type TEXT,  -- lead, task, contact
  assigned_to TEXT REFERENCES users(id),
  is_recurring INTEGER DEFAULT 0,
  recurrence_rule TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS events_start_date_idx ON events(start_date);
CREATE INDEX IF NOT EXISTS events_type_idx ON events(type);
CREATE INDEX IF NOT EXISTS events_assigned_to_idx ON events(assigned_to);

-- ── Fleet ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  registration_no TEXT NOT NULL,
  type TEXT NOT NULL, -- sedan, suv, muv, tempo_traveller, mini_bus, bus, luxury_coach
  make TEXT,
  model TEXT,
  year INTEGER,
  capacity INTEGER,
  color TEXT,
  photo_url TEXT,
  status TEXT DEFAULT 'available', -- available, on_trip, maintenance, out_of_service
  insurance_expiry TEXT,
  permit_expiry TEXT,
  pollution_expiry TEXT,
  fitness_expiry TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_reg_no_idx ON vehicles(registration_no);
CREATE INDEX IF NOT EXISTS vehicles_type_idx ON vehicles(type);
CREATE INDEX IF NOT EXISTS vehicles_status_idx ON vehicles(status);

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  photo_url TEXT,
  license_number TEXT,
  license_expiry TEXT,
  address TEXT,
  status TEXT DEFAULT 'active', -- active, on_trip, off_duty, on_leave
  rating REAL,
  total_trips INTEGER DEFAULT 0,
  password_hash TEXT,
  current_location_lat REAL,
  current_location_lng REAL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS drivers_status_idx ON drivers(status);
CREATE INDEX IF NOT EXISTS drivers_phone_idx ON drivers(phone);

CREATE TABLE IF NOT EXISTS trip_assignments (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES leads(id),
  vehicle_id TEXT REFERENCES vehicles(id),
  driver_id TEXT REFERENCES drivers(id),
  pickup_location TEXT,
  pickup_lat REAL,
  pickup_lng REAL,
  drop_location TEXT,
  drop_lat REAL,
  drop_lng REAL,
  start_time TEXT,
  end_time TEXT,
  status TEXT DEFAULT 'assigned', -- assigned, accepted, rejected, en_route, started, completed, cancelled
  check_in_time TEXT,
  check_in_lat REAL,
  check_in_lng REAL,
  check_in_photo_url TEXT,
  check_out_time TEXT,
  check_out_lat REAL,
  check_out_lng REAL,
  check_out_photo_url TEXT,
  reject_reason TEXT,
  fuel_cost REAL,
  toll_cost REAL,
  driver_allowance REAL,
  parking_cost REAL,
  special_instructions TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS trip_assignments_lead_id_idx ON trip_assignments(lead_id);
CREATE INDEX IF NOT EXISTS trip_assignments_vehicle_id_idx ON trip_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS trip_assignments_driver_id_idx ON trip_assignments(driver_id);
CREATE INDEX IF NOT EXISTS trip_assignments_status_idx ON trip_assignments(status);
CREATE INDEX IF NOT EXISTS trip_assignments_start_time_idx ON trip_assignments(start_time);

-- ── Utilities ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL, -- lead, contact, invoice, itinerary
  reference_id TEXT NOT NULL,
  title TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS bookmarks_user_id_idx ON bookmarks(user_id);

CREATE TABLE IF NOT EXISTS sticky_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  content TEXT,
  color TEXT DEFAULT '#FFFDE7',
  position_x REAL DEFAULT 0,
  position_y REAL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS sticky_notes_user_id_idx ON sticky_notes(user_id);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  type TEXT,          -- passport, visa, id, contract, invoice, voucher, photo, other
  related_to TEXT,    -- contact, lead, traveller, supplier, visa_application
  related_id TEXT,
  uploaded_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS documents_related_idx ON documents(related_to, related_id);
CREATE INDEX IF NOT EXISTS documents_type_idx ON documents(type);
CREATE INDEX IF NOT EXISTS documents_uploaded_by_idx ON documents(uploaded_by);

-- ── Notifications & Push ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT,
  type TEXT,          -- lead_assigned, follow_up_reminder, payment_received, task_assigned, birthday, system
  reference_type TEXT, -- lead, contact, invoice, task
  reference_id TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_is_read_idx ON notifications(is_read);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at);

CREATE TABLE IF NOT EXISTS push_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  fcm_token TEXT NOT NULL,
  device_type TEXT,   -- android, ios, web
  device_name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS push_tokens_user_id_idx ON push_tokens(user_id);
CREATE INDEX IF NOT EXISTS push_tokens_is_active_idx ON push_tokens(is_active);

-- ── Report Snapshots ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS report_snapshots (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL,
  filters_json TEXT,
  data_json TEXT,
  generated_by TEXT REFERENCES users(id),
  generated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS report_snapshots_type_idx ON report_snapshots(report_type);
CREATE INDEX IF NOT EXISTS report_snapshots_generated_at_idx ON report_snapshots(generated_at);

-- ── Activity Logs ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL, -- login, logout, create, update, delete, export, import, send_message
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,         -- JSON
  ip_address TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS activity_logs_user_id_idx ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS activity_logs_entity_type_idx ON activity_logs(entity_type);
CREATE INDEX IF NOT EXISTS activity_logs_entity_id_idx ON activity_logs(entity_id);
CREATE INDEX IF NOT EXISTS activity_logs_action_idx ON activity_logs(action);
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs(created_at);

-- ── Login History ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS login_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  ip_address TEXT,
  country TEXT,
  city TEXT,
  browser TEXT,
  os TEXT,
  device TEXT,
  user_agent TEXT,
  status TEXT NOT NULL, -- success, failed, locked
  failure_reason TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS login_history_user_id_idx ON login_history(user_id);
CREATE INDEX IF NOT EXISTS login_history_status_idx ON login_history(status);
CREATE INDEX IF NOT EXISTS login_history_created_at_idx ON login_history(created_at);
CREATE INDEX IF NOT EXISTS login_history_ip_idx ON login_history(ip_address);

-- ── Settings (Key-Value) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
