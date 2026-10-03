/**
 * Vouchers — full E2E (replaces 07-vouchers.spec.ts and 11-m11-vouchers.spec.ts).
 *
 * Pages: /vouchers, /vouchers/new, /vouchers/[id], /vouchers/[id]/edit. No plan gate.
 *
 * A. Hotel voucher round trip through the UI: create (every field) -> detail -> list -> edit pre-fill
 *    -> edit/save -> persisted via API -> status draft -> sent -> confirmed -> delete (cancel, confirm)
 * B. Transport / flight / activity vouchers: create through the UI with every field, detail shows each value
 * C. Form: required-field validation, lead/supplier are searchable comboboxes (no raw ID inputs),
 *    URL prefill (leadId + type), type switch swaps the detail section, edit PUT payload shape
 * D. List: columns, filter bar search, type + status filters (exact options), chips, hover actions,
 *    row click, row-level delete refreshes, empty state, infinite scroll, themed CSV export
 * E. Detail: PDF download, SendMessageDialog, no mailto:/wa.me/tel: anchors on any page
 * F. Navigation + API contract
 *
 * Old assertions that encoded UI that no longer exists (4-step wizard, "Change Status" panel, 3-step status
 * timeline, `.h-4` sentinel, `tr` locators) are re-expressed against the archetype UI that replaced them.
 */
import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { api, seedContact, seedLead, seedSupplier, seedVoucher } from './helpers/api-seed';

test.setTimeout(120_000);

const TS = Date.now();
const DATE_FMT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const NOW = new Date();
const YEAR = NOW.getFullYear();
const MONTH = NOW.getMonth();
const iso = (day: number) => `${YEAR}-${String(MONTH + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const shown = (day: number) => new Date(YEAR, MONTH, day).toLocaleDateString('en-IN', DATE_FMT);
const SHOWN_DATE = /\d{1,2} [A-Za-z]{3,4} \d{4}/;

let leadA: any;
let leadB: any;
let supplier: any;
const LEAD_A_TITLE = `VchLeadAlpha ${TS}`;
const LEAD_B_TITLE = `VchLeadBravo ${TS}`;
const SUPPLIER_NAME = `VchSupplier ${TS}`;

test.beforeAll(async () => {
  const contact = await seedContact();
  leadA = await seedLead(contact.id, { title: LEAD_A_TITLE });
  leadB = await seedLead(contact.id, { title: LEAD_B_TITLE });
  supplier = await seedSupplier({ companyName: SUPPLIER_NAME });
  expect(leadA?.id, 'lead A seeded').toBeTruthy();
  expect(leadB?.id, 'lead B seeded').toBeTruthy();
  expect(supplier?.id, 'supplier seeded').toBeTruthy();
});

// ─── helpers ──────────────────────────────────────────────────────────────────

const errorToast = (page: Page) =>
  page.locator('[data-sonner-toast]').filter({ hasText: /failed|error|forbidden|not available|unauthor/i });

async function expectNoErrorToast(page: Page) {
  await expect(errorToast(page)).toHaveCount(0);
}

async function pickOption(page: Page, triggerSelector: string, option: string | RegExp) {
  await page.locator(triggerSelector).click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
}

/** Opens the DatePicker that follows the given field label and clicks a day of the current month. */
async function pickDate(page: Page, label: string, day: number) {
  await page.locator('label', { hasText: label }).locator('xpath=following-sibling::button[1]').click();
  await page.locator('[data-radix-popper-content-wrapper]').getByRole('button', { name: String(day), exact: true }).click();
  // Wait for the popover to finish closing so the next picker's calendar is the only one in the DOM.
  await expect(page.locator('[data-radix-popper-content-wrapper]')).toHaveCount(0);
}

const relationBox = (page: Page, field: 'leadId' | 'supplierId') =>
  page.locator(`label[for="${field}"] ~ div button[role="combobox"]`);

/** Selects a relation by typing into the combobox search. */
async function pickRelation(page: Page, field: 'leadId' | 'supplierId', search: string, optionName: string) {
  await relationBox(page, field).click();
  await page.locator('[cmdk-input]').fill(search);
  await page.getByRole('option', { name: new RegExp(optionName) }).click();
}

async function searchList(page: Page, text: string) {
  await page.getByPlaceholder('Search vouchers...').fill(text);
  await waitForLoad(page);
}

async function openList(page: Page) {
  await page.goto('/vouchers');
  await waitForLoad(page);
  await expect(page.locator('h1', { hasText: 'Vouchers' })).toBeVisible({ timeout: 15_000 });
}

function rowOf(page: Page, text: string) {
  return page.locator('tbody tr', { hasText: text }).first();
}

async function submitForm(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL(/\/vouchers\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await waitForLoad(page);
}

function idFromUrl(page: Page): string {
  return page.url().split('/vouchers/')[1]!.split(/[/?]/)[0]!;
}

async function getVoucher(id: string) {
  const res = await api('GET', `/vouchers/${id}`);
  return res.data;
}

async function expectNoCommAnchors(page: Page) {
  await expect(page.locator('a[href^="mailto:"], a[href*="wa.me"], a[href^="tel:"]')).toHaveCount(0);
}

// ─── A. Hotel round trip ──────────────────────────────────────────────────────

test.describe.serial('A. Hotel voucher — full lifecycle', () => {
  const TITLE = `E2E Hotel Voucher ${TS}`;
  const HOTEL = `Grand Palace ${TS}`;
  const ADDRESS = '12 Marine Drive, Mumbai';
  const CONF = `CONF-${TS}`;
  const SPECIAL = 'Late check-in, sea view please';
  const NOTES = `Internal note ${TS}`;
  const GUESTS = 'Alice Smith, Bob Jones';
  let id = '';

  test('create through the form with every field, lands on detail showing every value', async ({ page }) => {
    await page.goto('/vouchers/new');
    await waitForLoad(page);
    await expect(page.getByRole('heading', { name: 'New voucher' })).toBeVisible();

    await pickRelation(page, 'leadId', LEAD_A_TITLE, LEAD_A_TITLE);
    await pickRelation(page, 'supplierId', SUPPLIER_NAME, SUPPLIER_NAME);
    await expect(relationBox(page, 'leadId')).toContainText(LEAD_A_TITLE);
    await expect(relationBox(page, 'supplierId')).toContainText(SUPPLIER_NAME);

    await page.locator('#hotelName').fill(HOTEL);
    await page.locator('#hotelAddress').fill(ADDRESS);
    await pickDate(page, 'Check-in', 10);
    await pickDate(page, 'Check-out', 12);
    await pickOption(page, '#roomType', 'Suite');
    await pickOption(page, '#mealPlan', /^CP/);
    await page.locator('#confirmationNumber').fill(CONF);
    await page.locator('#guestNames').fill(GUESTS);
    await page.locator('#specialRequests').fill(SPECIAL);
    await page.locator('#title').fill(TITLE);
    await pickOption(page, '#language', 'Hindi');
    await page.locator('#notes').fill(NOTES);

    await submitForm(page);
    id = idFromUrl(page);
    await expectNoErrorToast(page);

    await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
    await expect(page.getByText('Hotel voucher', { exact: true })).toBeVisible();
    await expect(page.getByText('draft', { exact: true }).first()).toBeVisible();
    // Voucher info
    await expect(page.getByText(LEAD_A_TITLE).first()).toBeVisible();
    await expect(page.getByText(SUPPLIER_NAME).first()).toBeVisible();
    await expect(page.getByText('HI', { exact: true })).toBeVisible();
    await expect(page.getByText(NOTES)).toBeVisible();
    await expect(page.getByText('Created', { exact: true })).toBeVisible();
    // Hotel details
    await expect(page.getByText('Hotel details')).toBeVisible();
    await expect(page.getByText(HOTEL, { exact: true })).toBeVisible();
    await expect(page.getByText(ADDRESS)).toBeVisible();
    await expect(page.getByText(shown(10), { exact: true })).toBeVisible();
    await expect(page.getByText(shown(12), { exact: true })).toBeVisible();
    await expect(page.getByText('Suite', { exact: true })).toBeVisible();
    await expect(page.getByText('CP', { exact: true })).toBeVisible();
    await expect(page.getByText(CONF, { exact: true })).toBeVisible();
    await expect(page.getByText('Alice Smith', { exact: true })).toBeVisible();
    await expect(page.getByText('Bob Jones', { exact: true })).toBeVisible();

    // Persisted shape — no old wrong fields
    const v = await getVoucher(id);
    expect(v.title).toBe(TITLE);
    expect(v.type).toBe('hotel');
    expect(v.status).toBe('draft');
    expect(v.language).toBe('hi');
    expect(v.lead_id).toBe(leadA.id);
    expect(v.supplier_id).toBe(supplier.id);
    expect(v.details.checkIn).toBe(iso(10));
    expect(v.details.checkOut).toBe(iso(12));
    expect(v.details.guestNames).toEqual(['Alice Smith', 'Bob Jones']);
    expect(v.details.specialRequests).toBe(SPECIAL);
    for (const stale of ['voucherNumber', 'issueDate', 'validUntil', 'items']) expect(v[stale]).toBeUndefined();
  });

  test('list shows every column value, with no undefined/NaN', async ({ page }) => {
    await openList(page);
    await searchList(page, TITLE);
    const row = rowOf(page, TITLE);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row).toContainText(LEAD_A_TITLE);
    await expect(row).toContainText('hotel');
    await expect(row).toContainText(SUPPLIER_NAME);
    await expect(row).toContainText('draft');
    await expect(row).toContainText('HI');
    await expect(row).toContainText(SHOWN_DATE);
    const text = await row.textContent();
    expect(text).not.toContain('undefined');
    expect(text).not.toContain('NaN');

    for (const header of ['Voucher', 'Type', 'Supplier', 'Status', 'Language', 'Created']) {
      await expect(page.getByRole('columnheader', { name: new RegExp(header) })).toBeVisible();
    }
  });

  test('edit form is pre-filled with every stored value', async ({ page }) => {
    await page.goto(`/vouchers/${id}`);
    await waitForLoad(page);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.waitForURL(`**/vouchers/${id}/edit`);
    await waitForLoad(page);

    await expect(page.getByRole('heading', { name: 'Edit voucher' })).toBeVisible();
    await expect(page.locator('#hotelName')).toHaveValue(HOTEL);
    await expect(page.locator('#hotelAddress')).toHaveValue(ADDRESS);
    await expect(page.getByRole('button', { name: shown(10) })).toBeVisible();
    await expect(page.getByRole('button', { name: shown(12) })).toBeVisible();
    await expect(page.locator('#roomType')).toContainText('Suite');
    await expect(page.locator('#mealPlan')).toContainText('CP');
    await expect(page.locator('#confirmationNumber')).toHaveValue(CONF);
    await expect(page.locator('#guestNames')).toHaveValue(GUESTS);
    await expect(page.locator('#specialRequests')).toHaveValue(SPECIAL);
    await expect(page.locator('#title')).toHaveValue(TITLE);
    await expect(page.locator('#language')).toContainText('Hindi');
    await expect(page.locator('#notes')).toHaveValue(NOTES);
    await expect(page.getByRole('combobox').filter({ hasText: SUPPLIER_NAME })).toBeVisible();
    // Type is immutable after creation
    await expect(page.locator('#voucherType')).toBeDisabled();
  });

  test('edit, save and the change persists (PUT payload is flat, no customFields)', async ({ page }) => {
    await page.goto(`/vouchers/${id}/edit`);
    await waitForLoad(page);
    await expect(page.locator('#hotelName')).toHaveValue(HOTEL);

    let payload: any = null;
    await page.route(`**/vouchers/${id}`, async (route) => {
      if (route.request().method() === 'PUT') payload = JSON.parse(route.request().postData() ?? '{}');
      await route.continue();
    });

    await page.locator('#hotelName').fill(`${HOTEL} Annex`);
    await pickOption(page, '#roomType', 'Villa');
    await page.locator('#guestNames').fill('Alice Smith, Bob Jones, Cara Lee');
    await page.locator('#notes').fill(`${NOTES} edited`);
    await pickDate(page, 'Check-out', 14);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL(`**/vouchers/${id}`, { timeout: 20_000 });
    await waitForLoad(page);
    await expectNoErrorToast(page);

    expect(payload).toBeTruthy();
    expect(payload).not.toHaveProperty('customFields');
    expect(payload.details.hotelName).toBe(`${HOTEL} Annex`);

    await expect(page.getByText(`${HOTEL} Annex`, { exact: true })).toBeVisible();
    await expect(page.getByText('Villa', { exact: true })).toBeVisible();
    await expect(page.getByText('Cara Lee', { exact: true })).toBeVisible();
    await expect(page.getByText(`${NOTES} edited`)).toBeVisible();
    await expect(page.getByText(shown(14), { exact: true })).toBeVisible();

    const v = await getVoucher(id);
    expect(v.details.hotelName).toBe(`${HOTEL} Annex`);
    expect(v.details.roomType).toBe('Villa');
    expect(v.details.checkOut).toBe(iso(14));
    expect(v.notes).toBe(`${NOTES} edited`);
  });

  test('status moves draft -> sent -> confirmed with confirmation, edit only while draft', async ({ page }) => {
    await page.goto(`/vouchers/${id}`);
    await waitForLoad(page);

    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /mark as confirmed/i })).toHaveCount(0);

    await page.getByRole('button', { name: /mark as sent/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Cancel leaves it as draft
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect((await getVoucher(id)).status).toBe('draft');

    await page.getByRole('button', { name: /mark as sent/i }).click();
    await expect(page.getByRole('dialog').getByText(/updates the voucher status to Sent/i)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByRole('button', { name: /mark as confirmed/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('sent', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /mark as sent/i })).toHaveCount(0);
    expect((await getVoucher(id)).status).toBe('sent');

    await page.getByRole('button', { name: /mark as confirmed/i }).click();
    await expect(page.getByRole('dialog').getByText(/final status/i)).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('confirmed', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /mark as/i })).toHaveCount(0);
    expect((await getVoucher(id)).status).toBe('confirmed');
    await expectNoErrorToast(page);

    // Non-draft rows offer no Edit hover action
    await openList(page);
    await searchList(page, TITLE);
    const row = rowOf(page, TITLE);
    await row.hover();
    await expect(row.getByRole('button', { name: 'View' })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  });

  test('delete from the list asks first, cancel keeps it, confirm removes it', async ({ page }) => {
    await openList(page);
    await searchList(page, TITLE);
    const row = rowOf(page, TITLE);
    await row.hover();
    await row.getByRole('button', { name: 'Delete' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Delete voucher?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(rowOf(page, TITLE)).toBeVisible();
    expect((await getVoucher(id))?.id).toBe(id);

    await row.hover();
    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Voucher deleted')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('tbody tr', { hasText: TITLE })).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText('No vouchers yet')).toBeVisible();

    const gone = await api('GET', `/vouchers/${id}`);
    expect(gone.success).toBe(false);
  });
});

// ─── B. Other voucher types ───────────────────────────────────────────────────

test.describe('B. Transport, flight and activity vouchers through the UI', () => {
  test('transport voucher: every field in, detail and edit round trip', async ({ page }) => {
    const title = `E2E Transport ${TS}`;
    await page.goto('/vouchers/new');
    await waitForLoad(page);
    await pickRelation(page, 'leadId', LEAD_A_TITLE, LEAD_A_TITLE);
    await pickOption(page, '#voucherType', 'Transport');
    await expect(page.locator('#hotelName')).toHaveCount(0);
    await expect(page.getByText('Transport details')).toBeVisible();

    await pickOption(page, '#vehicleType', 'Innova');
    await pickDate(page, 'Pickup time', 11);
    await page.locator('#driverName').fill(`Driver ${TS}`);
    await page.locator('#driverPhone').fill('+919812345678');
    await page.locator('#pickupLocation').fill('Airport Terminal 1');
    await page.locator('#dropLocation').fill('Hotel Lobby');
    await page.locator('#route').fill('Airport -> Highway -> Hotel');
    await page.locator('#title').fill(title);
    await submitForm(page);
    const id = idFromUrl(page);

    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.getByText('Transport voucher', { exact: true })).toBeVisible();
    await expect(page.getByText('Transport details')).toBeVisible();
    await expect(page.getByText('Innova', { exact: true })).toBeVisible();
    await expect(page.getByText(`Driver ${TS}`, { exact: true })).toBeVisible();
    await expect(page.getByText('+919812345678', { exact: true })).toBeVisible();
    await expect(page.getByText('Airport Terminal 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Hotel Lobby', { exact: true })).toBeVisible();
    await expect(page.getByText('Airport -> Highway -> Hotel')).toBeVisible();
    await expect(page.getByText(shown(11), { exact: true })).toBeVisible();
    await expect(page.getByText('Hotel details')).toHaveCount(0);
    expect((await getVoucher(id)).details.pickupTime).toBeTruthy();

    await page.goto(`/vouchers/${id}/edit`);
    await waitForLoad(page);
    await expect(page.locator('#vehicleType')).toContainText('Innova');
    await expect(page.locator('#driverName')).toHaveValue(`Driver ${TS}`);
    await expect(page.locator('#driverPhone')).toHaveValue('+919812345678');
    await expect(page.locator('#pickupLocation')).toHaveValue('Airport Terminal 1');
    await expect(page.locator('#dropLocation')).toHaveValue('Hotel Lobby');
    await expect(page.locator('#route')).toHaveValue('Airport -> Highway -> Hotel');
    await expect(page.getByRole('button', { name: shown(11) })).toBeVisible();
    await page.locator('#dropLocation').fill('City Center');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL(`**/vouchers/${id}`);
    await expect(page.getByText('City Center', { exact: true })).toBeVisible();
  });

  test('flight voucher: every field in, detail and edit pre-fill', async ({ page }) => {
    const title = `E2E Flight ${TS}`;
    await page.goto('/vouchers/new');
    await waitForLoad(page);
    await pickRelation(page, 'leadId', LEAD_A_TITLE, LEAD_A_TITLE);
    await pickOption(page, '#voucherType', 'Flight');
    await expect(page.getByText('Flight details')).toBeVisible();

    await page.locator('#airline').fill('IndiGo');
    await page.locator('#flightNumber').fill(`6E-${TS % 9000}`);
    await page.locator('#departureAirport').fill('BOM');
    await page.locator('#arrivalAirport').fill('DEL');
    await pickDate(page, 'Departure time', 15);
    await pickDate(page, 'Arrival time', 15);
    await pickOption(page, '#travelClass', 'Business');
    await page.locator('#pnr').fill(`PNR${TS % 100000}`);
    await page.locator('#passengerNames').fill('Passenger A, Passenger B');
    await page.locator('#title').fill(title);
    await submitForm(page);
    const id = idFromUrl(page);

    await expect(page.getByText('Flight voucher', { exact: true })).toBeVisible();
    await expect(page.getByText('Flight details')).toBeVisible();
    await expect(page.getByText('IndiGo', { exact: true })).toBeVisible();
    await expect(page.getByText(`6E-${TS % 9000}`, { exact: true })).toBeVisible();
    await expect(page.getByText('BOM', { exact: true })).toBeVisible();
    await expect(page.getByText('DEL', { exact: true })).toBeVisible();
    await expect(page.getByText('business', { exact: true })).toBeVisible();
    await expect(page.getByText(`PNR${TS % 100000}`, { exact: true })).toBeVisible();
    await expect(page.getByText('Passenger A', { exact: true })).toBeVisible();
    await expect(page.getByText('Passenger B', { exact: true })).toBeVisible();
    await expect(page.getByText(shown(15), { exact: true })).toHaveCount(2);

    await page.goto(`/vouchers/${id}/edit`);
    await waitForLoad(page);
    await expect(page.locator('#airline')).toHaveValue('IndiGo');
    await expect(page.locator('#departureAirport')).toHaveValue('BOM');
    await expect(page.locator('#arrivalAirport')).toHaveValue('DEL');
    await expect(page.locator('#travelClass')).toContainText('Business');
    await expect(page.locator('#passengerNames')).toHaveValue('Passenger A, Passenger B');
    await expect(page.getByRole('button', { name: shown(15) })).toHaveCount(2);
  });

  test('activity voucher: every field in, detail and edit pre-fill', async ({ page }) => {
    const title = `E2E Activity ${TS}`;
    await page.goto('/vouchers/new');
    await waitForLoad(page);
    await pickRelation(page, 'leadId', LEAD_A_TITLE, LEAD_A_TITLE);
    await pickOption(page, '#voucherType', 'Activity');
    await expect(page.getByText('Activity details')).toBeVisible();

    await page.locator('#activityName').fill(`Scuba Diving ${TS}`);
    await pickDate(page, 'Date & time', 16);
    await page.locator('#duration').fill('3 hours');
    await page.locator('#meetingPoint').fill(`Beach Gate ${TS}`);
    await page.locator('#title').fill(title);
    await submitForm(page);
    const id = idFromUrl(page);

    await expect(page.getByText('Activity voucher', { exact: true })).toBeVisible();
    await expect(page.getByText('Activity details')).toBeVisible();
    await expect(page.getByText(`Scuba Diving ${TS}`, { exact: true })).toBeVisible();
    await expect(page.getByText(shown(16), { exact: true })).toBeVisible();
    await expect(page.getByText('3 hours', { exact: true })).toBeVisible();
    await expect(page.getByText(`Beach Gate ${TS}`, { exact: true })).toBeVisible();

    await page.goto(`/vouchers/${id}/edit`);
    await waitForLoad(page);
    await expect(page.locator('#activityName')).toHaveValue(`Scuba Diving ${TS}`);
    await expect(page.locator('#duration')).toHaveValue('3 hours');
    await expect(page.locator('#meetingPoint')).toHaveValue(`Beach Gate ${TS}`);
    await expect(page.getByRole('button', { name: shown(16) })).toBeVisible();
  });

  test('title is auto-generated when left empty', async ({ page }) => {
    await page.goto('/vouchers/new');
    await waitForLoad(page);
    await pickRelation(page, 'leadId', LEAD_A_TITLE, LEAD_A_TITLE);
    await page.locator('#hotelName').fill(`AutoTitle Inn ${TS}`);
    await page.locator('#guestNames').fill('Auto Guest');
    await pickDate(page, 'Check-in', 3);
    await pickDate(page, 'Check-out', 5);
    await submitForm(page);
    await expect(page.getByRole('heading', { name: `Hotel - AutoTitle Inn ${TS}` })).toBeVisible();
  });
});

// ─── C. Form behaviour ────────────────────────────────────────────────────────

test.describe('C. Voucher form — validation, relations, prefill', () => {
  test('submitting an empty form shows required errors and creates nothing', async ({ page }) => {
    let posted = false;
    await page.route('**/vouchers', (route) => {
      if (route.request().method() === 'POST') posted = true;
      return route.continue();
    });
    await page.goto('/vouchers/new');
    await waitForLoad(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText('Lead is required')).toBeVisible();
    await expect(page.getByText('Hotel name is required')).toBeVisible();
    await expect(page.getByText('At least one guest name is required')).toBeVisible();
    await expect(page.getByText('Check-in date is required')).toBeVisible();
    await expect(page.getByText('Check-out date is required')).toBeVisible();
    expect(posted).toBe(false);
    await expect(page).toHaveURL(/\/vouchers\/new$/);

    // Each type has its own required set
    await pickOption(page, '#voucherType', 'Transport');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Vehicle type is required')).toBeVisible();
    await expect(page.getByText('Pickup location is required')).toBeVisible();
    await expect(page.getByText('Drop location is required')).toBeVisible();
    await expect(page.getByText('Pickup time is required')).toBeVisible();

    await pickOption(page, '#voucherType', 'Flight');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Airline is required')).toBeVisible();
    await expect(page.getByText('Flight number is required')).toBeVisible();
    await expect(page.getByText('At least one passenger is required')).toBeVisible();

    await pickOption(page, '#voucherType', 'Activity');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Activity name is required')).toBeVisible();
    await expect(page.getByText('Meeting point is required')).toBeVisible();
  });

  test('lead and supplier are searchable comboboxes, never raw ID inputs', async ({ page }) => {
    await page.goto('/vouchers/new');
    await waitForLoad(page);

    await expect(page.locator('input#leadId, input[name="leadId"], input#supplierId, input[name="supplierId"]')).toHaveCount(0);
    await expect(page.getByPlaceholder(/lead.*id|paste.*id|supplier.*id/i)).toHaveCount(0);

    // Typing narrows the lead options
    await relationBox(page, 'leadId').click();
    await page.locator('[cmdk-input]').fill(LEAD_B_TITLE);
    await expect(page.getByRole('option', { name: new RegExp(LEAD_B_TITLE) })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('option', { name: new RegExp(LEAD_A_TITLE) })).toHaveCount(0);
    await page.locator('[cmdk-input]').fill(`NoSuchLead${TS}zzz`);
    await expect(page.getByRole('option')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('[cmdk-empty]')).toBeVisible();
    await page.keyboard.press('Escape');

    // Supplier too
    await relationBox(page, 'supplierId').click();
    await page.locator('[cmdk-input]').fill(SUPPLIER_NAME);
    await expect(page.getByRole('option', { name: new RegExp(SUPPLIER_NAME) })).toBeVisible({ timeout: 10_000 });
    await page.locator('[cmdk-input]').fill(`NoSuchSupplier${TS}zzz`);
    await expect(page.getByRole('option')).toHaveCount(0, { timeout: 10_000 });
  });

  test('URL params pre-fill the lead and the voucher type', async ({ page }) => {
    await page.goto(`/vouchers/new?leadId=${leadB.id}&type=flight`);
    await waitForLoad(page);
    await expect(relationBox(page, 'leadId')).toContainText(LEAD_B_TITLE, { timeout: 10_000 });
    await expect(page.locator('#voucherType')).toContainText('Flight');
    await expect(page.getByText('Flight details')).toBeVisible();
    await expect(page.locator('#airline')).toBeVisible();
    await expect(page.locator('#hotelName')).toHaveCount(0);
  });

  test('language selector offers English, Hindi and Arabic', async ({ page }) => {
    await page.goto('/vouchers/new');
    await waitForLoad(page);
    await expect(page.locator('#language')).toContainText('English');
    await page.locator('#language').click();
    for (const l of ['English', 'Hindi', 'Arabic']) {
      await expect(page.getByRole('option', { name: l, exact: true })).toBeVisible();
    }
  });
});

// ─── D. List ──────────────────────────────────────────────────────────────────

test.describe('D. Voucher list', () => {
  const PREFIX = `ListV${TS}`;
  const ids: Record<string, string> = {};

  test.beforeAll(async () => {
    const hotel = await seedVoucher(leadA.id, { title: `${PREFIX} Hotel`, type: 'hotel' });
    const flight = await seedVoucher(leadA.id, {
      title: `${PREFIX} Flight`,
      type: 'flight',
      details: {
        airline: 'IndiGo',
        flightNumber: '6E-100',
        departureAirport: 'BOM',
        arrivalAirport: 'DEL',
        departureTime: new Date(Date.now() + 86400000).toISOString(),
        arrivalTime: new Date(Date.now() + 86400000 + 7200000).toISOString(),
        passengers: [{ name: 'Test Passenger' }],
      },
    });
    const activity = await seedVoucher(leadA.id, {
      title: `${PREFIX} Activity`,
      type: 'activity',
      details: { activityName: 'Rafting', dateTime: new Date(Date.now() + 86400000).toISOString(), meetingPoint: 'Camp' },
    });
    ids.hotel = hotel.id;
    ids.flight = flight.id;
    ids.activity = activity.id;
    // Move flight to "sent" so status filter has something distinct
    await api('PATCH', `/vouchers/${flight.id}/status`, { status: 'sent' });
  });

  test('header, count, primary action, filter bar and sidebar entry', async ({ page }) => {
    await page.goto('/dashboard');
    await waitForLoad(page);
    const sidebarLink = page.locator('aside a[href="/vouchers"]').first();
    await expect(sidebarLink).toBeVisible({ timeout: 10_000 });
    await sidebarLink.click();
    await page.waitForURL('**/vouchers**');
    await waitForLoad(page);

    await expect(page.locator('h1', { hasText: 'Vouchers' })).toBeVisible();
    await expect(page.getByRole('button', { name: /new voucher/i }).first()).toBeVisible();
    await expect(page.getByPlaceholder('Search vouchers...')).toBeVisible();
    await expect(page.getByRole('button', { name: /export/i })).toBeVisible();

    await page.getByRole('button', { name: /new voucher/i }).first().click();
    await page.waitForURL('**/vouchers/new');
  });

  test('search narrows the list and the empty state renders when nothing matches', async ({ page }) => {
    await openList(page);
    await searchList(page, PREFIX);
    await expect(page.locator('tbody tr')).toHaveCount(3, { timeout: 10_000 });

    await searchList(page, `${PREFIX} Flight`);
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 10_000 });
    await expect(rowOf(page, `${PREFIX} Flight`)).toBeVisible();
    await expect(page.getByText(`${PREFIX} Hotel`)).toHaveCount(0);

    await searchList(page, `ABSOLUTELY_NO_MATCH_${TS}`);
    await expect(page.getByText('No vouchers yet')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/create your first voucher/i)).toBeVisible();
    await expect(page.locator('tbody tr[data-row-id], tbody tr:has(td a)')).toHaveCount(0);
  });

  test('type filter narrows, shows a chip, and the chip removes it', async ({ page }) => {
    await openList(page);
    await searchList(page, PREFIX);
    await expect(page.locator('tbody tr')).toHaveCount(3, { timeout: 10_000 });

    await page.getByRole('combobox').filter({ hasText: /all types/i }).click();
    for (const t of ['All types', 'Hotel', 'Transport', 'Flight', 'Activity']) {
      await expect(page.getByRole('option', { name: t, exact: true })).toBeVisible();
    }
    await page.getByRole('option', { name: 'Flight', exact: true }).click();

    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 10_000 });
    await expect(rowOf(page, `${PREFIX} Flight`)).toBeVisible();

    // Chip appears and can be removed
    const chip = page.locator('span', { hasText: /^Type:$/ }).locator('xpath=..');
    await expect(chip).toContainText('flight');
    await chip.getByRole('button').click();
    await expect(chip).toHaveCount(0);
    await expect(page.locator('tbody tr')).toHaveCount(3, { timeout: 10_000 });
  });

  test('status filter offers draft/sent/confirmed only and narrows', async ({ page }) => {
    await openList(page);
    await searchList(page, PREFIX);
    await expect(page.locator('tbody tr')).toHaveCount(3, { timeout: 10_000 });

    await page.getByRole('combobox').filter({ hasText: /all status/i }).click();
    for (const s of ['Draft', 'Sent', 'Confirmed']) {
      await expect(page.getByRole('option', { name: s, exact: true })).toBeVisible();
    }
    for (const wrong of [/^issued$/i, /^used$/i, /expired/i]) {
      await expect(page.getByRole('option', { name: wrong })).toHaveCount(0);
    }
    await page.getByRole('option', { name: 'Sent', exact: true }).click();
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 10_000 });
    await expect(rowOf(page, `${PREFIX} Flight`)).toContainText('sent');

    // Combined with a type filter that cannot match -> empty state
    await page.getByRole('combobox').filter({ hasText: /all types/i }).click();
    await page.getByRole('option', { name: 'Hotel', exact: true }).click();
    await expect(page.getByText('No vouchers yet')).toBeVisible({ timeout: 10_000 });
  });

  test('hover reveals View/Edit/Send/Delete and row click opens the detail page', async ({ page }) => {
    await openList(page);
    await searchList(page, `${PREFIX} Hotel`);
    const row = rowOf(page, `${PREFIX} Hotel`);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.hover();
    for (const name of ['View', 'Edit', 'Send', 'Delete']) {
      await expect(row.getByRole('button', { name })).toBeVisible();
    }

    await row.getByRole('button', { name: 'Edit' }).click();
    await page.waitForURL(`**/vouchers/${ids.hotel}/edit`);

    await openList(page);
    await searchList(page, `${PREFIX} Hotel`);
    await rowOf(page, `${PREFIX} Hotel`).locator('td').nth(1).click();
    await page.waitForURL(`**/vouchers/${ids.hotel}`);
    await expect(page.getByRole('heading', { name: `${PREFIX} Hotel` })).toBeVisible();

    // Send hover action leads to the detail page where messaging lives
    await openList(page);
    await searchList(page, `${PREFIX} Hotel`);
    const row2 = rowOf(page, `${PREFIX} Hotel`);
    await row2.hover();
    await row2.getByRole('button', { name: 'Send' }).click();
    await page.waitForURL(`**/vouchers/${ids.hotel}`);
  });

  test('bulk selection deletes several vouchers and refreshes the list', async ({ page }) => {
    const bulk = `BulkV${TS}`;
    await seedVoucher(leadA.id, { title: `${bulk} one` });
    await seedVoucher(leadA.id, { title: `${bulk} two` });
    await openList(page);
    await searchList(page, bulk);
    await expect(page.locator('tbody tr')).toHaveCount(2, { timeout: 10_000 });
    await page.getByRole('checkbox', { name: 'Select all rows' }).check();
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
    await expect(page.getByText('2 voucher(s) deleted')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No vouchers yet')).toBeVisible({ timeout: 10_000 });
  });

  test('infinite scroll loads the next page when the list is scrolled', async ({ page }) => {
    test.setTimeout(240_000);
    const scroll = `ScrollV${TS}`;
    const total = 25;
    for (let start = 0; start < total; start += 5) {
      await Promise.all(
        Array.from({ length: Math.min(5, total - start) }, (_, i) =>
          seedVoucher(leadA.id, { title: `${scroll} ${String(start + i).padStart(2, '0')}` }),
        ),
      );
    }
    await openList(page);
    await searchList(page, scroll);
    await expect(page.locator('tbody tr')).toHaveCount(20, { timeout: 15_000 });

    await page.locator('tbody tr').last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 4000);
    await expect(page.locator('tbody tr')).toHaveCount(total, { timeout: 15_000 });
  });

  test('export downloads a non-empty, themed CSV containing the data', async ({ page }) => {
    await openList(page);
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 10_000 });
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^vouchers_export_\d{4}-\d{2}-\d{2}\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const csv = Buffer.concat(chunks).toString('utf8');
    expect(csv.length).toBeGreaterThan(0);
    const [header, ...lines] = csv.split('\n');
    expect(header).toBe('Title,Type,Lead,Supplier,Status,Language,Created');
    expect(lines.length).toBeGreaterThan(0);
    expect(csv).toContain(`${PREFIX} Hotel`);
    expect(csv).toContain(LEAD_A_TITLE);
    expect(csv).not.toContain('undefined');
    await expect(page.getByText('Vouchers exported successfully')).toBeVisible();
  });
});

// ─── E. Detail, messaging, PDF ────────────────────────────────────────────────

test.describe('E. Voucher detail — messaging and PDF', () => {
  test('Send message opens the Communication Hub dialog, no mailto:/wa.me/tel: anywhere', async ({ page }) => {
    const v = await seedVoucher(leadA.id, { title: `E2E Msg ${TS}` });
    await openList(page);
    await expectNoCommAnchors(page);

    await page.goto(`/vouchers/${v.id}`);
    await waitForLoad(page);
    await expectNoCommAnchors(page);
    await page.getByRole('button', { name: /send message/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText(/email|whatsapp|sms|channel/i).first()).toBeVisible();
    await expectNoCommAnchors(page);
    await page.keyboard.press('Escape');

    await page.goto('/vouchers/new');
    await waitForLoad(page);
    await expectNoCommAnchors(page);
  });

  test('PDF button downloads a non-empty file without an error toast', async ({ page }) => {
    const v = await seedVoucher(leadA.id, { title: `E2E Pdf ${TS}` });
    await page.goto(`/vouchers/${v.id}`);
    await waitForLoad(page);
    const downloadPromise = page.waitForEvent('download', { timeout: 20_000 });
    await page.getByRole('button', { name: 'PDF', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`E2E Pdf ${TS}.pdf`);
    const stream = await download.createReadStream();
    let size = 0;
    for await (const c of stream) size += (c as Buffer).length;
    expect(size).toBeGreaterThan(0);
    await expectNoErrorToast(page);
  });

  test('detail page shows lead, language and created date for a seeded voucher', async ({ page }) => {
    const note = `Important note ${TS}`;
    const v = await seedVoucher(leadA.id, {
      title: `E2E Seeded ${TS}`,
      notes: note,
      language: 'en',
      details: {
        guestNames: ['Alice Seed', 'Bob Seed'],
        hotelName: `Seed Hotel ${TS}`,
        checkIn: '2026-04-01',
        checkOut: '2026-04-04',
        roomType: 'Suite',
        roomCount: 1,
        mealPlan: 'AP',
        confirmationNumber: `SEED-${TS}`,
      },
    });
    await page.goto(`/vouchers/${v.id}`);
    await waitForLoad(page);
    await expect(page.getByText('Voucher info')).toBeVisible();
    await expect(page.getByText('Language', { exact: true })).toBeVisible();
    await expect(page.getByText('EN', { exact: true })).toBeVisible();
    await expect(page.getByText('Created', { exact: true })).toBeVisible();
    await expect(page.getByText(LEAD_A_TITLE).first()).toBeVisible();
    await expect(page.getByText(note)).toBeVisible();
    await expect(page.getByText(`Seed Hotel ${TS}`, { exact: true })).toBeVisible();
    await expect(page.getByText('1 Apr 2026', { exact: true })).toBeVisible();
    await expect(page.getByText('4 Apr 2026', { exact: true })).toBeVisible();
    await expect(page.getByText(`SEED-${TS}`, { exact: true })).toBeVisible();
    await expect(page.getByText('Alice Seed', { exact: true })).toBeVisible();
    await expect(page.getByText('Bob Seed', { exact: true })).toBeVisible();
  });
});

// ─── F. API contract ──────────────────────────────────────────────────────────

test.describe('F. Voucher API contract', () => {
  test('created voucher has the real schema (title/type/status) and no legacy fields', async () => {
    const title = `Schema-Test-${TS}`;
    const v = await seedVoucher(leadA.id, { title });
    expect(v.id).toBeTruthy();
    expect(v.title).toBe(title);
    expect(v.type).toBe('hotel');
    expect(v.status).toBe('draft');
    for (const stale of ['voucherNumber', 'issueDate', 'validUntil', 'items']) expect(v[stale]).toBeUndefined();

    const by = await api('GET', `/vouchers/by-lead/${leadA.id}`);
    expect(by.success).toBe(true);
    expect(JSON.stringify(by.data)).toContain(title);
  });
});
