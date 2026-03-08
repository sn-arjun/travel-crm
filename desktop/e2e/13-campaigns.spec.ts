import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';

test.describe('Campaigns', () => {
  test('should load campaigns list', async ({ page }) => {
    await page.goto('/campaigns');
    await waitForLoad(page);
    await expect(page.locator('text=Campaigns').first()).toBeVisible();
  });

  test('should load create campaign page', async ({ page }) => {
    await page.goto('/campaigns/new');
    await waitForLoad(page);
    await expect(page.locator('text=Campaign').first()).toBeVisible({ timeout: 10_000 });
  });
});
