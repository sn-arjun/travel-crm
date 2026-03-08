-- Migration: VoIP Enhancements (TICKET-381, 382, 383, 384, 385, 390)
-- Adds: twilio_numbers table, voip_settings extra columns

-- Twilio Numbers (multi-number support)
CREATE TABLE IF NOT EXISTS twilio_numbers (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  friendly_name TEXT,
  twilio_sid TEXT NOT NULL,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  purpose TEXT DEFAULT 'general',
  is_default INTEGER DEFAULT 0,
  monthly_cost REAL DEFAULT 0,
  capabilities TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS twilio_numbers_phone_idx ON twilio_numbers(phone_number);
CREATE UNIQUE INDEX IF NOT EXISTS twilio_numbers_sid_idx ON twilio_numbers(twilio_sid);
CREATE INDEX IF NOT EXISTS twilio_numbers_assigned_to_idx ON twilio_numbers(assigned_to);
CREATE INDEX IF NOT EXISTS twilio_numbers_is_default_idx ON twilio_numbers(is_default);

-- VoIP Settings: add missed call auto-lead + recording retention
ALTER TABLE voip_settings ADD COLUMN auto_create_lead_missed_call INTEGER DEFAULT 1;
ALTER TABLE voip_settings ADD COLUMN recording_retention_days INTEGER DEFAULT 90;
ALTER TABLE voip_settings ADD COLUMN recording_storage_bytes INTEGER DEFAULT 0;
