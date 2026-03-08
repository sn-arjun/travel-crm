import { type Page, expect } from '@playwright/test';

const API_URL = 'http://localhost:8787/api/v1';
const ADMIN_EMAIL = 'admin@demo.com';
const ADMIN_PASSWORD = 'Admin@123';
const TENANT_ID = '01960000-0000-7000-8000-000000000001';

export { API_URL, ADMIN_EMAIL, ADMIN_PASSWORD, TENANT_ID };

/**
 * Login via the UI (used in global setup and auth tests).
 */
export async function loginViaUI(page: Page) {
  await page.goto('/login');
  await page.waitForSelector('text=Welcome back');

  // Step 1: Enter email
  await page.locator('#email').fill(ADMIN_EMAIL);
  await page.locator('button[type="submit"]').click();

  // Wait for step 2 (password form)
  await page.waitForSelector('#password', { timeout: 15_000 });

  // Step 2: Enter password and submit
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();

  // Wait for redirect to dashboard
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 20_000 });
  await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Get an auth token directly via API (for data seeding).
 */
export async function getAuthToken(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      tenantId: TENANT_ID,
    }),
  });
  const json = await res.json();
  if (!json.data?.accessToken) {
    throw new Error(`Login failed: ${JSON.stringify(json)}`);
  }
  return json.data.accessToken;
}

/**
 * Wait for any loading spinners to disappear.
 */
export async function waitForLoad(page: Page) {
  // Wait for Loader2 spinners to disappear
  await page.waitForFunction(() => {
    return document.querySelectorAll('.animate-spin').length === 0;
  }, { timeout: 15_000 }).catch(() => {
    // Ignore — some pages may not have spinners
  });
}

/**
 * Navigate via sidebar link.
 */
export async function navigateTo(page: Page, href: string, waitForText?: string) {
  await page.locator(`aside a[href="${href}"]`).first().click();
  await page.waitForURL(`**${href}*`, { timeout: 15_000 });
  if (waitForText) {
    await expect(page.locator(`text=${waitForText}`).first()).toBeVisible({ timeout: 10_000 });
  }
  await waitForLoad(page);
}
