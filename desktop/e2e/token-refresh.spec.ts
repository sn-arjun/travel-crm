import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { loginViaUI, waitForLoad } from './helpers/auth';

// This spec logs in itself and then tampers with the persisted session.
test.use({ storageState: undefined });

const AUTH_KEY = 'travelcrm-auth';

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** A structurally valid JWT whose `exp` is in the past (the API will answer 401). */
function expiredJwt(): string {
  const exp = Math.floor(Date.now() / 1000) - 3600;
  return `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url({ sub: 'expired-user', exp })}.expired-signature`;
}

/** Keep the refresh token but replace the access token with an expired one. */
async function expireAccessToken(page: Page): Promise<void> {
  const expired = expiredJwt();
  const ok = await page.evaluate(
    ([key, token]) => {
      const raw = localStorage.getItem(key as string);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!parsed.state?.refreshToken) return false;
      parsed.state.accessToken = token;
      localStorage.setItem(key as string, JSON.stringify(parsed));
      return true;
    },
    [AUTH_KEY, expired],
  );
  expect(ok, 'expected a persisted session with a refresh token').toBe(true);
}

function countRefreshCalls(context: BrowserContext): { count: () => number } {
  let calls = 0;
  context.on('request', (req) => {
    if (req.url().includes('/auth/refresh-token')) calls++;
  });
  return { count: () => calls };
}

test.describe('Token refresh - single flight', () => {
  test('an expired access token is refreshed exactly once and the session survives a reload', async ({ page, context }) => {
    await loginViaUI(page);
    await expireAccessToken(page);

    const refreshes = countRefreshCalls(context);

    await page.goto('/dashboard');
    await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 20_000 });
    await waitForLoad(page);
    // Give the proactive timer and any late retries a moment to settle
    await page.waitForTimeout(1_500);

    expect(refreshes.count()).toBe(1);
    expect(page.url()).not.toContain('/login');
    await expect(page.locator('text=Dashboard').first()).toBeVisible();

    // The rotated tokens are persisted and the access token is no longer the expired one
    const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{}').state, AUTH_KEY);
    expect(persisted.refreshToken).toBeTruthy();
    expect(persisted.accessToken).not.toContain('expired-signature');
  });

  test('two windows loading in parallel with an expired token share one refresh and neither is logged out', async ({ page, context }) => {
    await loginViaUI(page);
    await expireAccessToken(page);

    const second = await context.newPage();
    const refreshes = countRefreshCalls(context);

    await Promise.all([page.goto('/contacts'), second.goto('/leads')]);

    await expect(page.locator('text=Contacts').first()).toBeVisible({ timeout: 20_000 });
    await expect(second.locator('text=Leads').first()).toBeVisible({ timeout: 20_000 });
    await waitForLoad(page);
    await waitForLoad(second);
    await page.waitForTimeout(1_500);

    expect(refreshes.count()).toBeLessThanOrEqual(1);
    expect(page.url()).not.toContain('/login');
    expect(second.url()).not.toContain('/login');
  });
});
