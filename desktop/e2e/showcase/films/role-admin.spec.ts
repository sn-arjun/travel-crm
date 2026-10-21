/** Film role-admin: Ananya (admin) from sign-in to reports (studio/clips/role-admin.json). Starts signed out. */
import { DEMO_EMAIL, DEMO_PASSWORD } from '../demo-data';
import { anonymous as test, beat, clickOn, expect, focus, glance, pause, recordFilm, scrollSteps, settle, signIn, typeInto } from './film-kit';

test('film:role-admin', async ({ page, context }, testInfo) => {
  test.setTimeout(20 * 60_000);
  await recordFilm(page, context, 'role-admin', testInfo, async () => {
    await page.goto('/login');
    await settle(page, 1200);

    await beat(page, 'admin-signin', async () => {
      await signIn(page, DEMO_EMAIL, DEMO_PASSWORD);
      await expect(page.getByText('Welcome back, Ananya').first()).toBeVisible({ timeout: 20_000 });
    });

    await beat(page, 'admin-dashboard', async () => {
      await settle(page, 900);
      await glance(page, page.getByText('New Leads').first(), 600);
      const attention = page.getByTestId('attention-list');
      await attention.scrollIntoViewIfNeeded().catch(() => undefined);
      await focus(page, 'attention', attention, { dwellMs: 900 });
    });

    await beat(page, 'admin-badge', async () => {
      await clickOn(page, page.locator('aside a[href="/assistant"]').first());
      await page.waitForURL('**/assistant');
      await settle(page, 1200);
      const queue = page.getByTestId('assistant-queue');
      await expect(queue).toBeVisible({ timeout: 15_000 });
      const dismiss = queue.getByRole('button', { name: /Dismiss|Not now|Skip/ });
      for (let i = 0; i < 2 && (await dismiss.count()); i++) { await clickOn(page, dismiss.first()); await pause(page, 600); }
    });

    await beat(page, 'admin-announce', async () => {
      await page.goto('/settings/announcements');
      await settle(page, 1200);
      await clickOn(page, page.getByRole('button', { name: /New announcement|Post|Create/ }).first());
      const dlg = page.getByRole('dialog');
      const title = dlg.locator('input').first();
      if (await title.isVisible().catch(() => false)) {
        await typeInto(page, title, 'Diwali rush: please confirm every hotel voucher by Friday');
        await typeInto(page, dlg.locator('textarea').first(), 'Ops will chase suppliers on Monday for anything still unconfirmed. Thank you, team!', { delay: 22 });
        await clickOn(page, dlg.getByRole('button', { name: /Post|Publish|Save|Send/ }).last());
      } else {
        await typeInto(page, page.locator('input').first(), 'Diwali rush: please confirm every hotel voucher by Friday');
        await typeInto(page, page.locator('textarea').first(), 'Ops will chase suppliers on Monday for anything still unconfirmed. Thank you, team!', { delay: 22 });
        await clickOn(page, page.getByRole('button', { name: /Post|Publish|Save|Send/ }).last());
      }
      await settle(page, 1000);
    });

    await beat(page, 'admin-team', async () => {
      await page.goto('/settings/team');
      await settle(page, 1300);
      await scrollSteps(page, 1, 300);
      await glance(page, page.getByText('Sales Manager').first().or(page.getByText('sales manager', { exact: false }).first()), 800);
    });

    await beat(page, 'admin-billing', async () => {
      await page.goto('/settings/billing');
      await settle(page, 1400);
      await glance(page, page.getByTestId('billing-current'), 900);
      await page.getByTestId('billing-invoices').or(page.getByTestId('billing-no-invoices')).first().scrollIntoViewIfNeeded().catch(() => undefined);
      await pause(page, 900);
    });

    await beat(page, 'admin-reports', async () => {
      await page.goto('/reports/team');
      await settle(page, 1800);
      await scrollSteps(page, 1, 350);
    });
  });
});
