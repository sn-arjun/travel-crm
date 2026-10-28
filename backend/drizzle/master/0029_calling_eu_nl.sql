-- R137: calling ready to switch on in the EU, the Netherlands first (docs/readiness/TOUR-OPERATOR-DESIGN.md sections 5.6 and 16).
--
--   1. call_country_policy: NL is a resell country; every row gets a recording default; a country can list the fields and
--      documents its regulatory bundle needs (kyc_requirements, JSON). Only NL has a list, and it is a DRAFT: the real list is
--      read from the provider's Regulations API at go-live (docs/GO-LIVE.md phase 9) and edited in the console.
--      A country with no list keeps today's flow (free-form document upload, approval = purchasable).
--   2. number_documents: where the provider-side regulatory bundle stands (design 5.6).
--   3. Pricing: the EU call-minute and phone-number rows and the two EU add-ons (inactive since R129, "until the second wave")
--      go live, as docs/PRICING.md describes.
--   4. NL draft rows, INACTIVE with cost 0: no provider price is invented. The owner enters the real Twilio NL price in the
--      super admin catalogue and activates the row. Until then an NL agency gets PRICE_NOT_CONFIGURED for a number (a country
--      product, active or not, is authoritative over the market product: services/voip/numbers.ts) and its minutes are
--      priced by the EU market row (the destination weight ignores a row that is inactive or has cost 0).

ALTER TABLE call_country_policy ADD COLUMN recording_default TEXT NOT NULL DEFAULT 'announce';
--> statement-breakpoint
ALTER TABLE call_country_policy ADD COLUMN kyc_requirements TEXT;
--> statement-breakpoint
INSERT OR IGNORE INTO call_country_policy (country, position, provider, kyc_required, notes) VALUES
  ('NL', 'resell', 'twilio', 1, 'EU first market. Local numbers need a regulatory bundle (business identity and an address); confirm the requirements against Twilio''s Regulations API at go-live.');
--> statement-breakpoint
UPDATE call_country_policy SET recording_default = 'announce' WHERE country IN ('NL', 'DE');
--> statement-breakpoint
UPDATE call_country_policy SET kyc_requirements = '[{"key":"businessName","label":"Business name","type":"text","required":true},{"key":"registrationNumber","label":"Business registration number","type":"text","required":true},{"key":"address","label":"Registered business address in the country","type":"address","required":true},{"key":"representativeName","label":"Representative full name","type":"text","required":true},{"key":"registrationExtract","label":"Registration extract","type":"file","required":true}]'
  WHERE country = 'NL' AND kyc_requirements IS NULL;
--> statement-breakpoint

ALTER TABLE number_documents ADD COLUMN provider_bundle_sid TEXT;
--> statement-breakpoint
ALTER TABLE number_documents ADD COLUMN provider_address_sid TEXT;
--> statement-breakpoint
ALTER TABLE number_documents ADD COLUMN provider_status TEXT;
--> statement-breakpoint
ALTER TABLE number_documents ADD COLUMN provider_status_at TEXT;
--> statement-breakpoint
ALTER TABLE number_documents ADD COLUMN provider_failure_reason TEXT;
--> statement-breakpoint
ALTER TABLE number_documents ADD COLUMN number_type TEXT NOT NULL DEFAULT 'local';
--> statement-breakpoint

UPDATE comm_unit_costs SET is_active = 1 WHERE id IN ('01a157e5-2f4a-752c-9ea7-ca87c01b6c58', '01a157e5-2f4b-7261-9e7a-8bfe8eda9884');
--> statement-breakpoint
UPDATE addon_products SET is_active = 1 WHERE key IN ('call_minutes_500_eu', 'phone_number_eu');
--> statement-breakpoint

INSERT OR IGNORE INTO comm_unit_costs (id, channel, market, provider, unit_cost, currency, margin_pct, effective_from, is_active) VALUES
  ('01a15fab-db01-7d72-bf77-cee76f237fa0', 'phone_number', 'NL', 'DRAFT: enter Twilio''s NL price before selling', 0, 'EUR', 30, '2026-11-01T00:00:00Z', 0),
  ('01a15fab-db02-7c41-83ce-0f5ac346d509', 'call_minute', 'NL', 'DRAFT: enter Twilio''s NL price before selling', 0, 'USD', 30, '2026-11-01T00:00:00Z', 0);
--> statement-breakpoint
INSERT OR IGNORE INTO addon_products (key, name, kind, channel, units, fixed_price, currency, market, is_active) VALUES
  ('phone_number_nl', 'Phone number (per month)', 'comm_pack', 'phone_number', 1, NULL, 'EUR', 'NL', 0);
