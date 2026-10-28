-- R116: enquiries from the public landing page (contact, demo, signup). The operator reads them in the
-- super admin console; they are never visible to any agency. ip_hash is a salted SHA-256, not the address.
CREATE TABLE IF NOT EXISTS platform_enquiries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'contact',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  country TEXT,
  agents_count INTEGER,
  message TEXT,
  source_url TEXT,
  ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS platform_enquiries_status_idx ON platform_enquiries(status, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS platform_enquiries_email_idx ON platform_enquiries(email, created_at);
