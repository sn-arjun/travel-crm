/** Film area-fleet: dashboard, vehicles, drivers, trips, rate cards, alerts (studio/clips/area-fleet.json). Demo admin (the automations tab is admin-only). */
import * as D from '../demo-data';
import { asUser, beat, clickOn, expect, focus, glance, openRow, pause, pickDate, pickRelation, pickSelect, recordFilm, scrollSteps, search, settle, typeInto, visit } from './film-kit';

const test = asUser();

test('film:area-fleet', async ({ page, context }, testInfo) => {
  test.setTimeout(25 * 60_000);
  await recordFilm(page, context, 'area-fleet', testInfo, async () => {
    await page.goto('/fleet');
    await settle(page, 1600);

    await beat(page, 'fleet-dashboard', async () => {
      await glance(page, page.getByText('Active Trips').first(), 900);
      await scrollSteps(page, 1, 350);
    });

    await beat(page, 'vehicles', async () => {
      await visit(page, '/fleet/vehicles');
      await search(page, /Search by registration/i, 'AH 9034');
      await openRow(page, 'KA 01 AH 9034', /\/fleet\/vehicles\/[^/]+$/);
      await scrollSteps(page, 1, 350);
      await clickOn(page, page.getByRole('tab', { name: 'Related' }));
      await pause(page, 1200);
    });

    await beat(page, 'drivers', async () => {
      await visit(page, '/fleet/drivers');
      await search(page, /Search drivers/i, 'Manjunath');
      await openRow(page, 'Manjunath Gowda', /\/fleet\/drivers\/[^/]+$/);
      await scrollSteps(page, 1, 350);
      await glance(page, page.getByRole('button', { name: /Rate/ }), 800);
    });

    await beat(page, 'trip-new', async () => {
      await page.goto('/fleet/trips/new');
      await settle(page, 900);
      await pickRelation(page, /Select vehicle/, 'Registration or make/model...', 'AH 9034', 'KA 01 AH 9034');
      await pickRelation(page, /Select driver/, 'Driver name or phone...', 'Manjunath', 'Manjunath Gowda');
      await pickSelect(page, page.locator('#tripType'), /Airport Drop/i);
      await typeInto(page, page.getByPlaceholder('Enter pickup location'), 'Indiranagar, Bengaluru');
      await typeInto(page, page.getByPlaceholder('Enter drop location'), 'Kempegowda International Airport (BLR), Terminal 2');
      await pickDate(page, page.locator('button:has-text("Pick a date")').first(), D.day(2));
      await page.locator('#startClock').fill('05:30');
      await pickDate(page, page.locator('button:has-text("Pick a date")').first(), D.day(2));
      await page.locator('#endClock').fill('06:45');
      await typeInto(page, page.locator('#passengerName'), 'Nikhil Bansal');
      await typeInto(page, page.locator('input[type="tel"]').first(), '9845177230');
      await typeInto(page, page.locator('#distance'), '41');
      const fare = page.locator('#fare');
      await focus(page, 'fare', fare);
      await typeInto(page, fare, '1400');
      await clickOn(page, page.getByRole('button', { name: /^Save$/ }));
      await expect(page.getByText('Trip created successfully').first()).toBeVisible({ timeout: 15_000 });
      await page.waitForURL('**/fleet/trips');
      await settle(page, 900);
    });

    await beat(page, 'trip-detail', async () => {
      await search(page, /Search trips/i, 'Nikhil');
      await openRow(page, 'Nikhil Bansal', /\/fleet\/trips\/[^/]+$/);
      await clickOn(page, page.getByRole('tab', { name: /Related/i }));
      await clickOn(page, page.getByRole('button', { name: /Add cost/i }).first());
      const cost = page.getByRole('dialog');
      await clickOn(page, cost.getByRole('combobox'));
      await pause(page, 300);
      await clickOn(page, page.getByRole('option', { name: 'Toll', exact: true }));
      await typeInto(page, cost.locator('#costAmount'), '160');
      await typeInto(page, cost.locator('#costNotes'), 'Airport toll');
      await clickOn(page, cost.getByRole('button', { name: /^Add cost$/ }));
      await expect(page.getByText('Cost added').first()).toBeVisible({ timeout: 10_000 });
      await visit(page, '/fleet/trips');
      await search(page, /Search trips/i, 'James Carter');
      await openRow(page, 'James Carter', /\/fleet\/trips\/[^/]+$/);
      await clickOn(page, page.getByRole('button', { name: 'More actions' }));
      await clickOn(page, page.getByRole('menuitem', { name: /View invoice/i }));
      await page.waitForURL(/\/invoices\/[^/]+$/, { timeout: 20_000 });
      await settle(page, 1000);
    });

    await beat(page, 'fleet-rates', async () => {
      await page.goto('/fleet/rate-cards');
      await settle(page, 1300);
      await scrollSteps(page, 1, 300);
    });

    await beat(page, 'alerts', async () => {
      await page.goto('/fleet/alerts');
      await settle(page, 1300);
      await glance(page, page.getByText('KA 51 C 2210').first(), 1100);
    });

    await beat(page, 'fleet-automations', async () => {
      await page.goto('/assistant?tab=automations');
      await settle(page, 1400);
      const arrival = page.locator('[data-recipe="fleet.arrival_transfer"]');
      await arrival.scrollIntoViewIfNeeded().catch(() => undefined);
      await glance(page, arrival, 1100);
      await glance(page, page.locator('[data-recipe="fleet.trip_feedback"]'), 1100);
    });
  });
});
