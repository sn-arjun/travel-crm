import { createHmac } from 'node:crypto';

import { type Page } from '@playwright/test';

import { test, expect } from './fixtures';
import { ADMIN_EMAIL, ADMIN_PASSWORD, API_URL, TENANT_ID, getAuthToken } from './helpers/auth';

/**
 * Two-factor sign-in (R209), end to end through the real screens and API:
 * enrol with a QR code and a code computed here from the shown secret, sign out, sign in with a code, recover with a
 * recovery code (works once), turn it off again. The seeded admin is never touched: a fresh user is invited for the run.
 */

test.use({ storageState: undefined }); // a logged-out visitor

const RUN = Date.now();
const EMAIL = `tf-${RUN}@r209.test`;
const PASSWORD = `Harbor${RUN}-Lights!`;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 6238 (HMAC-SHA1, 30 s, 6 digits) from a base32 secret, for a moment `offsetSteps` steps from now. */
function totp(secret: string, offsetSteps = 0): string {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of secret.toUpperCase().replace(/=+$/, '')) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const counter = Math.floor(Date.now() / 1000 / 30) + offsetSteps;
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const mac = createHmac('sha1', Buffer.from(bytes)).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 1_000_000).padStart(6, '0');
}

/** Invite a salesperson with the seeded admin's token and accept the invitation, so the run owns its account. */
async function createUser(): Promise<void> {
  const adminToken = await getAuthToken();
  const invite = await fetch(`${API_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ email: EMAIL, name: 'Two Factor Tester', role: 'salesperson' }),
  });
  if (invite.status !== 201) throw new Error(`invite failed: ${invite.status} ${await invite.text()}`);
  const inviteToken = ((await invite.json()) as { data: { inviteToken: string } }).data.inviteToken;
  const setup = await fetch(`${API_URL}/auth/setup-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: inviteToken, name: 'Two Factor Tester', password: PASSWORD }),
  });
  if (setup.status !== 201) throw new Error(`setup-account failed: ${setup.status} ${await setup.text()}`);
}

/** Email and password steps. The login form is server-rendered, so a click before hydration is lost: refill and resubmit. */
async function submitCredentials(page: Page) {
  await page.goto('/login');
  await page.waitForSelector('text=Welcome back');
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator('#email').fill(EMAIL);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForSelector('#password', { timeout: 5_000 });
      break;
    } catch {
      /* not hydrated yet */
    }
  }
  await page.locator('#password').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
}

async function signOut(page: Page) {
  await page.goto('/dashboard');
  await page.waitForSelector('aside');
  await page.getByTestId('sidebar-user-menu').click();
  await page.locator('[role="menuitem"]:has-text("Sign out")').click();
  await page.waitForURL('**/login', { timeout: 15_000 });
}

test.describe('Two-factor sign-in', () => {
  test.describe.configure({ mode: 'serial' });
  let secret = '';
  let recoveryCodes: string[] = [];

  test.beforeAll(async () => {
    await createUser();
  });

  test('a user without 2FA signs in with the password alone, and so does the seeded admin', async ({ page }) => {
    const seeded = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, tenantId: TENANT_ID }),
    });
    const seededBody = (await seeded.json()) as { data: { accessToken?: string; requires2fa?: boolean } };
    expect(seededBody.data.accessToken).toBeTruthy();
    expect(seededBody.data.requires2fa).toBeUndefined();

    await submitCredentials(page);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  });

  test('enrol: QR code and key, a code from the key, recovery codes', async ({ page }) => {
    await submitCredentials(page);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    await page.goto('/settings/security');
    await expect(page.getByTestId('two-factor-card')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('two-factor-start').click();
    await page.locator('#two-factor-password').fill('not-my-password-1');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('two-factor-card').locator('[role="alert"]')).toContainText(/incorrect/i);
    await expect(page.getByTestId('two-factor-secret')).toHaveCount(0);

    await page.locator('#two-factor-password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByTestId('qr-code')).toBeVisible();
    secret = ((await page.getByTestId('two-factor-secret').textContent()) ?? '').trim();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);

    // A wrong code does not turn it on.
    await page.locator('#two-factor-code').fill('000000');
    await page.getByTestId('two-factor-confirm').click();
    await expect(page.getByTestId('two-factor-card').locator('[role="alert"]')).toContainText(/not right/i);

    await page.locator('#two-factor-code').fill(totp(secret));
    await page.getByTestId('two-factor-confirm').click();

    const list = page.getByTestId('two-factor-recovery-codes');
    await expect(list).toBeVisible({ timeout: 15_000 });
    recoveryCodes = ((await list.locator('li').allTextContents()) ?? []).map((t) => t.trim());
    expect(recoveryCodes).toHaveLength(10);
    await expect(page.getByTestId('two-factor-done')).toBeDisabled();
    await page.getByTestId('two-factor-saved').check();
    await page.getByTestId('two-factor-done').click();
    await expect(page.getByText('On', { exact: true })).toBeVisible();
    await expect(page.getByTestId('two-factor-card')).toContainText('10 recovery codes are left');
  });

  test('sign in needs the code: the password alone gives no session', async ({ page }) => {
    // The API gives a challenge and no tokens.
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, tenantId: TENANT_ID }),
    });
    const body = (await res.json()) as { data: { requires2fa?: boolean; accessToken?: string; challengeToken?: string } };
    expect(body.data.requires2fa).toBe(true);
    expect(body.data.accessToken).toBeUndefined();

    await submitCredentials(page);
    await expect(page.getByTestId('two-factor-form')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/login/);

    // A wrong code is refused and counted.
    await page.locator('#twoFactorCode').fill('000000');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page.getByText(/not right/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    // The code for the next 30 s step is accepted (the step used to turn 2FA on is spent).
    await page.locator('#twoFactorCode').fill(totp(secret, 1));
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  });

  test('a recovery code signs in once', async ({ page }) => {
    const code = recoveryCodes[0]!;
    await submitCredentials(page);
    await page.getByRole('button', { name: 'Use a recovery code' }).click();
    await page.locator('#twoFactorCode').fill(code);
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await signOut(page);

    await submitCredentials(page);
    await page.getByRole('button', { name: 'Use a recovery code' }).click();
    await page.locator('#twoFactorCode').fill(code);
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page.getByText(/not right/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('turn it off with the password and a recovery code; sign-in is one step again', async ({ page }) => {
    await submitCredentials(page);
    await page.getByRole('button', { name: 'Use a recovery code' }).click();
    await page.locator('#twoFactorCode').fill(recoveryCodes[1]!);
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    await page.goto('/settings/security');
    await expect(page.getByTestId('two-factor-card')).toContainText('8 recovery codes are left', { timeout: 15_000 });
    await page.getByTestId('two-factor-disable-start').click();
    await page.locator('#two-factor-password').fill(PASSWORD);
    await page.locator('#two-factor-code').fill(recoveryCodes[2]!);
    await page.getByRole('button', { name: 'Turn off', exact: true }).last().click();
    await expect(page.getByTestId('two-factor-start')).toBeVisible({ timeout: 15_000 });
    await signOut(page);

    await submitCredentials(page);
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  });
});
