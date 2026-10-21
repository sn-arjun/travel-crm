import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { API_URL } from './helpers/auth';
import {
  type Agency,
  NEEDS_MULTI,
  completeFirstLogin,
  createAgency,
  createSuperAdminToken,
  isMultiTenantStack,
  request,
  signInViaUI,
} from './helpers/tenants';

/**
 * R141: calling in the Netherlands, the agency's screens. A Dutch agency on a plan with calling follows the whole number set-up:
 * it fills the requirements form and uploads the registration extract, the super admin approves it through the API (which hands
 * the bundle to the provider), the mock provider approves the bundle, and the agency sees Approved. Buying stays off with the
 * reason "price not set yet" until the NL price is switched on through the super admin API, then a number can be bought.
 *
 * The flow includes a rejection: the super admin rejects the first documents with a reason, the agency sees Rejected with the
 * reason, corrects and resubmits. It uses one agency database of the pool per run, so a stack serves three runs of this spec
 * (start it with `--pool` larger for more).
 *
 * Needs the multi-tenant stack with the mock provider and NL among the calling countries:
 *   FIX_STACK_CALLING_COUNTRIES=GB,US,AU,SG,NL node desktop/scripts/fix-stack.mjs up --slot N --reset-db --multi
 * The interface of a Dutch agency opens in Dutch (asserted below); structure is matched by test id.
 */

test.describe.configure({ mode: 'serial' });
test.use({ storageState: undefined });
test.setTimeout(180_000);

const NL_PHONE_NUMBER_COST_ID = '01a15fab-db01-7d72-bf77-cee76f237fa0';

let sa = '';
let agency: Agency;

/** An admin-console call (the platform operator), through the API the console proxies. */
const admin = (method: string, path: string, body?: unknown) => request(API_URL, method, `/admin${path}`, sa, body);
const asAgency = (who: Agency, method: string, path: string, body?: unknown) => request(API_URL, method, path, who.accessToken!, body);

async function newDutchAgency(tag: string): Promise<Agency> {
  const created = await createAgency(API_URL, sa, {
    plan: 'pro',
    slug: `nl-${tag}-${Date.now().toString(36)}`,
    companyName: `Reisbureau ${tag}`,
    country: 'Netherlands',
    currency: 'EUR',
    timezone: 'Europe/Amsterdam',
    taxSystem: 'vat',
    region: 'eu',
  });
  const who = await completeFirstLogin(API_URL, created);
  const saved = await asAgency(who, 'PUT', '/settings/company', {
    company_name: who.companyName, currency: 'EUR', locale: 'nl-NL', timezone: 'Europe/Amsterdam', country: 'NL', phone_default_country: 'NL', tax_system: 'vat',
  });
  expect(saved.status, saved.text.slice(0, 200)).toBe(200);
  return who;
}

async function openPhoneNumbers(page: Page) {
  await page.goto('/settings/phone-numbers');
  await expect(page.getByTestId('number-rental-info')).toBeVisible({ timeout: 30_000 });
}

/** The state shown for the agency's documents. */
const bundleState = (page: Page) => page.getByTestId('number-documents').getByTestId('bundle-status');

const PDF = { name: 'kvk-uittreksel.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% e2e registration extract\n') };

/** The agency's documents as the console reads them. */
async function consoleDocument(tenantId: string) {
  const res = await admin('GET', `/tenants/${tenantId}/voip`);
  expect(res.status, res.text.slice(0, 200)).toBe(200);
  return (res.json.data.documents as any[]).find((d) => d.country === 'NL');
}

test.beforeAll(async () => {
  if (!(await isMultiTenantStack(API_URL))) return;
  sa = await createSuperAdminToken(API_URL);
  // A rerun on the same stack starts with the NL price off again, as a fresh database has it.
  await admin('PUT', `/catalogue/unit-costs/${NL_PHONE_NUMBER_COST_ID}`, { isActive: false });
  await admin('PUT', '/catalogue/addons/phone_number_nl', { isActive: false });
  agency = await newDutchAgency('belt');
});

test.beforeEach(async () => {
  test.skip(!(await isMultiTenantStack(API_URL)), NEEDS_MULTI);
});

test('the agency sees what the country needs, with nothing started and no price yet', async ({ page }) => {
  await signInViaUI(page, agency);
  await openPhoneNumbers(page);

  await expect(bundleState(page)).toHaveAttribute('data-state', 'none');
  await expect(page.getByTestId('bundle-start')).toBeVisible();
  // a Dutch agency's screens are in Dutch
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.getByTestId('bundle-chip')).toHaveText('Niet gestart');
  await expect(page.getByTestId('bundle-start')).toHaveText('Documenten versturen');
  // NL has a draft price that is switched off: the agency is told so, in its own language
  await expect(page.getByTestId('number-price-missing')).toContainText(/Price not set yet for your country|Prijs voor uw land nog niet vastgesteld/);

  // Searching works, but Buy number is off with the reason
  await page.getByTestId('add-number').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('buy-blocked-reason')).toBeVisible();
  await dialog.getByRole('button', { name: /^(Search|Zoeken)$/ }).click();
  await expect(dialog.getByTestId('buy-number').first()).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByTestId('buy-number').first()).toBeDisabled();
});

test('the requirements form checks the required fields, then sends the answers and the file', async ({ page }) => {
  await signInViaUI(page, agency);
  await openPhoneNumbers(page);
  await page.getByTestId('bundle-start').click();

  const form = page.getByTestId('requirements-form');
  await expect(form).toBeVisible();
  // the list comes from the country policy: two text fields, an address, a representative and a file
  for (const key of ['businessName', 'registrationNumber', 'address', 'representativeName', 'registrationExtract']) {
    await expect(form.getByTestId(`req-field-${key}`)).toBeVisible();
  }

  // an empty form is refused on the screen, nothing is sent
  await page.getByTestId('requirements-submit').click();
  await expect(form.getByTestId('req-error-businessName')).toBeVisible();
  await expect(form.getByTestId('req-error-address')).toBeVisible();
  expect(((await asAgency(agency, 'GET', '/voip/numbers/requirements')).json.data as any).state).toBe('none');

  await form.getByTestId('req-field-businessName').getByRole('textbox').fill('Reisbureau Belt BV');
  await form.getByTestId('req-field-registrationNumber').getByRole('textbox').fill('12345678');
  await form.getByTestId('req-field-representativeName').getByRole('textbox').fill('Jan de Vries');
  await form.getByTestId('req-field-address').getByRole('textbox').first().fill('Damrak 1');
  await form.getByTestId('req-address-postalCode').fill('1012 LG');
  await form.getByTestId('req-address-city').fill('Amsterdam');
  await form.getByTestId('req-field-registrationExtract').locator('input[type="file"]').setInputFiles(PDF);
  await page.getByTestId('requirements-submit').click();

  await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Documents sent for review|Documenten ter controle verstuurd/ })).toBeVisible({ timeout: 15_000 });
  await expect(bundleState(page)).toHaveAttribute('data-state', 'submitted', { timeout: 15_000 });
  // nothing to resubmit or start while it is with the platform
  await expect(page.getByTestId('bundle-start')).toHaveCount(0);
  await expect(page.getByTestId('bundle-resubmit')).toHaveCount(0);

  // the backend holds the answers, with the address as structured data and the file in storage
  const doc = await consoleDocument(agency.tenantId);
  expect(doc.status).toBe('pending');
  expect(doc.regulatory.state).toBe('submitted');
  expect(doc.details).toMatchObject({ businessName: 'Reisbureau Belt BV', registrationNumber: '12345678', representativeName: 'Jan de Vries' });
  expect(doc.details.address).toMatchObject({ street: 'Damrak 1', postalCode: '1012 LG', city: 'Amsterdam' });
  expect(doc.files).toHaveLength(1);
  expect(doc.files[0].name).toBe(PDF.name);
  expect(doc.files[0].field).toBe('registrationExtract');
});

test('a rejection shows its reason and Resubmit, and the form starts from what was sent', async ({ page }) => {
  const review = await admin('PUT', `/tenants/${agency.tenantId}/voip/documents/NL`, { status: 'rejected', note: 'The extract is older than three months' });
  expect(review.status, review.text.slice(0, 300)).toBe(200);

  await signInViaUI(page, agency);
  await openPhoneNumbers(page);
  await expect(bundleState(page)).toHaveAttribute('data-state', 'rejected');
  await expect(page.getByTestId('bundle-chip')).toHaveText('Afgewezen');
  await expect(page.getByTestId('bundle-reason')).toContainText('The extract is older than three months');
  // Buy number is off, and the reason says to correct and send again
  await page.getByTestId('add-number').click();
  await expect(page.getByRole('dialog').getByTestId('buy-blocked-reason')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByTestId('bundle-resubmit').click();
  const form = page.getByTestId('requirements-form');
  await expect(form.getByTestId('req-field-businessName').getByRole('textbox')).toHaveValue('Reisbureau Belt BV');
  await expect(form.getByTestId('req-address-city')).toHaveValue('Amsterdam');

  // correct and send again: back to submitted
  await form.getByTestId('req-field-registrationExtract').locator('input[type="file"]').setInputFiles(PDF);
  await page.getByTestId('requirements-submit').click();
  await expect(bundleState(page)).toHaveAttribute('data-state', 'submitted', { timeout: 15_000 });
  expect((await consoleDocument(agency.tenantId)).status).toBe('pending');
});

test('the super admin approves, the provider reviews, and the agency sees each step', async ({ page }) => {
  // the console approves: in a bundle country this also hands the bundle to the provider
  const approved = await admin('PUT', `/tenants/${agency.tenantId}/voip/documents/NL`, { status: 'approved' });
  expect(approved.status, approved.text.slice(0, 300)).toBe(200);
  expect(approved.json.data.submittedToProvider).toBe(true);
  expect(approved.json.data.regulatory.state).toBe('provider_review');
  expect(approved.json.data.regulatory.providerStatus).toBe('pending-review');

  await signInViaUI(page, agency);
  await openPhoneNumbers(page);
  await expect(bundleState(page)).toHaveAttribute('data-state', 'provider_review');
  // the pending message promises an e-mail and no duration
  const message = (await page.getByTestId('number-documents').getByTestId('bundle-message').textContent()) ?? '';
  expect(message).toMatch(/phone provider|telefoonaanbieder/i);
  expect(message).not.toMatch(/\d/);

  // Buy number is still off, and says why
  await page.getByTestId('add-number').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('buy-blocked-reason')).toContainText(/phone provider|telefoonaanbieder/i);
  await page.keyboard.press('Escape');

  // the mock provider approves the bundle when the console asks for the status
  const refreshed = await admin('POST', `/tenants/${agency.tenantId}/voip/documents/NL/refresh-status`);
  expect(refreshed.status, refreshed.text.slice(0, 300)).toBe(200);
  expect(refreshed.json.data.regulatory.state).toBe('approved');
  expect(refreshed.json.data.regulatory.providerStatus).toBe('twilio-approved');

  await page.reload();
  await expect(page.getByTestId('number-rental-info')).toBeVisible({ timeout: 30_000 });
  await expect(bundleState(page)).toHaveAttribute('data-state', 'approved');
});

test('with the documents approved and the NL price off, Buy number says the price is not set yet', async ({ page }) => {
  await signInViaUI(page, agency);
  await openPhoneNumbers(page);
  await expect(page.getByTestId('number-price-missing')).toBeVisible();

  await page.getByTestId('add-number').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('buy-blocked-reason')).toContainText(/Price not set yet for your country|Prijs voor uw land nog niet vastgesteld/);
  await dialog.getByRole('button', { name: /^(Search|Zoeken)$/ }).click();
  await expect(dialog.getByTestId('buy-number').first()).toBeDisabled({ timeout: 20_000 });

  // the API says the same
  const buy = await asAgency(agency, 'POST', '/voip/numbers/purchase', { phoneNumber: '+31203000111' });
  expect(buy.status).toBe(409);
  expect(buy.json.code ?? buy.json.error?.code).toBe('PRICE_NOT_CONFIGURED');
});

test('after the NL price is switched on off camera, the agency buys a number', async ({ page }) => {
  // the owner's step: enter the provider price, activate the NL rows, and grant the agency a phone number add-on
  const cost = await admin('PUT', `/catalogue/unit-costs/${NL_PHONE_NUMBER_COST_ID}`, { unitCost: 1.5, provider: 'Twilio', isActive: true });
  expect(cost.status, cost.text.slice(0, 300)).toBe(200);
  const addon = await admin('PUT', '/catalogue/addons/phone_number_nl', { isActive: true });
  expect(addon.status, addon.text.slice(0, 300)).toBe(200);
  const grant = await admin('POST', `/tenants/${agency.tenantId}/addons`, { productKey: 'phone_number_nl', quantity: 1 });
  expect(grant.status, grant.text.slice(0, 300)).toBe(201);

  await signInViaUI(page, agency);
  await openPhoneNumbers(page);
  await expect(page.getByTestId('number-price')).toBeVisible();
  await expect(page.getByTestId('number-price-missing')).toHaveCount(0);

  await page.getByTestId('add-number').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('buy-blocked-reason')).toHaveCount(0);
  await dialog.getByRole('button', { name: /^(Search|Zoeken)$/ }).click();
  const buy = dialog.getByTestId('buy-number').first();
  await expect(buy).toBeEnabled({ timeout: 20_000 });
  await buy.click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Phone number purchased|Telefoonnummer gekocht/ })).toBeVisible({ timeout: 20_000 });

  const numbers = (await asAgency(agency, 'GET', '/voip/numbers')).json.data as Array<{ phoneNumber: string }>;
  expect(numbers).toHaveLength(1);
  expect(numbers[0]!.phoneNumber).toMatch(/^\+31/);
  await expect(page.getByRole('row').filter({ hasText: numbers[0]!.phoneNumber })).toBeVisible({ timeout: 15_000 });
});

test('the console view carries what a reviewer needs: fields, file and the provider side', async () => {
  const doc = await consoleDocument(agency.tenantId);
  expect(doc.status).toBe('approved');
  expect(doc.regulatory).toMatchObject({ state: 'approved', providerStatus: 'twilio-approved', numberType: 'local' });
  expect(doc.regulatory.bundleSid).toBeTruthy();
  expect(doc.regulatory.addressSid).toBeTruthy();
  expect(doc.details).toMatchObject({ businessName: 'Reisbureau Belt BV', representativeName: 'Jan de Vries' });
  expect(doc.files[0]).toMatchObject({ name: PDF.name, field: 'registrationExtract' });
  // the country list the console draws the labels from
  const policy = await admin('GET', '/voip/country-policy');
  const nl = (policy.json.data as any[]).find((p) => p.country === 'NL');
  expect(nl.kycRequired).toBe(true);
  expect(nl.kycRequirements.map((r: any) => r.key)).toEqual(['businessName', 'registrationNumber', 'address', 'representativeName', 'registrationExtract']);
});
