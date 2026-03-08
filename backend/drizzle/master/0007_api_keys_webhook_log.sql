-- ============================================================
-- Master D1 — Tenant API Keys & Webhook Log
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  api_key TEXT NOT NULL,
  label TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_api_keys_key_idx ON tenant_api_keys(api_key);
CREATE INDEX IF NOT EXISTS tenant_api_keys_tenant_idx ON tenant_api_keys(tenant_id);

CREATE TABLE IF NOT EXISTS webhook_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  api_key TEXT,
  source TEXT,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS webhook_log_tenant_idx ON webhook_log(tenant_id);
CREATE INDEX IF NOT EXISTS webhook_log_created_idx ON webhook_log(created_at);
