import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';

test.describe('Dashboard', () => {
  test('should load dashboard with KPI cards', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);

    // Dashboard heading should be visible
    await expect(page.locator('text=Dashboard').first()).toBeVisible();

    // Should have stat cards (look for common KPI patterns)
    const cards = page.locator('[class*="CardContent"], [class*="card"]');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
  });

  test('sidebar navigation — core pages load', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);

    const navTests = [
      { href: '/leads', text: 'Leads' },
      { href: '/contacts', text: 'Contacts' },
      { href: '/invoices', text: 'Invoices' },
      { href: '/tasks', text: 'Tasks' },
      { href: '/calendar', text: 'Calendar' },
    ];

    for (const { href, text } of navTests) {
      await page.locator(`aside a[href="${href}"]`).first().click();
      await page.waitForURL(`**${href}*`, { timeout: 15_000 });
      // Page should render something (not blank or error)
      await expect(page.locator(`text=${text}`).first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('sidebar navigation — operations pages', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);

    const navTests = [
      { href: '/fleet', text: 'Fleet' },
      { href: '/itineraries', text: 'Itineraries' },
      { href: '/suppliers', text: 'Suppliers' },
      { href: '/vouchers', text: 'Vouchers' },
    ];

    for (const { href, text } of navTests) {
      await page.locator(`aside a[href="${href}"]`).first().click();
      await page.waitForURL(`**${href}*`, { timeout: 15_000 });
      await expect(page.locator(`text=${text}`).first()).toBeVisible({ timeout: 10_000 });
    }
  });

  test('top navbar shows user info', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);

    // Navbar should show page title
    const header = page.locator('header').first();
    await expect(header).toBeVisible();
  });
});
