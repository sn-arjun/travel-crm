-- ============================================================
-- Tenant D1 — Document Management Enhancement (TICKET-358)
-- ============================================================

-- Add missing columns to documents table
ALTER TABLE documents ADD COLUMN category TEXT DEFAULT 'other';
ALTER TABLE documents ADD COLUMN description TEXT;
ALTER TABLE documents ADD COLUMN is_deleted INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

CREATE INDEX IF NOT EXISTS documents_is_deleted_idx ON documents(is_deleted);
