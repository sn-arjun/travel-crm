import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { API_URL } from './helpers/auth';

/**
 * First login of a brand-new agency (R113), in the multi-tenant stack: the provisioned admin signs in with the
 * temporary password from the welcome email, is held on /change-password (the API also refuses every data request),
 * then walks the onboarding wizard (company, regional, logo) and reaches a dashboard that shows the company name.
 */

test.use({ storageState: undefined }); // a brand-new, logged-out visitor

const RUN = Date.now();
const SLUG = `r113-${RUN}`;
const OWNER_EMAIL = `owner-${RUN}@r113.test`;
const COMPANY = `Skyline Voyages ${RUN}`;
const NEW_PASSWORD = `Chosen${RUN}pw`;
const PREFIX = 'TRV';

// 1x1 transparent PNG
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

interface Agency {
  tenantId: string;
  email: string;
  temporaryPassword: string;
}

/**
 * The one place that knows how a test gets a super admin: a TEST_MODE route that registers a platform super admin
 * and returns its token. Adapt here if super admin authentication changes. The temporary password is read from the
 * welcome email in the local outbox, exactly as an agency owner would receive it.
 */
async function createAgencyThroughAdminApi(): Promise<Agency> {
  const sa = await fetch(`${API_URL}/test/super-admin`, { method: 'POST' });
  if (!sa.ok) throw new Error(`test super admin failed: ${sa.status}`);
  const token = ((await sa.json()) as { data: { accessToken: string } }).data.accessToken;

  const res = await fetch(`${API_URL}/admin/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      companyName: 'Provisioned Agency',
      slug: SLUG,
      ownerName: 'Riya Owner',
      ownerEmail: OWNER_EMAIL,
      plan: 'pro',
      country: 'India',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      taxSystem: 'gst',
      region: 'in',
    }),
  });
  if (res.status !== 201) throw new Error(`provisioning failed: ${res.status} ${await res.text()}`);
  const created = ((await res.json()) as { data: { tenantId: string } }).data;

  const box = await fetch(`${API_URL}/test/outbox?to=${encodeURIComponent(OWNER_EMAIL)}`);
  const mails = ((await box.json()) as { data: Array<{ template: string; text: string }> }).data;
  const welcome = mails.find((m) => m.template === 'welcome_admin');
  const temporaryPassword = welcome?.text.match(/Temporary password:\s*(\S+)/i)?.[1];
  if (!temporaryPassword) throw new Error('welcome email with a temporary password not found in the outbox');
  return { tenantId: created.tenantId, email: OWNER_EMAIL, temporaryPassword };
}

async function apiLogin(agency: Agency, password: string) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: agency.email, password, tenantId: agency.tenantId }),
  });
  return { status: res.status, body: (await res.json()) as any };
}

/** The login form is server-rendered, so a click before hydration is lost: refill and resubmit. */
async function submitEmailStep(page: Page, email: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator('#email').fill(email);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForSelector('#password', { timeout: 5_000 });
      return;
    } catch {
      /* not hydrated yet */
    }
  }
  await page.waitForSelector('#password', { timeout: 15_000 });
}

test.describe('First login: forced password change and onboarding', () => {
  test.describe.configure({ mode: 'serial' });
  let agency: Agency;

  test.beforeAll(async () => {
    agency = await createAgencyThroughAdminApi();
  });

  test('the API refuses data to a temporary-password session', async () => {
    const { status, body } = await apiLogin(agency, agency.temporaryPassword);
    expect(status).toBe(200);
    expect(body.data.mustChangePassword).toBe(true);
    const leads = await fetch(`${API_URL}/leads`, { headers: { Authorization: `Bearer ${body.data.accessToken}` } });
    expect(leads.status).toBe(403);
    expect(((await leads.json()) as any).error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  test('temporary password -> /change-password -> /onboarding -> dashboard with the company name', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.waitForSelector('text=Welcome back');
    await submitEmailStep(page, agency.email);
    await page.locator('#password').fill(agency.temporaryPassword);
    await page.locator('button[type="submit"]').click();

    // Held on the change-password screen
    await page.waitForURL('**/change-password', { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Choose your password' })).toBeVisible();

    // The app shell is not reachable meanwhile
    await page.goto('/leads');
    await page.waitForURL('**/change-password', { timeout: 15_000 });

    // A weak password is refused before it leaves the form
    await page.locator('#currentPassword').fill(agency.temporaryPassword);
    await page.locator('#newPassword').fill('short1');
    await page.locator('#confirmPassword').fill('short1');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.locator('form [role="alert"]')).toContainText('at least 12');

    // A wrong temporary password is refused by the API
    await page.locator('#currentPassword').fill('not-the-temporary-1');
    await page.locator('#newPassword').fill(NEW_PASSWORD);
    await page.locator('#confirmPassword').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.locator('form [role="alert"]')).toContainText(/incorrect/i);

    // The right one goes through and lands on the wizard
    await page.locator('#currentPassword').fill(agency.temporaryPassword);
    await page.getByRole('button', { name: 'Change password' }).click();
    await page.waitForURL('**/onboarding', { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Welcome to TravelCRM Pro' })).toBeVisible();

    // Step 1: company (prefilled from provisioning)
    await expect(page.locator('#company_name')).toHaveValue('Provisioned Agency');
    await expect(page.locator('#company_email')).toHaveValue(OWNER_EMAIL);
    await page.locator('#company_name').fill(COMPANY);
    await page.locator('#company_city').fill('Mumbai');
    await page.getByRole('button', { name: /^Next/ }).click();

    // Step 2: regional + invoice prefix
    await expect(page.getByText('Tax system')).toBeVisible();
    await page.locator('#invoice_prefix').fill(PREFIX);
    await page.getByRole('button', { name: /^Next/ }).click();

    // Step 3: logo
    await expect(page.getByText('Upload your company logo (optional)')).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await expect(page.getByAltText('Logo preview')).toBeVisible();
    await page.getByRole('button', { name: /Finish Setup/ }).click();

    // Done
    await expect(page.getByRole('heading', { name: "You're all set!" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /Go to Dashboard/ }).click();
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await expect(page.getByText(COMPANY).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('finish-setup-banner')).toHaveCount(0);
  });

  test('everything the wizard collected was saved for the agency', async () => {
    // The temporary password is dead, the chosen one works and carries no restriction.
    expect((await apiLogin(agency, agency.temporaryPassword)).status).toBe(401);
    const { status, body } = await apiLogin(agency, NEW_PASSWORD);
    expect(status).toBe(200);
    expect(body.data.mustChangePassword).toBe(false);
    const headers = { Authorization: `Bearer ${body.data.accessToken}` };

    const company = (await (await fetch(`${API_URL}/settings/company`, { headers })).json()) as any;
    expect(company.data.company_name).toBe(COMPANY);
    expect(company.data.company_city).toBe('Mumbai');
    expect(company.data.onboarding_completed).toBe('true');
    expect(company.data.company_logo).toMatch(/^\/files\/.+logo\.png$/);

    const numbering = (await (await fetch(`${API_URL}/settings/numbering`, { headers })).json()) as any;
    expect(numbering.data.invoice_prefix).toBe(PREFIX);

    const mails = (await (await fetch(`${API_URL}/test/outbox?to=${encodeURIComponent(OWNER_EMAIL)}`)).json()) as any;
    expect(mails.data.some((m: { template: string }) => m.template === 'password_changed')).toBe(true);
  });
});
