import { test, expect, type Locator, type Page } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { api, seedEmailTemplate } from './helpers/api-seed';

/**
 * Company settings slice: hub, company profile, document numbering, invoice
 * defaults, itinerary defaults, lead assignment rules, source routing rules
 * and follow-up sequences.
 *
 * Every form is filled through the UI, saved, and then verified three ways:
 * the toast, a reload of the form (pre-fill), and the raw API document.
 * Tenant settings are snapshotted in beforeAll and restored in afterAll so
 * other specs in the shared session see the original configuration.
 */

const RUN = Date.now();
const SEQ_NAME = `E2E Sequence ${RUN}`;
const SEQ_RENAMED = `${SEQ_NAME} Renamed`;

// 1x1 transparent PNG
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

const COMPANY_KEYS = [
  'company_name', 'company_email', 'company_phone', 'company_website', 'company_address',
  'company_city', 'company_state', 'company_postal_code', 'company_country', 'gstin',
  'timezone', 'currency', 'language', 'company_logo',
];

let snapshot: {
  company: Record<string, string | null>;
  invoice: Record<string, any>;
  numbering: Record<string, any>;
  itinerary: Record<string, any>;
  assignment: Record<string, any>;
  routing: any[];
};

let users: Array<{ id: string; name: string; email: string }> = [];
let template: { id: string; name: string };
let settingsFailures: string[] = [];

// ─── helpers ────────────────────────────────────────────────────────────────

async function pick(page: Page, trigger: Locator, option: string) {
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 10_000 });
}

async function save(page: Page, name = 'Save') {
  await page.getByRole('button', { name, exact: true }).click();
}

async function openSettingsPage(page: Page, href: string, heading: string) {
  await page.goto(href);
  await waitForLoad(page);
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible({ timeout: 15_000 });
}

async function expectNoDirectMessagingLinks(page: Page) {
  await expect(page.locator('a[href^="mailto:"], a[href*="wa.me"], a[href^="tel:"]')).toHaveCount(0);
}

const settingsGet = async (path: string) => (await api('GET', `/settings/${path}`)).data;

async function restoreSettings() {
  const company: Record<string, string | null> = {};
  for (const k of COMPANY_KEYS) company[k] = snapshot.company[k] ?? null;
  await api('PUT', '/settings/company', company);

  const inv = snapshot.invoice;
  const body: Record<string, any> = {
    bank_details: inv.bank_details && typeof inv.bank_details === 'object' ? inv.bank_details : {},
    default_payment_terms: inv.default_payment_terms == null ? '' : String(inv.default_payment_terms),
    default_due_days: Number(inv.default_due_days ?? 30),
    default_tax_type: inv.default_tax_type ?? 'gst',
    default_tax_rate: Number(inv.default_tax_rate ?? 18),
    gstin: inv.gstin ?? '',
    company_state: inv.company_state ?? '',
    tax_system: inv.tax_system ?? 'gst',
    upi_id: inv.upi_id ?? '',
  };
  await api('PUT', '/settings/invoice-defaults', body);

  await api('PUT', '/settings/numbering', snapshot.numbering);
  await api('PUT', '/settings/itinerary-defaults', snapshot.itinerary);
  await api('PUT', '/settings/assignment-rules', {
    mode: snapshot.assignment.mode ?? 'round_robin',
    rules: snapshot.assignment.rules ?? [],
  });
  await api('PUT', '/settings/routing-rules', Array.isArray(snapshot.routing) ? snapshot.routing : []);
}

// ─── suite ──────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

test.describe('Settings — company configuration', () => {
  test.beforeAll(async () => {
    snapshot = {
      company: await settingsGet('company'),
      invoice: await settingsGet('invoice-defaults'),
      numbering: await settingsGet('numbering'),
      itinerary: await settingsGet('itinerary-defaults'),
      assignment: await settingsGet('assignment-rules'),
      routing: await settingsGet('routing-rules'),
    };
    const res = await api('GET', '/users?limit=20');
    users = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    expect(users.length).toBeGreaterThan(0);
    template = await seedEmailTemplate({ name: `E2E Seq Template ${RUN}` });
    expect(template.id).toBeTruthy();
  });

  test.afterAll(async () => {
    await restoreSettings();
    if (template?.id) await api('DELETE', `/templates/${template.id}`);
  });

  test.beforeEach(async ({ page }) => {
    settingsFailures = [];
    // A beforeunload prompt from the unsaved-changes guard must never wedge navigation.
    page.on('dialog', (d) => d.accept());
    page.on('response', (res) => {
      if (res.url().includes('/api/v1/settings') && res.status() >= 400) {
        settingsFailures.push(`${res.request().method()} ${res.url()} -> ${res.status()}`);
      }
    });
  });

  test.afterEach(async () => {
    // A 4xx/5xx from the settings API means the page and backend disagree on the contract.
    expect(settingsFailures, 'settings API calls must not fail').toEqual([]);
  });

  // ── hub ───────────────────────────────────────────────────────────────────

  test('settings hub lists every configuration area and links through', async ({ page }) => {
    await page.goto('/settings');
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByText('Manage your company configuration and preferences.')).toBeVisible();

    for (const group of ['Company', 'Sales & Leads', 'Billing & Documents', 'Communication', 'Account & Security']) {
      await expect(page.getByText(group, { exact: true }).first()).toBeVisible();
    }

    const hrefs = [
      '/settings/company', '/settings/assignment-rules', '/settings/routing-rules',
      '/settings/followup-sequences', '/settings/invoice-defaults', '/settings/numbering',
      '/settings/itinerary-defaults', '/settings/notifications', '/settings/team',
      // security entry points carried over from the old Security tab
      '/settings/profile', '/settings/sessions', '/settings/login-history', '/settings/activity-log',
    ];
    for (const href of hrefs) {
      await expect(page.locator(`a[href="${href}"]`).first(), `hub link ${href}`).toBeVisible();
    }

    await page.locator('a[href="/settings/company"]').first().click();
    await page.waitForURL('**/settings/company');
    await expect(page.getByRole('heading', { name: 'Company Settings', level: 1 })).toBeVisible();
    await expectNoDirectMessagingLinks(page);
  });

  // ── company profile ───────────────────────────────────────────────────────

  test('company profile: validation, full fill, save, pre-fill, edit and cancel', async ({ page }) => {
    await openSettingsPage(page, '/settings/company', 'Company Settings');

    // Carried from the old spec: the form exposes company name, timezone and a save action.
    await expect(page.getByText('Company Name', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Timezone', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();

    // Validation: required name, valid email.
    await page.locator('#name').fill('');
    await page.locator('#email').fill('not-an-email');
    await save(page);
    await expect(page.getByText('Company name is required')).toBeVisible();
    await expect(page.getByText('Enter a valid email')).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/company$/);

    // Fill every field through the UI.
    const co = {
      name: `E2E Travels ${RUN}`,
      email: `ops-${RUN}@e2e-travels.test`,
      phoneLocal: '98765 43210',
      website: 'https://e2e-travels.test',
      gstin: '29ABCDE1234F1Z5',
      address: '12 Residency Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560025',
      country: 'India',
    };
    await page.locator('#name').fill(co.name);
    await page.locator('#email').fill(co.email);

    // Phone uses PhoneInput with a working country picker (not a bare text field).
    const phoneRow = page.locator('input[type="tel"]');
    await phoneRow.fill(co.phoneLocal);
    await page.getByRole('combobox').filter({ hasText: '+91' }).click();
    await page.getByPlaceholder('Search country...').fill('UAE');
    await page.getByRole('option', { name: /UAE/ }).click();
    await expect(page.getByRole('combobox').filter({ hasText: '+971' })).toBeVisible();

    await page.locator('#website').fill(co.website);
    await page.locator('#gstin').fill(co.gstin);
    await page.getByPlaceholder('Start typing an address...').fill(co.address);
    await page.locator('#city').fill(co.city);
    await page.locator('#state').fill(co.state);
    await page.locator('#postalCode').fill(co.postalCode);
    await page.locator('#country').fill(co.country);
    await pick(page, page.locator('#currency'), 'US Dollar (USD)');
    await pick(page, page.locator('#timezone'), 'Asia/Dubai (GST)');
    await pick(page, page.locator('#language'), 'हिंदी (Hindi)');

    await save(page);
    await expectToast(page, 'Company settings saved successfully');
    await page.waitForURL(/\/settings$/);

    // Persisted under the keys the rest of the backend reads.
    const stored = await settingsGet('company');
    expect(stored).toMatchObject({
      company_name: co.name,
      company_email: co.email,
      company_phone: '+971 98765 43210',
      company_website: co.website,
      gstin: co.gstin,
      company_address: co.address,
      company_city: co.city,
      company_state: co.state,
      company_postal_code: co.postalCode,
      company_country: co.country,
      currency: 'USD',
      timezone: 'Asia/Dubai',
      language: 'hi',
    });

    // Edit form is pre-filled with every saved value.
    await openSettingsPage(page, '/settings/company', 'Company Settings');
    await expect(page.locator('#name')).toHaveValue(co.name);
    await expect(page.locator('#email')).toHaveValue(co.email);
    await expect(page.locator('input[type="tel"]')).toHaveValue(co.phoneLocal);
    await expect(page.getByRole('combobox').filter({ hasText: '+971' })).toBeVisible();
    await expect(page.locator('#website')).toHaveValue(co.website);
    await expect(page.locator('#gstin')).toHaveValue(co.gstin);
    await expect(page.getByPlaceholder('Start typing an address...')).toHaveValue(co.address);
    await expect(page.locator('#city')).toHaveValue(co.city);
    await expect(page.locator('#state')).toHaveValue(co.state);
    await expect(page.locator('#postalCode')).toHaveValue(co.postalCode);
    await expect(page.locator('#country')).toHaveValue(co.country);
    await expect(page.locator('#currency')).toContainText('US Dollar (USD)');
    await expect(page.locator('#timezone')).toContainText('Asia/Dubai (GST)');
    await expect(page.locator('#language')).toContainText('हिंदी (Hindi)');

    // Edit the GSTIN and persist it.
    await page.locator('#gstin').fill('27AAPFU0939F1ZV');
    await save(page);
    await expectToast(page, 'Company settings saved successfully');
    await page.waitForURL(/\/settings$/);
    expect((await settingsGet('company')).gstin).toBe('27AAPFU0939F1ZV');

    // The invoice-defaults page reads the same company state / GSTIN.
    await openSettingsPage(page, '/settings/invoice-defaults', 'Invoice Defaults');
    await expect(page.locator('#gstin')).toHaveValue('27AAPFU0939F1ZV');
    await expect(page.locator('#companyState')).toHaveValue(co.state);

    // Cancel returns to the hub without saving.
    await openSettingsPage(page, '/settings/company', 'Company Settings');
    await page.locator('#city').fill('Should Not Persist');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.waitForURL(/\/settings$/);
    expect((await settingsGet('company')).company_city).toBe(co.city);
  });

  test('company logo upload reaches the API', async ({ page }) => {
    await openSettingsPage(page, '/settings/company', 'Company Settings');

    await page.locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1X1 });
    await expectToast(page, 'Logo uploaded successfully');
    await expect(page.getByText('Failed to upload logo')).toHaveCount(0);

    const stored = await settingsGet('company');
    expect(stored.company_logo).toMatch(/^\/files\/logos\//);
  });

  // ── document numbering ────────────────────────────────────────────────────

  test('document numbering: validation, save, pre-fill and persistence', async ({ page }) => {
    await openSettingsPage(page, '/settings/numbering', 'Document Numbering');

    // Required prefix.
    await page.locator('#invoicePrefix').fill('');
    await save(page);
    await expect(page.getByText('Required').first()).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/numbering$/);

    const prefixes = {
      invoicePrefix: `BILL${RUN % 1000}`,
      proformaPrefix: 'PRF',
      receiptPrefix: 'RCT',
      creditNotePrefix: 'CRN',
      debitNotePrefix: 'DBN',
      voucherPrefix: 'VOU',
    };
    for (const [id, value] of Object.entries(prefixes)) {
      await page.locator(`#${id}`).fill(value);
    }
    await pick(page, page.locator('#fyStartMonth'), 'January');
    const toggle = page.getByRole('switch');
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(page.getByText('Continuous numbering')).toBeVisible();

    await save(page);
    await expectToast(page, 'Numbering configuration saved successfully');
    await page.waitForURL(/\/settings$/);

    const stored = await settingsGet('numbering');
    expect(stored).toMatchObject({
      invoice_prefix: prefixes.invoicePrefix,
      proforma_prefix: 'PRF',
      receipt_prefix: 'RCT',
      credit_note_prefix: 'CRN',
      debit_note_prefix: 'DBN',
      voucher_prefix: 'VOU',
      fy_start_month: 1,
      reset_yearly: false,
    });

    await openSettingsPage(page, '/settings/numbering', 'Document Numbering');
    for (const [id, value] of Object.entries(prefixes)) {
      await expect(page.locator(`#${id}`)).toHaveValue(value);
    }
    await expect(page.locator('#fyStartMonth')).toContainText('January');
    await expect(page.getByRole('switch')).not.toBeChecked();
    await expect(page.getByText('Continuous numbering')).toBeVisible();

    // Edit one prefix and persist.
    await page.locator('#voucherPrefix').fill('VCX');
    await save(page);
    await expectToast(page, 'Numbering configuration saved successfully');
    await page.waitForURL(/\/settings$/);
    expect((await settingsGet('numbering')).voucher_prefix).toBe('VCX');
  });

  // ── invoice defaults ──────────────────────────────────────────────────────

  test('invoice defaults: validation, save, pre-fill and persistence', async ({ page }) => {
    await openSettingsPage(page, '/settings/invoice-defaults', 'Invoice Defaults');

    await page.locator('#defaultDueDays').fill('0');
    await save(page);
    await expect(page.getByText(/Enter 1.365 days/)).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/invoice-defaults$/);

    const inv = {
      bankName: 'State Bank of India',
      accountNumber: '123456789012',
      ifsc: 'SBIN0001234',
      branch: 'MG Road',
      accountHolderName: 'E2E Travels Pvt Ltd',
      upiId: 'e2e@upi',
      gstin: '29ABCDE1234F1Z5',
      companyState: 'Karnataka',
      defaultTaxRate: '12',
      defaultDueDays: '45',
      defaultPaymentTerms: 'Net 45. Late fee 2% per month.',
    };
    for (const [id, value] of Object.entries(inv)) {
      await page.locator(`#${id}`).fill(value);
    }
    await pick(page, page.locator('#taxSystem'), 'VAT');

    await save(page);
    await expectToast(page, 'Invoice defaults saved successfully');
    await page.waitForURL(/\/settings$/);

    const stored = await settingsGet('invoice-defaults');
    expect(stored.bank_details).toMatchObject({
      bankName: inv.bankName,
      accountNumber: inv.accountNumber,
      ifsc: inv.ifsc,
      branch: inv.branch,
      accountHolderName: inv.accountHolderName,
    });
    expect(stored).toMatchObject({
      upi_id: inv.upiId,
      gstin: inv.gstin,
      company_state: inv.companyState,
      tax_system: 'vat',
      default_tax_type: 'vat',
      default_tax_rate: 12,
      default_due_days: 45,
      default_payment_terms: inv.defaultPaymentTerms,
    });

    await openSettingsPage(page, '/settings/invoice-defaults', 'Invoice Defaults');
    for (const [id, value] of Object.entries(inv)) {
      await expect(page.locator(`#${id}`)).toHaveValue(value);
    }
    await expect(page.locator('#taxSystem')).toContainText('VAT');

    // Edit and persist.
    await page.locator('#defaultDueDays').fill('60');
    await pick(page, page.locator('#taxSystem'), 'GST');
    await save(page);
    await expectToast(page, 'Invoice defaults saved successfully');
    await page.waitForURL(/\/settings$/);
    expect(await settingsGet('invoice-defaults')).toMatchObject({ default_due_days: 60, tax_system: 'gst' });
  });

  // ── itinerary defaults ────────────────────────────────────────────────────

  test('itinerary defaults: validation, save, pre-fill and persistence', async ({ page }) => {
    await openSettingsPage(page, '/settings/itinerary-defaults', 'Itinerary Defaults');

    await page.locator('#childPricePercent').fill('150');
    await save(page);
    await expect(page.getByText('Enter a percentage between 0 and 100')).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/itinerary-defaults$/);

    const it = {
      validityDays: '14',
      childPricePercent: '60',
      groupDiscountThreshold: '12',
      groupDiscountPercent: '8',
      defaultInclusions: 'Airport transfers\nDaily breakfast\nSightseeing',
      defaultExclusions: 'Airfare\nTravel insurance',
      defaultTerms: '50% advance at booking, balance 15 days before departure.',
    };
    for (const [id, value] of Object.entries(it)) {
      await page.locator(`#${id}`).fill(value);
    }
    await pick(page, page.locator('#defaultCurrency'), 'AED - UAE Dirham');

    await save(page);
    await expectToast(page, 'Itinerary defaults saved successfully');
    await page.waitForURL(/\/settings$/);

    expect(await settingsGet('itinerary-defaults')).toMatchObject({
      defaultCurrency: 'AED',
      validityDays: 14,
      childPricePercent: 60,
      groupDiscountThreshold: 12,
      groupDiscountPercent: 8,
      defaultInclusions: ['Airport transfers', 'Daily breakfast', 'Sightseeing'],
      defaultExclusions: ['Airfare', 'Travel insurance'],
      defaultTerms: it.defaultTerms,
    });

    await openSettingsPage(page, '/settings/itinerary-defaults', 'Itinerary Defaults');
    for (const [id, value] of Object.entries(it)) {
      await expect(page.locator(`#${id}`)).toHaveValue(value);
    }
    await expect(page.locator('#defaultCurrency')).toContainText('AED - UAE Dirham');

    await page.locator('#validityDays').fill('30');
    await save(page);
    await expectToast(page, 'Itinerary defaults saved successfully');
    await page.waitForURL(/\/settings$/);
    expect((await settingsGet('itinerary-defaults')).validityDays).toBe(30);
  });

  // ── assignment rules ──────────────────────────────────────────────────────

  test('assignment rules: user combobox, weights, validation, persistence, empty state', async ({ page }) => {
    await api('PUT', '/settings/assignment-rules', { mode: 'round_robin', rules: [] });
    const user = users[0]!;

    await openSettingsPage(page, '/settings/assignment-rules', 'Assignment Rules');
    await expect(page.getByText('No team members configured')).toBeVisible();

    await page.getByRole('button', { name: 'Add Team Member' }).first().click();
    const member = page.getByRole('combobox', { name: 'Team member 1' });
    await expect(member).toBeVisible();

    // Relation field is a searchable combobox, never a raw id input.
    await expect(page.locator('input[placeholder*="ID" i], input[name*="userId" i]')).toHaveCount(0);

    await member.click();
    const search = page.getByPlaceholder('Search…');
    await search.fill('zzzz-no-such-user');
    await expect(page.getByText('No matches found.')).toBeVisible();

    const needle = user.email.split('@')[0]!.slice(0, 5).toLowerCase();
    await search.fill(needle);
    const options = page.getByRole('option');
    await expect(options.first()).toBeVisible();
    for (const text of await options.allInnerTexts()) {
      expect(text.toLowerCase(), 'options are narrowed by the search text').toContain(needle);
    }
    await options.filter({ hasText: user.email }).first().click();
    await expect(member).toContainText(user.name);
    await expect(page.locator(`input[value="${user.id}"]`)).toHaveCount(0);

    // Same user twice is rejected before any request is sent.
    await page.getByRole('button', { name: 'Add Team Member' }).click();
    await page.getByRole('combobox', { name: 'Team member 2' }).click();
    await page.getByRole('option').filter({ hasText: user.email }).first().click();
    await page.getByRole('button', { name: 'Save Assignment Rules' }).click();
    await expectToast(page, 'Each user can only appear once');

    // Out-of-range weight is rejected.
    await page.getByRole('button', { name: 'Remove team member 2' }).click();
    await page.getByLabel('Weight 1').fill('11');
    await page.getByRole('button', { name: 'Save Assignment Rules' }).click();
    await expectToast(page, 'Weight must be a whole number from 1 to 10');

    await page.getByLabel('Weight 1').fill('3');
    await pick(page, page.locator('#assignmentMode'), 'Source based');
    await page.getByRole('button', { name: 'Save Assignment Rules' }).click();
    await expectToast(page, 'Assignment rules saved successfully');

    expect(await settingsGet('assignment-rules')).toEqual({
      mode: 'source_based',
      rules: [{ userId: user.id, weight: 3 }],
    });

    // Reload: every value pre-filled, user shown by name.
    await openSettingsPage(page, '/settings/assignment-rules', 'Assignment Rules');
    await expect(page.locator('#assignmentMode')).toContainText('Source based');
    await expect(page.getByRole('combobox', { name: 'Team member 1' })).toContainText(user.name);
    await expect(page.getByLabel('Weight 1')).toHaveValue('3');
    await expect(page.getByTestId('assignment-member-row')).toHaveCount(1);

    // Delete the member and persist: empty state returns.
    await page.getByRole('button', { name: 'Remove team member 1' }).click();
    await expect(page.getByText('No team members configured')).toBeVisible();
    await page.getByRole('button', { name: 'Save Assignment Rules' }).click();
    await expectToast(page, 'Assignment rules saved successfully');
    expect((await settingsGet('assignment-rules')).rules).toEqual([]);
    await openSettingsPage(page, '/settings/assignment-rules', 'Assignment Rules');
    await expect(page.getByText('No team members configured')).toBeVisible();
    await expectNoDirectMessagingLinks(page);
  });

  // ── routing rules ─────────────────────────────────────────────────────────

  test('routing rules: source + user combobox, validation, persistence, empty state', async ({ page }) => {
    await api('PUT', '/settings/routing-rules', []);
    const user = users[0]!;

    await openSettingsPage(page, '/settings/routing-rules', 'Lead Routing Rules');
    await expect(page.getByText('No routing rules configured')).toBeVisible();

    await page.getByRole('button', { name: 'Add Rule' }).first().click();
    await expect(page.locator('input[placeholder*="ID" i], input[name*="assignTo" i]')).toHaveCount(0);

    // Missing user is rejected.
    await page.getByRole('button', { name: 'Save Routing Rules' }).click();
    await expectToast(page, 'Pick a user to assign to for every rule');

    await pick(page, page.getByRole('combobox', { name: 'Lead source 1' }), 'Website');
    const assignTo = page.getByRole('combobox', { name: 'Assign to 1' });
    await assignTo.click();
    await page.getByPlaceholder('Search…').fill('zzzz-no-such-user');
    await expect(page.getByText('No matches found.')).toBeVisible();
    await page.getByPlaceholder('Search…').fill(user.email.split('@')[0]!.slice(0, 5));
    await page.getByRole('option').filter({ hasText: user.email }).first().click();
    await expect(assignTo).toContainText(user.name);

    // Second rule, then force a duplicate source.
    await page.getByRole('button', { name: 'Add Rule' }).click();
    await pick(page, page.getByRole('combobox', { name: 'Lead source 2' }), 'Website');
    await page.getByRole('combobox', { name: 'Assign to 2' }).click();
    await page.getByRole('option').filter({ hasText: user.email }).first().click();
    await page.getByRole('button', { name: 'Save Routing Rules' }).click();
    await expectToast(page, 'Each lead source can only have one rule');

    await pick(page, page.getByRole('combobox', { name: 'Lead source 2' }), 'Google');
    await page.getByRole('button', { name: 'Save Routing Rules' }).click();
    await expectToast(page, 'Routing rules saved successfully');

    expect(await settingsGet('routing-rules')).toEqual([
      { source: 'website', assignToUserId: user.id },
      { source: 'google', assignToUserId: user.id },
    ]);

    await openSettingsPage(page, '/settings/routing-rules', 'Lead Routing Rules');
    await expect(page.getByTestId('routing-rule-row')).toHaveCount(2);
    await expect(page.getByRole('combobox', { name: 'Lead source 1' })).toContainText('Website');
    await expect(page.getByRole('combobox', { name: 'Lead source 2' })).toContainText('Google');
    await expect(page.getByRole('combobox', { name: 'Assign to 1' })).toContainText(user.name);
    await expect(page.getByRole('combobox', { name: 'Assign to 2' })).toContainText(user.name);

    // Edit: change a source, delete the other rule, persist.
    await pick(page, page.getByRole('combobox', { name: 'Lead source 1' }), 'Referral');
    await page.getByRole('button', { name: 'Remove rule 2' }).click();
    await page.getByRole('button', { name: 'Save Routing Rules' }).click();
    await expectToast(page, 'Routing rules saved successfully');
    expect(await settingsGet('routing-rules')).toEqual([{ source: 'referral', assignToUserId: user.id }]);

    // Delete the last rule: empty state after reload.
    await openSettingsPage(page, '/settings/routing-rules', 'Lead Routing Rules');
    await page.getByRole('button', { name: 'Remove rule 1' }).click();
    await page.getByRole('button', { name: 'Save Routing Rules' }).click();
    await expectToast(page, 'Routing rules saved successfully');
    await openSettingsPage(page, '/settings/routing-rules', 'Lead Routing Rules');
    await expect(page.getByText('No routing rules configured')).toBeVisible();
    await expectNoDirectMessagingLinks(page);
  });

  // ── follow-up sequences ───────────────────────────────────────────────────

  test('follow-up sequences: create, list, pre-filled edit, search, disable, export, delete', async ({ page }) => {
    await openSettingsPage(page, '/settings/followup-sequences', 'Follow-up Sequences');
    const row = (name: string) => page.locator('tr', { hasText: name });

    // Validation.
    await page.getByRole('button', { name: 'Add Sequence' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Create Sequence')).toBeVisible();
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expectToast(page, 'Sequence name is required');

    // Fill every field: name, trigger, two steps with type/day/template/notes.
    await dialog.locator('#seqName').fill(SEQ_NAME);
    await pick(page, dialog.locator('#seqTrigger'), 'Qualified');

    await pick(page, dialog.getByRole('combobox', { name: 'Step 1 type' }), 'Email');
    await dialog.getByLabel('Step 1 day').fill('0');
    await dialog.getByLabel('Step 1 notes').fill('Send the welcome pack');

    // Template is a searchable relation combobox, not a free-text id field.
    await expect(dialog.getByPlaceholder('template-id')).toHaveCount(0);
    await dialog.getByRole('combobox', { name: 'Step 1 template' }).click();
    const tplSearch = page.getByPlaceholder('Search…');
    await tplSearch.fill('zzzz-no-such-template');
    await expect(page.getByText('No matches found.')).toBeVisible();
    await tplSearch.fill(`Seq Template ${RUN}`);
    await page.getByRole('option').filter({ hasText: template.name }).click();
    await expect(dialog.getByRole('combobox', { name: 'Step 1 template' })).toContainText(template.name);

    await dialog.getByRole('button', { name: 'Add Step' }).click();
    await expect(dialog.getByTestId('sequence-step')).toHaveCount(2);
    await pick(page, dialog.getByRole('combobox', { name: 'Step 2 type' }), 'Call');
    await dialog.getByLabel('Step 2 day').fill('3');
    await dialog.getByLabel('Step 2 notes').fill('Call to confirm interest');

    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expectToast(page, 'Sequence created');
    await expect(dialog).toBeHidden();

    // List shows name, trigger, step count and status.
    await expect(row(SEQ_NAME)).toBeVisible();
    await expect(row(SEQ_NAME)).toContainText('Qualified');
    await expect(row(SEQ_NAME)).toContainText('(2)');
    await expect(row(SEQ_NAME)).toContainText('Active');

    const created = ((await settingsGet('follow-up-sequences')) as any[]).find((s) => s.name === SEQ_NAME);
    expect(created).toBeTruthy();
    expect(created.triggerStatus).toBe('qualified');
    expect(created.steps).toEqual([
      { day: 0, type: 'email', notes: 'Send the welcome pack', templateId: template.id },
      { day: 3, type: 'call', notes: 'Call to confirm interest' },
    ]);

    // Row actions appear on hover; edit form is pre-filled with every value.
    await row(SEQ_NAME).hover();
    await row(SEQ_NAME).getByRole('button', { name: 'Edit' }).click();
    await expect(dialog.getByText('Edit Sequence')).toBeVisible();
    await expect(dialog.locator('#seqName')).toHaveValue(SEQ_NAME);
    await expect(dialog.locator('#seqTrigger')).toContainText('Qualified');
    await expect(dialog.getByRole('switch')).toBeChecked();
    await expect(dialog.getByTestId('sequence-step')).toHaveCount(2);
    await expect(dialog.getByRole('combobox', { name: 'Step 1 type' })).toContainText('Email');
    await expect(dialog.getByLabel('Step 1 day')).toHaveValue('0');
    await expect(dialog.getByLabel('Step 1 notes')).toHaveValue('Send the welcome pack');
    await expect(dialog.getByRole('combobox', { name: 'Step 1 template' })).toContainText(template.name);
    await expect(dialog.getByRole('combobox', { name: 'Step 2 type' })).toContainText('Call');
    await expect(dialog.getByLabel('Step 2 day')).toHaveValue('3');
    await expect(dialog.getByLabel('Step 2 notes')).toHaveValue('Call to confirm interest');

    // Edit and persist: rename, move step 2, switch its type.
    await dialog.locator('#seqName').fill(SEQ_RENAMED);
    await dialog.getByLabel('Step 2 day').fill('5');
    await pick(page, dialog.getByRole('combobox', { name: 'Step 2 type' }), 'WhatsApp');
    await dialog.getByRole('button', { name: 'Update', exact: true }).click();
    await expectToast(page, 'Sequence updated');
    await expect(row(SEQ_RENAMED)).toBeVisible();
    await expect(page.getByRole('cell', { name: SEQ_NAME, exact: true })).toHaveCount(0);

    const updated = ((await settingsGet('follow-up-sequences')) as any[]).find((s) => s.id === created.id);
    expect(updated.name).toBe(SEQ_RENAMED);
    expect(updated.steps[1]).toMatchObject({ day: 5, type: 'whatsapp' });
    expect(updated.steps[0].templateId).toBe(template.id);

    // Search narrows the list; no match renders the empty state.
    const searchBox = page.getByPlaceholder('Search sequences…');
    await searchBox.fill('zzzz-no-such-sequence');
    await expect(page.getByText('No follow-up sequences configured')).toBeVisible();
    await expect(row(SEQ_RENAMED)).toHaveCount(0);
    await searchBox.fill(String(RUN));
    await expect(row(SEQ_RENAMED)).toBeVisible();
    await searchBox.fill('qualified');
    await expect(row(SEQ_RENAMED)).toBeVisible();
    await searchBox.fill('');

    // Disable, then verify the status flips in the list and the API.
    await row(SEQ_RENAMED).hover();
    await row(SEQ_RENAMED).getByRole('button', { name: 'Disable' }).click();
    await expectToast(page, 'Sequence disabled');
    await expect(row(SEQ_RENAMED)).toContainText('Disabled');
    expect(((await settingsGet('follow-up-sequences')) as any[]).find((s) => s.id === created.id).isActive).toBe(0);

    // Export downloads a non-empty CSV containing the row.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('followup-sequences.csv');
    const fs = await import('node:fs/promises');
    const csv = await fs.readFile((await download.path())!, 'utf8');
    expect(csv.length).toBeGreaterThan(0);
    expect(csv).toContain('Name,Trigger,Steps,Status');
    expect(csv).toContain(SEQ_RENAMED);

    // Delete: row disappears and the API no longer returns it.
    await row(SEQ_RENAMED).hover();
    await row(SEQ_RENAMED).getByRole('button', { name: 'Delete' }).click();
    await expectToast(page, 'Sequence deleted');
    await expect(row(SEQ_RENAMED)).toHaveCount(0);
    expect(((await settingsGet('follow-up-sequences')) as any[]).some((s) => s.id === created.id)).toBe(false);

    await expectNoDirectMessagingLinks(page);
  });
});
