-- R207: an agency collects from its own customers through its OWN Razorpay or Stripe account.
-- None of this touches the platform's billing tables: the keys, the links and the events are the agency's.

-- The agency's gateway account. The secret key and the webhook secret are sealed (utils/crypto-box.ts, R108) and
-- never returned; secret_last4 is the only hint shown back. One account per gateway.
CREATE TABLE IF NOT EXISTS payment_gateway_accounts (
  id TEXT PRIMARY KEY,
  gateway TEXT NOT NULL CHECK (gateway IN ('razorpay', 'stripe')),
  mode TEXT NOT NULL DEFAULT 'test' CHECK (mode IN ('test', 'live')),
  key_id TEXT,
  secret_enc TEXT,
  secret_last4 TEXT,
  webhook_secret_enc TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_tested_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_gateway_accounts_gateway_idx ON payment_gateway_accounts(gateway);

-- The payment link currently offered on an invoice.
ALTER TABLE invoices ADD COLUMN payment_link_id TEXT;
ALTER TABLE invoices ADD COLUMN payment_link_url TEXT;
ALTER TABLE invoices ADD COLUMN payment_link_status TEXT;

-- Every verified gateway event is processed once: the event claims its row here before any side effect.
CREATE TABLE IF NOT EXISTS payment_events (
  gateway TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT,
  payment_id TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (gateway, event_id)
);
