-- FTS5 virtual table for full-text search on leads
CREATE VIRTUAL TABLE IF NOT EXISTS leads_fts USING fts5(
  title,
  destination,
  content='leads',
  content_rowid='rowid'
);

-- Triggers to keep leads_fts in sync with leads table
CREATE TRIGGER IF NOT EXISTS leads_fts_insert AFTER INSERT ON leads BEGIN
  INSERT INTO leads_fts(rowid, title, destination)
  VALUES (NEW.rowid, NEW.title, NEW.destination);
END;

CREATE TRIGGER IF NOT EXISTS leads_fts_update AFTER UPDATE ON leads BEGIN
  INSERT INTO leads_fts(leads_fts, rowid, title, destination)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.destination);
  INSERT INTO leads_fts(rowid, title, destination)
  VALUES (NEW.rowid, NEW.title, NEW.destination);
END;

CREATE TRIGGER IF NOT EXISTS leads_fts_delete AFTER DELETE ON leads BEGIN
  INSERT INTO leads_fts(leads_fts, rowid, title, destination)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.destination);
END;

-- Auto follow-up sequences (TICKET-077)
CREATE TABLE IF NOT EXISTS follow_up_sequences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_status TEXT NOT NULL,   -- lead status that triggers this sequence
  steps TEXT NOT NULL,            -- JSON: [{day, type, notes, template_id?}]
  is_active INTEGER DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS follow_up_sequences_trigger_status_idx ON follow_up_sequences(trigger_status);
CREATE INDEX IF NOT EXISTS follow_up_sequences_is_active_idx ON follow_up_sequences(is_active);
