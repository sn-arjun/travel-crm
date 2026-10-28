import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { seedVehicle, seedDriver, seedContact, seedLead, api } from './helpers/api-seed';
import { pickDate as pickDateAt } from './helpers/date-picker';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const RAW_ANCHORS = 'a[href^="tel:"], a[href^="mailto:"], a[href^="wa.me"], a[href^="https://wa.me"], a[href*="wa.me/"]';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Local YYYY-MM-DD — the date the user picked, independent of UTC. */
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Human date + time as the trip pages show it, e.g. '15 Nov 2026, 9:30 am' (or '15 Nov, 9:30 am' short). */
function when(d: Date, hh: number, mm: number, short = false) {
  const day = d.toLocaleDateString('en-IN', short ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${day}, ${h12}:${pad(mm)} ${hh < 12 ? 'am' : 'pm'}`;
}

/** National digits as stored by the form (E.164) and shown on detail: '+91 98765 43210'. */
function shownPhone(national: string) {
  return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
}

/** A date in the month after today, at the given day-of-month. */
function nextMonth(day: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, day, 0, 0, 0, 0);
}

/** Local ISO timestamp for a given date + HH:mm. */
function iso(d: Date, hh: number, mm = 0) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, 0, 0).toISOString();
}

let uniq = 0;
function unique(prefix: string) {
  uniq += 1;
  return `${prefix}${Date.now().toString(36).toUpperCase()}${uniq}`;
}

async function newVehicle(over: Record<string, any> = {}) {
  const v = await seedVehicle({ registrationNumber: unique('TRP-'), make: 'Honda', model: 'City', seatingCapacity: 4, ...over });
  expect(v.id).toBeTruthy();
  return v as { id: string; registrationNumber: string; make: string; model: string };
}

async function newDriver(over: Record<string, any> = {}) {
  const d = await seedDriver({ name: unique('Trip Driver '), ...over });
  expect(d.id).toBeTruthy();
  return d as { id: string; name: string; phone: string };
}

async function seedTrip(vehicleId: string, driverId: string, over: Record<string, any> = {}) {
  const day = nextMonth(20);
  const res = await api('POST', '/fleet/trips', {
    vehicleId,
    driverId,
    pickupLocation: 'Seed Origin',
    dropLocation: 'Seed Destination',
    pickupDatetime: iso(day, 9),
    dropDatetime: iso(day, 18),
    autoCreateVoucher: false,
    ...over,
  });
  expect(res.success, JSON.stringify(res)).toBeTruthy();
  return res.data as { id: string };
}

/** Opens the first "Pick a date" DatePicker, moves forward N months and clicks a day. */
async function pickDate(page: Page, opts: { monthsForward: number; day: string }) {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + opts.monthsForward, Number(opts.day));
  await pickDateAt(page, page.locator('button:has-text("Pick a date")').first(), target);
}

/** Formats a date the way the DatePicker trigger renders it, using the browser's own locale data. */
async function pickerLabel(page: Page, d: Date) {
  return page.evaluate(
    ([y, m, day]) => new Date(y, m, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    [d.getFullYear(), d.getMonth(), d.getDate()] as [number, number, number],
  );
}

/** Opens a RelationCombobox by its placeholder, types a query and clicks the matching option. */
async function pickRelation(page: Page, placeholder: RegExp, searchPlaceholder: string, query: string, optionText: string) {
  await page.getByRole('combobox').filter({ hasText: placeholder }).click();
  await page.getByPlaceholder(searchPlaceholder).fill(query);
  const option = page.locator('[cmdk-item]').filter({ hasText: optionText });
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}

async function searchTrips(page: Page, text: string) {
  await page.getByPlaceholder(/Search trips/i).fill(text);
  await page.waitForTimeout(800);
  await waitForLoad(page);
}

function tripRow(page: Page, text: string) {
  return page.locator('table tbody tr').filter({ hasText: text });
}

async function confirmDialog(page: Page, name: RegExp) {
  const dlg = page.getByRole('alertdialog').or(page.getByRole('dialog')).last();
  await expect(dlg).toBeVisible({ timeout: 10_000 });
  await dlg.getByRole('button', { name }).click();
}

test.describe('Fleet Trips', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // Full round trip: create → list → detail → edit pre-fill → edit → delete
  // ───────────────────────────────────────────────────────────────────────────

  test('full round trip: create via form, list, detail, edit pre-fill, edit persists, delete', async ({ page }) => {
    const ts = Date.now();
    const vehicle = await newVehicle({ make: 'Honda', model: 'City', seatingCapacity: 4 });
    const vehicle2 = await newVehicle({ make: 'Tata', model: 'Winger', seatingCapacity: 12 });
    const driver = await newDriver();
    const passenger = `RT Passenger ${ts}`;
    const phone = `98765${String(ts).slice(-5)}`;
    const instructions = `Child seat needed ${ts}`;
    const startDay = nextMonth(15);
    const endDay = nextMonth(16);

    await page.goto('/fleet/trips/new');
    await waitForLoad(page);
    await expect(page.locator('h1')).toContainText(/New trip/i);

    // Relations are comboboxes: pick vehicle + driver through the search popover
    await pickRelation(page, /Select vehicle/i, 'Registration or make/model...', vehicle.registrationNumber, vehicle.registrationNumber);
    await pickRelation(page, /Select driver/i, 'Driver name or phone...', driver.name, driver.name);
    await expect(page.getByRole('combobox').filter({ hasText: vehicle.registrationNumber })).toBeVisible();
    await expect(page.getByRole('combobox').filter({ hasText: driver.name })).toBeVisible();

    await page.getByPlaceholder('Enter pickup location').fill('Mumbai Airport');
    await page.getByPlaceholder('Enter drop location').fill('Pune City Center');
    await pickDate(page, { monthsForward: 1, day: '15' });
    await page.locator('#startClock').fill('09:30');
    await pickDate(page, { monthsForward: 1, day: '16' });
    await page.locator('#endClock').fill('18:45');
    await page.locator('#passengerName').fill(passenger);
    await page.locator('input[type="tel"]').fill(phone);
    await page.locator('#specialInstructions').fill(instructions);
    await page.locator('#distance').fill('150');
    await page.locator('#fare').fill('3500');

    await page.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.getByText('Trip created successfully').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForURL(/\/fleet\/trips$/, { timeout: 15_000 });
    await waitForLoad(page);

    // ── List: every column value is present for the new row
    await searchTrips(page, passenger);
    const row = tripRow(page, vehicle.registrationNumber);
    await expect(row).toHaveCount(1, { timeout: 10_000 });
    await expect(row).toContainText('Mumbai Airport → Pune City Center');
    await expect(row).toContainText(vehicle.registrationNumber);
    await expect(row).toContainText(driver.name);
    await expect(row).toContainText(when(startDay, 9, 30, true));
    await expect(row).toContainText('150 km');
    await expect(row).toContainText(/₹\s?3,500/);
    await expect(row).toContainText(/Assigned/i);

    // ── Detail
    await row.click();
    await page.waitForURL(/\/fleet\/trips\/[^/]+$/, { timeout: 10_000 });
    await waitForLoad(page);
    const tripId = page.url().split('/fleet/trips/')[1]!;
    expect(tripId).toBeTruthy();
    expect(tripId).not.toBe('new');

    await expect(page.locator('h1')).toContainText('Mumbai Airport → Pune City Center');
    await expect(page.getByText('Assigned', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Pickup', { exact: true })).toBeVisible();
    await expect(page.getByText('Drop', { exact: true })).toBeVisible();
    await expect(page.getByText(when(startDay, 9, 30)).first()).toBeVisible();
    await expect(page.getByText(when(endDay, 18, 45)).first()).toBeVisible();
    await expect(page.getByText('150 km').first()).toBeVisible();
    await expect(page.getByText(/₹\s?3,500/).first()).toBeVisible();
    await expect(page.getByText(passenger).first()).toBeVisible();
    await expect(page.getByText(shownPhone(phone)).first()).toBeVisible();
    await expect(page.getByText(instructions).first()).toBeVisible();
    await expect(page.getByText('Honda City').first()).toBeVisible();
    await expect(page.getByText(vehicle.registrationNumber).first()).toBeVisible();
    await expect(page.getByText('4 seats').first()).toBeVisible();
    await expect(page.getByText(driver.name).first()).toBeVisible();

    // Persisted with backend field names
    const created = (await api('GET', `/fleet/trips/${tripId}`)).data;
    expect(created.pickupLocation).toBe('Mumbai Airport');
    expect(created.dropLocation).toBe('Pune City Center');
    expect(created.vehicleId).toBe(vehicle.id);
    expect(created.driverId).toBe(driver.id);
    expect(created.passengerName).toBe(passenger);
    expect(created.passengerPhone).toBe(`+91${phone}`);
    expect(created.specialInstructions).toBe(instructions);
    expect(created.estimatedDistanceKm).toBe(150);
    expect(created.estimatedCost).toBe(3500);

    // ── Edit form pre-fills every value
    await page.getByRole('link', { name: /^Edit$/ }).click();
    await page.waitForURL(`**/fleet/trips/${tripId}/edit`, { timeout: 10_000 });
    await waitForLoad(page);
    await expect(page.locator('h1')).toContainText(/Edit trip/i);
    await expect(page.getByRole('combobox').filter({ hasText: vehicle.registrationNumber })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('combobox').filter({ hasText: driver.name })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder('Enter pickup location')).toHaveValue('Mumbai Airport');
    await expect(page.getByPlaceholder('Enter drop location')).toHaveValue('Pune City Center');
    await expect(page.locator('button', { hasText: await pickerLabel(page, startDay) }).first()).toBeVisible();
    await expect(page.locator('button', { hasText: await pickerLabel(page, endDay) }).first()).toBeVisible();
    await expect(page.locator('#startClock')).toHaveValue('09:30');
    await expect(page.locator('#endClock')).toHaveValue('18:45');
    await expect(page.locator('#passengerName')).toHaveValue(passenger);
    await expect(page.locator('input[type="tel"]')).toHaveValue(phone);
    await expect(page.locator('#specialInstructions')).toHaveValue(instructions);
    await expect(page.locator('#distance')).toHaveValue('150');
    await expect(page.locator('#fare')).toHaveValue('3,500');

    // ── Edit every kind of field, save, assert persisted
    const passenger2 = `${passenger} Edited`;
    const phone2 = `91234${String(ts).slice(-5)}`;
    const instructions2 = `Updated instructions ${ts}`;
    await pickRelation(page, new RegExp(vehicle.registrationNumber), 'Registration or make/model...', vehicle2.registrationNumber, vehicle2.registrationNumber);
    await page.getByPlaceholder('Enter pickup location').fill('Mumbai Domestic Airport');
    await page.getByPlaceholder('Enter drop location').fill('Pune Railway Station');
    await page.locator('#startClock').fill('10:15');
    await page.locator('#endClock').fill('19:20');
    await page.locator('#passengerName').fill(passenger2);
    await page.locator('input[type="tel"]').fill(phone2);
    await page.locator('#specialInstructions').fill(instructions2);
    await page.locator('#distance').fill('165');
    await page.locator('#fare').focus();
    await page.locator('#fare').fill('4200');
    await page.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.getByText('Trip updated successfully').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForURL(`**/fleet/trips/${tripId}`, { timeout: 10_000 });
    await waitForLoad(page);

    await expect(page.locator('h1')).toContainText('Mumbai Domestic Airport → Pune Railway Station');
    await expect(page.getByText(when(startDay, 10, 15)).first()).toBeVisible();
    await expect(page.getByText(when(endDay, 19, 20)).first()).toBeVisible();
    await expect(page.getByText('165 km').first()).toBeVisible();
    await expect(page.getByText(/₹\s?4,200/).first()).toBeVisible();
    await expect(page.getByText(passenger2).first()).toBeVisible();
    await expect(page.getByText(shownPhone(phone2)).first()).toBeVisible();
    await expect(page.getByText(instructions2).first()).toBeVisible();
    await expect(page.getByText('Tata Winger').first()).toBeVisible();
    await expect(page.getByText(vehicle2.registrationNumber).first()).toBeVisible();

    const updated = (await api('GET', `/fleet/trips/${tripId}`)).data;
    expect(updated.pickupLocation).toBe('Mumbai Domestic Airport');
    expect(updated.dropLocation).toBe('Pune Railway Station');
    expect(updated.vehicleId).toBe(vehicle2.id);
    expect(updated.passengerName).toBe(passenger2);
    expect(updated.passengerPhone).toBe(`+91${phone2}`);
    expect(updated.specialInstructions).toBe(instructions2);
    expect(updated.estimatedDistanceKm).toBe(165);
    expect(updated.estimatedCost).toBe(4200);
    expect(new Date(updated.pickupDatetime).getHours()).toBe(10);
    expect(new Date(updated.pickupDatetime).getMinutes()).toBe(15);

    // ── Delete from the list, assert it is gone
    await page.goto('/fleet/trips');
    await waitForLoad(page);
    await searchTrips(page, passenger2);
    const updatedRow = tripRow(page, vehicle2.registrationNumber);
    await expect(updatedRow).toHaveCount(1, { timeout: 10_000 });
    await updatedRow.hover();
    await updatedRow.locator('button[aria-label="Delete"]').click();
    await confirmDialog(page, /^Delete$/);
    await expect(page.getByText('Trip deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(tripRow(page, vehicle2.registrationNumber)).toHaveCount(0, { timeout: 10_000 });

    const gone = await api('GET', `/fleet/trips/${tripId}`);
    expect(gone.success).toBeFalsy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Form: validation, comboboxes filter as you type, no raw ID inputs
  // ───────────────────────────────────────────────────────────────────────────

  test('form requires vehicle, driver, route and schedule before saving', async ({ page }) => {
    await page.goto('/fleet/trips/new');
    await waitForLoad(page);
    await page.getByRole('button', { name: /^Save$/ }).click();

    await expect(page.getByText('Pick a vehicle')).toBeVisible();
    await expect(page.getByText('Pick a driver')).toBeVisible();
    await expect(page.getByText('Start location is required')).toBeVisible();
    await expect(page.getByText('End location is required')).toBeVisible();
    await expect(page.getByText('Start date is required')).toBeVisible();
    await expect(page.getByText('End date is required')).toBeVisible();
    await expect(page.getByText('Start time is required')).toBeVisible();
    await expect(page.getByText('End time is required')).toBeVisible();
    await expect(page).toHaveURL(/\/fleet\/trips\/new$/);
  });

  test('vehicle and driver are searchable comboboxes that filter options; no raw ID inputs', async ({ page }) => {
    const vehicleA = await newVehicle({ make: 'Skoda', model: 'Octavia' });
    const vehicleB = await newVehicle({ make: 'Mahindra', model: 'Xylo' });
    const driverA = await newDriver();
    const driverB = await newDriver();

    await page.goto('/fleet/trips/new');
    await waitForLoad(page);

    // Carried forward from M18-C: Passenger section + fields are present, no raw ID inputs
    await expect(page.getByText(/Passenger details/i).first()).toBeVisible();
    await expect(page.locator('#passengerName')).toBeVisible();
    await expect(page.locator('#specialInstructions')).toBeVisible();
    await expect(page.getByPlaceholder(/enter.*vehicle.*id/i)).toHaveCount(0);
    await expect(page.getByPlaceholder(/enter.*driver.*id/i)).toHaveCount(0);
    await expect(page.locator('input[name*="Id" i], input[id*="vehicleId" i], input[id*="driverId" i]')).toHaveCount(0);
    await expect(page.locator('select:not([aria-hidden="true"])')).toHaveCount(0);

    // Vehicle: typing narrows options
    await page.getByRole('combobox').filter({ hasText: /Select vehicle/i }).click();
    const vSearch = page.getByPlaceholder('Registration or make/model...');
    await vSearch.fill(vehicleA.registrationNumber);
    await expect(page.locator('[cmdk-item]').filter({ hasText: vehicleA.registrationNumber })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[cmdk-item]').filter({ hasText: vehicleB.registrationNumber })).toHaveCount(0);
    await vSearch.fill(vehicleB.registrationNumber);
    await expect(page.locator('[cmdk-item]').filter({ hasText: vehicleB.registrationNumber })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[cmdk-item]').filter({ hasText: vehicleA.registrationNumber })).toHaveCount(0);
    await vSearch.fill(`no-such-vehicle-${Date.now()}`);
    await expect(page.getByText('No matches found.')).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');

    // Driver: typing narrows options
    await page.getByRole('combobox').filter({ hasText: /Select driver/i }).click();
    const dSearch = page.getByPlaceholder('Driver name or phone...');
    await dSearch.fill(driverA.name);
    await expect(page.locator('[cmdk-item]').filter({ hasText: driverA.name })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[cmdk-item]').filter({ hasText: driverB.name })).toHaveCount(0);
    // A late results refresh can dismiss the popover between the two searches: reopen it if so.
    if (!(await dSearch.isVisible())) await page.getByRole('combobox').filter({ hasText: /Select driver/i }).click();
    await dSearch.fill(driverB.name);
    await expect(page.locator('[cmdk-item]').filter({ hasText: driverB.name })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[cmdk-item]').filter({ hasText: driverA.name })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Phone + date controls come from the shared components
    await expect(page.locator('input[type="tel"]')).toBeVisible();
    await expect(page.locator('button:has-text("Pick a date")')).toHaveCount(2);
    await expect(page.locator('input[type="date"], input[type="datetime-local"]')).toHaveCount(0);
  });

  test('new trip form pre-fills passenger details from URL params', async ({ page }) => {
    await page.goto('/fleet/trips/new?passengerName=Prefilled%20Pat&passengerPhone=9000011111');
    await waitForLoad(page);
    await expect(page.locator('#passengerName')).toHaveValue('Prefilled Pat');
    await expect(page.locator('input[type="tel"]')).toHaveValue('9000011111');
  });

  test('editing onto a vehicle that is booked in the same window shows the availability error', async ({ page }) => {
    const vehicleA = await newVehicle();
    const vehicleB = await newVehicle();
    const driverA = await newDriver();
    const driverB = await newDriver();
    await seedTrip(vehicleA.id, driverA.id, { passengerName: `Busy ${Date.now()}` });
    const tripB = await seedTrip(vehicleB.id, driverB.id, { passengerName: `Mover ${Date.now()}` });

    await page.goto(`/fleet/trips/${tripB.id}/edit`);
    await waitForLoad(page);
    await pickRelation(page, new RegExp(vehicleB.registrationNumber), 'Registration or make/model...', vehicleA.registrationNumber, vehicleA.registrationNumber);
    await page.getByRole('button', { name: /^Save$/ }).click();

    await expect(page.getByText(/Vehicle not available/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`/fleet/trips/${tripB.id}/edit$`));
    const after = (await api('GET', `/fleet/trips/${tripB.id}`)).data;
    expect(after.vehicleId).toBe(vehicleB.id);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // List: columns, search, status filter, empty state, infinite scroll, export
  // ───────────────────────────────────────────────────────────────────────────

  test('list renders title, search bar, table with Vehicle column, and no error text', async ({ page }) => {
    const vehicle = await newVehicle();
    const driver = await newDriver();
    await seedTrip(vehicle.id, driver.id, { passengerName: `Cols ${Date.now()}` });

    await page.goto('/fleet/trips');
    await waitForLoad(page);

    await expect(page.locator('h1')).toContainText(/^Trips/);
    await expect(page.getByPlaceholder(/search trips/i)).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
    for (const header of ['Route', 'Vehicle', 'Driver', 'Start', 'Distance', 'Fare', 'Status']) {
      // eslint-disable-next-line no-await-in-loop
      await expect(page.getByRole('columnheader', { name: new RegExp(`^${header}`) })).toBeVisible();
    }
    await expect(page.getByRole('columnheader', { name: /^Vehicle ID/i })).toHaveCount(0);
    await expect(page.getByText(/Something went wrong|Error: |404/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /New trip/i }).first()).toBeVisible();
  });

  test('search narrows by passenger, vehicle registration and driver name', async ({ page }) => {
    const ts = Date.now();
    const vehicleA = await newVehicle();
    const vehicleB = await newVehicle();
    const driverA = await newDriver();
    const driverB = await newDriver();
    const passengerA = `Alpha${ts}Pax`;
    const passengerB = `Bravo${ts}Pax`;
    await seedTrip(vehicleA.id, driverA.id, { passengerName: passengerA });
    await seedTrip(vehicleB.id, driverB.id, { passengerName: passengerB });

    await page.goto('/fleet/trips');
    await waitForLoad(page);

    await searchTrips(page, passengerA);
    await expect(tripRow(page, vehicleA.registrationNumber)).toHaveCount(1, { timeout: 10_000 });
    await expect(tripRow(page, vehicleB.registrationNumber)).toHaveCount(0);

    await searchTrips(page, vehicleB.registrationNumber);
    await expect(tripRow(page, vehicleB.registrationNumber)).toHaveCount(1, { timeout: 10_000 });
    await expect(tripRow(page, vehicleA.registrationNumber)).toHaveCount(0);

    await searchTrips(page, driverA.name);
    await expect(tripRow(page, vehicleA.registrationNumber)).toHaveCount(1, { timeout: 10_000 });
    await expect(tripRow(page, vehicleB.registrationNumber)).toHaveCount(0);
  });

  test('status filter narrows the list and can be cleared', async ({ page }) => {
    const ts = Date.now();
    const marker = `Filt${ts}Pax`;
    const vehicleA = await newVehicle();
    const vehicleB = await newVehicle();
    const driverA = await newDriver();
    const driverB = await newDriver();
    await seedTrip(vehicleA.id, driverA.id, { passengerName: `${marker}A` });
    const accepted = await seedTrip(vehicleB.id, driverB.id, { passengerName: `${marker}B` });
    const st = await api('PUT', `/fleet/trips/${accepted.id}/status`, { status: 'accepted' });
    expect(st.data.status).toBe('accepted');

    await page.goto('/fleet/trips');
    await waitForLoad(page);
    await searchTrips(page, marker);
    await expect(tripRow(page, vehicleA.registrationNumber)).toHaveCount(1, { timeout: 10_000 });
    await expect(tripRow(page, vehicleB.registrationNumber)).toHaveCount(1);

    await page.locator('button:has-text("All statuses")').click();
    await page.getByRole('option', { name: 'Accepted' }).click();
    await page.waitForTimeout(800);
    await waitForLoad(page);

    const rows = page.locator('table tbody tr');
    await expect(tripRow(page, vehicleB.registrationNumber)).toHaveCount(1, { timeout: 10_000 });
    await expect(tripRow(page, vehicleA.registrationNumber)).toHaveCount(0);
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      // eslint-disable-next-line no-await-in-loop
      await expect(rows.nth(i)).toContainText(/Accepted/i);
    }

    await page.getByRole('button', { name: /Clear/i }).first().click();
    await page.waitForTimeout(800);
    await waitForLoad(page);
    await expect(tripRow(page, vehicleA.registrationNumber)).toHaveCount(1, { timeout: 10_000 });
    await expect(tripRow(page, vehicleB.registrationNumber)).toHaveCount(1);
  });

  test('empty state renders when filters match nothing', async ({ page }) => {
    await page.goto('/fleet/trips');
    await waitForLoad(page);
    await searchTrips(page, `no-such-trip-${Date.now()}-zzz`);
    await expect(page.getByText('No trips yet')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('table tbody tr[data-row], table tbody tr').filter({ hasText: 'E2E' })).toHaveCount(0);
  });

  test('infinite scroll loads more rows on scroll', async ({ page }) => {
    const marker = `Scroll${Date.now()}Pax`;
    const vehicle = await newVehicle();
    const driver = await newDriver();
    const base = new Date(2031, 0, 1);
    for (let i = 0; i < 25; i++) {
      const day = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      // eslint-disable-next-line no-await-in-loop
      await seedTrip(vehicle.id, driver.id, {
        passengerName: `${marker}${i}`,
        pickupDatetime: iso(day, 9),
        dropDatetime: iso(day, 12),
      });
    }

    await page.goto('/fleet/trips');
    await waitForLoad(page);
    await searchTrips(page, marker);

    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(20, { timeout: 10_000 });
    await rows.last().scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 5000);
    await expect(rows).toHaveCount(25, { timeout: 10_000 });
  });

  test('export downloads a non-empty CSV containing the trip data', async ({ page }) => {
    const vehicle = await newVehicle();
    const driver = await newDriver();
    await seedTrip(vehicle.id, driver.id, { passengerName: `Export${Date.now()}`, pickupLocation: 'Export Origin', dropLocation: 'Export Target' });

    await page.goto('/fleet/trips');
    await waitForLoad(page);

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      page.getByRole('button', { name: /Export/i }).click(),
    ]);
    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import('fs');
    expect(fs.statSync(path!).size).toBeGreaterThan(0);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const csv = fs.readFileSync(path!, 'utf8');
    expect(csv.split('\n')[0]).toBe('Route,Passenger,Type,Vehicle,Driver,Start,Distance (km),Fare,Status');
    expect(csv).toContain('Export Origin -> Export Target');
    expect(csv).toContain(vehicle.registrationNumber);
    expect(csv).toContain(driver.name);
  });

  test('row actions: View opens detail, Edit opens the edit form; hover actions and row click work', async ({ page }) => {
    const vehicle = await newVehicle();
    const driver = await newDriver();
    const trip = await seedTrip(vehicle.id, driver.id, { passengerName: `Rowact${Date.now()}` });

    await page.goto('/fleet/trips');
    await waitForLoad(page);
    await searchTrips(page, vehicle.registrationNumber);
    const row = tripRow(page, vehicle.registrationNumber);
    await expect(row).toHaveCount(1, { timeout: 10_000 });

    await row.hover();
    await row.locator('button[aria-label="View"]').click();
    await page.waitForURL(`**/fleet/trips/${trip.id}`, { timeout: 10_000 });

    await page.goBack();
    await waitForLoad(page);
    await searchTrips(page, vehicle.registrationNumber);
    await tripRow(page, vehicle.registrationNumber).hover();
    await tripRow(page, vehicle.registrationNumber).locator('button[aria-label="Edit"]').click();
    await page.waitForURL(`**/fleet/trips/${trip.id}/edit`, { timeout: 10_000 });
  });

  test('bulk delete removes every selected trip from the list', async ({ page }) => {
    const marker = `Bulk${Date.now()}Pax`;
    const vehicleA = await newVehicle();
    const vehicleB = await newVehicle();
    const driverA = await newDriver();
    const driverB = await newDriver();
    const a = await seedTrip(vehicleA.id, driverA.id, { passengerName: `${marker}A` });
    const b = await seedTrip(vehicleB.id, driverB.id, { passengerName: `${marker}B` });

    await page.goto('/fleet/trips');
    await waitForLoad(page);
    await searchTrips(page, marker);
    await expect(page.locator('table tbody tr')).toHaveCount(2, { timeout: 10_000 });

    await page.locator('thead').getByRole('checkbox').first().check();
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.getByRole('button', { name: /^Delete$/ }).first().click();
    await expect(page.getByText('2 trips deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('table tbody tr').filter({ hasText: 'TRP-' })).toHaveCount(0, { timeout: 10_000 });

    expect((await api('GET', `/fleet/trips/${a.id}`)).success).toBeFalsy();
    expect((await api('GET', `/fleet/trips/${b.id}`)).success).toBeFalsy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Detail: lifecycle, activity timeline, costs, messaging, invoice/voucher
  // ───────────────────────────────────────────────────────────────────────────

  test('status lifecycle: Mark as advances the trip, timeline records each step, edit/delete lock after assigned', async ({ page }) => {
    const vehicle = await newVehicle();
    const driver = await newDriver();
    const trip = await seedTrip(vehicle.id, driver.id, { passengerName: `Life${Date.now()}` });

    await page.goto(`/fleet/trips/${trip.id}`);
    await waitForLoad(page);
    await expect(page.getByRole('link', { name: /^Edit$/ })).toBeVisible();

    await page.getByRole('button', { name: /Mark as Accepted/i }).click();
    await expect(page.getByText(/Trip status updated to Accepted/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Mark as En Route/i })).toBeVisible({ timeout: 10_000 });
    // Backend only allows editing "assigned" trips, so the UI must not offer Edit any more
    await expect(page.getByRole('link', { name: /^Edit$/ })).toHaveCount(0);

    await page.getByRole('button', { name: /Mark as En Route/i }).click();
    await expect(page.getByRole('button', { name: /Mark as Started/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Mark as Started/i }).click();
    await expect(page.getByRole('button', { name: /Mark as Completed/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Mark as Completed/i }).click();
    await expect(page.getByText(/Trip status updated to Completed/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Mark as/i })).toHaveCount(0);

    const after = (await api('GET', `/fleet/trips/${trip.id}`)).data;
    expect(after.status).toBe('completed');

    // Activity tab lists every transition with a formatted timestamp
    await page.getByRole('tab', { name: /Activity/i }).click();
    for (const label of ['Accepted', 'En Route', 'Trip started', 'Completed']) {
      // eslint-disable-next-line no-await-in-loop
      await expect(page.getByRole('tabpanel').getByText(label, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    }
    await expect(page.getByRole('tabpanel').getByText(new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })).first()).toBeVisible();

    // A non-assigned trip cannot be opened for editing
    await page.goto(`/fleet/trips/${trip.id}/edit`);
    await waitForLoad(page);
    await expect(page.getByText(/only.*assigned.*can be edited/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('cancelling a trip asks for confirmation and marks it cancelled', async ({ page }) => {
    const vehicle = await newVehicle();
    const driver = await newDriver();
    const trip = await seedTrip(vehicle.id, driver.id, { passengerName: `Cancel${Date.now()}` });

    await page.goto(`/fleet/trips/${trip.id}`);
    await waitForLoad(page);
    await page.getByRole('button', { name: /More actions/i }).click();
    await page.getByRole('menuitem', { name: /Cancel trip/i }).click();
    await confirmDialog(page, /Cancel trip/i);
    await expect(page.getByText(/Trip status updated to Cancelled/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /^Edit$/ })).toHaveCount(0);
    expect((await api('GET', `/fleet/trips/${trip.id}`)).data.status).toBe('cancelled');
  });

  test('costs: add a cost entry, see it in the list and totals, then delete it', async ({ page }) => {
    const vehicle = await newVehicle();
    const driver = await newDriver();
    const trip = await seedTrip(vehicle.id, driver.id, { passengerName: `Cost${Date.now()}` });
    const note = `Toll at Khopoli ${Date.now()}`;

    await page.goto(`/fleet/trips/${trip.id}`);
    await waitForLoad(page);
    await page.getByRole('tab', { name: /Related/i }).click();
    await expect(page.getByText('Cost entries (0)')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No cost entries yet')).toBeVisible();

    await page.getByRole('button', { name: /Add cost/i }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox').click();
    // Only the cost types the backend accepts are offered
    await expect(page.getByRole('option', { name: 'Maintenance' })).toHaveCount(0);
    await page.getByRole('option', { name: 'Toll', exact: true }).click();
    await dialog.locator('#costAmount').fill('450');
    await dialog.locator('#costNotes').fill(note);
    await dialog.getByRole('button', { name: /^Add cost$/ }).click();

    await expect(page.getByText('Cost added').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Cost entries (1)')).toBeVisible({ timeout: 10_000 });
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText('Toll', { exact: true })).toBeVisible();
    await expect(panel.getByText(note)).toBeVisible();
    await expect(panel.getByText(/₹\s?450/).first()).toBeVisible();
    await expect(
      panel.getByText(new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })).first(),
    ).toBeVisible();
    await expect(panel.getByText('Invalid Date')).toHaveCount(0);

    // Backend received a real cost row with the note as its description
    const costs = (await api('GET', `/fleet/trips/${trip.id}/costs`)).data;
    expect(costs.costs).toHaveLength(1);
    expect(costs.costs[0].cost_type).toBe('toll');
    expect(costs.costs[0].amount).toBe(450);
    expect(costs.costs[0].description).toBe(note);

    // Total feeds the Overview stat
    await page.getByRole('tab', { name: /Overview/i }).click();
    await expect(page.getByText('Total costs')).toBeVisible();
    await expect(page.getByRole('tabpanel').getByText(/₹\s?450/).first()).toBeVisible();

    // Delete
    await page.getByRole('tab', { name: /Related/i }).click();
    await page.getByRole('button', { name: 'Delete cost' }).click();
    await confirmDialog(page, /^Delete$/);
    await expect(page.getByText('Cost deleted').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Cost entries (0)')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('No cost entries yet')).toBeVisible();
    expect((await api('GET', `/fleet/trips/${trip.id}/costs`)).data.costs).toHaveLength(0);
  });

  test('messaging the driver opens SendMessageDialog; no mailto/wa.me/tel anchors anywhere', async ({ page }) => {
    const vehicle = await newVehicle();
    const driver = await newDriver({ phone: `+9190002${String(Date.now()).slice(-5)}` });
    const trip = await seedTrip(vehicle.id, driver.id, { passengerName: `Comms${Date.now()}`, passengerPhone: '9000033333' });

    await page.goto(`/fleet/trips/${trip.id}`);
    await waitForLoad(page);
    expect(await page.locator(RAW_ANCHORS).count()).toBe(0);

    await page.getByRole('button', { name: /Send message/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog).toContainText(driver.name);
    expect(await page.locator(RAW_ANCHORS).count()).toBe(0);
    await page.keyboard.press('Escape');

    // The list page has no raw messaging links either
    await page.goto('/fleet/trips');
    await waitForLoad(page);
    expect(await page.locator(RAW_ANCHORS).count()).toBe(0);
  });

  test('voucher: trip with a passenger already has one and links to it; otherwise Generate voucher creates and opens it', async ({ page }) => {
    const vehicleA = await newVehicle();
    const vehicleB = await newVehicle();
    const driverA = await newDriver();
    const driverB = await newDriver();
    // vouchers.lead_id is NOT NULL, so both trips belong to a lead
    const contact = await seedContact();
    const lead = await seedLead(contact.id);
    const withVoucher = await seedTrip(vehicleA.id, driverA.id, { passengerName: `Voucher${Date.now()}`, leadId: lead.id, autoCreateVoucher: true });
    const without = await seedTrip(vehicleB.id, driverB.id, { passengerName: `NoVoucher${Date.now()}`, leadId: lead.id });

    // Auto-created voucher → action links to it
    const existing = (await api('GET', `/fleet/trips/${withVoucher.id}`)).data;
    expect(existing.voucherId).toBeTruthy();
    await page.goto(`/fleet/trips/${withVoucher.id}`);
    await waitForLoad(page);
    await page.getByRole('button', { name: /More actions/i }).click();
    await page.getByRole('menuitem', { name: /View voucher/i }).click();
    await page.waitForURL(`**/vouchers/${existing.voucherId}`, { timeout: 10_000 });

    // No voucher yet → generate, then land on the new voucher
    await page.goto(`/fleet/trips/${without.id}`);
    await waitForLoad(page);
    await page.getByRole('button', { name: /More actions/i }).click();
    await page.getByRole('menuitem', { name: /Generate voucher/i }).click();
    await expect(page.getByText('Voucher generated').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(/\/vouchers\/[^/]+$/, { timeout: 10_000 });
    const voucherId = page.url().split('/vouchers/')[1]!;
    expect(voucherId).not.toBe('undefined');
    const linked = (await api('GET', `/fleet/trips/${without.id}`)).data;
    expect(linked.voucherId).toBe(voucherId);
  });

  test('invoice: without a linked contact the real reason is shown; with one, Generate invoice opens the new invoice', async ({ page }) => {
    const vehicleA = await newVehicle();
    const vehicleB = await newVehicle();
    const driverA = await newDriver();
    const driverB = await newDriver();
    const contact = await seedContact();
    const noContact = await seedTrip(vehicleA.id, driverA.id, { estimatedCost: 2500 });
    const withContact = await seedTrip(vehicleB.id, driverB.id, { estimatedCost: 2500, contactId: contact.id });

    await page.goto(`/fleet/trips/${noContact.id}`);
    await waitForLoad(page);
    await page.getByRole('button', { name: /More actions/i }).click();
    await page.getByRole('menuitem', { name: /Generate invoice/i }).click();
    await expect(page.getByText(/no linked contact/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(new RegExp(`/fleet/trips/${noContact.id}$`));

    await page.goto(`/fleet/trips/${withContact.id}`);
    await waitForLoad(page);
    await page.getByRole('button', { name: /More actions/i }).click();
    await page.getByRole('menuitem', { name: /Generate invoice/i }).click();
    await expect(page.getByText('Invoice generated').first()).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(/\/invoices\/[^/]+$/, { timeout: 10_000 });
    const invoiceId = page.url().split('/invoices/')[1]!;
    expect(invoiceId).not.toBe('undefined');
    const linked = (await api('GET', `/fleet/trips/${withContact.id}`)).data;
    expect(linked.invoiceId).toBe(invoiceId);
  });

  test('detail of a missing trip shows the not-found empty state, not a crash', async ({ page }) => {
    await page.goto('/fleet/trips/00000000-0000-7000-8000-00000000dead');
    await waitForLoad(page);
    await expect(page.getByText('Trip not found')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Back to trips/i }).click();
    await page.waitForURL(/\/fleet\/trips$/, { timeout: 10_000 });
  });

  test('trips API requires authentication', async () => {
    const { API_URL } = await import('./helpers/auth');
    const noAuth = await fetch(`${API_URL}/fleet/trips`);
    expect(noAuth.status).toBe(401);
    const badToken = await fetch(`${API_URL}/fleet/trips`, { headers: { Authorization: 'Bearer not-a-real-token' } });
    expect(badToken.status).toBe(401);
  });
});
