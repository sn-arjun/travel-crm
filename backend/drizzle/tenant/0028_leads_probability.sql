-- Add probability and estimated_value columns to leads
ALTER TABLE leads ADD COLUMN estimated_value REAL;
ALTER TABLE leads ADD COLUMN probability INTEGER;
ALTER TABLE leads ADD COLUMN expected_close_date TEXT;
