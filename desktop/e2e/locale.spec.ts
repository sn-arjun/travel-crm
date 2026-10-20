import {
  type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { API_URL, loginViaUI } from './helpers/auth';
import { api, seedContact, seedInvoice } from './helpers/api-seed';
import {
  type Agency,
  completeFirstLogin,
  createAgency,
  createSuperAdminToken,
  signInViaUI,
  isMultiTenantStack,
  NEEDS_MULTI,
} from './helpers/tenants';

// Separate agency databases are needed: skip the whole file on a single-tenant stack.
test.beforeAll(async () => {
  test.skip(!(await isMultiTenantStack(API_URL)), NEEDS_MULTI);
});

/**
 * R203 exit test: money, numbers, dates and time zones follow each agency's own settings, not India's.
 * Three agencies provisioned through the admin API (UK, UAE, US) and the Indian demo agency look at the same
 * kinds of screens; each must show its own currency, digit grouping, date order and time zone.
 * Needs the multi-tenant stack: `node scripts/fix-stack.mjs up --slot N --reset-db --multi`.
 */

test.use({ storageState: undefined });

const RUN = Date.now().toString(36);
const INVOICE_AMOUNT = 1_250_000; // grouping differs: 12,50,000 (en-IN) against 1,250,000
const ISSUE_DATE = '2026-03-14';
const DUE_DATE = '2026-04-13';
const EVENT_ZULU = '09:00:00.000Z';

interface Market {
  key: string;
  label: string;
  currency: string;
  locale: string;
  timezone: string;
  country: string; // ISO alpha-2
  countryName: string;
  region: 'uk' | 'gulf' | 'us';
  currencyName: string;
  zoneLabel: string;
}

const MARKETS: Market[] = [
  { key: 'uk', label: 'UK', currency: 'GBP', locale: 'en-GB', timezone: 'Europe/London', country: 'GB', countryName: 'United Kingdom', region: 'uk', currencyName: 'British Pound (GBP)', zoneLabel: 'Europe/London (GMT)' },
  { key: 'ae', label: 'UAE', currency: 'AED', locale: 'en-AE', timezone: 'Asia/Dubai', country: 'AE', countryName: 'United Arab Emirates', region: 'gulf', currencyName: 'UAE Dirham (AED)', zoneLabel: 'Asia/Dubai (GST)' },
  { key: 'us', label: 'US', currency: 'USD', locale: 'en-US', timezone: 'America/New_York', country: 'US', countryName: 'United States', region: 'us', currencyName: 'US Dollar (USD)', zoneLabel: 'America/New_York (EST)' },
];
const INDIA = { currency: 'INR', locale: 'en-IN', timezone: 'Asia/Kolkata', currencyName: 'Indian Rupee (INR)', zoneLabel: 'Asia/Kolkata (IST)' };

const norm = (s: string) => s.replace(/[  ]/g, ' ').replace(/\s+/g, ' ');
const money = (n: number, currency: string, locale: string) =>
  norm(new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n));
const mediumDate = (iso: string, locale: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return norm(new Date(y!, m! - 1, d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }));
};
const clock = (iso: string, locale: string, timeZone: string) =>
  norm(new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone }));

async function body(page: Page): Promise<string> {
  return norm(await page.locator('body').innerText());
}

async function expectBodyToContain(page: Page, ...texts: string[]) {
  for (const t of texts) await expect.poll(async () => (await body(page)).includes(norm(t)), { message: `page shows "${t}"`, timeout: 20_000 }).toBe(true);
}

async function waitLoaded(page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

interface Seeded {
  agency: Agency;
  invoiceId: string;
  invoiceNumber: string;
  usdInvoiceNumber: string;
  eventTitle: string;
  eventStart: string;
  eventEnd: string;
}

const seeded: Record<string, Seeded> = {};

async function call(agency: Agency, method: string, path: string, payload?: unknown): Promise<any> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${agency.accessToken}` },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  expect(res.status, `${method} ${path}: ${text.slice(0, 300)}`).toBeLessThan(300);
  return json;
}

test.describe('Locale: each agency sees its own currency, numbers, dates and time zone', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    const sa = await createSuperAdminToken(API_URL);
    const today = new Date().toISOString().slice(0, 10);
    for (const m of MARKETS) {
      const created = await createAgency(API_URL, sa, {
        plan: 'pro',
        slug: `loc-${m.key}-${RUN}`,
        companyName: `Locale ${m.label} ${RUN}`,
        country: m.countryName,
        currency: m.currency,
        timezone: m.timezone,
        taxSystem: 'none',
        region: m.region,
      });
      const agency = await completeFirstLogin(API_URL, created);
      // The agency's display settings: what the sign-in response carries to the app.
      await call(agency, 'PUT', '/settings/company', {
        company_name: agency.companyName,
        currency: m.currency,
        locale: m.locale,
        timezone: m.timezone,
        country: m.country,
        phone_default_country: m.country,
        tax_system: 'none',
      });
      const contact = await call(agency, 'POST', '/contacts', { name: `Locale Client ${m.label} ${RUN}`, type: 'customer', phone: '+971501234567' });
      const contactId = contact.data.id as string;
      const items = [{ description: 'Locale test item', quantity: 1, rate: INVOICE_AMOUNT, taxRate: 0 }];
      const inv = await call(agency, 'POST', '/invoices', { contactId, items, issueDate: ISSUE_DATE, dueDate: DUE_DATE });
      const invoiceId = (inv.data.id ?? inv.id) as string;
      const invoiceNumber = (inv.data.invoiceNumber ?? inv.data.invoice_number) as string;
      // An invoice in a currency of its own: it must keep that currency whatever the agency default is.
      const foreign = m.currency === 'USD' ? 'EUR' : 'USD';
      const usd = await call(agency, 'POST', '/invoices', { contactId, items, currency: foreign, issueDate: ISSUE_DATE, dueDate: DUE_DATE });
      await call(agency, 'POST', '/payments', { invoiceId, amount: 500_000, date: today, method: 'transfer', reference: `LOC-${m.key}-${RUN}` });
      const eventTitle = `Locale Event ${m.label} ${RUN}`;
      const eventStart = `${today}T${EVENT_ZULU}`;
      const eventEnd = `${today}T10:00:00.000Z`;
      await call(agency, 'POST', '/events', { title: eventTitle, event_type: 'meeting', start_at: eventStart, end_at: eventEnd, all_day: false });
      seeded[m.key] = {
        agency,
        invoiceId,
        invoiceNumber,
        usdInvoiceNumber: (usd.data.invoiceNumber ?? usd.data.invoice_number) as string,
        eventTitle,
        eventStart,
        eventEnd,
      };
    }
  });

  for (const m of MARKETS) {
    test(`${m.label} agency (${m.currency}, ${m.locale}, ${m.timezone}) sees its own money, dates and time zone`, async ({ page }) => {
      test.setTimeout(180_000);
      const s = seeded[m.key]!;
      await signInViaUI(page, s.agency);

      // Dashboard: nothing from India.
      await page.goto('/dashboard');
      await waitLoaded(page);
      expect(await body(page)).not.toContain('₹');

      // Invoice list: the agency currency with the agency's digit grouping; an invoice's own currency wins.
      await page.goto('/invoices');
      await waitLoaded(page);
      await expectBodyToContain(page, s.invoiceNumber, s.usdInvoiceNumber, money(INVOICE_AMOUNT, m.currency, m.locale));
      const foreign = m.currency === 'USD' ? 'EUR' : 'USD';
      await expectBodyToContain(page, money(INVOICE_AMOUNT, foreign, m.locale));
      const list = await body(page);
      expect(list).not.toContain('₹');
      expect(list).not.toContain('12,50,000');

      // Invoice detail: money and the dates in the agency's order.
      await page.goto(`/invoices/${s.invoiceId}`);
      await waitLoaded(page);
      await expectBodyToContain(page, money(INVOICE_AMOUNT, m.currency, m.locale), mediumDate(ISSUE_DATE, m.locale), mediumDate(DUE_DATE, m.locale));
      expect(await body(page)).not.toContain('₹');

      // Payments: the payment is in the invoice's currency.
      await page.goto('/payments');
      await waitLoaded(page);
      await expectBodyToContain(page, money(500_000, m.currency, m.locale));
      expect(await body(page)).not.toContain('₹');

      // Calendar: a timestamp in UTC shows as the agency's wall-clock time, not the browser's or India's.
      await page.goto('/calendar');
      await waitLoaded(page);
      await page.getByRole('button', { name: 'Today' }).click();
      await expect(page.getByText(s.eventTitle).first()).toBeVisible({ timeout: 20_000 });
      const range = `${clock(s.eventStart, m.locale, m.timezone)} — ${clock(s.eventEnd, m.locale, m.timezone)}`;
      await expectBodyToContain(page, range);

      // Login history: numeric date and time in the agency's order.
      await page.goto('/settings/login-history');
      await waitLoaded(page);
      const now = new Date();
      const candidates = new Set<string>([
        norm(now.toLocaleDateString(m.locale, { timeZone: m.timezone })),
        norm(now.toLocaleDateString(m.locale, { timeZone: 'UTC' })),
      ]);
      await expect
        .poll(async () => {
          const text = await body(page);
          return [...candidates].some((c) => text.includes(c));
        }, { message: `login history shows a date like ${[...candidates].join(' or ')}`, timeout: 20_000 })
        .toBe(true);

      // Company settings: the pick-lists open on the agency's own currency and zone; GSTIN is an India-only field.
      await page.goto('/settings/company');
      await waitLoaded(page);
      await expect(page.locator('#currency')).toContainText(m.currencyName, { timeout: 20_000 });
      await expect(page.locator('#timezone')).toContainText(m.zoneLabel);
      await expect(page.locator('#gstin')).toHaveCount(0);
    });
  }

  test('the Indian demo agency keeps rupees, lakh grouping, en-IN dates and Asia/Kolkata', async ({ page }) => {
    test.setTimeout(180_000);
    const contact = await seedContact({ name: `Locale Client IN ${RUN}` });
    const items = [{ description: 'Locale test item', quantity: 1, rate: INVOICE_AMOUNT, taxRate: 0 }];
    const invoice = await seedInvoice(contact.id, { items, issueDate: ISSUE_DATE, dueDate: DUE_DATE });
    const invoiceId = invoice.id as string;
    const number = (invoice.invoiceNumber ?? invoice.invoice_number) as string;
    const today = new Date().toISOString().slice(0, 10);
    const eventTitle = `Locale Event IN ${RUN}`;
    const eventStart = `${today}T${EVENT_ZULU}`;
    const eventEnd = `${today}T10:00:00.000Z`;
    await api('POST', '/events', { title: eventTitle, event_type: 'meeting', start_at: eventStart, end_at: eventEnd, all_day: false });

    await loginViaUI(page);
    await page.goto('/invoices');
    await waitLoaded(page);
    await expectBodyToContain(page, number, money(INVOICE_AMOUNT, INDIA.currency, INDIA.locale));
    expect(await body(page)).toContain('12,50,000');

    await page.goto(`/invoices/${invoiceId}`);
    await waitLoaded(page);
    await expectBodyToContain(page, '₹12,50,000', mediumDate(ISSUE_DATE, INDIA.locale));

    await page.goto('/calendar');
    await waitLoaded(page);
    await page.getByRole('button', { name: 'Today' }).click();
    await expect(page.getByText(eventTitle).first()).toBeVisible({ timeout: 20_000 });
    await expectBodyToContain(page, `${clock(eventStart, INDIA.locale, INDIA.timezone)} — ${clock(eventEnd, INDIA.locale, INDIA.timezone)}`);

    await page.goto('/settings/company');
    await waitLoaded(page);
    await expect(page.locator('#currency')).toContainText(INDIA.currencyName, { timeout: 20_000 });
    await expect(page.locator('#timezone')).toContainText(INDIA.zoneLabel);
    await expect(page.locator('#gstin')).toBeVisible();
  });
});
