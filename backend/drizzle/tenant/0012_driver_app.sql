-- Migration: Driver App tables (M19)
-- Tables: driver_refresh_tokens, driver_otp_log, driver_push_tokens
-- Alter: trip_assignments (add check-in/check-out columns)
-- Alter: trip_timeline (add changed_by_driver column)

-- ── DRIVER REFRESH TOKENS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_refresh_tokens (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  device_info TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_driver_refresh_tokens_driver_id ON driver_refresh_tokens(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_refresh_tokens_expires_at ON driver_refresh_tokens(expires_at);

-- ── DRIVER OTP LOG ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_otp_log (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  ip_address TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_driver_otp_log_phone ON driver_otp_log(phone);
CREATE INDEX IF NOT EXISTS idx_driver_otp_log_created_at ON driver_otp_log(created_at);

-- ── DRIVER PUSH TOKENS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_push_tokens (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL,
  platform TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_driver_push_tokens_driver_id ON driver_push_tokens(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_push_tokens_fcm_token ON driver_push_tokens(fcm_token);
CREATE INDEX IF NOT EXISTS idx_driver_push_tokens_is_active ON driver_push_tokens(is_active);

-- ── ALTER TRIP ASSIGNMENTS (add check-in/check-out fields) ──
ALTER TABLE trip_assignments ADD COLUMN check_in_at TEXT;
ALTER TABLE trip_assignments ADD COLUMN check_in_lat REAL;
ALTER TABLE trip_assignments ADD COLUMN check_in_lng REAL;
ALTER TABLE trip_assignments ADD COLUMN check_in_photo_url TEXT;
ALTER TABLE trip_assignments ADD COLUMN check_out_at TEXT;
ALTER TABLE trip_assignments ADD COLUMN check_out_lat REAL;
ALTER TABLE trip_assignments ADD COLUMN check_out_lng REAL;
ALTER TABLE trip_assignments ADD COLUMN check_out_photo_url TEXT;

-- ── ALTER TRIP TIMELINE (add driver actor support) ──────────
ALTER TABLE trip_timeline ADD COLUMN changed_by_driver TEXT REFERENCES drivers(id);
