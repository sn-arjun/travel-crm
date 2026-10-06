/**
 * Fleet › Vehicles — full-round-trip E2E.
 *
 * Replaces the vehicle sections (A, D, H, J) of 18-m18-fleet.spec.ts.
 *
 * Flow (serial, one vehicle carried through the whole lifecycle):
 *   create via form → list → drawer → detail → edit prefill → edit → persisted
 *   → odometer → maintenance → documents (upload / download / delete)
 *   → deactivate / activate → search / filter / empty state → export
 *   → infinite scroll + bulk delete → single delete.
 */

import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { pickDate } from './helpers/date-picker';
import { seedVehicle, api } from './helpers/api-seed';

const TAG = Date.now().toString(36).toUpperCase();
const REG = `E2E${TAG}`;
const SEARCH_PLACEHOLDER = 'Search by registration, make, or model...';

const today = new Date().toISOString().slice(0, 10);
const asDate = (ymd: string) => new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const CREATED = {
  reg: REG,
  type: 'SUV',
  make: `Toyota${TAG}`,
  model: `Innova${TAG}`,
  year: '2021',
  seats: '7',
  color: 'Silver',
  notes: `Created by e2e ${TAG}`,
};

const EDITED = {
  type: 'MUV',
  make: `Kia${TAG}`,
  model: `Carens${TAG}`,
  year: '2023',
  seats: '6',
  color: 'Blue',
  notes: `Edited by e2e ${TAG}`,
  odometer: '12345',
};

async function pick(page: Page, trigger: ReturnType<Page['locator']>, option: string) {
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function expectNoErrorToast(page: Page) {
  await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
}

async function gotoList(page: Page) {
  await page.goto('/fleet/vehicles');
  await waitForLoad(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Vehicles' })).toBeVisible();
}

async function searchList(page: Page, text: string) {
  // The backend can be backlogged by activity-logger error output after bulk operations, so wait for the response itself.
  const response = page.waitForResponse(
    (r) => r.url().includes('/fleet/vehicles?') && r.url().includes(`search=${encodeURIComponent(text)}`),
    { timeout: 30_000 },
  );
  await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(text);
  await response;
  await waitForLoad(page);
}

function rowFor(page: Page, text: string) {
  return page.locator('tbody tr', { hasText: text });
}

async function openDetailViaList(page: Page, reg: string) {
  await gotoList(page);
  await searchList(page, reg);
  await rowFor(page, reg).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Open full details' }).click();
  await page.waitForURL(/\/fleet\/vehicles\/[^/]+$/);
  await waitForLoad(page);
}

async function expectNoMessagingAnchors(page: Page) {
  await expect(page.locator('a[href^="mailto:"], a[href*="wa.me"], a[href^="tel:"]')).toHaveCount(0);
}

async function expectNoRawIdInputs(page: Page) {
  await expect(page.locator('input[name$="Id"], input[id$="Id"], input[placeholder*="ID" i]')).toHaveCount(0);
}

test.describe.configure({ mode: 'serial' });

test.describe('Fleet vehicles', () => {
  let detailUrl = '';

  test('sidebar exposes Fleet and the vehicles list loads with search + filters', async ({ page }) => {
    await page.goto('/fleet');
    await waitForLoad(page);
    await expect(page.locator('aside').getByRole('link').filter({ hasText: /Fleet/i }).first()).toBeVisible();

    await gotoList(page);
    await expect(page.getByPlaceholder(SEARCH_PLACEHOLDER)).toBeVisible();
    await expect(page.getByRole('combobox').filter({ hasText: 'All types' })).toBeVisible();
    await expect(page.getByRole('combobox').filter({ hasText: 'All statuses' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add vehicle' }).first()).toBeVisible();
    await expect(page.getByText(/Something went wrong|Error: |404/i)).toHaveCount(0);
    await expectNoMessagingAnchors(page);
    await expectNoErrorToast(page);
  });

  test('create: form fills every field, has no raw ID inputs, saves and redirects', async ({ page }) => {
    await gotoList(page);
    await page.getByRole('button', { name: 'Add vehicle' }).first().click();
    await page.waitForURL(/\/fleet\/vehicles\/new$/);
    await waitForLoad(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Add vehicle' })).toBeVisible();
    await expectNoRawIdInputs(page);

    // Defaults
    await expect(page.locator('#type')).toContainText('Sedan');
    await expect(page.locator('#seatingCapacity')).toHaveValue('4');
    await expect(page.locator('#year')).toHaveValue(String(new Date().getFullYear()));

    // Required-field validation blocks an empty submit
    await page.locator('#registrationNumber').fill('');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveURL(/\/fleet\/vehicles\/new$/);
    await expect(page.getByText('Registration number is required')).toBeVisible();

    await page.locator('#registrationNumber').fill(CREATED.reg.toLowerCase());
    await expect(page.locator('#registrationNumber')).toHaveValue(CREATED.reg); // upper-cased as typed
    await pick(page, page.locator('#type'), CREATED.type);
    await page.locator('#make').fill(CREATED.make);
    await page.locator('#model').fill(CREATED.model);
    await page.locator('#seatingCapacity').fill(CREATED.seats);
    await page.locator('#year').fill(CREATED.year);
    await pick(page, page.locator('#color'), CREATED.color);
    await page.locator('#notes').fill(CREATED.notes);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL(/\/fleet\/vehicles$/, { timeout: 20_000 });
    await waitForLoad(page);
    await expectNoErrorToast(page);
  });

  test('list: the new vehicle shows every list value and opens a detail drawer', async ({ page }) => {
    await gotoList(page);
    await searchList(page, CREATED.reg);

    const row = rowFor(page, CREATED.reg);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(CREATED.reg);
    await expect(row).toContainText(`${CREATED.make} ${CREATED.model}`);
    await expect(row).toContainText(CREATED.year);
    await expect(row).toContainText(CREATED.type);
    await expect(row).toContainText(`${CREATED.seats} seats`);
    await expect(row).toContainText('0 km');
    await expect(row).toContainText('Available');

    // Hover actions exist
    await row.hover();
    await expect(row.getByRole('button', { name: 'View', exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Delete', exact: true })).toBeVisible();

    // Drawer shows every field, including ones not in the table
    await row.click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(CREATED.reg).first()).toBeVisible();
    await expect(drawer).toContainText(CREATED.make);
    await expect(drawer).toContainText(CREATED.model);
    await expect(drawer).toContainText(CREATED.type);
    await expect(drawer).toContainText(CREATED.year);
    await expect(drawer).toContainText(CREATED.color);
    await expect(drawer).toContainText(`${CREATED.seats} seats`);
    await expect(drawer).toContainText('0 km');
    await expect(drawer).toContainText('Available');
    await expect(drawer).toContainText(CREATED.notes);
    await expectNoMessagingAnchors(page);

    await drawer.getByRole('button', { name: 'Open full details' }).click();
    await page.waitForURL(/\/fleet\/vehicles\/[^/]+$/);
    detailUrl = new URL(page.url()).pathname;
    expect(detailUrl).toMatch(/^\/fleet\/vehicles\/[^/]+$/);
  });

  test('detail: header, tabs and overview show every value entered at creation', async ({ page }) => {
    await page.goto(detailUrl);
    await waitForLoad(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText(`${CREATED.make} ${CREATED.model}`);
    await expect(page.getByText(`${CREATED.reg} · ${CREATED.type}`)).toBeVisible();
    await expect(page.getByText('Available', { exact: true }).first()).toBeVisible();

    for (const name of ['Overview', 'Activity', 'Related', 'Documents']) {
      await expect(page.getByRole('tab', { name })).toBeVisible();
    }

    const overview = page.getByRole('tabpanel');
    await expect(overview).toContainText(CREATED.reg);
    await expect(overview).toContainText(CREATED.type);
    await expect(overview).toContainText(CREATED.make);
    await expect(overview).toContainText(CREATED.model);
    await expect(overview).toContainText(CREATED.year);
    await expect(overview).toContainText(CREATED.color);
    await expect(overview).toContainText(`${CREATED.seats} seats`);
    await expect(overview).toContainText(CREATED.notes);
    await expect(overview).toContainText('0 km');

    const editLink = page.getByRole('link', { name: 'Edit', exact: true });
    await expect(editLink).toBeVisible();
    expect(await editLink.getAttribute('href')).toMatch(/\/fleet\/vehicles\/.+\/edit$/);

    await expectNoMessagingAnchors(page);
    await expectNoErrorToast(page);
  });

  test('edit: form is pre-filled with every stored value', async ({ page }) => {
    await page.goto(`${detailUrl}/edit`);
    await waitForLoad(page);

    await expect(page.getByRole('heading', { level: 1, name: 'Edit vehicle' })).toBeVisible();
    await expectNoRawIdInputs(page);
    await expect(page.locator('#registrationNumber')).toHaveValue(CREATED.reg);
    await expect(page.locator('#type')).toContainText(CREATED.type);
    await expect(page.locator('#make')).toHaveValue(CREATED.make);
    await expect(page.locator('#model')).toHaveValue(CREATED.model);
    await expect(page.locator('#seatingCapacity')).toHaveValue(CREATED.seats);
    await expect(page.locator('#year')).toHaveValue(CREATED.year);
    await expect(page.locator('#color')).toContainText(CREATED.color);
    await expect(page.locator('#status')).toContainText('Available');
    await expect(page.locator('#notes')).toHaveValue(CREATED.notes);
  });

  test('edit: changes persist to detail and list (incl. status and odometer)', async ({ page }) => {
    await page.goto(`${detailUrl}/edit`);
    await waitForLoad(page);

    await pick(page, page.locator('#type'), EDITED.type);
    await page.locator('#make').fill(EDITED.make);
    await page.locator('#model').fill(EDITED.model);
    await page.locator('#seatingCapacity').fill(EDITED.seats);
    await page.locator('#year').fill(EDITED.year);
    await pick(page, page.locator('#color'), EDITED.color);
    await pick(page, page.locator('#status'), 'Under Maintenance');
    await page.locator('#odometerKm').fill(EDITED.odometer);
    await page.locator('#notes').fill(EDITED.notes);
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await page.waitForURL(new RegExp(`${detailUrl}$`), { timeout: 20_000 });
    await waitForLoad(page);
    await expectNoErrorToast(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText(`${EDITED.make} ${EDITED.model}`);
    await expect(page.getByText('Under Maintenance', { exact: true }).first()).toBeVisible();
    const overview = page.getByRole('tabpanel');
    await expect(overview).toContainText(EDITED.type);
    await expect(overview).toContainText(EDITED.year);
    await expect(overview).toContainText(EDITED.color);
    await expect(overview).toContainText(`${EDITED.seats} seats`);
    await expect(overview).toContainText(EDITED.notes);
    await expect(overview).toContainText('12,345 km');

    await gotoList(page);
    await searchList(page, CREATED.reg);
    const row = rowFor(page, CREATED.reg);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${EDITED.make} ${EDITED.model}`);
    await expect(row).toContainText(EDITED.type);
    await expect(row).toContainText(`${EDITED.seats} seats`);
    await expect(row).toContainText('12,345 km');
    await expect(row).toContainText('Under Maintenance');
  });

  test('odometer dialog updates the reading', async ({ page }) => {
    await page.goto(detailUrl);
    await waitForLoad(page);

    await page.getByRole('button', { name: 'Update odometer' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('#odometerReading')).toHaveValue(EDITED.odometer);
    await dialog.locator('#odometerReading').fill('15000');
    await dialog.getByRole('button', { name: 'Save odometer' }).click();
    await expect(dialog).toBeHidden();
    await expectNoErrorToast(page);
    await expect(page.getByRole('tabpanel')).toContainText('15,000 km');
  });

  test('maintenance: add a service record and see it in Related and Activity', async ({ page }) => {
    await page.goto(detailUrl);
    await waitForLoad(page);

    await page.getByRole('tab', { name: 'Related' }).click();
    await expect(page.getByText('No maintenance records yet')).toBeVisible();
    await page.getByRole('button', { name: 'Add record' }).click();

    const dialog = page.getByRole('dialog');
    await pick(page, dialog.locator('#serviceType'), 'Oil change');
    await pickDate(page, dialog.locator('#serviceDate'), asDate(today));
    await dialog.locator('#maintenanceCost').fill('2500');
    await dialog.locator('#vendor').fill(`Toyota Service ${TAG}`);
    await dialog.locator('#odometerAtService').fill('14900');
    await pickDate(page, dialog.locator('#nextServiceDate'), asDate(inDays(90)));
    await dialog.locator('#maintenanceNotes').fill(`Changed oil ${TAG}`);
    await dialog.getByRole('button', { name: 'Save record' }).click();

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expectNoErrorToast(page);

    const related = page.getByRole('tabpanel');
    await expect(related).toContainText('Maintenance history (1)');
    await expect(related).toContainText('Oil change');
    await expect(related).toContainText(today);
    await expect(related).toContainText(`Vendor: Toyota Service ${TAG}`);
    await expect(related).toContainText('14,900 km');
    await expect(related).toContainText(`Changed oil ${TAG}`);
    await expect(related).toContainText(`Next service: ${inDays(90)}`);
    await expect(related).toContainText('₹2,500');

    await page.getByRole('tab', { name: 'Activity' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Oil change');
  });

  test('documents: empty state, upload RC + insurance with expiry, download, expiry tag, delete', async ({ page }) => {
    await page.goto(detailUrl);
    await waitForLoad(page);

    await page.getByRole('tab', { name: 'Documents' }).click();
    await expect(page.getByText('No documents uploaded yet')).toBeVisible();

    async function upload(type: string, fileName: string, number: string, issued: string, expiry: string) {
      await page.getByRole('button', { name: 'Upload document' }).click();
      const dialog = page.getByRole('dialog');
      await pick(page, dialog.locator('#docType'), type);
      await dialog.locator('#docFile').setInputFiles({
        name: fileName,
        mimeType: 'application/pdf',
        buffer: Buffer.from(`%PDF-1.4 e2e ${TAG} ${fileName}`),
      });
      await dialog.locator('#docNumber').fill(number);
      await pickDate(page, dialog.locator('#docIssued'), asDate(issued));
      await pickDate(page, dialog.locator('#docExpiry'), asDate(expiry));
      await dialog.getByRole('button', { name: 'Upload', exact: true }).click();
      await expect(dialog).toBeHidden({ timeout: 20_000 });
      await expectNoErrorToast(page);
    }

    const rcExpiry = inDays(400);
    const insExpiry = inDays(10);
    await upload('RC Book', `rc-${TAG}.pdf`, `RC-${TAG}`, inDays(-300), rcExpiry);
    await upload('Insurance', `insurance-${TAG}.pdf`, `POL-${TAG}`, inDays(-355), insExpiry);

    const docs = page.getByRole('tabpanel');
    await expect(docs).toContainText('RC Book');
    await expect(docs).toContainText(`No. RC-${TAG}`);
    await expect(docs).toContainText(`rc-${TAG}.pdf`);
    await expect(docs).toContainText(inDays(-300));
    await expect(docs).toContainText(rcExpiry);
    await expect(docs).toContainText('Insurance');
    await expect(docs).toContainText(`No. POL-${TAG}`);
    await expect(docs).toContainText(`insurance-${TAG}.pdf`);
    await expect(docs).toContainText(`${insExpiry} (10d left)`);

    // Download returns a non-empty file with the uploaded bytes
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toContain(`%PDF-1.4 e2e ${TAG}`);

    // Overview surfaces expiring documents
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page.getByText('Document expiry')).toBeVisible();

    // Delete one
    await page.getByRole('tab', { name: 'Documents' }).click();
    await page.getByRole('button', { name: 'Delete document' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expectNoErrorToast(page);
    await expect(page.getByRole('button', { name: 'Delete document' })).toHaveCount(1);
  });

  test('deactivate then activate changes the status', async ({ page }) => {
    await page.goto(detailUrl);
    await waitForLoad(page);

    await page.getByRole('button', { name: 'Deactivate' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
    await expect(page.getByRole('button', { name: 'Activate' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Out of Service', { exact: true }).first()).toBeVisible();
    await expectNoErrorToast(page);

    await page.getByRole('button', { name: 'Activate' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByRole('button', { name: 'Deactivate' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Available', { exact: true }).first()).toBeVisible();
    await expectNoErrorToast(page);
  });

  test('search and filters narrow results; empty state when nothing matches', async ({ page }) => {
    const other = await seedVehicle({
      registrationNumber: `SRCH${TAG}`,
      make: `Maruti${TAG}`,
      model: `Ertiga${TAG}`,
      type: 'sedan',
    });
    expect(other?.id).toBeTruthy();

    await gotoList(page);

    // Search by registration narrows to exactly one vehicle
    await searchList(page, CREATED.reg);
    await expect(rowFor(page, CREATED.reg)).toHaveCount(1);
    await expect(rowFor(page, `SRCH${TAG}`)).toHaveCount(0);

    // Search by make and by model
    await searchList(page, `Ertiga${TAG}`);
    await expect(rowFor(page, `SRCH${TAG}`)).toHaveCount(1);
    await expect(rowFor(page, CREATED.reg)).toHaveCount(0);
    await searchList(page, `Carens${TAG}`);
    await expect(rowFor(page, CREATED.reg)).toHaveCount(1);

    // Type filter: matching type keeps the row, another type empties the list
    await searchList(page, TAG);
    await expect(rowFor(page, CREATED.reg)).toHaveCount(1);
    await expect(rowFor(page, `SRCH${TAG}`)).toHaveCount(1);

    await pick(page, page.getByRole('combobox').filter({ hasText: 'All types' }), 'Sedan');
    await waitForLoad(page);
    await expect(rowFor(page, `SRCH${TAG}`)).toHaveCount(1);
    await expect(rowFor(page, CREATED.reg)).toHaveCount(0);

    await pick(page, page.getByRole('combobox').filter({ hasText: 'Sedan' }), 'Bus');
    await waitForLoad(page);
    await expect(page.getByText('No vehicles yet')).toBeVisible();
    await expect(page.locator('tbody tr', { hasNotText: 'No vehicles yet' })).toHaveCount(0); // the empty state renders inside tbody

    // Status filter combined with type
    await pick(page, page.getByRole('combobox').filter({ hasText: 'Bus' }), 'MUV');
    await waitForLoad(page);
    await expect(rowFor(page, CREATED.reg)).toHaveCount(1);
    await pick(page, page.getByRole('combobox').filter({ hasText: 'All statuses' }), 'Out of Service');
    await waitForLoad(page);
    await expect(page.getByText('No vehicles yet')).toBeVisible();
    await pick(page, page.getByRole('combobox').filter({ hasText: 'Out of Service' }), 'Available');
    await waitForLoad(page);
    await expect(rowFor(page, CREATED.reg)).toHaveCount(1);

    // Search with no match → empty state
    await pick(page, page.getByRole('combobox').filter({ hasText: 'MUV' }), 'All types');
    await pick(page, page.getByRole('combobox').filter({ hasText: 'Available' }), 'All statuses');
    await searchList(page, `no-such-vehicle-${TAG}`);
    await expect(page.getByText('No vehicles yet')).toBeVisible();
    await expect(page.getByText('Register your first vehicle to start building your fleet.')).toBeVisible();

    await api('DELETE', `/fleet/vehicles/${other.id}`);
    await expectNoErrorToast(page);
  });

  test('export downloads a non-empty CSV with every vehicle column', async ({ page }) => {
    await gotoList(page);
    await searchList(page, CREATED.reg);
    await expect(rowFor(page, CREATED.reg)).toHaveCount(1);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^vehicles_export_\d{4}-\d{2}-\d{2}\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv.length).toBeGreaterThan(0);
    expect(csv.split('\n')[0]).toBe('Registration,Make,Model,Year,Type,Color,Capacity,Odometer (km),Status,Notes');
    const line = csv.split('\n').find((l) => l.startsWith(CREATED.reg));
    expect(line, 'exported CSV has a row for the vehicle').toBeTruthy();
    expect(line).toContain(EDITED.make);
    expect(line).toContain(EDITED.model);
    expect(line).toContain(EDITED.year);
    expect(line).toContain(EDITED.type);
    expect(line).toContain(EDITED.color);
    expect(line).toContain(EDITED.seats);
    expect(line).toContain('14900'); // recording maintenance at 14,900 km moved the odometer
    expect(line).toContain('Available');
    expect(line).toContain(EDITED.notes);
  });

  test('infinite scroll loads more rows; bulk delete removes them', async ({ page }) => {
    const prefix = `SCR${TAG}`;
    for (let i = 0; i < 22; i++) {
      const v = await seedVehicle({ registrationNumber: `${prefix}-${String(i).padStart(2, '0')}` });
      expect(v?.id).toBeTruthy();
    }

    await gotoList(page);
    await searchList(page, prefix);
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(20);

    // Lists scroll the table region (not <main>); scroll it to the bottom to trigger the next page.
    const region = page.locator('[data-scroll-region="table"]');
    await expect
      .poll(async () => {
        await region.evaluate((el) => { el.scrollTop = el.scrollHeight; });
        return rows.count();
      }, { timeout: 20_000 })
      .toBe(22);

    // Bulk delete everything loaded
    await page.getByRole('checkbox', { name: 'Select all rows' }).click();
    await expect(page.getByText('22 selected')).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await expect(page.getByText('No vehicles yet')).toBeVisible({ timeout: 20_000 });
    await expectNoErrorToast(page);
  });

  test('delete: confirm dialog removes the vehicle from the list and detail is gone', async ({ page }) => {
    await gotoList(page);
    await searchList(page, CREATED.reg);
    const row = rowFor(page, CREATED.reg);
    await expect(row).toHaveCount(1);

    await row.hover();
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(CREATED.reg);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(rowFor(page, CREATED.reg)).toHaveCount(1); // cancel keeps it

    await row.hover();
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Vehicle deleted')).toBeVisible();
    await expect(rowFor(page, CREATED.reg)).toHaveCount(0);
    await expect(page.getByText('No vehicles yet')).toBeVisible();

    await page.goto(detailUrl);
    await waitForLoad(page);
    await expect(page.getByText('Vehicle not found')).toBeVisible();
    await expectNoErrorToast(page);
  });

  test('a seeded vehicle is reachable via list row → drawer → full details', async ({ page }) => {
    const v = await seedVehicle({
      registrationNumber: `NAV${TAG}`,
      make: 'Hyundai',
      model: 'Creta',
      seatingCapacity: 5,
    });
    await openDetailViaList(page, `NAV${TAG}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Hyundai Creta');
    await expect(page.getByRole('tabpanel')).toContainText('5 seats');
    await api('DELETE', `/fleet/vehicles/${v.id}`);
  });
});
