import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import { computeDocumentTotals, computeInvoiceTax, taxColumns, vatOnMarginMinor } from '../src/services/tax-calculator';
import { marginOf, normalizeMarginScheme, stripMarginFigures, vatOnMargin } from '../src/services/margin-scheme';

// R152: margin-scheme invoices. The agency's own wording and VAT rate, a cost per invoice, no VAT line, and a report that says when inputs are missing.

const testEnv = env as any;
const DB: D1Database = testEnv.MASTER_DB;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const WORDING = 'Margin scheme - Travel agents';

let admin = '';
let viewer = '';
let n = 0;

async function call(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const json = async (res: Response): Promise<any> => res.json();
const rows = async <T = any>(sql: string, ...b: unknown[]): Promise<T[]> => ((await DB.prepare(sql).bind(...b).all()).results ?? []) as T[];
const setSetting = (key: string, value: string) =>
  DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, value, new Date().toISOString()).run();
const invoiceRow = async (id: string) => (await rows('SELECT * FROM invoices WHERE id = ?', id))[0];
const hidden = (inv: Record<string, any>) => JSON.parse(inv.tax_breakdown).filter((e: any) => e.hidden);
const visible = (inv: Record<string, any>) => JSON.parse(inv.tax_breakdown).filter((e: any) => !e.hidden);

async function putScheme(body: Record<string, unknown>) {
  return call('PUT', '/settings/margin-scheme', admin, body);
}

async function contact(): Promise<string> {
  n += 1;
  const res = await call('POST', '/contacts', admin, { name: `Margin Buyer ${n}`, phone: `9100009${String(n).padStart(3, '0')}`, type: 'customer', isBusiness: true, taxId: 'NL123456789B01', country: 'NL' });
  expect(res.status).toBe(201);
  return (await json(res)).data.id;
}

async function setFlag(enabled: boolean | null) {
  await DB.prepare('DELETE FROM tenant_feature_flags WHERE tenant_id = ? AND feature_key = ?').bind(TENANT_ID, 'margin_scheme').run();
  if (enabled !== null) {
    await DB.prepare('INSERT INTO tenant_feature_flags (id, tenant_id, feature_key, is_enabled) VALUES (?, ?, ?, ?)').bind('r152-flag', TENANT_ID, 'margin_scheme', enabled ? 1 : 0).run();
  }
}

async function makeInvoice(extra: Record<string, unknown> = {}, rate = 1000): Promise<{ id: string; status: number; body: any }> {
  const res = await call('POST', '/invoices', admin, { contactId: await contact(), items: [{ description: 'Package', quantity: 1, rate }], ...extra });
  const body = await json(res);
  return { id: body.data?.id, status: res.status, body };
}

beforeAll(async () => {
  await applyD1Migrations(DB, testEnv.TEST_MIGRATIONS);
  expect((await call('POST', '/test/reset', null)).status).toBe(200);
  admin = (await json(await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID }))).data.accessToken;
  viewer = (await json(await call('POST', '/auth/login', null, { email: 'viewer@e2e.test', password: 'password123', tenantId: TENANT_ID }))).data.accessToken;
  expect((await call('PUT', '/automations/pause', admin, { paused: true })).status).toBe(200);
  for (const [k, v] of Object.entries({ country: 'NL', currency: 'EUR', locale: 'nl-NL', timezone: 'Europe/Amsterdam', tax_system: 'vat', vat_rate: '21' })) await setSetting(k, v);
  expect((await call('PUT', '/departures/settings', admin, { enabled: true })).status).toBe(200);
});

describe('the engine (pure)', () => {
  const seller = { country: 'NL', vatRate: 21, taxId: 'NL999' };
  const lines = [{ amount: 1000 }];

  it('prints no tax line, adds no tax, and keeps the agency wording as the only note', () => {
    const r = computeInvoiceTax({ regime: 'margin', seller, buyer: { taxId: 'NL123', isBusiness: true }, lines, margin: { wording: WORDING, cost: 600, vatRate: 21 } });
    expect(r.treatment).toBe('margin');
    expect(r.taxLines).toEqual([]);
    expect(r.totalTax).toBe(0);
    expect(r.notes).toEqual([WORDING]);
    expect([r.sellerTaxId, r.buyerTaxId]).toEqual([null, null]);
    // 400 margin x 21 / 121 = 69.42
    expect(r.hiddenLines).toEqual([{ code: 'MARGIN_VAT', hidden: true, base: 400, rate: 21, amount: 69.42 }]);
  });

  it('holds only inputs_missing when the cost or the rate is not known', () => {
    for (const margin of [{ wording: WORDING, cost: null, vatRate: 21 }, { wording: WORDING, cost: 600, vatRate: null }, { wording: WORDING, cost: null, vatRate: null }]) {
      const r = computeInvoiceTax({ regime: 'margin', seller, buyer: {}, lines, margin });
      expect(r.hiddenLines).toEqual([{ code: 'MARGIN_VAT', hidden: true, status: 'inputs_missing' }]);
    }
  });

  it('uses the price after the document discount and never charges VAT on a loss', () => {
    const doc = computeDocumentTotals([{ rate: 1000, quantity: 1 }], 'fixed', 100, { regime: 'margin', seller, buyer: {}, margin: { wording: WORDING, cost: 400, vatRate: 21 } });
    expect([doc.subtotal, doc.discountAmount, doc.total, doc.tax.totalTax]).toEqual([1000, 100, 900, 0]);
    // margin 900 - 400 = 500; 500 x 21 / 121 = 86.78
    expect(doc.tax.hiddenLines[0]).toMatchObject({ base: 500, amount: 86.78 });
    const loss = computeDocumentTotals([{ rate: 300, quantity: 1 }], undefined, 0, { regime: 'margin', seller, buyer: {}, margin: { wording: null, cost: 400, vatRate: 21 } });
    expect(loss.tax.hiddenLines[0]).toMatchObject({ base: -100, amount: 0 });
    expect(loss.tax.notes).toEqual([]);
  });

  it('rounds VAT on the margin half-up in minor units', () => {
    expect(vatOnMarginMinor(40000, 21)).toBe(6942);
    expect(vatOnMarginMinor(100, 5)).toBe(5); // 100 x 5 / 105 = 4.76 -> 5
    expect(vatOnMarginMinor(0, 21)).toBe(0);
    expect(vatOnMarginMinor(-500, 21)).toBe(0);
    expect(vatOnMargin(400, 21)).toBe(69.42);
    expect(marginOf(1000, 600)).toBe(400);
    expect(marginOf(1000, null)).toBeNull();
  });

  it('the stored columns carry the hidden entry after the visible ones', () => {
    const r = computeInvoiceTax({ regime: 'margin', seller, buyer: {}, lines, margin: { wording: WORDING, cost: 600, vatRate: 21 } });
    const cols = taxColumns(r);
    expect(cols.tax_regime).toBe('margin');
    expect(cols.tax_type).toBe('margin');
    expect(JSON.parse(cols.tax_breakdown)).toEqual([{ code: 'MARGIN_VAT', hidden: true, base: 400, rate: 21, amount: 69.42 }]);
  });

  it('settings: nothing is defaulted and a damaged value falls back', () => {
    expect(normalizeMarginScheme(undefined)).toEqual({ enabled: false, defaultFor: 'none', wording: '', vatRate: null, costSource: 'auto' });
    expect(normalizeMarginScheme({ enabled: true, wording: '  x  ', vatRate: 'abc', defaultFor: 'nope', costSource: 'manual' }))
      .toEqual({ enabled: true, defaultFor: 'none', wording: 'x', vatRate: null, costSource: 'manual' });
    expect(stripMarginFigures({ margin_cost: 5, margin_cost_source: 'manual', margin_vat_rate: 21, tax_breakdown: JSON.stringify([{ code: 'VAT' }, { code: 'MARGIN_VAT', hidden: true }]) }))
      .toEqual({ margin_cost: null, margin_cost_source: null, margin_vat_rate: null, tax_breakdown: JSON.stringify([{ code: 'VAT' }]) });
  });
});

describe('settings and refusals', () => {
  it('refuses the margin regime until the scheme is switched on, and wording is required to switch it on', async () => {
    expect((await call('GET', '/settings/margin-scheme', admin)).status).toBe(200);
    const off = await makeInvoice({ taxRegime: 'margin' });
    expect(off.status).toBe(400);
    expect(off.body.error.message ?? off.body.error).toMatch(/margin scheme/i);

    const noWording = await putScheme({ enabled: true });
    expect(noWording.status).toBe(400);
    const ok = await putScheme({ enabled: true, wording: WORDING, vatRate: 21, defaultFor: 'none' });
    expect(ok.status).toBe(200);
    expect((await json(ok)).data).toMatchObject({ enabled: true, wording: WORDING, vatRate: 21, costSource: 'auto' });
    expect((await call('PUT', '/settings/margin-scheme', viewer, { enabled: false })).status).toBe(403);
  });

  it('refuses the regime when the feature is off for the agency, even with the setting on', async () => {
    await setFlag(false);
    try {
      const res = await makeInvoice({ taxRegime: 'margin' });
      expect(res.status).toBe(400);
      expect((await call('GET', '/settings/margin-scheme', admin)).status).toBe(403);
      // An ordinary invoice is untouched
      const plain = await makeInvoice();
      expect(plain.status).toBe(201);
      expect((await invoiceRow(plain.id)).tax_regime).toBe('vat');
    } finally {
      await setFlag(null);
    }
  });

  it('refuses margin as the tax system until the scheme has wording, and the scheme cannot be switched off while it is the tax system', async () => {
    expect((await call('PUT', '/settings/invoice-defaults', admin, { tax_system: 'margin' })).status).toBe(200);
    const got = (await json(await call('GET', '/settings/invoice-defaults', admin))).data;
    expect(got.tax_system).toBe('margin');
    expect((await putScheme({ enabled: false })).status).toBe(400);
    expect((await call('PUT', '/settings/invoice-defaults', admin, { tax_system: 'vat' })).status).toBe(200);
  });
});

describe('invoices under the margin scheme', () => {
  beforeAll(async () => {
    expect((await putScheme({ enabled: true, wording: WORDING, vatRate: 21, defaultFor: 'none', costSource: 'auto' })).status).toBe(200);
  });

  it('a typed cost: total equals the price, no VAT line, the wording is stored, the hidden entry holds the VAT on the margin', async () => {
    const made = await makeInvoice({ taxRegime: 'margin', marginCost: 600 });
    expect(made.status).toBe(201);
    const inv = await invoiceRow(made.id);
    expect(inv).toMatchObject({ tax_regime: 'margin', tax_type: 'margin', total: 1000, total_tax: 0, vat_amount: 0, balance_due: 1000, buyer_tax_id: null, seller_tax_id: null });
    expect(JSON.parse(inv.tax_notes)).toEqual([WORDING]);
    expect(visible(inv)).toEqual([]);
    expect(hidden(inv)).toEqual([{ code: 'MARGIN_VAT', hidden: true, base: 400, rate: 21, amount: 69.42 }]);
    expect([inv.margin_cost, inv.margin_cost_source, inv.margin_vat_rate, inv.margin_wording]).toEqual([600, 'manual', 21, WORDING]);
    expect(made.body.data).toMatchObject({ taxRegime: 'margin', taxBreakdown: [], margin: 400, marginCost: 600 });
    const item = (await rows('SELECT tax_rate, tax_amount, amount FROM invoice_items WHERE invoice_id = ?', made.id))[0];
    expect(item).toEqual({ tax_rate: 0, tax_amount: 0, amount: 1000 });
  });

  it('without a cost, or without the agency rate, the entry says inputs_missing and nothing is invented', async () => {
    const noCost = await invoiceRow((await makeInvoice({ taxRegime: 'margin' })).id);
    expect(noCost.margin_cost).toBeNull();
    expect(hidden(noCost)).toEqual([{ code: 'MARGIN_VAT', hidden: true, status: 'inputs_missing' }]);

    expect((await putScheme({ vatRate: null })).status).toBe(200);
    const noRate = await invoiceRow((await makeInvoice({ taxRegime: 'margin', marginCost: 600 })).id);
    expect(noRate.margin_vat_rate).toBeNull();
    expect(hidden(noRate)).toEqual([{ code: 'MARGIN_VAT', hidden: true, status: 'inputs_missing' }]);
    expect((await putScheme({ vatRate: 21 })).status).toBe(200);
  });

  it('an ordinary invoice of the same agency is unchanged: VAT line, buyer number, no margin figures', async () => {
    const plain = await invoiceRow((await makeInvoice({ taxRegime: 'standard' })).id);
    expect(plain).toMatchObject({ tax_regime: 'vat', total_tax: 210, total: 1210, margin_cost: null, margin_wording: null });
    expect(visible(plain).map((l: any) => [l.code, l.rate, l.amount])).toEqual([['VAT', 21, 210]]);
    expect(hidden(plain)).toEqual([]);
  });

  it('a draft can be moved into the scheme, have its cost typed, and moved out again', async () => {
    const made = await makeInvoice({});
    expect((await invoiceRow(made.id)).tax_regime).toBe('vat');

    let res = await call('PUT', `/invoices/${made.id}`, admin, { taxRegime: 'margin', marginCost: 700 });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    let inv = await invoiceRow(made.id);
    expect(inv).toMatchObject({ tax_regime: 'margin', total: 1000, total_tax: 0, balance_due: 1000, margin_cost: 700, margin_cost_source: 'manual' });
    expect(JSON.parse(inv.tax_notes)).toEqual([WORDING]);
    expect(hidden(inv)[0]).toMatchObject({ base: 300, amount: 52.07 });

    res = await call('PUT', `/invoices/${made.id}`, admin, { marginCost: 500 });
    expect(res.status).toBe(200);
    inv = await invoiceRow(made.id);
    expect(inv.margin_cost).toBe(500);
    expect(hidden(inv)[0]).toMatchObject({ base: 500, amount: 86.78 });

    expect((await call('PUT', `/invoices/${made.id}`, admin, { taxRegime: 'standard' })).status).toBe(400); // lines needed
    res = await call('PUT', `/invoices/${made.id}`, admin, { taxRegime: 'standard', items: [{ description: 'Package', quantity: 1, rate: 1000 }] });
    expect(res.status).toBe(200);
    inv = await invoiceRow(made.id);
    expect(inv).toMatchObject({ tax_regime: 'vat', total: 1210, total_tax: 210, margin_cost: null, margin_wording: null });
    expect(hidden(inv)).toEqual([]);
    expect(inv.tax_notes).toBeNull();

    const plain = await makeInvoice({});
    expect((await call('PUT', `/invoices/${plain.id}`, admin, { marginCost: 5 })).status).toBe(400); // not a margin invoice
  });

  it('the preview shows the wording and no tax, and the margin only to staff who can edit invoices', async () => {
    const body = { items: [{ rate: 1000, quantity: 1 }], taxRegime: 'margin', marginCost: 600 };
    const prev = (await json(await call('POST', '/invoices/tax-preview', admin, body))).data;
    expect(prev).toMatchObject({ regime: 'margin', treatment: 'margin', taxLines: [], totalTax: 0, total: 1000, notes: [WORDING], marginCost: 600, margin: 400, vatOnMargin: 69.42 });
    const seen = (await json(await call('POST', '/invoices/tax-preview', viewer, body))).data;
    expect(seen).toMatchObject({ regime: 'margin', total: 1000 });
    expect(seen.margin).toBeUndefined();
    expect(seen.marginCost).toBeUndefined();
  });

  it('staff without finance rights never get the cost, the margin or the hidden entry', async () => {
    const made = await makeInvoice({ taxRegime: 'margin', marginCost: 600 });
    const asAdmin = (await json(await call('GET', `/invoices/${made.id}`, admin))).data;
    expect(asAdmin.margin_cost).toBe(600);
    expect(JSON.parse(asAdmin.tax_breakdown)).toHaveLength(1);
    const asViewer = (await json(await call('GET', `/invoices/${made.id}`, viewer))).data;
    expect([asViewer.margin_cost, asViewer.margin_cost_source, asViewer.margin_vat_rate]).toEqual([null, null, null]);
    expect(JSON.parse(asViewer.tax_breakdown)).toEqual([]);
    expect(asViewer.margin_wording).toBe(WORDING);
    const list = (await json(await call('GET', `/invoices?search=${encodeURIComponent('Margin Buyer')}&limit=100`, viewer))).data as any[];
    expect(list.length).toBeGreaterThan(0);
    for (const row of list) {
      expect(row.margin_cost ?? null).toBeNull();
      expect(JSON.parse(row.tax_breakdown ?? '[]').filter((e: any) => e.hidden)).toEqual([]);
    }
  });

  it('a credit note keeps the margin regime and the wording and shows no tax', async () => {
    const made = await makeInvoice({ taxRegime: 'margin', marginCost: 600 });
    const res = await call('POST', '/credit-notes', admin, { invoiceId: made.id, reason: 'Cancelled', items: [{ description: 'Refund', quantity: 1, rate: 200 }] });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
    const cn = await invoiceRow((await json(res)).data.id);
    expect(cn).toMatchObject({ type: 'credit_note', tax_regime: 'margin', tax_type: 'margin', total_tax: 0, total: 200, buyer_tax_id: null });
    expect(JSON.parse(cn.tax_notes)).toEqual([WORDING]);
    expect(visible(cn)).toEqual([]);
  });

  it('a duplicate keeps the margin columns', async () => {
    const made = await makeInvoice({ taxRegime: 'margin', marginCost: 600 });
    const dup = await call('POST', `/invoices/${made.id}/duplicate`, admin);
    expect(dup.status).toBe(201);
    const copy = await invoiceRow((await json(dup)).data.id);
    expect([copy.tax_regime, copy.margin_cost, copy.margin_cost_source, copy.margin_wording]).toEqual(['margin', 600, 'manual', WORDING]);
  });
});

describe('where the cost comes from', () => {
  async function departure(currency = 'EUR') {
    n += 1;
    const tour = (await json(await call('POST', '/tours', admin, { code: `MS${n}`, title: `Margin tour ${n}`, durationDays: 4, currency }))).data;
    await call('PUT', `/tours/${tour.id}/prices`, admin, { prices: [{ kind: 'age_band', key: 'adult', label: 'Adult', amount: 1000 }] });
    const dep = (await json(await call('POST', '/departures', admin, { tourId: tour.id, startDate: `2035-0${(n % 9) + 1}-12`, capacityMode: 'manual', capacity: 20 }))).data;
    await call('POST', `/departures/${dep.id}/status`, admin, { status: 'open' });
    return dep.id as string;
  }
  async function booking(depId: string, passengers = 2) {
    n += 1;
    const res = await call('POST', `/departures/${depId}/bookings`, admin, {
      contact: { name: `Margin Payer ${n}`, email: `payer${n}@margin-scheme.test` },
      passengers: Array.from({ length: passengers }, (_, i) => ({ firstName: `P${i}`, ageYears: 40 })),
    });
    expect(res.status).toBe(201);
    return (await json(res)).data;
  }

  beforeAll(async () => {
    expect((await putScheme({ enabled: true, wording: WORDING, vatRate: 21, defaultFor: 'tour_bookings', costSource: 'auto' })).status).toBe(200);
  });

  it('a booking invoice starts in margin mode and costs per-seat costs x seats plus the departure costs shared by the seats', async () => {
    const dep = await departure();
    expect((await call('PUT', `/departures/${dep}/costs`, admin, { costs: [
      { description: 'Coach', kind: 'per_departure', amount: 600, currency: 'EUR' },
      { description: 'Lunch', kind: 'per_seat', amount: 50 },
    ] })).status).toBe(200);
    const b = await booking(dep, 2);
    // Another booking shares the departure: 2 + 4 seats hold the per-departure cost
    await booking(dep, 4);
    const res = await call('POST', `/seat-bookings/${b.id}/invoice`, admin);
    expect(res.status).toBe(200);
    const inv = await invoiceRow((await json(res)).data.invoiceId);
    expect(inv).toMatchObject({ tax_regime: 'margin', total: 2000, total_tax: 0, margin_cost_source: 'departure', margin_wording: WORDING });
    // The booking is held with 2 seats and the other holds 4 more but is not confirmed: only this booking's own seats share the 600
    expect(inv.margin_cost).toBe(600 / 2 + 50 * 2);
    expect(hidden(inv)[0]).toMatchObject({ base: 2000 - 400, rate: 21, amount: 277.69 });
    expect(visible(inv)).toEqual([]);
  });

  it('adding a passenger refreshes the draft and its cost, and a typed cost is kept', async () => {
    const dep = await departure();
    await call('PUT', `/departures/${dep}/costs`, admin, { costs: [{ description: 'Lunch', kind: 'per_seat', amount: 100 }] });
    const b = await booking(dep, 1);
    const first = (await json(await call('POST', `/seat-bookings/${b.id}/invoice`, admin))).data;
    expect((await invoiceRow(first.invoiceId)).margin_cost).toBe(100);

    const detail = (await json(await call('GET', `/seat-bookings/${b.id}`, admin))).data;
    const kept = detail.passengers.map((p: any) => ({ id: p.id, firstName: p.firstName, ageYears: p.ageYears }));
    await call('PUT', `/seat-bookings/${b.id}/passengers`, admin, { passengers: [...kept, { firstName: 'Extra', ageYears: 30 }] });
    // The seat count on the booking follows its active passengers
    await DB.prepare('UPDATE seat_bookings SET seats = 2 WHERE id = ?').bind(b.id).run();
    const again = (await json(await call('POST', `/seat-bookings/${b.id}/invoice`, admin))).data;
    expect(again).toMatchObject({ created: false, total: 2000 });
    const refreshed = await invoiceRow(first.invoiceId);
    expect(refreshed).toMatchObject({ tax_regime: 'margin', total: 2000, margin_cost: 200, margin_cost_source: 'departure' });
    expect(hidden(refreshed)[0]).toMatchObject({ base: 1800 });

    expect((await call('PUT', `/invoices/${first.invoiceId}`, admin, { marginCost: 321 })).status).toBe(200);
    await call('POST', `/seat-bookings/${b.id}/invoice`, admin);
    expect(await invoiceRow(first.invoiceId)).toMatchObject({ margin_cost: 321, margin_cost_source: 'manual' });
  });

  it('without departure costs it takes the booking itinerary cost, and nothing when there is none', async () => {
    const dep = await departure();
    const b = await booking(dep, 1);
    const lead = (await rows('SELECT lead_id, contact_id FROM seat_bookings WHERE id = ?', b.id))[0];
    await DB.prepare(`INSERT INTO itineraries (id, lead_id, title, total_cost, currency) VALUES ('r152-itin-1', ?, 'Costed trip', 700, 'EUR')`).bind(lead.lead_id).run();
    await DB.prepare('UPDATE seat_bookings SET itinerary_id = ? WHERE id = ?').bind('r152-itin-1', b.id).run();
    const made = (await json(await call('POST', `/seat-bookings/${b.id}/invoice`, admin))).data;
    expect(await invoiceRow(made.invoiceId)).toMatchObject({ tax_regime: 'margin', margin_cost: 700, margin_cost_source: 'itinerary' });

    const other = await booking(await departure(), 1);
    const bare = (await json(await call('POST', `/seat-bookings/${other.id}/invoice`, admin))).data;
    const inv = await invoiceRow(bare.invoiceId);
    expect(inv.margin_cost).toBeNull();
    expect(hidden(inv)).toEqual([{ code: 'MARGIN_VAT', hidden: true, status: 'inputs_missing' }]);
  });

  it('an invoice made from an itinerary uses that itinerary cost', async () => {
    const cid = await contact();
    const leadId = '0196c139-0000-7000-8000-0000000052a1';
    await DB.prepare(`INSERT INTO leads (id, contact_id, title, created_by) VALUES (?, ?, 'Itinerary lead', '11111111-1111-1111-1111-111111111111')`).bind(leadId, cid).run();
    await DB.prepare(`INSERT INTO itineraries (id, lead_id, title, total_cost, currency) VALUES ('r152-itin-2', ?, 'Rome', 450, 'EUR')`).bind(leadId).run();
    await DB.prepare(`INSERT INTO itinerary_days (id, itinerary_id, day_number, title) VALUES ('r152-day-2', 'r152-itin-2', 1, 'Day 1')`).run();
    await DB.prepare(`INSERT INTO itinerary_items (id, day_id, type, title, selling_price, quantity, sort_order) VALUES ('r152-item-2', 'r152-day-2', 'hotel', 'Hotel', 900, 1, 0)`).run();
    // defaultFor tour_bookings: an itinerary invoice stays ordinary; all_invoices puts it under the scheme
    let res = await call('POST', '/invoices/from-itinerary', admin, { itineraryId: 'r152-itin-2' });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
    expect((await invoiceRow((await json(res)).data.id)).tax_regime).toBe('vat');

    expect((await putScheme({ defaultFor: 'all_invoices' })).status).toBe(200);
    res = await call('POST', '/invoices/from-itinerary', admin, { itineraryId: 'r152-itin-2' });
    expect(res.status).toBe(201);
    const inv = await invoiceRow((await json(res)).data.id);
    expect(inv).toMatchObject({ tax_regime: 'margin', total: 900, total_tax: 0, margin_cost: 450, margin_cost_source: 'itinerary' });
    expect(hidden(inv)[0]).toMatchObject({ base: 450, amount: 78.1 });
    // A manual invoice follows the same default
    expect((await invoiceRow((await makeInvoice({})).id)).tax_regime).toBe('margin');
    // ...unless the person picks the ordinary regime
    expect((await invoiceRow((await makeInvoice({ taxRegime: 'standard' })).id)).tax_regime).toBe('vat');
    expect((await putScheme({ defaultFor: 'tour_bookings' })).status).toBe(200);
  });

  it('with the manual cost source, a booking invoice records no cost until a person types one', async () => {
    expect((await putScheme({ costSource: 'manual' })).status).toBe(200);
    try {
      const dep = await departure();
      await call('PUT', `/departures/${dep}/costs`, admin, { costs: [{ description: 'Lunch', kind: 'per_seat', amount: 100 }] });
      const b = await booking(dep, 1);
      const made = (await json(await call('POST', `/seat-bookings/${b.id}/invoice`, admin))).data;
      const inv = await invoiceRow(made.invoiceId);
      expect([inv.margin_cost, inv.margin_cost_source]).toEqual([null, 'manual']);
    } finally {
      await putScheme({ costSource: 'auto' });
    }
  });

  it('a departure cost in another currency than the invoice is not converted: the cost stays unrecorded', async () => {
    const dep = await departure('EUR');
    await call('PUT', `/departures/${dep}/costs`, admin, { costs: [{ description: 'Coach', kind: 'per_departure', amount: 600, currency: 'USD' }] });
    const b = await booking(dep, 1);
    const made = (await json(await call('POST', `/seat-bookings/${b.id}/invoice`, admin))).data;
    expect((await invoiceRow(made.invoiceId)).margin_cost).toBeNull();
  });

  it('an extras invoice of a booking follows the booking default', async () => {
    const dep = await departure();
    const b = await booking(dep, 1);
    const lead = (await rows('SELECT contact_id, lead_id FROM seat_bookings WHERE id = ?', b.id))[0];
    expect(lead).toBeTruthy();
    const { createInvoice } = await import('../src/services/domain/invoices');
    const made = await createInvoice(testEnv, TENANT_ID, DB, {
      contactId: lead.contact_id, type: 'tax_invoice', origin: 'extras', currency: 'EUR',
      items: [{ description: 'Boat trip', quantity: 1, rate: 80, discountPercent: 0 }],
    }, { userId: null });
    const inv = await invoiceRow(made.id);
    expect(inv).toMatchObject({ tax_regime: 'margin', total: 80, total_tax: 0 });
    expect(inv.margin_cost).toBeNull();
  });
});

describe('the margin scheme report', () => {
  const report = async (path = '/reports/margin_scheme_report?per_page=100') => {
    const res = await call('GET', path, admin);
    expect(res.status, await res.clone().text()).toBe(200);
    return (await json(res)).data;
  };

  beforeAll(async () => {
    await DB.prepare(`DELETE FROM invoices WHERE tax_regime = 'margin'`).run();
    expect((await putScheme({ enabled: true, wording: WORDING, vatRate: 21, defaultFor: 'none', costSource: 'auto' })).status).toBe(200);
  });

  it('lists margin invoices with cost, margin and VAT on the margin; incomplete rows are marked and left out of the totals', async () => {
    const a = (await makeInvoice({ taxRegime: 'margin', marginCost: 600 }, 1000)).id;
    const b = (await makeInvoice({ taxRegime: 'margin', marginCost: 1500 }, 2000)).id;
    const c = (await makeInvoice({ taxRegime: 'margin' }, 500)).id;
    const draft = (await makeInvoice({ taxRegime: 'margin', marginCost: 1 }, 100)).id;
    for (const id of [a, b, c]) await DB.prepare(`UPDATE invoices SET status = 'sent' WHERE id = ?`).bind(id).run();
    await DB.prepare(`UPDATE invoices SET issue_date = '2035-03-10' WHERE id IN (?, ?, ?, ?)`).bind(a, b, c, draft).run();

    const data = await report();
    const byId = new Map<string, any>(data.data.map((r: any) => [r.invoice_id, r]));
    expect(byId.has(draft)).toBe(false); // a draft is not issued yet
    expect(byId.get(a)).toMatchObject({ total_amount: 1000, cost: 600, margin: 400, vat_rate: 21, vat_on_margin: 69.42, completeness: 'complete' });
    expect(byId.get(b)).toMatchObject({ total_amount: 2000, cost: 1500, margin: 500, vat_on_margin: 86.78, completeness: 'complete' });
    expect(byId.get(c)).toMatchObject({ total_amount: 500, cost: null, margin: null, vat_on_margin: null, completeness: 'costs_missing' });

    expect(data.summary).toMatchObject({ complete: 2, incomplete: 1, rateMissing: 0 });
    expect(data.summary.notice).toBe('For your accountant: figures are computed from the costs recorded in TravelCRM');
    expect(data.summary.totals).toEqual([{ currency: 'EUR', invoices: 2, total: 3000, cost: 2100, margin: 900, vatOnMargin: 156.2 }]);
  });

  it('the VAT column is blank when the agency has not entered a rate', async () => {
    const id = (await makeInvoice({ taxRegime: 'margin', marginCost: 600 }, 1000)).id;
    await DB.prepare(`UPDATE invoices SET status = 'sent', issue_date = '2035-04-10', margin_vat_rate = NULL WHERE id = ?`).bind(id).run();
    expect((await putScheme({ vatRate: null })).status).toBe(200);
    try {
      const data = await report('/reports/margin_scheme_report?per_page=100&date_from=2035-04-01&date_to=2035-04-30');
      expect(data.data).toHaveLength(1);
      expect(data.data[0]).toMatchObject({ cost: 600, margin: 400, vat_rate: null, vat_on_margin: null, completeness: 'complete' });
      expect(data.summary).toMatchObject({ complete: 1, incomplete: 0, rateMissing: 1 });
      expect(data.summary.totals[0]).toMatchObject({ total: 1000, margin: 400, vatOnMargin: null });
    } finally {
      expect((await putScheme({ vatRate: 21 })).status).toBe(200);
    }
    // With a rate entered later, an invoice made without one is computed with the agency's current rate
    const later = await report('/reports/margin_scheme_report?per_page=100&date_from=2035-04-01&date_to=2035-04-30');
    expect(later.data[0]).toMatchObject({ vat_rate: 21, vat_on_margin: 69.42 });
  });

  it('counts the credit notes of margin invoices without netting them', async () => {
    const inv = (await makeInvoice({ taxRegime: 'margin', marginCost: 600 }, 1000)).id;
    await DB.prepare(`UPDATE invoices SET status = 'sent', issue_date = '2035-05-10' WHERE id = ?`).bind(inv).run();
    const res = await call('POST', '/credit-notes', admin, { invoiceId: inv, reason: 'x', items: [{ description: 'Refund', quantity: 1, rate: 100 }] });
    expect(res.status).toBe(201);
    const cn = (await json(res)).data.id;
    await DB.prepare(`UPDATE invoices SET status = 'issued', issue_date = '2035-05-11' WHERE id = ?`).bind(cn).run();
    const data = await report('/reports/margin_scheme_report?per_page=100&date_from=2035-05-01&date_to=2035-05-31');
    expect(data.data).toHaveLength(1);
    expect(data.summary.totals[0]).toMatchObject({ total: 1000, margin: 400 });
    expect(data.summary.creditNotes).toEqual({ count: 1, total: 100 });
  });

  it('the tax report leaves margin invoices out and points to this report', async () => {
    const m = (await makeInvoice({ taxRegime: 'margin', marginCost: 600 }, 1000)).id;
    const v = (await makeInvoice({ taxRegime: 'standard' }, 1000)).id;
    await DB.prepare(`UPDATE invoices SET status = 'sent' WHERE id IN (?, ?)`).bind(m, v).run();
    const ordinary = (await rows(`SELECT COALESCE(SUM(total_tax), 0) AS t FROM invoices WHERE type = 'tax_invoice' AND status IN ('paid', 'partially_paid', 'sent') AND tax_regime != 'margin'`))[0].t;
    const tax = await report('/reports/tax_report');
    expect(tax.data[0].total_tax).toBe(ordinary);
    expect(tax.summary.pointer).toMatchObject({ reportId: 'margin_scheme_report' });
    expect(tax.summary.pointer.invoices).toBeGreaterThan(0);
  });

  it('the report is hidden and refused when the feature is off', async () => {
    await setFlag(false);
    try {
      expect((await call('GET', '/reports/margin_scheme_report', admin)).status).toBe(403);
      const list = (await json(await call('GET', '/reports', admin))).data as Array<{ id: string }>;
      expect(list.some((r) => r.id === 'margin_scheme_report')).toBe(false);
    } finally {
      await setFlag(null);
    }
    const list = (await json(await call('GET', '/reports', admin))).data as Array<{ id: string }>;
    expect(list.some((r) => r.id === 'margin_scheme_report')).toBe(true);
    expect((await call('GET', '/reports/margin_scheme_report', viewer)).status).toBe(403);
  });
});
