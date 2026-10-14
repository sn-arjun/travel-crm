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

// ============================================================================
// R201 tax engine: one function decides the tax for every invoice, credit note and debit note.
//
// Rounding rule (all regimes): amounts are converted to integer minor units (1/100 of the currency
// unit), tax is computed PER LINE as round-half-up(base_minor x rate), and totals are sums of those
// rounded lines, so a total never differs from the sum of the printed lines. Under GST the CGST and
// SGST halves are each rounded half-up and are always equal; the line tax is their sum.
// Currencies without 2 minor digits (JPY, KWD) are not handled yet (R202).
// ============================================================================

export type TaxRegime = 'gst' | 'vat' | 'sales_tax' | 'none';

/** The way tax was applied to a document; stored in invoices.tax_type. */
export type TaxTreatment =
  | 'cgst_sgst' | 'igst' | 'export_zero' | 'vat' | 'reverse_charge' | 'sales_tax' | 'none';

export type TaxCode = 'CGST' | 'SGST' | 'IGST' | 'VAT' | 'SALES_TAX';

export interface TaxLine {
  code: TaxCode;
  rate: number;
  base: number;
  amount: number;
  label: string;
}

export interface TaxSellerInput {
  country?: string | null;
  state?: string | null;
  taxId?: string | null;
  /** Standard VAT rate in percent (agency setting); falls back to DEFAULT_VAT_RATES by country. */
  vatRate?: number | null;
  /** Sales tax rate in percent (agency setting, no default). */
  salesTaxRate?: number | null;
  /** Optional label override for the VAT / sales tax line, e.g. "GST" for an Australian agency. */
  taxLabel?: string | null;
}

export interface TaxBuyerInput {
  country?: string | null;
  state?: string | null;
  taxId?: string | null;
  isBusiness?: boolean | null;
}

export interface TaxInputLine {
  /** Taxable base of the line (after line discount), in currency units. */
  amount: number;
  /**
   * Percent. GST: undefined means 0 (as before R201). VAT / sales tax: undefined means the
   * agency's rate; an explicit value (for example 0 or a reduced rate) is honoured.
   */
  taxRate?: number | null;
  exempt?: boolean;
}

/** Rules copied from an existing invoice, so a credit note follows the regime of its invoice. */
export interface FrozenTaxRules {
  regime: TaxRegime;
  treatment: TaxTreatment;
  notes?: string[];
  placeOfSupply?: string | null;
  sellerTaxId?: string | null;
  buyerTaxId?: string | null;
  /** Rate used when a line gives none (VAT / sales tax); the rate on the original invoice. */
  defaultRate?: number | null;
  label?: string | null;
}

export interface ComputeInvoiceTaxInput {
  regime: TaxRegime;
  seller: TaxSellerInput;
  buyer: TaxBuyerInput;
  lines: TaxInputLine[];
  frozen?: FrozenTaxRules | null;
}

export interface ComputedTaxLine {
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
}

export interface ComputeInvoiceTaxResult {
  regime: TaxRegime;
  treatment: TaxTreatment;
  lines: ComputedTaxLine[];
  taxLines: TaxLine[];
  totalTax: number;
  cgst: number;
  sgst: number;
  igst: number;
  vatAmount: number;
  notes: string[];
  placeOfSupply: string | null;
  sellerTaxId: string | null;
  buyerTaxId: string | null;
}

export class TaxConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaxConfigError';
  }
}

/**
 * Standard VAT rates used ONLY when an agency has not entered its own `vat_rate`. They are a
 * convenience default, not advice: the agency (or its accountant) must confirm them in Settings.
 */
export const DEFAULT_VAT_RATES: Record<string, number> = { GB: 20, AE: 5, SA: 15, DE: 19 };

export const GST_EXPORT_NOTE = 'Supply meant for export under LUT';
export const REVERSE_CHARGE_NOTE = 'Reverse charge: the customer accounts for VAT';

const COUNTRY_NAMES: Record<string, string> = {
  india: 'IN', 'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', england: 'GB',
  'united arab emirates': 'AE', uae: 'AE', 'saudi arabia': 'SA', ksa: 'SA',
  germany: 'DE', france: 'FR', italy: 'IT', spain: 'ES', netherlands: 'NL', belgium: 'BE',
  austria: 'AT', ireland: 'IE', portugal: 'PT', greece: 'GR', poland: 'PL', sweden: 'SE',
  denmark: 'DK', finland: 'FI', czechia: 'CZ', 'czech republic': 'CZ', hungary: 'HU', romania: 'RO',
  'united states': 'US', 'united states of america': 'US', usa: 'US', america: 'US',
  canada: 'CA', australia: 'AU', 'new zealand': 'NZ', singapore: 'SG', malaysia: 'MY',
  thailand: 'TH', indonesia: 'ID', vietnam: 'VN', philippines: 'PH', qatar: 'QA', oman: 'OM',
  kuwait: 'KW', bahrain: 'BH', switzerland: 'CH', japan: 'JP', 'sri lanka': 'LK', nepal: 'NP',
  bhutan: 'BT', maldives: 'MV', bangladesh: 'BD',
};

/** ISO 3166 alpha-2 for a country name or code; unknown text is upper-cased and compared as is. */
export function normalizeCountry(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return COUNTRY_NAMES[v.toLowerCase()] ?? v.toUpperCase();
}

function clean(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  return v ? v : null;
}

function toMinor(amount: number): number {
  return Math.round(Number((amount * 100).toPrecision(12)));
}

function fromMinor(minor: number): number {
  return minor / 100;
}

/** round-half-up(baseMinor x ratePercent / 100 / divisor) in integer arithmetic; rate has up to 3 decimals. */
function taxMinor(baseMinor: number, ratePercent: number, divisor = 1): number {
  const rateMilli = Math.round(ratePercent * 1000);
  const denom = 100000 * divisor;
  return Math.floor((baseMinor * rateMilli * 2 + denom) / (denom * 2));
}

/**
 * Decide and compute the tax of one document. Pure: all inputs (agency settings, buyer, lines)
 * are arguments; throws TaxConfigError when a required rate is missing.
 */
export function computeInvoiceTax(input: ComputeInvoiceTaxInput): ComputeInvoiceTaxResult {
  const { seller, buyer, lines, frozen } = input;
  const regime: TaxRegime = frozen ? frozen.regime : input.regime;
  const sellerCountry = normalizeCountry(seller.country);
  const buyerCountry = normalizeCountry(buyer.country);
  const notes: string[] = [];
  let treatment: TaxTreatment = 'none';
  let placeOfSupply: string | null = null;
  let defaultRate = 0;
  let label: string | null = clean(seller.taxLabel);

  if (frozen) {
    treatment = frozen.treatment;
    notes.push(...(frozen.notes ?? []));
    placeOfSupply = frozen.placeOfSupply ?? null;
    defaultRate = frozen.defaultRate ?? 0;
    label = frozen.label ?? label;
  } else if (regime === 'gst') {
    const sellerState = clean(seller.state);
    const buyerState = clean(buyer.state);
    if (buyerCountry && sellerCountry && buyerCountry !== sellerCountry) {
      treatment = 'export_zero';
      notes.push(GST_EXPORT_NOTE);
      placeOfSupply = buyerCountry;
    } else {
      treatment = sellerState && buyerState && sellerState.toLowerCase() === buyerState.toLowerCase()
        ? 'cgst_sgst'
        : 'igst';
      placeOfSupply = buyerState;
    }
  } else if (regime === 'vat') {
    const configured = seller.vatRate ?? (sellerCountry ? DEFAULT_VAT_RATES[sellerCountry] : undefined);
    if (configured === undefined || configured === null) {
      throw new TaxConfigError('VAT rate is not set. Enter it under Settings > Invoice defaults.');
    }
    defaultRate = configured;
    placeOfSupply = buyerCountry ?? sellerCountry;
    if (
      buyer.isBusiness && clean(buyer.taxId) && sellerCountry && buyerCountry && sellerCountry !== buyerCountry
    ) {
      treatment = 'reverse_charge';
      notes.push(REVERSE_CHARGE_NOTE);
    } else {
      treatment = 'vat';
    }
  } else if (regime === 'sales_tax') {
    if (seller.salesTaxRate === undefined || seller.salesTaxRate === null) {
      throw new TaxConfigError('Sales tax rate is not set. Enter it under Settings > Invoice defaults.');
    }
    defaultRate = seller.salesTaxRate;
    treatment = 'sales_tax';
    placeOfSupply = clean(buyer.state) ?? clean(seller.state);
  } else {
    treatment = 'none';
  }

  const zeroRated = treatment === 'export_zero' || treatment === 'reverse_charge' || treatment === 'none';
  const lineResults: ComputedTaxLine[] = [];
  const groups = new Map<string, TaxLine & { baseMinor: number; amountMinor: number }>();

  const addGroup = (code: TaxCode, rate: number, lbl: string, baseMinor: number, amountMinor: number) => {
    const key = `${code}|${rate}`;
    const g = groups.get(key) ?? { code, rate, base: 0, amount: 0, label: lbl, baseMinor: 0, amountMinor: 0 };
    g.baseMinor += baseMinor;
    g.amountMinor += amountMinor;
    groups.set(key, g);
  };

  const vatLabel = label ?? (regime === 'sales_tax' ? 'Sales Tax' : 'VAT');

  for (const line of lines) {
    const baseMinor = toMinor(line.amount);
    let rate: number;
    if (zeroRated || line.exempt) rate = 0;
    else if (line.taxRate !== undefined && line.taxRate !== null) rate = line.taxRate;
    else rate = treatment === 'vat' || treatment === 'sales_tax' ? defaultRate : 0;

    let lineTaxMinor = 0;
    if (treatment === 'cgst_sgst') {
      const half = taxMinor(baseMinor, rate, 2);
      lineTaxMinor = half * 2;
      if (rate > 0) {
        addGroup('CGST', rate / 2, 'CGST', baseMinor, half);
        addGroup('SGST', rate / 2, 'SGST', baseMinor, half);
      }
    } else if (treatment === 'igst') {
      lineTaxMinor = taxMinor(baseMinor, rate);
      if (rate > 0) addGroup('IGST', rate, 'IGST', baseMinor, lineTaxMinor);
    } else if (treatment === 'vat') {
      lineTaxMinor = taxMinor(baseMinor, rate);
      if (rate > 0) addGroup('VAT', rate, vatLabel, baseMinor, lineTaxMinor);
    } else if (treatment === 'sales_tax') {
      lineTaxMinor = taxMinor(baseMinor, rate);
      if (rate > 0) addGroup('SALES_TAX', rate, vatLabel, baseMinor, lineTaxMinor);
    }
    lineResults.push({ taxableAmount: fromMinor(baseMinor), taxRate: rate, taxAmount: fromMinor(lineTaxMinor) });
  }

  // Zero-rated documents still print one tax line at 0% so the buyer sees the treatment.
  if (treatment === 'export_zero' || treatment === 'reverse_charge') {
    const baseMinor = lines.reduce((s, l) => s + toMinor(l.amount), 0);
    if (treatment === 'export_zero') addGroup('IGST', 0, 'IGST', baseMinor, 0);
    else addGroup('VAT', 0, vatLabel, baseMinor, 0);
  }

  const taxLines: TaxLine[] = [...groups.values()].map((g) => ({
    code: g.code, rate: g.rate, base: fromMinor(g.baseMinor), amount: fromMinor(g.amountMinor), label: g.label,
  }));
  const sumCode = (code: TaxCode) =>
    taxLines.filter((t) => t.code === code).reduce((s, t) => s + toMinor(t.amount), 0);
  const totalTaxMinor = lineResults.reduce((s, l) => s + toMinor(l.taxAmount), 0);

  const sellerTaxId = frozen && frozen.sellerTaxId !== undefined ? frozen.sellerTaxId : clean(seller.taxId);
  const buyerTaxId = frozen && frozen.buyerTaxId !== undefined ? frozen.buyerTaxId : clean(buyer.taxId);

  return {
    regime,
    treatment,
    lines: lineResults,
    taxLines,
    totalTax: fromMinor(totalTaxMinor),
    cgst: fromMinor(sumCode('CGST')),
    sgst: fromMinor(sumCode('SGST')),
    igst: fromMinor(sumCode('IGST')),
    vatAmount: fromMinor(sumCode('VAT') + sumCode('SALES_TAX')),
    notes,
    placeOfSupply,
    sellerTaxId,
    buyerTaxId,
  };
}

/** Rules to copy onto a credit/debit note or re-apply on a draft edit, from a stored invoice row. */
export function frozenRulesFromInvoice(row: {
  tax_regime?: string | null;
  tax_type?: string | null;
  tax_breakdown?: string | null;
  tax_notes?: string | null;
  place_of_supply?: string | null;
  seller_tax_id?: string | null;
  buyer_tax_id?: string | null;
  cgst?: number | null;
}): FrozenTaxRules {
  const regime = (['gst', 'vat', 'sales_tax', 'none'].includes(row.tax_regime ?? '') ? row.tax_regime : 'gst') as TaxRegime;
  const known: TaxTreatment[] = ['cgst_sgst', 'igst', 'export_zero', 'vat', 'reverse_charge', 'sales_tax', 'none'];
  let treatment = known.find((t) => t === row.tax_type);
  if (!treatment) {
    treatment = regime === 'gst' ? ((row.cgst ?? 0) > 0 ? 'cgst_sgst' : 'igst') : regime;
  }
  let breakdown: TaxLine[] = [];
  try {
    const parsed = row.tax_breakdown ? JSON.parse(row.tax_breakdown) : [];
    if (Array.isArray(parsed)) breakdown = parsed as TaxLine[];
  } catch { /* keep empty */ }
  let notes: string[] = [];
  try {
    const parsed = row.tax_notes ? JSON.parse(row.tax_notes) : [];
    notes = Array.isArray(parsed) ? parsed.map(String) : [String(row.tax_notes)];
  } catch { notes = row.tax_notes ? [row.tax_notes] : []; }
  const vatLine = breakdown.find((t) => t.code === 'VAT' || t.code === 'SALES_TAX');
  return {
    regime,
    treatment,
    notes,
    placeOfSupply: row.place_of_supply ?? null,
    sellerTaxId: row.seller_tax_id ?? null,
    buyerTaxId: row.buyer_tax_id ?? null,
    defaultRate: vatLine?.rate ?? null,
    label: vatLine?.label ?? null,
  };
}

/** The columns an invoice-like row stores for the tax it applied. */
export function taxColumns(r: ComputeInvoiceTaxResult) {
  return {
    tax_regime: r.regime,
    tax_type: r.treatment,
    tax_breakdown: JSON.stringify(r.taxLines),
    seller_tax_id: r.sellerTaxId,
    buyer_tax_id: r.buyerTaxId,
    place_of_supply: r.placeOfSupply,
    tax_notes: r.notes.length ? JSON.stringify(r.notes) : null,
  };
}

// ---- Settings and buyer loading (D1) ---------------------------------------

type D1Like = { prepare(sql: string): any };

function settingText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let v = String(raw).trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    try { v = String(JSON.parse(v)); } catch { /* keep */ }
  }
  return v === '' ? null : v;
}

function settingNumber(raw: string | null | undefined): number | null {
  const t = settingText(raw);
  if (t === null) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export async function loadTaxSettings(db: D1Like): Promise<{ regime: TaxRegime; seller: TaxSellerInput }> {
  const res = await db
    .prepare(
      `SELECT key, value FROM settings WHERE key IN
       ('tax_system','country','company_country','company_state','gstin','seller_tax_id','vat_rate','sales_tax_rate','tax_label')`
    )
    .all() as { results?: Array<{ key: string; value: string }> };
  const m: Record<string, string> = {};
  for (const r of res.results ?? []) m[r.key] = r.value;
  const system = settingText(m.tax_system) ?? 'gst';
  const regime = (['gst', 'vat', 'sales_tax', 'none'].includes(system) ? system : 'gst') as TaxRegime;
  return {
    regime,
    seller: {
      country: settingText(m.country) ?? settingText(m.company_country),
      state: settingText(m.company_state),
      taxId: regime === 'gst' ? (settingText(m.gstin) ?? settingText(m.seller_tax_id)) : settingText(m.seller_tax_id),
      vatRate: settingNumber(m.vat_rate),
      salesTaxRate: settingNumber(m.sales_tax_rate),
      taxLabel: settingText(m.tax_label),
    },
  };
}

export async function loadTaxBuyer(db: D1Like, contactId: string): Promise<TaxBuyerInput | null> {
  const row = await db
    .prepare('SELECT state, country, tax_id, is_business FROM contacts WHERE id = ?1')
    .bind(contactId)
    .first() as { state: string | null; country: string | null; tax_id: string | null; is_business: number | null } | null;
  if (!row) return null;
  return { state: row.state, country: row.country, taxId: row.tax_id, isBusiness: !!row.is_business };
}

export interface DocumentItemInput {
  rate: number;
  quantity: number;
  discountPercent?: number;
  taxRate?: number | null;
}

export interface DocumentTotals {
  tax: ComputeInvoiceTaxResult;
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  total: number;
  /** Per item, in order: taxable base, tax and amount (base + tax). */
  items: Array<{ taxable: number; taxRate: number; tax: number; amount: number }>;
}

/**
 * Totals of an invoice-like document. Keeps the pre-R201 arithmetic: subtotal is the gross of all
 * lines, the document-level discount reduces it, tax is computed on each line after its own
 * discount, and total = subtotal - discount + tax. Everything is rounded to minor units.
 */
export function computeDocumentTotals(
  items: DocumentItemInput[],
  discountType: 'percentage' | 'fixed' | undefined,
  discountValue: number,
  ctx: Omit<ComputeInvoiceTaxInput, 'lines'>,
): DocumentTotals {
  let subtotalMinor = 0;
  const lines: TaxInputLine[] = items.map((it) => {
    const grossMinor = toMinor(it.rate * it.quantity);
    subtotalMinor += grossMinor;
    const discMinor = Math.round((grossMinor * (it.discountPercent ?? 0)) / 100);
    return { amount: fromMinor(grossMinor - discMinor), taxRate: it.taxRate };
  });
  const tax = computeInvoiceTax({ ...ctx, lines });
  let discountMinor = 0;
  if (discountType === 'percentage') discountMinor = Math.round((subtotalMinor * discountValue) / 100);
  else if (discountType === 'fixed') discountMinor = toMinor(discountValue);
  const taxableMinor = subtotalMinor - discountMinor;
  return {
    tax,
    subtotal: fromMinor(subtotalMinor),
    discountAmount: fromMinor(discountMinor),
    taxableAmount: fromMinor(taxableMinor),
    total: fromMinor(taxableMinor + toMinor(tax.totalTax)),
    items: tax.lines.map((l) => ({
      taxable: l.taxableAmount,
      taxRate: l.taxRate,
      tax: l.taxAmount,
      amount: fromMinor(toMinor(l.taxableAmount) + toMinor(l.taxAmount)),
    })),
  };
}
