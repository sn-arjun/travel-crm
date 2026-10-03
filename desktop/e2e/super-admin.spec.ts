import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { api } from './helpers/api-seed';

/**
 * Super Admin is a READ-ONLY platform surface (19 GET endpoints, no forms, no
 * messaging). The backend gates it on the super_admins registry, NOT on the
 * tenant `role: admin` claim, so the demo tenant admin may or may not be a
 * platform super admin. Every test asserts the correct behaviour either way:
 *  - granted  -> the real data views, search/filter/empty/export/detail
 *  - denied   -> an explicit "access required" panel, never a 403 error toast
 */

let granted = false;

const PAGES = [
  { href: '/super-admin', heading: 'Platform dashboard' },
  { href: '/super-admin/tenants', heading: 'Tenants' },
  { href: '/super-admin/users', heading: 'All users' },
  { href: '/super-admin/plans', heading: 'Subscription plans' },
  { href: '/super-admin/billing', heading: 'Billing & revenue' },
  { href: '/super-admin/system', heading: 'System health' },
  { href: '/super-admin/config', heading: 'Global configuration' },
  { href: '/super-admin/audit', heading: 'Audit logs' },
];

const NO_ACCESS = 'Platform administration access required';

async function open(page: Page, href: string) {
  await page.goto(href);
  await waitForLoad(page);
}

const heading = (page: Page, name: string) => page.getByRole('heading', { name }).first();
const search = (page: Page) => page.getByPlaceholder(/^Search by/);
const noErrorToast = (page: Page) =>
  expect(page.locator('[data-sonner-toast][data-type="error"], [role="status"]:has-text("Insufficient permissions")')).toHaveCount(0);

async function expectDownload(page: Page, trigger: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15_000 }), trigger()]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const stream = await download.createReadStream();
  let bytes = 0;
  for await (const chunk of stream) bytes += (chunk as Buffer).length;
  expect(bytes).toBeGreaterThan(0);
}

test.describe('Super Admin', () => {
  test.beforeAll(async () => {
    const res = await api('GET', '/admin/config');
    granted = res?.success === true;
    if (!granted) expect(res?.error?.message).toBe('Insufficient permissions');
  });

  test('sidebar exposes the Super Admin entry to a tenant admin and routes to the dashboard', async ({ page }) => {
    await open(page, '/');
    const link = page.locator('aside a[href="/super-admin"]').first();
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL('**/super-admin');
    if (granted) await expect(heading(page, 'Platform dashboard')).toBeVisible();
    else await expect(page.getByText(NO_ACCESS)).toBeVisible();
  });

  test('every page renders either its data view or the access panel, with no error toast and no mailto/wa.me/tel links', async ({ page }) => {
    for (const p of PAGES) {
      await open(page, p.href);
      if (granted) await expect(heading(page, p.heading)).toBeVisible({ timeout: 15_000 });
      else await expect(page.getByTestId('super-admin-no-access')).toBeVisible({ timeout: 15_000 });
      await noErrorToast(page);
      await expect(page.locator('a[href^="mailto:"], a[href*="wa.me"], a[href^="tel:"]')).toHaveCount(0);
      // read-only surface: no raw ID inputs, no create forms
      await expect(page.locator('input[name*="Id" i], input[placeholder*="ID" i]')).toHaveCount(0);
    }
  });

  test('a tenant admin without super-admin rights sees an explanation instead of 403 errors', async ({ page }) => {
    test.skip(granted, 'account is a platform super admin; denied path not applicable');
    const forbidden: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/admin/') && r.status() === 403 && r.request().method() === 'GET') forbidden.push(r.url());
    });
    await open(page, '/super-admin/tenants');
    const panel = page.getByTestId('super-admin-no-access');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: NO_ACCESS })).toBeVisible();
    // Child pages must not be mounted (and so must not fire their own failing fetches)
    await expect(search(page)).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
    // Only the layout's access probe may hit the API (dev strict-mode runs it twice).
    expect(forbidden.length).toBeGreaterThan(0);
    expect(forbidden.filter((u) => !u.includes('/admin/config'))).toEqual([]);
    await noErrorToast(page);
  });

  test('dashboard shows stat cards and charts', async ({ page }) => {
    test.skip(!granted, 'requires super-admin access');
    await open(page, '/super-admin');
    for (const t of ['Total tenants', 'Active users', 'Total revenue', 'Platform health']) {
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    }
    for (const t of ['Recent signups', 'Revenue by plan', 'Tenant breakdown by status']) {
      await expect(page.getByText(t, { exact: true })).toBeVisible();
    }
  });

  test('tenants: list, search narrows, status filter, empty state, export, detail', async ({ page }) => {
    test.skip(!granted, 'requires super-admin access');
    const list = await api('GET', '/admin/tenants?limit=100');
    const first = list.data[0];
    expect(first, 'platform has at least one tenant').toBeTruthy();

    await open(page, '/super-admin/tenants');
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    for (const col of ['Name', 'Email', 'Plan', 'Users', 'Status', 'Created']) {
      await expect(page.getByRole('columnheader', { name: new RegExp(col) }).first()).toBeVisible();
    }
    await expect(page.locator('tbody tr', { hasText: first.name }).first()).toContainText(first.email);

    // search narrows
    const before = await rows.count();
    await search(page).fill(first.name);
    await expect(rows.first()).toContainText(first.name);
    expect(await rows.count()).toBeLessThanOrEqual(before);

    // empty state
    await search(page).fill(`zz-no-such-tenant-${Date.now()}`);
    await expect(page.getByText('No tenants yet').or(page.getByText(/no .* found|no results/i)).first()).toBeVisible();
    await search(page).fill('');

    // status filter
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Suspended', exact: true }).click();
    await waitForLoad(page);
    const suspended = await api('GET', '/admin/tenants?status=suspended&limit=100');
    await expect(page.locator('tbody tr', { hasText: first.name })).toHaveCount(
      suspended.data.some((t: any) => t.id === first.id) ? 1 : 0,
    );
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'All statuses', exact: true }).click();
    await waitForLoad(page);

    // export
    await expect(rows.first()).toBeVisible();
    await expectDownload(page, () => page.getByRole('button', { name: 'Export' }).click());

    // detail
    await page.locator('tbody tr', { hasText: first.name }).first().click();
    await page.waitForURL(/\/super-admin\/tenants\/[^/]+$/);
    await expect(heading(page, first.name)).toBeVisible();
    await expect(page.getByText(first.email).first()).toBeVisible();
    for (const t of ['Basic information', 'Company name', 'Email', 'Phone', 'Website', 'Created']) {
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    }
    await noErrorToast(page);
  });

  test('users: list, search, role + status filters, detail drawer, empty state', async ({ page }) => {
    test.skip(!granted, 'requires super-admin access');
    const list = await api('GET', '/admin/users?limit=100');
    const first = list.data[0];
    expect(first).toBeTruthy();

    await open(page, '/super-admin/users');
    const row = page.locator('tbody tr', { hasText: first.email }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(first.name);
    await expect(row).toContainText(first.tenantName);

    await search(page).fill(first.email);
    await expect(page.locator('tbody tr').first()).toContainText(first.email);

    await search(page).fill(`zz-nobody-${Date.now()}`);
    await expect(page.getByText('No users found')).toBeVisible();
    await search(page).fill('');

    await page.getByRole('combobox').nth(0).click();
    await page.getByRole('option', { name: 'Admin', exact: true }).click();
    await waitForLoad(page);
    for (const r of await page.locator('tbody tr td:nth-child(4)').allTextContents()) {
      expect(r.toLowerCase()).toContain('admin');
    }

    await page.getByRole('combobox').nth(0).click();
    await page.getByRole('option', { name: 'All roles', exact: true }).click();
    await waitForLoad(page);
    await page.locator('tbody tr', { hasText: first.email }).first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText(first.name).first()).toBeVisible();
    await expect(drawer.getByText(first.tenantName).first()).toBeVisible();
    for (const t of ['Tenant', 'Role', 'Status', 'Joined']) await expect(drawer.getByText(t, { exact: true })).toBeVisible();
  });

  test('plans: catalog cards show price, limits and features', async ({ page }) => {
    test.skip(!granted, 'requires super-admin access');
    const { data: plans } = await api('GET', '/admin/plans');
    expect(plans.length).toBeGreaterThan(0);
    await open(page, '/super-admin/plans');
    for (const plan of plans) {
      const card = page.locator('div', { has: page.getByText(plan.name, { exact: true }) }).filter({ hasText: /per (month|year)/ }).last();
      await expect(card).toBeVisible();
      await expect(card).toContainText(plan.billingCycle === 'yearly' ? 'per year' : 'per month');
      if (plan.maxUsers) await expect(card).toContainText(`Up to ${plan.maxUsers} users`);
    }
  });

  test('billing: stat cards, invoices/payments tabs, status filter, export', async ({ page }) => {
    test.skip(!granted, 'requires super-admin access');
    await open(page, '/super-admin/billing');
    for (const t of ['Total revenue', 'MRR', 'Active subscriptions', 'Churn rate', 'Revenue trend']) {
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: 'Invoices' })).toHaveAttribute('data-state', 'active');
    await expect(page.getByRole('columnheader', { name: /Invoice ID/ })).toBeVisible();

    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Cancelled', exact: true }).click();
    await waitForLoad(page);
    const cancelled = await api('GET', '/admin/billing/invoices?status=cancelled&limit=100');
    await expect(page.locator('tbody tr').filter({ hasNotText: 'No invoices found' })).toHaveCount(
      cancelled.data.length,
    ).catch(async () => {
      await expect(page.getByText('No invoices found')).toBeVisible();
    });

    await page.getByRole('tab', { name: 'Payments' }).click();
    await expect(page.getByRole('columnheader', { name: /Payment ID/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Method/ })).toBeVisible();
    await noErrorToast(page);
  });

  test('system: health stats, service status, refresh, logs tab', async ({ page }) => {
    test.skip(!granted, 'requires super-admin access');
    await open(page, '/super-admin/system');
    for (const t of ['Uptime', 'Response time', 'CPU usage', 'Memory usage', 'Service status', 'Database connection', 'Cache service']) {
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    }
    const refreshed = page.waitForResponse((r) => r.url().includes('/admin/system/health'));
    await page.getByRole('button', { name: /Refresh/ }).click();
    expect((await refreshed).ok()).toBe(true);

    await page.getByRole('tab', { name: 'Logs' }).click();
    await expect(page.getByRole('columnheader', { name: /Level/ })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Message/ })).toBeVisible();
  });

  test('config: read-only sections, no editable inputs', async ({ page }) => {
    test.skip(!granted, 'requires super-admin access');
    await open(page, '/super-admin/config');
    for (const t of ['Application', 'Security settings', 'Email configuration', 'Tenants per plan']) {
      await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
    }
    for (const t of ['Application name', 'Support email', 'Password min length', 'Max login attempts', 'Session timeout']) {
      await expect(page.getByText(t, { exact: true })).toBeVisible();
    }
    await expect(page.locator('main input:not([type="hidden"]), main textarea')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Save|Update)/ })).toHaveCount(0);
  });

  test('audit: list, search, action filter, empty state, detail drawer, export', async ({ page }) => {
    test.skip(!granted, 'requires super-admin access');
    await open(page, '/super-admin/audit');
    const emptyOrRows = page.locator('tbody tr').first().or(page.getByText('No audit logs found'));
    await expect(emptyOrRows).toBeVisible();

    await search(page).fill(`zz-no-audit-${Date.now()}`);
    await expect(page.getByText('No audit logs found')).toBeVisible();
    await search(page).fill('');

    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Login', exact: true }).click();
    await waitForLoad(page);
    for (const t of await page.locator('tbody tr td:nth-child(1)').allTextContents()) {
      if (t.trim() && !/no audit/i.test(t)) expect(t.toLowerCase()).toContain('login');
    }
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'All actions', exact: true }).click();
    await waitForLoad(page);

    if (await page.locator('tbody tr').count()) {
      await page.locator('tbody tr').first().click();
      const drawer = page.getByRole('dialog');
      for (const t of ['Action', 'Resource type', 'User', 'Timestamp']) {
        await expect(drawer.getByText(t, { exact: true })).toBeVisible();
      }
    }
  });
});
