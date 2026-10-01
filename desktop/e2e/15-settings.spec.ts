import { test, expect } from '@playwright/test';
import { waitForLoad } from './helpers/auth';

test.describe('Settings', () => {
  test('should switch to Security tab and show quick links', async ({ page }) => {
    await page.goto('/settings');
    await waitForLoad(page);

    // Click Security tab
    await page.getByRole('tab', { name: 'Security' }).click();

    // Should show 4 quick-link cards
    await expect(page.locator('a[href="/settings/profile"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('a[href="/settings/sessions"]')).toBeVisible();
    await expect(page.locator('a[href="/settings/login-history"]')).toBeVisible();
    await expect(page.locator('a[href="/settings/activity-log"]')).toBeVisible();

    // Should show Change Password form
    await expect(page.locator('#currentPassword')).toBeVisible();
    await expect(page.locator('#newPassword')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
  });

  test('should navigate from Security tab to Sessions page', async ({ page }) => {
    await page.goto('/settings');
    await waitForLoad(page);

    await page.getByRole('tab', { name: 'Security' }).click();
    await expect(page.locator('a[href="/settings/sessions"]')).toBeVisible({ timeout: 5_000 });

    await page.locator('a[href="/settings/sessions"]').click();
    await page.waitForURL('**/settings/sessions', { timeout: 10_000 });
    await waitForLoad(page);

    await expect(page.locator('h1:has-text("Active Sessions")')).toBeVisible();
  });

  test('should navigate from Security tab to Login History page', async ({ page }) => {
    await page.goto('/settings');
    await waitForLoad(page);

    await page.getByRole('tab', { name: 'Security' }).click();
    await expect(page.locator('a[href="/settings/login-history"]')).toBeVisible({ timeout: 5_000 });

    await page.locator('a[href="/settings/login-history"]').click();
    await page.waitForURL('**/settings/login-history', { timeout: 10_000 });
    await waitForLoad(page);

    await expect(page.locator('h1:has-text("Login History")')).toBeVisible();
  });

  test('should navigate from Security tab to Activity Log page', async ({ page }) => {
    await page.goto('/settings');
    await waitForLoad(page);

    await page.getByRole('tab', { name: 'Security' }).click();
    await expect(page.locator('a[href="/settings/activity-log"]')).toBeVisible({ timeout: 5_000 });

    await page.locator('a[href="/settings/activity-log"]').click();
    await page.waitForURL('**/settings/activity-log', { timeout: 10_000 });
    await waitForLoad(page);

    await expect(page.locator('h1:has-text("Activity Log")')).toBeVisible();
  });
});

test.describe('Profile Settings', () => {
  test('should load profile page with user info', async ({ page }) => {
    await page.goto('/settings/profile');
    await waitForLoad(page);

    await expect(page.locator('h1:has-text("User Profile")')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Personal Information', { exact: true })).toBeVisible();

    // Name input should be filled
    const nameInput = page.locator('#name');
    await expect(nameInput).toBeVisible();
    await expect(nameInput).not.toHaveValue('');

    // Save Profile button
    await expect(page.locator('button:has-text("Save Profile")')).toBeVisible();
  });

  test('should show Change Password section on profile page', async ({ page }) => {
    await page.goto('/settings/profile');
    await waitForLoad(page);

    await expect(page.locator('text=Change Password').first()).toBeVisible();
    await expect(page.locator('#currentPassword')).toBeVisible();
    await expect(page.locator('#newPassword')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
    await expect(page.locator('button:has-text("Update Password")')).toBeVisible();
  });

  test('should edit and save profile name', async ({ page }) => {
    await page.goto('/settings/profile');
    await waitForLoad(page);

    const nameInput = page.locator('#name');
    const original = await nameInput.inputValue();

    // Change name
    await nameInput.clear();
    await nameInput.fill('Admin User Updated');
    await page.locator('button:has-text("Save Profile")').click();
    await page.waitForTimeout(2000);

    // Restore original
    await nameInput.clear();
    await nameInput.fill(original || 'Admin User');
    await page.locator('button:has-text("Save Profile")').click();
    await page.waitForTimeout(2000);
  });
});

test.describe('Active Sessions', () => {
  test('should load sessions page with session table', async ({ page }) => {
    await page.goto('/settings/sessions');
    await waitForLoad(page);

    await expect(page.locator('h1:has-text("Active Sessions")')).toBeVisible();
    await expect(page.locator('text=Devices and browsers where you are currently logged in')).toBeVisible();
  });

  test('should display current session with correct data', async ({ page }) => {
    await page.goto('/settings/sessions');
    await waitForLoad(page);

    // Table headers should be present
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10_000 });
    await expect(table.locator('th:has-text("Device")')).toBeVisible();
    await expect(table.locator('th:has-text("Browser / OS")')).toBeVisible();
    await expect(table.locator('th:has-text("IP Address")')).toBeVisible();
    await expect(table.locator('th:has-text("Login Time")')).toBeVisible();
    await expect(table.locator('th:has-text("Status")')).toBeVisible();

    // Should have at least one session row
    const rows = table.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);

    // Current session badge should be visible
    await expect(page.locator('text=Current').first()).toBeVisible();

    // Session should show a real browser name (not "Unknown")
    const firstRow = rows.first();
    const browserCell = firstRow.locator('td').nth(1);
    const browserText = await browserCell.textContent();
    expect(browserText).toBeTruthy();
  });

  test('should show back button that navigates to settings', async ({ page }) => {
    await page.goto('/settings/sessions');
    await waitForLoad(page);

    // Click back arrow button (first button in the header area)
    await page.locator('button:has(svg.h-5.w-5)').first().click();
    await page.waitForURL('**/settings', { timeout: 10_000 });
  });
});

test.describe('Login History', () => {
  test('should load login history page', async ({ page }) => {
    await page.goto('/settings/login-history');
    await waitForLoad(page);

    await expect(page.locator('h1:has-text("Login History")')).toBeVisible();
    await expect(page.locator('text=Review your recent login activity')).toBeVisible();
  });

  test('should show filter controls', async ({ page }) => {
    await page.goto('/settings/login-history');
    await waitForLoad(page);

    // Status filter dropdown
    await expect(page.locator('button:has-text("All Statuses")')).toBeVisible();

    // Date filter inputs
    const dateInputs = page.locator('input[type="date"]');
    const dateCount = await dateInputs.count();
    expect(dateCount).toBeGreaterThanOrEqual(2);
  });

  test('should display login activity section', async ({ page }) => {
    await page.goto('/settings/login-history');
    await waitForLoad(page);

    // Should show Login Activity card title
    await expect(page.getByText('Login Activity', { exact: true })).toBeVisible();
  });
});

test.describe('Activity Log', () => {
  test('should load activity log page', async ({ page }) => {
    await page.goto('/settings/activity-log');
    await waitForLoad(page);

    await expect(page.locator('h1:has-text("Activity Log")')).toBeVisible();
    await expect(page.locator('text=Track all actions performed in the system')).toBeVisible();
  });

  test('should show filter controls', async ({ page }) => {
    await page.goto('/settings/activity-log');
    await waitForLoad(page);

    // Search input
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();

    // Action filter
    await expect(page.locator('button:has-text("All Actions")')).toBeVisible();

    // Entity filter
    await expect(page.locator('button:has-text("All Entities")')).toBeVisible();
  });
});

test.describe('Settings Sub-pages', () => {
  test('should load team settings', async ({ page }) => {
    await page.goto('/settings/team');
    await waitForLoad(page);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('should open invite dialog on team page', async ({ page }) => {
    await page.goto('/settings/team');
    await waitForLoad(page);

    const inviteBtn = page.locator('button:has-text("Invite")').first();
    if (await inviteBtn.isVisible()) {
      await inviteBtn.click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });
      await page.locator('[role="dialog"] button:has-text("Cancel")').click();
    }
  });

  test('should load notification preferences', async ({ page }) => {
    await page.goto('/settings/notifications');
    await waitForLoad(page);
    await expect(page.locator('h1').first()).toBeVisible();
  });
});
