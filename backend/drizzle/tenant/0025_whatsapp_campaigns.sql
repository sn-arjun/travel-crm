-- 0025: WhatsApp Campaigns
-- Cold WhatsApp messaging with campaign tracking

CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  template_name TEXT,
  template_content TEXT NOT NULL,
  template_variables TEXT,
  audience_filter TEXT,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  opted_out_count INTEGER DEFAULT 0,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX whatsapp_campaigns_status_idx ON whatsapp_campaigns(status);
CREATE INDEX whatsapp_campaigns_created_by_idx ON whatsapp_campaigns(created_by);
CREATE INDEX whatsapp_campaigns_created_at_idx ON whatsapp_campaigns(created_at);

CREATE TABLE IF NOT EXISTS whatsapp_campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id),
  phone TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX wa_recipients_campaign_idx ON whatsapp_campaign_recipients(campaign_id);
CREATE INDEX wa_recipients_status_idx ON whatsapp_campaign_recipients(status);
CREATE INDEX wa_recipients_phone_idx ON whatsapp_campaign_recipients(phone);
