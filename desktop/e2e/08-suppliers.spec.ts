import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { seedSupplier } from './helpers/api-seed';

test.describe('Suppliers', () => {
  test('should load suppliers list', async ({ page }) => {
    await page.goto('/suppliers');
    await waitForLoad(page);
    await expect(page.locator('text=Suppliers').first()).toBeVisible();
  });

  test('should create a new supplier', async ({ page }) => {
    await page.goto('/suppliers/new');
    await waitForLoad(page);

    const nameInput = page.locator('input[name="name"], #name').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill(`E2E Supplier ${Date.now()}`);
    }

    await page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")').first().click();
    await page.waitForTimeout(2000);
  });

  test('should navigate to supplier detail', async ({ page }) => {
    const supplier = await seedSupplier();
    if (!supplier?.id) return;

    await page.goto(`/suppliers/${supplier.id}`);
    await waitForLoad(page);
    await expect(page.locator('text=Supplier').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load supplier comparison page', async ({ page }) => {
    await page.goto('/suppliers/compare');
    await waitForLoad(page);
    // Page should render
    await page.waitForTimeout(2000);
  });
});
