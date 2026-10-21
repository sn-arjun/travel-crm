import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/index';
import allowlist from './fixtures/india-literals-allowlist.json';
import { formatMoney } from '../src/utils/money';
import { createLead } from '../src/services/domain/leads';
import { RowInserter } from '../src/services/imports/row-inserter';
import { ImportValidator } from '../src/services/imports/import-validator';
import { TemplateGenerator } from '../src/services/imports/template-generator';
import { describeRule } from '../src/services/automation/custom-rules';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../src/db/tenant-schema';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const LOCALE_KEYS = ['currency', 'locale', 'timezone', 'company_timezone', 'country', 'company_country', 'phone_default_country', 'date_format'];

// ── Guard: no India literal in backend/src outside the allow-list ────────────
// Vite inlines the source of every file; the literals are built from parts so this file never matches itself.
const sources = (import.meta as any).glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const LITERALS = [
  /(['"`])INR\1/,
  /(['"`])en-IN\1/,
  /(['"`])Asia\/Kolkata\1/,
];
const allowed = new Map<string, string>((allowlist as { file: string; reason: string }[]).map((e) => [e.file, e.reason]));
const rel = (key: string) => key.replace(/^\.\.\/src\//, '');

describe('R138 guard: no rupee or India default in backend/src', () => {
  it('finds the source files', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(100);
  });

  it('has no INR, en-IN or Asia/Kolkata literal outside the allow-list', () => {
    const offenders: string[] = [];
    for (const [key, text] of Object.entries(sources)) {
      const file = rel(key);
      if (allowed.has(file)) continue;
      text.split(/\r?\n/).forEach((line, i) => {
        if (LITERALS.some((re) => re.test(line))) offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 120)}`);
      });
    }
    expect(offenders, `India literal outside the allow-list (use the agency's locale context, or add the file with a reason to test/fixtures/india-literals-allowlist.json):\n${offenders.join('\n')}`).toEqual([]);
  });

  it('keeps the allow-list honest: every entry exists, has a reason and still holds a literal', () => {
    for (const [file, reason] of allowed) {
      const key = Object.keys(sources).find((k) => rel(k) === file);
      expect(key, `${file} is on the allow-list but does not exist`).toBeTruthy();
      expect(reason.length).toBeGreaterThan(10);
      expect(LITERALS.some((re) => sources[key!].split(/\r?\n/).some((line) => re.test(line))), `${file} no longer holds a literal: remove it from the allow-list`).toBe(true);
    }
  });
});

// ── Behaviour: the agency's own currency, locale and zone everywhere ─────────
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

async function setLocale(values: Record<string, string>): Promise<void> {
  await testEnv.MASTER_DB.prepare(`DELETE FROM settings WHERE key IN (${LOCALE_KEYS.map(() => '?').join(',')})`).bind(...LOCALE_KEYS).run();
  for (const [k, v] of Object.entries(values)) {
    await testEnv.MASTER_DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)').bind(k, v, new Date().toISOString()).run();
  }
}

/** Every Flate stream of a PDF, inflated and read as latin1 (pdf-lib writes text as hex strings in WinAnsi). */
async function pdfStreams(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  const raw = new TextDecoder('latin1').decode(bytes);
  let out = '';
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    try {
      // The end-of-line before endstream is not part of the Flate data.
      const trim = pdfEolLength(raw, end);
      const ds = new Blob([bytes.slice(start, end - trim)]).stream().pipeThrough(new DecompressionStream('deflate'));
      out += new TextDecoder('latin1').decode(await new Response(ds).arrayBuffer());
    } catch {
      // not a Flate stream (font or image data)
    }
    re.lastIndex = end;
  }
  return out;
}

/** The hex string pdf-lib writes for a text drawn in a standard font (WinAnsi: the euro sign is 0x80). */
const winAnsiHex = (text: string) =>
  [...text].map((ch) => (ch === '€' ? 0x80 : ch === '£' ? 0xa3 : ch.charCodeAt(0)).toString(16).toUpperCase().padStart(2, '0')).join('');

let admin = '';
let seq = 0;

async function makeLead(): Promise<{ contactId: string; leadId: string }> {
  seq += 1;
  const contactId = ((await (await call('POST', '/contacts', admin, { name: `R138 Buyer ${seq}`, phone: `9100008${String(seq).padStart(3, '0')}`, type: 'customer' })).json()) as any).data.id;
  const leadRes = await call('POST', '/leads', admin, {
    contactId, title: `R138 lead ${seq}`, destinations: ['Lisbon'], travelDate: '2027-03-01', tripType: 'international', source: 'manual',
  });
  expect(leadRes.status).toBe(201);
  const lead = ((await leadRes.json()) as any).data;
  return { contactId, leadId: lead.id };
}

describe.each([
  { name: 'EUR agency', currency: 'EUR', locale: 'en-IE', timezone: 'Europe/Berlin', country: 'DE' },
  { name: 'GBP agency', currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London', country: 'GB' },
])('R138 behaviour: $name never sees INR', ({ currency, locale, timezone, country }) => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    admin = ((await (await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID })).json()) as any).data.accessToken;
    await setLocale({ currency, locale, timezone, country });
  });

  it('a lead from the API without a currency takes the agency currency', async () => {
    const { leadId } = await makeLead();
    const lead = ((await (await call('GET', `/leads/${leadId}`, admin)).json()) as any).data;
    expect(lead.currency).toBe(currency);
  });

  it('a lead from a channel (web form, assistant) takes the agency currency', async () => {
    const { contactId } = await makeLead();
    const { id } = await createLead(testEnv, TENANT_ID, testEnv.MASTER_DB, { contactId, title: 'Web form enquiry', destinations: [], source: 'website', assignedTo: null }, { userId: null });
    const row = await testEnv.MASTER_DB.prepare('SELECT currency FROM leads WHERE id = ?').bind(id).first();
    expect(row.currency).toBe(currency);
    const explicit = await createLead(testEnv, TENANT_ID, testEnv.MASTER_DB, { contactId, title: 'Quote in dollars', destinations: [], source: 'website', assignedTo: null, currency: 'usd' }, { userId: null });
    expect((await testEnv.MASTER_DB.prepare('SELECT currency FROM leads WHERE id = ?').bind(explicit.id).first()).currency).toBe('USD');
  });

  it('POST /itineraries without a currency takes the agency currency, and the PDF prints that currency in the agency format', async () => {
    const { leadId } = await makeLead();
    const res = await call('POST', '/itineraries', admin, {
      leadId, title: 'Lisbon week',
      days: [{ dayNumber: 1, title: 'Arrival', items: [{ type: 'hotel', title: 'Hotel Baixa', costPrice: 800, sellingPrice: 1234.5 }] }],
    });
    expect(res.status).toBe(201);
    const itinerary = ((await res.json()) as any).data;
    expect(itinerary.currency).toBe(currency);

    const pdf = await call('GET', `/itineraries/${itinerary.id}/pdf`, admin);
    expect(pdf.status).toBe(200);
    const buf = await pdf.arrayBuffer();
    const text = await pdfStreams(buf);
    expect(text).toContain(winAnsiHex(formatMoney(1234.5, currency, locale)));
    expect(text).not.toContain(winAnsiHex('INR'));
  });

  it('a quote from a template takes the template currency, else the agency currency', async () => {
    const { leadId } = await makeLead();
    const day = { dayNumber: 1, title: 'Day 1', items: [{ type: 'activity', title: 'Tram 28', costPrice: 10, sellingPrice: 20 }] };
    const plain = ((await (await call('POST', '/itinerary-templates', admin, { title: 'Plain', templateData: JSON.stringify({ days: [day] }) })).json()) as any).data;
    const own = ((await (await call('POST', '/itinerary-templates', admin, { title: 'Own currency', templateData: JSON.stringify({ currency: 'aed', days: [day] }) })).json()) as any).data;

    const fromPlain = await call('POST', '/itinerary-templates/create-from', admin, { templateId: plain.id, leadId });
    expect(fromPlain.status).toBe(201);
    const planId = ((await fromPlain.json()) as any).data.id;
    expect((await testEnv.MASTER_DB.prepare('SELECT currency FROM itineraries WHERE id = ?').bind(planId).first()).currency).toBe(currency);
    const fromOwn = await call('POST', '/itinerary-templates/create-from', admin, { templateId: own.id, leadId });
    expect((await testEnv.MASTER_DB.prepare('SELECT currency FROM itineraries WHERE id = ?').bind(((await fromOwn.json()) as any).data.id).first()).currency).toBe('AED');
  });

  it('a credit note takes its invoice currency, else the agency currency', async () => {
    const { contactId, leadId } = await makeLead();
    const invoice = ((await (await call('POST', '/invoices', admin, { contactId, leadId, currency: 'EUR', items: [{ description: 'Tour', quantity: 1, rate: 500 }] })).json()) as any).data;
    const note = await call('POST', '/credit-notes', admin, { invoiceId: invoice.id, reason: 'Refund', items: [{ description: 'Tour refund', quantity: 1, rate: 100 }] });
    expect(note.status).toBe(201);
    const row = await testEnv.MASTER_DB.prepare('SELECT currency FROM invoices WHERE id = ?').bind(((await note.json()) as any).data.id).first();
    expect(row.currency).toBe(invoice.currency ?? currency);
    expect(row.currency).not.toBe('INR');
  });

  it('a planner event without a time zone takes the agency zone', async () => {
    const res = await call('POST', '/events', admin, { title: 'Supplier call', event_type: 'meeting', start_at: '2027-03-01T10:00:00Z' });
    expect(res.status).toBe(201);
    const id = ((await res.json()) as any).data.id;
    const row = await testEnv.MASTER_DB.prepare('SELECT timezone FROM events WHERE id = ?').bind(id).first();
    expect(row.timezone).toBe(timezone);
    const own = ((await (await call('POST', '/events', admin, { title: 'Own zone', event_type: 'meeting', start_at: '2027-03-01T10:00:00Z', timezone: 'Asia/Dubai' })).json()) as any).data.id;
    expect((await testEnv.MASTER_DB.prepare('SELECT timezone FROM events WHERE id = ?').bind(own).first()).timezone).toBe('Asia/Dubai');
  });

  it('rate cards, the invoice-defaults fallbacks and the itinerary defaults follow the agency', async () => {
    const rc = await call('POST', '/rate-cards', admin, { serviceType: 'hotel', name: 'Double room', costPrice: 80, unit: 'per_room' });
    expect(rc.status).toBe(201);
    expect(((await rc.json()) as any).data.currency).toBe(currency);

    const defaults = ((await (await call('GET', '/settings/itinerary-defaults', admin)).json()) as any).data;
    expect(defaults.defaultCurrency).toBe(currency);

    const tax = ((await (await call('GET', '/settings/invoice-defaults', admin)).json()) as any).data;
    expect(tax.tax_system).toBe('vat');
    expect(tax.default_tax_type).toBe('vat');
    expect(tax.default_tax_rate).not.toBe(18);
  });

  it('an import row without a currency takes the agency currency, and the template lists it first', async () => {
    const validator = new ImportValidator();
    const checked = await validator.validateRow('rate_cards', { supplierName: 'X', serviceType: 'hotel', costPrice: 10 });
    expect(checked.isValid).toBe(true);
    expect(checked.validData.currency).toBeUndefined();

    const db = drizzle(testEnv.MASTER_DB, { schema });
    const supplierId = crypto.randomUUID();
    await testEnv.MASTER_DB.prepare("INSERT INTO suppliers (id, company_name, category) VALUES (?, 'R138 Hotels', 'hotel')").bind(supplierId).run();
    const inserter = new RowInserter(currency);
    const inserted = await inserter.insertRow(db as any, 'rate_cards', { supplierName: 'R138 Hotels', serviceType: 'hotel', costPrice: 10 }, 'create', undefined, '11111111-1111-1111-1111-111111111111');
    expect(inserted).toBe(true);
    {
      const row = await testEnv.MASTER_DB.prepare("SELECT currency FROM rate_cards WHERE supplier_id = ? ORDER BY created_at DESC LIMIT 1").bind(supplierId).first();
      expect(row.currency).toBe(currency);
    }

    const xlsx = new TemplateGenerator().generateTemplate('rate_cards', currency);
    expect(xlsx.length).toBeGreaterThan(0);
  });

  it('a custom rule description formats numbers with the agency locale', () => {
    const rule: any = {
      name: 'Big', trigger: 'lead_created', conditions: [{ field: 'budget', op: 'gte', value: '1234567' }], actions: [{ type: 'create_task', title: 'Call' }],
    };
    const text = describeRule(rule, locale);
    expect(text).not.toContain('12,34,567');
  });
});

describe('R138 behaviour: an INR agency still gets INR everywhere', () => {
  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    admin = ((await (await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID })).json()) as any).data.accessToken;
    await setLocale({ currency: 'INR', locale: 'en-IN', timezone: 'Asia/Kolkata', country: 'IN' });
  });

  it('leads, itineraries and planner events keep the rupee and the Indian zone', async () => {
    const { leadId } = await makeLead();
    expect(((await (await call('GET', `/leads/${leadId}`, admin)).json()) as any).data.currency).toBe('INR');
    const itin = ((await (await call('POST', '/itineraries', admin, {
      leadId, title: 'Goa', days: [{ dayNumber: 1, items: [] }],
    })).json()) as any).data;
    expect(itin.currency).toBe('INR');
    const ev = ((await (await call('POST', '/events', admin, { title: 'Call', event_type: 'meeting', start_at: '2027-03-01T10:00:00Z' })).json()) as any).data.id;
    expect((await testEnv.MASTER_DB.prepare('SELECT timezone FROM events WHERE id = ?').bind(ev).first()).timezone).toBe('Asia/Kolkata');
    const tax = ((await (await call('GET', '/settings/invoice-defaults', admin)).json()) as any).data;
    expect(tax.default_tax_type).toBe('gst');
    expect(tax.default_tax_rate).toBe(18);
  });
});

/** Length of the line break right before `endstream` (it is not part of the Flate data). */
function pdfEolLength(raw: string, end: number): number {
  if (raw.charCodeAt(end - 1) !== 10) return 0;
  return raw.charCodeAt(end - 2) === 13 ? 2 : 1;
}
