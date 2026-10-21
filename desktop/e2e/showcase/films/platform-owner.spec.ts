/**
 * Film platform-owner: the operator console and the hand-over of a new agency (studio/clips/platform-owner.json,
 * docs/HANDOFF-PLAYBOOK.md). Multi-agency stack (fix-stack --multi) + console (scripts/showcase/console-up.mjs) +
 * film-prep --operator. Creates agency A (Skyline Holidays, India, Basic) on camera and saves its owner login for the plans film.
 * Email is the local outbox; billing is the mock gateway; nothing external is contacted.
 */
import type { Page } from '@playwright/test';

import { admin, anonymous as test, BASE_URL, rows, beat, clickOn, CONSOLE_URL, expect, focus, glance, outbox, pause, recordFilm, saveAgency, scrollSteps, settle, showMail, typeInto } from './film-kit';

const OPERATOR = { email: 'asha.rao@travelcrm.example', password: 'Console-Operator-2026' };
// A retake on the same stack needs a fresh agency code (agencies are never deleted): FILM_TAKE=2 -> skyline-holidays-2.
const TAKE = process.env.FILM_TAKE ? `-${process.env.FILM_TAKE}` : '';
const A = { slug: `skyline-holidays${TAKE}`, companyName: 'Skyline Holidays', ownerName: 'Kavya Rao', email: TAKE ? `kavya.rao+${process.env.FILM_TAKE}@example.com` : 'kavya.rao@example.com', password: 'Skyline-Voyage-2026', country: 'India', timezone: 'Asia/Kolkata', currency: 'INR' };
const TEAMMATE = { name: 'Rohan Kulkarni', email: 'rohan.kulkarni@example.com' };
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const field = (page: Page, label: string) => page.locator('div.space-y-1', { has: page.locator(`label:text-is("${label}")`) }).locator('input, select').first();
const nav = async (page: Page, href: string) => {
  const link = page.locator(`a[href="${href}"]`).first();
  if (await link.isVisible().catch(() => false)) await clickOn(page, link); else await page.goto(`${CONSOLE_URL}${href}`);
  await settle(page, 1200);
};

test('film:platform-owner', async ({ page, context }, testInfo) => {
  test.setTimeout(30 * 60_000);
  let tenantUrl = '';
  await recordFilm(page, context, 'platform-owner', testInfo, async () => {
    await page.goto(`${CONSOLE_URL}/login`);
    await settle(page, 1200);

    await beat(page, 'sa-login', async () => {
      await typeInto(page, page.locator('#email'), OPERATOR.email);
      await typeInto(page, page.locator('#password'), OPERATOR.password, { delay: 40 });
      await clickOn(page, page.locator('button[type="submit"]'));
      await page.waitForURL(/\/dashboard$/, { timeout: 20_000 });
      await settle(page, 1200);
    });

    await beat(page, 'sa-dashboard', async () => {
      await glance(page, page.getByText('Total Tenants').first(), 700);
      await scrollSteps(page, 2, 380);
      await page.mouse.wheel(0, -1500);
      await pause(page, 300);
    });

    await beat(page, 'sa-catalogue', async () => {
      await nav(page, '/catalogue');
      await clickOn(page, page.getByRole('tab', { name: 'Monthly allowances' }));
      await pause(page, 1000);
      await clickOn(page, page.getByRole('tab', { name: 'Add-on products' }));
      await pause(page, 1000);
      await clickOn(page, page.getByRole('tab', { name: /Provider costs/ }));
      await pause(page, 1000);
      await clickOn(page, page.getByRole('tab', { name: /Plans & prices/ }));
      await pause(page, 600);
    });

    await beat(page, 'sa-create', async () => {
      await nav(page, '/tenants');
      await page.goto(`${CONSOLE_URL}/tenants/new`);
      await settle(page, 1000);
      await typeInto(page, page.getByPlaceholder('Acme Travel Co.'), A.companyName);
      await typeInto(page, page.getByPlaceholder('acme-travel'), A.slug);
      await typeInto(page, page.getByPlaceholder('John Doe'), A.ownerName);
      await typeInto(page, page.getByPlaceholder('john@acmetravel.com'), A.email);
      await typeInto(page, field(page, 'Country'), A.country);
      await typeInto(page, field(page, 'Timezone'), A.timezone);
      await typeInto(page, field(page, 'Currency'), A.currency);
      await field(page, 'Tax system').selectOption('gst');
      await field(page, 'Data region').selectOption('in');
      await clickOn(page, page.getByRole('button', { name: 'Next: Select Plan' }));
      await settle(page, 900);
      await clickOn(page, page.locator('h3', { hasText: /^Basic$/ }).first());
      await clickOn(page, page.getByRole('button', { name: /^Next/ }).last());
      await settle(page, 700);
      const provision = page.getByRole('button', { name: /Provision Tenant/ });
      await focus(page, 'provision', provision);
      await clickOn(page, provision);
      await expect(page.getByRole('button', { name: 'Open agency' }).or(page.getByText(/provisioned|ready|active/i).first())).toBeVisible({ timeout: 60_000 });
      await pause(page, 900);
    });

    let temporary = '';
    await beat(page, 'sa-welcome', async () => {
      const mail = (await outbox(A.email)).find((m) => m.template === 'welcome_admin');
      if (!mail) throw new Error('welcome email not in the outbox');
      temporary = mail.text.match(/Temporary password:\s*(\S+)/i)?.[1] ?? '';
      if (!temporary) throw new Error('no temporary password in the welcome email');
      await showMail(page, mail);
      await pause(page, 2200);
    });

    await beat(page, 'owner-first-login', async () => {
      await page.goto(`${BASE_URL}/login`);
      await page.waitForSelector('text=Welcome back');
      for (let i = 0; i < 3; i++) {
        await typeInto(page, page.locator('#email'), A.email);
        await clickOn(page, page.locator('button[type="submit"]'));
        try { await page.waitForSelector('#password', { timeout: 5000 }); break; } catch { /* hydrating */ }
      }
      await typeInto(page, page.locator('#password'), temporary, { delay: 25 });
      await clickOn(page, page.locator('button[type="submit"]'));
      await page.waitForURL('**/change-password', { timeout: 20_000 });
      await typeInto(page, page.locator('#currentPassword'), temporary, { delay: 20 });
      await typeInto(page, page.locator('#newPassword'), A.password, { delay: 30 });
      await typeInto(page, page.locator('#confirmPassword'), A.password, { delay: 30 });
      await clickOn(page, page.getByRole('button', { name: 'Change password' }));
      await page.waitForURL('**/onboarding', { timeout: 20_000 });
      await settle(page, 800);
      await typeInto(page, page.locator('#company_city'), 'Pune');
      await clickOn(page, page.getByRole('button', { name: /^Next/ }));
      await expect(page.locator('#currency')).toContainText('INR');
      await typeInto(page, page.locator('#invoice_prefix'), 'SKY');
      await clickOn(page, page.getByRole('button', { name: /^Next/ }));
      await page.locator('input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1X1 });
      await clickOn(page, page.getByRole('button', { name: /Finish Setup/ }));
      await expect(page.getByRole('heading', { name: "You're all set!" })).toBeVisible({ timeout: 15_000 });
      await clickOn(page, page.getByRole('button', { name: /Go to Dashboard/ }));
      await page.waitForURL('**/dashboard', { timeout: 15_000 });
      await settle(page, 900);
      const listed = rows(await admin('GET', `/tenants?search=${A.slug}`)).find((t) => t.slug === A.slug);
      const tenantId = String(listed?.id ?? '');
      saveAgency({ key: 'A', tenantId, slug: A.slug, companyName: A.companyName, email: A.email, password: A.password, plan: 'basic', country: A.country });
    });

    await beat(page, 'owner-invite', async () => {
      await page.goto(`${BASE_URL}/settings/team`);
      await settle(page, 1200);
      await clickOn(page, page.getByRole('button', { name: 'Invite user' }).first());
      const inv = page.getByRole('dialog');
      await typeInto(page, inv.locator('#invite-name'), TEAMMATE.name);
      await typeInto(page, inv.locator('#invite-email'), TEAMMATE.email);
      await clickOn(page, inv.locator('#invite-role'));
      await clickOn(page, page.getByRole('option', { name: 'Salesperson' }));
      await clickOn(page, inv.getByRole('button', { name: 'Send invitation' }));
      await settle(page, 1100);
    });

    await beat(page, 'sa-tenant', async () => {
      await page.goto(`${CONSOLE_URL}/tenants`);
      await settle(page, 1200);
      const row = page.locator('table tbody tr').filter({ hasText: A.email }).first();
      await clickOn(page, row.getByRole('button', { name: `Actions for ${A.companyName}` }));
      await clickOn(page, page.getByRole('menuitem', { name: /View Details/ }));
      await page.waitForURL(/\/tenants\/[^/]+$/, { timeout: 15_000 });
      tenantUrl = page.url();
      await settle(page, 1200);
      for (const tab of ['Subscription', 'Plan & caps', 'Usage & add-ons']) { await clickOn(page, page.getByRole('tab', { name: tab })); await pause(page, 900); }
    });

    await beat(page, 'sa-features', async () => {
      await nav(page, '/features');
      await scrollSteps(page, 1, 350);
      await page.goto(tenantUrl);
      await settle(page, 1000);
      await clickOn(page, page.getByRole('tab', { name: 'Features' }));
      const flags = page.getByText('Feature Flags').first();
      await focus(page, 'override', flags, { dwellMs: 700 });
      await scrollSteps(page, 1, 300);
    });

    await beat(page, 'sa-calling', async () => {
      await clickOn(page, page.getByRole('tab', { name: 'Calling' }));
      await settle(page, 1000);
      await scrollSteps(page, 1, 350);
    });

    await beat(page, 'sa-email', async () => {
      await nav(page, '/email');
      await glance(page, page.getByText('Routing by kind of mail').first(), 800);
      await scrollSteps(page, 2, 380);
    });

    await beat(page, 'sa-billing', async () => {
      await nav(page, '/subscriptions');
      await glance(page, page.locator('table tbody tr').filter({ hasText: A.companyName }).first(), 900);
    });

    await beat(page, 'sa-suspend', async () => {
      await page.goto(`${CONSOLE_URL}/tenants`);
      await settle(page, 1100);
      const row = page.locator('table tbody tr').filter({ hasText: A.email }).first();
      await clickOn(page, row.getByRole('button', { name: `Actions for ${A.companyName}` }));
      await clickOn(page, page.getByRole('menuitem', { name: /Suspend/ }));
      const dlg = page.getByRole('dialog');
      await typeInto(page, dlg.getByPlaceholder('Reason for suspension'), 'Demo: payment overdue');
      await clickOn(page, dlg.getByRole('button', { name: 'Suspend' }));
      await settle(page, 1200);
      await focus(page, 'status', row, { dwellMs: 900 });
      await clickOn(page, row.getByRole('button', { name: `Actions for ${A.companyName}` }));
      await clickOn(page, page.getByRole('menuitem', { name: /Reactivate/ }));
      await settle(page, 1200);
    });

    await beat(page, 'sa-support', async () => {
      await page.goto(tenantUrl);
      await settle(page, 1100);
      const support = page.getByRole('button', { name: /Support session|Sign in as|Support/ }).first();
      await clickOn(page, support);
      await pause(page, 1500);
      await page.keyboard.press('Escape');
    });

    await beat(page, 'sa-health', async () => {
      await nav(page, '/audit-log');
      await nav(page, '/system-health');
      await nav(page, '/reports');
    });
  });
});
