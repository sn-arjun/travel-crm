-- Migration: 0006_voucher_management.sql
-- Milestone 11: Voucher Management — extend vouchers table with full M11 fields

-- Add missing columns to vouchers table
ALTER TABLE vouchers ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE vouchers ADD COLUMN language TEXT DEFAULT 'en';
ALTER TABLE vouchers ADD COLUMN itinerary_item_id TEXT REFERENCES itinerary_items(id);
ALTER TABLE vouchers ADD COLUMN pdf_r2_key TEXT;
ALTER TABLE vouchers ADD COLUMN sent_via TEXT;
ALTER TABLE vouchers ADD COLUMN sent_at TEXT;
ALTER TABLE vouchers ADD COLUMN confirmed_at TEXT;
ALTER TABLE vouchers ADD COLUMN notes TEXT;
ALTER TABLE vouchers ADD COLUMN is_deleted INTEGER DEFAULT 0;

-- Additional indexes for M11 queries
CREATE INDEX IF NOT EXISTS vouchers_itinerary_item_id_idx ON vouchers(itinerary_item_id);
CREATE INDEX IF NOT EXISTS vouchers_type_status_idx ON vouchers(type, status);
CREATE INDEX IF NOT EXISTS vouchers_is_deleted_idx ON vouchers(is_deleted);
CREATE INDEX IF NOT EXISTS vouchers_created_by_idx ON vouchers(created_by);
