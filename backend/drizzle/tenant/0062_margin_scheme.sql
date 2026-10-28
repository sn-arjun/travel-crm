-- R152: margin-scheme invoices (design 4.5 and 12).
--
-- invoices.margin_cost         what the sold services cost the agency, in the invoice currency; NULL = not recorded.
-- invoices.margin_cost_source  where margin_cost came from: departure, itinerary or manual; NULL = none yet.
-- invoices.margin_vat_rate     the agency's own VAT rate (percent) at the time, NULL when the agency has not entered one. Never defaulted.
-- invoices.margin_wording      the legal mention printed under the totals, a snapshot of the agency wording.
-- invoices.tax_regime already holds 'margin' as a value (it is plain text).
ALTER TABLE invoices ADD COLUMN margin_cost REAL;
ALTER TABLE invoices ADD COLUMN margin_cost_source TEXT;
ALTER TABLE invoices ADD COLUMN margin_vat_rate REAL;
ALTER TABLE invoices ADD COLUMN margin_wording TEXT;
