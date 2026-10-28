-- B02 / BUG-030: festival_campaigns is declared in src/db/tenant-schema.ts and queried by
-- routes/festival-campaigns.ts but was never migrated (every request returned 500).
CREATE TABLE IF NOT EXISTS festival_campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  name TEXT NOT NULL,
  festival_name TEXT NOT NULL,
  festival_date TEXT NOT NULL,
  days_before INTEGER DEFAULT 3,
  template_id TEXT, -- email_templates has no migration yet, so no FK is declared
  message_body TEXT,
  campaign_type TEXT DEFAULT 'whatsapp',
  is_active INTEGER DEFAULT 0,
  segment_id TEXT REFERENCES contact_segments(id),
  last_run_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS festival_campaigns_tenant_id_idx ON festival_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS festival_campaigns_festival_date_idx ON festival_campaigns(festival_date);
CREATE INDEX IF NOT EXISTS festival_campaigns_is_active_idx ON festival_campaigns(is_active);
