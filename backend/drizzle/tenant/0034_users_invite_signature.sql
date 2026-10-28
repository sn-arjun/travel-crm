-- Columns referenced by tenant-schema.ts (users) that no earlier migration created.
ALTER TABLE users ADD COLUMN invite_status TEXT DEFAULT 'active';
ALTER TABLE users ADD COLUMN invited_at TEXT;
ALTER TABLE users ADD COLUMN email_signature TEXT;
