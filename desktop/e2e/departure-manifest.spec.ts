import fs from 'node:fs';

import { test, expect } from './fixtures';
import { api, seedContact, seedItinerary, seedLead } from './helpers/api-seed';
import { localDay } from './helpers/date-picker';

// R146: seats left on the calendar, the lead and the quote; the manifest with its CSV export and room grouping; the
// departure_seats report; live seat counts; the "Create coach trips" button. The departure, its stops and two parties are made
// through the API; every check is on a screen. No raw id is typed anywhere.

const stamp = Date.now().toString(36).toUpperCase();
const CAPACITY = 12;

/**
 * A day within the next 25 that is still in the current year (the report's default range is this year), picked at random so
 * a run on a stack that earlier runs filled does not meet more than the three entries a month cell shows.
 */
function pickStartDate(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const next = new Date(d);
  next.setDate(next.getDate() + 1 + Math.floor(Math.random() * 25));
  return next.getFullYear() === d.getFullYear() ? next : d;
}
const START = pickStartDate();

let depId = '';
let code = '';
let tourTitle = '';
let stopNames: string[] = [];
let stopIds: string[] = [];

async function hold(name: string, passengers: Array<Record<string, unknown>>, confirm = false) {
  const res = await api('POST', `/departures/${depId}/bookings`, {
    contact: { name, email: `${name.toLowerCase().replace(/\W+/g, '.')}.${stamp.toLowerCase()}@r146.test` },
    passengers,
  });
  expect(res.success, JSON.stringify(res)).toBe(true);
  if (confirm) expect((await api('POST', `/seat-bookings/${res.data.id}/confirm`, {})).success).toBe(true);
  return res.data as { id: string; passengers: Array<{ id: string }> };
}

test.describe('Departure seats, manifest and reports (R146)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const on = await api('PUT', '/departures/settings', {
      enabled: true,
      holdExpiryHours: 48,
      confirmMode: 'manual',
      waitlist: { enabled: true, offerMode: 'suggest', offerHoldHours: 24 },
    });
    expect(on.success).toBe(true);

    tourTitle = `Manifest Tour ${stamp}`;
    const tour = await api('POST', '/tours', { code: `MT-${stamp}`, title: tourTitle, destination: 'Alps', durationDays: 3, defaultCapacity: CAPACITY });
    expect(tour.success, JSON.stringify(tour)).toBe(true);
    const dep = await api('POST', '/departures', { tourId: tour.data.id, startDate: localDay(START), startTime: '08:00', capacityMode: 'manual', capacity: CAPACITY });
    expect(dep.success, JSON.stringify(dep)).toBe(true);
    depId = dep.data.id;
    code = dep.data.code;
    const stops = await api('PUT', `/departures/${depId}/stops`, {
      stops: [
        { name: `Utrecht ${stamp}`, localTime: '08:00', documentsCheck: true },
        { name: `Amersfoort ${stamp}`, localTime: '08:40' },
      ],
    });
    expect(stops.success, JSON.stringify(stops)).toBe(true);
    stopNames = (stops.data as Array<{ name: string }>).map((s) => s.name);
    stopIds = (stops.data as Array<{ id: string }>).map((s) => s.id);
    expect((await api('POST', `/departures/${depId}/status`, { status: 'open' })).success).toBe(true);

    // 5 seats taken: a confirmed party of three (two of them want to share a double room) and a held party of two.
    await hold(`Confirmed Party ${stamp}`, [
      { firstName: 'Anna', lastName: 'Visser', gender: 'female', pickupStopId: stopIds[0], roomType: 'double', shareOk: true },
      { firstName: 'Bea', lastName: 'Visser', gender: 'female', pickupStopId: stopIds[0], roomType: 'double', shareOk: true },
      { firstName: 'Cas', lastName: 'Visser', gender: 'male', pickupStopId: stopIds[1], roomType: 'single' },
    ], true);
    await hold(`Held Party ${stamp}`, [
      { firstName: 'Dirk', lastName: 'Bakker', gender: 'male', pickupStopId: stopIds[1] },
      { firstName: 'Eva', lastName: 'Bakker', gender: 'female', pickupStopId: stopIds[1] },
    ]);
  });

  test.afterAll(async () => {
    // Leave the agency as other specs expect it: group tours off.
    await api('PUT', '/departures/settings', { enabled: false });
  });

  test('the calendar shows seats left on the departure and opens a drawer with a link to its page', async ({ page }) => {
    await page.goto('/calendar');
    await page.getByRole('button', { name: /team/i }).click();
    // The departure falls in next month on the last day of a month.
    if (START.getMonth() !== new Date().getMonth()) await page.getByRole('button', { name: 'Next' }).click();
    const entry = page.getByTestId('calendar-departure-event').filter({ hasText: code });
    await expect(entry).toBeVisible({ timeout: 15_000 });
    const chip = entry.getByTestId('departure-seats-chip');
    await expect(chip).toHaveText('7 left');
    await expect(chip).toHaveAttribute('data-left', '7');

    await entry.click();
    const drawer = page.getByTestId('departure-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('seats-bar')).toHaveAttribute('data-left', '7');
    await drawer.getByTestId('departure-drawer-open').click();
    await page.waitForURL(new RegExp(`/departures/${depId}$`));
  });

  test('the lead page has a Departure card: link a departure, hold seats, see the seats left, confirm', async ({ page }) => {
    const contact = await seedContact({ name: `Lead Owner ${stamp}` });
    const lead = await seedLead(contact.id, { title: `Group Lead ${stamp}`, destinations: ['Alps'], paxAdults: 2, paxChildren: 0, tripType: 'group' });
    await page.goto(`/leads/${lead.id}`);
    const card = page.getByTestId('lead-departure-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('No departure linked');

    await page.getByTestId('lead-link-departure').click();
    await page.getByRole('combobox', { name: 'Link a departure' }).click();
    await page.getByPlaceholder(/Search departures/i).fill(code);
    await page.getByRole('option', { name: new RegExp(code) }).first().click();
    await page.getByTestId('lead-link-save').click();

    await expect(card.getByRole('link', { name: code })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('lead-departure-seats-left')).toHaveAttribute('data-left', '7');

    // Hold the party size of the lead (2 seats).
    await page.getByTestId('lead-hold-seats').click();
    await expect(page.locator('#lead-hold-count')).toHaveValue('2');
    await page.getByTestId('lead-hold-confirm').click();
    const booking = page.getByTestId('lead-booking');
    await expect(booking).toHaveAttribute('data-status', 'held', { timeout: 15_000 });
    await expect(booking).toContainText('Seats for this lead: 2');
    await expect(page.getByTestId('lead-departure-seats-left')).toHaveAttribute('data-left', '5');

    await page.getByTestId('lead-confirm-seats').click();
    await expect(booking).toHaveAttribute('data-status', 'confirmed', { timeout: 15_000 });
    await expect(page.getByTestId('lead-departure-seats-left')).toHaveAttribute('data-left', '5');
  });

  test('a quote linked to the departure shows the seats it asks for and the seats left', async ({ page }) => {
    const contact = await seedContact({ name: `Quote Owner ${stamp}` });
    const lead = await seedLead(contact.id, { title: `Quote Lead ${stamp}`, destinations: ['Alps'], paxAdults: 3, tripType: 'group' });
    const itinerary = await seedItinerary(lead.id, { title: `Group quote ${stamp}` });
    await page.goto(`/itineraries/${itinerary.id}`);
    const panel = page.getByTestId('quote-departure-panel');
    await expect(panel).toContainText('not linked to a departure');

    await page.getByTestId('quote-link-departure').click();
    await page.getByRole('combobox', { name: 'Link departure' }).click();
    await page.getByPlaceholder(/Search departures/i).fill(code);
    await page.getByRole('option', { name: new RegExp(code) }).first().click();
    await page.getByLabel('Seats requested').fill('4');
    await page.getByTestId('quote-link-save').click();

    const text = page.getByTestId('quote-seats-text');
    await expect(text).toHaveAttribute('data-left', '5', { timeout: 15_000 });
    await expect(text).toHaveAttribute('data-requested', '4');
    await expect(text).toContainText('4 seats requested, 5 left');
    await expect(panel.getByRole('link', { name: code })).toBeVisible();
    await expect(panel.getByRole('alert')).toHaveCount(0);
  });

  test('the manifest lists who boards where and exports the pickup list as a CSV', async ({ page }) => {
    await page.goto(`/departures/${depId}`);
    await page.getByRole('tab', { name: 'Manifest' }).click();
    await expect(page.getByTestId('manifest-tab')).toBeVisible();

    const groups = page.getByTestId('manifest-group');
    await expect(groups.first()).toHaveAttribute('data-group', stopNames[0]!, { timeout: 15_000 });
    await expect(groups.nth(1)).toHaveAttribute('data-group', stopNames[1]!);
    await expect(groups.first().getByTestId('manifest-row')).toHaveCount(2);
    await expect(groups.nth(1).getByTestId('manifest-row')).toHaveCount(3);
    await expect(page.getByTestId('manifest-totals')).toContainText('5 passengers, 5 seats');

    // Filter by pickup point.
    await page.getByRole('combobox', { name: 'Pickup point' }).click();
    await page.getByRole('option', { name: stopNames[0]! }).click();
    await expect(page.getByTestId('manifest-row')).toHaveCount(2);
    await page.getByRole('button', { name: /clear/i }).first().click();
    await expect(page.getByTestId('manifest-row')).toHaveCount(5);

    await page.getByTestId('manifest-export').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('manifest-export-csv').click()]);
    expect(download.suggestedFilename()).toBe(`${code}-pickup.csv`);
    const text = fs.readFileSync((await download.path())!, 'utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trim().split(/\r?\n/);
    expect(lines[0]).toBe('Pickup point,Time,Name,Seats,Phone,Documents');
    expect(lines).toHaveLength(6); // header and five passengers
    expect(lines.filter((l) => l.startsWith(`${stopNames[0]},08:00,`))).toHaveLength(2);
    expect(lines.filter((l) => l.startsWith(`${stopNames[1]},08:40,`))).toHaveLength(3);
    expect(lines.some((l) => l.includes('Anna Visser'))).toBe(true);
  });

  test('the rooming list groups the people who share, after staff confirm the suggestion', async ({ page }) => {
    await page.goto(`/departures/${depId}`);
    await page.getByRole('tab', { name: 'Manifest' }).click();
    await page.getByTestId('manifest-view-rooming').click();
    await expect(page.getByTestId('manifest-group').first()).toHaveAttribute('data-group', 'Not in a room yet', { timeout: 15_000 });

    await page.getByTestId('auto-group-rooms').click();
    const list = page.getByTestId('auto-group-list');
    await expect(list).toBeVisible();
    await expect(list.locator('li')).toHaveCount(1);
    await expect(list).toContainText('Anna Visser');
    await expect(list).toContainText('Bea Visser');
    await page.getByTestId('auto-group-save').click();

    await expect(page.getByTestId('manifest-group').first()).toHaveAttribute('data-group', '1', { timeout: 15_000 });
    await expect(page.getByTestId('manifest-group').first().getByTestId('manifest-row')).toHaveCount(2);
    await expect(page.getByTestId('manifest-group').nth(1)).toHaveAttribute('data-group', 'Not in a room yet');

    // The PDF comes back as a file too.
    await page.getByTestId('manifest-export').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('manifest-export-pdf').click()]);
    expect(download.suggestedFilename()).toBe(`${code}-rooming.pdf`);
    const bytes = fs.readFileSync((await download.path())!);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  test('the passengers editor saves the seat number and the documents status', async ({ page }) => {
    await page.goto(`/departures/${depId}`);
    await page.getByRole('tab', { name: 'Bookings' }).click();
    await page.locator('table tbody tr', { hasText: `Held Party ${stamp}` }).first().getByTestId('booking-status').click();
    const drawer = page.getByTestId('booking-drawer');
    const first = drawer.getByTestId('passenger-row').first();
    await expect(first).toBeVisible({ timeout: 15_000 });
    await first.getByLabel('Seat number').fill('14A');
    await first.getByRole('combobox', { name: 'Documents status' }).click();
    await page.getByRole('option', { name: 'checked' }).click();
    await drawer.getByTestId('save-passengers').click();
    await expect(page.getByText('Passengers saved').first()).toBeVisible({ timeout: 15_000 });

    const bookings = await api('GET', `/departures/${depId}/bookings`);
    const held = (bookings.data as Array<{ id: string; contactName?: string }>).find((b) => b.contactName?.includes(`Held Party ${stamp}`))!;
    const detail = await api('GET', `/seat-bookings/${held.id}`);
    const saved = (detail.data.passengers as Array<{ seatNumber: string | null; documentsStatus: string }>).find((p) => p.seatNumber === '14A');
    expect(saved?.documentsStatus).toBe('checked');
  });

  test('seat counts on the departure page change live when somebody else holds seats', async ({ page }) => {
    await page.goto(`/departures/${depId}`);
    await page.getByRole('tab', { name: 'Overview' }).click();
    const bar = page.getByTestId('seats-bar').first();
    await expect(bar).toBeVisible();
    const before = Number(await bar.getAttribute('data-held'));

    // Another session: no reload, no focus change on this page.
    await hold(`Live Party ${stamp}`, [{ firstName: 'Fien', lastName: 'Live', pickupStopId: stopIds[0] }]);
    await expect.poll(async () => Number(await bar.getAttribute('data-held')), { timeout: 15_000 }).toBe(before + 1);
  });

  test('Create coach trips makes the trips of the departure and links to them', async ({ page }) => {
    await page.goto(`/departures/${depId}`);
    await page.getByTestId('create-coach-trips').click();
    const list = page.getByTestId('coach-trip-list');
    await expect(list).toBeVisible({ timeout: 15_000 });
    await expect(list.getByTestId('coach-trip-link')).toHaveCount(1);
    await list.getByTestId('coach-trip-link').click();
    await page.waitForURL(/\/fleet\/trips\/[0-9a-f-]{36}$/);

    // Back on the departure the button now opens the list instead of making a second set.
    await page.goto(`/departures/${depId}`);
    await expect(page.getByTestId('open-coach-trips')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('create-coach-trips')).toHaveCount(0);
  });

  test('the departure_seats report lists the departure, and the Tours group follows the agency switch', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.getByRole('link', { name: /Tours/ }).first()).toBeVisible({ timeout: 15_000 });
    await page.goto('/reports/tours');
    await expect(page.getByTestId('tours-report-seats')).toBeVisible();
    const row = page.locator('table tbody tr', { hasText: code }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(tourTitle);

    await page.getByTestId('tours-report-sales').click();
    await expect(page.locator('table tbody tr', { hasText: tourTitle }).first()).toBeVisible({ timeout: 20_000 });

    // Switched off by the agency: the hub shows no Tours group and the calendar no chips.
    expect((await api('PUT', '/departures/settings', { enabled: false })).success).toBe(true);
    try {
      await page.goto('/reports');
      await expect(page.getByRole('heading', { name: 'Reports Hub' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Tours.*Seats and load per departure/ })).toHaveCount(0);
    } finally {
      expect((await api('PUT', '/departures/settings', { enabled: true })).success).toBe(true);
    }
  });
});
