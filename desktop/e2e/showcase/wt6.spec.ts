/** Walkthrough part 6: Marketing (chapters 30-36): dashboard, campaigns, segments, flyers and branding, festivals, opted-out, WhatsApp. */
import * as D from './demo-data';
import { expect, test } from './showcase-fixtures';
import { pause, pickDate, pickRelation, pickSelect } from './showcase-helpers';
import { assertClean, chapter, clickOn, dwell, hoverOn, nav, openRow, recordPart, say, scrollSteps, search, settle, typeInto } from './walkthrough-kit';

test('wt6: marketing (chapters 30-36)', async ({ page, context }, testInfo) => {
  test.setTimeout(30 * 60_000);
  await recordPart(page, context, 'wt6', testInfo, async () => {
    await page.goto('/marketing');
    await settle(page, 1800);

    // ── 30 Marketing dashboard ──
    await chapter(page, 30, 'Marketing dashboard', 'Campaign results in one view');
    await expect(page.getByText('Avg Open Rate').first()).toBeVisible();
    await hoverOn(page, page.getByText('Total Sent').first(), 900);
    await say(page, 'All campaign results in one view', 3000);
    await hoverOn(page, page.getByText('Diwali Getaways 2026').first(), 1200);
    await assertClean(page, 'ch30');

    // ── 31 Campaigns ──
    await chapter(page, 31, 'Campaigns', 'Email and WhatsApp with tracking');
    await nav(page, '/marketing/campaigns', { exact: true }).catch(async () => { await page.goto('/marketing/campaigns'); await settle(page, 1300); });
    await openRow(page, 'Diwali Getaways 2026', /\/marketing\/campaigns\/[^/]+$/);
    await say(page, 'Email and WhatsApp campaigns with open and click tracking', 3200);
    await dwell(page, 1500);
    await page.goto('/marketing/campaigns/new');
    await settle(page, 1000);
    await typeInto(page, page.locator('#name'), 'Christmas in Kerala — early bird');
    await pickRelation(page, page.getByRole('combobox').filter({ hasText: /All contacts/ }), /Search/i, 'Families', 'Families with kids');
    await typeInto(page, page.locator('#subject'), 'Christmas in Kerala — book by 31 Oct, save 10%');
    await typeInto(page, page.locator('#content'), 'Hi {{first_name}},\n\nSpend Christmas on a private Alleppey houseboat. Book by 31 October and save 10%.\n\nSahyadri Holidays', { delay: 20 });
    await pickDate(page, page.getByRole('button', { name: 'Pick a date' }).first(), D.day(7));
    await assertClean(page, 'ch31 form');
    await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
    await page.waitForURL(/\/marketing\/campaigns(\/[^/]+)?$/, { timeout: 20_000 });
    await settle(page, 1800);
    await assertClean(page, 'ch31');

    // ── 32 Segments ──
    await chapter(page, 32, 'Segments', 'Audiences that update themselves');
    await page.goto('/marketing/segments');
    await settle(page, 1500);
    await say(page, 'Rule-based audiences that update themselves', 2800);
    await page.goto('/marketing/segments/new');
    await settle(page, 1000);
    await typeInto(page, page.locator('#name'), 'Kerala enquiries — Bengaluru');
    await typeInto(page, page.locator('#description'), 'Bengaluru contacts interested in Kerala');
    await typeInto(page, page.getByPlaceholder('Value...').first(), 'Bengaluru');
    await clickOn(page, page.getByRole('button', { name: 'Add rule', exact: true }));
    const combos = page.getByRole('combobox');
    await pickSelect(page, combos.nth(2), 'Tag');
    await pickSelect(page, combos.nth(3), 'Contains');
    await typeInto(page, page.getByPlaceholder('Value...').nth(1), 'kerala');
    await clickOn(page, page.getByRole('button', { name: 'Preview count' }));
    await settle(page, 1800);
    await say(page, 'See who matches before you save', 2800);
    await assertClean(page, 'ch32 form');
    await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
    await page.waitForURL('**/marketing/segments', { timeout: 20_000 });
    await settle(page, 1500);
    await assertClean(page, 'ch32');

    // ── 33 Flyers & branding ──
    await chapter(page, 33, 'Flyers & branding', 'On-brand flyers in minutes');
    await page.goto('/marketing/flyers/new');
    await settle(page, 1000);
    await clickOn(page, page.getByRole('combobox').filter({ hasText: /Select a template/ }));
    await pause(page, 400);
    await clickOn(page, page.getByRole('option', { name: /Festival offer/ }).first());
    await typeInto(page, page.locator('#title'), 'Diwali in Udaipur');
    await typeInto(page, page.locator('#headline'), 'Diwali in Udaipur — 3 nights from ₹38,999');
    await typeInto(page, page.locator('#subheadline'), 'Lake palace stays, sunset boat rides and a private Diwali dinner');
    await typeInto(page, page.locator('#offerText'), 'Book before 20 Oct and save 10%');
    await typeInto(page, page.locator('#contactInfo'), 'hello@sahyadriholidays.in · +91 80 4718 2290');
    await clickOn(page, page.getByRole('button', { name: 'Sunset' }));
    await say(page, 'On-brand flyers in minutes', 3000);
    await assertClean(page, 'ch33 form');
    await clickOn(page, page.getByRole('button', { name: /save|create flyer|create/i }).last());
    await page.waitForURL(/\/marketing\/flyers(\/[^/]+)?$/, { timeout: 20_000 });
    await settle(page, 1800);
    await page.goto('/marketing/branding');
    await settle(page, 1500);
    await scrollSteps(page, 1, 400);
    await say(page, 'Your colours, logo and fonts on every flyer', 2800);
    await assertClean(page, 'ch33');

    // ── 34 Festival offers ──
    await chapter(page, 34, 'Festival offers', 'Ready before the festival');
    await page.goto('/marketing/festivals');
    await settle(page, 1500);
    await say(page, 'Festival-ready offers, suggested ahead of time', 2800);
    const xmas = page.locator('div').filter({ hasText: /^Christmas/ }).filter({ has: page.getByRole('button', { name: 'Create Campaign' }) }).last();
    await clickOn(page, xmas.getByRole('button', { name: 'Create Campaign' }));
    await settle(page, 1800);
    await assertClean(page, 'ch34');

    // ── 35 Opted-out ──
    await chapter(page, 35, 'Opted-out contacts', 'Unsubscribes honoured automatically');
    await page.goto('/marketing/opted-out');
    await settle(page, 1500);
    await expect(page.getByText('Zoya Khan').first()).toBeVisible();
    await hoverOn(page, page.getByText('Zoya Khan').first(), 1200);
    await say(page, 'Unsubscribes honoured automatically', 3000);
    await assertClean(page, 'ch35');

    // ── 36 WhatsApp campaigns ──
    await chapter(page, 36, 'WhatsApp campaigns', 'Approved-template broadcasts');
    await page.goto('/marketing/whatsapp');
    await settle(page, 1500);
    await expect(page.getByText('Diwali greetings to past travellers').first()).toBeVisible();
    await say(page, 'Approved-template WhatsApp broadcasts', 2800);
    await openRow(page, 'Diwali greetings', /\/marketing\/whatsapp\/[^/]+$/);
    await dwell(page, 2500);
    await assertClean(page, 'ch36');
  });
});
