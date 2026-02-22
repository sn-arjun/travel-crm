/**
 * Tax Calculator Service
 * Handles GST (CGST/SGST/IGST), VAT, and other tax calculations
 */

export type TaxType = 'cgst_sgst' | 'igst' | 'vat' | 'none';

interface LineItemTax {
  taxableAmount: number;
  taxAmount: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  vatAmount?: number;
}

interface InvoiceTotalResult {
  subtotal: number;
  discountAmount: number;
  discountType?: string;
  discountValue?: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  vatAmount: number;
  totalTax: number;
  total: number;
  taxType: TaxType;
}

/**
 * Detect tax type based on company and contact location
 * For GST: same state → CGST+SGST, different state → IGST
 * For other regions: VAT or no tax
 */
export function detectTaxType(
  companyState: string | null | undefined,
  contactState: string | null | undefined,
  taxSystem: 'gst' | 'vat' | 'none' = 'gst'
): TaxType {
  if (taxSystem === 'none') return 'none';
  if (taxSystem === 'vat') return 'vat';

  // GST system (default for India)
  if (taxSystem === 'gst') {
    // If both states are provided and same, use CGST+SGST
    if (
      companyState &&
      contactState &&
      companyState.toLowerCase() === contactState.toLowerCase()
    ) {
      return 'cgst_sgst';
    }
    // Different states or one not provided = IGST
    return 'igst';
  }

  return 'none';
}

/**
 * Calculate tax for a single line item
 */
export function calculateLineItemTax(
  rate: number,
  quantity: number,
  discountPercent: number = 0,
  taxRate: number = 0,
  taxType: TaxType = 'none'
): LineItemTax {
  // Calculate subtotal
  const subtotal = rate * quantity;

  // Apply discount
  const discountAmount = (subtotal * discountPercent) / 100;
  const taxableAmount = subtotal - discountAmount;

  // Calculate tax based on type
  let taxAmount = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let vatAmount = 0;

  if (taxType === 'cgst_sgst') {
    // Split tax 50/50 between CGST and SGST
    const totalTax = (taxableAmount * taxRate) / 100;
    cgst = totalTax / 2;
    sgst = totalTax / 2;
    taxAmount = totalTax;
  } else if (taxType === 'igst') {
    // Full IGST
    igst = (taxableAmount * taxRate) / 100;
    taxAmount = igst;
  } else if (taxType === 'vat') {
    // VAT
    vatAmount = (taxableAmount * taxRate) / 100;
    taxAmount = vatAmount;
  }

  return {
    taxableAmount,
    taxAmount,
    cgst: cgst > 0 ? cgst : undefined,
    sgst: sgst > 0 ? sgst : undefined,
    igst: igst > 0 ? igst : undefined,
    vatAmount: vatAmount > 0 ? vatAmount : undefined,
  };
}

/**
 * Calculate invoice totals from line items
 */
export function calculateInvoiceTotals(
  items: Array<{
    rate: number;
    quantity: number;
    discountPercent?: number;
    taxRate?: number;
  }>,
  discountType?: 'percentage' | 'fixed',
  discountValue: number = 0,
  taxType: TaxType = 'igst'
): InvoiceTotalResult {
  let subtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalVat = 0;
  let totalTax = 0;

  // Calculate line item totals
  for (const item of items) {
    const itemResult = calculateLineItemTax(
      item.rate,
      item.quantity,
      item.discountPercent || 0,
      item.taxRate || 0,
      taxType
    );

    subtotal += item.rate * item.quantity;
    if (itemResult.cgst) totalCgst += itemResult.cgst;
    if (itemResult.sgst) totalSgst += itemResult.sgst;
    if (itemResult.igst) totalIgst += itemResult.igst;
    if (itemResult.vatAmount) totalVat += itemResult.vatAmount;
    totalTax += itemResult.taxAmount;
  }

  // Apply invoice-level discount
  let discountAmount = 0;
  if (discountType === 'percentage') {
    discountAmount = (subtotal * discountValue) / 100;
  } else if (discountType === 'fixed') {
    discountAmount = discountValue;
  }

  const taxableAmount = subtotal - discountAmount;
  const total = taxableAmount + totalTax;

  return {
    subtotal,
    discountAmount,
    discountType,
    discountValue,
    taxableAmount,
    cgst: totalCgst,
    sgst: totalSgst,
    igst: totalIgst,
    vatAmount: totalVat,
    totalTax,
    total,
    taxType,
  };
}

/**
 * Validate tax rates
 * Supported rates: 0, 5, 12, 18, 28
 */
export function isValidTaxRate(rate: number): boolean {
  const validRates = [0, 5, 12, 18, 28];
  return validRates.includes(rate);
}
