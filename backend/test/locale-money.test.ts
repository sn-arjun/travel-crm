import { env, createExecutionContext, waitOnExecutionContext, applyD1Migrations } from 'cloudflare:test';
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import ExcelJS from 'exceljs';
import worker from '../src/index';
import {
  formatMoney, excelCurrencyFormat, resolveTenantLocale, validateLocaleSettings, loadLocaleContext,
} from '../src/utils/money';
import { tenantTz, getUserTimeZone, DEFAULT_TIMEZONE } from '../src/utils/tz';
import { excelExportService } from '../src/services/exports/excel-export';
import { getExchangeRateInfo, refreshExchangeRates } from '../src/services/exchange-rate';

const testEnv = env as any;
const TENANT_ID = '00000000-0000-0000-0000-000000000000';
const SALES_ID = '33333333-3333-3333-3333-333333333333';
const LOCALE_KEYS = ['currency', 'locale', 'timezone', 'company_timezone', 'country', 'company_country', 'phone_default_country', 'date_format'];

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

describe('formatMoney: one agency, one currency and number format', () => {
  it('India keeps lakh grouping and the rupee sign', () => {
    expect(formatMoney(1234567.5, 'INR', 'en-IN')).toBe('₹12,34,567.5');
    expect(formatMoney(45000, 'INR', 'en-IN', { whole: true })).toBe('₹45,000');
  });
  it('UK pound with en-GB', () => {
    expect(formatMoney(1234.5, 'GBP', 'en-GB')).toBe('£1,234.5');
    expect(formatMoney(1234.567, 'GBP', 'en-GB', { whole: true })).toBe('£1,235');
  });
  it('US dollar with en-US', () => {
    expect(formatMoney(1234567.891, 'USD', 'en-US')).toBe('$1,234,567.89');
  });
  it('UAE dirham with ar-AE writes the amount in its own format', () => {
    const text = formatMoney(1234.5, 'AED', 'ar-AE');
    expect(text).toBe(new Intl.NumberFormat('ar-AE', { style: 'currency', currency: 'AED', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(1234.5));
    expect(text).not.toContain('₹');
    expect(formatMoney(1234.5, 'AED', 'en-AE')).toContain('1,234.5');
  });
  it('never throws on bad input', () => {
    expect(formatMoney(10, 'ZZZZ', 'en-GB')).toBe('ZZZZ 10');
    expect(formatMoney(10, 'GBP', 'not a locale!')).toBe('£10');
    expect(formatMoney(Number.NaN, 'USD', 'en-US')).toBe('$0');
  });
  it('excel formats follow the currency and where the locale puts the symbol', () => {
    expect(excelCurrencyFormat('GBP', 'en-GB')).toBe('"£"#,##0.00');
    expect(excelCurrencyFormat('INR', 'en-IN')).toBe('"₹"#,##0.00');
    expect(excelCurrencyFormat('JPY', 'en-US')).toBe('"¥"#,##0');
    expect(excelCurrencyFormat('EUR', 'de-DE')).toBe('#,##0.00" €"');
    expect(excelCurrencyFormat('XXXX', 'en-US')).toBe('#,##0.00');
  });
});

describe('resolveTenantLocale and tenantTz', () => {
  it('an agency without settings keeps the pre-R202 India look', () => {
    expect(resolveTenantLocale({})).toEqual({
      currency: 'INR', locale: 'en-IN', timezone: 'Asia/Kolkata', country: '', phoneDefaultCountry: 'IN', dateFormat: '',
    });
  });
  it('UK, UAE and US agencies come from their own settings', () => {
    expect(resolveTenantLocale({ currency: 'gbp', locale: 'en-GB', timezone: 'Europe/London', country: 'gb' })).toMatchObject({
      currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London', country: 'GB', phoneDefaultCountry: 'GB',
    });
    expect(resolveTenantLocale({ currency: 'AED', locale: 'ar-AE', timezone: 'Asia/Dubai', country: 'AE', phone_default_country: 'AE' })).toMatchObject({
      currency: 'AED', locale: 'ar-AE', timezone: 'Asia/Dubai', phoneDefaultCountry: 'AE',
    });
    expect(resolveTenantLocale({ currency: 'USD', locale: 'en-US', timezone: 'America/New_York', country: 'US' })).toMatchObject({
      currency: 'USD', locale: 'en-US', timezone: 'America/New_York', phoneDefaultCountry: 'US',
    });
  });
  it('a country stored by name (as provisioning does) resolves to its ISO code', () => {
    expect(resolveTenantLocale({ country: 'United Kingdom', currency: 'GBP' })).toMatchObject({ country: 'GB', phoneDefaultCountry: 'GB' });
    expect(resolveTenantLocale({ country: 'united arab emirates' })).toMatchObject({ country: 'AE', phoneDefaultCountry: 'AE' });
    expect(resolveTenantLocale({ country: 'India' })).toMatchObject({ country: 'IN', phoneDefaultCountry: 'IN' });
    expect(resolveTenantLocale({ country: 'Atlantis' })).toMatchObject({ country: '', phoneDefaultCountry: 'IN' });
  });
  it('invalid stored values are skipped, not trusted', () => {
    expect(resolveTenantLocale({ currency: 'nope', locale: 'x', timezone: 'Mars/Base' })).toMatchObject({
      currency: 'INR', locale: 'en-IN', timezone: 'Asia/Kolkata',
    });
  });
  it('user locale and time zone override the agency', () => {
    const tenant = { currency: 'AED', locale: 'ar-AE', timezone: 'Asia/Dubai' };
    expect(resolveTenantLocale(tenant, { locale: 'en-GB', timezone: 'Europe/London' })).toMatchObject({
      currency: 'AED', locale: 'en-GB', timezone: 'Europe/London',
    });
    expect(resolveTenantLocale(tenant, { locale: null, timezone: '' })).toMatchObject({ locale: 'ar-AE', timezone: 'Asia/Dubai' });
  });
  it('tenantTz prefers the user zone, then the agency, then the default', () => {
    expect(tenantTz({ timezone: 'Asia/Dubai' }, { timezone: 'America/New_York' })).toBe('America/New_York');
    expect(tenantTz({ timezone: 'Asia/Dubai' }, { timezone: null })).toBe('Asia/Dubai');
    expect(tenantTz({ company_timezone: 'Europe/London' })).toBe('Europe/London');
    expect(tenantTz({ timezone: 'bad' }, { timezone: 'also bad' })).toBe(DEFAULT_TIMEZONE);
  });
  it('settings validation names the bad key', () => {
    expect(validateLocaleSettings({ currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London', country: 'GB', phone_default_country: 'GB' })).toBeNull();
    expect(validateLocaleSettings({ currency: 'POUNDS' })).toMatch(/currency/);
    expect(validateLocaleSettings({ timezone: 'Mars/Base' })).toMatch(/timezone/);
    expect(validateLocaleSettings({ country: 'GBR' })).toMatch(/country/);
    expect(validateLocaleSettings({ locale: '', timezone: null })).toBeNull();
  });
});

describe('R202 through the API', () => {
  let admin = '';
  let sales = '';
  let n = 0;

  beforeAll(async () => {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    expect((await call('POST', '/test/reset', null)).status).toBe(200);
    admin = ((await (await call('POST', '/auth/login', null, { email: 'admin@e2e.test', password: 'password123', tenantId: TENANT_ID })).json()) as any).data.accessToken;
    sales = ((await (await call('POST', '/auth/login', null, { email: 'sales@e2e.test', password: 'password123', tenantId: TENANT_ID })).json()) as any).data.accessToken;
  });

  async function leadFor(title: string): Promise<{ contactId: string; leadId: string }> {
    n += 1;
    const contactRes = await call('POST', '/contacts', admin, { name: `Locale Buyer ${n}`, phone: `9000009${String(n).padStart(3, '0')}`, type: 'customer' });
    const contactId = ((await contactRes.json()) as any).data.id;
    const leadRes = await call('POST', '/leads', admin, {
      contactId, title, destinations: ['London'], travelDate: '2027-03-01', tripType: 'domestic', source: 'manual', assignedTo: SALES_ID,
    });
    expect(leadRes.status).toBe(201);
    return { contactId, leadId: ((await leadRes.json()) as any).data.id };
  }

  it('a GBP en-GB agency: invoice and notice show pounds, the payment inherits the invoice currency', async () => {
    await setLocale({ currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London', country: 'GB' });
    const { contactId, leadId } = await leadFor('London weekend trip');

    // No currency sent: the agency's own applies (not a fixed INR).
    const invRes = await call('POST', '/invoices', admin, { contactId, leadId, items: [{ description: 'Tour', quantity: 1, rate: 1234.5 }] });
    expect(invRes.status).toBe(201);
    const invoiceId = ((await invRes.json()) as any).data.id;
    const inv = await testEnv.MASTER_DB.prepare('SELECT currency FROM invoices WHERE id = ?').bind(invoiceId).first();
    expect(inv.currency).toBe('GBP');

    const note = await testEnv.MASTER_DB
      .prepare("SELECT message FROM notifications WHERE reference_id = ? AND title = 'Invoice created'").bind(invoiceId).first();
    expect(note.message).toContain('£');
    expect(note.message).not.toContain('₹');

    const payRes = await call('POST', '/payments', admin, { invoiceId, amount: 100, method: 'bank_transfer' });
    expect(payRes.status).toBe(201);
    const paymentId = ((await payRes.json()) as any).data.id;
    const pay = await testEnv.MASTER_DB.prepare('SELECT currency FROM payments WHERE id = ?').bind(paymentId).first();
    expect(pay.currency).toBe('GBP');
  });

  it('an agency with no locale settings still writes rupees exactly as before', async () => {
    await setLocale({});
    const { contactId, leadId } = await leadFor('Goa trip');
    const invoiceId = ((await (await call('POST', '/invoices', admin, { contactId, leadId, items: [{ description: 'Tour', quantity: 1, rate: 100000 }] })).json()) as any).data.id;
    const inv = await testEnv.MASTER_DB.prepare('SELECT currency FROM invoices WHERE id = ?').bind(invoiceId).first();
    expect(inv.currency).toBe('INR');
    const note = await testEnv.MASTER_DB
      .prepare("SELECT message FROM notifications WHERE reference_id = ? AND title = 'Invoice created'").bind(invoiceId).first();
    expect(note.message).toContain('₹');
  });

  it('the Excel export writes the agency currency', async () => {
    const def: any = { name: 'Sales', columns: [{ name: 'amount', type: 'currency' }] };
    const buf = await excelExportService.generateExcel(def, [{ amount: 12 }], { currency: 'GBP', locale: 'en-GB' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    expect(wb.getWorksheet('Sales')!.getColumn(1).numFmt).toBe('"£"#,##0.00');
  });

  it('user time zone and locale override the agency in the login summary', async () => {
    await setLocale({ currency: 'AED', locale: 'ar-AE', timezone: 'Asia/Dubai', country: 'AE', phone_default_country: 'AE' });
    const login = async () =>
      ((await (await call('POST', '/auth/login', null, { email: 'sales@e2e.test', password: 'password123', tenantId: TENANT_ID })).json()) as any).data.tenant;
    expect(await login()).toMatchObject({ currency: 'AED', locale: 'ar-AE', timezone: 'Asia/Dubai', country: 'AE', phoneDefaultCountry: 'AE' });

    expect((await call('PUT', '/users/me', sales, { timezone: 'Mars/Base' })).status).toBe(400);
    const put = await call('PUT', '/users/me', sales, { timezone: 'Europe/London', locale: 'en-GB' });
    expect(put.status).toBe(200);
    expect(((await put.json()) as any).data).toMatchObject({ timezone: 'Europe/London', locale: 'en-GB' });

    expect(await login()).toMatchObject({ currency: 'AED', locale: 'en-GB', timezone: 'Europe/London' });
    expect(await getUserTimeZone(testEnv.MASTER_DB, SALES_ID)).toBe('Europe/London');
    expect((await loadLocaleContext(testEnv.MASTER_DB)).timezone).toBe('Asia/Dubai');

    expect((await call('PUT', '/users/me', sales, { timezone: null, locale: null })).status).toBe(200);
    expect(await getUserTimeZone(testEnv.MASTER_DB, SALES_ID)).toBe('Asia/Dubai');
  });

  it('company settings reject a bad currency or zone and accept good ones', async () => {
    expect((await call('PUT', '/settings/company', admin, { currency: 'POUNDS' })).status).toBe(400);
    expect((await call('PUT', '/settings/company', admin, { timezone: 'Mars/Base' })).status).toBe(400);
    const ok = await call('PUT', '/settings/company', admin, {
      locale: 'en-GB', currency: 'GBP', timezone: 'Europe/London', country: 'GB', phone_default_country: 'GB', date_format: 'DD/MM/YYYY',
    });
    expect(ok.status).toBe(200);
    await setLocale({});
  });
});

describe('exchange rates keep the last stored value', () => {
  afterEach(() => vi.restoreAllMocks());

  async function clearRates() {
    await applyD1Migrations(testEnv.MASTER_DB, testEnv.TEST_MIGRATIONS);
    await testEnv.MASTER_DB.prepare('DELETE FROM exchange_rates').run();
  }

  it('a failed fetch never throws and the last stored rate (not an INR constant) is used, with its date', async () => {
    await clearRates();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ rates: { USD: 1, GBP: 0.8, AED: 3.6725, EUR: 0.9 } }), { status: 200 }),
    );
    expect(await refreshExchangeRates(testEnv, new Date('2026-10-14T00:30:00Z'))).toBe(3);

    // The next day's fetch fails.
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    expect(await refreshExchangeRates(testEnv, new Date('2026-10-15T00:30:00Z'))).toBe(0);

    expect(await getExchangeRateInfo('USD', 'GBP', testEnv)).toEqual({ rate: 0.8, asOf: '2026-10-14', source: 'stored' });
    const gbpAed = await getExchangeRateInfo('gbp', 'aed', testEnv);
    expect(gbpAed.rate).toBeCloseTo(3.6725 / 0.8, 6);
    expect(gbpAed.source).toBe('stored');
    expect((await getExchangeRateInfo('AED', 'USD', testEnv)).rate).toBeCloseTo(1 / 3.6725, 6);
    expect((await getExchangeRateInfo('GBP', 'GBP', testEnv)).source).toBe('same');
  });

  it('a pair nobody has stored, with the network down, says so instead of inventing a rate', async () => {
    await clearRates();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(getExchangeRateInfo('USD', 'INR', testEnv)).resolves.toEqual({ rate: 1, asOf: null, source: 'none' });
  });

  it('the newest day wins when several are stored', async () => {
    await clearRates();
    const put = (asOf: string, rate: number) =>
      testEnv.MASTER_DB.prepare("INSERT INTO exchange_rates (base, quote, rate, as_of) VALUES ('USD', 'GBP', ?, ?)").bind(rate, asOf).run();
    await put('2026-10-10', 0.7);
    await put('2026-10-12', 0.75);
    expect((await getExchangeRateInfo('USD', 'GBP', testEnv)).rate).toBe(0.75);
  });
});
