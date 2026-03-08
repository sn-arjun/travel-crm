-- Migration: AI Call Intelligence (M22)
-- TICKET-392: Call Transcripts
-- TICKET-398: AI Call Extractions
-- TICKET-411: AI Usage Log

-- Call Transcripts with FTS5
CREATE TABLE IF NOT EXISTS call_transcripts (
  id TEXT PRIMARY KEY,
  call_log_id TEXT NOT NULL REFERENCES call_logs(id) ON DELETE CASCADE,
  full_transcript TEXT NOT NULL,
  speaker_segments TEXT,
  language TEXT DEFAULT 'en',
  confidence REAL DEFAULT 0,
  word_count INTEGER DEFAULT 0,
  duration_seconds REAL DEFAULT 0,
  transcription_model TEXT DEFAULT 'deepgram-nova-2',
  is_edited INTEGER DEFAULT 0,
  edited_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  edited_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS call_transcripts_call_log_id_idx ON call_transcripts(call_log_id);
CREATE INDEX IF NOT EXISTS call_transcripts_language_idx ON call_transcripts(language);
CREATE INDEX IF NOT EXISTS call_transcripts_created_at_idx ON call_transcripts(created_at);

-- FTS5 virtual table for transcript full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS call_transcripts_fts USING fts5(
  full_transcript,
  content='call_transcripts',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
-- CREATE TRIGGER IF NOT EXISTS call_transcripts_ai AFTER INSERT ON call_transcripts BEGIN
--   INSERT INTO call_transcripts_fts(rowid, full_transcript) VALUES (new.rowid, new.full_transcript);
-- END;

-- CREATE TRIGGER IF NOT EXISTS call_transcripts_ad AFTER DELETE ON call_transcripts BEGIN
--   INSERT INTO call_transcripts_fts(call_transcripts_fts, rowid, full_transcript) VALUES('delete', old.rowid, old.full_transcript);
-- END;

-- CREATE TRIGGER IF NOT EXISTS call_transcripts_au AFTER UPDATE OF full_transcript ON call_transcripts BEGIN
--   INSERT INTO call_transcripts_fts(call_transcripts_fts, rowid, full_transcript) VALUES('delete', old.rowid, old.full_transcript);
--   INSERT INTO call_transcripts_fts(rowid, full_transcript) VALUES (new.rowid, new.full_transcript);
-- END;

-- AI Call Extractions
CREATE TABLE IF NOT EXISTS ai_call_extractions (
  id TEXT PRIMARY KEY,
  call_log_id TEXT NOT NULL REFERENCES call_logs(id) ON DELETE CASCADE,
  transcript_id TEXT REFERENCES call_transcripts(id) ON DELETE SET NULL,
  destination TEXT,
  travel_dates TEXT,
  pax_count INTEGER,
  pax_details TEXT,
  budget REAL,
  budget_currency TEXT DEFAULT 'INR',
  preferences TEXT,
  trip_type TEXT,
  hotel_preference TEXT,
  meal_preference TEXT,
  special_requests TEXT,
  summary TEXT,
  key_topics TEXT,
  action_items TEXT,
  sentiment TEXT,
  sentiment_score REAL,
  deal_likelihood REAL,
  likelihood_signals TEXT,
  coaching_hints TEXT,
  overall_confidence REAL DEFAULT 0,
  field_confidences TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
  created_contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  model_used TEXT DEFAULT 'claude-haiku-4-20250514',
  tokens_used INTEGER DEFAULT 0,
  cost_estimate REAL DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_extractions_call_log_id_idx ON ai_call_extractions(call_log_id);
CREATE INDEX IF NOT EXISTS ai_extractions_status_idx ON ai_call_extractions(status);
CREATE INDEX IF NOT EXISTS ai_extractions_sentiment_idx ON ai_call_extractions(sentiment);
CREATE INDEX IF NOT EXISTS ai_extractions_created_at_idx ON ai_call_extractions(created_at);

-- AI Usage Log
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  model_name TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_estimate REAL DEFAULT 0,
  call_log_id TEXT REFERENCES call_logs(id) ON DELETE SET NULL,
  duration_ms INTEGER DEFAULT 0,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS ai_usage_log_task_type_idx ON ai_usage_log(task_type);
CREATE INDEX IF NOT EXISTS ai_usage_log_created_at_idx ON ai_usage_log(created_at);
CREATE INDEX IF NOT EXISTS ai_usage_log_call_log_id_idx ON ai_usage_log(call_log_id);
