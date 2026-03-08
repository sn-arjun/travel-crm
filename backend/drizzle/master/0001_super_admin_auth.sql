-- ============================================================
-- Master D1 — Super Admin Authentication
-- Tables: super_admins, super_admin_login_log
-- ============================================================

CREATE TABLE IF NOT EXISTS super_admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'super_admin',
  is_active INTEGER DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS super_admins_email_idx ON super_admins(email);

CREATE TABLE IF NOT EXISTS super_admin_login_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  success INTEGER NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS sa_login_log_ip_idx ON super_admin_login_log(ip_address);
CREATE INDEX IF NOT EXISTS sa_login_log_admin_idx ON super_admin_login_log(admin_id);
CREATE INDEX IF NOT EXISTS sa_login_log_created_idx ON super_admin_login_log(created_at);
