import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';

test.describe('Import & Export', () => {
  test('should load import settings page', async ({ page }) => {
    await page.goto('/settings/import');
    await waitForLoad(page);
    await expect(page.locator('text=Import').first()).toBeVisible();
  });

  test('should load export settings page', async ({ page }) => {
    await page.goto('/settings/export');
    await waitForLoad(page);
    await expect(page.locator('text=Export').first()).toBeVisible();
  });

  test('should load bulk import page', async ({ page }) => {
    await page.goto('/import');
    await waitForLoad(page);
    await expect(page.locator('text=Import').first()).toBeVisible({ timeout: 10_000 });
  });

  // Chatbot (separate section)
  test('should load chatbot page @env-dependent', async ({ page }) => {
    await page.goto('/chatbot');
    await waitForLoad(page);
    await expect(page.locator('text=Chatbot').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load chatbot analytics @env-dependent', async ({ page }) => {
    await page.goto('/chatbot/analytics');
    await waitForLoad(page);
    await expect(page.locator('text=Analytics').or(page.locator('text=Chatbot')).first()).toBeVisible({ timeout: 10_000 });
  });

  // Help
  test('should load help page', async ({ page }) => {
    await page.goto('/help');
    await waitForLoad(page);
    await expect(page.locator('text=Help').first()).toBeVisible({ timeout: 10_000 });
  });

  // Payments
  test('should load payments page', async ({ page }) => {
    await page.goto('/payments');
    await waitForLoad(page);
    await expect(page.locator('text=Payments').first()).toBeVisible({ timeout: 10_000 });
  });

  // Accounts
  test('should load accounts page', async ({ page }) => {
    await page.goto('/accounts');
    await waitForLoad(page);
    await expect(page.locator('text=Accounts').first()).toBeVisible({ timeout: 10_000 });
  });

  // Rate Cards
  test('should load rate cards page', async ({ page }) => {
    await page.goto('/rate-cards');
    await waitForLoad(page);
    await expect(page.locator('text=Rate').first()).toBeVisible({ timeout: 10_000 });
  });
});
