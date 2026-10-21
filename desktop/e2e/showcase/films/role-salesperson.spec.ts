/** Film role-salesperson: Sneha Iyer (salesperson) (studio/clips/role-salesperson.json). */
import * as D from '../demo-data';
import { asUser, beat, clickOn, expect, findOne, glance, openRow, pause, pickDateTime, pickRelation, pickSelect, recordFilm, search, settle, staffEmail, typeInto, visit } from './film-kit';

const test = asUser(staffEmail('sneha'));

test('film:role-salesperson', async ({ page, context }, testInfo) => {
  test.setTimeout(20 * 60_000);
  await recordFilm(page, context, 'role-salesperson', testInfo, async () => {
    await page.goto('/follow-ups');
    await settle(page, 1500);

    await beat(page, 'sp-today', async () => {
      await pickSelect(page, page.getByRole('combobox').filter({ hasText: /^All statuses$/ }), 'Overdue');
      await settle(page, 1000);
      await glance(page, page.locator('table tbody tr').first(), 700);
      await pickSelect(page, page.getByRole('combobox').filter({ hasText: /^Overdue$/ }), /All statuses/);
      await settle(page, 700);
    });

    await beat(page, 'sp-lead', async () => {
      await visit(page, '/leads');
      await search(page, /Search leads/i, 'Goa Beach Escape');
      await openRow(page, 'Goa Beach Escape', /\/leads\/[^/]+$/);
      await clickOn(page, page.getByRole('button', { name: /Add note/ }).first());
      const dlg = page.getByRole('dialog');
      await typeInto(page, dlg.locator('textarea').first(), 'Kids want a beach-front pool; prefer North Goa.');
      await clickOn(page, dlg.getByRole('button', { name: 'Add Note' }));
      await settle(page, 700);
      await clickOn(page, page.getByRole('button', { name: /Schedule/ }).first());
      const fu = page.getByRole('dialog');
      await pickDateTime(page, fu.getByRole('button', { name: /Pick date & time/ }), D.day(1), 11, 30);
      const notes = fu.locator('textarea').first();
      if (await notes.isVisible().catch(() => false)) await typeInto(page, notes, 'Share two North Goa resorts with pools');
      await clickOn(page, fu.getByRole('button', { name: /Schedule/ }).last());
      await settle(page, 900);
    });

    await beat(page, 'sp-quote', async () => {
      await page.goto('/itineraries/templates');
      await settle(page, 1100);
      await search(page, /Search templates/i, 'Goa');
      const tpl = page.locator('table tbody tr').first();
      await clickOn(page, tpl.locator('button[aria-label="Use template"]'));
      const use = page.getByRole('dialog');
      await pickRelation(page, use.getByRole('combobox').first(), /Search leads/i, 'Goa Beach Escape', /Goa Beach Escape/);
      await clickOn(page, use.getByRole('button', { name: /Create itinerary/i }));
      await page.waitForURL(/\/itineraries\/[^/]+$/, { timeout: 20_000 });
      await settle(page, 1200);
    });

    await beat(page, 'sp-share', async () => {
      const c = await findOne(`/contacts?search=${encodeURIComponent('Aditya Joshi')}`, (x) => x.name === 'Aditya Joshi');
      await page.goto(`/contacts/${c.id}`);
      await settle(page, 1100);
      const share = page.getByRole('button', { name: /Share/ }).first();
      if (await share.isVisible().catch(() => false)) {
        await clickOn(page, share);
        const dlg = page.getByRole('dialog');
        await clickOn(page, dlg.getByRole('combobox').first());
        await typeInto(page, page.getByPlaceholder(/Search/i).last(), 'Farhan');
        await settle(page, 500);
        await clickOn(page, page.getByRole('option').filter({ hasText: 'Farhan Qureshi' }).first());
        await clickOn(page, dlg.getByRole('button', { name: /Share/ }).last());
        await settle(page, 800);
      }
      await glance(page, page.getByText(/Birthday|Anniversary/).first(), 800);
    });

    await beat(page, 'sp-inbox', async () => {
      await visit(page, '/communication');
      await clickOn(page, page.locator('table tbody tr').first());
      await expect(page.getByRole('dialog')).toBeVisible();
      await pause(page, 1200);
      await page.keyboard.press('Escape');
    });
  });
});
