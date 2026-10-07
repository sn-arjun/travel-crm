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
    });
  });
});

void authed; void mark; void openRow; void search; void nav;
