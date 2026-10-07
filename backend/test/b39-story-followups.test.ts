import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { generateId } from '../src/utils/uuid';
import { getCurrentFinancialYear } from '../src/services/numbering';

/**
 * B39: numbering prefixes, E.164 fleet phones (+ data migration), tenant summary on auth, lead activity `meta`.
 * Clocks are fixed instants (IST = UTC+05:30).
 */
const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const db = testEnv.MASTER_DB as D1Database;

async function raw(method: string, path: string, token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`http://localhost/api/v1${path}`, init), testEnv, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
async function api(method: string, path: string, token: string, body?: unknown) {
  const res = await raw(method, path, token, body);
  return { status: res.status, body: (await res.json()) as any };
}

let token = '';
let contactId = '';
let leadId = '';

afterEach(() => vi.useRealTimers());

beforeAll(async () => {
  await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
  expect((await raw('POST', '/test/reset', null)).status).toBe(200);
  const login = await raw('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
  token = ((await login.json()) as any).data.accessToken;
  const contact = await api('POST', '/contacts', token, { name: 'B39 Contact', email: 'b39@example.com', phone: '+919876500039', type: 'customer', source: 'manual' });
  contactId = contact.body.data.id;
  const lead = await api('POST', '/leads', token, {
    contactId, title: 'B39 Lead', destinations: ['Goa'], travelDate: '2026-12-15', returnDate: '2026-12-22',
    budget: 100000, source: 'manual', priority: 'warm', tripType: 'domestic',
  });
  leadId = lead.body.data.id;
});

async function setNumbering(cfg: Record<string, unknown> | null) {
  await db.prepare("DELETE FROM settings WHERE key = 'numbering_config'").run();
  if (cfg) {
    await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('numbering_config', ?, datetime('now'))")
      .bind(JSON.stringify(cfg)).run();
  }
}
async function resetCounters() {
  await db.prepare("DELETE FROM settings WHERE key LIKE 'last_%_number_%'").run();
  await db.prepare("DELETE FROM invoice_items").run();
  await db.prepare("DELETE FROM invoices").run();
}
const item = { description: 'Tour', quantity: 1, rate: 1000, taxRate: 5 };
async function mkInvoice(type: 'tax_invoice' | 'proforma' = 'tax_invoice') {
  const r = await api('POST', '/invoices', token, { contactId, type, items: [item] });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.data as any;
}
const numberOf = (d: any): string => d.invoiceNumber ?? d.invoice_number;

describe('B39 document numbering', () => {
  it('defaults are unchanged when no numbering settings exist', async () => {
    await resetCounters(); await setNumbering(null);
    const fy = getCurrentFinancialYear();
    expect(numberOf(await mkInvoice())).toBe(`INV-${fy}-0001`);
    expect(numberOf(await mkInvoice('proforma'))).toBe(`PI-${fy}-0001`);
  });

  it('applies the configured prefix per document type and keeps numbers sequential and unique', async () => {
    await resetCounters();
    await setNumbering({
      invoice_prefix: 'SH-INV', proforma_prefix: 'SH-PI', credit_note_prefix: 'SH-CN', debit_note_prefix: 'SH-DN',
      receipt_prefix: 'SH-RCP', voucher_prefix: 'SH-VCH', fy_start_month: 4, reset_yearly: true,
    });
    const fy = getCurrentFinancialYear();
    const a = await mkInvoice();
    const b = await mkInvoice();
    expect(numberOf(a)).toBe(`SH-INV-${fy}-0001`);
    expect(numberOf(b)).toBe(`SH-INV-${fy}-0002`);
    expect(numberOf(await mkInvoice('proforma'))).toBe(`SH-PI-${fy}-0001`);

    const cn = await api('POST', '/credit-notes', token, { invoiceId: a.id, reason: 'Adjustment', items: [item] });
    expect(cn.status, JSON.stringify(cn.body)).toBe(201);
    expect(numberOf(cn.body.data)).toBe(`SH-CN-${fy}-0001`);
    const dn = await api('POST', '/debit-notes', token, { invoiceId: a.id, reason: 'Extra', items: [item] });
    expect(dn.status, JSON.stringify(dn.body)).toBe(201);
    expect(numberOf(dn.body.data)).toBe(`SH-DN-${fy}-0001`);
  });

  it('continues the sequence after the prefix changes and never collides under parallel creation', async () => {
    await resetCounters();
    await setNumbering({ invoice_prefix: 'AAA' });
    const fy = getCurrentFinancialYear();
    expect(numberOf(await mkInvoice())).toBe(`AAA-${fy}-0001`);
    await setNumbering({ invoice_prefix: 'BBB' });
    expect(numberOf(await mkInvoice())).toBe(`BBB-${fy}-0002`);

    const batch = await Promise.all([mkInvoice(), mkInvoice(), mkInvoice(), mkInvoice()]);
    const nums = batch.map(numberOf);
    expect(new Set(nums).size).toBe(4);
    expect(nums.sort()).toEqual([`BBB-${fy}-0003`, `BBB-${fy}-0004`, `BBB-${fy}-0005`, `BBB-${fy}-0006`]);
  });

  it('honours padding and sanitises a hostile prefix; an empty prefix falls back to the default', async () => {
    await resetCounters();
    const fy = getCurrentFinancialYear();
    await setNumbering({ invoice_prefix: ' s h/inv!! ', padding: 6 });
    expect(numberOf(await mkInvoice())).toBe(`sh/inv-${fy}-000001`);
    await setNumbering({ invoice_prefix: '   ' });
    expect(numberOf(await mkInvoice())).toBe(`INV-${fy}-0002`);
  });

  it('skips a number already taken by another document type that shares the prefix', async () => {
    await resetCounters();
    const fy = getCurrentFinancialYear();
    await setNumbering({ invoice_prefix: 'SAME', proforma_prefix: 'SAME' });
    const inv = await mkInvoice(); // SAME-fy-0001 (invoice counter)
    const pi = await mkInvoice('proforma'); // proforma counter also 1 -> clashes, must move to 0002
    expect(numberOf(inv)).toBe(`SAME-${fy}-0001`);
    expect(numberOf(pi)).toBe(`SAME-${fy}-0002`);
  });

  it('the financial-year token follows the tenant calendar and fy_start_month', () => {
    // 2027-03-31T19:00Z = 1 Apr 2027 00:30 IST -> new FY 2027-28 (UTC date is still 31 Mar)
    expect(getCurrentFinancialYear('Asia/Kolkata', new Date('2027-03-31T19:00:00Z'))).toBe('2027-28');
    expect(getCurrentFinancialYear('Asia/Kolkata', new Date('2027-03-31T17:00:00Z'))).toBe('2026-27');
    expect(getCurrentFinancialYear('Asia/Kolkata', new Date('2026-10-07T06:00:00Z'), 1)).toBe('2026');
    expect(getCurrentFinancialYear('Asia/Kolkata', new Date('2026-10-07T06:00:00Z'), 10)).toBe('2026-27');
    expect(getCurrentFinancialYear('Asia/Kolkata', new Date('2026-09-30T06:00:00Z'), 10)).toBe('2025-26');
  });
});

describe('B39 fleet phones', () => {
  let vehicleId = '';
  let driverId = '';
  let n = 0;
  beforeAll(async () => {
    const v = await api('POST', '/fleet/vehicles', token, { registrationNumber: 'MH01B39', type: 'sedan' });
    vehicleId = v.body.data.id;
    const d = await api('POST', '/fleet/drivers', token, { name: 'B39 Driver', phone: '9820100039', emergencyContactPhone: '098201 00040' });
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    driverId = d.body.data.id;
    expect(d.body.data.phone).toBe('+919820100039');
    const row = await db.prepare('SELECT emergency_contact_phone AS p FROM drivers WHERE id = ?').bind(driverId).first<{ p: string }>();
    expect(row?.p).toBe('+919820100040');
  });

  const mkTrip = (passengerPhone?: string) => {
    n += 1;
    const day = String(10 + n).padStart(2, '0');
    return api('POST', '/fleet/trips', token, {
      vehicleId, driverId, pickupDatetime: `2027-01-${day}T04:00:00Z`, dropDatetime: `2027-01-${day}T10:00:00Z`,
      passengerName: 'Pax', ...(passengerPhone === undefined ? {} : { passengerPhone }),
    });
  };
  const stored = async (id: string) =>
    (await db.prepare('SELECT passenger_phone AS p FROM trip_assignments WHERE id = ?').bind(id).first<{ p: string | null }>())?.p;

  for (const input of ['9820144562', '098201 44562', '+91 98201 44562', '91-9820144562']) {
    it(`POST /fleet/trips stores "${input}" as +919820144562`, async () => {
      const r = await mkTrip(input);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(await stored(r.body.data.id)).toBe('+919820144562');
    });
  }

  it('empty or missing passenger phone stays null', async () => {
    const a = await mkTrip('');
    expect(await stored(a.body.data.id)).toBeNull();
    const b = await mkTrip();
    expect(await stored(b.body.data.id)).toBeNull();
  });

  it('PUT /fleet/trips normalises and can clear the phone', async () => {
    const t = await mkTrip();
    const put = await api('PUT', `/fleet/trips/${t.body.data.id}`, token, { passengerPhone: '98201 44562' });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(await stored(t.body.data.id)).toBe('+919820144562');
    await api('PUT', `/fleet/trips/${t.body.data.id}`, token, { passengerPhone: '' });
    expect(await stored(t.body.data.id)).toBeNull();
  });

  it('PUT /fleet/drivers normalises emergencyContactPhone', async () => {
    const put = await api('PUT', `/fleet/drivers/${driverId}`, token, { emergencyContactPhone: '9000011111' });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    const row = await db.prepare('SELECT emergency_contact_phone AS p FROM drivers WHERE id = ?').bind(driverId).first<{ p: string }>();
    expect(row?.p).toBe('+919000011111');
  });

  it('migration 0040 normalises legacy bare-digit phones and is idempotent', async () => {
    const m = (testEnv.TEST_MIGRATIONS as Array<{ name: string; queries: string[] }>).find((x) => x.name.startsWith('tenant_0040_'));
    expect(m, 'migration 0040 present').toBeTruthy();
    const t = await mkTrip();
    const tid = t.body.data.id as string;
    const rows: Array<[string, string | null]> = [
      ['9820144562', '+919820144562'], ['09820144562', '+919820144562'], ['919820144562', '+919820144562'],
      ['98201-44562', '+919820144562'], ['+14155550100', '+14155550100'], ['12345', '12345'], [null as any, null],
    ];
    const results: Array<string | null | undefined> = [];
    for (const [input] of rows) {
      await db.prepare('UPDATE trip_assignments SET passenger_phone = ? WHERE id = ?').bind(input, tid).run();
      await db.prepare('UPDATE drivers SET emergency_contact_phone = ? WHERE id = ?').bind(input, driverId).run();
      for (let pass = 0; pass < 2; pass++) for (const q of m!.queries) await db.prepare(q.replace(/--[^\n]*/g, '').trim().replace(/;$/, '')).run();
      results.push(await stored(tid));
      const dr = await db.prepare('SELECT emergency_contact_phone AS p FROM drivers WHERE id = ?').bind(driverId).first<{ p: string | null }>();
      expect(dr?.p ?? null).toBe(results[results.length - 1] ?? null);
    }
    expect(results.map((r) => r ?? null)).toEqual(rows.map(([, out]) => out));
  });
});

describe('B39 tenant summary on auth responses', () => {
  it('login returns tenant {id, name, timezone, currency} sourced from the company profile', async () => {
    await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('company_name', 'Sahyadri Holidays', datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    await db.prepare("DELETE FROM settings WHERE key IN ('timezone', 'company_timezone', 'currency')").run();
    const res = await raw('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID });
    const body: any = await res.json();
    expect(body.data.tenant).toEqual({ id: TENANT_ID, name: 'Sahyadri Holidays', timezone: 'Asia/Kolkata', currency: 'INR' });
    expect(body.data.user.email).toBe('admin@e2e.test'); // existing shape intact
    expect(JSON.stringify(body.data.tenant)).not.toMatch(/plan|secret|d1|subscription/i);

    const company = await api('GET', '/settings/company', body.data.accessToken);
    expect(company.body.data.company_name).toBe(body.data.tenant.name);
  });

  it('reflects configured timezone and currency; refresh-token returns the tenant too', async () => {
    await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('timezone', 'Asia/Dubai', datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('currency', 'AED', datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    const login: any = await (await raw('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID })).json();
    expect(login.data.tenant).toMatchObject({ timezone: 'Asia/Dubai', currency: 'AED' });
    const refreshed: any = await (await raw('POST', '/auth/refresh-token', null, { refreshToken: login.data.refreshToken })).json();
    expect(refreshed.data.tenant).toMatchObject({ id: TENANT_ID, name: 'Sahyadri Holidays', timezone: 'Asia/Dubai', currency: 'AED' });
    await db.prepare("DELETE FROM settings WHERE key IN ('timezone', 'currency')").run();
  });
});

describe('B39 lead activities meta', () => {
  it('returns metadata (string, unchanged) plus parsed camelCase meta', async () => {
    const id = generateId();
    await db.prepare(
      "INSERT INTO lead_activities (id, lead_id, type, content, metadata) VALUES (?, ?, 'status_change', 'x', ?)",
    ).bind(id, leadId, JSON.stringify({ old_status: 'contacted', new_status: 'lost', lost_reason: 'Budget' })).run();
    const bad = generateId();
    await db.prepare("INSERT INTO lead_activities (id, lead_id, type, content, metadata) VALUES (?, ?, 'note', 'n', 'not json')")
      .bind(bad, leadId).run();
    const res = await api('GET', `/leads/${leadId}/activities?limit=100`, token);
    expect(res.status).toBe(200);
    const row = res.body.data.find((a: any) => a.id === id);
    expect(typeof row.metadata).toBe('string');
    expect(JSON.parse(row.metadata).old_status).toBe('contacted');
    expect(row.meta).toEqual({ oldStatus: 'contacted', newStatus: 'lost', lostReason: 'Budget' });
    const badRow = res.body.data.find((a: any) => a.id === bad);
    expect(badRow.meta).toBeNull();
  });
});
