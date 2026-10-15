-- R206: self-serve add-ons (extra users, AI credit packs, communication packs bought online).
--
-- PRICING RULES (owner decision 2026-10-14)
--   * Communication packs (sms, whatsapp, otp, call minutes) are sold at provider cost + 20%:
--       pack price = units x comm_unit_costs.unit_cost x (1 + margin_pct / 100), rounded up to the minor unit.
--     The seeded comm_unit_costs rows (migration 0015) carry margin_pct = 20, and the purchase quote refuses to sell a
--     communication pack for less than cost x 1.2 even if a row's margin_pct or an add-on's fixed_price is lowered.
--     Card fees (about 2%) come out of that margin; the owner decides at go-live whether to raise margin_pct.
--   * AI credit packs use addon_products.fixed_price (INR 250 for 5,000 credits, a draft price the owner has not confirmed).
--   * Extra users use the plan's extra_user_yearly_price for the agency's market, pro-rated to the days left in the paid year.
--   * Nothing is priced in code: every price is read from the catalogue at quote time.
-- Only markets that have add-on rows can buy; an agency in a market with none gets 409 PRICE_NOT_CONFIGURED.
UPDATE comm_unit_costs SET margin_pct = 20 WHERE margin_pct < 20;
--> statement-breakpoint
-- One row per purchase attempt. status: pending -> paid | failed (a failed order can still be paid later).
-- idempotency_key is unique per purchase: a client retry returns the same order and checkout link.
CREATE TABLE IF NOT EXISTS addon_orders (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL,
  currency TEXT NOT NULL,
  subtotal REAL NOT NULL,
  tax_total REAL NOT NULL DEFAULT 0,
  tax_lines TEXT,
  total REAL NOT NULL,
  units_granted INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  gateway TEXT NOT NULL,
  gateway_ref TEXT,
  checkout_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  invoice_id TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  paid_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS addon_orders_idempotency_idx ON addon_orders (idempotency_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS addon_orders_tenant_idx ON addon_orders (tenant_id, created_at);
--> statement-breakpoint
-- Extra users bought mid-term last until the subscription's paid year ends; NULL means no end (grants, subscription seats).
ALTER TABLE tenant_addons ADD COLUMN expires_at TEXT;
--> statement-breakpoint
-- A purchase is credited at most once, whatever the provider redelivers: one tenant_addons row per order.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_addons_purchase_ref_idx ON tenant_addons (reference) WHERE source = 'purchase';
--> statement-breakpoint
-- What a platform invoice is for (a subscription, or an add-on purchase).
ALTER TABLE platform_invoices ADD COLUMN description TEXT;
