-- R111: super admin API. Impersonation sessions (who, which agency, which user, why, when) and email/event
-- columns on the login log so lockout can count failures per email, including for emails that do not exist.
CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id TEXT PRIMARY KEY,
  super_admin_id TEXT NOT NULL REFERENCES super_admins(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  user_email TEXT,
  reason TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at TEXT NOT NULL,
  ended_at TEXT,
  ended_by TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS impersonation_sessions_tenant_idx ON impersonation_sessions(tenant_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS impersonation_sessions_admin_idx ON impersonation_sessions(super_admin_id);
--> statement-breakpoint
ALTER TABLE super_admin_login_log ADD COLUMN email TEXT;
--> statement-breakpoint
ALTER TABLE super_admin_login_log ADD COLUMN event TEXT NOT NULL DEFAULT 'login';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sa_login_log_email_idx ON super_admin_login_log(email, created_at);
