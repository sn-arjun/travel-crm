-- B35: invoices.issue_date and invoices.terms already exist (added by 0029_invoices_enhancements.sql)
-- but were missing from the Drizzle schema and never populated. Backfill issue_date for existing rows.
UPDATE invoices SET issue_date = date(created_at) WHERE issue_date IS NULL AND created_at IS NOT NULL;
