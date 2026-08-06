import { describe, it, expect } from 'vitest';
import {
  detectTaxType,
  calculateLineItemTax,
  calculateInvoiceTotals,
  isValidTaxRate,
} from '../../src/services/tax-calculator';

describe('detectTaxType', () => {
  it('should return cgst_sgst for same state (GST)', () => {
    expect(detectTaxType('Maharashtra', 'Maharashtra', 'gst')).toBe('cgst_sgst');
  });

  it('should be case-insensitive for state comparison', () => {
    expect(detectTaxType('maharashtra', 'MAHARASHTRA', 'gst')).toBe('cgst_sgst');
  });

  it('should return igst for different states (GST)', () => {
    expect(detectTaxType('Maharashtra', 'Karnataka', 'gst')).toBe('igst');
  });

  it('should return igst when company state is null', () => {
    expect(detectTaxType(null, 'Karnataka', 'gst')).toBe('igst');
  });

  it('should return igst when contact state is null', () => {
    expect(detectTaxType('Maharashtra', null, 'gst')).toBe('igst');
  });

  it('should return igst when both states are null', () => {
    expect(detectTaxType(null, null, 'gst')).toBe('igst');
  });

  it('should return igst when company state is undefined', () => {
    expect(detectTaxType(undefined, 'Karnataka', 'gst')).toBe('igst');
  });

  it('should return vat for VAT tax system', () => {
    expect(detectTaxType('State1', 'State2', 'vat')).toBe('vat');
  });

  it('should return none for no tax system', () => {
    expect(detectTaxType('State1', 'State2', 'none')).toBe('none');
  });

  it('should default to GST when taxSystem is not provided', () => {
    expect(detectTaxType('Maharashtra', 'Maharashtra')).toBe('cgst_sgst');
    expect(detectTaxType('Maharashtra', 'Karnataka')).toBe('igst');
  });
});

describe('calculateLineItemTax', () => {
  it('should calculate CGST+SGST split (same state)', () => {
    const result = calculateLineItemTax(1000, 1, 0, 18, 'cgst_sgst');

    expect(result.taxableAmount).toBe(1000);
    expect(result.taxAmount).toBe(180);
    expect(result.cgst).toBe(90);
    expect(result.sgst).toBe(90);
    expect(result.igst).toBeUndefined();
  });

  it('should calculate IGST (different state)', () => {
    const result = calculateLineItemTax(1000, 1, 0, 18, 'igst');

    expect(result.taxableAmount).toBe(1000);
    expect(result.taxAmount).toBe(180);
    expect(result.igst).toBe(180);
    expect(result.cgst).toBeUndefined();
    expect(result.sgst).toBeUndefined();
  });

  it('should calculate VAT', () => {
    const result = calculateLineItemTax(1000, 1, 0, 20, 'vat');

    expect(result.taxableAmount).toBe(1000);
    expect(result.taxAmount).toBe(200);
    expect(result.vatAmount).toBe(200);
  });

  it('should return zero tax for "none" type', () => {
    const result = calculateLineItemTax(1000, 1, 0, 18, 'none');

    expect(result.taxableAmount).toBe(1000);
    expect(result.taxAmount).toBe(0);
    expect(result.cgst).toBeUndefined();
    expect(result.sgst).toBeUndefined();
    expect(result.igst).toBeUndefined();
    expect(result.vatAmount).toBeUndefined();
  });

  it('should apply quantity multiplier', () => {
    const result = calculateLineItemTax(500, 3, 0, 18, 'igst');

    expect(result.taxableAmount).toBe(1500);
    expect(result.taxAmount).toBe(270); // 1500 * 0.18
  });

  it('should apply discount before tax', () => {
    const result = calculateLineItemTax(1000, 1, 10, 18, 'igst');

    // Subtotal: 1000, discount 10% = 100, taxable = 900
    expect(result.taxableAmount).toBe(900);
    expect(result.taxAmount).toBe(162); // 900 * 0.18
  });

  it('should handle zero tax rate', () => {
    const result = calculateLineItemTax(1000, 1, 0, 0, 'igst');

    expect(result.taxableAmount).toBe(1000);
    expect(result.taxAmount).toBe(0);
    expect(result.igst).toBeUndefined(); // 0 is falsy, so undefined
  });

  it('should handle zero quantity', () => {
    const result = calculateLineItemTax(1000, 0, 0, 18, 'igst');

    expect(result.taxableAmount).toBe(0);
    expect(result.taxAmount).toBe(0);
  });

  it('should handle 100% discount', () => {
    const result = calculateLineItemTax(1000, 1, 100, 18, 'igst');

    expect(result.taxableAmount).toBe(0);
    expect(result.taxAmount).toBe(0);
  });

  it('should use default values for optional params', () => {
    const result = calculateLineItemTax(1000, 2);

    expect(result.taxableAmount).toBe(2000);
    expect(result.taxAmount).toBe(0);
  });
});

describe('calculateInvoiceTotals', () => {
  it('should calculate totals for single item with IGST', () => {
    const items = [{ rate: 1000, quantity: 2, taxRate: 18 }];
    const result = calculateInvoiceTotals(items, undefined, 0, 'igst');

    expect(result.subtotal).toBe(2000);
    expect(result.igst).toBe(360); // 2000 * 0.18
    expect(result.totalTax).toBe(360);
    expect(result.total).toBe(2360); // 2000 + 360
  });

  it('should calculate totals for multiple items', () => {
    const items = [
      { rate: 1000, quantity: 1, taxRate: 18 },
      { rate: 500, quantity: 2, taxRate: 12 },
    ];
    const result = calculateInvoiceTotals(items, undefined, 0, 'igst');

    expect(result.subtotal).toBe(2000); // 1000 + 1000
    expect(result.igst).toBe(300); // 180 + 120
    expect(result.totalTax).toBe(300);
  });

  it('should apply percentage discount at invoice level', () => {
    const items = [{ rate: 1000, quantity: 1, taxRate: 18 }];
    const result = calculateInvoiceTotals(items, 'percentage', 10, 'igst');

    expect(result.subtotal).toBe(1000);
    expect(result.discountAmount).toBe(100);
    expect(result.taxableAmount).toBe(900);
  });

  it('should apply fixed discount at invoice level', () => {
    const items = [{ rate: 1000, quantity: 1, taxRate: 18 }];
    const result = calculateInvoiceTotals(items, 'fixed', 200, 'igst');

    expect(result.subtotal).toBe(1000);
    expect(result.discountAmount).toBe(200);
    expect(result.taxableAmount).toBe(800);
  });

  it('should split CGST/SGST for same-state transactions', () => {
    const items = [{ rate: 1000, quantity: 1, taxRate: 18 }];
    const result = calculateInvoiceTotals(items, undefined, 0, 'cgst_sgst');

    expect(result.cgst).toBe(90);
    expect(result.sgst).toBe(90);
    expect(result.igst).toBe(0);
    expect(result.totalTax).toBe(180);
  });

  it('should handle items with per-item discounts', () => {
    const items = [{ rate: 1000, quantity: 1, discountPercent: 10, taxRate: 18 }];
    const result = calculateInvoiceTotals(items, undefined, 0, 'igst');

    // Subtotal is rate * qty = 1000, item discount reduces taxable
    expect(result.subtotal).toBe(1000);
    expect(result.igst).toBe(162); // (1000 - 100) * 0.18
  });

  it('should handle empty items array', () => {
    const result = calculateInvoiceTotals([], undefined, 0, 'igst');

    expect(result.subtotal).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.total).toBe(0);
  });

  it('should include all result fields', () => {
    const items = [{ rate: 100, quantity: 1, taxRate: 5 }];
    const result = calculateInvoiceTotals(items, 'percentage', 0, 'igst');

    expect(result).toHaveProperty('subtotal');
    expect(result).toHaveProperty('discountAmount');
    expect(result).toHaveProperty('discountType');
    expect(result).toHaveProperty('discountValue');
    expect(result).toHaveProperty('taxableAmount');
    expect(result).toHaveProperty('cgst');
    expect(result).toHaveProperty('sgst');
    expect(result).toHaveProperty('igst');
    expect(result).toHaveProperty('vatAmount');
    expect(result).toHaveProperty('totalTax');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('taxType');
  });

  it('should handle VAT tax type', () => {
    const items = [{ rate: 1000, quantity: 1, taxRate: 20 }];
    const result = calculateInvoiceTotals(items, undefined, 0, 'vat');

    expect(result.vatAmount).toBe(200);
    expect(result.totalTax).toBe(200);
    expect(result.taxType).toBe('vat');
  });
});

describe('isValidTaxRate', () => {
  it('should accept 0% rate', () => {
    expect(isValidTaxRate(0)).toBe(true);
  });

  it('should accept 5% rate', () => {
    expect(isValidTaxRate(5)).toBe(true);
  });

  it('should accept 12% rate', () => {
    expect(isValidTaxRate(12)).toBe(true);
  });

  it('should accept 18% rate', () => {
    expect(isValidTaxRate(18)).toBe(true);
  });

  it('should accept 28% rate', () => {
    expect(isValidTaxRate(28)).toBe(true);
  });

  it('should reject 10% rate', () => {
    expect(isValidTaxRate(10)).toBe(false);
  });

  it('should reject 15% rate', () => {
    expect(isValidTaxRate(15)).toBe(false);
  });

  it('should reject negative rates', () => {
    expect(isValidTaxRate(-5)).toBe(false);
  });

  it('should reject fractional rates', () => {
    expect(isValidTaxRate(5.5)).toBe(false);
  });
});
