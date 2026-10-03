-- B08 / BUG-005: travellers keep email + phone, and the migrated table is brought in line with
-- the Drizzle schema (src/db/tenant-schema.ts) and routes/travellers.ts.
--
-- 0000_initial.sql created `travellers` with an older column set (passport_expiry,
-- frequent_flyer_number, no tenant_id / full_name_passport / created_by / is_deleted ...), so every
-- POST /travellers INSERT failed against a freshly migrated database. All additions are nullable
-- (or defaulted) so existing rows stay valid.
ALTER TABLE travellers ADD COLUMN email TEXT;
ALTER TABLE travellers ADD COLUMN phone TEXT;
ALTER TABLE travellers ADD COLUMN tenant_id TEXT;
ALTER TABLE travellers ADD COLUMN full_name_passport TEXT;
ALTER TABLE travellers ADD COLUMN passport_issue_date TEXT;
ALTER TABLE travellers ADD COLUMN passport_expiry_date TEXT;
ALTER TABLE travellers ADD COLUMN frequent_flyer_numbers TEXT;
ALTER TABLE travellers ADD COLUMN room_preference TEXT;
ALTER TABLE travellers ADD COLUMN emergency_contact_relationship TEXT;
ALTER TABLE travellers ADD COLUMN profile_photo_url TEXT;
ALTER TABLE travellers ADD COLUMN created_by TEXT;
ALTER TABLE travellers ADD COLUMN is_deleted INTEGER DEFAULT 0;

-- Carry any pre-existing rows over to the new columns.
UPDATE travellers SET
  full_name_passport = COALESCE(full_name_passport, first_name || ' ' || last_name),
  passport_expiry_date = COALESCE(passport_expiry_date, passport_expiry),
  frequent_flyer_numbers = COALESCE(frequent_flyer_numbers, frequent_flyer_number),
  is_deleted = COALESCE(is_deleted, 0);

CREATE INDEX IF NOT EXISTS travellers_phone_idx ON travellers(phone);
CREATE INDEX IF NOT EXISTS travellers_email_idx ON travellers(email);
