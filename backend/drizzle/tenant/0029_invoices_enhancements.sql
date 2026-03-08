-- Invoices enhancements (TICKET-105)
ALTER TABLE invoices ADD COLUMN billing_name TEXT;
ALTER TABLE invoices ADD COLUMN billing_address TEXT;
ALTER TABLE invoices ADD COLUMN billing_state TEXT;
ALTER TABLE invoices ADD COLUMN billing_country TEXT;
ALTER TABLE invoices ADD COLUMN billing_gstin TEXT;
ALTER TABLE invoices ADD COLUMN terms TEXT;
ALTER TABLE invoices ADD COLUMN exchange_rate REAL DEFAULT 1.0;
ALTER TABLE invoices ADD COLUMN issue_date TEXT;
ALTER TABLE invoices ADD COLUMN is_duplicate INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN is_deleted INTEGER DEFAULT 0;

-- Payments enhancements
ALTER TABLE payments ADD COLUMN receipt_number TEXT;
ALTER TABLE payments ADD COLUMN lead_id TEXT;
