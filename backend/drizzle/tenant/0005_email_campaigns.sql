CREATE TABLE IF NOT EXISTS email_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT,
  subject TEXT NOT NULL,
  body TEXT,
  segment_filters TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  sent_at TEXT,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  bounced_count INTEGER DEFAULT 0,
  unsubscribed_count INTEGER DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS email_campaigns_status_idx ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS email_campaigns_created_by_idx ON email_campaigns(created_by);
CREATE INDEX IF NOT EXISTS email_campaigns_created_at_idx ON email_campaigns(created_at);
CREATE INDEX IF NOT EXISTS email_campaigns_scheduled_at_idx ON email_campaigns(scheduled_at);

CREATE TABLE IF NOT EXISTS email_message_log (
  id TEXT PRIMARY KEY,
  campaign_id TEXT REFERENCES email_campaigns(id),
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  recipient_email TEXT NOT NULL,
  message_id TEXT,
  status TEXT NOT NULL,
  opened_at TEXT,
  clicked_at TEXT,
  bounce_reason TEXT,
  failure_reason TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS email_message_log_campaign_id_idx ON email_message_log(campaign_id);
CREATE INDEX IF NOT EXISTS email_message_log_contact_id_idx ON email_message_log(contact_id);
CREATE INDEX IF NOT EXISTS email_message_log_status_idx ON email_message_log(status);
CREATE INDEX IF NOT EXISTS email_message_log_message_id_idx ON email_message_log(message_id);
CREATE INDEX IF NOT EXISTS email_message_log_created_at_idx ON email_message_log(created_at);
