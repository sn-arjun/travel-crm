import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { computeInvoiceTax } from '../src/services/tax-calculator';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const TAX_KEYS = [
  'tax_system', 'country', 'company_country', 'company_state', 'gstin', 'seller_tax_id',
  'vat_rate', 'sales_tax_rate', 'tax_label',
];

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
    testEnv,
    ctx,
  );
  await waitOnExecutionContext(ctx);
  return res;
}

/** Replace every tax setting of the agency with exactly these. */
async function setTax(values: Record<string, string>): Promise<void> {
  await testEnv.MASTER_DB.prepare(`DELETE FROM settings WHERE key IN (${TAX_KEYS.map(() => '?').join(',')})`).bind(...TAX_KEYS).run();
  for (const [k, v] of Object.entries(values)) {
    await testEnv.MASTER_DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').bind(k, v, new Date().toISOString()).run();
  }
}

async function row(id: string): Promise<Record<string, any>> {
  return (await testEnv.MASTER_DB.prepare('SELECT * FROM invoices WHERE id = ?').bind(id).first()) as Record<string, any>;
}

describe('R201 tax regimes on stored invoices', () => {
  let admin = '';
  let n = 0;

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    const login = await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    admin = ((await login.json()) as any).data.accessToken;
  });

  async function contact(extra: Record<string, unknown> = {}): Promise<string> {
    n += 1;
    const res = await call('POST', '/contacts', admin, { name: `Tax Buyer ${n}`, phone: `9000008${String(n).padStart(3, '0')}`, type: 'customer', ...extra });
    expect(res.status).toBe(201);
    return ((await res.json()) as any).data.id;
  }

  async function invoice(contactId: string, line: Record<string, unknown> = {}): Promise<Record<string, any>> {
    const res = await call('POST', '/invoices', admin, {
      contactId, items: [{ description: 'Tour package', quantity: 1, rate: 1000, ...line }],
    });
    expect(res.status).toBe(201);
    return row(((await res.json()) as any).data.id);
  }

  it('GST intra-state 18%: CGST 9 + SGST 9, columns still filled', async () => {
    await setTax({ tax_system: 'gst', country: 'India', company_state: 'Maharashtra', gstin: '27AAPFU0939F1ZV' });
    const inv = await invoice(await contact({ state: 'maharashtra', country: 'India' }), { taxRate: 18 });
    expect(inv.tax_regime).toBe('gst');
    expect(inv.tax_type).toBe('cgst_sgst');
    expect([inv.cgst, inv.sgst, inv.igst, inv.total_tax, inv.total]).toEqual([90, 90, 0, 180, 1180]);
    const lines = JSON.parse(inv.tax_breakdown);
    expect(lines.map((l: any) => [l.code, l.rate, l.base, l.amount])).toEqual([['CGST', 9, 1000, 90], ['SGST', 9, 1000, 90]]);
    expect(inv.seller_tax_id).toBe('27AAPFU0939F1ZV');
    expect(inv.place_of_supply).toBe('maharashtra');
  });

  it('GST inter-state 18%: IGST 180', async () => {
    await setTax({ tax_system: 'gst', country: 'IN', company_state: 'Maharashtra' });
    const inv = await invoice(await contact({ state: 'Karnataka', country: 'India' }), { taxRate: 18 });
    expect(inv.tax_type).toBe('igst');
    expect([inv.cgst, inv.sgst, inv.igst, inv.total]).toEqual([0, 0, 180, 1180]);
    expect(JSON.parse(inv.tax_breakdown)).toHaveLength(1);
  });

  it('GST export to a buyer abroad: 0% with the LUT note', async () => {
    await setTax({ tax_system: 'gst', country: 'India', company_state: 'Maharashtra' });
    const inv = await invoice(await contact({ state: 'Texas', country: 'United States' }), { taxRate: 18 });
    expect(inv.tax_type).toBe('export_zero');
    expect([inv.total_tax, inv.total]).toEqual([0, 1000]);
    expect(JSON.parse(inv.tax_notes)).toEqual(['Supply meant for export under LUT']);
    expect(JSON.parse(inv.tax_breakdown)[0]).toMatchObject({ code: 'IGST', rate: 0, amount: 0 });
    expect(inv.place_of_supply).toBe('US');
  });

  it('UK VAT 20% for a consumer, rate defaulted from the country', async () => {
    await setTax({ tax_system: 'vat', country: 'GB', seller_tax_id: 'GB123456789' });
    const inv = await invoice(await contact({ country: 'United Kingdom' }));
    expect(inv.tax_regime).toBe('vat');
    expect(inv.tax_type).toBe('vat');
    expect([inv.total_tax, inv.vat_amount, inv.total, inv.cgst, inv.igst]).toEqual([200, 200, 1200, 0, 0]);
    expect(JSON.parse(inv.tax_breakdown)[0]).toMatchObject({ code: 'VAT', rate: 20, base: 1000, amount: 200, label: 'VAT' });
    expect(inv.seller_tax_id).toBe('GB123456789');
  });

  it('EU B2B in another country: reverse charge, 0% with the note; B2C pays the seller rate', async () => {
    await setTax({ tax_system: 'vat', country: 'Germany', vat_rate: '19', seller_tax_id: 'DE811111111' });
    const b2b = await invoice(await contact({ country: 'France', taxId: 'FR12345678901', isBusiness: true }));
    expect(b2b.tax_type).toBe('reverse_charge');
    expect([b2b.total_tax, b2b.total]).toEqual([0, 1000]);
    expect(JSON.parse(b2b.tax_notes)).toEqual(['Reverse charge: the customer accounts for VAT']);
    expect(b2b.buyer_tax_id).toBe('FR12345678901');

    const b2c = await invoice(await contact({ country: 'France' }));
    expect(b2c.tax_type).toBe('vat');
    expect([b2c.total_tax, b2c.total]).toEqual([190, 1190]);

    const sameCountry = await invoice(await contact({ country: 'Germany', taxId: 'DE822222222', isBusiness: true }));
    expect(sameCountry.tax_type).toBe('vat');
    expect(sameCountry.total_tax).toBe(190);
  });

  it('UAE VAT 5%', async () => {
    await setTax({ tax_system: 'vat', country: 'AE', vat_rate: '5', tax_label: 'VAT' });
    const inv = await invoice(await contact({ country: 'AE' }));
    expect([inv.total_tax, inv.total]).toEqual([50, 1050]);
  });

  it('US sales tax 8.875%, rounded per line half-up', async () => {
    await setTax({ tax_system: 'sales_tax', country: 'US', company_state: 'NY', sales_tax_rate: '8.875' });
    const inv = await invoice(await contact({ state: 'NY', country: 'US' }));
    expect(inv.tax_type).toBe('sales_tax');
    expect([inv.total_tax, inv.total]).toEqual([88.75, 1088.75]);
    expect(JSON.parse(inv.tax_breakdown)[0]).toMatchObject({ code: 'SALES_TAX', rate: 8.875, label: 'Sales Tax' });
    const odd = await invoice(await contact({ state: 'NY' }), { rate: 33.33 });
    expect(odd.total_tax).toBe(2.96); // 33.33 x 8.875% = 2.9580
  });

  it('none: no tax lines even if the line asks for a rate', async () => {
    await setTax({ tax_system: 'none', country: 'AE' });
    const inv = await invoice(await contact(), { taxRate: 18 });
    expect(inv.tax_regime).toBe('none');
    expect([inv.total_tax, inv.total]).toEqual([0, 1000]);
    expect(JSON.parse(inv.tax_breakdown)).toEqual([]);
  });

  it('a missing VAT rate is a clear 400, not a silent GST invoice', async () => {
    await setTax({ tax_system: 'vat', country: 'Narnia' });
    const cid = await contact();
    const res = await call('POST', '/invoices', admin, { contactId: cid, items: [{ description: 'Tour', quantity: 1, rate: 100 }] });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error?.message ?? '').toMatch(/VAT rate/i);
  });

  it('changing settings later does not change an existing invoice, its edit or its credit note', async () => {
    await setTax({ tax_system: 'vat', country: 'GB' });
    const cid = await contact({ country: 'GB' });
    const inv = await invoice(cid);
    expect(inv.total_tax).toBe(200);

    await setTax({ tax_system: 'none', country: 'GB' });
    const unchanged = await row(inv.id);
    expect([unchanged.tax_regime, unchanged.tax_type, unchanged.total_tax, unchanged.total]).toEqual(['vat', 'vat', 200, 1200]);

    // Editing the draft keeps the regime it was issued under
    const put = await call('PUT', `/invoices/${inv.id}`, admin, { items: [{ description: 'Tour', quantity: 1, rate: 2000 }] });
    expect(put.status).toBe(200);
    const edited = await row(inv.id);
    expect([edited.tax_regime, edited.total_tax, edited.total]).toEqual(['vat', 400, 2400]);

    // A new invoice follows the new settings
    const fresh = await invoice(cid);
    expect([fresh.tax_regime, fresh.total_tax]).toEqual(['none', 0]);

    // The credit note follows its invoice, not today's settings
    const cn = await call('POST', '/credit-notes', admin, { invoiceId: inv.id, reason: 'Refund', items: [{ description: 'Refund', quantity: 1, rate: 500 }] });
    expect(cn.status).toBe(201);
    const note = await row(((await cn.json()) as any).data.id);
    expect([note.tax_regime, note.tax_type, note.total_tax, note.total]).toEqual(['vat', 'vat', 100, 600]);
    expect(JSON.parse(note.tax_breakdown)[0]).toMatchObject({ code: 'VAT', rate: 20, amount: 100 });
  });

  it('credit and debit notes of a reverse-charge or GST invoice keep that treatment', async () => {
    await setTax({ tax_system: 'vat', country: 'DE', vat_rate: '19' });
    const rc = await invoice(await contact({ country: 'FR', taxId: 'FR99999999999', isBusiness: true }));
    const cn = await call('POST', '/credit-notes', admin, { invoiceId: rc.id, reason: 'Refund', items: [{ description: 'Refund', quantity: 1, rate: 100, taxRate: 19 }] });
    const note = await row(((await cn.json()) as any).data.id);
    expect([note.tax_type, note.total_tax, note.total]).toEqual(['reverse_charge', 0, 100]);
    expect(JSON.parse(note.tax_notes)).toEqual(['Reverse charge: the customer accounts for VAT']);

    await setTax({ tax_system: 'gst', country: 'IN', company_state: 'Goa' });
    const gst = await invoice(await contact({ state: 'Goa', country: 'India' }), { taxRate: 18 });
    const dn = await call('POST', '/debit-notes', admin, { invoiceId: gst.id, reason: 'Extra', items: [{ description: 'Extra night', quantity: 1, rate: 1000, taxRate: 18 }] });
    expect(dn.status).toBe(201);
    const debit = await row(((await dn.json()) as any).data.id);
    expect([debit.tax_regime, debit.tax_type, debit.cgst, debit.sgst, debit.total]).toEqual(['gst', 'cgst_sgst', 90, 90, 1180]);
  });

  it('settings reject a malformed GSTIN and a VAT regime with no usable rate', async () => {
    await setTax({ tax_system: 'gst', country: 'India' });
    const bad = await call('PUT', '/settings/invoice-defaults', admin, { gstin: 'NOT-A-GSTIN' });
    expect(bad.status).toBe(400);
    const good = await call('PUT', '/settings/invoice-defaults', admin, { gstin: '27aapfu0939f1zv' });
    expect(good.status, await good.clone().text()).toBe(200);
    const noRate = await call('PUT', '/settings/invoice-defaults', admin, { tax_system: 'vat', country: 'Narnia' });
    expect(noRate.status).toBe(400);
    const ok = await call('PUT', '/settings/invoice-defaults', admin, { tax_system: 'vat', country: 'Narnia', vat_rate: 12.5, seller_tax_id: 'NA-1' });
    expect(ok.status, await ok.clone().text()).toBe(200);
    const got = ((await (await call('GET', '/settings/invoice-defaults', admin)).json()) as any).data;
    expect([got.vat_rate, got.seller_tax_id, got.country]).toEqual([12.5, 'NA-1', 'Narnia']);
  });

  it('the tax preview shows what the form should print and gstRate fills lines without a rate', async () => {
    await setTax({ tax_system: 'gst', country: 'IN', company_state: 'Kerala' });
    const cid = await contact({ state: 'Kerala', country: 'India' });
    const prev = await call('POST', '/invoices/tax-preview', admin, { contactId: cid, items: [{ rate: 1000, quantity: 1 }], gstRate: 12 });
    const body = ((await prev.json()) as any).data;
    expect(body.taxLines.map((l: any) => [l.label, l.rate, l.amount])).toEqual([['CGST', 6, 60], ['SGST', 6, 60]]);
    expect(body.total).toBe(1120);
    const inv = await invoice(cid, {});
    expect(inv.total_tax).toBe(0); // no rate anywhere under GST: unchanged behaviour
    const res = await call('POST', '/invoices', admin, { contactId: cid, gstRate: 12, items: [{ description: 'Tour', quantity: 1, rate: 1000 }] });
    expect(res.status).toBe(201);
    expect((await row(((await res.json()) as any).data.id)).total).toBe(1120);

    await setTax({ tax_system: 'vat', country: 'AE', vat_rate: '5' });
    const vat = ((await (await call('POST', '/invoices/tax-preview', admin, { contactId: cid, items: [{ rate: 200, quantity: 1 }], gstRate: 12 })).json()) as any).data;
    expect([vat.regime, vat.totalTax, vat.defaultRate]).toEqual(['vat', 10, 5]); // gstRate ignored outside GST
  });

  it('the migration backfilled legacy columns shape: contacts take a tax id and business flag', async () => {
    const cid = await contact({ taxId: ' GB777 ', isBusiness: true });
    const c = (await testEnv.MASTER_DB.prepare('SELECT tax_id, is_business FROM contacts WHERE id = ?').bind(cid).first()) as any;
    expect([c.tax_id, c.is_business]).toEqual(['GB777', 1]);
    const got = ((await (await call('GET', `/contacts/${cid}`, admin)).json()) as any).data;
    expect([got.taxId, got.isBusiness]).toEqual(['GB777', 1]);
  });
});

describe('computeInvoiceTax arithmetic', () => {
  const seller = { country: 'GB', vatRate: 20 };

  it('rounds per line half-up and totals the rounded lines', () => {
    const r = computeInvoiceTax({
      regime: 'vat', seller, buyer: {},
      lines: [{ amount: 10.05 }, { amount: 10.05 }, { amount: 10.05 }],
    });
    // 10.05 x 20% = 2.01 each, 6.03 in total
    expect(r.totalTax).toBe(6.03);
    const five = computeInvoiceTax({
      regime: 'vat', seller: { country: 'GB', vatRate: 5 }, buyer: {},
      lines: [{ amount: 10.05 }, { amount: 10.05 }, { amount: 10.05 }],
    });
    expect(five.lines.map((l) => l.taxAmount)).toEqual([0.5, 0.5, 0.5]); // 0.5025 rounds to 0.50
    expect(five.totalTax).toBe(1.5); // not 1.51 (1.5075 on the sum)
  });

  it('GST halves are equal and a zero-rate line adds no tax line', () => {
    const r = computeInvoiceTax({
      regime: 'gst', seller: { country: 'IN', state: 'Kerala' }, buyer: { state: 'Kerala' },
      lines: [{ amount: 100.1, taxRate: 5 }, { amount: 50, taxRate: 0 }],
    });
    expect(r.cgst).toBe(r.sgst);
    expect(r.totalTax).toBe(r.cgst + r.sgst);
    expect(r.taxLines.map((t) => t.code)).toEqual(['CGST', 'SGST']);
  });

  it('exempt lines carry no tax and sales tax without a rate throws', () => {
    const r = computeInvoiceTax({ regime: 'vat', seller, buyer: {}, lines: [{ amount: 100, exempt: true }, { amount: 100 }] });
    expect(r.totalTax).toBe(20);
    expect(() => computeInvoiceTax({ regime: 'sales_tax', seller: { country: 'US' }, buyer: {}, lines: [{ amount: 1 }] })).toThrow(/Sales tax rate/);
  });
});
