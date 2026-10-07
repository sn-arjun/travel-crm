/** Walkthrough part 5: Productivity & communication (chapters 22-29): tasks, calendar, follow-ups, documents, inbox, templates, calls, chatbot. */
import * as path from 'node:path';

import * as D from './demo-data';
import { expect, test } from './showcase-fixtures';
import { pause, pickDate, pickDateTime, pickRelation, pickSelect } from './showcase-helpers';
import { assertClean, chapter, clickOn, dwell, ensurePriyaLead, hoverOn, nav, openRow, recordPart, say, search, settle, typeInto } from './walkthrough-kit';

const PDF = path.resolve(__dirname, 'fixtures', 'nair-family-passports.pdf');

test('wt5: tasks, calendar, follow-ups, documents, inbox, templates, calls, chatbot (chapters 22-29)', async ({ page, context }, testInfo) => {
  test.setTimeout(30 * 60_000);
  await recordPart(page, context, 'wt5', testInfo, async () => {
    await ensurePriyaLead();
    await page.goto('/tasks');
    await settle(page, 1500);

    // ── 22 Tasks ──
    await chapter(page, 22, 'Tasks', 'Owners, due dates and context');
    await clickOn(page, page.getByRole('button', { name: 'Kanban view' }));
    await settle(page, 1300);
    await say(page, 'Team tasks with owners, due dates and context', 2800);
    await clickOn(page, page.getByRole('button', { name: 'Table view' }));
    await settle(page, 900);
    await clickOn(page, page.getByRole('button', { name: /Add task/ }).first());
    const td = page.getByRole('dialog');
    await typeInto(page, td.locator('#taskTitle'), 'Confirm veg houseboat menu for the Nair family');
    const combos = td.locator('button[role="combobox"]');
    await pickSelect(page, combos.nth(0), /^High$/);
    await pickRelation(page, combos.nth(2), /Search/i, 'Deepa', 'Deepa Thomas');
    await pickRelation(page, combos.nth(3), /Search/i, 'Kerala Backwaters', /Kerala Backwaters Family Holiday/);
    await pickDate(page, td.getByRole('button', { name: /pick a date/i }), D.day(1));
    await assertClean(page, 'ch22 form');
    await clickOn(page, td.getByRole('button', { name: /^create task$/i }));
    await expect(page.getByText('Task created').first()).toBeVisible({ timeout: 10_000 });
    await settle(page, 1500);
    await search(page, /Search tasks/i, 'veg houseboat');
    await openRow(page, 'veg houseboat', /\/tasks\/(?!new)[\w-]+$/);
    await clickOn(page, page.getByRole('tab', { name: 'Related' }));
    await typeInto(page, page.getByPlaceholder('Add a comment...'), 'Lakes & Lagoons confirmed a Kerala sadya lunch on day 4.');
    await clickOn(page, page.getByRole('button', { name: /^post$/i }));
    await expect(page.getByText('Comment added').first()).toBeVisible({ timeout: 10_000 });
    await pickSelect(page, page.locator('button[role="combobox"]').first(), /^In Progress$/);
    await expect(page.getByText('Status updated').first()).toBeVisible();
    await dwell(page, 1500);
    await assertClean(page, 'ch22');

    // ── 23 Calendar ──
    await chapter(page, 23, 'Calendar', 'Meetings, arrivals and follow-ups');
    await nav(page, '/calendar');
    await clickOn(page, page.getByRole('button', { name: 'week', exact: true }));
    await settle(page, 1200);
    await say(page, 'Meetings, arrivals and follow-ups on one calendar', 2800);
    const tomorrow = new Date(D.day(1) + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }).toUpperCase();
    await clickOn(page, page.getByText(new RegExp('^' + tomorrow + '$', 'i')).first());
    await clickOn(page, page.getByRole('button', { name: /add event/i }).first());
    const ev = page.getByRole('dialog').filter({ hasText: 'Create Event' });
    await typeInto(page, ev.locator('input[placeholder="Event title"]'), 'Supplier meet — Vembanad Lake Resort');
    await pickSelect(page, ev.getByRole('combobox').first(), 'Meeting');
    await typeInto(page, ev.locator('input[placeholder="Add location"]'), 'Kumarakom');
    await clickOn(page, ev.getByRole('button', { name: 'Create' }));
    await expect(ev).toBeHidden();
    await page.keyboard.press('Escape');
    await pause(page, 500);
    await settle(page, 1300);
    await clickOn(page, page.getByRole('button', { name: 'month', exact: true }));
    await settle(page, 1500);
    await assertClean(page, 'ch23');

    // ── 24 Follow-ups ──
    await chapter(page, 24, 'Follow-ups', 'Never miss a callback');
    await nav(page, '/follow-ups');
    await pickSelect(page, page.getByRole('combobox').filter({ hasText: /^All statuses$/ }), 'Overdue');
    await settle(page, 1300);
    await say(page, 'Never miss a callback again', 2800);
    const fr = page.locator('table tbody tr').filter({ hasText: 'Aditya Joshi' }).first();
    await hoverOn(page, fr, 600);
    await clickOn(page, fr.getByRole('button', { name: 'Mark complete', exact: true }));
    const cd = page.getByRole('dialog');
    await pickSelect(page, cd.locator('#complete-outcome'), 'Positive');
    await typeInto(page, cd.locator('#complete-notes'), 'Wants the Universal Studios add-on');
    await clickOn(page, cd.getByRole('button', { name: 'Mark complete' }));
    await expect(page.getByText('Follow-up completed').first()).toBeVisible();
    await dwell(page, 1500);
    await clickOn(page, page.getByRole('button', { name: /Schedule follow-up/ }).first());
    const sf = page.getByRole('dialog');
    await pickRelation(page, sf.getByRole('combobox').first(), /Search/i, 'Singapore', /Singapore Family Fun/);
    await pickDateTime(page, sf.getByRole('button', { name: /Pick date & time/ }), D.day(2), 11, 0);
    await typeInto(page, sf.locator('#followup-notes'), 'Confirm the Universal Studios add-on and send the revised quote');
    await clickOn(page, sf.getByRole('button', { name: /^Schedule/ }).last());
    await settle(page, 1500);
    await assertClean(page, 'ch24');

    // ── 25 Documents ──
    await chapter(page, 25, 'Documents', 'Every file on the right booking');
    await nav(page, '/documents');
    await clickOn(page, page.getByRole('button', { name: /Upload File/i }).first());
    await page.locator('input[type="file"]').setInputFiles(PDF);
    await settle(page, 800);
    await typeInto(page, page.locator('#doc-name'), 'Nair family — passport copies');
    await pickSelect(page, page.locator('#doc-category'), 'Passport');
    await say(page, 'Every file attached to the right booking', 2800);
    await clickOn(page, page.getByRole('button', { name: /^Upload$/i }));
    await expect(page.getByText('Document uploaded').first()).toBeVisible({ timeout: 15_000 });
    await settle(page, 1500);
    const dr = page.locator('table tbody tr').filter({ hasText: 'passport copies' }).first();
    await hoverOn(page, dr, 600);
    await clickOn(page, dr.getByRole('button', { name: 'Rename' }));
    await typeInto(page, page.locator('#rename-input'), 'Nair family — passport copies (4)');
    await page.getByRole('dialog').getByRole('button', { name: /Save|Rename/ }).last().click();
    await settle(page, 1500);
    await assertClean(page, 'ch25');

    // ── 26 Inbox & bulk send ──
    await chapter(page, 26, 'Inbox & bulk send', 'Every channel in one inbox');
    await nav(page, '/communication');
    await pickSelect(page, page.getByRole('combobox').filter({ hasText: /All channels/ }), 'WhatsApp');
    await settle(page, 1300);
    await say(page, 'Every channel in one inbox, plus bulk sends', 3000);
    await clickOn(page, page.locator('table tbody tr').filter({ hasText: 'Neha Kapoor' }).first());
    await expect(page.getByRole('dialog')).toBeVisible();
    await dwell(page, 1800);
    await page.keyboard.press('Escape');
    await pause(page, 500);
    await page.goto('/communication/bulk-send');
    await settle(page, 1200);
    await clickOn(page, page.getByRole('button', { name: 'WhatsApp', exact: true }));
    await pickSelect(page, page.getByRole('combobox').filter({ hasText: /Choose a tag/ }), 'honeymoon');
    await settle(page, 900);
    await pickSelect(page, page.getByRole('combobox').filter({ hasText: /No template/ }), /Booking confirmed/);
    await settle(page, 900);
    await say(page, 'Pick an audience and a template — preview before you send', 3200);
    await assertClean(page, 'ch26');

    // ── 27 Message templates ──
    await chapter(page, 27, 'Message templates', 'Reusable, with live variable preview');
    await nav(page, '/communication/templates');
    await say(page, 'Reusable templates with live variable preview', 2800);
    await page.goto('/communication/templates/new');
    await settle(page, 1000);
    await typeInto(page, page.locator('#name'), 'Driver details — airport pickup');
    await pickSelect(page, page.getByRole('combobox').first(), 'WhatsApp');
    await pickSelect(page, page.getByRole('combobox').filter({ hasText: /Select category/ }), 'Booking Confirmation');
    const body = page.locator('textarea').first();
    await typeInto(page, body, 'Hi {first_name}, your driver will meet you at the arrival gate with a name board. See you in {destination}!', { delay: 25 });
    await pickRelation(page, page.getByRole('combobox').filter({ hasText: 'Pick a contact to preview' }), /Search/i, 'Arjun', /Arjun Mehta/);
    await clickOn(page, page.getByRole('button', { name: /^Preview$/ }));
    await expect(page.getByRole('dialog')).toBeVisible();
    await dwell(page, 2200);
    await page.keyboard.press('Escape');
    await pause(page, 500);
    await assertClean(page, 'ch27 form');
    await clickOn(page, page.getByRole('button', { name: 'Save Template' }));
    await page.waitForURL('**/communication/templates', { timeout: 20_000 });
    await settle(page, 1500);
    await assertClean(page, 'ch27');

    // ── 28 Calls & VoIP ──
    await chapter(page, 28, 'Calls & VoIP', 'Every call logged');
    await nav(page, '/communication/calls');
    await say(page, 'Every call logged, missed calls never lost', 2800);
    await clickOn(page, page.getByRole('button', { name: 'Analytics' }).or(page.getByRole('link', { name: 'Analytics' })).first());
    await page.waitForURL('**/communication/calls/analytics');
    await settle(page, 2000);
    await dwell(page, 1500);
    await page.goto('/settings/voip');
    await settle(page, 1500);
    await say(page, 'Bring your own VoIP provider', 2600);
    await assertClean(page, 'ch28');

    // ── 29 Chatbot ──
    await chapter(page, 29, 'Chatbot', 'A website bot that hands off to your team');
    await nav(page, '/chatbot');
    await say(page, 'A website chatbot that hands off to your team', 2800);
    await openRow(page, 'Meera', /\/chatbot\/conversations\/[^/]+$/);
    await dwell(page, 1800);
    await typeInto(page, page.getByPlaceholder(/Type a reply/i), 'Namaste Meera, a January honeymoon in the Andamans is perfect. May I call you this evening?', { delay: 25 });
    await clickOn(page, page.getByRole('button', { name: 'Send reply' }));
    await settle(page, 1500);
    await page.goto('/settings/chatbot');
    await settle(page, 1500);
    await clickOn(page, page.getByRole('tab', { name: /Install widget/i }));
    await dwell(page, 2000);
    await assertClean(page, 'ch29');
  });
});
