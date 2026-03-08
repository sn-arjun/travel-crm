-- ============================================================
-- Master D1 — Tenant Usage Snapshots
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_usage_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  snapshot_date TEXT NOT NULL,
  users_count INTEGER DEFAULT 0,
  leads_count INTEGER DEFAULT 0,
  contacts_count INTEGER DEFAULT 0,
  itineraries_count INTEGER DEFAULT 0,
  invoices_count INTEGER DEFAULT 0,
  storage_mb REAL DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS usage_snapshots_tenant_date_idx ON tenant_usage_snapshots(tenant_id, snapshot_date);
CREATE INDEX IF NOT EXISTS usage_snapshots_tenant_idx ON tenant_usage_snapshots(tenant_id);
CREATE INDEX IF NOT EXISTS usage_snapshots_date_idx ON tenant_usage_snapshots(snapshot_date);
