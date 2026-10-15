-- R208: consent records (append-only: the app never updates or deletes a row except erasure, which clears evidence) and an erasure marker on contacts.
CREATE TABLE IF NOT EXISTS contact_consents (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  channel TEXT NOT NULL DEFAULT 'any',
  purpose TEXT NOT NULL DEFAULT 'marketing',
  status TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  evidence TEXT,
  captured_by TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS contact_consents_contact_idx ON contact_consents(contact_id, purpose, captured_at);
--> statement-breakpoint
ALTER TABLE contacts ADD COLUMN erased_at TEXT;
