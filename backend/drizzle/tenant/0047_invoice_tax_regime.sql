-- R201: each invoice (and credit/debit note, which live in the same table) records the tax regime
-- and rules applied when it was issued, so a later settings change never rewrites history.
-- tax_type now holds the treatment: cgst_sgst, igst, export_zero, vat, reverse_charge, sales_tax, none.
ALTER TABLE invoices ADD COLUMN tax_regime TEXT NOT NULL DEFAULT 'gst';
ALTER TABLE invoices ADD COLUMN tax_breakdown TEXT;
ALTER TABLE invoices ADD COLUMN seller_tax_id TEXT;
ALTER TABLE invoices ADD COLUMN buyer_tax_id TEXT;
ALTER TABLE invoices ADD COLUMN place_of_supply TEXT;
ALTER TABLE invoices ADD COLUMN tax_notes TEXT;
ALTER TABLE contacts ADD COLUMN tax_id TEXT;
ALTER TABLE contacts ADD COLUMN is_business INTEGER DEFAULT 0;

-- Existing invoices were all issued under GST: derive the treatment and the breakdown from the columns.
UPDATE invoices SET tax_regime = 'gst',
  tax_type = CASE WHEN COALESCE(cgst, 0) > 0 THEN 'cgst_sgst' ELSE 'igst' END;

UPDATE invoices SET tax_breakdown = CASE
  WHEN COALESCE(cgst, 0) > 0 THEN json_array(
    json_object('code', 'CGST', 'rate', (SELECT COALESCE(MAX(tax_rate), 0) / 2.0 FROM invoice_items WHERE invoice_id = invoices.id),
      'base', COALESCE(taxable_amount, 0), 'amount', cgst, 'label', 'CGST'),
    json_object('code', 'SGST', 'rate', (SELECT COALESCE(MAX(tax_rate), 0) / 2.0 FROM invoice_items WHERE invoice_id = invoices.id),
      'base', COALESCE(taxable_amount, 0), 'amount', COALESCE(sgst, 0), 'label', 'SGST'))
  WHEN COALESCE(igst, 0) > 0 THEN json_array(
    json_object('code', 'IGST', 'rate', (SELECT COALESCE(MAX(tax_rate), 0) FROM invoice_items WHERE invoice_id = invoices.id),
      'base', COALESCE(taxable_amount, 0), 'amount', igst, 'label', 'IGST'))
  ELSE '[]' END;
