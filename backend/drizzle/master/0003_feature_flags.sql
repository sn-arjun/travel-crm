-- ============================================================
-- Master D1 — Tenant Feature Flags
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_feature_flags (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  feature_key TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_feature_flags_tenant_key_idx ON tenant_feature_flags(tenant_id, feature_key);
CREATE INDEX IF NOT EXISTS tenant_feature_flags_tenant_idx ON tenant_feature_flags(tenant_id);
