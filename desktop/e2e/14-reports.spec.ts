import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';

test.describe('Reports', () => {
  test('should load reports hub', async ({ page }) => {
    await page.goto('/reports');
    await waitForLoad(page);
    await expect(page.locator('text=Reports').first()).toBeVisible();
  });

  const reportRoutes = [
    { path: '/reports/sales', text: 'Sales' },
    { path: '/reports/revenue', text: 'Revenue' },
    { path: '/reports/pipeline', text: 'Pipeline' },
    { path: '/reports/leads', text: 'Lead' },
    { path: '/reports/team', text: 'Team' },
    { path: '/reports/customer', text: 'Customer' },
    { path: '/reports/financial', text: 'Financial' },
    { path: '/reports/fleet', text: 'Fleet' },
    { path: '/reports/supplier', text: 'Supplier' },
    { path: '/reports/visa', text: 'Visa' },
    { path: '/reports/marketing', text: 'Marketing' },
  ];

  for (const { path, text } of reportRoutes) {
    test(`should load ${text} report page`, async ({ page }) => {
      await page.goto(path);
      await waitForLoad(page);
      // Page should render without crashing
      await expect(page.locator(`text=${text}`).first()).toBeVisible({ timeout: 10_000 });
    });
  }
});
