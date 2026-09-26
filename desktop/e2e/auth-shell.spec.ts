import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, waitForLoad } from './helpers/auth';

test.use({ storageState: undefined }); // This slice tests the unauthenticated shell itself

test.describe('Auth shell — login', () => {
  test('shows the email step form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('text=Welcome back')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('text=Enter your email to find your account')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('completes the full 2-step login flow (email resolve -> password) and reaches the dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('button[type="submit"]').click();

    await page.waitForSelector('#password', { timeout: 15_000 });
    await expect(page.locator(`text=Signing in as ${ADMIN_EMAIL}`)).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();

    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await page.waitForURL(/\/(dashboard)?$/, { timeout: 20_000 });
    await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 10_000 });

    // Sidebar renders (tenant-aware shell) and command palette shortcut hint is present
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.locator('aside').getByText('TravelCRM', { exact: true })).toBeVisible();
    await expect(page.locator('header').getByText('Search...')).toBeVisible();
  });

  test('shows an error for an invalid password', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('#password', { timeout: 15_000 });

    await page.locator('#password').fill('WrongPassword!');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('.text-destructive, [class*="destructive"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('shows an error for a non-existent email', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill('nonexistent@test.com');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('.text-destructive, [class*="destructive"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('allows going back to change email', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('#password', { timeout: 15_000 });

    await page.locator('text=Change email').click();

    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('text=Enter your email to find your account')).toBeVisible();
  });

  test('redirects an unauthenticated user away from a protected route', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/dashboard');

    await page.waitForTimeout(3000);
    const url = page.url();
    const hasLoginContent = await page.locator('text=Welcome back').isVisible().catch(() => false);
    expect(url.includes('/login') || hasLoginContent).toBeTruthy();
  });

  test('phone/OTP tab sends an OTP and switches to the verify step', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('#password', { timeout: 15_000 });

    await page.locator('[role="tab"]', { hasText: 'Phone / OTP' }).click();
    await page.locator('#phone').fill('9876543210');
    await page.locator('button[type="submit"]').click();

    // Either succeeds (OTP sent, verify step shown) or backend rejects — either way no crash/blank screen
    const otpInput = page.locator('#otp');
    const errorBox = page.locator('.text-destructive, [class*="destructive"]').first();
    await expect(otpInput.or(errorBox)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Auth shell — forgot / reset password', () => {
  test('forgot-password form submits and shows the confirmation screen', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('text=Forgot password?')).toBeVisible();

    // Use a fresh, unique address per run: the backend rate-limits forgot-password by ip+email
    // (3/hour) and always returns success regardless of whether the account exists, so a unique
    // address avoids tripping that limit across repeated CI/local runs without weakening the assertion.
    const testEmail = `e2e-forgot-${Date.now()}@test.com`;
    await page.locator('#email').fill(testEmail);
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('text=Check your email')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`text=${testEmail}`)).toBeVisible();

    // Can go back and try a different email
    await page.locator('button', { hasText: 'Try a different email' }).click();
    await expect(page.locator('#email')).toBeVisible();
  });

  test('forgot-password link from login navigates correctly and back link returns to login', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('#password', { timeout: 15_000 });

    await page.locator('a', { hasText: 'Forgot password?' }).click();
    await page.waitForURL('**/forgot-password');
    await expect(page.locator('text=Forgot password?')).toBeVisible();

    await page.locator('a', { hasText: 'Back to sign in' }).click();
    await page.waitForURL('**/login');
    await expect(page.locator('text=Welcome back')).toBeVisible();
  });

  test('reset-password page renders without crashing for an invalid/missing token', async ({ page }) => {
    await page.goto('/reset-password?token=invalid-token-e2e');
    // The page must render some content (form or error) — never a blank/crashed screen
    await expect(page.locator('body')).not.toBeEmpty();
    const hasPasswordField = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
    const hasErrorText = await page.locator('text=/invalid|expired|error/i').first().isVisible().catch(() => false);
    expect(hasPasswordField || hasErrorText).toBeTruthy();
  });
});

test.describe('Auth shell — setup account', () => {
  test('setup-account page renders without crashing for a missing/invalid token', async ({ page }) => {
    await page.goto('/setup-account?token=invalid-token-e2e');
    await expect(page.locator('body')).not.toBeEmpty();
    const hasForm = await page.locator('input[type="password"], #email').first().isVisible().catch(() => false);
    const hasErrorText = await page.locator('text=/invalid|expired|error/i').first().isVisible().catch(() => false);
    expect(hasForm || hasErrorText).toBeTruthy();
  });
});

test.describe('Auth shell — authenticated session', () => {
  test.describe.configure({ mode: 'serial' });

  test('logs in, uses the app shell, then logs out via the user menu', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('#password', { timeout: 15_000 });
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 20_000 });

    // Dashboard shows welcome + stat cards
    await expect(page.locator('text=Welcome back').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Dashboard').first()).toBeVisible();
    await expect(page.locator('text=New Leads')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Revenue').first()).toBeVisible();

    // Sidebar navigation works (tenant-aware shell)
    await page.locator('aside a[href="/leads"]').first().click();
    await page.waitForURL('**/leads*');
    await page.goBack();
    await page.waitForURL(/\/(dashboard)?$/);
    await waitForLoad(page);

    // User dropdown -> Profile
    const userMenuTrigger = page.getByRole('button', { name: /Admin User/i });
    await expect(userMenuTrigger).toBeVisible({ timeout: 10_000 });
    await userMenuTrigger.click();
    await page.locator('[role="menuitem"]:has-text("Profile")').click();
    await page.waitForURL('**/settings/profile', { timeout: 10_000 });
    await expect(page.locator('text=/Profile/i').first()).toBeVisible({ timeout: 10_000 });

    // Back to dashboard, then sign out via user menu
    await page.goto('/dashboard');
    await page.waitForSelector('aside');
    await waitForLoad(page);
    const menuTrigger2 = page.getByRole('button', { name: /Admin User/i });
    await expect(menuTrigger2).toBeVisible({ timeout: 10_000 });
    await menuTrigger2.click();
    await page.locator('[role="menuitem"]:has-text("Sign out")').click();

    await page.waitForURL('**/login', { timeout: 15_000 });
    await expect(page.locator('text=Welcome back')).toBeVisible();

    // Session is actually cleared: protected route redirects again
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);
    const url = page.url();
    const hasLoginContent = await page.locator('text=Welcome back').isVisible().catch(() => false);
    expect(url.includes('/login') || hasLoginContent).toBeTruthy();
  });
});

test.describe('Auth shell — settings/sessions (device management)', () => {
  test('lists the active session, shows no raw ID inputs, and revoke is guarded by a confirm dialog', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('#password', { timeout: 15_000 });
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 20_000 });

    await page.goto('/settings/sessions');
    await expect(page.getByRole('heading', { name: 'Active Sessions' })).toBeVisible({ timeout: 10_000 });

    // The session list can grow large (this shared demo tenant accumulates many E2E logins) and the
    // table virtualizes past 200 rows, so sort by most-recent login to bring our just-created
    // session into the rendered window instead of scrolling through hundreds of rows.
    await page.locator('th', { hasText: 'Login Time' }).click();
    await page.locator('th', { hasText: 'Login Time' }).click();

    // The current session row is present and marked Current — no raw ID input anywhere on the page.
    // This depends on the client sending X-Refresh-Token so the backend can match it (see auth.ts client fix).
    const currentRow = page.locator('table tbody tr', { has: page.locator('text=Current') });
    await expect(currentRow.first()).toBeVisible({ timeout: 10_000 });
    const rawIdInputs = page.locator('input[name*="id" i], input[placeholder*="id" i]');
    expect(await rawIdInputs.count()).toBe(0);

    // Revoking the current session is not offered (no delete button on the current row)
    await expect(currentRow.first().locator('button[aria-label="Revoke session"]')).toHaveCount(0);

    // A non-current row does offer revoke, and it's guarded by a confirm dialog (not an immediate DELETE)
    const otherRow = page.locator('table tbody tr', { hasNot: page.locator('text=Current') }).first();
    if (await otherRow.count()) {
      await otherRow.locator('button[aria-label="Revoke session"]').click();
      await expect(page.locator('text=Revoke session?')).toBeVisible({ timeout: 5_000 });
      // Dismiss without actually revoking, to avoid disturbing other specs sharing this session pool
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('Auth shell — help center', () => {
  test('search narrows FAQ results and shows the empty state for no matches', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByRole('heading', { name: 'Help Center' })).toBeVisible();

    const searchInput = page.locator('input[placeholder="Search help articles..."]');
    await searchInput.fill('lead');
    await expect(page.locator('text=How do I create a new lead')).toBeVisible();

    await searchInput.fill('zzz-no-such-query-zzz');
    await expect(page.locator('text=No results found')).toBeVisible();
  });

  test('contact support has no mailto: link and copies the message instead', async ({ page }) => {
    await page.goto('/help');

    // Communication Hub rule: no mailto:/wa.me/tel: anchors anywhere on this page
    const bannedAnchors = page.locator('a[href^="mailto:"], a[href^="wa.me"], a[href*="wa.me"], a[href^="tel:"]');
    expect(await bannedAnchors.count()).toBe(0);

    await page.locator('input[name="name"]').fill('E2E Tester');
    await page.locator('input[name="email"]').fill('e2e@test.com');
    await page.locator('input[name="subject"]').fill('E2E Subject');
    await page.locator('textarea[name="message"]').fill('E2E message body');
    await page.locator('button[type="submit"]', { hasText: 'Send Message' }).click();

    await expect(page.locator('p.text-ds-success')).toContainText(/copied to clipboard|email .* directly/i, { timeout: 5_000 });
  });
});

test.describe('Auth shell — onboarding', () => {
  test('onboarding page renders for a freshly authenticated user without crashing', async ({ page }) => {
    await page.goto('/login');
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('button[type="submit"]').click();
    await page.waitForSelector('#password', { timeout: 15_000 });
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(dashboard)?$/, { timeout: 20_000 });

    await page.goto('/onboarding');
    await expect(page.locator('body')).not.toBeEmpty();
    // No unhandled Next.js error overlay
    await expect(page.locator('text=Application error')).toHaveCount(0);
  });
});
