-- R119: an inbound call is not created by any user, so call_logs.created_by must be nullable
-- (the inbound webhook used to insert the fake id 'system', which the foreign key to users rejects).
-- SQLite cannot drop NOT NULL in place, so the table is rebuilt with the same columns and ids.
-- Dropping call_logs would cascade-delete/null its children (call_transcripts, ai_call_extractions,
-- ai_usage_log), so those rows are copied aside first and put back afterwards.
-- Also adds the unique index on provider_call_id (one row per provider call; NULLs allowed).
PRAGMA defer_foreign_keys = true;

CREATE TABLE r119_call_transcripts_bak AS SELECT * FROM call_transcripts;
CREATE TABLE r119_ai_call_extractions_bak AS SELECT * FROM ai_call_extractions;
CREATE TABLE r119_ai_usage_log_bak AS SELECT * FROM ai_usage_log;

CREATE TABLE call_logs_new (
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
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  provider_call_id TEXT
);

INSERT INTO call_logs_new (id, contact_id, lead_id, direction, from_number, to_number, duration_seconds, status, outcome,
  twilio_call_sid, recording_url, recording_r2_key, recording_duration, notes, ivr_path, routed_to, answered_by,
  created_by, created_at, updated_at, provider_call_id)
SELECT id, contact_id, lead_id, direction, from_number, to_number, duration_seconds, status, outcome,
  twilio_call_sid, recording_url, recording_r2_key, recording_duration, notes, ivr_path, routed_to, answered_by,
  created_by, created_at, updated_at, provider_call_id
FROM call_logs;

DROP TABLE call_logs;
ALTER TABLE call_logs_new RENAME TO call_logs;

CREATE INDEX IF NOT EXISTS call_logs_contact_id_idx ON call_logs(contact_id);
CREATE INDEX IF NOT EXISTS call_logs_lead_id_idx ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS call_logs_created_by_idx ON call_logs(created_by);
CREATE INDEX IF NOT EXISTS call_logs_created_at_idx ON call_logs(created_at);
CREATE INDEX IF NOT EXISTS call_logs_status_idx ON call_logs(status);
CREATE UNIQUE INDEX IF NOT EXISTS call_logs_twilio_sid_idx ON call_logs(twilio_call_sid);
CREATE INDEX IF NOT EXISTS call_logs_provider_call_id_idx ON call_logs(provider_call_id);
CREATE UNIQUE INDEX IF NOT EXISTS call_logs_provider_call_id_uniq ON call_logs(provider_call_id) WHERE provider_call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS call_logs_routed_to_idx ON call_logs(routed_to);

INSERT OR REPLACE INTO call_transcripts SELECT * FROM r119_call_transcripts_bak;
INSERT OR REPLACE INTO ai_call_extractions SELECT * FROM r119_ai_call_extractions_bak;
INSERT OR REPLACE INTO ai_usage_log SELECT * FROM r119_ai_usage_log_bak;

DROP TABLE r119_call_transcripts_bak;
DROP TABLE r119_ai_call_extractions_bak;
DROP TABLE r119_ai_usage_log_bak;
