import { test, expect, type Page } from './fixtures';
import { waitForLoad } from './helpers/auth';
import { api, seedDriver } from './helpers/api-seed';
import { pickDate } from './helpers/date-picker';

// Coach trips end to end from the desktop: a trip made from a departure (stops and passengers copied by pickup point), stops
// and passengers checked in (boarded, no-show, documents checked) with the head count following, and an ad-hoc coach trip built
// in the trip form with stops, a tour leader and passengers added by hand. No raw id is typed anywhere.

const stamp = () => Date.now().toString(36).toUpperCase();

/** The numbers on the head count bar of the open trip page (or drawer). */
async function headcountOf(page: Page) {
  const bar = page.getByTestId('headcount-bar').first();
  await expect(bar).toBeVisible();
  const num = async (name: string) => Number(await bar.getAttribute(name));
  return { expected: await num('data-expected'), boarded: await num('data-boarded'), noShow: await num('data-no-show'), pending: await num('data-pending') };
}

const passengerRow = (page: Page, name: string) => page.getByTestId('passenger-row').filter({ has: page.getByText(name, { exact: false }) }).first();
const stopCard = (page: Page, name: string) => page.locator(`[data-testid="stop-card"][data-stop-name="${name}"]`);

async function openTripFromList(page: Page, text: string) {
  await page.goto('/fleet/trips');
  await waitForLoad(page);
  await page.getByPlaceholder(/Search trips/i).fill(text);
  const row = page.locator('table tbody tr', { hasText: text }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  return row;
}

test.describe('Coach trips', () => {
  test('a coach trip from a departure: stops and passengers by stop, boarded, no-show, documents checked, head count', async ({ page }) => {
    test.setTimeout(240_000);
    const id = stamp();

    // ---- a departure with three stops and two parties, made through the API (the departure screens are covered by departures.spec.ts)
    expect((await api('PUT', '/departures/settings', { enabled: true, holdExpiryHours: 48, confirmMode: 'manual', waitlist: { enabled: true, offerMode: 'suggest', offerHoldHours: 24 } })).success).toBe(true);
    const tour = (await api('POST', '/tours', { code: `CT-${id}`, title: `Coach Tour ${id}`, destination: 'Alps', durationDays: 3, defaultCapacity: 49 })).data;
    expect(tour.id).toBeTruthy();
    const dep = (await api('POST', '/departures', { tourId: tour.id, startDate: '2032-07-05', startTime: '07:00', capacityMode: 'manual', capacity: 40 })).data;
    expect(dep.id).toBeTruthy();
    const stops = (await api('PUT', `/departures/${dep.id}/stops`, {
      stops: [
        { name: `Utrecht ${id}`, localTime: '07:00', documentsCheck: true },
        { name: `Amersfoort ${id}`, localTime: '07:40' },
        { name: `Apeldoorn ${id}`, localTime: '08:20' },
      ],
    })).data as [{ id: string; name: string }, { id: string; name: string }, { id: string; name: string }];
    expect(stops).toHaveLength(3);
    expect((await api('POST', `/departures/${dep.id}/status`, { status: 'open' })).success).toBe(true);
    const party = async (name: string, phone: string, pickups: string[]) => {
      const res = await api('POST', `/departures/${dep.id}/bookings`, {
        contact: { name, email: `${name.toLowerCase().replace(/\W+/g, '.')}.${id.toLowerCase()}@coach.test`, phone },
        passengers: pickups.map((pickupStopId, i) => ({ firstName: name, lastName: `Rider${i + 1}`, pickupStopId })),
      });
      expect(res.success, JSON.stringify(res)).toBe(true);
    };
    await party(`Smit ${id}`, '+31612340001', [stops[0].id, stops[0].id, stops[1].id]);
    await party(`Jansen ${id}`, '+31612340002', [stops[2].id]);

    const made = await api('POST', `/departures/${dep.id}/trips`);
    expect(made.success, JSON.stringify(made)).toBe(true);
    expect(made.data.created).toBe(true);
    expect(made.data.trips).toHaveLength(1);
    const tripId = made.data.trips[0].id as string;
    // a second call returns the same trip
    const again = await api('POST', `/departures/${dep.id}/trips`);
    expect(again.data.created).toBe(false);
    expect(again.data.trips[0].id).toBe(tripId);

    // ---- the trips list: the coach filter, the stops / head count column, then the trip page
    await page.goto('/fleet/trips');
    await waitForLoad(page);
    await page.getByTestId('trip-kind-filter').click();
    await page.getByRole('option', { name: 'Coach', exact: true }).click();
    await page.getByPlaceholder(/Search trips/i).fill(`Coach Tour ${id}`);
    const row = page.locator('table tbody tr', { hasText: `Coach Tour ${id}` }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByTestId('trip-coach-cell')).toContainText('3 stops');
    await expect(row.getByTestId('trip-coach-cell')).toContainText('0 of 4 on board');
    await row.click();
    await page.waitForURL(new RegExp(`/fleet/trips/${tripId}$`));
    await waitForLoad(page);

    // ---- stops in order, passengers under their pickup stop
    const panel = page.getByTestId('coach-panel');
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByTestId('stop-card')).toHaveCount(3);
    await expect(panel.getByTestId('stop-card').nth(0)).toContainText(`Utrecht ${id}`);
    await expect(panel.getByTestId('stop-card').nth(1)).toContainText(`Amersfoort ${id}`);
    await expect(panel.getByTestId('stop-card').nth(2)).toContainText(`Apeldoorn ${id}`);
    await expect(stopCard(page, `Utrecht ${id}`).getByTestId('passenger-row')).toHaveCount(2);
    await expect(stopCard(page, `Amersfoort ${id}`).getByTestId('passenger-row')).toHaveCount(1);
    await expect(stopCard(page, `Apeldoorn ${id}`).getByTestId('passenger-row')).toHaveCount(1);
    await expect(stopCard(page, `Utrecht ${id}`)).toContainText('Check documents');
    expect(await headcountOf(page)).toEqual({ expected: 4, boarded: 0, noShow: 0, pending: 4 });

    // ---- arrive at the first stop, then tick people
    await stopCard(page, `Utrecht ${id}`).getByTestId('btn-arrive').click();
    await expect(stopCard(page, `Utrecht ${id}`)).toHaveAttribute('data-stop-status', 'arrived');

    const first = passengerRow(page, `Smit ${id} Rider1`);
    await first.getByTestId('btn-boarded').click();
    await expect(first).toHaveAttribute('data-boarding', 'boarded');
    const second = passengerRow(page, `Smit ${id} Rider2`);
    await second.getByTestId('btn-noshow').click();
    await expect(second).toHaveAttribute('data-boarding', 'no_show');
    await expect.poll(() => headcountOf(page)).toEqual({ expected: 4, boarded: 1, noShow: 1, pending: 2 });
    await expect(stopCard(page, `Utrecht ${id}`).getByTestId('stop-count')).toContainText('1 of 2');

    // a tick taken back
    await first.getByTestId('btn-boarded').click();
    await expect(first).toHaveAttribute('data-boarding', 'pending');
    await first.getByTestId('btn-boarded').click();
    await expect(first).toHaveAttribute('data-boarding', 'boarded');

    // documents checked
    await first.getByTestId('chk-docs').click();
    await expect(first.getByTestId('chk-docs')).toBeChecked();

    // ---- it is saved: the API and a reload agree, and the manifest passenger is marked as checked
    await expect.poll(async () => (await api('GET', `/fleet/trips/${tripId}/headcount`)).data).toMatchObject({ expected: 4, boarded: 1, noShow: 1, pending: 2, documentsChecked: 1 });
    const departureCount = (await api('GET', `/departures/${dep.id}/headcount`)).data;
    expect(departureCount).toMatchObject({ expected: 4, boarded: 1, noShow: 1 });
    const grouped = (await api('GET', `/fleet/trips/${tripId}/passengers`)).data;
    const ticked = grouped.stops[0].passengers.find((p: { name: string }) => p.name.includes('Rider1'));
    expect(ticked).toMatchObject({ boarding: 'boarded', documentsChecked: true });

    await page.reload();
    await waitForLoad(page);
    await expect(passengerRow(page, `Smit ${id} Rider1`)).toHaveAttribute('data-boarding', 'boarded');
    await expect(passengerRow(page, `Smit ${id} Rider2`)).toHaveAttribute('data-boarding', 'no_show');
    expect(await headcountOf(page)).toEqual({ expected: 4, boarded: 1, noShow: 1, pending: 2 });

    // ---- someone else (the tour leader's phone) ticks: the page follows without a reload
    const other = grouped.stops[2].passengers[0] as { id: string };
    const res = await api('PUT', `/fleet/trips/${tripId}/passengers/${other.id}`, { boarding: 'boarded', opId: `e2e-${id}`, at: new Date(Date.now() + 1000).toISOString() });
    expect(res.success, JSON.stringify(res)).toBe(true);
    await expect.poll(() => headcountOf(page), { timeout: 20_000 }).toMatchObject({ boarded: 2 });
  });

  test('an ad-hoc coach trip: kind, tour leader, stops in order, passengers added by hand, ticked from the list drawer', async ({ page }) => {
    test.setTimeout(240_000);
    const id = stamp();
    const leader = await seedDriver({ name: `Lena Leader ${id}`, crewRole: 'tour_leader' });
    expect(leader.crewRole).toBe('tour_leader');
    const plain = await seedDriver({ name: `Dirk Plain ${id}`, crewRole: 'driver' });
    expect(plain.id).toBeTruthy();

    await page.goto('/fleet/trips/new');
    await waitForLoad(page);
    await page.locator('#tripKind').click();
    await page.getByRole('option', { name: /^Coach trip/ }).click();
    // a coach trip needs no vehicle or driver: those fields are optional now
    await expect(page.getByRole('combobox').filter({ hasText: /Select tour leader/i })).toBeVisible();

    // only crew with the tour leader role are offered
    await page.getByRole('combobox').filter({ hasText: /Select tour leader/i }).click();
    await page.getByPlaceholder('Name or phone...').fill(id);
    await expect(page.locator('[cmdk-item]').filter({ hasText: `Lena Leader ${id}` })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[cmdk-item]').filter({ hasText: `Dirk Plain ${id}` })).toHaveCount(0);
    await page.locator('[cmdk-item]').filter({ hasText: `Lena Leader ${id}` }).click();

    // stops: add three, move the last one up with the keyboard buttons
    const names: [string, string, string] = [`Rotterdam ${id}`, `Utrecht ${id}`, `Zwolle ${id}`];
    for (let i = 0; i < 3; i++) await page.getByTestId('add-trip-stop').click();
    const rows = page.getByTestId('trip-stop-row');
    await expect(rows).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await rows.nth(i).getByLabel('Name', { exact: true }).fill(names[i]!);
      await rows.nth(i).getByLabel('Time', { exact: true }).fill(`2032-06-15T0${7 + i}:30`);
    }
    await rows.nth(0).getByLabel('Check documents here').click();
    await rows.nth(2).getByRole('button', { name: 'Move stop up' }).click();
    await expect(rows.nth(1).getByLabel('Name', { exact: true })).toHaveValue(names[2]);
    await expect(rows.nth(2).getByLabel('Name', { exact: true })).toHaveValue(names[1]);

    await pickDate(page, page.locator('button:has-text("Pick a date")').first(), new Date(2032, 5, 15));
    await page.locator('#startClock').fill('07:00');
    await pickDate(page, page.locator('button:has-text("Pick a date")').first(), new Date(2032, 5, 15));
    await page.locator('#endClock').fill('19:00');

    await page.getByRole('button', { name: /^Save$/ }).click();
    await expect(page.getByText('Coach trip created').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForURL(/\/fleet\/trips$/, { timeout: 15_000 });

    // ---- the list: the new coach trip shows its stops, the stops are saved in the order set
    const row = await openTripFromList(page, `Rotterdam ${id}`);
    await expect(row.getByTestId('trip-coach-cell')).toContainText('3 stops');
    await expect(row).toContainText(`Rotterdam ${id} → Utrecht ${id}`);
    const tripId = (await api('GET', `/fleet/trips?tripKind=coach&search=${encodeURIComponent(`Rotterdam ${id}`)}`)).data[0].id as string;
    const saved = (await api('GET', `/fleet/trips/${tripId}`)).data;
    expect(saved).toMatchObject({ tripKind: 'coach', tourLeaderId: leader.id, tourLeaderName: `Lena Leader ${id}`, vehicleId: null, driverId: null });
    expect(saved.stops.map((s: { name: string }) => s.name)).toEqual([names[0], names[2], names[1]]);
    expect(saved.stops[0].documentsCheck).toBe(true);

    // ---- passengers added by hand, in the check-in drawer of the list
    await row.getByTestId('trip-checkin-button').click();
    const drawer = page.getByTestId('trip-checkin-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('stop-card')).toHaveCount(3);
    const add = async (name: string, stopName: string, seats: string) => {
      await drawer.getByTestId('add-passenger').click();
      const form = drawer.getByTestId('add-passenger-form');
      await form.getByLabel('Name', { exact: true }).fill(name);
      await form.getByLabel('Seats', { exact: true }).fill(seats);
      await form.getByLabel('Boards at').click();
      await page.getByRole('option', { name: stopName, exact: true }).click();
      await form.getByRole('button', { name: 'Add passenger' }).click();
      await expect(drawer.getByTestId('passenger-row').filter({ hasText: name })).toBeVisible({ timeout: 10_000 });
    };
    await add(`Guest One ${id}`, names[0], '1');
    await add(`Guest Two ${id}`, names[0], '2');
    await add(`Guest Three ${id}`, names[1], '1');
    expect((await headcountOf(page))).toEqual({ expected: 4, boarded: 0, noShow: 0, pending: 4 });

    // ---- tick: boarded, no-show, documents checked
    const one = drawer.getByTestId('passenger-row').filter({ hasText: `Guest One ${id}` });
    await one.getByTestId('btn-boarded').click();
    await expect(one).toHaveAttribute('data-boarding', 'boarded');
    const two = drawer.getByTestId('passenger-row').filter({ hasText: `Guest Two ${id}` });
    await two.getByTestId('btn-noshow').click();
    await expect(two).toHaveAttribute('data-boarding', 'no_show');
    await two.getByTestId('chk-docs').click();
    await expect(two.getByTestId('chk-docs')).toBeChecked();
    // the head count is in seats: Guest Two has two
    await expect.poll(() => headcountOf(page)).toEqual({ expected: 4, boarded: 1, noShow: 2, pending: 1 });
    await expect(stopCard(page, names[0]).getByTestId('stop-count')).toContainText('1 of 3');

    await expect.poll(async () => (await api('GET', `/fleet/trips/${tripId}/headcount`)).data).toMatchObject({ expected: 4, boarded: 1, noShow: 2, pending: 1, documentsChecked: 1 });
    await page.keyboard.press('Escape');
    // the list row follows the drawer's ticks
    await expect(page.locator('table tbody tr', { hasText: `Rotterdam ${id}` }).first().getByTestId('trip-coach-cell')).toContainText('1 of 4 on board', { timeout: 15_000 });
  });

  test('crew role on the driver form and the drivers list filter', async ({ page }) => {
    test.setTimeout(120_000);
    const id = stamp();
    const name = `Crew Person ${id}`;
    await page.goto('/fleet/drivers/new');
    await waitForLoad(page);
    await page.locator('#name').fill(name);
    await page.locator('input[type="tel"]').first().fill(`98${String(Date.now()).slice(-8)}`);
    await page.getByTestId('crew-role-select').click();
    await page.getByRole('option', { name: 'Tour leader', exact: true }).click();
    await page.getByRole('button', { name: /^Save$/i }).click();
    await page.waitForURL('**/fleet/drivers', { timeout: 15_000 });

    const created = (await api('GET', `/fleet/drivers?search=${encodeURIComponent(name)}`)).data[0];
    expect(created).toMatchObject({ name, crewRole: 'tour_leader', userId: null });

    // the list shows the role and filters by it
    await page.getByPlaceholder(/Search drivers/i).fill(name);
    const row = page.locator('table tbody tr', { hasText: name }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('Tour leader');
    await page.getByTestId('crew-role-filter').click();
    await page.getByRole('option', { name: 'Driver', exact: true }).click();
    await expect(page.locator('table tbody tr', { hasText: name })).toHaveCount(0, { timeout: 15_000 });
    await page.getByTestId('crew-role-filter').click();
    await page.getByRole('option', { name: 'Tour leader', exact: true }).click();
    await expect(page.locator('table tbody tr', { hasText: name }).first()).toBeVisible({ timeout: 15_000 });

    // the role is kept on the edit form
    await page.goto(`/fleet/drivers/${created.id}/edit`);
    await waitForLoad(page);
    await expect(page.getByTestId('crew-role-select')).toContainText('Tour leader');
  });
});
