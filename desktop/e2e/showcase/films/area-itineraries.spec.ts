/** Film area-itineraries: itineraries, templates, rate cards, suppliers (studio/clips/area-itineraries.json). Demo admin. */
import { asUser, beat, clickOn, expect, focus, glance, hoverOn, openRow, pause, pickRelation, pickSelect, recordFilm, scrollSteps, search, settle, typeInto, visit } from './film-kit';

const test = asUser();

test('film:area-itineraries', async ({ page, context }, testInfo) => {
  test.setTimeout(25 * 60_000);
  await recordFilm(page, context, 'area-itineraries', testInfo, async () => {
    await page.goto('/itineraries');
    await settle(page, 1500);

    await beat(page, 'itin-list', async () => {
      await page.getByLabel('Filter by status').selectOption('draft');
      await settle(page, 1100);
      await page.getByLabel('Filter by status').selectOption('');
      await settle(page, 800);
      await scrollSteps(page, 1, 300);
    });

    await beat(page, 'itin-builder', async () => {
      await clickOn(page, page.getByRole('link', { name: /New Itinerary/ }).or(page.getByRole('button', { name: /New Itinerary/ })).first());
      await page.waitForURL('**/itineraries/new');
      await settle(page, 900);
      await typeInto(page, page.locator('#title'), 'Goa Beach Escape: Desai family');
      await pickRelation(page, page.getByRole('combobox').filter({ hasText: /Search leads/ }).first(), /Search leads/i, 'Goa Beach Escape', /Goa Beach Escape/);
      await typeInto(page, page.locator('#dest'), 'Goa');
      await typeInto(page, page.getByLabel('Day 1 title'), 'Arrive North Goa');
      await clickOn(page, page.getByRole('button', { name: /^hotel$/i }).first());
      await clickOn(page, page.getByRole('button', { name: 'Select from Rate Card' }).first());
      const picker = page.getByRole('dialog').filter({ hasText: 'Select from Rate Cards' });
      await typeInto(page, picker.getByPlaceholder('Search rate cards...'), 'Candolim');
      await settle(page, 900);
      const pick = picker.locator('li').filter({ hasText: 'Candolim Sands Resort' }).first().getByRole('button', { name: 'Select' });
      await focus(page, 'rate-card-pick', pick);
      await clickOn(page, pick);
      await expect(page.getByText('Rate card applied').first()).toBeVisible();
      await clickOn(page, page.getByRole('button', { name: /^Save$/ }));
      await page.waitForURL(/\/itineraries\/[^/]+$/, { timeout: 20_000 });
      await settle(page, 1100);
    });

    await beat(page, 'itin-costs', async () => {
      await clickOn(page, page.getByRole('tab', { name: 'Costs' }));
      await pause(page, 1300);
      await clickOn(page, page.getByRole('tab', { name: 'Versions' }));
      await pause(page, 1100);
    });

    await beat(page, 'itin-share', async () => {
      await clickOn(page, page.getByRole('tab', { name: 'Share' }));
      await settle(page, 500);
      const gen = page.getByRole('button', { name: /Generate Share Link/ });
      await focus(page, 'share-link', gen);
      await clickOn(page, gen);
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: /Share link generated/ }).first()).toBeVisible({ timeout: 15_000 });
      await pause(page, 700);
      await clickOn(page, page.getByRole('button', { name: /Send via WhatsApp/ }));
      const dlg = page.getByRole('dialog').filter({ hasText: /Choose Template|Compose WhatsApp/ });
      await expect(dlg).toBeVisible({ timeout: 15_000 });
      await pause(page, 1500);
      await page.keyboard.press('Escape');
      await pause(page, 400);
      const pdfUrl = page.url().replace(/\/?$/, '/pdf');
      await page.goto(pdfUrl);
      await settle(page, 1800);
      await page.goBack();
      await settle(page, 900);
    });

    await beat(page, 'itin-clone', async () => {
      await visit(page, '/itineraries');
      const row = page.locator('table tbody tr').filter({ hasText: 'Goa Beach Escape' }).first();
      await hoverOn(page, row, 500);
      const more = row.getByRole('button', { name: /More|Actions/ }).first();
      await clickOn(page, more);
      await clickOn(page, page.getByRole('menuitem', { name: /Clone|Duplicate/ }));
      await settle(page, 1200);
    });

    await beat(page, 'itin-templates', async () => {
      await page.goto('/itineraries/templates');
      await settle(page, 1100);
      await search(page, /Search templates/i, 'Rajasthan');
      const raj = page.locator('table tbody tr').filter({ hasText: 'Rajasthan Royal Heritage' }).first();
      await clickOn(page, raj.locator('button[aria-label="Preview"]'));
      await expect(page.getByRole('dialog')).toBeVisible();
      await pause(page, 1300);
      await clickOn(page, page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).first());
      await clickOn(page, raj.locator('button[aria-label="Use template"]'));
      const use = page.getByRole('dialog');
      await pickRelation(page, use.getByRole('combobox').first(), /Search leads/i, 'Rajasthan Royal', /Rajasthan Royal Heritage/);
      await clickOn(page, use.getByRole('button', { name: /Create itinerary/i }));
      await page.waitForURL(/\/itineraries\/[^/]+$/, { timeout: 20_000 });
      await settle(page, 1200);
    });

    await beat(page, 'itin-defaults', async () => {
      await page.goto('/settings/itinerary-defaults');
      await settle(page, 1300);
      await scrollSteps(page, 1, 350);
    });

    await beat(page, 'rate-cards', async () => {
      await visit(page, '/rate-cards');
      await page.goto('/rate-cards/new');
      await settle(page, 900);
      await typeInto(page, page.locator('#name'), 'Alleppey Sunset Shikara Ride, 2 hours');
      await pickSelect(page, page.locator('button#serviceType'), 'Activity');
      await pickRelation(page, page.getByRole('combobox').filter({ hasText: /Select supplier/ }).first(), /Search/i, 'Lakes', 'Lakes & Lagoons Houseboats');
      await pickSelect(page, page.locator('button#season'), 'Peak');
      await typeInto(page, page.locator('#costPrice'), '600');
      await typeInto(page, page.locator('#sellingPrice'), '850');
      await pickSelect(page, page.locator('button#unit'), 'Per Person');
      await clickOn(page, page.getByRole('button', { name: /^Save$/ }));
      await page.waitForURL('**/rate-cards', { timeout: 20_000 });
      await settle(page, 900);
    });

    await beat(page, 'suppliers', async () => {
      await visit(page, '/suppliers');
      await search(page, /Search suppliers/i, 'Vembanad');
      await openRow(page, 'Vembanad Lake Resort', /\/suppliers\/[^/]+$/);
      await scrollSteps(page, 2, 380);
      await glance(page, page.getByRole('tab', { name: /Rates|Ledger|Payments/ }), 700);
      await page.goto('/accounts');
      await settle(page, 1100);
    });

    await beat(page, 'suppliers-compare', async () => {
      await page.goto('/suppliers/compare');
      await settle(page, 1000);
      await pickSelect(page, page.getByRole('combobox').filter({ hasText: /Select service type/ }), 'Hotel');
      await typeInto(page, page.getByPlaceholder('e.g., Goa, Maldives, Thailand'), 'Kerala');
      await clickOn(page, page.getByRole('button', { name: 'Compare Rates' }));
      await settle(page, 1500);
    });
  });
});
