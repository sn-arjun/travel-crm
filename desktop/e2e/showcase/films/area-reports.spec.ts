/** Film area-reports: dashboard, quick add, palette, reports, import and export, notifications (studio/clips/area-reports.json). Demo admin. */
import * as path from 'node:path';

import { asUser, beat, clickOn, expect, focus, glance, pause, recordFilm, scrollSteps, settle, typeInto, visit } from './film-kit';

const test = asUser();
const CSV = path.resolve(__dirname, '..', 'fixtures', 'sahyadri-new-enquiries.csv');

test('film:area-reports', async ({ page, context }, testInfo) => {
  test.setTimeout(25 * 60_000);
  await recordFilm(page, context, 'area-reports', testInfo, async () => {
    await page.goto('/dashboard');
    await settle(page, 1800);

    await beat(page, 'dashboard', async () => {
      const range = page.getByRole('combobox', { name: 'Date range' });
      await focus(page, 'date-range', range);
      await clickOn(page, range);
      await clickOn(page, page.getByRole('option', { name: 'This Year' }));
      await expect(page.getByText('Revenue (Year)')).toBeVisible();
      await pause(page, 1200);
      await clickOn(page, range);
      await clickOn(page, page.getByRole('option', { name: 'This Month' }));
      await settle(page, 700);
    });

    await beat(page, 'quick-add', async () => {
      await clickOn(page, page.getByRole('button', { name: /Quick Add/i }).first());
      await pause(page, 1100);
      await page.keyboard.press('Escape');
      await clickOn(page, page.getByRole('button', { name: 'Add note' }));
      const note = page.locator('textarea[placeholder="Type your note..."]');
      await typeInto(page, note, 'Call the Mehtas after the airport pickup');
      await note.blur();
      await expect(page.getByText('Call the Mehtas after the airport pickup').first()).toBeVisible();
    });

    await beat(page, 'palette', async () => {
      const open = page.getByRole('button', { name: /Search/ }).first();
      await clickOn(page, open);
      const input = page.getByPlaceholder('Type a command or search...');
      await focus(page, 'palette', input);
      await typeInto(page, input, 'invoice');
      await settle(page, 1000);
      await expect(page.getByText('Create a new invoice')).toBeVisible();
      await pause(page, 700);
      await page.keyboard.press('Escape');
    });

    await beat(page, 'reports', async () => {
      await visit(page, '/reports');
      await clickOn(page, page.getByRole('link', { name: /Sales Reports/ }).first());
      await page.waitForURL('**/reports/sales');
      await settle(page, 1800);
      await clickOn(page, page.getByRole('tab', { name: 'Salesperson' }));
      await settle(page, 1100);
      await glance(page, page.getByRole('button', { name: /Compare/ }).or(page.getByRole('combobox', { name: /Compare/i })), 800);
      await clickOn(page, page.getByRole('tab', { name: 'Destination' }));
      await settle(page, 1100);
    });

    await beat(page, 'reports-export', async () => {
      await page.goto('/reports/financial');
      await settle(page, 1800);
      await clickOn(page, page.getByRole('tab', { name: 'Receivables' }));
      await settle(page, 1100);
      const xl = page.waitForEvent('download', { timeout: 45_000 });
      const btn = page.getByRole('button', { name: 'Export Excel' });
      await focus(page, 'export', btn);
      await clickOn(page, btn);
      await xl;
      await pause(page, 600);
    });

    await beat(page, 'import', async () => {
      await page.goto('/import');
      await settle(page, 1200);
      await clickOn(page, page.getByRole('button', { name: /Contacts$/ }));
      await glance(page, page.getByRole('button', { name: /template/i }).or(page.getByRole('link', { name: /template/i })), 700);
      await page.locator('#fileInput').setInputFiles(CSV);
      await settle(page, 900);
      await clickOn(page, page.getByRole('button', { name: /^Next/ }));
      await expect(page.getByText(/Step 2 of 4/)).toBeVisible({ timeout: 20_000 });
      await settle(page, 1200);
      await clickOn(page, page.getByRole('button', { name: /^Next/ }));
      await expect(page.getByText(/Step 3 of 4/)).toBeVisible({ timeout: 20_000 });
      await clickOn(page, page.getByText('Skip Duplicates', { exact: true }));
      await clickOn(page, page.getByRole('button', { name: /^Next/ }));
      await expect(page.getByText(/Step 4 of 4/)).toBeVisible();
      await clickOn(page, page.getByRole('button', { name: 'Start Import' }));
      await expect(page.getByText('Import Complete', { exact: true })).toBeVisible({ timeout: 60_000 });
    });

    await beat(page, 'export', async () => {
      await page.goto('/settings/import');
      await settle(page, 1200);
      await page.goto('/settings/export');
      await settle(page, 1200);
      const dl = page.waitForEvent('download', { timeout: 45_000 });
      await clickOn(page, page.getByRole('button', { name: 'Export Contacts' }));
      await dl;
      await scrollSteps(page, 1, 300);
    });

    await beat(page, 'notifications', async () => {
      await visit(page, '/notifications');
      await clickOn(page, page.getByRole('button', { name: 'Unread only' }));
      await settle(page, 1000);
      await page.goto('/bookmarks');
      await settle(page, 1000);
      await page.goto('/help');
      await settle(page, 1000);
      await typeInto(page, page.getByPlaceholder('Search help articles...'), 'invoice');
      await settle(page, 900);
    });
  });
});
