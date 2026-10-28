-- R110: communication caps.
-- otp_requests: one row per accepted login-code request (destination is a SHA-256 hash, never the number),
-- counted for the per-number and per-IP abuse limits.
CREATE TABLE IF NOT EXISTS otp_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  destination_hash TEXT NOT NULL,
  ip TEXT,
  purpose TEXT NOT NULL DEFAULT 'login',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS otp_requests_dest_idx ON otp_requests (destination_hash, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS otp_requests_ip_idx ON otp_requests (ip, created_at);
--> statement-breakpoint
-- usage_alerts: the dedupe record for the 80% and 100% alerts. The primary key makes "once per channel per
-- threshold per period" a single atomic INSERT OR IGNORE.
CREATE TABLE IF NOT EXISTS usage_alerts (
  tenant_id TEXT NOT NULL,
  cap_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  threshold INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (tenant_id, cap_key, period_key, threshold)
);
--> statement-breakpoint
-- metered_events: idempotency keys for usage that arrives more than once (call status callbacks repeat).
CREATE TABLE IF NOT EXISTS metered_events (
  event_key TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
--> statement-breakpoint
-- Email gets a pack and a (DRAFT) provider unit cost like SMS, WhatsApp and login codes; call minutes get a pack
-- that stays inactive (not for sale) until the ADR-001 addendum / R305, but the super admin can already grant it.
INSERT OR IGNORE INTO comm_unit_costs (id, channel, market, provider, unit_cost, currency, margin_pct, effective_from, is_active) VALUES ('01a13b10-0000-7000-8000-000000000e01', 'email', 'IN', 'SendGrid', 0.08, 'INR', 20, '2026-10-14T00:00:00Z', 1);
--> statement-breakpoint
INSERT OR IGNORE INTO addon_products (key, name, kind, channel, units, fixed_price, currency, market, is_active) VALUES ('email_1000', '1,000 emails', 'comm_pack', 'email', 1000, NULL, 'INR', 'IN', 1);
--> statement-breakpoint
INSERT OR IGNORE INTO addon_products (key, name, kind, channel, units, fixed_price, currency, market, is_active) VALUES ('call_minutes_100', '100 call minutes', 'comm_pack', 'call_minute', 100, NULL, 'INR', 'IN', 0);
