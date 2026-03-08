-- 0024: VoIP Provider Abstraction
-- Adds generic provider fields alongside legacy Twilio-specific columns.
-- Supports Twilio and Plivo (and future providers).

-- Add provider discriminator + generic credential columns to voip_settings
ALTER TABLE voip_settings ADD COLUMN voip_provider TEXT DEFAULT 'twilio';
ALTER TABLE voip_settings ADD COLUMN provider_account_id TEXT;
ALTER TABLE voip_settings ADD COLUMN provider_auth_token TEXT;
ALTER TABLE voip_settings ADD COLUMN provider_api_key_id TEXT;
ALTER TABLE voip_settings ADD COLUMN provider_api_key_secret TEXT;
ALTER TABLE voip_settings ADD COLUMN provider_app_id TEXT;

-- Add generic provider call ID to call_logs (alongside legacy twilio_call_sid)
ALTER TABLE call_logs ADD COLUMN provider_call_id TEXT;

-- Copy existing Twilio SIDs to generic field
UPDATE call_logs SET provider_call_id = twilio_call_sid WHERE twilio_call_sid IS NOT NULL;

-- Create index on the new generic field
CREATE INDEX IF NOT EXISTS call_logs_provider_call_id_idx ON call_logs(provider_call_id);

-- Create generic voip_numbers table (replaces twilio_numbers)
CREATE TABLE IF NOT EXISTS voip_numbers (
  id TEXT PRIMARY KEY,
  phone_number TEXT NOT NULL,
  friendly_name TEXT,
  provider_number_id TEXT NOT NULL,
  provider TEXT DEFAULT 'twilio',
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  purpose TEXT DEFAULT 'general',
  is_default INTEGER DEFAULT 0,
  monthly_cost REAL DEFAULT 0,
  capabilities TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Migrate data from twilio_numbers to voip_numbers
INSERT OR IGNORE INTO voip_numbers (id, phone_number, friendly_name, provider_number_id, provider, assigned_to, purpose, is_default, monthly_cost, capabilities, created_at, updated_at)
SELECT id, phone_number, friendly_name, twilio_sid, 'twilio', assigned_to, purpose, is_default, monthly_cost, capabilities, created_at, updated_at
FROM twilio_numbers;

CREATE UNIQUE INDEX IF NOT EXISTS voip_numbers_phone_idx ON voip_numbers(phone_number);
CREATE INDEX IF NOT EXISTS voip_numbers_provider_idx ON voip_numbers(provider);
CREATE INDEX IF NOT EXISTS voip_numbers_assigned_to_idx ON voip_numbers(assigned_to);
CREATE INDEX IF NOT EXISTS voip_numbers_is_default_idx ON voip_numbers(is_default);
