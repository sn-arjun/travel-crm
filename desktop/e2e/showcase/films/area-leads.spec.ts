/** Film area-leads: leads, follow-ups, tasks, calendar (studio/clips/area-leads.json). Signed in as the demo admin. */
import * as D from '../demo-data';
import { asUser, beat, clickOn, expect, focus, glance, hoverOn, openRow, pause, pickDate, pickDateTime, pickRelation, pickSelect, recordFilm, scrollSteps, search, settle, typeInto, visit } from './film-kit';

const test = asUser();

test('film:area-leads', async ({ page, context }, testInfo) => {
  test.setTimeout(25 * 60_000);
  await recordFilm(page, context, 'area-leads', testInfo, async () => {
    await page.goto('/leads');
    await settle(page, 1500);

    await beat(page, 'leads-list', async () => {
      const status = page.getByRole('combobox', { name: 'Filter by status' });
      await focus(page, 'status-filter', status);
      await pickSelect(page, status, 'Qualified');
      await settle(page, 1200);
      await pickSelect(page, status, /All statuses/);
      await settle(page, 800);
      await search(page, /Search leads/i, 'Goa');
      await scrollSteps(page, 1, 300);
      await typeInto(page, page.getByPlaceholder(/Search leads/i).first(), '');
      await settle(page, 800);
    });

    await beat(page, 'leads-new', async () => {
      await page.goto('/leads/new');
      await settle(page, 900);
      await pickRelation(page, /Select a contact/, /Search contacts/i, 'Ritu', 'Ritu Sharma');
      await typeInto(page, page.locator('#title'), 'Havelock Dive Week');
      const dest = page.getByPlaceholder(/Type & press Enter|Add more/i).first();
      for (const d of ['Port Blair', 'Havelock']) { await typeInto(page, dest, d, { clear: false }); await page.keyboard.press('Enter'); await pause(page, 200); }
      await pickSelect(page, page.locator('#tripType'), 'Adventure');
      await pickDate(page, page.locator('button:has-text("Pick travel date")'), D.day(110));
      await typeInto(page, page.locator('#paxAdults'), '2');
      await typeInto(page, page.locator('input[inputmode="decimal"]').first(), '145000');
      await pickSelect(page, page.locator('#priority'), 'Warm');
      await pickSelect(page, page.locator('#source'), 'Referral');
      const save = page.getByRole('button', { name: /Save Lead/i }).first();
      await focus(page, 'lead-save', save);
      await clickOn(page, save);
      await expect(page.getByText('Lead created successfully').first()).toBeVisible({ timeout: 15_000 });
      await page.waitForURL('**/leads');
      await settle(page, 900);
    });

    await beat(page, 'leads-detail', async () => {
      await search(page, /Search leads/i, 'Havelock Dive Week');
      await openRow(page, 'Havelock Dive Week', /\/leads\/[^/]+$/);
      await clickOn(page, page.getByRole('button', { name: /Add note/ }).first());
      const dlg = page.getByRole('dialog');
      await typeInto(page, dlg.locator('textarea').first(), 'Both are certified open-water divers; wants two boat dives a day.');
      await clickOn(page, dlg.getByRole('button', { name: 'Add Note' }));
      await settle(page, 900);
      await scrollSteps(page, 2, 380);
      await page.mouse.wheel(0, -1200);
      await pause(page, 400);
    });

    await beat(page, 'leads-status', async () => {
      await clickOn(page, page.getByRole('button', { name: 'Change Status' }));
      const dlg = page.getByRole('dialog');
      await pickSelect(page, dlg.getByRole('combobox').first(), 'Lost');
      const reason = dlg.getByPlaceholder('Why was this lead lost?');
      await focus(page, 'lost-reason', reason);
      await typeInto(page, reason, 'Booked directly with a dive resort in Havelock');
      await clickOn(page, dlg.getByRole('button', { name: 'Update Status' }));
      await settle(page, 1200);
      await glance(page, page.getByText('Lost', { exact: true }).first());
    });

    await beat(page, 'leads-unassigned', async () => {
      await page.goto('/leads/unassigned');
      await settle(page, 1200);
      const row = page.locator('table tbody tr').first();
      await hoverOn(page, row, 500);
      await clickOn(page, row.locator('button[aria-label="Assign"]'));
      const asg = page.getByRole('dialog');
      await clickOn(page, asg.getByRole('combobox').first());
      await typeInto(page, page.getByPlaceholder(/Search team/i), 'Farhan');
      await settle(page, 600);
      await clickOn(page, page.getByRole('option').filter({ hasText: 'Farhan Qureshi' }).first());
      await clickOn(page, asg.getByRole('button', { name: 'Assign' }).last());
      await expect(page.getByText(/lead\(s\) assigned/)).toBeVisible();
    });

    await beat(page, 'leads-rules', async () => {
      await page.goto('/settings/assignment-rules');
      await settle(page, 1300);
      await scrollSteps(page, 1, 300);
      await page.goto('/settings/routing-rules');
      await settle(page, 1300);
      await page.goto('/settings/followup-sequences');
      await settle(page, 1300);
      await scrollSteps(page, 1, 300);
    });

    await beat(page, 'followups', async () => {
      await visit(page, '/follow-ups');
      await pickSelect(page, page.getByRole('combobox').filter({ hasText: /^All statuses$/ }), 'Overdue');
      await settle(page, 1000);
      const row = page.locator('table tbody tr').filter({ hasText: 'Aditya Joshi' }).first();
      await hoverOn(page, row, 500);
      const done = row.getByRole('button', { name: 'Mark complete', exact: true });
      await focus(page, 'followup-complete', done);
      await clickOn(page, done);
      const cd = page.getByRole('dialog');
      await pickSelect(page, cd.locator('#complete-outcome'), 'Positive');
      await typeInto(page, cd.locator('#complete-notes'), 'Wants the Universal Studios add-on');
      await clickOn(page, cd.getByRole('button', { name: 'Mark complete' }));
      await expect(page.getByText('Follow-up completed').first()).toBeVisible();
      await clickOn(page, page.getByRole('button', { name: /Schedule follow-up/ }).first());
      const sf = page.getByRole('dialog');
      await pickRelation(page, sf.getByRole('combobox').first(), /Search/i, 'Singapore', /Singapore Family Fun/);
      await pickDateTime(page, sf.getByRole('button', { name: /Pick date & time/ }), D.day(2), 11, 0);
      await typeInto(page, sf.locator('#followup-notes'), 'Send the revised quote with Universal Studios');
      await clickOn(page, sf.getByRole('button', { name: /^Schedule/ }).last());
      await settle(page, 900);
    });

    await beat(page, 'tasks', async () => {
      await visit(page, '/tasks');
      await clickOn(page, page.getByRole('button', { name: 'Kanban view' }));
      await settle(page, 1100);
      await clickOn(page, page.getByRole('button', { name: 'Table view' }));
      await settle(page, 700);
      await search(page, /Search tasks/i, 'Maldives');
      await openRow(page, 'Maldives', /\/tasks\/(?!new)[\w-]+$/);
      await clickOn(page, page.getByRole('tab', { name: 'Related' }));
      await typeInto(page, page.getByPlaceholder('Add a comment...'), 'Sunset villa option sent to Neha.');
      await clickOn(page, page.getByRole('button', { name: /^post$/i }));
      await expect(page.getByText('Comment added').first()).toBeVisible({ timeout: 10_000 });
    });

    await beat(page, 'calendar', async () => {
      await visit(page, '/calendar');
      await clickOn(page, page.getByRole('button', { name: 'week', exact: true }));
      await settle(page, 1000);
      await clickOn(page, page.getByRole('button', { name: /add event/i }).first());
      const ev = page.getByRole('dialog').filter({ hasText: 'Create Event' });
      await typeInto(page, ev.locator('input[placeholder="Event title"]'), 'Supplier meet: Vembanad Lake Resort');
      await pickSelect(page, ev.getByRole('combobox').first(), 'Meeting');
      await typeInto(page, ev.locator('input[placeholder="Add location"]'), 'Kumarakom');
      await clickOn(page, ev.getByRole('button', { name: 'Create' }));
      await expect(ev).toBeHidden();
      await settle(page, 900);
    });

    await beat(page, 'leads-io', async () => {
      await page.goto('/import');
      await settle(page, 1200);
      await glance(page, page.getByRole('button', { name: /Leads$/ }), 900);
      await page.goto('/settings/export');
      await settle(page, 1200);
      await glance(page, page.getByRole('button', { name: /Export Leads/ }), 900);
    });
  });
});
