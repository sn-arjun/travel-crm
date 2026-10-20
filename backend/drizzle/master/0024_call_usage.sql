-- R305: call minutes metered from the provider's own records, and the fraud limits around calling.
--
-- DECISIONS (owner, 2026-10-14 / 2026-10-15): calls are included in plans up to a monthly minute cap; beyond it the agency
-- upgrades or buys a minute pack priced at provider cost + 20%. Twilio only, one sub-account per agency.
--
--   call_usage            one row per PROVIDER call id (UNIQUE): the idempotency anchor. A call is charged once, however
--                         many overlapping import windows return it.
--   voip_usage_cursor     where the import of one sub-account stopped (resumable); the next window starts a little before it.
--   voip_allowed_countries  destinations an agency may call besides its own country; the platform switches them on, one at a time.
--   voip_fraud_events     every fraud limit that fired. blocking = 1 stops the agency's new outbound calls until a super admin
--                         lifts it (status lifted) or its day ends; everything is shown in the super admin console.
--
-- Retail inputs are DRAFT figures from docs/COST-MODEL.md section 6.2 (provider cost per minute, USD) that the owner has not
-- confirmed. comm_unit_costs rows with channel call_minute: market WEST / SG is the agency's base minute; a row whose market
-- is a destination country (GB, US, AU, DE, MY) is what a minute to there costs. A destination dearer than the agency's base
-- minute counts as more than one minute against the allowance (weight = destination cost / base cost; see services/voip/metering.ts).
-- The minute packs are priced by the R206 engine at cost x 1.20 (never below). Markets without rows get 409 PRICE_NOT_CONFIGURED.

CREATE TABLE IF NOT EXISTS call_usage (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider_call_id TEXT NOT NULL,
  sub_account_id TEXT,
  direction TEXT NOT NULL,
  leg TEXT NOT NULL DEFAULT 'customer',
  parent_call_id TEXT,
  remote_number TEXT,
  destination_country TEXT,
  destination_type TEXT,
  billed_seconds INTEGER NOT NULL DEFAULT 0,
  provider_cost REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  weight REAL NOT NULL DEFAULT 1,
  minutes_counted INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS call_usage_provider_call_idx ON call_usage (provider_call_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS call_usage_tenant_started_idx ON call_usage (tenant_id, started_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS voip_usage_cursor (
  tenant_id TEXT PRIMARY KEY,
  cursor_at TEXT NOT NULL,
  last_run_at TEXT,
  last_error TEXT,
  imported_total INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS voip_allowed_countries (
  tenant_id TEXT NOT NULL,
  country TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  created_by TEXT,
  PRIMARY KEY (tenant_id, country)
);
--> statement-breakpoint

-- kind: daily_minutes (blocking), spend_spike, platform_ceiling, velocity, blocked_destination (all flags).
-- day_key (yyyy-mm-dd) + kind + tenant_id is unique, so a limit that keeps firing leaves one row a day.
CREATE TABLE IF NOT EXISTS voip_fraud_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  day_key TEXT NOT NULL,
  blocking INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  detail TEXT,
  occurrences INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  lifted_at TEXT,
  lifted_by TEXT,
  notified_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS voip_fraud_events_unique_idx ON voip_fraud_events (tenant_id, kind, day_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS voip_fraud_events_status_idx ON voip_fraud_events (status, created_at);
--> statement-breakpoint

-- Platform limits (the super admin can change them in platform_settings): see services/voip/fraud.ts for the keys and defaults.

-- DRAFT retail inputs (owner has not confirmed): provider cost per minute in USD, COST-MODEL 6.2 / ADR-001.
INSERT OR IGNORE INTO comm_unit_costs (id, channel, market, provider, unit_cost, currency, margin_pct, effective_from, is_active) VALUES
  ('01a2c000-0305-7000-8000-000000000001', 'call_minute', 'WEST', 'Twilio (draft: US outbound, COST-MODEL 6.2)', 0.0136, 'USD', 20, '2026-10-20T00:00:00Z', 1),
  ('01a2c000-0305-7000-8000-000000000002', 'call_minute', 'SG', 'Twilio (draft: Singapore outbound, COST-MODEL 6.2)', 0.0522, 'USD', 20, '2026-10-20T00:00:00Z', 1),
  ('01a2c000-0305-7000-8000-000000000003', 'call_minute', 'GB', 'Twilio (draft: destination cost)', 0.0213, 'USD', 20, '2026-10-20T00:00:00Z', 1),
  ('01a2c000-0305-7000-8000-000000000004', 'call_minute', 'US', 'Twilio (draft: destination cost)', 0.0136, 'USD', 20, '2026-10-20T00:00:00Z', 1),
  ('01a2c000-0305-7000-8000-000000000005', 'call_minute', 'AU', 'Twilio (draft: destination cost)', 0.0763, 'USD', 20, '2026-10-20T00:00:00Z', 1),
  ('01a2c000-0305-7000-8000-000000000006', 'call_minute', 'DE', 'Twilio (draft: destination cost)', 0.0460, 'USD', 20, '2026-10-20T00:00:00Z', 1),
  ('01a2c000-0305-7000-8000-000000000007', 'call_minute', 'MY', 'Twilio (draft: destination cost)', 0.0840, 'USD', 20, '2026-10-20T00:00:00Z', 1);
--> statement-breakpoint
INSERT OR IGNORE INTO addon_products (key, name, kind, channel, units, fixed_price, currency, market, is_active) VALUES
  ('call_minutes_100_west', '100 call minutes', 'comm_pack', 'call_minute', 100, NULL, 'USD', 'WEST', 1),
  ('call_minutes_100_sg', '100 call minutes', 'comm_pack', 'call_minute', 100, NULL, 'USD', 'SG', 1);
