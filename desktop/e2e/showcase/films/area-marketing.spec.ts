/** Film area-marketing: dashboard, campaigns, segments, flyers, festivals, WhatsApp, opt-out (studio/clips/area-marketing.json). Demo admin. */
import * as D from '../demo-data';
import { asUser, beat, clickOn, expect, focus, glance, openRow, pause, pickDate, pickRelation, pickSelect, recordFilm, scrollSteps, settle, typeInto, visit } from './film-kit';

const test = asUser();

test('film:area-marketing', async ({ page, context }, testInfo) => {
  test.setTimeout(20 * 60_000);
  await recordFilm(page, context, 'area-marketing', testInfo, async () => {
    await page.goto('/marketing');
    await settle(page, 1600);

    await beat(page, 'mkt-dashboard', async () => {
      await glance(page, page.getByText('Total Sent').first(), 800);
      await glance(page, page.getByText('Avg Open Rate').first(), 700);
      await scrollSteps(page, 1, 350);
    });

    await beat(page, 'campaigns', async () => {
      await page.goto('/marketing/campaigns');
      await settle(page, 1200);
      await openRow(page, 'Diwali Getaways 2026', /\/marketing\/campaigns\/[^/]+$/);
      await scrollSteps(page, 1, 300);
    });

    await beat(page, 'campaign-new', async () => {
      await page.goto('/marketing/campaigns/new');
      await settle(page, 900);
      await typeInto(page, page.locator('#name'), 'Christmas in Kerala: early bird');
      await pickRelation(page, page.getByRole('combobox').filter({ hasText: /All contacts/ }), /Search/i, 'Families', 'Families with kids');
      await typeInto(page, page.locator('#subject'), 'Christmas in Kerala: book by 31 Oct, save 10%');
      await typeInto(page, page.locator('#content'), 'Hi {{first_name}},\n\nSpend Christmas on a private Alleppey houseboat. Book by 31 October and save 10%.\n\nSahyadri Holidays', { delay: 18 });
      const when = page.getByRole('button', { name: 'Pick a date' }).first();
      await focus(page, 'schedule', when);
      await pickDate(page, when, D.day(7));
      await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
      await page.waitForURL(/\/marketing\/campaigns(\/[^/]+)?$/, { timeout: 20_000 });
      await settle(page, 1000);
    });

    await beat(page, 'segments', async () => {
      await page.goto('/marketing/segments/new');
      await settle(page, 900);
      await typeInto(page, page.locator('#name'), 'Kerala enquiries: Bengaluru');
      await typeInto(page, page.locator('#description'), 'Bengaluru contacts interested in Kerala');
      await typeInto(page, page.getByPlaceholder('Value...').first(), 'Bengaluru');
      await clickOn(page, page.getByRole('button', { name: 'Add rule', exact: true }));
      const combos = page.getByRole('combobox');
      await pickSelect(page, combos.nth(2), 'Tag');
      await pickSelect(page, combos.nth(3), 'Contains');
      await typeInto(page, page.getByPlaceholder('Value...').nth(1), 'kerala');
      await clickOn(page, page.getByRole('button', { name: 'Preview count' }));
      await settle(page, 1300);
      await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
      await page.waitForURL('**/marketing/segments', { timeout: 20_000 });
      await settle(page, 900);
    });

    await beat(page, 'flyers', async () => {
      await page.goto('/marketing/flyers/new');
      await settle(page, 900);
      await clickOn(page, page.getByRole('combobox').filter({ hasText: /Select a template/ }));
      await pause(page, 300);
      await clickOn(page, page.getByRole('option', { name: /Festival offer/ }).first());
      await typeInto(page, page.locator('#title'), 'Diwali in Udaipur');
      await typeInto(page, page.locator('#headline'), 'Diwali in Udaipur: 3 nights from ₹38,999');
      await typeInto(page, page.locator('#subheadline'), 'Lake palace stays and a private Diwali dinner');
      await clickOn(page, page.getByRole('button', { name: 'Sunset' }));
      await clickOn(page, page.getByRole('button', { name: /save|create flyer|create/i }).last());
      await page.waitForURL(/\/marketing\/flyers(\/[^/]+)?$/, { timeout: 20_000 });
      await settle(page, 1000);
      await page.goto('/marketing/branding');
      await settle(page, 1100);
    });

    await beat(page, 'festivals', async () => {
      await page.goto('/marketing/festivals');
      await settle(page, 1300);
      await scrollSteps(page, 1, 300);
      await glance(page, page.getByRole('button', { name: 'Create Campaign' }).first(), 800);
    });

    await beat(page, 'whatsapp-campaigns', async () => {
      await page.goto('/marketing/whatsapp');
      await settle(page, 1300);
      await expect(page.getByText('Diwali greetings to past travellers').first()).toBeVisible();
      await openRow(page, 'Diwali greetings', /\/marketing\/whatsapp\/[^/]+$/);
    });

    await beat(page, 'opt-out', async () => {
      await page.goto('/marketing/opted-out');
      await settle(page, 1300);
      await glance(page, page.getByText('Zoya Khan').first(), 1100);
    });

    await beat(page, 'reviews-winback', async () => {
      await page.goto('/assistant?tab=automations');
      await settle(page, 1400);
      const review = page.locator('[data-recipe="marketing.post_trip_review"]');
      await review.scrollIntoViewIfNeeded().catch(() => undefined);
      await glance(page, review, 1100);
      await glance(page, page.locator('[data-recipe="marketing.dormant_win_back"]'), 1100);
    });
  });
});

void visit;
