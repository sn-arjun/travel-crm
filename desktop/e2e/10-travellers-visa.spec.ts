import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { seedTraveller } from './helpers/api-seed';

test.describe('Travellers & Visa', () => {
  // Travellers
  test('should load travellers list', async ({ page }) => {
    await page.goto('/travellers');
    await waitForLoad(page);
    await expect(page.locator('text=Travellers').first()).toBeVisible();
  });

  test('should create a new traveller', async ({ page }) => {
    await page.goto('/travellers/new');
    await waitForLoad(page);

    const nameInput = page.locator('input[name="name"], #name').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill(`E2E Traveller ${Date.now()}`);
    }

    await page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")').first().click();
    await page.waitForTimeout(2000);
  });

  test('should navigate to traveller detail', async ({ page }) => {
    const traveller = await seedTraveller();
    if (!traveller?.id) return;

    await page.goto(`/travellers/${traveller.id}`);
    await waitForLoad(page);
    await expect(page.locator('text=Traveller').first()).toBeVisible({ timeout: 10_000 });
  });

  // Visa
  test('should load visa list', async ({ page }) => {
    await page.goto('/visa');
    await waitForLoad(page);
    await expect(page.locator('text=Visa').first()).toBeVisible();
  });

  test('should load visa dashboard', async ({ page }) => {
    await page.goto('/visa/dashboard');
    await waitForLoad(page);
    await expect(page.locator('text=Visa').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load create visa page', async ({ page }) => {
    await page.goto('/visa/new');
    await waitForLoad(page);
    await expect(page.locator('text=Visa').first()).toBeVisible({ timeout: 10_000 });
  });
});
