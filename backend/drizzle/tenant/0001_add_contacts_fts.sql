-- Add isDeleted column to contacts
ALTER TABLE contacts ADD COLUMN is_deleted INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS contacts_is_deleted_idx ON contacts(is_deleted);

-- Add shared_contacts table
CREATE TABLE IF NOT EXISTS shared_contacts (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  shared_by TEXT NOT NULL REFERENCES users(id),
  shared_with TEXT NOT NULL REFERENCES users(id),
  note TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS shared_contacts_contact_id_idx ON shared_contacts(contact_id);
CREATE INDEX IF NOT EXISTS shared_contacts_shared_by_idx ON shared_contacts(shared_by);
CREATE INDEX IF NOT EXISTS shared_contacts_shared_with_idx ON shared_contacts(shared_with);

-- Add contact custom field definitions (EAV)
CREATE TABLE IF NOT EXISTS contact_custom_field_defs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL, -- text, number, date, select, multi_select, boolean
  options TEXT, -- JSON array for select/multi_select
  is_required INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS custom_field_defs_name_idx ON contact_custom_field_defs(name);

-- Add contact custom field values
CREATE TABLE IF NOT EXISTS contact_custom_field_values (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES contact_custom_field_defs(id) ON DELETE CASCADE,
  value TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS custom_field_values_contact_id_idx ON contact_custom_field_values(contact_id);
CREATE INDEX IF NOT EXISTS custom_field_values_field_id_idx ON contact_custom_field_values(field_id);
CREATE UNIQUE INDEX IF NOT EXISTS custom_field_values_unique_idx ON contact_custom_field_values(contact_id, field_id);

-- FTS5 virtual table for full-text search on contacts
CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(
  name,
  email,
  phone,
  company,
  city,
  notes,
  content='contacts',
  content_rowid='rowid'
);

-- Triggers to keep FTS5 in sync with contacts table
CREATE TRIGGER IF NOT EXISTS contacts_fts_insert AFTER INSERT ON contacts BEGIN
  INSERT INTO contacts_fts(rowid, name, email, phone, company, city, notes)
  VALUES (NEW.rowid, NEW.name, NEW.email, NEW.phone, NEW.company, NEW.city, NEW.notes);
END;

CREATE TRIGGER IF NOT EXISTS contacts_fts_update AFTER UPDATE ON contacts BEGIN
  INSERT INTO contacts_fts(contacts_fts, rowid, name, email, phone, company, city, notes)
  VALUES ('delete', OLD.rowid, OLD.name, OLD.email, OLD.phone, OLD.company, OLD.city, OLD.notes);
  INSERT INTO contacts_fts(rowid, name, email, phone, company, city, notes)
  VALUES (NEW.rowid, NEW.name, NEW.email, NEW.phone, NEW.company, NEW.city, NEW.notes);
END;

CREATE TRIGGER IF NOT EXISTS contacts_fts_delete AFTER DELETE ON contacts BEGIN
  INSERT INTO contacts_fts(contacts_fts, rowid, name, email, phone, company, city, notes)
  VALUES ('delete', OLD.rowid, OLD.name, OLD.email, OLD.phone, OLD.company, OLD.city, OLD.notes);
END;
