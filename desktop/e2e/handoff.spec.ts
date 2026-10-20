import {
  type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { API_URL } from './helpers/auth';
import {
  type Agency,
  type UserRole,
  acceptInvite,
  apiLogin,
  createAgency,
  createSuperAdminToken,
  inviteTokenFor,
  inviteUser,
  outboxFor,
  request,
  signInViaUI,
  isMultiTenantStack,
  NEEDS_MULTI,
} from './helpers/tenants';

// Separate agency databases are needed: skip the whole file on a single-tenant stack.
test.beforeAll(async () => {
  test.skip(!(await isMultiTenantStack(API_URL)), NEEDS_MULTI);
});

/**
 * Handoff scenario (W5): a platform super admin creates an agency and hands it over to the client, all the way to
 * "the client runs their own business in it". The same scenario runs for THREE agencies on three plans in three
 * countries, on the local multi-tenant stack (`node scripts/fix-stack.mjs up --slot N --reset-db --multi`):
 *
 *   A  Basic       India           INR  GST   Asia/Kolkata
 *   B  Pro         United Kingdom  GBP  VAT   Europe/London
 *   C  Enterprise  UAE             AED  VAT   Asia/Dubai
 *
 * Steps per agency (each one a test, in order):
 *   1  super admin creates the agency; provisioning completes; the welcome email (local outbox) carries the sign-in
 *      address, the temporary password and the download / quick-start links
 *   2  the owner signs in with the temporary password in the browser, is forced to choose a 12+ character password,
 *      walks the onboarding wizard (company, currency and tax, numbering, logo) and lands on the dashboard
 *   3  the agency really starts with its country's currency, locale, time zone, tax system and phone code
 *   4  the owner invites one user per role; each reads the invitation email, sets a password and works within the
 *      role's permissions; the plan's seat limit is enforced
 *   5  channels: a receiving email address and a WhatsApp number can be connected and belong to one agency only;
 *      a website-form key is issued
 *   6  the driver app: the public agency-code lookup, driver sign-in with the test code, a driver token that works
 *   7  a website enquiry becomes a lead in this agency only
 *   8  plan gates (a locked feature answers 403 + upgrade), the operator's override, and calling per country
 *   9  billing: the right currency and gateway (mock), a checkout that completes and issues an invoice
 *  10  the client's own screens (team, leads, upgrade prompt, billing) in the browser
 *  11  super admin suspends the agency (everybody locked out, data intact) and reactivates it
 *
 * Needs the stack with BILLING_GATEWAY=mock (fix-stack does that). To also see calling follow the country rule, bring
 * the stack up with FIX_STACK_CALLING_COUNTRIES=GB,US,AU,SG and export the same value for this run; without it every
 * country is allowed locally and the spec expects exactly that.
 */

test.use({ storageState: undefined });

const RUN = Date.now().toString(36);
const DEMO_TENANT = '01960000-0000-7000-8000-000000000001';
const OTP = '123456'; // the fixed driver login code accepted only under TEST_MODE
const CALLING = (process.env.FIX_STACK_CALLING_COUNTRIES ?? '*').split(',').map((s) => s.trim().toUpperCase());
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

type Key = 'A' | 'B' | 'C';

interface Profile {
  key: Key;
  plan: 'basic' | 'pro' | 'enterprise';
  planName: string;
  country: string;
  iso: string;
  currency: string;
  /** What the browser prints for an amount in this currency. */
  symbol: string;
  timezone: string;
  taxSystem: 'gst' | 'vat';
  region: 'in' | 'uk' | 'gulf';
  locale: string;
  market: string;
  /** Yearly price the operator puts in the catalogue for this market when it is missing (the owner sets the real ones). */
  price: { yearly: number; users: number; extraUser: number };
  /** A mobile number in this country, for the driver. */
  driverPhone: string;
  invoicePrefix: string;
}

const PROFILES: Profile[] = [
  {
    key: 'A', plan: 'basic', planName: 'Basic', country: 'India', iso: 'IN', currency: 'INR', symbol: '₹', timezone: 'Asia/Kolkata',
    taxSystem: 'gst', region: 'in', locale: 'en-IN', market: 'IN', price: { yearly: 12000, users: 5, extraUser: 2400 },
    driverPhone: '+919812345601', invoicePrefix: 'INA',
  },
  {
    key: 'B', plan: 'pro', planName: 'Pro', country: 'United Kingdom', iso: 'GB', currency: 'GBP', symbol: '£', timezone: 'Europe/London',
    taxSystem: 'vat', region: 'uk', locale: 'en-GB', market: 'WEST', price: { yearly: 199, users: 15, extraUser: 20 },
    driverPhone: '+447911123402', invoicePrefix: 'UKB',
  },
  {
    key: 'C', plan: 'enterprise', planName: 'Enterprise', country: 'United Arab Emirates', iso: 'AE', currency: 'AED', symbol: 'AED', timezone: 'Asia/Dubai',
    taxSystem: 'vat', region: 'gulf', locale: 'en-AE', market: 'GULF', price: { yearly: 4800, users: 100, extraUser: 60 },
    driverPhone: '+971501234503', invoicePrefix: 'AEC',
  },
];

/** The five roles an owner invites (the sixth, admin, is the owner). */
const INVITED_ROLES: UserRole[] = ['sales_manager', 'salesperson', 'operations', 'accountant', 'view_only'];

// Shared by the agencies, in file order (workers: 1).
let superToken = '';
const catalogueFeatures: Record<string, string[]> = {};
const claimedEmail: Record<string, string> = {}; // channel address -> key of the agency that connected it
const claimedWhatsApp: Record<string, string> = {}; // phone number id -> key

/** The login form is server-rendered: a click before hydration is lost, so refill and resubmit. */
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

/** A super admin token, minted on first use (a worker restart after a failed test loses module state). */
async function superAdmin(): Promise<string> {
  if (!superToken) superToken = await createSuperAdminToken(API_URL);
  return superToken;
}

async function sa(method: string, path: string, body?: unknown) {
  return request(API_URL, method, path, await superAdmin(), body);
}

/** The feature keys of a plan in the platform catalogue, loaded on first use. */
async function planFeatures(plan: string): Promise<string[]> {
  if (!catalogueFeatures[plan]) {
    const cat = await sa('GET', '/admin/catalogue');
    for (const row of cat.json.data.plans as Array<{ key: string; features: string[] }>) catalogueFeatures[row.key] = row.features;
  }
  return catalogueFeatures[plan] ?? [];
}

// ---------------------------------------------------------------------------------------------------------------
// The platform side: who may use the admin API, the first enquiry, the price list
// ---------------------------------------------------------------------------------------------------------------

test.describe('Handoff 0: the operator side', () => {
  test.describe.configure({ mode: 'serial' });

  test('the admin API is closed to everyone but a platform super admin', async () => {
    expect((await request(API_URL, 'GET', '/admin/tenants', null)).status).toBe(401);
    const wrong = await request(API_URL, 'POST', '/admin/auth/login', null, { email: 'nobody@platform.test', password: 'Not-A-Real-Password-1' });
    expect(wrong.status).toBe(401);
    // A signed-in agency admin (the seeded demo agency) is not a super admin.
    const demo = await request(API_URL, 'POST', '/auth/login', null, {
      email: 'admin@demo.com',
      password: 'Admin@123',
      tenantId: '01960000-0000-7000-8000-000000000001',
    });
    expect(demo.status).toBe(200);
    const asAgencyAdmin = await request(API_URL, 'GET', '/admin/tenants', demo.json.data.accessToken);
    expect([401, 403]).toContain(asAgencyAdmin.status);
  });

  test('the super admin signs in and sees the platform', async () => {
    superToken = '';
    await superAdmin();
    const me = await sa('GET', '/admin/auth/me');
    expect(me.status).toBe(200);
    expect(JSON.stringify(me.json)).toContain('e2e-super@platform.test');
    const list = await sa('GET', '/admin/tenants');
    expect(list.status).toBe(200);
  });

  test('a prospect asks for a demo on the landing page; the operator sees it and marks it converted', async () => {
    const email = `prospect-${RUN}@handoff.test`;
    const ip = `10.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
    const res = await request(
      API_URL,
      'POST',
      '/public/enquiries',
      null,
      { kind: 'demo', name: 'Priya Prospect', email, company: `Prospect Travels ${RUN}`, country: 'India', message: 'Please show us the CRM' },
      { 'cf-connecting-ip': ip },
    );
    expect(res.status).toBe(202);
    const inbox = await sa('GET', '/admin/enquiries?kind=demo&limit=50');
    expect(inbox.status).toBe(200);
    const row = (inbox.json.data?.enquiries ?? inbox.json.data ?? []).find((e: any) => e.email === email);
    expect(row, 'the enquiry reaches the operator').toBeTruthy();
    const patched = await sa('PATCH', `/admin/enquiries/${row.id}`, { status: 'converted' });
    expect(patched.status).toBe(200);
  });

  test('the operator prices the markets the new agencies are in (a missing price blocks online payment there)', async () => {
    const cat = await sa('GET', '/admin/catalogue');
    expect(cat.status).toBe(200);
    for (const plan of cat.json.data.plans as Array<{ key: string; features: string[]; prices: Array<{ market: string; isActive: boolean }> }>) {
      catalogueFeatures[plan.key] = plan.features;
    }
    for (const p of PROFILES) {
      const plan = (cat.json.data.plans as any[]).find((x) => x.key === p.plan);
      if (plan.prices.some((x: any) => x.market === p.market && x.isActive)) continue;
      const made = await sa('POST', '/admin/catalogue/prices', {
        planKey: p.plan,
        market: p.market,
        currency: p.currency,
        yearlyPrice: p.price.yearly,
        includedUsers: p.price.users,
        extraUserYearlyPrice: p.price.extraUser,
      });
      expect(made.status, made.text).toBe(201);
    }
    // The public price list now has the plan in the market's currency.
    const pub = await request(API_URL, 'GET', `/public/plans?market=${PROFILES[1]!.market}`, null);
    expect(pub.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The scenario, once per agency
// ---------------------------------------------------------------------------------------------------------------

for (const p of PROFILES) {
  test.describe(`Handoff ${p.key}: ${p.planName} agency in ${p.country} (${p.currency})`, () => {
    test.describe.configure({ mode: 'serial' });

    const slug = `ho-${p.key.toLowerCase()}-${RUN}`;
    const companyName = `Handoff ${p.planName} ${RUN}`;
    let agency: Agency;
    let sub: { users: Array<{ role: UserRole; email: string; token: string }> } = { users: [] };
    let leadVisitor = '';
    let apiKey = '';

    const owner = () => agency.accessToken!;
    const get = (path: string, token: string = owner()) => request(API_URL, 'GET', path, token);

    test('1. super admin creates the agency; provisioning completes; the welcome email arrives', async () => {
      const res = await request(API_URL, 'POST', '/admin/tenants', await superAdmin(), {
        companyName,
        slug,
        ownerName: `${p.planName} Owner`,
        ownerEmail: `owner-${slug}@handoff.test`,
        plan: p.plan,
        country: p.country,
        currency: p.currency,
        timezone: p.timezone,
        taxSystem: p.taxSystem,
        region: p.region,
      });
      expect(res.status, res.text).toBe(201);
      const data = res.json.data;
      expect(data.provisioningStatus).toBe('active');
      expect(data.welcomeEmailSent).toBe(true);
      expect(data.temporaryPassword).toHaveLength(16);

      // Provisioning is finished and visible to the operator.
      const prov = await sa('GET', `/admin/tenants/${data.tenantId}/provisioning`);
      expect(prov.json.data).toMatchObject({ tenantStatus: 'active', provisioningStatus: 'active', slug });
      const list = await sa('GET', `/admin/tenants?search=${slug}`);
      expect(JSON.stringify(list.json)).toContain(slug);

      // A second agency cannot take the same slug.
      const dup = await request(API_URL, 'POST', '/admin/tenants', await superAdmin(), {
        companyName: 'Copycat', slug, ownerName: 'X', ownerEmail: `other-${slug}@handoff.test`, plan: 'basic', country: p.country,
      });
      expect(dup.status).toBe(409);

      // The welcome email: the owner's sign-in details and the two links every client needs.
      const email = `owner-${slug}@handoff.test`;
      const mails = (await outboxFor(API_URL, email)).filter((m) => m.template === 'welcome_admin');
      expect(mails).toHaveLength(1);
      const mail = mails[0]!;
      expect(mail.subject).toContain(companyName);
      expect(mail.text).toContain(`Email: ${email}`);
      expect(mail.text).toContain(`Temporary password: ${data.temporaryPassword}`);
      expect(mail.text).toMatch(/Sign in: https?:\/\/\S+/);
      expect(mail.text).toMatch(/\/download/);
      expect(mail.text).toMatch(/\/quick-start/);
      expect(mail.text).toContain('choose a new password');

      agency = { slug, plan: p.plan, companyName, tenantId: data.tenantId, email, temporaryPassword: data.temporaryPassword };

      // The subscription was opened in the agency's own market and currency (not the India price).
      const subscription = await sa('GET', `/admin/subscriptions?tenantId=${data.tenantId}`);
      expect(subscription.status).toBe(200);
      expect(JSON.stringify(subscription.json)).toContain(p.currency);
    });

    test('2. the owner signs in with the temporary password, chooses a password and completes onboarding', async ({ page }) => {
      test.setTimeout(180_000);
      // The API refuses data to a temporary-password session.
      const first = await apiLogin(API_URL, agency, agency.temporaryPassword);
      expect(first.body.data.mustChangePassword).toBe(true);
      expect((await get('/leads', first.body.data.accessToken)).status).toBe(403);

      const chosen = `Handoff-${p.key}-Voyage-${RUN}-26!`;
      expect(chosen.length).toBeGreaterThanOrEqual(12);

      await page.goto('/login');
      await page.waitForSelector('text=Welcome back');
      await submitEmailStep(page, agency.email);
      await page.locator('#password').fill(agency.temporaryPassword);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL('**/change-password', { timeout: 20_000 });

      // Weak and wrong passwords are refused.
      await page.locator('#currentPassword').fill(agency.temporaryPassword);
      await page.locator('#newPassword').fill('short1');
      await page.locator('#confirmPassword').fill('short1');
      await page.getByRole('button', { name: 'Change password' }).click();
      await expect(page.locator('form [role="alert"]')).toContainText('at least 12');

      await page.locator('#newPassword').fill(chosen);
      await page.locator('#confirmPassword').fill(chosen);
      await page.getByRole('button', { name: 'Change password' }).click();
      await page.waitForURL('**/onboarding', { timeout: 20_000 });

      // Step 1: company, prefilled from what the operator typed.
      await expect(page.locator('#company_name')).toHaveValue(companyName);
      await expect(page.locator('#company_email')).toHaveValue(agency.email);
      await page.locator('#company_city').fill(`City${p.key}`);
      await page.getByRole('button', { name: /^Next/ }).click();

      // Step 2: regional settings arrive in the agency's country; numbering prefix is theirs to choose.
      await expect(page.getByText('Tax system')).toBeVisible();
      await expect(page.locator('#currency')).toContainText(p.currency);
      await expect(page.locator('#timezone')).toContainText(p.timezone);
      await page.locator('#invoice_prefix').fill(p.invoicePrefix);
      await page.getByRole('button', { name: /^Next/ }).click();

      // Step 3: branding.
      await expect(page.getByText('Upload your company logo (optional)')).toBeVisible();
      await page.locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1X1 });
      await expect(page.getByAltText('Logo preview')).toBeVisible();
      await page.getByRole('button', { name: /Finish Setup/ }).click();
      await expect(page.getByRole('heading', { name: "You're all set!" })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: /Go to Dashboard/ }).click();
      await page.waitForURL('**/dashboard', { timeout: 15_000 });
      await expect(page.getByText(companyName).first()).toBeVisible({ timeout: 15_000 });

      // From now on the owner has a real session, and the temporary password is dead.
      expect((await apiLogin(API_URL, agency, agency.temporaryPassword)).status).toBe(401);
      const second = await apiLogin(API_URL, agency, chosen);
      expect(second.status).toBe(200);
      expect(second.body.data.mustChangePassword).toBe(false);
      agency = { ...agency, password: chosen, accessToken: second.body.data.accessToken };

      const mails = await outboxFor(API_URL, agency.email);
      expect(mails.some((m) => m.template === 'password_changed')).toBe(true);
    });

    test("3. the agency starts with its country's settings and everything onboarding collected", async () => {
      const login = await apiLogin(API_URL, agency, agency.password!);
      const t = login.body.data.tenant;
      expect(t.plan.key ?? t.plan).toBe(p.plan);
      expect(t).toMatchObject({
        id: agency.tenantId,
        currency: p.currency,
        timezone: p.timezone,
        locale: p.locale,
        country: p.iso,
        phoneDefaultCountry: p.iso,
      });

      const company = (await get('/settings/company')).json.data;
      expect(company).toMatchObject({
        company_name: companyName,
        company_city: `City${p.key}`,
        currency: p.currency,
        timezone: p.timezone,
        tax_system: p.taxSystem,
        onboarding_completed: 'true',
      });
      expect(company.company_logo).toMatch(/^\/files\/.+logo\.png$/);
      expect((await get('/settings/numbering')).json.data.invoice_prefix).toBe(p.invoicePrefix);

      const platform = (await sa('GET', `/admin/tenants/${agency.tenantId}`)).json.data;
      expect(platform.status).toBe('active');
      expect(platform.planId ?? platform.plan).toBe(p.plan);
    });

    test('4. one user per role is invited, accepts, and works within the role; the seat limit holds', async () => {
      test.setTimeout(180_000);
      const included = (await get('/billing/subscription')).json.data.seats.limit as number;
      expect(included).toBeGreaterThanOrEqual(p.price.users);

      const accepted: Array<{ role: UserRole; email: string; token: string }> = [];
      let refused: UserRole | null = null;
      for (const role of INVITED_ROLES) {
        const email = `${role}-${slug}@handoff.test`;
        const invited = await inviteUser(API_URL, agency, { email, name: `${role} ${p.key}`, role });
        if (invited.status !== 201 && invited.status !== 200) {
          // Only the Basic plan can run out of seats (5 users: the owner + four invitations).
          expect(invited.json?.code, invited.text).toBe('SEAT_LIMIT');
          refused = role;
          continue;
        }
        // The invitation link is in the invitee's email.
        const mail = (await outboxFor(API_URL, email)).find((m) => m.template === 'invite_user');
        expect(mail, `invitation mail for ${role}`).toBeTruthy();
        expect(mail!.text).toContain('setup-account?token=');

        // The first invitee uses the browser page; the others use the API.
        const token = await inviteTokenFor(API_URL, email);
        const weak = await acceptInvite(API_URL, token, `${role} ${p.key}`, 'short1');
        expect(weak.status, 'a weak password is refused and the invitation stays usable').toBe(400);
        const password = `Invitee-${role}-${p.key}-${RUN}-26!`;
        const done = await acceptInvite(API_URL, token, `${role} ${p.key}`, password);
        expect(done.status, done.text).toBe(201);
        expect(done.json.data.user.role).toBe(role);
        // The invitation is single use.
        expect((await acceptInvite(API_URL, token, 'again', password)).status).toBe(400);
        const signedIn = await request(API_URL, 'POST', '/auth/login', null, { email, password, tenantId: agency.tenantId });
        expect(signedIn.status).toBe(200);
        accepted.push({ role, email, token: signedIn.json.data.accessToken });
      }

      if (p.plan === 'basic') {
        expect(refused, 'the fifth user on a 5-user plan is refused').toBe('view_only');
        expect(accepted.map((a) => a.role)).toEqual(['sales_manager', 'salesperson', 'operations', 'accountant']);
        const over = await inviteUser(API_URL, agency, { email: `extra-${slug}@handoff.test`, name: 'Extra', role: 'view_only' });
        expect(over.status).toBeGreaterThanOrEqual(400);
        expect(over.json.options).toEqual(expect.arrayContaining(['upgrade']));
      } else {
        expect(refused).toBeNull();
        expect(accepted.map((a) => a.role)).toEqual(INVITED_ROLES);
      }
      sub = { users: accepted };

      // Role permissions, as the invited users meet them.
      const byRole = (r: UserRole) => accepted.find((a) => a.role === r);
      const team = await get('/users');
      expect(team.status).toBe(200);
      expect((team.json.data as any[]).length).toBe(accepted.length + 1);
      if (byRole('sales_manager')) expect((await get('/users', byRole('sales_manager')!.token)).status).toBe(200);
      for (const r of ['salesperson', 'operations', 'accountant', 'view_only'] as UserRole[]) {
        if (byRole(r)) expect((await get('/users', byRole(r)!.token)).status, `${r} must not manage users`).toBe(403);
      }
      const contactBody = { name: `Walk-in ${p.key} ${RUN}`, type: 'customer', phone: p.driverPhone };
      if (byRole('salesperson')) {
        expect((await request(API_URL, 'POST', '/contacts', byRole('salesperson')!.token, contactBody)).status).toBe(201);
      }
      if (byRole('view_only')) {
        expect((await request(API_URL, 'POST', '/contacts', byRole('view_only')!.token, { ...contactBody, name: 'Nope' })).status).toBe(403);
        expect((await get('/contacts', byRole('view_only')!.token)).status).toBe(200);
      }
    });

    test('4b. an invitee can accept through the browser page', async ({ page }) => {
      test.setTimeout(120_000);
      const email = `browser-${slug}@handoff.test`;
      const invited = await inviteUser(API_URL, agency, { email, name: 'Browser Invitee', role: 'view_only' });
      if (invited.status !== 201 && invited.status !== 200) {
        // Basic is full: that is the seat limit again, and there is nothing to accept.
        expect(invited.json?.code).toBe('SEAT_LIMIT');
        return;
      }
      const token = await inviteTokenFor(API_URL, email);
      await page.goto(`/setup-account?token=${token}`);
      const password = `Browser-Invitee-${p.key}-${RUN}-26!`;
      await page.locator('#name').fill('Browser Invitee');
      await page.locator('#password').fill(password);
      await page.locator('#confirmPassword').fill(password);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((url) => !url.pathname.includes('setup-account'), { timeout: 20_000 });
      const signedIn = await request(API_URL, 'POST', '/auth/login', null, { email, password, tenantId: agency.tenantId });
      expect(signedIn.status).toBe(200);
      expect(signedIn.json.data.user.role).toBe('view_only');
      sub.users.push({ role: 'view_only', email, token: signedIn.json.data.accessToken });
    });

    test('5. channels: email address, WhatsApp number and website-form key are connected and belong to this agency only', async () => {
      const address = `bookings-${p.key.toLowerCase()}-${RUN}@handoff.test`;
      const added = await request(API_URL, 'POST', '/integrations/channels', owner(), { channel: 'email', address });
      expect(added.status, added.text).toBe(201);
      claimedEmail[address] = p.key;
      const listed = await get('/integrations/channels');
      expect(JSON.stringify(listed.json)).toContain(address);

      // WhatsApp on Meta: stored encrypted, only the last four characters come back.
      const phoneNumberId = `${p.key.charCodeAt(0)}${RUN.replace(/\D/g, '').padEnd(8, '7').slice(0, 8)}`;
      const token = `EAAG-handoff-${p.key}-${RUN}-1234`;
      const wa = await request(API_URL, 'PUT', '/integrations/whatsapp/meta', owner(), {
        phoneNumberId,
        accessToken: token,
        displayPhone: p.driverPhone,
      });
      expect(wa.status, wa.text).toBe(200);
      expect(wa.json.data.account).toMatchObject({ phoneNumberId, tokenConfigured: true, tokenLast4: '1234' });
      expect(wa.text).not.toContain(token);
      claimedWhatsApp[phoneNumberId] = p.key;

      // A number or address another agency already connected is refused, without saying who has it.
      for (const [other, otherKey] of Object.entries(claimedEmail)) {
        if (otherKey === p.key) continue;
        const clash = await request(API_URL, 'POST', '/integrations/channels', owner(), { channel: 'email', address: other });
        expect(clash.status, `${other} belongs to agency ${otherKey}`).toBe(409);
        expect(clash.text).not.toContain(otherKey);
      }
      for (const [other, otherKey] of Object.entries(claimedWhatsApp)) {
        if (otherKey === p.key) continue;
        const clash = await request(API_URL, 'PUT', '/integrations/whatsapp/meta', owner(), { phoneNumberId: other, accessToken: 'EAAG-clash-token-9999' });
        expect(clash.status).toBe(409);
      }

      // A key for the agency's website form: shown once, then masked.
      const key = await request(API_URL, 'POST', '/integrations/api-keys', owner(), { label: `site ${p.key}` });
      expect(key.status).toBe(201);
      apiKey = key.json.data.apiKey;
      expect(apiKey).toMatch(/^tcrm_[0-9a-f]{48}$/);
      const keys = await get('/integrations/api-keys');
      expect(keys.text).not.toContain(apiKey);
    });

    test('6. the driver app: agency code lookup, driver sign-in with the login code, a working driver session', async () => {
      // Public lookup by the agency code (the slug the operator chose).
      const lookup = await request(API_URL, 'GET', `/driver/agency/${slug}`, null);
      expect(lookup.status, lookup.text).toBe(200);
      expect(lookup.json.data).toMatchObject({
        tenantId: agency.tenantId,
        name: companyName,
        currency: p.currency,
        country: p.iso,
        phoneDefaultCountry: p.iso,
      });
      expect((await request(API_URL, 'GET', '/driver/agency/no-such-agency-code', null)).status).toBe(404);

      // The agency adds a driver (the owner is the one who knows the driver's number).
      const created = await request(API_URL, 'POST', '/fleet/drivers', owner(), {
        name: `Driver ${p.key} ${RUN}`,
        phone: p.driverPhone,
        licenseNumber: `LIC-${p.key}-${RUN}`,
      });
      expect(created.status, created.text).toBe(201);

      const code = await request(API_URL, 'POST', '/driver/login', null, { phone: p.driverPhone, tenantId: agency.tenantId });
      expect(code.status, code.text).toBe(200);
      const wrong = await request(API_URL, 'POST', '/driver/login/verify', null, { phone: p.driverPhone, otp: '000000', tenantId: agency.tenantId });
      expect(wrong.status).toBe(401);
      const verified = await request(API_URL, 'POST', '/driver/login/verify', null, { phone: p.driverPhone, otp: OTP, tenantId: agency.tenantId });
      expect(verified.status, verified.text).toBe(200);
      const driverToken = verified.json.data.accessToken as string;
      expect(driverToken).toBeTruthy();
      expect(verified.json.data.refreshToken).toBeTruthy();

      const profile = await get('/driver/profile', driverToken);
      expect(profile.status).toBe(200);
      expect(profile.text).toContain(`Driver ${p.key} ${RUN}`);
      expect((await get('/driver/trips', driverToken)).status).toBe(200);
      // A driver token is not a CRM token.
      expect((await get('/leads', driverToken)).status).toBeGreaterThanOrEqual(401);

      // Another agency does not know this driver: the same number with another agency code does not sign in.
      const foreign = await request(API_URL, 'POST', '/driver/login/verify', null, { phone: p.driverPhone, otp: OTP, tenantId: DEMO_TENANT });
      expect(foreign.status).toBeGreaterThanOrEqual(400);
    });

    test('7. a website enquiry becomes a lead in this agency, and only here', async () => {
      leadVisitor = `Visitor ${p.key} ${RUN}`;
      const res = await request(API_URL, 'POST', '/leads/webhook', null, {
        api_key: apiKey,
        name: leadVisitor,
        email: `visitor-${p.key.toLowerCase()}-${RUN}@enquiry.test`,
        phone: p.driverPhone.replace(/.$/, '9'),
        destination: 'Bali',
        message: 'We are four adults looking for a week in October',
        adults: 4,
      });
      expect(res.status, res.text).toBe(200);
      expect(res.json.lead_id).toBeTruthy();

      const lead = await get(`/leads/${res.json.lead_id}`);
      expect(lead.status).toBe(200);
      expect(lead.text).toContain('Bali');
      expect(lead.text).toContain(leadVisitor);
      const listed = await get('/leads?limit=100');
      expect(listed.text).toContain(leadVisitor);

      // A made-up key creates nothing.
      const bad = await request(API_URL, 'POST', '/leads/webhook', null, { api_key: 'tcrm_nope', name: 'Intruder' });
      expect(bad.status).toBe(401);
      // The seeded demo agency never sees it (cross-reads between agencies are covered in depth by tenant-isolation.spec.ts).
      const demoLogin = await request(API_URL, 'POST', '/auth/login', null, { email: 'admin@demo.com', password: 'Admin@123', tenantId: DEMO_TENANT });
      expect((await get('/leads?limit=100', demoLogin.json.data.accessToken)).text).not.toContain(leadVisitor);
    });

    test('8. plan gates: locked features answer 403 with the upgrade hint, the operator can open one, calling follows the country', async () => {
      const probes: Array<{ feature: string; path: string }> = [
        { feature: 'whatsapp_campaigns', path: '/whatsapp-campaigns' },
        { feature: 'ai_chatbot', path: '/chatbot/widget' },
        { feature: 'ai_assistant', path: '/ai/settings' },
        { feature: 'ai_intelligence', path: '/ai/intelligence/anything' },
      ];
      const locked: string[] = [];
      for (const probe of probes) {
        const res = await get(probe.path);
        const inPlan = (await planFeatures(p.plan)).includes(probe.feature);
        if (inPlan) {
          expect(res.status, `${probe.feature} is on the ${p.planName} plan`).not.toBe(403);
        } else {
          expect(res.status, `${probe.feature} is not on the ${p.planName} plan`).toBe(403);
          expect(res.json).toMatchObject({ featureKey: probe.feature, currentPlan: p.plan, upgrade: true });
          locked.push(probe.feature);
        }
      }
      // The three plans really differ: Basic has no AI assistant, Enterprise has the intelligence suite.
      if (p.plan === 'basic') expect(locked).toContain('ai_assistant');
      if (p.plan === 'enterprise') expect((await get('/ai/intelligence/anything')).status).not.toBe(403);

      // The operator opens one locked feature for this agency (one on its own route: AI paths are also behind the assistant gate), then takes the override away again.
      const openable = locked.find((f) => f === 'whatsapp_campaigns' || f === 'ai_chatbot');
      if (openable) {
        const feature = openable;
        const probe = probes.find((x) => x.feature === feature)!;
        const open = await sa('PUT', `/admin/tenants/${agency.tenantId}/features`, { features: { [feature]: true }, reason: 'handoff scenario' });
        expect(open.status, open.text).toBe(200);
        expect((await get(probe.path)).status, `${feature} opened by override`).not.toBe(403);
        const reset = await sa('DELETE', `/admin/tenants/${agency.tenantId}/features`);
        expect(reset.status).toBe(200);
        expect((await get(probe.path)).status, `${feature} locked again`).toBe(403);
      }

      // Calling is resold only in some countries; a plan that includes it is not enough.
      const calls = await get('/calls');
      const allowed = CALLING.includes('*') || CALLING.includes(p.iso);
      if (allowed) {
        expect(calls.status, calls.text).not.toBe(403);
      } else {
        expect(calls.status).toBe(403);
        expect(calls.text).toContain('CALLING_NOT_AVAILABLE_IN_COUNTRY');
      }
    });

    test('9. billing: the right currency and gateway, a checkout that completes, an invoice in the agency currency', async () => {
      const overview = await get('/billing/subscription');
      expect(overview.status).toBe(200);
      const b = overview.json.data;
      expect(b).toMatchObject({ gateway: 'mock', configured: true, market: p.market, currency: p.currency, tenantStatus: 'active' });
      expect(b.subscription).toMatchObject({ planKey: p.plan, status: 'active' });
      expect(b.subscription.amount).toBe(p.price.yearly);
      expect(b.seats).toMatchObject({ limit: p.price.users, used: 1 + sub.users.length });
      const own = (b.plans as any[]).find((x) => x.key === p.plan);
      expect(own).toMatchObject({ available: true, currency: p.currency, yearlyPrice: p.price.yearly });

      const quote = await get(`/billing/quote?planKey=${p.plan}&extraUsers=0`);
      expect(quote.status, quote.text).toBe(200);
      expect(quote.json.data).toMatchObject({ currency: p.currency, subtotal: p.price.yearly, planKey: p.plan });
      expect(quote.json.data.total).toBeGreaterThanOrEqual(p.price.yearly);

      const checkout = await request(API_URL, 'POST', '/billing/checkout', owner(), { planKey: p.plan, extraUsers: 0 });
      expect(checkout.status, checkout.text).toBe(200);
      expect(checkout.json.data).toMatchObject({ gateway: 'mock', currency: p.currency, subtotal: p.price.yearly });
      expect(checkout.json.data.display).toContain(p.symbol);

      // The mock payment page plays what the provider would: it signs the payment and sends it to the real webhook.
      const mockUrl = new URL(checkout.json.data.url);
      const paid = await fetch(`${API_URL}/billing/mock-checkout${mockUrl.search}`, { redirect: 'manual' });
      expect(paid.status).toBe(302);
      expect(paid.headers.get('location')).toContain('checkout=success');

      const after = (await get('/billing/subscription')).json.data;
      expect(after.subscription.status).toBe('active');
      expect(after.subscription.currentPeriodEnd).toBeTruthy();
      const invoices = (await get('/billing/invoices')).json.data.invoices as any[];
      expect(invoices.length).toBeGreaterThanOrEqual(1);
      expect(invoices[0]).toMatchObject({ currency: p.currency, status: 'paid' });
      expect(invoices[0].number).toMatch(/^PINV-/);
    });

    test("10. the client's own screens in the browser: team, leads, upgrade prompt and billing", async ({ page }) => {
      test.setTimeout(240_000);
      await signInViaUI(page, agency);

      await page.goto('/settings/team');
      for (const u of sub.users) await expect(page.getByText(u.email).first()).toBeVisible({ timeout: 20_000 });

      await page.goto('/leads');
      await expect(page.getByText(leadVisitor).first()).toBeVisible({ timeout: 20_000 });

      // A plan without the chatbot shows the upgrade state, never a raw 403.
      const chatbotLocked = !(await planFeatures(p.plan)).includes('ai_chatbot');
      await page.goto('/chatbot');
      if (chatbotLocked) {
        await expect(page.locator('text=/upgrade|not on your plan|quota is used up/i').first()).toBeVisible({ timeout: 20_000 });
        expect(await page.locator('body').innerText()).not.toMatch(/\b403\b|Forbidden/);
      } else {
        await expect(page.locator('main').first()).toBeVisible();
        await expect(page.locator('text=/not on your plan/i')).toHaveCount(0);
      }

      await page.goto('/settings/billing');
      const current = page.getByTestId('billing-current');
      await expect(current).toContainText(p.planName, { timeout: 20_000 });
      await expect(current).toContainText(`${1 + sub.users.length} of ${p.price.users} in use`);
      await expect(page.getByTestId(`billing-plan-${p.plan}`)).toContainText(p.symbol);
      await expect(page.getByTestId('billing-not-configured')).toHaveCount(0);
      await expect(page.getByText(/PINV-/).first()).toBeVisible();
    });

    test('11. super admin suspends the agency: everybody is locked out and the data stays; reactivation brings it all back', async ({ page }) => {
      test.setTimeout(180_000);
      const leadsBefore = ((await get('/leads?limit=100')).json.data as any[]).length;
      const someone = sub.users[0]!;

      const suspended = await sa('POST', `/admin/tenants/${agency.tenantId}/suspend`, { reason: 'handoff scenario' });
      expect(suspended.status, suspended.text).toBe(200);
      expect(suspended.json.data.status).toBe('suspended');

      // The owner and every invited user are locked out, with the tokens they already hold and with a new sign-in.
      expect((await get('/leads')).status).toBe(403);
      expect((await get('/leads', someone.token)).status).toBe(403);
      expect((await apiLogin(API_URL, agency, agency.password!)).status).toBeGreaterThanOrEqual(400);
      // The driver app and the billing screen do not work either, and the agency code is no longer recognised.
      expect((await request(API_URL, 'GET', `/driver/agency/${slug}`, null)).status).toBe(404);
      expect((await request(API_URL, 'POST', '/billing/checkout', owner(), { planKey: p.plan, extraUsers: 0 })).status).toBeGreaterThanOrEqual(400);
      // The browser sign-in does not get the owner in.
      await page.goto('/login');
      await page.waitForSelector('text=Welcome back');
      await submitEmailStep(page, agency.email).catch(() => undefined);
      if ((await page.locator('#password').count()) > 0) {
        await page.locator('#password').fill(agency.password!);
        await page.locator('button[type="submit"]').click();
      }
      await page.waitForTimeout(2_500);
      await expect(page).toHaveURL(/\/login/);

      // The operator still sees the agency, suspended, with its data counts.
      const seen = (await sa('GET', `/admin/tenants/${agency.tenantId}`)).json.data;
      expect(seen.status).toBe('suspended');

      const back = await sa('POST', `/admin/tenants/${agency.tenantId}/reactivate`, { reason: 'handoff scenario done' });
      expect(back.status, back.text).toBe(200);
      expect(back.json.data.status).toBe('active');

      // Nothing was lost: same leads, same users, the owner signs in with the same password.
      const again = await apiLogin(API_URL, agency, agency.password!);
      expect(again.status).toBe(200);
      const token = again.body.data.accessToken as string;
      const leadsAfter = ((await get('/leads?limit=100', token)).json.data as any[]).length;
      expect(leadsAfter).toBe(leadsBefore);
      expect(((await get('/users', token)).json.data as any[]).length).toBe(sub.users.length + 1);
      expect((await get('/leads', someone.token)).status).toBe(200);
      expect((await request(API_URL, 'GET', `/driver/agency/${slug}`, null)).status).toBe(200);
    });
  });
}
