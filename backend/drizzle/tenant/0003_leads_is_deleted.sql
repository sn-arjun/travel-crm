-- Add soft-delete support to leads table
ALTER TABLE leads ADD COLUMN is_deleted INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS leads_is_deleted_idx ON leads(is_deleted);
