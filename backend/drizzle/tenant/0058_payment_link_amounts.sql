-- R142: deposit, balance and custom amounts on a payment link, and the test gateway for agency links.
--
-- An invoice remembers the amount and purpose of its current payment link (the link is no longer always the full balance).
ALTER TABLE invoices ADD COLUMN payment_link_amount REAL;
ALTER TABLE invoices ADD COLUMN payment_link_purpose TEXT;

-- The test gateway ('mock', local stacks and tests only) is a third gateway value, so the CHECK on payment_gateway_accounts
-- widens. SQLite cannot change a CHECK in place: the table is rebuilt with the same columns and rows. A mock account holds
-- no secrets (secret_enc stays NULL). Nothing references this table by foreign key.
CREATE TABLE payment_gateway_accounts_new (
  id TEXT PRIMARY KEY,
  gateway TEXT NOT NULL CHECK (gateway IN ('razorpay', 'stripe', 'mock')),
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

INSERT INTO payment_gateway_accounts_new (id, gateway, mode, key_id, secret_enc, secret_last4, webhook_secret_enc, is_active, last_tested_at, created_at, updated_at)
SELECT id, gateway, mode, key_id, secret_enc, secret_last4, webhook_secret_enc, is_active, last_tested_at, created_at, updated_at
FROM payment_gateway_accounts;

DROP TABLE payment_gateway_accounts;
ALTER TABLE payment_gateway_accounts_new RENAME TO payment_gateway_accounts;
CREATE UNIQUE INDEX IF NOT EXISTS payment_gateway_accounts_gateway_idx ON payment_gateway_accounts(gateway);
