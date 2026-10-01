/**
 * Suppliers — full E2E round trip.
 *
 * Replaces 08-suppliers.spec.ts and 12-m12-suppliers.spec.ts.
 *
 *   A. Create via form (every field) → list → drawer → detail → edit prefill → edit → delete
 *   B. Form components (PhoneInput country picker, enums, status, preferred switch, no raw IDs)
 *   C. List UX (columns, search, category/status/preferred filters, hover actions, empty state,
 *      infinite scroll, export, row-action delete, bulk delete)
 *   D. Detail (stats, related tabs, record payment, rate cards, ledger, documents, prefer toggle)
 *   E. Communication Hub (SendMessageDialog, no mailto:/wa.me/tel:)
 *   F. Rate comparison
 *   G. Sidebar navigation + API schema
 */

import { test, expect, type Page } from '@playwright/test';
import { waitForLoad } from './helpers/auth';
import { api, seedSupplier } from './helpers/api-seed';

const RUN = Date.now().toString(36);

async function goToSuppliers(page: Page) {
  await page.goto('/suppliers');
  await waitForLoad(page);
  await expect(page.getByRole('heading', { name: 'Suppliers' }).first()).toBeVisible({ timeout: 15_000 });
}

async function searchList(page: Page, term: string) {
  const search = page.getByPlaceholder(/search suppliers/i).first();
  await search.fill(term);
  await page.waitForTimeout(700); // 300ms debounce + fetch
  await waitForLoad(page);
}

function rowFor(page: Page, text: string) {
  return page.locator('tbody tr', { hasText: text }).first();
}

async function pickOption(page: Page, trigger: ReturnType<Page['locator']>, name: RegExp | string) {
  await trigger.click();
  await page.getByRole('option', { name }).first().click();
}

async function expectNoErrorToast(page: Page) {
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
}

async function openDetailTab(page: Page, name: RegExp) {
  await page.getByRole('tab', { name }).click();
  await waitForLoad(page);
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Full CRUD round trip through the UI
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suppliers: CRUD round trip', () => {
  test('create with every field → list → drawer → detail → edit prefill → edit → delete', async ({ page }) => {
    const data = {
      companyName: `Full Supplier ${RUN}`,
      contactPerson: `Contact ${RUN}`,
      phone: '9876501234',
      email: `full-${RUN}@test.com`,
      website: `https://full-${RUN}.example.com`,
      address: `12 Marine Drive ${RUN}`,
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '400001',
      gstNumber: '22AAAAA1234A1Z5',
      taxId: `PAN${RUN.toUpperCase().slice(0, 6)}`,
      notes: `Full notes ${RUN}`,
    };

    // ── CREATE ──
    await page.goto('/suppliers/new');
    await waitForLoad(page);

    await page.locator('#companyName').fill(data.companyName);
    await pickOption(page, page.locator('#category'), /^Guide$/);
    await page.locator('#contactPerson').fill(data.contactPerson);

    // PhoneInput: choose +971 from the country picker, then type the number
    const phoneRow = page.locator('input[type="tel"]');
    await page.locator('button[role="combobox"]').filter({ hasText: '+91' }).click();
    await page.getByPlaceholder('Search country...').fill('UAE');
    await page.getByRole('option', { name: /UAE/ }).click();
    await phoneRow.fill(data.phone);

    await page.locator('#email').fill(data.email);
    await page.locator('#website').fill(data.website);
    await pickOption(page, page.locator('#status'), /^Active$/);
    await page.getByRole('switch').click(); // Preferred Supplier

    await page.getByPlaceholder('Start typing an address...').fill(data.address);
    await page.locator('#city').fill(data.city);
    await page.locator('#state').fill(data.state);
    await page.locator('#country').fill(data.country);
    await page.locator('#postalCode').fill(data.postalCode);
    await page.locator('#gstNumber').fill(data.gstNumber);
    await page.locator('#taxId').fill(data.taxId);
    await page.locator('#notes').fill(data.notes);

    await page.getByRole('button', { name: /save supplier/i }).click();
    await page.waitForURL(/\/suppliers$/, { timeout: 15_000 });
    await expectNoErrorToast(page);

    // ── LIST shows every list-visible value ──
    await waitForLoad(page);
    await searchList(page, data.companyName);
    const row = rowFor(page, data.companyName);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(/guide/i);
    await expect(row).toContainText(data.contactPerson);
    await expect(row).toContainText(data.email);
    await expect(row).toContainText('+971');
    await expect(row).toContainText(data.phone);
    await expect(row).toContainText(/active/i);
    await expect(row.getByLabel('Preferred')).toBeVisible();
    const rowText = await row.textContent();
    expect(rowText).not.toMatch(/undefined|NaN|null/);

    // ── DRAWER (row click) ──
    await row.click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    await expect(drawer).toContainText(data.companyName);
    await expect(drawer).toContainText(data.contactPerson);
    await expect(drawer).toContainText(data.email);
    await expect(drawer).toContainText(data.phone);
    await expect(drawer).toContainText('Preferred');
    await drawer.getByRole('button', { name: /full profile/i }).click();
    await page.waitForURL(/\/suppliers\/(?!new)[\w-]+$/, { timeout: 10_000 });
    await waitForLoad(page);
    const detailUrl = page.url();

    // ── DETAIL shows every value ──
    await expect(page.getByRole('heading', { name: data.companyName })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('guide', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Preferred').first()).toBeVisible();
    const main = page.locator('main').first();
    for (const v of [
      data.contactPerson, data.email, data.phone, '+971', data.website,
      data.address, data.city, data.state, data.country, data.postalCode,
      data.gstNumber, data.taxId, data.notes,
    ]) {
      await expect(main.getByText(v).first()).toBeVisible({ timeout: 10_000 });
    }
    const detailText = (await main.textContent()) ?? '';
    expect(detailText).not.toMatch(/undefined|NaN|Invalid Date/);

    // ── EDIT prefill ──
    await page.goto(`${detailUrl}/edit`);
    await waitForLoad(page);
    await expect(page.locator('#companyName')).toHaveValue(data.companyName, { timeout: 10_000 });
    await expect(page.locator('#category')).toContainText('Guide');
    await expect(page.locator('#contactPerson')).toHaveValue(data.contactPerson);
    await expect(page.locator('button[role="combobox"]').filter({ hasText: '+971' })).toBeVisible();
    await expect(page.locator('input[type="tel"]')).toHaveValue(data.phone);
    await expect(page.locator('#email')).toHaveValue(data.email);
    await expect(page.locator('#website')).toHaveValue(data.website);
    await expect(page.locator('#status')).toContainText('Active');
    await expect(page.getByRole('switch')).toBeChecked();
    await expect(page.getByPlaceholder('Start typing an address...')).toHaveValue(data.address);
    await expect(page.locator('#city')).toHaveValue(data.city);
    await expect(page.locator('#state')).toHaveValue(data.state);
    await expect(page.locator('#country')).toHaveValue(data.country);
    await expect(page.locator('#postalCode')).toHaveValue(data.postalCode);
    await expect(page.locator('#gstNumber')).toHaveValue(data.gstNumber);
    await expect(page.locator('#taxId')).toHaveValue(data.taxId);
    await expect(page.locator('#notes')).toHaveValue(data.notes);

    // ── EDIT: rename, deactivate, new notes ──
    const renamed = `${data.companyName} Renamed`;
    await page.locator('#companyName').fill(renamed);
    await pickOption(page, page.locator('#status'), /^Inactive$/);
    await page.locator('#notes').fill(`Updated notes ${RUN}`);
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForURL(/\/suppliers\/(?!new)[\w-]+$/, { timeout: 15_000 });
    await expectNoErrorToast(page);
    await expect(page.getByRole('heading', { name: renamed })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`Updated notes ${RUN}`).first()).toBeVisible();
    await expect(page.getByText('inactive').first()).toBeVisible();

    // persisted: reload and re-check
    await page.reload();
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: renamed })).toBeVisible({ timeout: 10_000 });

    // ── DELETE from detail ──
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: /delete/i }).click();
    const confirmDialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await expect(confirmDialog.first()).toBeVisible({ timeout: 5_000 });
    await confirmDialog.first().getByRole('button', { name: /^delete$/i }).click();
    await page.waitForURL(/\/suppliers$/, { timeout: 15_000 });

    await searchList(page, data.companyName);
    await expect(page.getByText(renamed)).toHaveCount(0);
  });

  test('form validation: name required and invalid email rejected', async ({ page }) => {
    await page.goto('/suppliers/new');
    await waitForLoad(page);
    await page.getByRole('button', { name: /save supplier/i }).click();
    await expect(page.getByText(/supplier name is required/i)).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/suppliers\/new$/);

    await page.locator('#gstNumber').fill('BADGST');
    await page.getByRole('button', { name: /save supplier/i }).click();
    await expect(page.getByText(/valid 15-character GST/i)).toBeVisible({ timeout: 5_000 });
    await page.locator('#gstNumber').fill('');
    await page.locator('#companyName').fill(`Invalid Email ${RUN}`);
    await page.locator('#email').fill('not-an-email');
    await page.getByRole('button', { name: /save supplier/i }).click();
    await expect(page).toHaveURL(/\/suppliers\/new$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Form components
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suppliers: form components', () => {
  test('PhoneInput, category enum, status, preferred switch; no raw ID inputs', async ({ page }) => {
    await page.goto('/suppliers/new');
    await waitForLoad(page);

    // PhoneInput: country-code combobox next to a tel input
    await expect(page.locator('button[role="combobox"]').filter({ hasText: '+91' })).toBeVisible();
    await expect(page.locator('input[type="tel"]')).toBeVisible();

    // Category enum — correct values present, old wrong values absent
    await page.locator('#category').click();
    for (const label of ['Hotel', 'Airline', 'Transport', 'Activity Provider', 'Guide', 'Visa Agent', 'Insurance']) {
      await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible();
    }
    for (const bad of [/^visa$/i, /^resort$/i, /^ota$/i]) {
      await expect(page.getByRole('option', { name: bad })).toHaveCount(0);
    }
    await page.keyboard.press('Escape');

    // Status
    await page.locator('#status').click();
    await expect(page.getByRole('option', { name: 'Active', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Inactive', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    // Preferred switch toggles its helper text
    await expect(page.getByText('Not preferred')).toBeVisible();
    await page.getByRole('switch').click();
    await expect(page.getByText('Marked as preferred')).toBeVisible();

    // Country-code combobox filters as you type
    await page.locator('button[role="combobox"]').filter({ hasText: '+91' }).click();
    const countrySearch = page.getByPlaceholder('Search country...');
    await countrySearch.fill('Thai');
    await expect(page.getByRole('option', { name: /Thailand/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Germany/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // No raw ID inputs anywhere on the form
    await expect(page.locator('input[name*="Id" i]:not(#taxId), input[id*="Id" i]:not(#taxId)')).toHaveCount(0);
    await expect(page.getByPlaceholder(/enter.*\bid\b/i)).toHaveCount(0);
  });

  test('edit form pre-fills seeded values with no "undefined"', async ({ page }) => {
    const supplier = await seedSupplier({
      companyName: `EditPrefill ${RUN}`,
      contactPerson: `Prefill ${RUN}`,
      email: `prefill-${RUN}@test.com`,
      city: 'Goa',
      state: 'Goa',
      gstNumber: '30AAAAA1111A1Z5',
    });
    expect(supplier?.id).toBeTruthy();

    await page.goto(`/suppliers/${supplier.id}/edit`);
    await waitForLoad(page);
    await expect(page.locator('#companyName')).toHaveValue(`EditPrefill ${RUN}`, { timeout: 10_000 });
    await expect(page.locator('#contactPerson')).toHaveValue(`Prefill ${RUN}`);
    await expect(page.locator('#email')).toHaveValue(`prefill-${RUN}@test.com`);
    await expect(page.locator('#city')).toHaveValue('Goa');
    await expect(page.locator('#state')).toHaveValue('Goa');
    await expect(page.locator('#gstNumber')).toHaveValue('30AAAAA1111A1Z5');

    const inputs = page.locator('input');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      expect(await inputs.nth(i).inputValue()).not.toBe('undefined');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. List page UX
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suppliers: list page', () => {
  test('header, Add Supplier, columns, search placeholder, no undefined/NaN', async ({ page }) => {
    const name = `ListRender ${RUN}`;
    await seedSupplier({ companyName: name });
    await goToSuppliers(page);

    await expect(page.getByRole('button', { name: /add supplier/i }).first()).toBeVisible();
    await expect(page.getByPlaceholder('Search suppliers...')).toBeVisible();

    for (const col of ['Company', 'Category', 'Contact Person', 'Email', 'Phone', 'Rating', 'Status']) {
      await expect(page.getByRole('columnheader', { name: new RegExp(col, 'i') })).toBeVisible();
    }

    await searchList(page, name);
    const row = rowFor(page, name);
    await expect(row).toBeVisible({ timeout: 10_000 });
    const text = await row.textContent();
    expect(text).not.toMatch(/undefined|NaN/);

    await page.getByRole('button', { name: /add supplier/i }).first().click();
    await page.waitForURL(/\/suppliers\/new$/);
  });

  test('search narrows results to the matching supplier only', async ({ page }) => {
    const hit = `SearchHit ${RUN}`;
    const miss = `SearchMiss ${RUN}`;
    await seedSupplier({ companyName: hit });
    await seedSupplier({ companyName: miss });
    await goToSuppliers(page);

    await searchList(page, hit);
    await expect(rowFor(page, hit)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tbody tr', { hasText: miss })).toHaveCount(0);
  });

  test('category, status and preferred filters actually narrow the list', async ({ page }) => {
    const tag = `Filt${RUN}`;
    const hotel = await seedSupplier({ companyName: `${tag} Hotel`, category: 'hotel' });
    const guide = await seedSupplier({ companyName: `${tag} Guide`, category: 'guide' });
    const inactive = await seedSupplier({ companyName: `${tag} Inactive`, category: 'hotel' });
    expect(hotel?.id && guide?.id && inactive?.id).toBeTruthy();
    await api('PUT', `/suppliers/${inactive.id}`, { status: 'inactive' });
    await api('POST', `/suppliers/${guide.id}/toggle-preferred`, { isPreferred: true });

    await goToSuppliers(page);
    await searchList(page, tag);
    await expect(page.locator('tbody tr')).toHaveCount(3);

    // Category
    await page.getByRole('combobox').filter({ hasText: /all categories/i }).click();
    for (const label of ['Hotel', 'Guide', 'Visa Agent', 'Activity Provider']) {
      await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible();
    }
    for (const bad of [/^ota$/i, /^resort$/i, /^visa$/i]) {
      await expect(page.getByRole('option', { name: bad })).toHaveCount(0);
    }
    await page.getByRole('option', { name: 'Guide', exact: true }).click();
    await waitForLoad(page);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(rowFor(page, `${tag} Guide`)).toBeVisible();

    // Active filter chip + removal
    await expect(page.getByText('Category:')).toBeVisible();
    await page.getByRole('combobox').filter({ hasText: /guide/i }).click();
    await page.getByRole('option', { name: 'All Categories' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(3);

    // Status
    await page.getByRole('combobox').filter({ hasText: /all status/i }).click();
    await expect(page.getByRole('option', { name: 'Active', exact: true })).toBeVisible();
    await page.getByRole('option', { name: 'Inactive', exact: true }).click();
    await waitForLoad(page);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(rowFor(page, `${tag} Inactive`)).toBeVisible();
    await page.getByRole('combobox').filter({ hasText: /inactive/i }).click();
    await page.getByRole('option', { name: 'All Status' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(3);

    // Preferred
    await page.getByRole('button', { name: /^preferred$/i }).click();
    await waitForLoad(page);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(rowFor(page, `${tag} Guide`)).toBeVisible();
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await goToSuppliers(page);
    await searchList(page, `ABSOLUTELY_NO_MATCH_${RUN}`);
    await expect(page.getByText('No suppliers yet')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tbody tr[class*="cursor"]')).toHaveCount(0);
  });

  test('hover actions: View, Edit, Delete (and Call) appear and navigate', async ({ page }) => {
    const name = `Hover ${RUN}`;
    const s = await seedSupplier({ companyName: name });
    await goToSuppliers(page);
    await searchList(page, name);

    const row = rowFor(page, name);
    await row.hover();
    await expect(row.getByRole('button', { name: 'View' })).toBeVisible({ timeout: 5_000 });
    await expect(row.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Delete' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Call' })).toBeVisible();

    await row.getByRole('button', { name: 'View' }).click();
    await page.waitForURL(new RegExp(`/suppliers/${s.id}$`));

    await goToSuppliers(page);
    await searchList(page, name);
    await rowFor(page, name).hover();
    await rowFor(page, name).getByRole('button', { name: 'Edit' }).click();
    await page.waitForURL(new RegExp(`/suppliers/${s.id}/edit$`));
  });

  test('delete via row action removes the supplier', async ({ page }) => {
    const name = `RowDelete ${RUN}`;
    await seedSupplier({ companyName: name });
    await goToSuppliers(page);
    await searchList(page, name);

    const row = rowFor(page, name);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    page.once('dialog', (d) => d.accept());
    await row.getByRole('button', { name: 'Delete' }).click();

    await expect(page.locator('tbody tr', { hasText: name })).toHaveCount(0, { timeout: 10_000 });
    await expectNoErrorToast(page);
  });

  test('bulk select + Delete removes several suppliers', async ({ page }) => {
    const tag = `Bulk ${RUN}`;
    await seedSupplier({ companyName: `${tag} A` });
    await seedSupplier({ companyName: `${tag} B` });
    await goToSuppliers(page);
    await searchList(page, tag);
    await expect(page.locator('tbody tr')).toHaveCount(2);

    await page.getByLabel('Select all rows').check();
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.getByText('2 selected').locator('xpath=..').getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('tbody tr', { hasText: tag })).toHaveCount(0, { timeout: 10_000 });
  });

  test('infinite scroll loads more rows when scrolled', async ({ page }) => {
    const tag = `Scroll${RUN}`;
    for (let i = 0; i < 25; i++) {
      await seedSupplier({ companyName: `${tag} ${String(i).padStart(2, '0')}` });
    }
    await goToSuppliers(page);
    await searchList(page, tag);

    const rows = page.locator('tbody tr[class*="cursor"], tbody tr:has(td)').filter({ hasText: tag });
    await expect(rows).toHaveCount(20, { timeout: 10_000 });

    // the sentinel is the element right after the table's scroll wrapper
    await page.locator('div.justify-center.py-ds-4').last().scrollIntoViewIfNeeded();
    await expect(rows).toHaveCount(25, { timeout: 10_000 });
  });

  test('export downloads a non-empty CSV containing the data', async ({ page }) => {
    const name = `Export ${RUN}`;
    await seedSupplier({ companyName: name, contactPerson: `Exporter ${RUN}` });
    await goToSuppliers(page);
    await searchList(page, name);
    await expect(rowFor(page, name)).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: 'Export' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^suppliers-.*\.csv$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks).toString('utf8');
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain('Company,Category,Contact Person,Email,Phone,Rating,Status,Preferred');
    expect(body).toContain(name);
    expect(body).toContain(`Exporter ${RUN}`);
  });

  test('skeleton/loading resolves into rows or empty state', async ({ page }) => {
    await goToSuppliers(page);
    await waitForLoad(page);
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Detail page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suppliers: detail page', () => {
  test('stats, tabs and overview sections render without undefined', async ({ page }) => {
    const name = `DetailTabs ${RUN}`;
    const s = await seedSupplier({ companyName: name, contactPerson: `Person ${RUN}`, notes: `Note ${RUN}` });
    await page.goto(`/suppliers/${s.id}`);
    await waitForLoad(page);

    await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('tab', { name: /overview/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /related/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /documents/i })).toBeVisible();

    for (const label of ['Total Payments', 'Outstanding', 'Rating', 'Rate Cards']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText('Contact Information')).toBeVisible();
    await expect(page.getByText('Business Details')).toBeVisible();
    await expect(page.getByText(`Person ${RUN}`)).toBeVisible();
    await expect(page.getByText(`Note ${RUN}`)).toBeVisible();

    const text = (await page.locator('main').first().textContent()) ?? '';
    expect(text).not.toMatch(/undefined|NaN|Invalid Date/);
    expect((await page.getByRole('heading').first().textContent())?.trim()).not.toBe('Unknown');
  });

  test('Prefer / Unprefer toggles and persists', async ({ page }) => {
    const s = await seedSupplier({ companyName: `Prefer ${RUN}` });
    await page.goto(`/suppliers/${s.id}`);
    await waitForLoad(page);

    await page.getByRole('button', { name: /^prefer$/i }).click();
    await expect(page.getByRole('button', { name: /^unprefer$/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Preferred').first()).toBeVisible();

    await page.reload();
    await waitForLoad(page);
    await expect(page.getByRole('button', { name: /^unprefer$/i })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /^unprefer$/i }).click();
    await expect(page.getByRole('button', { name: /^prefer$/i })).toBeVisible({ timeout: 10_000 });
  });

  test('record a payment → appears in Payments list and updates totals', async ({ page }) => {
    const s = await seedSupplier({ companyName: `Pay ${RUN}` });
    await page.goto(`/suppliers/${s.id}`);
    await waitForLoad(page);
    await openDetailTab(page, /related/i);

    await expect(page.getByText('No payments recorded.')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /record payment/i }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/amount/i).first()).toBeVisible();
    await expect(dialog.getByText(/payment date/i).first()).toBeVisible();
    await expect(dialog.getByText(/method/i).first()).toBeVisible();

    // validation: empty amount is rejected and the dialog stays open
    await dialog.getByRole('button', { name: /record payment/i }).click();
    await expect(dialog).toBeVisible();

    await dialog.locator('input').first().fill('12500');
    await pickOption(page, dialog.getByRole('combobox').last(), /^UPI$/);
    await dialog.getByPlaceholder('Transaction / cheque number').fill(`REF-${RUN}`);
    await dialog.getByPlaceholder('Optional notes...').fill('E2E payment');
    await dialog.getByRole('button', { name: /record payment/i }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText('Payments (1)')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`REF-${RUN}`)).toBeVisible();
    await expect(page.getByText(/12,500/).first()).toBeVisible();
    await expect(page.getByText('upi', { exact: true }).first()).toBeVisible();

    // Ledger section renders without junk values
    await expect(page.getByText('Ledger', { exact: true }).first()).toBeVisible();
    const related = (await page.locator('[role="tabpanel"]:visible').first().textContent()) ?? '';
    expect(related).not.toMatch(/undefined|NaN/);
  });

  test('Related tab: rate cards, payments and ledger sections with Add Rate Card link', async ({ page }) => {
    const s = await seedSupplier({ companyName: `Related ${RUN}` });
    const rc = await api('POST', `/suppliers/${s.id}/rate-cards`, {
      service_type: 'Standard Room',
      destination: `RelDest${RUN}`,
      name: `Related Rate ${RUN}`,
      season: 'peak',
      cost_price: 4200,
      unit: 'per_night',
      valid_from: '2026-01-01',
      valid_to: '2026-12-31',
    });
    expect(rc?.error).toBeUndefined();

    await page.goto(`/suppliers/${s.id}`);
    await waitForLoad(page);
    await openDetailTab(page, /related/i);

    await expect(page.getByText(/Rate Cards \(\d+\)/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(`Related Rate ${RUN}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Payments \(\d+\)/)).toBeVisible();
    await expect(page.getByText('Ledger', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: /add rate card/i }).first().click();
    await page.waitForURL(new RegExp(`/rate-cards/new\\?.*supplierId=${s.id}`), { timeout: 10_000 });
  });

  test('Documents tab shows an upload dropzone and empty state', async ({ page }) => {
    const s = await seedSupplier({ companyName: `Docs ${RUN}` });
    await page.goto(`/suppliers/${s.id}`);
    await waitForLoad(page);
    await openDetailTab(page, /documents/i);

    await expect(page.getByText(/upload document/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No documents uploaded yet.')).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: `contract-${RUN}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from('E2E contract'),
    });
    await expect(page.getByText(`contract-${RUN}.txt`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No documents uploaded yet.')).toHaveCount(0);

    await page.getByRole('row', { name: new RegExp(`contract-${RUN}`) }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(`contract-${RUN}.txt`)).toHaveCount(0);
  });

  test('missing supplier shows a friendly error with a way back', async ({ page }) => {
    await page.goto('/suppliers/00000000-0000-7000-8000-00000000dead');
    await expect(page.getByText('Failed to load supplier')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /back to suppliers/i }).click();
    await page.waitForURL(/\/suppliers$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Communication Hub
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suppliers: communication', () => {
  async function expectNoRawLinks(page: Page) {
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
    expect(await page.locator('a[href*="wa.me"]').count()).toBe(0);
    expect(await page.locator('a[href^="tel:"]').count()).toBe(0);
  }

  test('detail "Send message" opens SendMessageDialog; no mailto/wa.me/tel links', async ({ page }) => {
    const s = await seedSupplier({
      companyName: `Msg ${RUN}`,
      email: `msg-${RUN}@test.com`,
      phone: '+91 9876543210',
    });
    await page.goto(`/suppliers/${s.id}`);
    await waitForLoad(page);
    await expectNoRawLinks(page);

    await page.getByRole('button', { name: /send message/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog).toContainText(/email|whatsapp|sms|channel/i);
    await expectNoRawLinks(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('list drawer "Email" opens SendMessageDialog; Call routes through the dialer', async ({ page }) => {
    const name = `DrawerMsg ${RUN}`;
    await seedSupplier({ companyName: name, email: `drawer-${RUN}@test.com`, phone: '+91 9876543211' });
    await goToSuppliers(page);
    await searchList(page, name);
    await rowFor(page, name).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expectNoRawLinks(page);

    await drawer.getByRole('button', { name: /^email$/i }).click();
    await expect(page.getByRole('dialog').filter({ hasText: /email|channel|template|compose/i }).last()).toBeVisible({ timeout: 5_000 });
    await expectNoRawLinks(page);
    await page.keyboard.press('Escape');

    await drawer.getByRole('button', { name: /^call$/i }).click();
    await page.waitForURL(/\/communication\/calls\/dial\?phone=/, { timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Rate comparison
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suppliers: rate comparison', () => {
  test('form fields, season options and enable/disable of Compare Rates', async ({ page }) => {
    await page.goto('/suppliers/compare');
    await waitForLoad(page);

    await expect(page.getByRole('heading', { name: /compare supplier rates/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/service type/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/goa, maldives/i)).toBeVisible();
    await expect(page.getByText('Season', { exact: true })).toBeVisible();
    await expect(page.getByText(/travel date/i).first()).toBeVisible();

    const compareBtn = page.getByRole('button', { name: /compare rates/i });
    await expect(compareBtn).toBeDisabled();

    await page.getByRole('combobox').filter({ hasText: /any season/i }).click();
    for (const label of ['Peak Season', 'Off Peak', 'Shoulder Season', 'Monsoon']) {
      await expect(page.getByRole('option', { name: label })).toBeVisible();
    }
    await page.keyboard.press('Escape');

    await pickOption(page, page.getByRole('combobox').filter({ hasText: /select service type/i }), 'Standard Room');
    await expect(compareBtn).toBeDisabled();
    await page.getByPlaceholder(/goa, maldives/i).fill('Goa');
    await expect(compareBtn).toBeEnabled();
  });

  test('no matching rates shows the "No rates found" empty state', async ({ page }) => {
    await page.goto('/suppliers/compare');
    await waitForLoad(page);
    await pickOption(page, page.getByRole('combobox').filter({ hasText: /select service type/i }), 'Standard Room');
    await page.getByPlaceholder(/goa, maldives/i).fill(`Nowhere${RUN}`);
    await page.getByRole('button', { name: /compare rates/i }).click();

    await expect(page.getByText('Rate Comparison Results')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No rates found')).toBeVisible();
    await expectNoErrorToast(page);
  });

  test('compares seeded rate cards, ranks cheapest first and navigates to the supplier', async ({ page }) => {
    const dest = `Cmp${RUN}`;
    const cheap = await seedSupplier({ companyName: `Cheap ${RUN}`, category: 'hotel' });
    const pricey = await seedSupplier({ companyName: `Pricey ${RUN}`, category: 'hotel' });
    for (const [sup, price] of [[cheap, 3000], [pricey, 6000]] as const) {
      const res = await api('POST', `/suppliers/${sup.id}/rate-cards`, {
        service_type: 'Standard Room',
        destination: dest,
        name: `Std ${price}`,
        season: 'peak',
        cost_price: price,
        unit: 'per_night',
        valid_from: '2026-01-01',
        valid_to: '2027-12-31',
      });
      expect(res?.error).toBeUndefined();
    }

    await page.goto('/suppliers/compare');
    await waitForLoad(page);
    await pickOption(page, page.getByRole('combobox').filter({ hasText: /select service type/i }), 'Standard Room');
    await page.getByPlaceholder(/goa, maldives/i).fill(dest);
    await pickOption(page, page.getByRole('combobox').filter({ hasText: /any season/i }), 'Peak Season');
    await page.getByRole('button', { name: /compare rates/i }).click();

    await expect(page.getByText('Rate Comparison Results')).toBeVisible({ timeout: 10_000 });
    await expectNoErrorToast(page);
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2, { timeout: 10_000 });
    await expect(rows.first()).toContainText(`Cheap ${RUN}`);
    await expect(rows.first()).toContainText('Best Rate');
    await expect(rows.first()).toContainText('3,000');
    await expect(rows.last()).toContainText(`Pricey ${RUN}`);
    await expect(rows.last()).toContainText('6,000');
    await expect(page.getByText('2 suppliers')).toBeVisible();

    await rows.first().click();
    await page.waitForURL(new RegExp(`/suppliers/${cheap.id}$`), { timeout: 10_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. Sidebar + API schema
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Suppliers: navigation and API', () => {
  test('sidebar Suppliers and Rate Comparison links navigate', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);

    const suppliersLink = page.locator('aside a[href="/suppliers"]').first();
    await expect(suppliersLink).toBeVisible({ timeout: 10_000 });
    await suppliersLink.click();
    await page.waitForURL('**/suppliers', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Suppliers' }).first()).toBeVisible({ timeout: 10_000 });

    const compareLink = page.locator('aside a[href="/suppliers/compare"]').first();
    await expect(compareLink).toBeVisible({ timeout: 10_000 });
    await compareLink.click();
    await page.waitForURL('**/suppliers/compare', { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /compare supplier rates/i })).toBeVisible({ timeout: 10_000 });
  });

  test('API returns the expected supplier schema', async () => {
    const supplier = await seedSupplier({ companyName: `Schema ${RUN}`, category: 'hotel' });
    expect(supplier?.id).toBeTruthy();
    expect(supplier.company_name ?? supplier.companyName).toBe(`Schema ${RUN}`);
    expect(supplier.category).toBe('hotel');
    expect(supplier.voucherNumber).toBeUndefined();
  });
});
