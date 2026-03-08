import { test, expect } from '@playwright/test';

test.use({ storageState: undefined }); // Don't use saved auth for these tests

test.describe('Authentication', () => {
  test('should show login page with email form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Welcome back')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('text=Enter your email to find your account')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should complete full 2-step login flow (email resolve → password)', async ({ page }) => {
    await page.goto('/login');

    // Step 1: Enter email — triggers tenant resolution
    await page.locator('#email').fill('admin@demo.com');
    await page.locator('button[type="submit"]').click();

    // Step 2: Should transition to password step with correct context
    await page.waitForSelector('#password', { timeout: 15_000 });
    await expect(page.locator('text=Signing in as admin@demo.com')).toBeVisible();

    // Password tab trigger should be visible
    await expect(page.locator('#password')).toBeVisible();

    // Enter password and submit
    await page.locator('#password').fill('Admin@123');
    await page.locator('button[type="submit"]').click();

    // Should redirect to app (root redirects to dashboard)
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 20_000 });
    // Dashboard should appear
    await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should show error for invalid password', async ({ page }) => {
    await page.goto('/login');

    // Step 1
    await page.locator('#email').fill('admin@demo.com');
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('#password', { timeout: 15_000 });

    // Step 2: Wrong password
    await page.locator('#password').fill('WrongPassword!');
    await page.locator('button[type="submit"]').click();

    // Should show error message
    await expect(page.locator('.text-destructive, [class*="destructive"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should show error for non-existent email', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('nonexistent@test.com');
    await page.locator('button[type="submit"]').click();

    // Should show "No account found" error
    await expect(page.locator('.text-destructive, [class*="destructive"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('should allow going back to change email', async ({ page }) => {
    await page.goto('/login');

    // Step 1
    await page.locator('#email').fill('admin@demo.com');
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('#password', { timeout: 15_000 });

    // Click "Change email" back button
    await page.locator('text=Change email').click();

    // Should go back to email step
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('text=Enter your email to find your account')).toBeVisible();
  });

  test('should redirect unauthenticated user from protected route', async ({ page }) => {
    // Clear cookies to ensure no auth
    await page.context().clearCookies();
    await page.goto('/dashboard');

    // Should redirect to login (auth guard in layout.tsx)
    await page.waitForTimeout(3000);
    const url = page.url();
    const hasLoginContent = await page.locator('text=Welcome back').isVisible().catch(() => false);
    expect(url.includes('/login') || hasLoginContent).toBeTruthy();
  });

  test('should handle logout via user menu', async ({ page }) => {
    // First login
    await page.goto('/login');
    await page.locator('#email').fill('admin@demo.com');
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('#password', { timeout: 15_000 });
    await page.locator('#password').fill('Admin@123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 20_000 });

    // Open user dropdown menu in the top navbar
    // The user menu is the last button in header with avatar text
    const userMenuTrigger = page.locator('header button').last();
    await userMenuTrigger.click();

    // Click Sign out in dropdown
    await page.locator('[role="menuitem"]:has-text("Sign out")').click();

    // Should redirect to login
    await page.waitForURL('**/login', { timeout: 15_000 });
    await expect(page.locator('text=Welcome back')).toBeVisible();
  });

  test('should show dashboard with stats after login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('admin@demo.com');
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('#password', { timeout: 15_000 });
    await page.locator('#password').fill('Admin@123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 20_000 });

    // Dashboard should show welcome message
    await expect(page.locator('text=Welcome back').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Dashboard').first()).toBeVisible();

    // Should show stat cards (New Leads, Revenue, etc.)
    await expect(page.locator('text=New Leads')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Revenue').first()).toBeVisible();
  });

  test('should navigate to user profile from dropdown menu', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.locator('#email').fill('admin@demo.com');
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('#password', { timeout: 15_000 });
    await page.locator('#password').fill('Admin@123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 20_000 });

    // Open user dropdown — last button in header
    const userMenuTrigger = page.locator('header button').last();
    await userMenuTrigger.click();

    // Click Profile
    await page.locator('[role="menuitem"]:has-text("Profile")').click();

    // Should navigate to profile page
    await page.waitForURL('**/settings/profile', { timeout: 10_000 });
    await expect(page.locator('text=User Profile')).toBeVisible({ timeout: 10_000 });
  });
});
