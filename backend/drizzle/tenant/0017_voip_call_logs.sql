-- TICKET-367: VoIP Settings
-- TICKET-370: Call Logs

CREATE TABLE IF NOT EXISTS voip_settings (
  id TEXT PRIMARY KEY,
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  twilio_api_key_sid TEXT,
  twilio_api_key_secret TEXT,
  twilio_twiml_app_sid TEXT,
  default_caller_id TEXT,
  recording_policy TEXT DEFAULT 'all',
  ivr_enabled INTEGER DEFAULT 0,
  ivr_config TEXT,
  business_hours_enabled INTEGER DEFAULT 0,
  business_hours TEXT,
  voicemail_enabled INTEGER DEFAULT 1,
  voicemail_greeting_url TEXT,
  max_ring_duration INTEGER DEFAULT 30,
  routing_strategy TEXT DEFAULT 'assigned',
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS call_logs (
  id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  direction TEXT NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  duration_seconds INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'initiated',
  outcome TEXT,
  twilio_call_sid TEXT,
  recording_url TEXT,
  recording_r2_key TEXT,
  recording_duration INTEGER,
  notes TEXT,
  ivr_path TEXT,
  routed_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  answered_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS call_logs_contact_id_idx ON call_logs(contact_id);
CREATE INDEX IF NOT EXISTS call_logs_lead_id_idx ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS call_logs_created_by_idx ON call_logs(created_by);
CREATE INDEX IF NOT EXISTS call_logs_created_at_idx ON call_logs(created_at);
CREATE INDEX IF NOT EXISTS call_logs_status_idx ON call_logs(status);
CREATE UNIQUE INDEX IF NOT EXISTS call_logs_twilio_sid_idx ON call_logs(twilio_call_sid);
