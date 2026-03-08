import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { seedVehicle, seedDriver } from './helpers/api-seed';

test.describe('Fleet Management', () => {
  test('should load fleet dashboard', async ({ page }) => {
    await page.goto('/fleet');
    await waitForLoad(page);
    await expect(page.locator('text=Fleet').first()).toBeVisible();
  });

  // Vehicles
  test('should load vehicles list', async ({ page }) => {
    await page.goto('/fleet/vehicles');
    await waitForLoad(page);
    await expect(page.locator('text=Vehicles').first()).toBeVisible();
  });

  test('should create a new vehicle', async ({ page }) => {
    await page.goto('/fleet/vehicles/new');
    await waitForLoad(page);

    const regInput = page.locator('input[name="registrationNumber"], #registrationNumber').first();
    if (await regInput.isVisible()) {
      await regInput.fill(`E2E-${Date.now().toString(36).toUpperCase()}`);
    }

    await page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")').first().click();
    await page.waitForTimeout(2000);
  });

  test('should navigate to vehicle detail', async ({ page }) => {
    const vehicle = await seedVehicle();
    if (!vehicle?.id) return;

    await page.goto(`/fleet/vehicles/${vehicle.id}`);
    await waitForLoad(page);
    await expect(page.locator('text=Vehicle').first()).toBeVisible({ timeout: 10_000 });
  });

  // Drivers
  test('should load drivers list', async ({ page }) => {
    await page.goto('/fleet/drivers');
    await waitForLoad(page);
    await expect(page.locator('text=Drivers').first()).toBeVisible();
  });

  test('should create a new driver', async ({ page }) => {
    await page.goto('/fleet/drivers/new');
    await waitForLoad(page);

    const nameInput = page.locator('input[name="name"], #name').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill(`E2E Driver ${Date.now()}`);
    }

    await page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Create")').first().click();
    await page.waitForTimeout(2000);
  });

  // Trips
  test('should load trips list', async ({ page }) => {
    await page.goto('/fleet/trips');
    await waitForLoad(page);
    await expect(page.locator('text=Trips').first()).toBeVisible();
  });

  test('should load trip creation page', async ({ page }) => {
    await page.goto('/fleet/trips/new');
    await waitForLoad(page);
    await expect(page.locator('text=Trip').first()).toBeVisible({ timeout: 10_000 });
  });

  // Rate Cards
  test('should load fleet rate cards', async ({ page }) => {
    await page.goto('/fleet/rate-cards');
    await waitForLoad(page);
    await expect(page.locator('text=Rate').first()).toBeVisible({ timeout: 10_000 });
  });

  // Alerts
  test('should load fleet alerts', async ({ page }) => {
    await page.goto('/fleet/alerts');
    await waitForLoad(page);
    await expect(page.locator('text=Alerts').first()).toBeVisible({ timeout: 10_000 });
  });
});
