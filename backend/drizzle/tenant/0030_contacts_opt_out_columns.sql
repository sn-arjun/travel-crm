-- Add columns present in src/db/tenant-schema.ts but never migrated, which
-- broke every contact insert with "table contacts has no column named opted_out_at".
-- (opted_out exists from 0010; dnd_enabled was never migrated by any earlier file, which the
-- original note of this migration got wrong, so it is added here as well.)
ALTER TABLE contacts ADD COLUMN dnd_enabled INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN opted_out_at TEXT;
ALTER TABLE contacts ADD COLUMN opt_out_channel TEXT;
ALTER TABLE contacts ADD COLUMN opt_out_reason TEXT;
