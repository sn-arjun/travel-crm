import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { api } from './helpers/api-seed';
import { calendarDialog, dayButton, pickDate as pickDateAt } from './helpers/date-picker';

const RATE_CARDS_API = '/fleet/vehicle-rate-cards';
const RAW_MESSAGING_ANCHORS = 'a[href^="tel:"], a[href^="mailto:"], a[href^="https://wa.me"], a[href^="wa.me"]';

async function createRateCardViaApi(overrides: Record<string, unknown> = {}) {
  const res = await api('POST', RATE_CARDS_API, {
    name: `E2E RC ${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    vehicleType: 'sedan',
    tripType: 'one_way',
    baseFare: 500,
    perKmRate: 12,
    ...overrides,
  });
  expect(res.success, JSON.stringify(res)).toBe(true);
  return res.data;
}

async function searchList(page: Page, term: string) {
  await page.getByPlaceholder(/Search rate cards/i).fill(term);
  await page.waitForTimeout(800);
  await waitForLoad(page);
}

async function pickOption(page: Page, triggerSelector: string, optionName: string) {
  await page.locator(triggerSelector).click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

/** Select-all then type, as a user would; CurrencyInput swaps its display text on focus. */
async function setNumber(page: Page, selector: string, value: string) {
  const input = page.locator(selector);
  // The first keystroke can be lost while the field swaps its display text on focus: verify and retype.
  for (let attempt = 0; attempt < 3; attempt++) {
    await input.click();
    await input.press('Control+A');
    await input.pressSequentially(value);
    if ((await input.inputValue()).replace(/[^\d.]/g, '') === value) break;
  }
}

/** Opens the first still-unset "Pick a date" trigger, advances N months, clicks the day. */
async function pickDate(page: Page, monthsForward: number, day: string) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthsForward, Number(day));
  await pickDateAt(page, page.locator('button:has-text("Pick a date")').first(), target);
}

function isoDate(monthsAhead: number, day: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + monthsAhead, day);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    display: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

test.describe('Fleet Rate Cards', () => {
  test('full round trip: create via form, list, edit prefill, edit, delete', async ({ page }) => {
    const ts = Date.now();
    const name = `RT Rate Card ${ts}`;
    const from = isoDate(1, 10);
    const to = isoDate(2, 20);

    // ── 1. Create through the form, every field filled ──
    await page.goto('/fleet/rate-cards/new');
    await waitForLoad(page);
    await expect(page.locator('h1')).toContainText(/New rate card/i);

    await page.locator('#name').fill(name);
    await pickOption(page, '#vehicleType', 'SUV');
    await pickOption(page, '#tripType', 'Outstation');
    await setNumber(page, '#baseFare', '1500');
    await setNumber(page, '#perKmRate', '18');
    await setNumber(page, '#perHourRate', '250');
    await setNumber(page, '#minKm', '300');
    await setNumber(page, '#minHours', '8');
    await setNumber(page, '#extraKmRate', '20');
    await setNumber(page, '#extraHourRate', '300');
    await setNumber(page, '#nightCharge', '500');
    await setNumber(page, '#driverAllowance', '400');
    await pickDate(page, 1, '10');
    await pickDate(page, 2, '20');
    await page.locator('#tollIncluded').click();
    await page.locator('#parkingIncluded').click();
    await expect(page.locator('#isActive')).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(page.locator('text=Rate card created').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForURL(/\/fleet\/rate-cards$/, { timeout: 15_000 });
    await waitForLoad(page);

    // ── 2. Every list-visible value appears in the list ──
    await searchList(page, name);
    const row = page.locator(`table tbody tr:has-text("${name}")`).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText('SUV');
    await expect(row).toContainText('Outstation');
    await expect(row).toContainText(/₹\s*1,500\.00/);
    await expect(row).toContainText(/₹\s*18\.00/);
    await expect(row).toContainText(/₹\s*250\.00/);
    await expect(row).toContainText('Active');
    for (const header of ['Name', 'Vehicle Type', 'Trip Type', 'Base Fare', 'Per Km', 'Per Hour', 'Status']) {
      await expect(page.locator('table thead').getByText(header, { exact: true })).toBeVisible();
    }

    // ── 3. No read-only detail page: row click opens the edit form with every value pre-filled ──
    await row.click();
    await page.waitForURL(/\/fleet\/rate-cards\/[^/]+\/edit$/, { timeout: 10_000 });
    await waitForLoad(page);
    const id = page.url().match(/\/fleet\/rate-cards\/([^/]+)\/edit/)![1];
    expect(id).toBeTruthy();

    await expect(page.locator('h1')).toContainText(/Edit rate card/i);
    await expect(page.locator('#name')).toHaveValue(name);
    await expect(page.locator('#vehicleType')).toContainText('SUV');
    await expect(page.locator('#tripType')).toContainText('Outstation');
    await expect(page.locator('#baseFare')).toHaveValue('1,500');
    await expect(page.locator('#perKmRate')).toHaveValue('18');
    await expect(page.locator('#perHourRate')).toHaveValue('250');
    await expect(page.locator('#minKm')).toHaveValue('300');
    await expect(page.locator('#minHours')).toHaveValue('8');
    await expect(page.locator('#extraKmRate')).toHaveValue('20');
    await expect(page.locator('#extraHourRate')).toHaveValue('300');
    await expect(page.locator('#nightCharge')).toHaveValue('500');
    await expect(page.locator('#driverAllowance')).toHaveValue('400');
    await expect(page.getByRole('button', { name: from.display })).toBeVisible();
    await expect(page.getByRole('button', { name: to.display })).toBeVisible();
    await expect(page.locator('#tollIncluded')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#parkingIncluded')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#isActive')).toHaveAttribute('aria-checked', 'true');

    // Persisted server-side under the backend's field names, dates not shifted by timezone
    const created = (await api('GET', `${RATE_CARDS_API}/${id}`)).data;
    expect(created).toMatchObject({
      name,
      vehicleType: 'suv',
      tripType: 'outstation',
      baseFare: 1500,
      perKmRate: 18,
      perHourRate: 250,
      minKm: 300,
      minHours: 8,
      extraKmRate: 20,
      extraHourRate: 300,
      nightCharge: 500,
      driverAllowance: 400,
      tollIncluded: true,
      parkingIncluded: true,
      isActive: true,
    });
    expect(String(created.validFrom).slice(0, 10)).toBe(from.iso);
    expect(String(created.validTo).slice(0, 10)).toBe(to.iso);

    // ── 4. Edit, save, assert the change persisted ──
    const updatedName = `RT Updated ${ts}`;
    await page.locator('#name').fill(updatedName);
    await pickOption(page, '#tripType', 'Round Trip');
    await setNumber(page, '#baseFare', '2000');
    await page.locator('#tollIncluded').click();
    await page.locator('#isActive').click();
    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(page.locator('text=Rate card updated').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(/\/fleet\/rate-cards$/, { timeout: 15_000 });
    await waitForLoad(page);

    const updated = (await api('GET', `${RATE_CARDS_API}/${id}`)).data;
    expect(updated).toMatchObject({
      name: updatedName,
      tripType: 'round_trip',
      baseFare: 2000,
      tollIncluded: false,
      parkingIncluded: true,
      isActive: false,
      perKmRate: 18,
      minKm: 300,
      driverAllowance: 400,
    });
    expect(String(updated.validFrom).slice(0, 10)).toBe(from.iso);

    await searchList(page, updatedName);
    const updatedRow = page.locator(`table tbody tr:has-text("${updatedName}")`).first();
    await expect(updatedRow).toBeVisible({ timeout: 10_000 });
    await expect(updatedRow).toContainText('Round Trip');
    await expect(updatedRow).toContainText(/₹\s*2,000\.00/);
    await expect(updatedRow).toContainText('Inactive');

    // ── 5. Delete, assert it is gone from the list without a manual reload ──
    await updatedRow.hover();
    await updatedRow.locator('button[aria-label="Delete"]').click();
    await page.getByRole('dialog').getByRole('button', { name: /^Delete$/ }).click();
    await expect(page.locator('text=Rate card deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${updatedName}")`)).toHaveCount(0, { timeout: 10_000 });

    const afterDelete = await api('GET', `${RATE_CARDS_API}/${id}`);
    expect(afterDelete.success).toBe(false);
  });

  test('hover Edit action navigates to the edit form of that rate card', async ({ page }) => {
    const rc = await createRateCardViaApi({ name: `Hover Edit ${Date.now()}` });
    await page.goto('/fleet/rate-cards');
    await waitForLoad(page);
    await searchList(page, rc.name);

    const row = page.locator(`table tbody tr:has-text("${rc.name}")`).first();
    await row.hover();
    await row.locator('button[aria-label="Edit"]').click();
    await page.waitForURL(`**/fleet/rate-cards/${rc.id}/edit`, { timeout: 10_000 });
    await expect(page.locator('#name')).toHaveValue(rc.name);
  });

  test('required fields are validated and nothing is created', async ({ page }) => {
    await page.goto('/fleet/rate-cards/new');
    await waitForLoad(page);

    await page.getByRole('button', { name: /^Save$/i }).click();
    await expect(page.getByText('Rate card name is required')).toBeVisible();
    await expect(page.getByText('Vehicle type is required')).toBeVisible();
    await expect(page.getByText('Trip type is required')).toBeVisible();
    await expect(page).toHaveURL(/\/fleet\/rate-cards\/new$/);
  });

  test('cancel on the new form returns without creating a rate card', async ({ page }) => {
    const name = `Cancelled ${Date.now()}`;
    await page.goto('/fleet/rate-cards');
    await waitForLoad(page);
    await page.getByRole('button', { name: /New rate card/i }).first().click();
    await page.waitForURL('**/fleet/rate-cards/new');
    await page.locator('#name').fill(name);
    await page.getByRole('button', { name: /^Cancel$/i }).click();
    await page.waitForURL(/\/fleet\/rate-cards$/, { timeout: 10_000 });

    const list = await api('GET', `${RATE_CARDS_API}?search=${encodeURIComponent(name)}`);
    expect(list.data ?? []).toHaveLength(0);
  });

  test('form uses selects, currency inputs and date pickers, with no raw ID inputs', async ({ page }) => {
    await page.goto('/fleet/rate-cards/new');
    await waitForLoad(page);

    expect(await page.locator('input[name*="Id" i], input[placeholder*="id" i]').count()).toBe(0);
    await expect(page.locator('#vehicleType')).toHaveAttribute('role', 'combobox');
    await expect(page.locator('#tripType')).toHaveAttribute('role', 'combobox');
    await page.locator('#vehicleType').click();
    await expect(page.getByRole('option')).toHaveCount(7);
    await page.keyboard.press('Escape');

    // Currency fields render the rupee symbol and reject non-numeric input
    await setNumber(page, '#baseFare', 'abc12x');
    await expect(page.locator('#baseFare')).toHaveValue('12');
    await expect(page.locator('button:has-text("Pick a date")')).toHaveCount(2);
    await expect(page.locator('input[type="date"]')).toHaveCount(0);

    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);
  });

  test('vehicleType query param pre-fills the new form', async ({ page }) => {
    await page.goto('/fleet/rate-cards/new?vehicleType=bus');
    await waitForLoad(page);
    await expect(page.locator('#vehicleType')).toContainText('Bus');
  });

  test('valid-to date cannot precede valid-from', async ({ page }) => {
    await page.goto('/fleet/rate-cards/new');
    await waitForLoad(page);

    await pickDate(page, 2, '20');
    await page.locator('button:has-text("Pick a date")').first().click();
    const now = new Date();
    const before = new Date(now.getFullYear(), now.getMonth() + 2, 10);
    await calendarDialog(page).getByLabel('Year', { exact: true }).selectOption(String(before.getFullYear()));
    await calendarDialog(page).getByLabel('Month', { exact: true }).selectOption(String(before.getMonth()));
    await expect(dayButton(page, before)).toBeDisabled();
  });

  test('search narrows the list to matching rate cards', async ({ page }) => {
    const marker = `Srch${Date.now()}`;
    const match = await createRateCardViaApi({ name: `${marker} Match` });
    const other = await createRateCardViaApi({ name: `Unrelated ${Date.now()}` });

    await page.goto('/fleet/rate-cards');
    await waitForLoad(page);
    await searchList(page, marker);

    await expect(page.locator(`table tbody tr:has-text("${match.name}")`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${other.name}")`)).toHaveCount(0);
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop
      await expect(rows.nth(i)).toContainText(marker);
    }
  });

  test('vehicle type filter narrows the list and the chip clears it', async ({ page }) => {
    const marker = `Filt${Date.now()}`;
    const busCard = await createRateCardViaApi({ name: `${marker} Bus`, vehicleType: 'bus' });
    const sedanCard = await createRateCardViaApi({ name: `${marker} Sedan`, vehicleType: 'sedan' });

    await page.goto('/fleet/rate-cards');
    await waitForLoad(page);
    await searchList(page, marker);
    await expect(page.locator(`table tbody tr:has-text("${busCard.name}")`)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(`table tbody tr:has-text("${sedanCard.name}")`)).toBeVisible();

    await page.getByRole('combobox', { name: 'Filter by vehicle type' }).click();
    await page.getByRole('option', { name: 'Bus', exact: true }).click();
    await page.waitForTimeout(800);
    await waitForLoad(page);

    await expect(page.getByText('Vehicle type:', { exact: false }).first()).toBeVisible();
    await expect(page.locator(`table tbody tr:has-text("${busCard.name}")`)).toBeVisible();
    await expect(page.locator(`table tbody tr:has-text("${sedanCard.name}")`)).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear all' }).click();
    await page.waitForTimeout(800);
    await waitForLoad(page);
    await expect(page.locator(`table tbody tr:has-text("${sedanCard.name}")`)).toBeVisible({ timeout: 10_000 });
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await page.goto('/fleet/rate-cards');
    await waitForLoad(page);
    await searchList(page, `no-such-rate-card-${Date.now()}-zzz`);

    await expect(page.getByText('No rate cards yet')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Create a rate card to define pricing for a vehicle type.')).toBeVisible();
    await expect(page.getByRole('button', { name: /New rate card/i }).first()).toBeVisible();
    await expect(page.locator('table tbody tr:has-text("₹")')).toHaveCount(0);
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const marker = `Scroll${Date.now()}`;
    for (let i = 0; i < 25; i++) {
      // eslint-disable-next-line no-await-in-loop
      await createRateCardViaApi({ name: `${marker}-${String(i).padStart(2, '0')}` });
    }

    await page.goto('/fleet/rate-cards');
    await waitForLoad(page);
    await searchList(page, marker);

    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(20, { timeout: 10_000 });
    await rows.last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await expect(rows).toHaveCount(25, { timeout: 10_000 });
  });

  test('bulk delete removes every selected rate card from the list', async ({ page }) => {
    const marker = `Bulk${Date.now()}`;
    const a = await createRateCardViaApi({ name: `${marker} A` });
    const b = await createRateCardViaApi({ name: `${marker} B` });

    await page.goto('/fleet/rate-cards');
    await waitForLoad(page);
    await searchList(page, marker);
    await expect(page.locator('table tbody tr')).toHaveCount(2, { timeout: 10_000 });

    await page.locator('table tbody tr').nth(0).getByRole('checkbox').click();
    await page.locator('table tbody tr').nth(1).getByRole('checkbox').click();
    await page.getByText('2 selected').locator('..').getByRole('button', { name: 'Delete' }).click();

    await expect(page.locator('text=2 rate cards deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('table tbody tr:has-text("' + marker + '")')).toHaveCount(0, { timeout: 10_000 });
    expect((await api('GET', `${RATE_CARDS_API}/${a.id}`)).success).toBe(false);
    expect((await api('GET', `${RATE_CARDS_API}/${b.id}`)).success).toBe(false);
  });

  test('export downloads a non-empty CSV containing the listed rate cards', async ({ page }) => {
    const rc = await createRateCardViaApi({
      name: `Export ${Date.now()}`,
      vehicleType: 'tempo_traveller',
      tripType: 'airport_pickup',
      baseFare: 750,
      perKmRate: 14,
    });

    await page.goto('/fleet/rate-cards');
    await waitForLoad(page);
    await searchList(page, rc.name);
    await expect(page.locator(`table tbody tr:has-text("${rc.name}")`)).toBeVisible({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: 'Export', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('rate-cards.csv');
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const fs = await import('fs');
    expect(fs.statSync(downloadPath!).size).toBeGreaterThan(0);
    const csv = fs.readFileSync(downloadPath!, 'utf8');
    expect(csv).toContain('"Name","Vehicle Type","Trip Type","Base Fare","Per Km","Per Hour","Status"');
    expect(csv).toContain(`"${rc.name}","Tempo Traveller","Airport Pickup","750","14"`);
    expect(csv).toContain('"Active"');
  });

  test('list page has no raw tel/mailto/wa.me links (no messaging surface in this slice)', async ({ page }) => {
    await createRateCardViaApi();
    await page.goto('/fleet/rate-cards');
    await waitForLoad(page);
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 });
    expect(await page.locator(RAW_MESSAGING_ANCHORS).count()).toBe(0);
  });

  test('editing a non-existent rate card shows an error, not a blank form', async ({ page }) => {
    await page.goto('/fleet/rate-cards/00000000-0000-7000-8000-00000000dead/edit');
    await waitForLoad(page);
    await expect(page.getByText(/Could not load rate card|Rate card not found/)).toBeVisible({ timeout: 10_000 });
  });

  test('estimate endpoint prices a 300 km trip from the rate card', async () => {
    const rc = await createRateCardViaApi({
      name: `Estimate ${Date.now()}`,
      vehicleType: 'sedan',
      tripType: 'one_way',
      baseFare: 500,
      perKmRate: 12,
    });

    const res = await api('POST', `${RATE_CARDS_API}/estimate`, {
      rateCardId: rc.id,
      distanceKm: 300,
      durationMinutes: 360,
    });
    expect(res.success, JSON.stringify(res)).toBe(true);
    expect(res.data.rateCard.id).toBe(rc.id);
    expect(res.data.breakdown.baseFare).toBe(500);
    expect(res.data.breakdown.kmCharges).toBe(3600);
    expect(res.data.breakdown.total).toBe(4100);

    const missing = await api('POST', `${RATE_CARDS_API}/estimate`, {
      rateCardId: '00000000-0000-7000-8000-00000000dead',
      distanceKm: 10,
      durationMinutes: 30,
    });
    expect(missing.success).toBe(false);
  });
});
