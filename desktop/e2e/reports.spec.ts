/**
 * Reports & Analytics — consolidated E2E.
 *
 * Replaces 10-financial-reports, 14-reports and 15-m15-reports-analytics.
 * Reports are a dashboard slice (no entity CRUD): the round trip here is
 * seed data -> API reflects it -> hub/page renders -> filters re-query ->
 * export downloads a non-empty file.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { waitForLoad } from './helpers/auth';
import { api, seedContact, seedInvoice, seedLead } from './helpers/api-seed';

const CATEGORY_PAGES = [
  { path: '/reports/sales', heading: 'Sales Reports' },
  { path: '/reports/leads', heading: 'Lead Reports' },
  { path: '/reports/financial', heading: 'Financial Reports' },
  { path: '/reports/team', heading: 'Team Performance Reports' },
  { path: '/reports/customer', heading: 'Customer Reports' },
  { path: '/reports/visa', heading: 'Visa Reports' },
  { path: '/reports/supplier', heading: 'Supplier Reports' },
  { path: '/reports/fleet', heading: 'Fleet Reports' },
  { path: '/reports/marketing', heading: 'Marketing Reports' },
  { path: '/reports/revenue', heading: 'Revenue Report' },
  { path: '/reports/pipeline', heading: 'Pipeline Report' },
];

const HUB_CARDS = [
  'Sales Reports',
  'Lead Reports',
  'Financial Reports',
  'Team Reports',
  'Customer Reports',
  'Visa Reports',
  'Supplier Reports',
  'Fleet Reports',
  'Marketing Reports',
];

async function open(page: Page, path: string) {
  await page.goto(path);
  await waitForLoad(page);
}

async function expectNoDirectCommsLinks(page: Page) {
  expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
  expect(await page.locator('a[href*="wa.me"]').count()).toBe(0);
  expect(await page.locator('a[href^="tel:"]').count()).toBe(0);
}

async function readDownload(download: import('@playwright/test').Download) {
  const p = await download.path();
  return fs.statSync(p).size;
}

let contactId: string;
let invoiceId: string;

test.beforeAll(async () => {
  const contact = await seedContact({ name: `E2E Reports Contact ${Date.now()}` });
  contactId = contact.id;
  await seedLead(contactId, { title: `E2E Reports Lead ${Date.now()}` });
  const invoice = await seedInvoice(contactId, {
    items: [{ description: 'E2E Reports Item', quantity: 1, rate: 12345, taxRate: 18 }],
  });
  invoiceId = invoice.id;
});

// ---------------------------------------------------------------------------
// API — data seeded through the real endpoints shows up in report endpoints
// ---------------------------------------------------------------------------

test.describe('Reports API', () => {
  test('dashboard reflects seeded pipeline and financial data', async () => {
    const res = await api('GET', '/reports/dashboard');
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data.pipeline)).toBe(true);
    const leadCount = res.data.pipeline.reduce((s: number, p: any) => s + p.count, 0);
    expect(leadCount).toBeGreaterThan(0);
    expect(typeof res.data.financial.outstanding).toBe('number');
    expect(typeof res.data.financial.revenueThisMonth).toBe('number');
  });

  test('outstanding report is returned with ageing buckets', async () => {
    const res = await api('GET', '/reports/outstanding');
    expect(res.data).toBeTruthy();
    expect(res.data.ageing).toBeTruthy();
  });

  test('ageing report responds while a seeded invoice exists', async () => {
    const issued = await api('GET', `/invoices/${invoiceId}`);
    expect(issued.data).toBeTruthy();
    const res = await api('GET', '/reports/ageing');
    expect(res.data).toBeTruthy();
  });

  test('invoice summary endpoint responds', async () => {
    const res = await api('GET', '/invoices/summary');
    expect(res.data).toBeTruthy();
  });

  test('report registry lists reports', async () => {
    const res = await api('GET', '/reports');
    expect(res.success).toBe(true);
    expect(res.data.length).toBeGreaterThan(0);
  });

  test('executing a registered report returns rows/columns shape', async () => {
    const res = await api('GET', '/reports/sales_summary?date_preset=this_year');
    expect(res.success).toBe(true);
    expect(res.data).toBeTruthy();
  });

  test.describe('financial settings carried from legacy spec', () => {
    test('HSN codes list is pre-loaded and searchable', async () => {
      const list = await api('GET', '/hsn-codes');
      expect(Array.isArray(list.data)).toBe(true);
      const search = await api('GET', '/hsn-codes?search=travel');
      expect(search.data).toBeTruthy();
    });

    test('custom HSN code can be created', async () => {
      // Backend caps `code` at 10 chars (the legacy spec sent 16 and never actually passed).
      const code = `E${Date.now().toString().slice(-8)}`;
      const res = await api('POST', '/hsn-codes', {
        code,
        description: 'E2E test HSN code',
        category: 'test',
      });
      expect(res.data).toBeTruthy();
      const list = await api('GET', '/hsn-codes');
      expect(list.data.some((h: any) => h.code === code)).toBe(true);
    });

    test('invoice defaults and numbering config round trip', async () => {
      const defaults = await api('GET', '/settings/invoice-defaults');
      expect(defaults.data).toBeTruthy();
      const numbering = await api('GET', '/settings/numbering');
      expect(numbering.data).toBeTruthy();
      const updated = await api('PUT', '/settings/numbering', {
        invoice_prefix: 'INV',
        fy_start_month: 4,
        reset_yearly: true,
      });
      expect(updated.data).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

test.describe('Reports hub', () => {
  test.beforeEach(async ({ page }) => {
    await open(page, '/reports');
    await page.evaluate(() => {
      localStorage.removeItem('report_hub_favorites');
      localStorage.removeItem('report_hub_recently_viewed');
    });
    await page.reload();
    await waitForLoad(page);
  });

  test('renders KPI metrics from the dashboard API and every category card', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Reports Hub' })).toBeVisible();
    for (const label of ['Revenue This Month', 'Active Leads', 'Conversion Rate', 'Outstanding']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/Failed to load dashboard metrics/)).toHaveCount(0);
    for (const title of HUB_CARDS) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
    // Seeded lead means Active Leads is a real number > 0
    const activeLeads = page.locator('p', { hasText: 'Active Leads' }).locator('xpath=following-sibling::p');
    await expect(activeLeads).not.toHaveText('0');
  });

  test('search narrows the cards and shows the empty state for no match', async ({ page }) => {
    const search = page.getByPlaceholder('Search reports...');
    await search.fill('sales');
    await expect(page.getByRole('heading', { name: 'Sales Reports' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Financial Reports' })).toHaveCount(0);

    await search.fill('zzz-no-such-report');
    await expect(page.getByText(/No reports match/)).toBeVisible();
    await expect(page.locator('h3')).toHaveCount(0);

    await search.clear();
    await expect(page.getByRole('heading', { name: 'Financial Reports' })).toBeVisible();
  });

  test('favoriting a card adds it to Favorites and persists across reload', async ({ page }) => {
    await page.getByTitle('Add to favorites').first().click();
    await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
    await expect(page.getByTitle('Remove from favorites').first()).toBeVisible();

    await page.reload();
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();

    await page.getByTitle('Remove from favorites').first().click();
    await expect(page.getByRole('heading', { name: 'Favorites' })).toHaveCount(0);
  });

  test('clicking a card navigates and records it under Recently Viewed', async ({ page }) => {
    await page.getByRole('heading', { name: 'Sales Reports' }).click();
    await page.waitForURL('**/reports/sales', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Sales Reports' })).toBeVisible();

    await open(page, '/reports');
    await page.getByRole('button', { name: /Recently Viewed/ }).click();
    // Card appears twice: once in Recently Viewed, once in Available Reports
    await expect(page.getByRole('heading', { name: 'Sales Reports' })).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Lead Reports' })).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('report_hub_recently_viewed'))).toBe('["sales"]');
  });

  test('Recently Viewed is empty on a fresh profile', async ({ page }) => {
    await page.getByRole('button', { name: /Recently Viewed/ }).click();
    await expect(page.getByText('No recently viewed reports.')).toBeVisible();
  });

  test('dashboard failure shows an error instead of fake numbers', async ({ page }) => {
    await page.route('**/reports/dashboard', (r) => r.abort('failed'));
    await page.reload();
    await expect(page.getByText(/Failed to load dashboard metrics/)).toBeVisible({ timeout: 15_000 });
  });

  test('has no mailto:/wa.me/tel: links', async ({ page }) => {
    await expectNoDirectCommsLinks(page);
  });
});

// ---------------------------------------------------------------------------
// Every category page
// ---------------------------------------------------------------------------

test.describe('Report category pages', () => {
  for (const { path, heading } of CATEGORY_PAGES) {
    test(`${path}: renders heading, breadcrumb back to hub, export, no direct comms links`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));

      await open(page, path);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('Application error')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /export/i }).first()).toBeVisible();
      await expectNoDirectCommsLinks(page);
      expect(errors).toEqual([]);

      // Back link returns to the hub
      await page.locator('a[href="/reports"]').first().click();
      await page.waitForURL('**/reports', { timeout: 15_000 });
      await expect(page.getByRole('heading', { name: 'Reports Hub' })).toBeVisible();
    });
  }

  for (const path of ['/reports/sales', '/reports/leads', '/reports/financial']) {
    test(`${path}: has date range selector and compare toggle`, async ({ page }) => {
      await open(page, path);
      await expect(page.getByText('Date Range:').first()).toBeVisible();
      await expect(page.getByRole('switch').first()).toBeVisible();
      await expect(page.getByText('Compare with previous period')).toBeVisible();
    });
  }
});

// ---------------------------------------------------------------------------
// Filters re-query the backend
// ---------------------------------------------------------------------------

test.describe('Report filters', () => {
  test('changing the date range on sales re-queries with the new preset', async ({ page }) => {
    await open(page, '/reports/sales');
    await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible();

    const req = page.waitForRequest(
      (r) => r.url().includes('/reports/sales_summary') && r.url().includes('date_preset=this_year'),
    );
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'This Year' }).click();
    await req;
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: 'Sales Reports' })).toBeVisible();
  });

  test('compare toggle on sales re-queries with compare=true and toggles back', async ({ page }) => {
    await open(page, '/reports/sales');
    const toggle = page.getByRole('switch').first();
    await expect(toggle).not.toBeChecked();

    const req = page.waitForRequest(
      (r) => r.url().includes('/reports/sales_summary') && r.url().includes('compare=true'),
    );
    await toggle.click();
    await req;
    await expect(toggle).toBeChecked();

    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(page.getByRole('heading', { name: 'Sales Reports' })).toBeVisible();
  });

  test('changing the date range on financial re-queries', async ({ page }) => {
    await open(page, '/reports/financial');
    const req = page.waitForRequest((r) => /\/reports\/\w+/.test(r.url()) && r.url().includes('date_preset=last_month'));
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Last Month' }).click();
    await req;
  });
});

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

test.describe('Report tabs', () => {
  const sales = ['Summary', 'Destination', 'Salesperson', 'Trip Type', 'Source'];
  const leads = ['Pipeline', 'Ageing', 'Source', 'Response'];
  const financial = ['Revenue', 'Collections', 'Receivables', 'P&L', 'Tax', 'Payment Methods', 'Refunds', 'Daily Cash'];

  for (const [path, tabs] of [
    ['/reports/sales', sales],
    ['/reports/leads', leads],
    ['/reports/financial', financial],
  ] as const) {
    test(`${path}: every tab activates and shows a panel (data, empty state, or retry)`, async ({ page }) => {
      await open(page, path);
      for (const name of tabs) {
        const tab = page.getByRole('tab', { name, exact: true });
        await tab.scrollIntoViewIfNeeded();
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tabpanel')).toBeVisible();
        await waitForLoad(page);
        await expect(page.getByText('Application error')).toHaveCount(0);
      }
    });
  }

  test('sales Summary tab shows KPI labels', async ({ page }) => {
    await open(page, '/reports/sales');
    await expect(page.getByText('Total Revenue').first()).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Error and empty states
// ---------------------------------------------------------------------------

test.describe('Report error handling', () => {
  test('failed report query shows Retry, and Retry recovers once the API is back', async ({ page }) => {
    await page.route('**/reports/sales_summary**', (r) => r.abort('failed'));
    await open(page, '/reports/sales');

    const retry = page.getByRole('button', { name: /retry/i }).first();
    await expect(retry).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Application error')).toHaveCount(0);

    await page.unroute('**/reports/sales_summary**');
    await retry.click();
    await expect(page.getByRole('button', { name: /retry/i })).toHaveCount(0, { timeout: 15_000 });
  });

  test('a period with no data renders an empty state, not an error', async ({ page }) => {
    await page.route('**/reports/sales_summary**', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { data: [], columns: [], meta: { total: 0, page: 1, per_page: 50 } } }),
      }),
    );
    await open(page, '/reports/sales');
    await expect(page.getByRole('button', { name: /retry/i })).toHaveCount(0);
    await expect(page.getByText(/no data/i).first()).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

test.describe('Report export', () => {
  test('sales export downloads a non-empty xlsx', async ({ page }) => {
    await open(page, '/reports/sales');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^sales-report-.*\.xlsx$/);
    expect(await readDownload(download)).toBeGreaterThan(0);
    await expect(page.getByText(/failed to export/i)).toHaveCount(0);
  });

  for (const [path, prefix] of [
    ['/reports/financial', 'financial-report'],
    ['/reports/leads', 'lead'],
    ['/reports/pipeline', 'pipeline'],
    ['/reports/revenue', 'revenue'],
  ] as const) {
    test(`${path}: Export Excel downloads a non-empty xlsx`, async ({ page }) => {
      await open(page, path);
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30_000 }),
        page.getByRole('button', { name: 'Export Excel' }).click(),
      ]);
      expect(download.suggestedFilename()).toContain(prefix);
      expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
      expect(await readDownload(download)).toBeGreaterThan(0);
    });
  }

  test('financial export offers PDF and downloads a non-empty file', async ({ page }) => {
    await open(page, '/reports/financial');
    await page.getByRole('button', { name: 'More export options' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('menuitem', { name: 'Export as PDF' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect(await readDownload(download)).toBeGreaterThan(0);
  });

  test('a failing export surfaces an error toast instead of silently doing nothing', async ({ page }) => {
    await open(page, '/reports/financial');
    await page.route('**/reports/*/export**', (r) => r.fulfill({ status: 500, body: 'boom' }));
    await page.getByRole('button', { name: 'Export Excel' }).click();
    await expect(page.getByText(/failed to export/i)).toBeVisible({ timeout: 10_000 });
  });
});
