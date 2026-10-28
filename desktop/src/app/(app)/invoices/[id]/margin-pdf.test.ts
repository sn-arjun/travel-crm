import { describe, expect, it } from 'vitest';
import { normalizeInvoiceDetail, type InvoiceDetail } from '@/lib/api/invoices';
import { buildInvoicePdf, downloadInvoiceCsv, pdfSafeText } from './_documents';

// R152: the PDF of a margin-scheme invoice prints the agency's wording and no VAT line, no VAT numbers, and never the cost or margin.

const WORDING = 'Margin scheme — Travel agents';

function marginInvoice(overrides: Record<string, unknown> = {}): InvoiceDetail {
  const inv = normalizeInvoiceDetail({
    id: 'inv-1',
    invoice_number: 'INV-0001',
    type: 'tax_invoice',
    status: 'sent',
    currency: 'EUR',
    contact_id: 'c1',
    contact_name: 'Anna Jansen',
    issue_date: '2035-03-10',
    subtotal: 1000,
    total: 1000,
    total_tax: 0,
    balance_due: 1000,
    tax_regime: 'margin',
    tax_type: 'margin',
    // The hidden entry holds the VAT on the margin for the accountant; it must never reach the page or the PDF
    tax_breakdown: JSON.stringify([{ code: 'MARGIN_VAT', hidden: true, base: 400, rate: 21, amount: 69.42 }]),
    tax_notes: JSON.stringify([WORDING]),
    buyer_tax_id: 'NL123456789B01',
    seller_tax_id: 'NL999999999B01',
    margin_cost: 600,
    margin_cost_source: 'manual',
    margin_vat_rate: 21,
    margin_wording: WORDING,
    items: [{ description: 'Rome package', quantity: 1, rate: 1000, amount: 1000 }],
    ...overrides,
  });
  if (!inv) throw new Error('invoice did not normalize');
  return inv;
}

async function pdfText(inv: InvoiceDetail): Promise<string> {
  const doc = await buildInvoicePdf(inv);
  return doc.output();
}

describe('normalizing a margin invoice', () => {
  it('keeps the hidden VAT entry out of the tax lines and reads it separately', () => {
    const inv = marginInvoice();
    expect(inv.taxRegime).toBe('margin');
    expect(inv.taxBreakdown).toEqual([]);
    expect(inv.marginVat).toEqual({ base: 400, rate: 21, amount: 69.42 });
    expect([inv.marginCost, inv.marginCostSource, inv.marginVatRate, inv.marginWording]).toEqual([600, 'manual', 21, WORDING]);
  });

  it('reads inputs_missing as no VAT, and a viewer without finance rights as no figures', () => {
    const missing = marginInvoice({ tax_breakdown: JSON.stringify([{ code: 'MARGIN_VAT', hidden: true, status: 'inputs_missing' }]), margin_cost: null, margin_cost_source: null });
    expect(missing.marginVat).toBeNull();
    expect(missing.marginCost).toBeNull();
    const viewer = marginInvoice({ tax_breakdown: '[]', margin_cost: null, margin_cost_source: null, margin_vat_rate: null });
    expect([viewer.marginVat, viewer.marginCost, viewer.marginVatRate]).toEqual([null, null, null]);
  });

  it('an ordinary invoice keeps its tax lines', () => {
    const inv = marginInvoice({
      tax_regime: 'vat', tax_type: 'vat', total: 1210, total_tax: 210,
      tax_breakdown: JSON.stringify([{ code: 'VAT', rate: 21, base: 1000, amount: 210, label: 'VAT' }]),
      tax_notes: null, margin_cost: null, margin_wording: null,
    });
    expect(inv.taxBreakdown.map((l) => [l.code, l.amount])).toEqual([['VAT', 210]]);
    expect(inv.marginVat).toBeNull();
  });
});

describe('the PDF of a margin invoice', () => {
  it('prints the wording under the totals and no VAT line', async () => {
    const text = await pdfText(marginInvoice());
    expect(text).toContain('Margin scheme - Travel agents'); // the em dash is written as a hyphen (Latin-1 fonts)
    // PDF strings escape their parentheses, so a VAT line would read 'VAT \(21%\):'
    expect(text).not.toMatch(/VAT \\?\(/);
    expect(text).not.toContain('21%');
    expect(text).not.toContain('Tax:');
    expect(text).toContain('Total:');
  });

  it('prints neither VAT number, nor the cost, the margin or the VAT on the margin', async () => {
    const text = await pdfText(marginInvoice());
    expect(text).not.toContain('NL123456789B01');
    expect(text).not.toContain('NL999999999B01');
    expect(text).not.toMatch(/Our VAT no/);
    for (const hidden of ['600', '69.42', '69,42', '400.00', 'MARGIN']) expect(text).not.toContain(hidden);
  });

  it('an ordinary VAT invoice still prints its VAT line and numbers', async () => {
    const inv = marginInvoice({
      tax_regime: 'vat', tax_type: 'vat', total: 1210, total_tax: 210,
      tax_breakdown: JSON.stringify([{ code: 'VAT', rate: 21, base: 1000, amount: 210, label: 'VAT' }]),
      tax_notes: null, margin_cost: null, margin_wording: null,
    });
    const text = await pdfText(inv);
    expect(text).toMatch(/VAT \\\(21%\\\)/);
    expect(text).toContain('NL123456789B01');
    expect(text).not.toContain('Margin scheme');
  });
});

describe('pdfSafeText', () => {
  it('writes typographic dashes and quotes in their plain forms', () => {
    expect(pdfSafeText('a — b – c')).toBe('a - b - c');
    expect(pdfSafeText('“x” ‘y’ z…')).toBe('"x" \'y\' z...');
  });
});

describe('the CSV of a margin invoice', () => {
  it('has no tax rows', () => {
    let csv = '';
    const original = globalThis.Blob;
    class CaptureBlob extends original {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        csv = parts.join('');
      }
    }
    globalThis.Blob = CaptureBlob as unknown as typeof Blob;
    const url = globalThis.URL;
    globalThis.URL = Object.assign(function () {}, url, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }) as unknown as typeof URL;
    try {
      downloadInvoiceCsv(marginInvoice());
    } finally {
      globalThis.Blob = original;
      globalThis.URL = url;
    }
    expect(csv).toContain('Total');
    expect(csv).not.toContain('VAT');
  });
});
