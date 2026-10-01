import { test, expect, type Page } from '@playwright/test';
import { waitForLoad, navigateTo } from './helpers/auth';
import { api, seedRateCard, seedSupplier } from './helpers/api-seed';

const RAW_MESSAGING_ANCHORS = 'a[href^="tel:"], a[href^="mailto:"], a[href^="https://wa.me"], a[href^="wa.me"]';

async function searchList(page: Page, term: string) {
  await page.getByPlaceholder(/Search rate cards/i).fill(term);
  await page.waitForTimeout(800);
  await waitForLoad(page);
}

function rowFor(page: Page, text: string) {
  return page.locator(`table tbody tr:has-text("${text}")`).first();
}

async function pickOption(page: Page, triggerSelector: string, optionName: string) {
  await page.locator(triggerSelector).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

/** Select-all then type, as a user would; CurrencyInput swaps its display text on focus. */
async function setNumber(page: Page, selector: string, value: string) {
  const input = page.locator(selector);
  await input.click();
  await input.press('Control+A');
  await input.pressSequentially(value);
  await input.blur();
}

/** Opens the first still-unset "Pick a date" trigger, advances N months, clicks the day. */
async function pickDate(page: Page, monthsForward: number, day: string) {
  await page.locator('button:has-text("Pick a date")').first().click();
  const calendar = page.locator('.w-\\[280px\\]').last();
  const nextMonthBtn = calendar.locator('> div').first().getByRole('button').last();
  for (let i = 0; i < monthsForward; i++) {
    // eslint-disable-next-line no-await-in-loop
    await nextMonthBtn.click();
  }
  await calendar.locator('.grid').getByRole('button', { name: day, exact: true }).click();
}

function isoDate(monthsAhead: number, day: number) {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + monthsAhead, day);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    display: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

function supplierTrigger(page: Page) {
  return page.locator('button[role="combobox"]:not([id])').first();
}

/** Suppliers come back as raw snake_case rows. */
async function newSupplier(companyName: string) {
  const sup = await seedSupplier({ companyName });
  expect(sup?.id, JSON.stringify(sup)).toBeTruthy();
  return { id: sup.id as string, companyName };
}

async function getRateCard(id: string) {
  const res = await api('GET', `/rate-cards/${id}`);
  expect(res.success, JSON.stringify(res)).toBe(true);
  return res.data;
}

test.describe('Rate Cards', () => {
  test('full round trip: create via form, list, drawer, edit prefill, edit, delete', async ({ page }) => {
    const ts = Date.now();
    const name = `RT Rate Card ${ts}`;
    const notes = `Seasonal notes ${ts}`;
    const supplier = await newSupplier(`RT Supplier ${ts}`);
    const from = isoDate(1, 10);
    const to = isoDate(2, 20);

    // ── 1. Create through the form, every field filled ──
    await page.goto('/rate-cards');
    await waitForLoad(page);
    await page.getByRole('button', { name: /Add Rate Card/i }).first().click();
    await page.waitForURL('**/rate-cards/new');
    await waitForLoad(page);

    await page.locator('#name').fill(name);
    await pickOption(page, '#serviceType', 'Transport');

    await supplierTrigger(page).click();
    await page.getByPlaceholder(/search suppliers/i).fill(supplier.companyName);
    await page.getByRole('option', { name: new RegExp(supplier.companyName) }).click();

    await pickOption(page, '#season', 'Off Peak');
    await pickOption(page, '#currency', 'EUR');
    await setNumber(page, '#costPrice', '12500');
    await setNumber(page, '#sellingPrice', '18000');
    await pickOption(page, '#unit', 'Per Vehicle');
    await pickDate(page, 1, '10');
    await pickDate(page, 2, '20');
    await page.locator('#description').fill(notes);

    await page.getByRole('button', { name: /^Save$|Create|Save Rate Card/i }).last().click();
    await expect(page.locator('text=Rate card created').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForURL(/\/rate-cards$/, { timeout: 15_000 });
    await waitForLoad(page);

    // ── 2. Every list-visible value appears in the list ──
    await searchList(page, name);
    const row = rowFor(page, name);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(supplier.companyName);
    await expect(row).toContainText(/transport/i);
    await expect(row).toContainText('€18,000');
    await expect(row).toContainText(from.display);
    await expect(row).toContainText(to.display);
    await expect(row).toContainText('Active');
    for (const header of ['Service Name', 'Supplier', 'Category', 'Rate', 'Valid From', 'Valid To', 'Status']) {
      await expect(page.locator('table thead').getByText(header, { exact: true })).toBeVisible();
    }

    // ── 3. Detail drawer shows every value ──
    await row.click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible({ timeout: 5_000 });
    await expect(drawer).toContainText(name);
    await expect(drawer).toContainText(supplier.companyName);
    await expect(drawer).toContainText(/transport/i);
    await expect(drawer).toContainText('€18,000');
    await expect(drawer).toContainText(from.display);
    await expect(drawer).toContainText(to.display);
    await expect(drawer).toContainText(/off peak/i);
    await expect(drawer).toContainText(/per vehicle/i);
    await expect(drawer).toContainText(notes);
    await expect(drawer).toContainText('Active');

    // ── 4. Edit form pre-fills every value ──
    await drawer.getByRole('button', { name: /Edit/i }).click();
    await page.waitForURL(/\/rate-cards\/[^/]+\/edit$/, { timeout: 10_000 });
    await waitForLoad(page);
    const id = page.url().match(/\/rate-cards\/([^/]+)\/edit/)![1]!;
    expect(id).toBeTruthy();

    await expect(page.locator('#name')).toHaveValue(name);
    await expect(page.locator('#serviceType')).toContainText('Transport');
    await expect(supplierTrigger(page)).toContainText(supplier.companyName, { timeout: 10_000 });
    await expect(page.locator('#season')).toContainText('Off Peak');
    await expect(page.locator('#currency')).toContainText('EUR');
    await expect(page.locator('#costPrice')).toHaveValue('12,500');
    await expect(page.locator('#sellingPrice')).toHaveValue('18,000');
    await expect(page.locator('#unit')).toContainText('Per Vehicle');
    await expect(page.getByRole('button', { name: from.display })).toBeVisible();
    await expect(page.getByRole('button', { name: to.display })).toBeVisible();
    await expect(page.locator('#description')).toHaveValue(notes);

    // Persisted under the backend field names, dates not shifted by timezone
    const created = await getRateCard(id);
    expect(created).toMatchObject({
      name,
      serviceType: 'transport',
      supplierId: supplier.id,
      season: 'off_peak',
      currency: 'EUR',
      costPrice: 12500,
      sellingPrice: 18000,
      unit: 'per_vehicle',
      description: notes,
    });
    expect(String(created.validFrom).slice(0, 10)).toBe(from.iso);
    expect(String(created.validTo).slice(0, 10)).toBe(to.iso);

    // ── 5. Edit, save, assert the change persisted ──
    const updatedName = `RT Updated ${ts}`;
    await page.locator('#name').fill(updatedName);
    await pickOption(page, '#serviceType', 'Activity');
    await pickOption(page, '#season', 'Shoulder');
    await setNumber(page, '#sellingPrice', '21000');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.locator('text=Rate card updated').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(/\/rate-cards$/, { timeout: 15_000 });
    await waitForLoad(page);

    const updated = await getRateCard(id);
    expect(updated).toMatchObject({
      name: updatedName,
      serviceType: 'activity',
      season: 'shoulder',
      sellingPrice: 21000,
      costPrice: 12500,
      supplierId: supplier.id,
      unit: 'per_vehicle',
      description: notes,
    });
    expect(String(updated.validFrom).slice(0, 10)).toBe(from.iso);

    await searchList(page, updatedName);
    const updatedRow = rowFor(page, updatedName);
    await expect(updatedRow).toBeVisible({ timeout: 10_000 });
    await expect(updatedRow).toContainText(/activity/i);
    await expect(updatedRow).toContainText('€21,000');

    // ── 6. Delete, assert it is gone without a manual reload ──
    await updatedRow.hover();
    await updatedRow.locator('button[aria-label="Delete"]').click();
    await page.getByRole('dialog').getByRole('button', { name: /^Delete$/ }).click();
    await expect(page.locator('text=Rate card deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${updatedName}")`)).toHaveCount(0, { timeout: 10_000 });
    // Backend delete is a soft deactivate; the list only shows active cards
    expect((await getRateCard(id)).isActive).toBe(false);
  });

  test('required fields are validated and nothing is created', async ({ page }) => {
    await page.goto('/rate-cards/new');
    await waitForLoad(page);
    await page.getByRole('button', { name: /^Save$|Create|Save Rate Card/i }).last().click();
    await expect(page.getByText('Service name is required')).toBeVisible();
    await expect(page.getByText(/Rate is required|Rate must be greater than 0/)).toBeVisible();
    await expect(page).toHaveURL(/\/rate-cards\/new$/);
  });

  test('cancel on the new form creates nothing', async ({ page }) => {
    const name = `Cancelled ${Date.now()}`;
    await page.goto('/rate-cards');
    await waitForLoad(page);
    await page.getByRole('button', { name: /Add Rate Card/i }).first().click();
    await page.waitForURL('**/rate-cards/new');
    await page.locator('#name').fill(name);
    await page.getByRole('button', { name: /^Cancel$/i }).click();
    await page.waitForURL(/\/rate-cards$/, { timeout: 10_000 });
    const list = await api('GET', `/rate-cards?search=${encodeURIComponent(name)}`);
    expect(list.data?.data ?? list.data ?? []).toHaveLength(0);
  });

  test('supplier is a searchable combobox that filters options; no raw ID input; URL param pre-fills it', async ({ page }) => {
    const ts = Date.now();
    const alpha = await newSupplier(`Alpha${ts} Hotels`);
    const beta = await newSupplier(`Beta${ts} Transfers`);

    await page.goto('/rate-cards/new');
    await waitForLoad(page);
    expect(await page.locator('input[name*="supplierId" i], input[placeholder*="supplier id" i]').count()).toBe(0);
    await expect(page.locator('label[for="supplierId"]')).toBeVisible();
    await expect(supplierTrigger(page)).toBeVisible();
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await expect(page.locator('button:has-text("Pick a date")')).toHaveCount(2);
    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);

    await supplierTrigger(page).click();
    const search = page.getByPlaceholder(/search suppliers/i);
    await expect(search).toBeVisible();
    await search.fill(`Alpha${ts}`);
    await expect(page.getByRole('option', { name: new RegExp(`Alpha${ts} Hotels`) })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('option', { name: new RegExp(`Beta${ts}`) })).toHaveCount(0);
    await search.fill(`Beta${ts}`);
    await expect(page.getByRole('option', { name: new RegExp(`Beta${ts} Transfers`) })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('option', { name: new RegExp(`Alpha${ts}`) })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Arriving from a supplier pre-fills the relation
    await page.goto(`/rate-cards/new?supplierId=${beta.id}`);
    await waitForLoad(page);
    await expect(supplierTrigger(page)).toContainText(`Beta${ts} Transfers`, { timeout: 10_000 });
    expect(alpha.id).toBeTruthy();
  });

  test('valid-to date cannot precede valid-from; currency input rejects letters', async ({ page }) => {
    await page.goto('/rate-cards/new');
    await waitForLoad(page);

    await setNumber(page, '#costPrice', 'abc12x');
    await expect(page.locator('#costPrice')).toHaveValue('12');

    await pickDate(page, 2, '20');
    await page.locator('button:has-text("Pick a date")').first().click();
    const calendar = page.locator('.w-\\[280px\\]').last();
    await expect(calendar.locator('.grid').getByRole('button', { name: '10', exact: true })).toBeDisabled();
  });

  test('list shows seeded rate card values, hover Edit opens that rate card', async ({ page }) => {
    const ts = Date.now();
    const supplier = await newSupplier(`Seed Supp ${ts}`);
    const rc = await seedRateCard({
      name: `Seeded RC ${ts}`,
      serviceType: 'hotel',
      supplierId: supplier.id,
      costPrice: 3000,
      sellingPrice: 4500,
    });
    expect(rc.id).toBeTruthy();

    await page.goto('/rate-cards');
    await waitForLoad(page);
    await expect(page.getByPlaceholder(/search rate cards/i)).toBeVisible();
    await searchList(page, rc.name);
    const row = rowFor(page, rc.name);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(supplier.companyName);
    await expect(row).toContainText('₹4,500');
    await expect(row).toContainText('Active');

    await row.hover();
    await row.locator('button[aria-label="Edit"]').click();
    await page.waitForURL(`**/rate-cards/${rc.id}/edit`, { timeout: 10_000 });
    await expect(page.locator('#name')).toHaveValue(rc.name);
    await expect(page.locator('#costPrice')).toHaveValue('3,000');
  });

  test('editing a non-existent rate card shows an error, not a blank form', async ({ page }) => {
    await page.goto('/rate-cards/00000000-0000-7000-8000-00000000dead/edit');
    await waitForLoad(page);
    await expect(page.getByText('Failed to load rate card')).toBeVisible({ timeout: 10_000 });
  });

  test('search narrows the list to matching rate cards', async ({ page }) => {
    const marker = `Srch${Date.now()}`;
    const match = await seedRateCard({ name: `${marker} Match` });
    const other = await seedRateCard({ name: `Unrelated ${Date.now()}` });

    await page.goto('/rate-cards');
    await waitForLoad(page);
    await searchList(page, marker);
    await expect(rowFor(page, match.name)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${other.name}")`)).toHaveCount(0);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop
      await expect(rows.nth(i)).toContainText(marker);
    }
  });

  test('category filter narrows the list and clearing it restores rows', async ({ page }) => {
    const marker = `Filt${Date.now()}`;
    const hotel = await seedRateCard({ name: `${marker} Hotel`, serviceType: 'hotel' });
    const transport = await seedRateCard({ name: `${marker} Transport`, serviceType: 'transport' });

    await page.goto('/rate-cards');
    await waitForLoad(page);
    await expect(page.getByRole('combobox').filter({ hasText: /All Categories/i })).toBeVisible();
    await searchList(page, marker);
    await expect(rowFor(page, hotel.name)).toBeVisible({ timeout: 10_000 });
    await expect(rowFor(page, transport.name)).toBeVisible();

    await page.getByRole('combobox').filter({ hasText: /All Categories/i }).click();
    await page.getByRole('option', { name: 'Transport', exact: true }).click();
    await page.waitForTimeout(800);
    await waitForLoad(page);

    await expect(page.getByText('Category:', { exact: true })).toBeVisible();
    await expect(rowFor(page, transport.name)).toBeVisible();
    await expect(page.locator(`table tbody tr:has-text("${hotel.name}")`)).toHaveCount(0);

    await page.getByRole('button', { name: /Clear all/i }).click();
    await page.waitForTimeout(800);
    await waitForLoad(page);
    await expect(rowFor(page, hotel.name)).toBeVisible({ timeout: 10_000 });
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await page.goto('/rate-cards');
    await waitForLoad(page);
    await searchList(page, `no-such-rate-card-${Date.now()}-zzz`);
    await expect(page.getByText('No rate cards yet')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Add supplier pricing to start building seasonal rate cards.')).toBeVisible();
    await expect(page.locator('table tbody tr:has-text("₹")')).toHaveCount(0);
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const marker = `Scroll${Date.now()}`;
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await seedRateCard({ name: `${marker}-${String(i).padStart(2, '0')}` });
    }

    await page.goto('/rate-cards');
    await waitForLoad(page);
    await searchList(page, marker);

    const rows = page.locator(`table tbody tr:has-text("${marker}")`);
    await expect(rows).toHaveCount(20, { timeout: 10_000 });
    await rows.last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await expect(rows).toHaveCount(25, { timeout: 10_000 });
  });

  test('bulk delete removes every selected rate card from the list', async ({ page }) => {
    const marker = `Bulk${Date.now()}`;
    const a = await seedRateCard({ name: `${marker} A` });
    const b = await seedRateCard({ name: `${marker} B` });

    await page.goto('/rate-cards');
    await waitForLoad(page);
    await searchList(page, marker);
    await expect(page.locator('table tbody tr')).toHaveCount(2, { timeout: 10_000 });

    await page.locator('table tbody tr').nth(0).getByRole('checkbox').click();
    await page.locator('table tbody tr').nth(1).getByRole('checkbox').click();
    await page.getByText('2 selected').locator('..').getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Delete$/ }).click();

    await expect(page.locator('text=Rate cards deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${marker}")`)).toHaveCount(0, { timeout: 10_000 });
    expect((await getRateCard(a.id)).isActive).toBe(false);
    expect((await getRateCard(b.id)).isActive).toBe(false);
  });

  test('export downloads a non-empty CSV containing the rate card', async ({ page }) => {
    const rc = await seedRateCard({ name: `Export ${Date.now()}`, serviceType: 'meal', costPrice: 700, sellingPrice: 950 });

    await page.goto('/rate-cards');
    await waitForLoad(page);
    await searchList(page, rc.name);
    await expect(rowFor(page, rc.name)).toBeVisible({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^rate-cards-\d{4}-\d{2}-\d{2}\.csv$/);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    expect(fs.statSync(downloadPath!).size).toBeGreaterThan(0);
    const csv = fs.readFileSync(downloadPath!, 'utf8');
    expect(csv).toContain('Name,Supplier,Category,Rate,Currency,Valid From,Valid To,Status');
    expect(csv).toContain(`"${rc.name}"`);
    expect(csv).toContain('"meal","950","INR"');
  });

  test('list has no raw tel/mailto/wa.me links (no messaging surface in this slice)', async ({ page }) => {
    await seedRateCard();
    await page.goto('/rate-cards');
    await waitForLoad(page);
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 });
    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);
  });

  test('sidebar Rate Cards link navigates to the list', async ({ page }) => {
    await page.goto('/');
    await waitForLoad(page);
    await expect(page.locator('aside a[href="/rate-cards"]').first()).toBeVisible();
    await navigateTo(page, '/rate-cards');
    await expect(page.getByPlaceholder(/search rate cards/i)).toBeVisible();
  });

  test('lookup endpoint returns only active, currently-valid cards matching type/destination/season', async () => {
    const dest = `Dest${Date.now()}`;
    const day = 86400000;
    const valid = await seedRateCard({ name: `Lookup valid ${dest}`, destination: dest, serviceType: 'activity', season: 'peak' });
    const expired = await seedRateCard({
      name: `Lookup expired ${dest}`,
      destination: dest,
      serviceType: 'activity',
      season: 'peak',
      validFrom: new Date(Date.now() - 60 * day).toISOString().slice(0, 10),
      validTo: new Date(Date.now() - 30 * day).toISOString().slice(0, 10),
    });
    const otherSeason = await seedRateCard({ name: `Lookup season ${dest}`, destination: dest, serviceType: 'activity', season: 'off_peak' });

    const res = await api('GET', `/rate-cards/lookup?type=activity&destination=${dest}&season=peak`);
    expect(res.success, JSON.stringify(res)).toBe(true);
    const ids = (res.data as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(valid.id);
    expect(ids).not.toContain(expired.id);
    expect(ids).not.toContain(otherSeason.id);
  });
});
