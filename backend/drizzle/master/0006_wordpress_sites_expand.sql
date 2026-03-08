-- ============================================================
-- Master D1 — WordPress Sites: Additional Columns
-- ============================================================

ALTER TABLE wordpress_sites ADD COLUMN domain TEXT;
ALTER TABLE wordpress_sites ADD COLUMN server_ip TEXT;
ALTER TABLE wordpress_sites ADD COLUMN wp_admin_user TEXT;
ALTER TABLE wordpress_sites ADD COLUMN wp_admin_password_encrypted TEXT;
ALTER TABLE wordpress_sites ADD COLUMN template TEXT;
ALTER TABLE wordpress_sites ADD COLUMN error_message TEXT;
ALTER TABLE wordpress_sites ADD COLUMN provisioned_at TEXT;
ALTER TABLE wordpress_sites ADD COLUMN last_health_check TEXT;
ALTER TABLE wordpress_sites ADD COLUMN updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
