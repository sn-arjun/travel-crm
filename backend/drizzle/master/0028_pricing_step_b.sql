-- R130: pricing step B (docs/PRICING.md sections 2.5, 7.3, 7.5, 7.6 and 8 changes 2 and 6).
--
--   1. plan_allowances gets a nullable `market` column. NULL = the amount holds in every market (all existing rows);
--      a row with a market overrides it for agencies in that market. Lookups prefer the agency's market row.
--      The old primary key (plan_key, allowance_key) would forbid a second row, so the table is rebuilt with two partial
--      unique indexes instead (one NULL-market row per plan and key; one row per plan, key and market).
--   2. Step B allowances: the `whatsapp` amounts become the utility-only amounts (trial 20, basic 250, pro 750,
--      enterprise 2000). The `whatsapp_marketing` amounts (10 / 50 / 200 / 500) were loaded by 0026 and now start to bind.
--   3. Step B unit costs: the 9 utility-rate `whatsapp` rows and the 9 `whatsapp_marketing` rows go live. The 9 interim
--      marketing-rate `whatsapp` rows of step A are switched off (kept, never deleted): the pack price then follows the
--      utility rate even before the first row's start date, when the engine falls back to the earliest active row.
--   4. Step B packs: every whatsapp_marketing_* pack is on sale (priced from the whatsapp_marketing unit cost).
--
-- No per-market allowance rows are seeded: PRICING.md names the markets that need them (EU/Germany, MY_TH, LK_NP_BD
-- Enterprise, section 4.4) but gives no amounts, so every market stays on the NULL-market row until the owner sets numbers
-- (super admin: PUT /admin/catalogue/allowances/:plan?market=EU).

CREATE TABLE plan_allowances_b (
  plan_key TEXT NOT NULL REFERENCES plans(key),
  allowance_key TEXT NOT NULL,
  monthly_amount INTEGER NOT NULL DEFAULT 0,
  market TEXT
);
--> statement-breakpoint
INSERT INTO plan_allowances_b (plan_key, allowance_key, monthly_amount, market)
  SELECT plan_key, allowance_key, monthly_amount, NULL FROM plan_allowances;
--> statement-breakpoint
DROP TABLE plan_allowances;
--> statement-breakpoint
ALTER TABLE plan_allowances_b RENAME TO plan_allowances;
--> statement-breakpoint
CREATE UNIQUE INDEX plan_allowances_all_markets_uq ON plan_allowances (plan_key, allowance_key) WHERE market IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX plan_allowances_market_uq ON plan_allowances (plan_key, allowance_key, market) WHERE market IS NOT NULL;
--> statement-breakpoint
UPDATE plan_allowances SET monthly_amount = 20 WHERE plan_key = 'trial' AND allowance_key = 'whatsapp' AND market IS NULL;
--> statement-breakpoint
UPDATE plan_allowances SET monthly_amount = 250 WHERE plan_key = 'basic' AND allowance_key = 'whatsapp' AND market IS NULL;
--> statement-breakpoint
UPDATE plan_allowances SET monthly_amount = 750 WHERE plan_key = 'pro' AND allowance_key = 'whatsapp' AND market IS NULL;
--> statement-breakpoint
UPDATE plan_allowances SET monthly_amount = 2000 WHERE plan_key = 'enterprise' AND allowance_key = 'whatsapp' AND market IS NULL;
--> statement-breakpoint
UPDATE comm_unit_costs SET is_active = 0 WHERE id IN ('01a157e5-2f36-7548-a96f-9b001096bc4d', '01a157e5-2f3c-78da-8d50-9f3fbd5c1ebb', '01a157e5-2f44-78cf-9515-80a2b6323d35', '01a157e5-2f4c-7037-be21-5389912999ae', '01a157e5-2f54-726a-ae39-a0d834f8b32c', '01a157e5-2f5c-77c5-9733-4d257032c13a', '01a157e5-2f64-7d02-b0f5-967ae1582380', '01a157e5-2f6a-73bc-91c3-1237f41a04ef', '01a157e5-2f72-730c-8a16-b52b65964e6e');
--> statement-breakpoint
UPDATE comm_unit_costs SET is_active = 1 WHERE id IN ('01a157e5-2f37-7f9b-ac56-af0875654ffb', '01a157e5-2f3d-702e-b8f1-62bab5d9596c', '01a157e5-2f45-7c90-a164-6c4de524c670', '01a157e5-2f4d-76f6-b8d9-e37b7af8772b', '01a157e5-2f55-7dc2-9997-0b9e4989a882', '01a157e5-2f5d-77ee-9265-cc80d140d76c', '01a157e5-2f65-726c-b57d-30de95a0746e', '01a157e5-2f6b-7415-8f5f-7ea4f78b6f44', '01a157e5-2f73-7799-924a-4d82173eb9ea');
--> statement-breakpoint
UPDATE comm_unit_costs SET is_active = 1 WHERE id IN ('01a157e5-2f38-75e7-9731-6cb47a683107', '01a157e5-2f3e-7660-a7fd-30f442ca3022', '01a157e5-2f46-7acd-9b90-80d43af07cdf', '01a157e5-2f4e-70ba-a8bb-4dc679ecd296', '01a157e5-2f56-7ca9-9f76-b476c5931820', '01a157e5-2f5e-7d39-ac3d-7ff41decea52', '01a157e5-2f66-7f18-9441-f0eca3f6e3b1', '01a157e5-2f6c-7872-b09d-1b79154a998b', '01a157e5-2f74-78a4-ad3c-a456c8a59acc');
--> statement-breakpoint
UPDATE addon_products SET is_active = 1 WHERE kind = 'comm_pack' AND channel = 'whatsapp_marketing' AND key LIKE 'whatsapp_marketing_%';
