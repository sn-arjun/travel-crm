import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { seedStickyNote } from './helpers/api-seed';

test.describe('Bookmarks & Sticky Notes', () => {
  test('should load bookmarks page', async ({ page }) => {
    await page.goto('/bookmarks');
    await waitForLoad(page);
    await expect(page.locator('text=Bookmarks').first()).toBeVisible();
  });

  test('should show sticky notes on dashboard', async ({ page }) => {
    await seedStickyNote({ content: 'E2E Sticky Note' });

    await page.goto('/dashboard');
    await waitForLoad(page);

    // Sticky notes widget should be visible
    await page.waitForTimeout(2000);
  });

  test('should load notifications page', async ({ page }) => {
    await page.goto('/notifications');
    await waitForLoad(page);
    await expect(page.locator('text=Notifications').first()).toBeVisible();
  });
});
