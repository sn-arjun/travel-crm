-- R109: one plan catalogue in the master database.
-- Plans, yearly agency prices per market, included users, allowances, provider unit costs, add-on products and
-- per-agency add-on grants. Every number seeded here is a DRAFT for the owner to confirm (see catalogue_notes);
-- the super admin edits them later and no code change is needed. Money is REAL with an explicit currency column.
CREATE TABLE IF NOT EXISTS plans (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_public INTEGER NOT NULL DEFAULT 1,
  trial_days INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS plan_prices (
  id TEXT PRIMARY KEY,
  plan_key TEXT NOT NULL REFERENCES plans(key),
  market TEXT NOT NULL,
  currency TEXT NOT NULL,
  yearly_price REAL NOT NULL,
  included_users INTEGER NOT NULL,
  extra_user_yearly_price REAL,
  is_active INTEGER NOT NULL DEFAULT 1,
  valid_from TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS plan_prices_plan_market_idx ON plan_prices (plan_key, market, is_active);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS plan_features (
  plan_key TEXT NOT NULL REFERENCES plans(key),
  feature_key TEXT NOT NULL,
  PRIMARY KEY (plan_key, feature_key)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS plan_allowances (
  plan_key TEXT NOT NULL REFERENCES plans(key),
  allowance_key TEXT NOT NULL,
  monthly_amount INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (plan_key, allowance_key)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS comm_unit_costs (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  market TEXT NOT NULL,
  provider TEXT NOT NULL,
  unit_cost REAL NOT NULL,
  currency TEXT NOT NULL,
  margin_pct REAL NOT NULL DEFAULT 20,
  effective_from TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  is_active INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS comm_unit_costs_channel_market_idx ON comm_unit_costs (channel, market, is_active);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS addon_products (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  channel TEXT,
  units INTEGER NOT NULL DEFAULT 1,
  fixed_price REAL,
  currency TEXT NOT NULL,
  market TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tenant_addons (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  units_granted INTEGER NOT NULL DEFAULT 0,
  period_key TEXT,
  source TEXT NOT NULL DEFAULT 'super_admin_grant',
  granted_by TEXT,
  reference TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tenant_addons_tenant_period_idx ON tenant_addons (tenant_id, period_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS catalogue_notes (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
--> statement-breakpoint
INSERT INTO catalogue_notes (key, value) VALUES ('drafts', 'Seeded by migration 0015 on 2026-10-14. Decided by the owner: India yearly prices 12000/18000/24000 INR and included users 5/15/100. Everything else is a DRAFT to confirm: extra-user prices, AI credits, SMS/WhatsApp/login-code/email caps, pack sizes, AI pack price, provider unit costs (COST-MODEL list prices), 20 percent margin, trial allowances. Call-minute and phone-number rows stay inactive until the ADR-001 addendum.');
--> statement-breakpoint
INSERT INTO plans (key, name, description, sort_order, is_public, trial_days, is_active) VALUES ('trial', 'Trial', '14-day trial of the Pro feature set. No calling.', 0, 0, 14, 1);
--> statement-breakpoint
INSERT INTO plans (key, name, description, sort_order, is_public, trial_days, is_active) VALUES ('basic', 'Basic', 'Core CRM for a small agency getting started.', 1, 1, 0, 1);
--> statement-breakpoint
INSERT INTO plans (key, name, description, sort_order, is_public, trial_days, is_active) VALUES ('pro', 'Pro', 'Adds advanced reporting and the Pro AI feature set.', 2, 1, 0, 1);
--> statement-breakpoint
INSERT INTO plans (key, name, description, sort_order, is_public, trial_days, is_active) VALUES ('enterprise', 'Enterprise', 'Every feature, all 22 AI capabilities, priority support.', 3, 1, 0, 1);
--> statement-breakpoint
INSERT INTO plan_prices (id, plan_key, market, currency, yearly_price, included_users, extra_user_yearly_price, is_active, valid_from) VALUES ('01a13a7c-5807-7e56-adc4-d71a10d865a0', 'trial', 'IN', 'INR', 0, 3, NULL, 1, '2026-10-14T00:00:00Z');
--> statement-breakpoint
INSERT INTO plan_prices (id, plan_key, market, currency, yearly_price, included_users, extra_user_yearly_price, is_active, valid_from) VALUES ('01a13a7c-5808-7673-bc0d-99f298ff87cb', 'basic', 'IN', 'INR', 12000, 5, 2400, 1, '2026-10-14T00:00:00Z');
--> statement-breakpoint
INSERT INTO plan_prices (id, plan_key, market, currency, yearly_price, included_users, extra_user_yearly_price, is_active, valid_from) VALUES ('01a13a7c-5808-7673-bc0d-99f33173ee8c', 'pro', 'IN', 'INR', 18000, 15, 1800, 1, '2026-10-14T00:00:00Z');
--> statement-breakpoint
INSERT INTO plan_prices (id, plan_key, market, currency, yearly_price, included_users, extra_user_yearly_price, is_active, valid_from) VALUES ('01a13a7c-5808-7673-bc0d-99f4d1d7afbc', 'enterprise', 'IN', 'INR', 24000, 100, 1200, 1, '2026-10-14T00:00:00Z');
--> statement-breakpoint
INSERT INTO plan_features (plan_key, feature_key) VALUES
  ('trial', 'fleet_management'),
  ('trial', 'driver_app'),
  ('trial', 'bulk_sms'),
  ('trial', 'bulk_whatsapp'),
  ('trial', 'bulk_email'),
  ('trial', 'marketing_flyers'),
  ('trial', 'visa_management'),
  ('trial', 'supplier_management'),
  ('trial', 'ai_assistant'),
  ('trial', 'ai_extraction'),
  ('trial', 'ai_copilot'),
  ('trial', 'ai_call_summary'),
  ('trial', 'ai_lead_scoring'),
  ('trial', 'ai_message_compose'),
  ('trial', 'ai_itinerary_generate'),
  ('trial', 'ai_cost_estimation'),
  ('trial', 'ai_ocr'),
  ('trial', 'ai_search');
--> statement-breakpoint
INSERT INTO plan_features (plan_key, feature_key) VALUES
  ('basic', 'visa_management'),
  ('basic', 'supplier_management'),
  ('basic', 'bulk_sms'),
  ('basic', 'bulk_email'),
  ('basic', 'fleet_management'),
  ('basic', 'driver_app'),
  ('basic', 'marketing_flyers'),
  ('basic', 'voip_calling');
--> statement-breakpoint
INSERT INTO plan_features (plan_key, feature_key) VALUES
  ('pro', 'fleet_management'),
  ('pro', 'driver_app'),
  ('pro', 'bulk_sms'),
  ('pro', 'bulk_whatsapp'),
  ('pro', 'bulk_email'),
  ('pro', 'marketing_flyers'),
  ('pro', 'visa_management'),
  ('pro', 'supplier_management'),
  ('pro', 'advanced_reports'),
  ('pro', 'voip_calling'),
  ('pro', 'ai_assistant'),
  ('pro', 'ai_extraction'),
  ('pro', 'ai_copilot'),
  ('pro', 'ai_call_summary'),
  ('pro', 'ai_lead_scoring'),
  ('pro', 'ai_message_compose'),
  ('pro', 'ai_itinerary_generate'),
  ('pro', 'ai_cost_estimation'),
  ('pro', 'ai_ocr'),
  ('pro', 'ai_search');
--> statement-breakpoint
INSERT INTO plan_features (plan_key, feature_key) VALUES
  ('enterprise', 'fleet_management'),
  ('enterprise', 'driver_app'),
  ('enterprise', 'bulk_sms'),
  ('enterprise', 'bulk_whatsapp'),
  ('enterprise', 'bulk_email'),
  ('enterprise', 'marketing_flyers'),
  ('enterprise', 'visa_management'),
  ('enterprise', 'supplier_management'),
  ('enterprise', 'advanced_reports'),
  ('enterprise', 'voip_calling'),
  ('enterprise', 'ai_assistant'),
  ('enterprise', 'ai_extraction'),
  ('enterprise', 'ai_copilot'),
  ('enterprise', 'ai_call_summary'),
  ('enterprise', 'ai_lead_scoring'),
  ('enterprise', 'ai_message_compose'),
  ('enterprise', 'ai_itinerary_generate'),
  ('enterprise', 'ai_cost_estimation'),
  ('enterprise', 'ai_ocr'),
  ('enterprise', 'ai_search'),
  ('enterprise', 'api_access'),
  ('enterprise', 'custom_domain'),
  ('enterprise', 'white_label'),
  ('enterprise', 'priority_support'),
  ('enterprise', 'ai_chatbot'),
  ('enterprise', 'ai_intelligence'),
  ('enterprise', 'whatsapp_campaigns'),
  ('enterprise', 'ai_dialer_cards'),
  ('enterprise', 'ai_vehicle_recommend'),
  ('enterprise', 'ai_driver_recommend'),
  ('enterprise', 'ai_expense_analysis'),
  ('enterprise', 'ai_margin_insights'),
  ('enterprise', 'ai_payment_prediction'),
  ('enterprise', 'ai_visa_intelligence'),
  ('enterprise', 'ai_campaign_content'),
  ('enterprise', 'ai_campaign_optimize'),
  ('enterprise', 'ai_follow_up_suggest'),
  ('enterprise', 'ai_churn_prediction'),
  ('enterprise', 'ai_daily_briefing'),
  ('enterprise', 'ai_supplier_negotiate'),
  ('enterprise', 'ai_coaching');
--> statement-breakpoint
INSERT INTO plan_allowances (plan_key, allowance_key, monthly_amount) VALUES
  ('trial', 'ai_credits', 2000),
  ('trial', 'sms', 0),
  ('trial', 'whatsapp', 50),
  ('trial', 'otp', 5),
  ('trial', 'call_minutes', 0),
  ('trial', 'email', 100),
  ('basic', 'ai_credits', 1000),
  ('basic', 'sms', 10),
  ('basic', 'whatsapp', 250),
  ('basic', 'otp', 9),
  ('basic', 'call_minutes', 0),
  ('basic', 'email', 500),
  ('pro', 'ai_credits', 15000),
  ('pro', 'sms', 15),
  ('pro', 'whatsapp', 400),
  ('pro', 'otp', 12),
  ('pro', 'call_minutes', 0),
  ('pro', 'email', 2000),
  ('enterprise', 'ai_credits', 25000),
  ('enterprise', 'sms', 20),
  ('enterprise', 'whatsapp', 600),
  ('enterprise', 'otp', 14),
  ('enterprise', 'call_minutes', 0),
  ('enterprise', 'email', 8000);
--> statement-breakpoint
INSERT INTO comm_unit_costs (id, channel, market, provider, unit_cost, currency, margin_pct, effective_from, is_active) VALUES ('01a13a7c-5809-7633-8fcc-ef0842316a28', 'sms', 'IN', 'Twilio', 8.06, 'INR', 20, '2026-10-14T00:00:00Z', 1);
--> statement-breakpoint
INSERT INTO comm_unit_costs (id, channel, market, provider, unit_cost, currency, margin_pct, effective_from, is_active) VALUES ('01a13a7c-5809-7633-8fcc-ef098058a7b8', 'whatsapp', 'IN', 'Twilio', 0.595, 'INR', 20, '2026-10-14T00:00:00Z', 1);
--> statement-breakpoint
INSERT INTO comm_unit_costs (id, channel, market, provider, unit_cost, currency, margin_pct, effective_from, is_active) VALUES ('01a13a7c-5809-7633-8fcc-ef0ae4e6ccfb', 'otp', 'IN', 'Twilio Verify', 12.9, 'INR', 20, '2026-10-14T00:00:00Z', 1);
--> statement-breakpoint
INSERT INTO comm_unit_costs (id, channel, market, provider, unit_cost, currency, margin_pct, effective_from, is_active) VALUES ('01a13a7c-5809-7633-8fcc-ef0b192249e4', 'call_minute', 'IN', 'tbd (ADR-001 addendum)', 0, 'INR', 20, '2026-10-14T00:00:00Z', 0);
--> statement-breakpoint
INSERT INTO comm_unit_costs (id, channel, market, provider, unit_cost, currency, margin_pct, effective_from, is_active) VALUES ('01a13a7c-5809-7633-8fcc-ef0cc3a0a0c8', 'phone_number', 'IN', 'tbd (ADR-001 addendum)', 0, 'INR', 20, '2026-10-14T00:00:00Z', 0);
--> statement-breakpoint
INSERT INTO addon_products (key, name, kind, channel, units, fixed_price, currency, market, is_active) VALUES ('extra_user', 'Extra user (per year)', 'extra_user', NULL, 1, NULL, 'INR', 'IN', 1);
--> statement-breakpoint
INSERT INTO addon_products (key, name, kind, channel, units, fixed_price, currency, market, is_active) VALUES ('ai_credit_pack_5000', '5,000 AI credits', 'ai_credit_pack', NULL, 5000, 250, 'INR', 'IN', 1);
--> statement-breakpoint
INSERT INTO addon_products (key, name, kind, channel, units, fixed_price, currency, market, is_active) VALUES ('sms_100', '100 SMS', 'comm_pack', 'sms', 100, NULL, 'INR', 'IN', 1);
--> statement-breakpoint
INSERT INTO addon_products (key, name, kind, channel, units, fixed_price, currency, market, is_active) VALUES ('whatsapp_1000', '1,000 WhatsApp messages', 'comm_pack', 'whatsapp', 1000, NULL, 'INR', 'IN', 1);
--> statement-breakpoint
INSERT INTO addon_products (key, name, kind, channel, units, fixed_price, currency, market, is_active) VALUES ('otp_100', '100 login codes', 'comm_pack', 'otp', 100, NULL, 'INR', 'IN', 1);
--> statement-breakpoint
UPDATE tenants SET plan = 'basic' WHERE plan = 'starter';
--> statement-breakpoint
UPDATE tenants SET plan = 'trial' WHERE plan = 'free';
--> statement-breakpoint
UPDATE subscriptions SET plan = 'basic' WHERE plan = 'starter';
--> statement-breakpoint
UPDATE subscriptions SET plan = 'trial' WHERE plan = 'free';
