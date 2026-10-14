import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';

/**
 * The platform operator console is a separate app (super-admin/). The agency app has no /super-admin
 * pages any more: old links land on the dashboard and the sidebar has no Super Admin entry.
 * Support sessions started from that console show a persistent banner in the agency app.
 */

test.describe('Super Admin pages are gone from the agency app', () => {
  test('/super-admin redirects to the dashboard', async ({ page }) => {
    await page.goto('/super-admin');
    await waitForLoad(page);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('a deep /super-admin link redirects to the dashboard too', async ({ page }) => {
    await page.goto('/super-admin/tenants');
    await waitForLoad(page);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('the sidebar has no Super Admin entry', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.locator('aside a[href^="/super-admin"]')).toHaveCount(0);
    await expect(page.getByText('Super Admin', { exact: true })).toHaveCount(0);
  });
});

test.describe('Support session banner', () => {
  test.use({ storageState: undefined });

  function supportToken(expiresInSeconds: number): string {
    const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `${enc({ alg: 'HS256' })}.${enc({ userId: 'u1', tenantId: 't1', role: 'admin', imp: 'sa1', impName: 'Asha Rao', sid: 's1', exp })}.sig`;
  }

  test('shows who is supporting, when it ends, and End session signs out', async ({ page }) => {
    // The backend verifies tokens; this spec only checks the app's reaction to the claims, so API answers are stubbed.
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/users/me')) {
        await route.fulfill({
          json: { success: true, data: { id: 'u1', email: 'admin@demo.com', name: 'Demo Admin', role: 'admin' } },
        });
        return;
      }
      await route.fulfill({ json: { success: true, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0, hasMore: false } } });
    });

    await page.goto(`/support-session#token=${supportToken(30 * 60)}&tenant=Demo%20Agency`);
    await page.waitForURL(/\/dashboard$/, { timeout: 20_000 });

    const banner = page.getByTestId('support-session-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Support session by Asha Rao - ends');

    await banner.getByRole('button', { name: 'End session' }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });
  });

  test('an expired link is refused', async ({ page }) => {
    await page.goto(`/support-session#token=${supportToken(-60)}&tenant=Demo`);
    await expect(page.getByRole('alert')).toContainText('already ended');
  });

  test('a normal session has no banner', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('support-session-banner')).toHaveCount(0);
  });
});
