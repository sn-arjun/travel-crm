/**
 * Walkthrough part 7: Insights & administration (chapters 38-45): reports, import / export, notifications, settings, integrations,
 * super admin, help and bookmarks. AI (chapter 37) lives in its own part, wtai.spec.ts, so nothing else ever touches AI.
 */
import * as path from 'node:path';

import * as D from './demo-data';
import { expect, test } from './showcase-fixtures';
import { pause, pickSelect } from './showcase-helpers';
import { assertClean, chapter, clickOn, dwell, hoverOn, nav, openRow, recordPart, say, scrollSteps, search, settle, typeInto } from './walkthrough-kit';

const CSV = path.resolve(__dirname, 'fixtures', 'sahyadri-new-enquiries.csv');

test('wt7: insights and administration (chapters 38-45)', async ({ page, context }, testInfo) => {
  test.setTimeout(30 * 60_000);
  await recordPart(page, context, 'wt7', testInfo, async () => {
    await page.goto('/dashboard');
    await settle(page, 1800);

    // ── 38 Reports ──
    await chapter(page, 38, 'Reports', 'Branded reports, exportable');
    await nav(page, '/reports');
    await say(page, 'Sales, finance, fleet and more — one reports hub', 2800);
    await clickOn(page, page.getByRole('link', { name: /Sales Reports/ }).first());
    await page.waitForURL('**/reports/sales');
    await settle(page, 2200);
    await clickOn(page, page.getByRole('tab', { name: 'Salesperson' }));
    await settle(page, 1500);
    await clickOn(page, page.getByRole('tab', { name: 'Destination' }));
    await settle(page, 1500);
    await page.goto('/reports/financial');
    await settle(page, 2200);
    await clickOn(page, page.getByRole('tab', { name: 'Receivables' }));
    await settle(page, 1500);
    const xl = page.waitForEvent('download', { timeout: 45_000 });
    await clickOn(page, page.getByRole('button', { name: 'Export Excel' }));
    await xl;
    await say(page, 'Export any report as a branded Excel file', 3000);
    await page.goto('/reports/fleet');
    await settle(page, 2000);
    await assertClean(page, 'ch38');

    // ── 39 Import & export ──
    await chapter(page, 39, 'Import & export', 'Bring data in or out in minutes');
    await page.goto('/import');
    await settle(page, 1500);
    await clickOn(page, page.getByRole('button', { name: /Contacts$/ }));
    await page.locator('#fileInput').setInputFiles(CSV);
    await settle(page, 1200);
    await say(page, 'Upload a spreadsheet and map its columns', 3000);
    await clickOn(page, page.getByRole('button', { name: /^Next/ }));
    await expect(page.getByText(/Step 2 of 4/)).toBeVisible({ timeout: 20_000 });
    await settle(page, 1800);
    await dwell(page, 1500);
    await clickOn(page, page.getByRole('button', { name: /^Next/ }));
    await expect(page.getByText(/Step 3 of 4/)).toBeVisible({ timeout: 20_000 });
    await settle(page, 1500);
    await clickOn(page, page.getByText('Skip Duplicates', { exact: true }));
    await clickOn(page, page.getByRole('button', { name: /^Next/ }));
    await expect(page.getByText(/Step 4 of 4/)).toBeVisible();
    await dwell(page, 1200);
    await clickOn(page, page.getByRole('button', { name: 'Start Import' }));
    await expect(page.getByText('Import Complete', { exact: true })).toBeVisible({ timeout: 60_000 });
    await dwell(page, 2200);
    await page.goto('/settings/export');
    await settle(page, 1500);
    const dl = page.waitForEvent('download', { timeout: 45_000 });
    await clickOn(page, page.getByRole('button', { name: 'Export Contacts' }));
    await dl;
    await say(page, 'Export contacts, leads or a full data package', 3000);
    await assertClean(page, 'ch39');

    // ── 40 Notifications ──
    await chapter(page, 40, 'Notifications', 'Alerts that link to the record');
    await nav(page, '/notifications');
    await clickOn(page, page.getByRole('button', { name: 'Unread only' }));
    await settle(page, 1300);
    await say(page, 'Alerts that link straight to the record', 3000);
    await clickOn(page, page.getByRole('button', { name: 'Mark all as read' }));
    await settle(page, 1500);
    await page.goto('/settings/notifications');
    await settle(page, 1500);
    await scrollSteps(page, 1, 350);
    await assertClean(page, 'ch40');

    // ── 41 Settings — company ──
    await chapter(page, 41, 'Settings — company', 'Your brand on every document');
    await page.goto('/settings/company');
    await settle(page, 1800);
    await typeInto(page, page.locator('#website'), 'www.sahyadriholidays.in/kerala');
    await say(page, 'Your brand and numbering on every document', 2800);
    await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
    await settle(page, 1500);
    await page.goto('/settings/company');
    await settle(page, 1500);
    await expect(page.locator('#website')).toHaveValue('www.sahyadriholidays.in/kerala');
    await typeInto(page, page.locator('#website'), D.COMPANY.company_website);
    await clickOn(page, page.getByRole('button', { name: 'Save', exact: true }));
    await settle(page, 1500);
    await page.goto('/settings/numbering');
    await settle(page, 1500);
    await expect(page.locator('#invoicePrefix')).toHaveValue('SH-INV');
    await dwell(page, 2200);
    await assertClean(page, 'ch41');

    // ── 42 Settings — team ──
    await chapter(page, 42, 'Settings — team', 'Roles and a full audit trail');
    await page.goto('/settings/team');
    await settle(page, 1500);
    await clickOn(page, page.getByRole('button', { name: 'Invite user' }).first());
    const inv = page.getByRole('dialog');
    await typeInto(page, inv.locator('#invite-name'), 'Meera Pillai');
    await typeInto(page, inv.locator('#invite-email'), 'meera.pillai@example.com');
    await pickSelect(page, inv.locator('#invite-role'), 'Operations');
    await typeInto(page, inv.locator('#invite-department'), 'Kochi desk');
    await say(page, 'Invite teammates with the right role from day one', 2800);
    await clickOn(page, inv.getByRole('button', { name: 'Send invitation' }));
    await settle(page, 1800);
    await page.goto('/settings/activity-log');
    await settle(page, 1800);
    await say(page, 'Every action recorded in the activity log', 2800);
    await assertClean(page, 'ch42');

    // ── 43 Integrations & webhooks ──
    await chapter(page, 43, 'Integrations & webhooks', 'Connect your website forms');
    await page.goto('/settings/integrations');
    await settle(page, 1800);
    await say(page, 'Plug your website forms straight into the CRM', 3000);
    await dwell(page, 1200);
    await assertClean(page, 'ch43');

    // ── 44 Super admin ──
    await chapter(page, 44, 'Super admin', 'Run every agency from one console');
    await page.goto('/super-admin');
    await settle(page, 2000);
    await say(page, 'Run every agency on the platform from one console', 3200);
    await page.goto('/super-admin/tenants');
    await settle(page, 1800);
    await hoverOn(page, page.locator('table tbody tr').first(), 900);
    await page.goto('/super-admin/plans');
    await settle(page, 1800);
    await assertClean(page, 'ch44');

    // ── 45 Help & bookmarks ──
    await chapter(page, 45, 'Help & bookmarks', 'Always one click away');
    await nav(page, '/bookmarks', { exact: true }).catch(async () => { await page.goto('/bookmarks'); await settle(page, 1300); });
    await say(page, 'Star what matters and find it again in a click', 2800);
    await page.goto('/help');
    await settle(page, 1500);
    await typeInto(page, page.getByPlaceholder('Search help articles...'), 'invoice');
    await settle(page, 1200);
    await pause(page, 600);
    await say(page, 'Built-in help, always one click away', 2800);
    await assertClean(page, 'ch45');
  });
});

void search; void openRow;
