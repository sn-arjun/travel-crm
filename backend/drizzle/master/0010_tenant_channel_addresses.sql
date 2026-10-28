-- Inbound gateway: which tenant owns a receiving address.
-- A provider webhook (WhatsApp, SMS, email) carries only the number or mailbox the
-- customer wrote to; this table maps that address to the tenant whose database gets the message.
CREATE TABLE IF NOT EXISTS tenant_channel_addresses (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  channel TEXT NOT NULL,
  address TEXT NOT NULL,
  provider TEXT,
  label TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_channel_addresses_channel_address_idx ON tenant_channel_addresses(channel, address);
CREATE INDEX IF NOT EXISTS tenant_channel_addresses_tenant_idx ON tenant_channel_addresses(tenant_id);
