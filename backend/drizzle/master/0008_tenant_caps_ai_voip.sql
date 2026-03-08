-- Phase 2: Tenant Usage Caps + AI/VoIP tracking columns on snapshots
-- Enables per-tenant limits on AI, VoIP, WhatsApp, SMS, and storage

CREATE TABLE IF NOT EXISTS tenant_usage_caps (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  cap_key TEXT NOT NULL,
  cap_value INTEGER NOT NULL,
  current_usage INTEGER DEFAULT 0,
  reset_period TEXT DEFAULT 'monthly',
  last_reset_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_caps_tenant_key_idx ON tenant_usage_caps(tenant_id, cap_key);
CREATE INDEX IF NOT EXISTS tenant_caps_tenant_idx ON tenant_usage_caps(tenant_id);

-- Expand usage snapshots with AI/VoIP tracking
ALTER TABLE tenant_usage_snapshots ADD COLUMN ai_requests INTEGER DEFAULT 0;
ALTER TABLE tenant_usage_snapshots ADD COLUMN ai_tokens_used INTEGER DEFAULT 0;
ALTER TABLE tenant_usage_snapshots ADD COLUMN ai_cost_usd REAL DEFAULT 0;
ALTER TABLE tenant_usage_snapshots ADD COLUMN voip_minutes INTEGER DEFAULT 0;
ALTER TABLE tenant_usage_snapshots ADD COLUMN voip_calls INTEGER DEFAULT 0;
ALTER TABLE tenant_usage_snapshots ADD COLUMN whatsapp_messages_sent INTEGER DEFAULT 0;
ALTER TABLE tenant_usage_snapshots ADD COLUMN sms_sent INTEGER DEFAULT 0;
