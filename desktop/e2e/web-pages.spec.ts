import { test, expect } from './fixtures';
import { API_URL, TENANT_ID } from './helpers/auth';
import { api, seedContact, seedItinerary, seedLead } from './helpers/api-seed';

/**
 * R125: every page an email links to opens on the agency web app without a signed-in session, and the website
 * build hides the Electron-only features. Run against the Electron build's web server or, with the web target
 * (`TRAVELCRM_TARGET=web`), against the website build: set E2E_EXPECT_WEB_TARGET=1 for the extra website checks.
 *
 *   welcome mail  -> /download, /quick-start
 *   invite mail   -> /setup-account?token=...
 *   reset mail    -> /reset-password?token=...
 *   quote mail    -> /q/<token>   (public, no login)
 */

test.use({ storageState: undefined }); // every visitor here is signed out

const RUN = Date.now();
const INVITEE_EMAIL = `r125-${RUN}@invite.test`;
const FIRST_PASSWORD = `First${RUN}pw!`;
const RESET_PASSWORD = `Reset${RUN}pw!`;

async function mailTo(email: string, template: string): Promise<{ text: string; html: string }> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${API_URL}/test/outbox?to=${encodeURIComponent(email)}`);
    const mails = ((await res.json()) as { data: Array<{ template: string; text: string; html: string }> }).data;
    const m = mails.find((x) => x.template === template);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`no ${template} mail for ${email} in the outbox`);
}

/** The path and query of the link an email carries, e.g. /reset-password?token=abc (the host is the API's APP_URL). */
function linkPath(mail: { text: string; html: string }, page: string): string {
  const m = new RegExp(`https?://[^\\s"<>]+(/${page}\\?token=[A-Za-z0-9_-]+)`).exec(`${mail.text}\n${mail.html}`);
  if (!m) throw new Error(`no /${page} link in the mail:\n${mail.text}`);
  return m[1]!;
}

async function loginStatus(email: string, password: string): Promise<number> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenantId: TENANT_ID }),
  });
  return res.status;
}

test.describe('shared quotation link (/q/<token>)', () => {
  let token = '';
  let itineraryId = '';
  const title = `R125 Quote ${RUN}`;

  test('opens without signing in and shows the quotation, never the cost price', async ({ page }) => {
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const itin = await seedItinerary(lead.id, {
      title,
      days: [
        {
          dayNumber: 1,
          title: 'Arrival in Bali',
          items: [{ type: 'hotel', title: 'Sea View Resort', costPrice: 4321, sellingPrice: 7000, quantity: 1, sortOrder: 0 }],
        },
      ],
    });
    itineraryId = itin.id;
    const share = await api('POST', `/itineraries/${itineraryId}/share-link`);
    const shareUrl: string = share.data?.shareUrl ?? share.data?.url ?? JSON.stringify(share);
    token = /\/q\/([A-Za-z0-9_-]+)/.exec(shareUrl)?.[1] ?? '';
    expect(token, `share link response: ${JSON.stringify(share)}`).not.toBe('');

    await page.goto(`/q/${token}`);
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Day 1: Arrival in Bali')).toBeVisible();
    await expect(page.getByText('Sea View Resort')).toBeVisible();
    await expect(page.getByTestId('quote-total')).toContainText('7,000');
    expect(new URL(page.url()).pathname).toBe(`/q/${token}`); // not bounced to /login
    expect(await page.locator('body').innerText()).not.toContain('4,321'); // cost price stays internal
  });

  test('a revoked link and an unknown link say so', async ({ page }) => {
    test.skip(!token, 'needs the quotation from the previous test');
    const res = await api('DELETE', `/itineraries/${itineraryId}/share-link`);
    expect(res.success ?? true).toBeTruthy();
    await page.goto(`/q/${token}`);
    await expect(page.getByTestId('quote-unavailable')).toContainText('revoked', { timeout: 20_000 });

    await page.goto('/q/this-token-does-not-exist');
    await expect(page.getByTestId('quote-unavailable')).toContainText('not found', { timeout: 20_000 });
  });
});

test.describe('welcome mail pages', () => {
  test('/download opens without signing in and offers the browser, the installer and the driver app', async ({ page }) => {
    await page.goto('/download');
    await expect(page.getByRole('heading', { name: 'Get TravelCRM Pro' })).toBeVisible();
    await expect(page.getByTestId('download-web').getByRole('link', { name: 'Open TravelCRM Pro' })).toHaveAttribute('href', '/login');
    // Each download is either a configured link or an honest "not published yet" note, never a dead button.
    for (const id of ['download-windows', 'download-driver']) {
      const card = page.getByTestId(id);
      await expect(card).toBeVisible();
      const hasLink = (await card.getByRole('link').count()) > 0;
      const pending = (await card.getByTestId(`${id}-pending`).count()) > 0;
      expect(hasLink !== pending, `${id} shows exactly one of a link or the pending note`).toBe(true);
    }
    expect(new URL(page.url()).pathname).toBe('/download');
  });

  test('/quick-start opens without signing in', async ({ page }) => {
    await page.goto('/quick-start');
    await expect(page.getByRole('heading', { name: 'Quick start' })).toBeVisible();
    await expect(page.getByTestId('quick-start-steps').getByRole('listitem')).toHaveCount(6);
    expect(new URL(page.url()).pathname).toBe('/quick-start');
  });
});

test.describe.serial('invite and reset mail pages', () => {
  test('the link in an invitation opens /setup-account and creates the account', async ({ page }) => {
    const invite = await api('POST', '/users', { email: INVITEE_EMAIL, name: 'Invited Person', role: 'view_only' });
    expect(invite.success ?? !!invite.data, JSON.stringify(invite)).toBeTruthy();
    const path = linkPath(await mailTo(INVITEE_EMAIL, 'invite_user'), 'setup-account');

    await page.goto(path);
    await expect(page.locator('#password')).toBeVisible({ timeout: 20_000 });
    expect(new URL(page.url()).pathname).toBe('/setup-account');
    await page.locator('#name').fill('Invited Person');
    await page.locator('#password').fill(FIRST_PASSWORD);
    await page.locator('#confirmPassword').fill(FIRST_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText('Welcome aboard!')).toBeVisible({ timeout: 20_000 });
    expect(await loginStatus(INVITEE_EMAIL, FIRST_PASSWORD)).toBe(200);
  });

  test('the link in a password reset mail opens /reset-password and sets the new password', async ({ page }) => {
    const forgot = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: INVITEE_EMAIL }),
    });
    expect(forgot.status).toBe(200);
    const path = linkPath(await mailTo(INVITEE_EMAIL, 'reset_password'), 'reset-password');

    await page.goto(path);
    await expect(page.locator('#password')).toBeVisible({ timeout: 20_000 });
    expect(new URL(page.url()).pathname).toBe('/reset-password');
    await page.locator('#password').fill(RESET_PASSWORD);
    await page.locator('#confirmPassword').fill(RESET_PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page.getByText('Password reset!')).toBeVisible({ timeout: 20_000 });
    expect(await loginStatus(INVITEE_EMAIL, RESET_PASSWORD)).toBe(200);
    expect(await loginStatus(INVITEE_EMAIL, FIRST_PASSWORD)).not.toBe(200);
  });
});

test.describe('Electron-only features on the website', () => {
  test('the sign-in page has no server-address field and no update toast', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Welcome back')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Advanced' })).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { electronAPI?: unknown }).electronAPI)).toBeUndefined();
    await expect(page.getByText('Restart to update')).toHaveCount(0);
  });

  test('the website build takes its API address from the runtime variables', async ({ page, request }) => {
    test.skip(!process.env.E2E_EXPECT_WEB_TARGET, 'only meaningful against the website build (TRAVELCRM_TARGET=web)');
    const js = await request.get('/runtime-config.js');
    expect(js.status()).toBe(200);
    expect(await js.text()).toContain(`"apiUrl":"${API_URL}"`);
    await page.goto('/login');
    expect(await page.evaluate(() => (window as unknown as { travelcrmConfig?: { apiUrl?: string } }).travelcrmConfig?.apiUrl)).toBe(API_URL);
  });
});
