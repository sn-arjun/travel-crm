-- B15 / B12 hand-off: bring `suppliers` in line with src/db/tenant-schema.ts and routes/suppliers.ts.
--
-- 0000_initial.sql created `suppliers` with an older column set (is_active, pan_number,
-- bank_details, no is_deleted / status / is_preferred ...) and 0027_suppliers_expand.sql is a
-- no-op, so on a freshly migrated database every `WHERE is_deleted = 0` in the supplier routes
-- (list, get, category summary, compare-rates) failed with a 500. All additions are nullable or
-- defaulted so existing rows stay valid; the legacy columns are kept untouched.
ALTER TABLE suppliers ADD COLUMN state TEXT;
ALTER TABLE suppliers ADD COLUMN postal_code TEXT;
ALTER TABLE suppliers ADD COLUMN tax_id TEXT;
ALTER TABLE suppliers ADD COLUMN website TEXT;
ALTER TABLE suppliers ADD COLUMN is_preferred INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE suppliers ADD COLUMN created_by TEXT;
ALTER TABLE suppliers ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;

-- Carry the legacy is_active flag over to the new status column.
UPDATE suppliers SET status = CASE WHEN is_active = 0 THEN 'inactive' ELSE 'active' END;

CREATE INDEX IF NOT EXISTS suppliers_status_idx ON suppliers(status);
CREATE INDEX IF NOT EXISTS suppliers_is_deleted_idx ON suppliers(is_deleted);
