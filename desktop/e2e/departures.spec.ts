import { test, expect, type Page } from './fixtures';
import { api, seedContact, seedLead, seedVehicle } from './helpers/api-seed';
import { pickDate } from './helpers/date-picker';

// Group departures end to end from the desktop: a tour with stops and prices, two departures with a coach, seats held,
// confirmed, filled, waitlisted, cancelled, offered and moved. No raw id is typed anywhere: every relation is a combobox.

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(12, 0, 0, 0);
  return d;
};

/** The numbers on the seats bar of the open departure page (Overview tab). */
async function seatsOf(page: Page) {
  const bar = page.getByTestId('seats-bar').first();
  await expect(bar).toBeVisible();
  const num = async (name: string) => Number(await bar.getAttribute(name));
  return { left: await num('data-left'), held: await num('data-held'), confirmed: await num('data-confirmed'), waitlisted: await num('data-waitlisted'), capacity: await num('data-capacity') };
}

async function expectSeats(page: Page, want: Partial<{ left: number; held: number; confirmed: number; waitlisted: number; capacity: number }>) {
  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect.poll(async () => seatsOf(page), { timeout: 15_000 }).toMatchObject(want);
}

test.describe('Group departures', () => {
  test('tour, departures, holds, confirmation, passengers, waitlist, cancel, offer and move', async ({ page }) => {
    test.setTimeout(300_000);
    const stamp = Date.now().toString(36).toUpperCase();

    // The agency has group tours on; the departures are made through the screens below.
    const on = await api('PUT', '/departures/settings', { enabled: true, holdExpiryHours: 48, confirmMode: 'manual', waitlist: { enabled: true, offerMode: 'suggest', offerHoldHours: 24 } });
    expect(on.success).toBe(true);
    const vehicle = await seedVehicle({ registrationNumber: `GT-${stamp}`, seatingCapacity: 4 });
    const leads: Array<{ id: string; title: string; contactName: string }> = [];
    for (const n of [1, 2, 3]) {
      const contact = await seedContact({ name: `Group Guest ${n} ${stamp}` });
      const lead = await seedLead(contact.id, { title: `Group Lead ${n} ${stamp}` });
      leads.push({ id: lead.id, title: lead.title, contactName: contact.name });
    }

    // ---- a tour with a stop and a price
    await page.goto('/tours/new');
    await page.locator('#tour-title').fill(`Alpine Express ${stamp}`);
    await expect(page.locator('#tour-code')).not.toHaveValue(''); // proposed from the title
    await page.locator('#tour-code').fill(`AE-${stamp}`);
    await page.getByRole('tab', { name: /^Stops/ }).click();
    await page.getByTestId('add-stop').click();
    await page.getByLabel('Name', { exact: true }).first().fill('Central Station');
    await page.getByRole('tab', { name: /^Prices/ }).click();
    await page.getByTestId('add-price-band').click();
    await page.getByTestId('price-row').getByLabel('Amount').fill('1200');
    await page.getByTestId('tour-save').click();
    await page.waitForURL(/\/tours\/[0-9a-f-]{36}$/);
    const tourId = page.url().split('/').pop() as string;
    await expect(page.getByRole('heading', { name: `Alpine Express ${stamp}` }).first()).toBeVisible();
    await expect(page.getByTestId('tour-prices')).toContainText('Adult');
    await expect(page.getByTestId('tour-no-departures')).toBeVisible();

    // ---- the tour list finds it and shows the drawer
    await page.goto('/tours');
    await page.getByPlaceholder(/Search tours/i).fill(`Alpine Express ${stamp}`);
    const tourRow = page.locator('table tbody tr', { hasText: `Alpine Express ${stamp}` }).first();
    await expect(tourRow).toBeVisible({ timeout: 15_000 });
    await tourRow.click();
    await expect(page.getByTestId('tour-drawer')).toBeVisible();
    await page.keyboard.press('Escape');

    // ---- two departures at once, with a coach
    await page.goto(`/tours/${tourId}`);
    await page.getByTestId('add-departures').click();
    await page.waitForURL(/\/departures\/new\?tourId=/);
    await expect(page.getByRole('combobox', { name: 'Tour', exact: true })).toContainText(`Alpine Express ${stamp}`);
    await pickDate(page, page.getByRole('button', { name: 'Add a date' }), day(60));
    await pickDate(page, page.getByRole('button', { name: 'Add a date' }), day(67));
    await expect(page.getByTestId('departure-dates').locator('span').first()).toBeVisible();
    await page.getByTestId('add-vehicle').click();
    const vehicleRow = page.getByTestId('vehicle-row').first();
    await vehicleRow.getByRole('combobox').first().click();
    await page.getByPlaceholder(/Search vehicles/i).fill(`GT-${stamp}`);
    await page.getByRole('option', { name: new RegExp(`GT-${stamp}`) }).first().click();
    await expect(vehicleRow.getByLabel('Seats')).toHaveValue('4');
    await page.getByTestId('departure-save').click();
    await page.waitForURL(new RegExp(`/tours/${tourId}$`));
    const rows = page.getByTestId('tour-departures').locator('li');
    await expect(rows).toHaveCount(2);

    // ---- open the first departure for booking
    await rows.first().getByRole('link').click();
    await page.waitForURL(/\/departures\/[0-9a-f-]{36}$/);
    const depA = page.url().split('/').pop() as string;
    await expect(page.getByTestId('departure-status')).toHaveText('Draft');
    await page.getByTestId('status-menu-trigger').click();
    await page.getByRole('menuitem', { name: 'Open for booking' }).click();
    await expect(page.getByTestId('departure-status')).toHaveText('Open');
    await expectSeats(page, { capacity: 4, left: 4, held: 0, confirmed: 0 });

    // the second departure is opened through the API: this spec is about the first one's seats
    const list = await api('GET', `/departures?tour=${tourId}`);
    const depB = (list.data as Array<{ id: string }>).find((d) => d.id !== depA)!.id;
    expect((await api('POST', `/departures/${depB}/status`, { status: 'open' })).success).toBe(true);

    // ---- hold 3 seats for lead 1 (a lead picked from a combobox)
    await page.getByRole('tab', { name: 'Bookings' }).click();
    await expect(page.getByText('No bookings yet')).toBeVisible();
    await page.getByTestId('hold-seats-button').click();
    const dialog = page.getByTestId('hold-seats-dialog');
    await expect(dialog.getByTestId('seats-bar')).toHaveAttribute('data-left', '4');
    expect(await dialog.locator('input[name*="Id" i], input[placeholder*="lead id" i]').count()).toBe(0);
    await dialog.getByRole('combobox', { name: 'Lead' }).click();
    await page.getByPlaceholder(/Search leads/i).fill(leads[0]!.title);
    await page.getByRole('option', { name: new RegExp(leads[0]!.title) }).first().click();
    await dialog.locator('#hold-seats').fill('3');
    await dialog.getByTestId('hold-submit').click();
    const row1 = page.locator('table tbody tr', { hasText: leads[0]!.contactName });
    await expect(row1.getByTestId('booking-status')).toHaveText('Held');
    await expect(row1.getByTestId('hold-countdown')).toBeVisible();
    await expectSeats(page, { left: 1, held: 3, confirmed: 0 });

    // ---- confirm with one click
    await page.getByRole('tab', { name: 'Bookings' }).click();
    await row1.hover();
    await row1.getByTestId('row-confirm').click();
    await expect(row1.getByTestId('booking-status')).toHaveText('Confirmed');
    await expectSeats(page, { left: 1, held: 0, confirmed: 3 });

    // ---- passengers: three rows, a first name each, saved
    await page.getByRole('tab', { name: 'Bookings' }).click();
    await row1.click();
    const drawer = page.getByTestId('booking-drawer');
    for (let i = 0; i < 3; i++) await drawer.getByRole('button', { name: 'Add passenger' }).click();
    const pax = drawer.getByTestId('passenger-row');
    await expect(pax).toHaveCount(3);
    for (let i = 0; i < 3; i++) await pax.nth(i).getByLabel('First name').fill(`Traveller${i + 1}`);
    await drawer.getByTestId('save-passengers').click();
    await expect(drawer.getByTestId('passenger-row')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expectSeats(page, { left: 1, confirmed: 3 });

    // ---- fill the departure: 1 seat for lead 2 leaves none
    await page.getByRole('tab', { name: 'Bookings' }).click();
    await page.getByTestId('hold-seats-button').click();
    await dialog.getByRole('combobox', { name: 'Lead' }).click();
    await page.getByPlaceholder(/Search leads/i).fill(leads[1]!.title);
    await page.getByRole('option', { name: new RegExp(leads[1]!.title) }).first().click();
    await dialog.locator('#hold-seats').fill('1');
    await dialog.getByTestId('hold-submit').click();
    await expectSeats(page, { left: 0, held: 1, confirmed: 3 });
    await expect(page.getByTestId('seats-bar').first()).toContainText('Full');

    // ---- a further hold goes to the waitlist: the dialog says so before it is sent
    await page.getByRole('tab', { name: 'Bookings' }).click();
    await page.getByTestId('hold-seats-button').click();
    await dialog.getByRole('combobox', { name: 'Lead' }).click();
    await page.getByPlaceholder(/Search leads/i).fill(leads[2]!.title);
    await page.getByRole('option', { name: new RegExp(leads[2]!.title) }).first().click();
    await dialog.locator('#hold-seats').fill('2');
    await expect(dialog.getByTestId('hold-waitlist-note')).toContainText('waitlist');
    await dialog.getByTestId('hold-submit').click();
    await expectSeats(page, { left: 0, held: 1, confirmed: 3, waitlisted: 2 });
    await page.getByRole('tab', { name: /^Waitlist/ }).click();
    await expect(page.getByTestId('waitlist-panel').locator('table tbody tr', { hasText: leads[2]!.contactName })).toBeVisible();

    // ---- cancel lead 1's confirmed booking (with a reason): its 3 seats free up
    await page.getByRole('tab', { name: 'Bookings' }).click();
    await row1.hover();
    await row1.getByTestId('row-cancel').click();
    await page.getByLabel('Reason (optional)').fill('Changed plans');
    await page.getByTestId('cancel-booking-confirm').click();
    await expect(row1.getByTestId('booking-status')).toHaveText('Cancelled');
    await expectSeats(page, { left: 3, held: 1, confirmed: 0, waitlisted: 2 });

    // ---- offer the freed seats to the waitlisted party
    await page.getByRole('tab', { name: /^Waitlist/ }).click();
    await expect(page.getByTestId('waitlist-suggestion')).toBeVisible();
    const waitRow = page.getByTestId('waitlist-panel').locator('table tbody tr', { hasText: leads[2]!.contactName });
    await waitRow.hover();
    await waitRow.getByTestId('row-offer').click();
    await expectSeats(page, { left: 1, held: 3, waitlisted: 0 });

    // ---- move lead 2's held seat to the other departure
    await page.getByRole('tab', { name: 'Bookings' }).click();
    const row2 = page.locator('table tbody tr', { hasText: leads[1]!.contactName });
    await row2.hover();
    await row2.getByTestId('row-move').click();
    const move = page.getByTestId('move-booking-dialog');
    await move.getByRole('combobox').click();
    await page.getByRole('option').first().click();
    await move.getByTestId('move-booking-confirm').click();
    await expectSeats(page, { left: 2, held: 2 });

    // the other departure now holds that seat, and the API agrees on both
    const a = (await api('GET', `/departures/${depA}`)).data.seats;
    const b = (await api('GET', `/departures/${depB}`)).data.seats;
    expect(a).toMatchObject({ capacity: 4, left: 2, held: 2, confirmed: 0 });
    expect(b).toMatchObject({ capacity: 4, left: 3, held: 1 });

    // ---- the list shows both with their bars
    await page.goto('/departures');
    await page.getByPlaceholder(/Search by code/i).fill(`${stamp}`.slice(0, 3));
    const listRow = page.locator('table tbody tr').filter({ has: page.getByTestId('seats-bar') }).first();
    await expect(listRow).toBeVisible({ timeout: 15_000 });
  });

  // R164-2: a tour can have its own age bands; the form starts them from the agency's and saves them on the tour.
  test('a tour with its own age bands: adults from 13', async ({ page }) => {
    const stamp = Date.now().toString(36).toUpperCase();
    expect((await api('PUT', '/departures/settings', { enabled: true })).success).toBe(true);
    await page.goto('/tours/new');
    await page.locator('#tour-title').fill(`Teen Tour ${stamp}`);
    await page.locator('#tour-code').fill(`TT-${stamp}`);
    await page.getByRole('tab', { name: /^Prices/ }).click();
    await expect(page.getByTestId('tour-bands-inherit')).toContainText('Adult');
    await page.getByTestId('tour-custom-bands').click();
    const rows = page.getByTestId('age-band-row');
    await expect(rows).toHaveCount(3);
    await rows.first().locator('input[type="number"]').fill('13');
    await page.getByTestId('tour-save').click();
    await page.waitForURL(/\/tours\/[0-9a-f-]{36}$/);
    const tourId = page.url().split('/').pop() as string;

    const stored = (await api('GET', `/tours/${tourId}`)).data;
    expect(stored.ageBands.map((b: { key: string; minAge: number }) => [b.key, b.minAge])).toEqual([['adult', 13], ['child', 2], ['infant', 0]]);

    // the edit form shows them back, and switching back to the agency's bands clears them
    await page.goto(`/tours/${tourId}/edit`);
    await page.getByRole('tab', { name: /^Prices/ }).click();
    await expect(page.getByTestId('tour-custom-bands')).toBeChecked();
    await expect(page.getByTestId('age-band-row').first().locator('input[type="number"]')).toHaveValue('13');
    await page.getByTestId('tour-custom-bands').click();
    await page.getByTestId('tour-save').click();
    await page.waitForURL(/\/tours\/[0-9a-f-]{36}$/);
    expect((await api('GET', `/tours/${tourId}`)).data.ageBands).toBeNull();
  });
});
