/**
 * FULL WALKTHROUGH (STORYBOARD C): every feature area of the desktop app with a real interaction per chapter.
 * Recorded as independent parts so a failure only costs one part (compose.mjs concatenates them in order):
 *
 *   wt1  Workspace & CRM            sign in, dashboard, contacts, leads, accounts
 *   wt2  Sales & supply             itineraries, templates, rate cards, suppliers
 *   wt3  Revenue                    invoices, payments, credit and debit notes, vouchers
 *   wt4  Travellers & fleet         travellers, visa, vehicles, drivers, trips, fleet rate cards, dashboard and alerts
 *   wt5  Productivity & comms       tasks, calendar, follow-ups, documents, inbox, templates, calls, chatbot
 *   wt6  Marketing                  dashboard, campaigns, segments, flyers, festivals, opted-out, WhatsApp
 *   wt7  Insights & administration  AI, reports, import / export, notifications, settings, integrations, super admin, help
 *
 *   node scripts/record-demo.mjs --slot 2 --only walkthrough            (all parts)
 *   npx playwright test --config=playwright.showcase.config.ts --grep "wt3"   (one part, then compose)
 *
 * Every interaction is hand-written with the values from demo-data.ts; any failure aborts the part (no failure captions).
 * SHOWCASE_PACE=0.15 gives a fast dry run. Chapter captions: benefit first, 12 words or fewer.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect, test as authed } from './showcase-fixtures';
import { test as anon } from '@playwright/test';
import * as D from './demo-data';
import {
  assertClean, chapter, clickOn, dwell, hoverOn, nav, openRow, recordPart, say, scrollSteps, search, settle, sidebar, typeInto,
} from './walkthrough-kit';
import { fieldByLabel, hideOverlays, mark, moveTo, pause, pickDate, pickDateTime, pickRelation, pickSelect, showOverlays } from './showcase-helpers';

void fs; void path; void fieldByLabel; void hideOverlays; void showOverlays; void moveTo; void pickDate; void pickDateTime; void pickRelation; void pickSelect; void scrollSteps; void sidebar; void D;

authed.describe.configure({ mode: 'serial' });

// ═════════════════════════════ wt1 — Workspace & CRM ═════════════════════════════

anon.describe('wt1 anonymous start', () => {
  anon.use({ storageState: { cookies: [], origins: [] } });
  anon('wt1: workspace and CRM (chapters 1-5)', async ({ page, context }, testInfo) => {
    anon.setTimeout(20 * 60_000);
    await recordPart(page, context, 'wt1', testInfo, async () => {
      // ── 1 Sign in & workspace ──
      await page.goto('/login');
      await settle(page, 1000);
      await chapter(page, 1, 'Sign in & workspace', 'A private workspace for your agency');
      await typeInto(page, page.locator('#email'), D.DEMO_EMAIL);
      await say(page, "Secure sign-in to your agency's private workspace", 2600);
      await clickOn(page, page.getByRole('button', { name: 'Continue' }));
      await page.waitForSelector('#password', { timeout: 15_000 });
      await typeInto(page, page.locator('#password'), D.DEMO_PASSWORD, { delay: 70 });
      await clickOn(page, page.getByRole('button', { name: 'Sign in' }));
      await page.waitForURL('**/dashboard', { timeout: 30_000 });
      await settle(page, 2200);
      await expect(page.getByText('Welcome back, Ananya').first()).toBeVisible();
      await clickOn(page, page.getByRole('button', { name: /Search/ }).first());
      await typeInto(page, page.getByPlaceholder('Type a command or search...'), 'invoice');
      await settle(page, 1500);
      await expect(page.getByText('Create a new invoice')).toBeVisible();
      await say(page, 'Jump anywhere or create anything from one shortcut', 3200);
      await page.keyboard.press('Escape');
      await pause(page, 500);
      await clickOn(page, page.getByRole('button', { name: 'Switch to dark theme' }));
      await dwell(page, 2200);
      await clickOn(page, page.getByRole('button', { name: 'Switch to light theme' }));
      await dwell(page, 800);
      await assertClean(page, 'ch1');

      // ── 2 Dashboard ──
      await chapter(page, 2, 'Dashboard', 'Today at a glance');
      await expect(page.getByText('New Leads').first()).toBeVisible();
      await hoverOn(page, page.getByText('Revenue (Month)').first(), 900);
      await say(page, 'Live KPIs — click any tile to drill down', 3200);
      await clickOn(page, page.getByRole('combobox', { name: 'Date range' }));
      await pause(page, 400);
      await clickOn(page, page.getByRole('option', { name: 'This Year' }));
      await expect(page.getByText('Revenue (Year)')).toBeVisible();
      await dwell(page, 1800);
      await clickOn(page, page.getByRole('combobox', { name: 'Date range' }));
      await pause(page, 400);
      await clickOn(page, page.getByRole('option', { name: 'This Month' }));
      await dwell(page, 1000);
      await clickOn(page, page.getByRole('button', { name: 'Add note' }));
      const note = page.locator('textarea[placeholder="Type your note..."]');
      await typeInto(page, note, 'Call the Mehtas after airport pickup');
      await note.blur();
      await expect(page.getByText('Call the Mehtas after airport pickup').first()).toBeVisible();
      await say(page, 'Sticky notes keep the day\'s reminders in view', 2800);
      await clickOn(page, page.locator('a[href="/leads"]').filter({ hasText: 'New Leads' }).first());
      await page.waitForURL('**/leads*', { timeout: 15_000 });
      await settle(page, 1500);
      await page.goBack();
      await page.waitForURL('**/dashboard', { timeout: 15_000 });
      await settle(page, 1500);
      await assertClean(page, 'ch2');

      // ── 3 Contacts ──
      await chapter(page, 3, 'Contacts', 'Every traveller and client, one clean record');
      await nav(page, '/contacts');
      await search(page, /Search contacts/i, 'Nair');
      await expect(page.locator('table tbody tr').filter({ hasText: 'Priya Nair' }).first()).toBeVisible();
      await say(page, 'Every traveller and client, one clean record', 2800);
      await typeInto(page, page.getByPlaceholder(/Search contacts/i), '');
      await settle(page, 1200);
      await pickSelect(page, page.getByRole('combobox', { name: 'Filter by tag' }), 'family');
      await settle(page, 1400);
      await dwell(page, 1200);
      await pickSelect(page, page.getByRole('combobox', { name: 'Filter by tag' }), /All tags/);
      await settle(page, 1000);
      await clickOn(page, page.getByRole('button', { name: /New Contact/ }));
      await page.waitForURL('**/contacts/new');
      await settle(page, 900);
      await typeInto(page, page.locator('#name'), 'Rohit Bhatia');
      await typeInto(page, page.locator('#email'), 'rohit.bhatia@example.com');
      await typeInto(page, page.locator('input[type="tel"]').first(), '9811142587');
      await pickSelect(page, page.locator('button#source'), 'Referral');
      await typeInto(page, page.locator('#city'), 'New Delhi');
      await typeInto(page, page.locator('#state'), 'Delhi');
      await typeInto(page, page.locator('#country'), 'India');
      for (const tag of ['adventure', 'scuba']) {
        await typeInto(page, page.getByPlaceholder(/Type a tag/i), tag);
        await page.keyboard.press('Enter');
        await pause(page, 300);
      }
      await say(page, 'Capture a new client in under a minute', 2600);
      await assertClean(page, 'ch3 form');
      await clickOn(page, page.getByRole('button', { name: /Save Contact/i }));
      await page.waitForURL('**/contacts', { timeout: 20_000 });
      await settle(page, 1200);
      await search(page, /Search contacts/i, 'Rohit');
      await openRow(page, 'Rohit Bhatia', /\/contacts\/[^/]+$/);
      await expect(page.getByText('rohit.bhatia@example.com').first()).toBeVisible();
      await dwell(page, 1800);
      await clickOn(page, page.getByRole('link', { name: /^Edit/ }).or(page.getByRole('button', { name: /^Edit/ })).first());
      await page.waitForURL(/\/contacts\/[^/]+\/edit$/);
      await settle(page, 1200);
      await typeInto(page, page.locator('#city'), 'Gurugram');
      await typeInto(page, page.locator('#state'), 'Haryana');
      await clickOn(page, page.getByRole('button', { name: /Save Changes/i }));
      await page.waitForURL(/\/contacts\/[^/]+$/, { timeout: 20_000 });
      await settle(page, 1500);
      await expect(page.getByText('Gurugram').first()).toBeVisible();
      await say(page, 'Edit any detail and it updates everywhere', 2600);
      await assertClean(page, 'ch3');

      // ── 4 Leads & pipeline ──
      await chapter(page, 4, 'Leads & pipeline', 'From first enquiry to booking');
      await nav(page, '/leads');
      await pickSelect(page, page.getByRole('combobox', { name: 'Filter by status' }), 'Qualified');
      await settle(page, 1500);
      await say(page, 'Filter the whole pipeline by stage in one click', 3000);
      await pickSelect(page, page.getByRole('combobox', { name: 'Filter by status' }), /All statuses/);
      await settle(page, 1000);
      await clickOn(page, page.getByRole('button', { name: 'Unassigned' }).or(page.getByRole('link', { name: 'Unassigned' })).first());
      await page.waitForURL('**/leads/unassigned');
      await settle(page, 1200);
      const unRow = page.locator('table tbody tr').first();
      await hoverOn(page, unRow, 600);
      await clickOn(page, unRow.locator('button[aria-label="Assign"]'));
      const asg = page.getByRole('dialog');
      await clickOn(page, asg.getByRole('combobox').first());
      await pause(page, 400);
      await typeInto(page, page.getByPlaceholder(/Search team/i), 'Sneha');
      await settle(page, 700);
      await clickOn(page, page.getByRole('option').filter({ hasText: 'Sneha Iyer' }).first());
      await say(page, 'Unassigned leads never slip — assign in one click', 2800);
      await clickOn(page, asg.getByRole('button', { name: 'Assign' }).last());
      await expect(page.getByText(/lead\(s\) assigned/)).toBeVisible();
      await dwell(page, 1500);
      await page.goto('/leads/new');
      await settle(page, 1000);
      await pickRelation(page, /Select a contact/, /Search contacts/i, 'Rohit', 'Rohit Bhatia');
      await typeInto(page, page.locator('#title'), 'Andaman Scuba Week');
      const dest = page.getByPlaceholder(/Type & press Enter|Add more/i).first();
      for (const d of ['Port Blair', 'Havelock']) {
        await typeInto(page, dest, d, { clear: false });
        await page.keyboard.press('Enter');
        await pause(page, 250);
      }
      await pickSelect(page, page.locator('#tripType'), 'Adventure');
      await pickDate(page, page.locator('button:has-text("Pick travel date")'), D.day(100));
      await typeInto(page, page.locator('#paxAdults'), '2');
      await typeInto(page, page.locator('input[inputmode="decimal"]').first(), '140000');
      await pickSelect(page, page.locator('#priority'), 'Warm');
      await pickSelect(page, page.locator('#source'), 'Referral');
      await assertClean(page, 'ch4 form');
      await clickOn(page, page.getByRole('button', { name: /Save Lead/i }).first());
      await expect(page.getByText('Lead created successfully').first()).toBeVisible({ timeout: 15_000 });
      await page.waitForURL('**/leads');
      await settle(page, 1200);
      await search(page, /Search leads/i, 'Andaman Scuba Week');
      await openRow(page, 'Andaman Scuba Week', /\/leads\/[^/]+$/);
      await clickOn(page, page.getByRole('button', { name: 'More actions' }));
      await clickOn(page, page.getByRole('menuitem', { name: 'Schedule follow-up' }));
      const fu = page.getByRole('dialog');
      await pickDateTime(page, fu.getByRole('button', { name: /Pick date & time/ }), D.day(1), 11, 0);
      await typeInto(page, fu.getByPlaceholder(/What to discuss/), 'Share PADI course options');
      await say(page, 'Schedule the next touchpoint right from the lead', 2800);
      await clickOn(page, fu.getByRole('button', { name: 'Schedule', exact: true }));
      await settle(page, 1500);
      await clickOn(page, page.getByRole('button', { name: 'More actions' }));
      await clickOn(page, page.getByRole('menuitem', { name: /^Edit/ }));
      await page.waitForURL(/\/leads\/[^/]+\/edit$/);
      await settle(page, 1200);
      await typeInto(page, page.locator('input[inputmode="decimal"]').first(), '155000');
      await clickOn(page, page.getByRole('button', { name: /Save Changes/i }));
      await page.waitForURL(/\/leads\/[^/]+$/, { timeout: 20_000 });
      await settle(page, 1800);
      await assertClean(page, 'ch4');

      // ── 5 Accounts ──
      await chapter(page, 5, 'Accounts', 'Supplier accounts at a glance');
      await nav(page, '/accounts');
      await search(page, /Search accounts/i, 'Vembanad');
      await say(page, 'Supplier accounts with contacts, rates and history', 2800);
      await openRow(page, 'Vembanad Lake Resort', /\/suppliers\/[^/]+$/);
      await dwell(page, 2500);
      await assertClean(page, 'ch5');
    });
  });
});

void authed; void mark; void openRow; void search; void nav;
