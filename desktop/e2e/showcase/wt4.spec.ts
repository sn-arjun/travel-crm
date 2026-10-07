/** Walkthrough part 4: Travellers & fleet (chapters 14-20). The driver-app chapter (21) is inserted by compose.mjs after this part. */
import { expect, test } from './showcase-fixtures';
import * as D from './demo-data';
import { assertClean, chapter, clickOn, dwell, hoverOn, nav, openRow, recordPart, say, search, settle, typeInto } from './walkthrough-kit';
import { pause, pickDate, pickRelation, pickSelect } from './showcase-helpers';

const labelField = (page: import('@playwright/test').Page, label: RegExp) => page.locator('label', { hasText: label }).locator('..');

test('wt4: travellers, visa and fleet (chapters 14-20)', async ({ page, context }, testInfo) => {
  test.setTimeout(30 * 60_000);
  await recordPart(page, context, 'wt4', testInfo, async () => {
    await page.goto('/travellers');
    await settle(page, 1500);

    // ── 14 Travellers ──
    await chapter(page, 14, 'Travellers', 'Passports and expiries, tracked');
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    await say(page, 'Passports and expiries tracked for every traveller', 2800);
    await page.goto('/travellers/new');
    await settle(page, 1000);
    await pickRelation(page, page.getByRole('combobox').filter({ hasText: /Select a contact/ }), 'Search contacts...', 'Priya', /Priya Nair/);
    await typeInto(page, page.locator('#firstName'), 'Kabir');
    await typeInto(page, page.locator('#lastName'), 'Nair');
    await pickDate(page, page.getByRole('button', { name: 'Pick date of birth' }), '2018-02-14');
    await pickRelation(page, labelField(page, /^Nationality$/).getByRole('combobox'), 'Search nationality...', 'Indian', 'Indian');
    await typeInto(page, page.locator('#passportNumber'), 'Z7104418');
    await pickDate(page, page.getByRole('button', { name: 'Pick expiry date' }), '2028-02-13');
    await assertClean(page, 'ch14 form');
    await clickOn(page, page.getByRole('button', { name: /^save$/i }));
    await page.waitForURL(/\/travellers(\/[^/]+)?$/, { timeout: 20_000 });
    await settle(page, 1500);
    if (/\/travellers$/.test(page.url())) {
      await search(page, /Search by name/i, 'Kabir');
      await openRow(page, 'Kabir Nair', /\/travellers\/[^/]+$/);
    }
    await expect(page.getByText('Z7104418').first()).toBeVisible();
    await say(page, 'Every passport detail on one record', 2600);
    await assertClean(page, 'ch14');

    // ── 15 Visa ──
    await chapter(page, 15, 'Visa', 'Applications tracked stage by stage');
    await nav(page, '/visa');
    await page.goto('/visa/dashboard');
    await settle(page, 1500);
    await hoverOn(page, page.getByText('Docs Collecting').first(), 900);
    await say(page, 'Visa applications tracked stage by stage', 2800);
    await page.goto('/visa/new');
    await settle(page, 1000);
    await clickOn(page, labelField(page, /^Traveller\s*\*?$/).getByRole('combobox'));
    await typeInto(page, page.getByPlaceholder(/search by name or passport/i), 'Ishaan');
    await settle(page, 800);
    await clickOn(page, page.getByRole('option', { name: /Ishaan Chatterjee/ }).first());
    await clickOn(page, labelField(page, /^Destination Country\s*\*?$/).getByRole('combobox'));
    await typeInto(page, page.getByPlaceholder(/search countries/i), 'France');
    await clickOn(page, page.getByRole('option', { name: 'France', exact: true }));
    await clickOn(page, labelField(page, /^Visa Type\s*\*?$/).getByRole('combobox'));
    await pause(page, 400);
    await clickOn(page, page.getByRole('option', { name: 'Tourist', exact: true }));
    await assertClean(page, 'ch15 form');
    await clickOn(page, page.getByRole('button', { name: 'Create Application' }));
    await page.waitForURL('**/visa', { timeout: 20_000 });
    await settle(page, 1500);
    await openRow(page, 'Not Started', /\/visa\/[^/]+$/);
    const docs = page.locator('button').filter({ hasText: /passport|photo/i });
    await clickOn(page, docs.first());
    await settle(page, 900);
    await clickOn(page, docs.nth(1));
    await settle(page, 900);
    await say(page, 'Tick off documents as they arrive', 2800);
    await assertClean(page, 'ch15');

    // ── 16 Fleet — vehicles ──
    await chapter(page, 16, 'Fleet — vehicles', 'Vehicles, documents and maintenance');
    await nav(page, '/fleet/vehicles');
    await say(page, 'Vehicles, documents and maintenance in one place', 2800);
    await page.goto('/fleet/vehicles/new');
    await settle(page, 1000);
    await typeInto(page, page.locator('#registrationNumber'), 'KA 05 NP 7203');
    await pickSelect(page, page.locator('#type'), 'MUV');
    await typeInto(page, page.locator('#make'), 'Toyota');
    await typeInto(page, page.locator('#model'), 'Innova Hycross');
    await typeInto(page, page.locator('#seatingCapacity'), '7');
    await typeInto(page, page.locator('#year'), '2025');
    await pickSelect(page, page.locator('#color'), 'White');
    await assertClean(page, 'ch16 form');
    await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
    await page.waitForURL('**/fleet/vehicles', { timeout: 20_000 });
    await settle(page, 1300);
    await search(page, /Search by registration/i, 'NP 7203');
    await openRow(page, 'KA 05 NP 7203', /\/fleet\/vehicles\/[^/]+$/);
    await clickOn(page, page.getByRole('tab', { name: 'Related' }));
    await clickOn(page, page.getByRole('button', { name: 'Add record' }));
    const mt = page.getByRole('dialog');
    await pickSelect(page, mt.locator('#serviceType'), 'Regular service');
    await pickDate(page, mt.locator('#serviceDate'), D.day(0));
    await typeInto(page, mt.locator('#odometerAtService'), '1200');
    await typeInto(page, mt.locator('#vendor'), 'Toyota service centre, Whitefield');
    await clickOn(page, mt.getByRole('button', { name: 'Save record' }));
    await expect(mt).toBeHidden({ timeout: 15_000 });
    await settle(page, 1500);
    await say(page, 'Log every service and keep the odometer honest', 2800);
    await assertClean(page, 'ch16');

    // ── 17 Fleet — drivers ──
    await chapter(page, 17, 'Fleet — drivers', 'Licences, schedules and ratings');
    await nav(page, '/fleet/drivers');
    await say(page, 'Driver licences, schedules and ratings', 2800);
    await page.goto('/fleet/drivers/new');
    await settle(page, 1000);
    await typeInto(page, page.locator('#name'), 'Shivakumar R');
    await typeInto(page, page.locator('input[type="tel"]').first(), '9886147290');
    await typeInto(page, page.locator('#licenseNumber'), 'KA51 20210098765');
    await pickDate(page, labelField(page, /^License expiry/).getByRole('button').first(), D.day(1095));
    await typeInto(page, page.locator('#licenseType'), 'LMV-Transport');
    await typeInto(page, page.locator('#emergencyContactName'), 'Gowri R');
    await typeInto(page, page.locator('input[type="tel"]').nth(1), '9886147291');
    await typeInto(page, page.locator('#emergencyContactRelation'), 'Wife');
    await assertClean(page, 'ch17 form');
    await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
    await page.waitForURL('**/fleet/drivers', { timeout: 20_000 });
    await settle(page, 1300);
    await search(page, /Search drivers/i, 'Shivakumar');
    await openRow(page, 'Shivakumar R', /\/fleet\/drivers\/[^/]+$/);
    await dwell(page, 2500);
    await assertClean(page, 'ch17');

    // ── 18 Fleet — trips ──
    await chapter(page, 18, 'Fleet — trips', 'Dispatch, costs and invoices');
    await nav(page, '/fleet/trips');
    await say(page, 'Dispatch, costs and trip invoices in one flow', 2800);
    await page.goto('/fleet/trips/new');
    await settle(page, 1000);
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
    await typeInto(page, page.locator('#specialInstructions'), 'Early flight 6E 5131 — please arrive 10 minutes early', { delay: 25 });
    await typeInto(page, page.locator('#distance'), '41');
    await typeInto(page, page.locator('#fare'), '1400');
    await assertClean(page, 'ch18 form');
    await clickOn(page, page.getByRole('button', { name: /^Save$/ }));
    await expect(page.getByText('Trip created successfully').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForURL('**/fleet/trips');
    await settle(page, 1300);
    await search(page, /Search trips/i, 'Nikhil');
    await openRow(page, 'Nikhil Bansal', /\/fleet\/trips\/[^/]+$/);
    await dwell(page, 1500);
    await clickOn(page, page.getByRole('tab', { name: /Related/i }));
    await clickOn(page, page.getByRole('button', { name: /Add cost/i }).first());
    const cost = page.getByRole('dialog');
    await clickOn(page, cost.getByRole('combobox'));
    await pause(page, 400);
    await clickOn(page, page.getByRole('option', { name: 'Toll', exact: true }));
    await typeInto(page, cost.locator('#costAmount'), '160');
    await typeInto(page, cost.locator('#costNotes'), 'Airport toll');
    await clickOn(page, cost.getByRole('button', { name: /^Add cost$/ }));
    await expect(page.getByText('Cost added').first()).toBeVisible({ timeout: 10_000 });
    await dwell(page, 1500);
    await nav(page, '/fleet/trips');
    await search(page, /Search trips/i, 'James Carter');
    await openRow(page, 'James Carter', /\/fleet\/trips\/[^/]+$/);
    await clickOn(page, page.getByRole('button', { name: 'More actions' }));
    await clickOn(page, page.getByRole('menuitem', { name: /View invoice/i }));
    await page.waitForURL(/\/invoices\/[^/]+$/, { timeout: 20_000 });
    await settle(page, 1800);
    await say(page, 'A finished trip arrives with its invoice ready', 3000);
    await assertClean(page, 'ch18');

    // ── 19 Fleet — rate cards ──
    await chapter(page, 19, 'Fleet — rate cards', 'Per-km pricing by vehicle and trip');
    await nav(page, '/fleet/rate-cards');
    await say(page, 'Per-km pricing by vehicle and trip type', 2800);
    await page.goto('/fleet/rate-cards/new');
    await settle(page, 1000);
    await typeInto(page, page.locator('#name'), 'Tempo Traveller 12 — Outstation (Kerala)');
    await pickSelect(page, page.locator('#vehicleType'), 'Tempo Traveller');
    await pickSelect(page, page.locator('#tripType'), 'Outstation');
    await typeInto(page, page.locator('#baseFare'), '0');
    await typeInto(page, page.locator('#perKmRate'), '24');
    await typeInto(page, page.locator('#minKm'), '300');
    await typeInto(page, page.locator('#driverAllowance'), '500');
    await typeInto(page, page.locator('#nightCharge'), '300');
    await assertClean(page, 'ch19 form');
    await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
    await page.waitForURL('**/fleet/rate-cards', { timeout: 20_000 });
    await settle(page, 1500);
    await assertClean(page, 'ch19');

    // ── 20 Fleet — dashboard & alerts ──
    await chapter(page, 20, 'Fleet — dashboard & alerts', 'Problems flagged before they happen');
    await nav(page, '/fleet');
    await hoverOn(page, page.getByText('Active Trips').first(), 900);
    await say(page, 'Live fleet status at a glance', 2800);
    await nav(page, '/fleet/alerts');
    await hoverOn(page, page.getByText('KA 51 C 2210').first(), 1200);
    await say(page, 'Expiring documents flagged before they become problems', 3200);
    await assertClean(page, 'ch20');
  });
});
