-- Add columns present in src/db/tenant-schema.ts but never migrated, which
-- broke every contact insert with "table contacts has no column named opted_out_at".
-- (dnd_enabled and opted_out already exist from earlier migrations.)
ALTER TABLE contacts ADD COLUMN opted_out_at TEXT;
ALTER TABLE contacts ADD COLUMN opt_out_channel TEXT;
ALTER TABLE contacts ADD COLUMN opt_out_reason TEXT;
