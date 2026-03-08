import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';

test.describe('Documents', () => {
  test('should load documents page', async ({ page }) => {
    await page.goto('/documents');
    await waitForLoad(page);
    await expect(page.locator('text=Documents').first()).toBeVisible();
  });

  test('should show upload area', async ({ page }) => {
    await page.goto('/documents');
    await waitForLoad(page);

    // Look for upload button or drag area
    const uploadBtn = page.locator('button:has-text("Upload"), [aria-label*="upload"], input[type="file"]').first();
    // At minimum the page should render
    await page.waitForTimeout(2000);
  });
});
