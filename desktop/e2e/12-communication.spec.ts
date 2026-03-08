import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';

test.describe('Communication Hub', () => {
  test('should load communication inbox', async ({ page }) => {
    await page.goto('/communication');
    await waitForLoad(page);
    await expect(page.locator('text=Communication').or(page.locator('text=Inbox')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load compose page', async ({ page }) => {
    await page.goto('/communication/compose');
    await waitForLoad(page);
    await expect(page.locator('text=Compose').or(page.locator('text=Message')).first()).toBeVisible({ timeout: 10_000 });
  });

  // Templates
  test('should load templates list', async ({ page }) => {
    await page.goto('/communication/templates');
    await waitForLoad(page);
    await expect(page.locator('text=Templates').first()).toBeVisible();
  });

  test('should load create template page', async ({ page }) => {
    await page.goto('/communication/templates/new');
    await waitForLoad(page);
    await expect(page.locator('text=Template').first()).toBeVisible({ timeout: 10_000 });
  });

  // Bulk Send
  test('should load bulk send page', async ({ page }) => {
    await page.goto('/communication/bulk-send');
    await waitForLoad(page);
    await expect(page.locator('text=Bulk').or(page.locator('text=Send')).first()).toBeVisible({ timeout: 10_000 });
  });

  // Calls
  test('should load calls page', async ({ page }) => {
    await page.goto('/communication/calls');
    await waitForLoad(page);
    await expect(page.locator('text=Call').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load dial pad', async ({ page }) => {
    await page.goto('/communication/calls/dial');
    await waitForLoad(page);
    await expect(page.locator('text=Dial').or(page.locator('text=Call')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load call analytics @env-dependent', async ({ page }) => {
    await page.goto('/communication/calls/analytics');
    await waitForLoad(page);
    await expect(page.locator('text=Analytics').or(page.locator('text=Call')).first()).toBeVisible({ timeout: 10_000 });
  });

  test('should load transcripts page @env-dependent', async ({ page }) => {
    await page.goto('/communication/calls/transcripts');
    await waitForLoad(page);
    await expect(page.locator('text=Transcript').or(page.locator('text=Call')).first()).toBeVisible({ timeout: 10_000 });
  });
});
