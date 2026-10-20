-- ============================================================
-- Master D1 - WordPress site provisioning status (R309)
-- ============================================================
-- wordpress_sites already has status, error_message (the last error), wp_admin_url, domain, container_id,
-- provisioned_at and updated_at (0000, 0006). status now takes: queued, provisioning, active, failed, suspended
-- (the column has no CHECK, so no table rebuild is needed). Adds only what is missing.

ALTER TABLE wordpress_sites ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE wordpress_sites ADD COLUMN provisioner_site_id TEXT;
ALTER TABLE wordpress_sites ADD COLUMN site_url TEXT;
-- The request as made (company, admin email, branding) so a retry or the cron sweep can rebuild the job.
ALTER TABLE wordpress_sites ADD COLUMN request_json TEXT;
ALTER TABLE wordpress_sites ADD COLUMN requested_by TEXT;
-- When the current build started (queued -> provisioning); a build older than 30 minutes is failed as timed out.
ALTER TABLE wordpress_sites ADD COLUMN started_at TEXT;
ALTER TABLE wordpress_sites ADD COLUMN welcome_sent_at TEXT;

CREATE INDEX IF NOT EXISTS wp_sites_status_idx ON wordpress_sites(status, updated_at);

-- History shown on the console: one row per state change, attempt, retry and email.
CREATE TABLE IF NOT EXISTS wordpress_site_events (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES wordpress_sites(id),
  event TEXT NOT NULL,
  status TEXT,
  detail TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS wp_site_events_site_idx ON wordpress_site_events(site_id, created_at);
