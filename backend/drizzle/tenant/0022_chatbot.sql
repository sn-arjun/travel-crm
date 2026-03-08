-- M25: AI Chatbot — Website & WhatsApp
-- TICKET-459 through TICKET-477

CREATE TABLE IF NOT EXISTS chatbot_config (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  greeting TEXT,
  business_hours_start TEXT,
  business_hours_end TEXT,
  business_days TEXT,
  after_hours_message TEXT,
  qualification_questions TEXT,
  faq_entries TEXT,
  branding_color TEXT,
  branding_logo TEXT,
  max_auto_replies INTEGER DEFAULT 10,
  handoff_threshold INTEGER DEFAULT 5,
  system_prompt TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS chatbot_config_channel_idx ON chatbot_config(channel);

CREATE TABLE IF NOT EXISTS chatbot_conversations (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  visitor_id TEXT,
  visitor_name TEXT,
  visitor_email TEXT,
  visitor_phone TEXT,
  language TEXT DEFAULT 'en',
  messages TEXT,
  status TEXT DEFAULT 'active',
  assigned_user_id TEXT,
  lead_id TEXT,
  contact_id TEXT,
  qualification_data TEXT,
  sentiment TEXT,
  message_count INTEGER DEFAULT 0,
  bot_message_count INTEGER DEFAULT 0,
  human_message_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0,
  last_message_at TEXT,
  closed_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS chatbot_conversations_channel_idx ON chatbot_conversations(channel);
CREATE INDEX IF NOT EXISTS chatbot_conversations_visitor_id_idx ON chatbot_conversations(visitor_id);
CREATE INDEX IF NOT EXISTS chatbot_conversations_status_idx ON chatbot_conversations(status);
CREATE INDEX IF NOT EXISTS chatbot_conversations_assigned_user_idx ON chatbot_conversations(assigned_user_id);
CREATE INDEX IF NOT EXISTS chatbot_conversations_lead_id_idx ON chatbot_conversations(lead_id);
CREATE INDEX IF NOT EXISTS chatbot_conversations_created_at_idx ON chatbot_conversations(created_at);
