-- ============================================================
-- Master D1 — Announcements, Support Tickets & Audit Log
-- ============================================================

-- Announcements
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'all',
  target_tenant_ids TEXT,
  priority TEXT NOT NULL DEFAULT 'info',
  is_active INTEGER DEFAULT 1,
  published_at TEXT,
  expires_at TEXT,
  created_by TEXT REFERENCES super_admins(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS announcements_active_idx ON announcements(is_active);
CREATE INDEX IF NOT EXISTS announcements_created_idx ON announcements(created_at);

-- Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to TEXT REFERENCES super_admins(id),
  created_by_email TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS support_tickets_tenant_idx ON support_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_idx ON support_tickets(assigned_to);

-- Support Ticket Replies
CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
  author_type TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS ticket_replies_ticket_idx ON support_ticket_replies(ticket_id);

-- Super Admin Audit Log
CREATE TABLE IF NOT EXISTS super_admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_id TEXT REFERENCES super_admins(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'system',
  entity_id TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS audit_log_admin_idx ON super_admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON super_admin_audit_log(action);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON super_admin_audit_log(entity_type);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON super_admin_audit_log(created_at);
