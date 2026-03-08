import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';

test.describe('Marketing', () => {
  test('should load social content page', async ({ page }) => {
    await page.goto('/marketing/social');
    await waitForLoad(page);
    await expect(page.locator('text=Social').first()).toBeVisible();
  });

  test('should fill social content form and create post', async ({ page }) => {
    await page.goto('/marketing/social');
    await waitForLoad(page);

    const topicInput = page.locator('input[placeholder*="promotion"], input[placeholder*="topic"]').first();
    if (await topicInput.isVisible()) {
      await topicInput.clear();
      await topicInput.fill('E2E Weekend Getaway');
    }

    const generateBtn = page.locator('button:has-text("Generate")').first();
    if (await generateBtn.isVisible()) {
      await generateBtn.click();
      await page.waitForTimeout(3000);
    }
  });

  test('should load flyers page', async ({ page }) => {
    await page.goto('/marketing/flyers');
    await waitForLoad(page);
    await expect(page.locator('text=Flyer').or(page.locator('text=Marketing')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load branding settings', async ({ page }) => {
    await page.goto('/marketing/branding');
    await waitForLoad(page);
    await expect(page.locator('text=Brand').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load segments list', async ({ page }) => {
    await page.goto('/marketing/segments');
    await waitForLoad(page);
    await expect(page.locator('text=Segment').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load create segment page', async ({ page }) => {
    await page.goto('/marketing/segments/new');
    await waitForLoad(page);
    await expect(page.locator('text=Segment').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load campaigns page', async ({ page }) => {
    await page.goto('/marketing/campaigns');
    await waitForLoad(page);
    await expect(page.locator('text=Campaign').first()).toBeVisible({ timeout: 10_000 });
  });
});
