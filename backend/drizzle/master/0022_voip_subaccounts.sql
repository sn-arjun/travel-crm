-- R304: one provider sub-account per agency, number registry, number KYC documents, per-country calling policy.
--
-- DECISIONS (owner, ADR-001 "Decision (owner, 2026-10-15)"): Twilio only; the platform resells numbers and minutes with one
-- sub-account per agency; UK, US, Australia, Singapore first (Germany, Malaysia second wave); no calling for agencies in India,
-- UAE, Saudi Arabia, Qatar, Thailand, Sri Lanka, Nepal, Bangladesh. Calling on free trials is NOT yet decided: the default is
-- "no calling on trials", behind the platform setting voip_calling_on_trial that the super admin can change.
--
-- Number rental is an add-on (catalogue rows below are DRAFT prices for the owner to confirm): provider monthly cost x 1.20.

-- Platform-wide switches the super admin can change.
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_by TEXT
);
--> statement-breakpoint
INSERT OR IGNORE INTO platform_settings (key, value) VALUES ('voip_calling_on_trial', '0');
--> statement-breakpoint

-- The agency's compartment at the phone provider. credentials_enc is the sub-account auth token sealed with the R108
-- crypto-box (AAD voip_sub_account:<tenant>:<sub-account>). status: pending (being created), active, suspended, closed.
CREATE TABLE IF NOT EXISTS voip_accounts (
  tenant_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'twilio',
  sub_account_id TEXT,
  credentials_enc TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  suspended_at TEXT,
  closed_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS voip_accounts_sub_account_idx ON voip_accounts (sub_account_id) WHERE sub_account_id IS NOT NULL;
--> statement-breakpoint

-- Where calling is offered. position: resell | bridge | own_account | not_offered.
CREATE TABLE IF NOT EXISTS call_country_policy (
  country TEXT PRIMARY KEY,
  position TEXT NOT NULL,
  provider TEXT,
  kyc_required INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
--> statement-breakpoint
INSERT OR IGNORE INTO call_country_policy (country, position, provider, kyc_required, notes) VALUES
  ('GB', 'resell', 'twilio', 1, 'Launch market. Local numbers need a business name and a UK address.'),
  ('US', 'resell', 'twilio', 0, 'Launch market. Voice numbers need no documents; US text messaging needs separate sender registration.'),
  ('AU', 'resell', 'twilio', 1, 'Launch market. Local numbers need an Australian business address and company documents.'),
  ('SG', 'resell', 'twilio', 1, 'Launch market. National numbers need a Singapore-registered business.'),
  ('DE', 'resell', 'twilio', 1, 'Second wave. Needs a business address in the area code and company registration documents.'),
  ('MY', 'resell', 'twilio', 1, 'Second wave. Needs a Malaysian address and company registration (SSM).'),
  ('IN', 'not_offered', NULL, 0, 'Owner decision 2026-10-15: no calling for Indian agencies at launch.'),
  ('AE', 'not_offered', NULL, 0, 'Only the two licensed operators may provide internet calling.'),
  ('SA', 'not_offered', NULL, 0, 'No local numbers; licensing rule needs legal confirmation.'),
  ('QA', 'not_offered', NULL, 0, 'No Qatari numbers; rules need legal confirmation.'),
  ('TH', 'not_offered', NULL, 0, 'Number rental costs more than most plans could carry.'),
  ('LK', 'not_offered', NULL, 0, 'Not offered at launch.'),
  ('NP', 'not_offered', NULL, 0, 'Not offered at launch.'),
  ('BD', 'not_offered', NULL, 0, 'Not offered at launch.');
--> statement-breakpoint

-- Number KYC: one row per agency and country. status: pending (submitted), approved, rejected. files is a JSON array of
-- { name, url } the agency attached; details is JSON (business name, address, registration number).
CREATE TABLE IF NOT EXISTS number_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  country TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  details TEXT,
  files TEXT,
  review_note TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS number_documents_tenant_country_idx ON number_documents (tenant_id, country);
--> statement-breakpoint

-- Every number the platform holds for an agency. A number belongs to exactly one agency (unique phone_number) and a purchase
-- is claimed here BEFORE the provider is called, so a retry or a race never buys twice.
--   status: pending (claimed, provider not yet bought), active, release_scheduled (goes at release_at), released
--   addon_id: the tenant_addons grant this number consumed (a grant of N units backs N numbers for its month; the claim
--             statements in services/voip/numbers.ts check the count atomically)
--   paid_through: the period key (yyyy-mm) the rental is paid for
CREATE TABLE IF NOT EXISTS voip_number_registry (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  provider_number_id TEXT,
  sub_account_id TEXT,
  country TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL,
  addon_id TEXT,
  monthly_price REAL,
  currency TEXT,
  paid_through TEXT,
  release_at TEXT,
  release_reason TEXT,
  tenant_number_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  released_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS voip_number_registry_phone_idx ON voip_number_registry (phone_number) WHERE status <> 'released';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS voip_number_registry_idempotency_idx ON voip_number_registry (idempotency_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS voip_number_registry_addon_idx ON voip_number_registry (addon_id) WHERE addon_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS voip_number_registry_tenant_idx ON voip_number_registry (tenant_id, status);
--> statement-breakpoint

-- DRAFT retail inputs (owner has not confirmed): Twilio local number monthly cost. The retail price is cost x (1 + margin 20%),
-- computed at quote time by the R206 add-on engine. Markets without a row get 409 PRICE_NOT_CONFIGURED.
INSERT OR IGNORE INTO comm_unit_costs (id, channel, market, provider, unit_cost, currency, margin_pct, effective_from, is_active) VALUES
  ('01a2c000-0304-7000-8000-000000000001', 'phone_number', 'WEST', 'Twilio (draft: US/UK local, COST-MODEL)', 1.15, 'USD', 20, '2026-10-16T00:00:00Z', 1),
  ('01a2c000-0304-7000-8000-000000000002', 'phone_number', 'SG', 'Twilio (draft: ADR-001 list price)', 5.00, 'USD', 20, '2026-10-16T00:00:00Z', 1);
--> statement-breakpoint
INSERT OR IGNORE INTO addon_products (key, name, kind, channel, units, fixed_price, currency, market, is_active) VALUES
  ('phone_number_west', 'Phone number (per month)', 'comm_pack', 'phone_number', 1, NULL, 'USD', 'WEST', 1),
  ('phone_number_sg', 'Phone number (per month)', 'comm_pack', 'phone_number', 1, NULL, 'USD', 'SG', 1);
