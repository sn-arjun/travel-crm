-- ============================================================
-- Master D1 — Subscription & Billing
-- Tables: subscription_payments + subscriptions columns
-- ============================================================

-- Add missing columns to subscriptions
ALTER TABLE subscriptions ADD COLUMN currency TEXT DEFAULT 'INR';
ALTER TABLE subscriptions ADD COLUMN trial_ends_at TEXT;
ALTER TABLE subscriptions ADD COLUMN current_period_start TEXT;
ALTER TABLE subscriptions ADD COLUMN current_period_end TEXT;
ALTER TABLE subscriptions ADD COLUMN razorpay_subscription_id TEXT;
ALTER TABLE subscriptions ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE subscriptions ADD COLUMN cancelled_at TEXT;
ALTER TABLE subscriptions ADD COLUMN cancellation_reason TEXT;

-- Subscription payments table
CREATE TABLE IF NOT EXISTS subscription_payments (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  payment_method TEXT NOT NULL,
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  gateway_response TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS sub_payments_sub_id_idx ON subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS sub_payments_tenant_id_idx ON subscription_payments(tenant_id);
CREATE INDEX IF NOT EXISTS sub_payments_status_idx ON subscription_payments(status);
