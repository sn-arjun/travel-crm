-- M17: Marketing & Promotions tables
-- Migration: 0010_marketing_tables.sql

-- Flyer Templates
CREATE TABLE IF NOT EXISTS flyer_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  layout_json TEXT,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  size_preset TEXT NOT NULL,
  placeholders TEXT,
  is_system INTEGER DEFAULT 0,
  is_quick_create INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS flyer_templates_tenant_id_idx ON flyer_templates(tenant_id);
CREATE INDEX IF NOT EXISTS flyer_templates_category_idx ON flyer_templates(category);
CREATE INDEX IF NOT EXISTS flyer_templates_size_preset_idx ON flyer_templates(size_preset);
CREATE INDEX IF NOT EXISTS flyer_templates_is_system_idx ON flyer_templates(is_system);
CREATE INDEX IF NOT EXISTS flyer_templates_is_active_idx ON flyer_templates(is_active);

-- Flyer Template Assets
CREATE TABLE IF NOT EXISTS flyer_template_assets (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES flyer_templates(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  asset_url TEXT,
  position_json TEXT,
  layer_order INTEGER DEFAULT 0,
  properties_json TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS flyer_template_assets_template_id_idx ON flyer_template_assets(template_id);

-- Image Library
CREATE TABLE IF NOT EXISTS image_library (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  filename TEXT NOT NULL,
  original_filename TEXT,
  r2_key TEXT NOT NULL,
  thumbnail_r2_key TEXT,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  category TEXT DEFAULT 'uploaded',
  tags TEXT,
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS image_library_tenant_id_idx ON image_library(tenant_id);
CREATE INDEX IF NOT EXISTS image_library_category_idx ON image_library(category);

-- Contact Segments
CREATE TABLE IF NOT EXISTS contact_segments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  filters_json TEXT,
  contact_count INTEGER DEFAULT 0,
  is_dynamic INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS contact_segments_tenant_id_idx ON contact_segments(tenant_id);
CREATE INDEX IF NOT EXISTS contact_segments_is_deleted_idx ON contact_segments(is_deleted);

-- Tenant Branding
CREATE TABLE IF NOT EXISTS tenant_branding (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#1976D2',
  secondary_color TEXT DEFAULT '#424242',
  accent_color TEXT DEFAULT '#FF9800',
  primary_font TEXT DEFAULT 'Roboto',
  secondary_font TEXT DEFAULT 'Open Sans',
  agency_name TEXT,
  agency_phone TEXT,
  agency_email TEXT,
  agency_website TEXT,
  tagline TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS tenant_branding_tenant_id_idx ON tenant_branding(tenant_id);

-- Marketing Campaigns
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  segment_id TEXT REFERENCES contact_segments(id),
  template_id TEXT,
  template_variables TEXT,
  message_body TEXT,
  email_subject TEXT,
  status TEXT DEFAULT 'draft',
  scheduled_at TEXT,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  opened_count INTEGER DEFAULT 0,
  clicked_count INTEGER DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS mkt_campaigns_tenant_id_idx ON marketing_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS mkt_campaigns_status_idx ON marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS mkt_campaigns_type_idx ON marketing_campaigns(type);
CREATE INDEX IF NOT EXISTS mkt_campaigns_segment_id_idx ON marketing_campaigns(segment_id);

-- Campaign Recipients
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id),
  phone TEXT,
  email TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS campaign_recipients_campaign_id_idx ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS campaign_recipients_status_idx ON campaign_recipients(status);

-- Generated Flyers
CREATE TABLE IF NOT EXISTS generated_flyers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  template_id TEXT REFERENCES flyer_templates(id),
  name TEXT NOT NULL,
  layout_json TEXT,
  r2_key TEXT,
  url TEXT,
  thumbnail_url TEXT,
  format TEXT DEFAULT 'png',
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS generated_flyers_tenant_id_idx ON generated_flyers(tenant_id);
CREATE INDEX IF NOT EXISTS generated_flyers_template_id_idx ON generated_flyers(template_id);
CREATE INDEX IF NOT EXISTS generated_flyers_created_by_idx ON generated_flyers(created_by);

-- Flyer Shares
CREATE TABLE IF NOT EXISTS flyer_shares (
  id TEXT PRIMARY KEY,
  flyer_id TEXT NOT NULL REFERENCES generated_flyers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  recipient_info TEXT,
  shared_by TEXT REFERENCES users(id),
  shared_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS flyer_shares_flyer_id_idx ON flyer_shares(flyer_id);
CREATE INDEX IF NOT EXISTS flyer_shares_channel_idx ON flyer_shares(channel);

-- Add opted_out column to contacts if not exists
ALTER TABLE contacts ADD COLUMN opted_out INTEGER DEFAULT 0;
