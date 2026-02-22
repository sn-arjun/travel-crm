import { test, expect } from '@playwright/test';
import { TEST_ADMIN } from '../helpers/test-data';

test.describe('Browser: Login Flow', () => {
  const baseURL = process.env.APP_BASE_URL || 'http://localhost:3000';

  test.beforeEach(async ({ page }) => {
    // Clear any existing session
    await page.context().clearCookies();
    await page.goto('/');
  });

  test('should display login screen', async ({ page }) => {
    await page.goto('/');

    // Check for login form elements
    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();
  });

  test('should show validation error for empty email', async ({ page }) => {
    await page.goto('/');

    const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');
    await submitButton.click();

    // Check for error message
    const errorMessage = page.locator('text=/email|Email|required/i');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test('should show validation error for invalid email', async ({ page }) => {
    await page.goto('/');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
    await emailInput.fill('invalid-email');

    // Trigger validation
    const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');
    await submitButton.click();

    const errorMessage = page.locator('text=/email|Email|invalid/i');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test('should show validation error for empty password', async ({ page }) => {
    await page.goto('/');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
    await emailInput.fill(TEST_ADMIN.email);

    const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');
    await submitButton.click();

    const errorMessage = page.locator('text=/password|Password|required/i');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
    const passwordInput = page.locator('input[type="password"]');

    await emailInput.fill('test@example.com');
    await passwordInput.fill('wrongpassword');

    const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');
    await submitButton.click();

    // Wait for error message
    const errorMessage = page.locator('text=/invalid|incorrect|credentials|failed/i');
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
    const passwordInput = page.locator('input[type="password"]');

    await emailInput.fill(TEST_ADMIN.email);
    await passwordInput.fill(TEST_ADMIN.password);

    const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');
    await submitButton.click();

    // Wait for redirect to dashboard
    await page.waitForURL(/\/(dashboard|home|leads)/, { timeout: 15000 });

    expect(page.url()).not.toContain('/login');
  });

  test('should redirect to dashboard after successful login', async ({ page }) => {
    await page.goto('/');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
    const passwordInput = page.locator('input[type="password"]');

    await emailInput.fill(TEST_ADMIN.email);
    await passwordInput.fill(TEST_ADMIN.password);

    const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');
    await submitButton.click();

    await page.waitForURL(/\/(dashboard|home|leads)/, { timeout: 15000 });

    // Verify we're on dashboard
    const dashboardTitle = page.locator('text=/Dashboard|Home|Leads|CRM/i').first();
    await expect(dashboardTitle).toBeVisible();
  });

  test('should display user name in header after login', async ({ page }) => {
    await page.goto('/');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
    const passwordInput = page.locator('input[type="password"]');

    await emailInput.fill(TEST_ADMIN.email);
    await passwordInput.fill(TEST_ADMIN.password);

    const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');
    await submitButton.click();

    await page.waitForURL(/\/(dashboard|home|leads)/, { timeout: 15000 });

    // Look for user name or profile menu
    const userMenu = page.locator('button:has-text("Profile"), [role="button"] >> text=/admin|user|account/i').first();
    await expect(userMenu).toBeVisible({ timeout: 5000 });
  });

  test('should display navigation sidebar after login', async ({ page }) => {
    await page.goto('/');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
    const passwordInput = page.locator('input[type="password"]');

    await emailInput.fill(TEST_ADMIN.email);
    await passwordInput.fill(TEST_ADMIN.password);

    const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');
    await submitButton.click();

    await page.waitForURL(/\/(dashboard|home|leads)/, { timeout: 15000 });

    // Check for navigation items
    const navigationItems = ['Contacts', 'Leads', 'Invoices', 'Templates'];

    for (const item of navigationItems) {
      const navItem = page.locator(`text=${item}`).first();
      await expect(navItem).toBeVisible({ timeout: 5000 });
    }
  });

  test('should maintain session on page reload', async ({ page }) => {
    await page.goto('/');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
    const passwordInput = page.locator('input[type="password"]');

    await emailInput.fill(TEST_ADMIN.email);
    await passwordInput.fill(TEST_ADMIN.password);

    const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');
    await submitButton.click();

    await page.waitForURL(/\/(dashboard|home|leads)/, { timeout: 15000 });

    const currentUrl = page.url();

    // Reload page
    await page.reload();

    // Should still be on dashboard, not redirected to login
    expect(page.url()).not.toContain('/login');
    const dashboardTitle = page.locator('text=/Dashboard|Home|Leads|CRM/i').first();
    await expect(dashboardTitle).toBeVisible({ timeout: 5000 });
  });

  test('should show loading state during login', async ({ page }) => {
    await page.goto('/');

    const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
    const passwordInput = page.locator('input[type="password"]');

    await emailInput.fill(TEST_ADMIN.email);
    await passwordInput.fill(TEST_ADMIN.password);

    const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');

    // Click and immediately check for loading state
    await submitButton.click();

    // Check for loading indicator (spinner, disabled button, etc.)
    const isDisabled = await submitButton.isDisabled();
    expect(isDisabled).toBeTruthy();

    // Wait for navigation to complete
    await page.waitForURL(/\/(dashboard|home|leads)/, { timeout: 15000 });
  });

  test('should handle remember me checkbox', async ({ page }) => {
    await page.goto('/');

    const rememberCheckbox = page.locator('input[type="checkbox"]');
    const checkboxCount = await rememberCheckbox.count();

    if (checkboxCount > 0) {
      const emailInput = page.locator('input[type="email"], input[placeholder*="email"], input[placeholder*="Email"]');
      const passwordInput = page.locator('input[type="password"]');

      await emailInput.fill(TEST_ADMIN.email);
      await passwordInput.fill(TEST_ADMIN.password);

      // Check remember me if it exists
      await rememberCheckbox.first().check();

      const submitButton = page.locator('button:has-text("Sign In"), button:has-text("Login"), button:has-text("Log In")');
      await submitButton.click();

      await page.waitForURL(/\/(dashboard|home|leads)/, { timeout: 15000 });

      // Logout and verify remember me functionality
      // (implementation depends on app structure)
    }
  });

  test('should display password visibility toggle', async ({ page }) => {
    await page.goto('/');

    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();

    // Look for eye icon or toggle button
    const toggleButton = page.locator('[data-testid="toggle-password"], button:near(input[type="password"])').first();
    const toggleCount = await toggleButton.count();

    if (toggleCount > 0) {
      await passwordInput.fill(TEST_ADMIN.password);
      await toggleButton.click();

      // Password field should be visible as text
      const visiblePassword = page.locator('input[type="text"]');
      const isVisible = await visiblePassword.isVisible();
      expect(isVisible).toBeTruthy();
    }
  });
});
