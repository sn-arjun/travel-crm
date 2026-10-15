-- R205: subscription billing (Razorpay for India, Stripe elsewhere, one gateway interface).
-- subscriptions already carries payment_gateway, gateway_subscription_id, current_period_end (migrations 0000/0002);
-- this adds the grace-period clock, the ordering marker for webhook events and the quote the agency agreed to.
ALTER TABLE subscriptions ADD COLUMN past_due_since TEXT;
--> statement-breakpoint
ALTER TABLE subscriptions ADD COLUMN last_event_at TEXT;
--> statement-breakpoint
ALTER TABLE subscriptions ADD COLUMN extra_users INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE subscriptions ADD COLUMN quote_subtotal REAL;
--> statement-breakpoint
ALTER TABLE subscriptions ADD COLUMN quote_tax_lines TEXT;
--> statement-breakpoint
ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
-- The gateway's customer id for an agency. Never any card data.
CREATE TABLE IF NOT EXISTS billing_customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  gateway TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS billing_customers_tenant_gateway_idx ON billing_customers (tenant_id, gateway);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS billing_customers_customer_idx ON billing_customers (gateway, customer_id);
--> statement-breakpoint
-- One row per provider event. The unique (gateway, event_id) is the idempotency key: the webhook inserts here first
-- and only processes an event whose insert succeeded.
CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  gateway TEXT NOT NULL,
  event_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  tenant_id TEXT,
  outcome TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  processed_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS billing_events_gateway_event_idx ON billing_events (gateway, event_id);
--> statement-breakpoint
-- Invoices the platform issues to agencies for their subscription (not the invoices agencies issue to travellers).
CREATE TABLE IF NOT EXISTS platform_invoices (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  subscription_id TEXT,
  period TEXT,
  currency TEXT NOT NULL,
  subtotal REAL NOT NULL,
  tax_lines TEXT,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  gateway TEXT,
  gateway_ref TEXT,
  issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_invoices_number_idx ON platform_invoices (number);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_invoices_gateway_ref_idx ON platform_invoices (gateway, gateway_ref) WHERE gateway_ref IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS platform_invoices_tenant_idx ON platform_invoices (tenant_id, issued_at);
--> statement-breakpoint
-- Gap-free invoice numbering per calendar year.
CREATE TABLE IF NOT EXISTS billing_counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
