/** Film role-operations: Deepa Thomas (operations) (studio/clips/role-operations.json). */
import { asUser, beat, clickOn, expect, glance, openRow, pause, recordFilm, scrollSteps, settle, staffEmail, visit } from './film-kit';

const test = asUser(staffEmail('deepa'));

test('film:role-operations', async ({ page, context }, testInfo) => {
  test.setTimeout(20 * 60_000);
  await recordFilm(page, context, 'role-operations', testInfo, async () => {
    await page.goto('/fleet');
    await settle(page, 1600);

    await beat(page, 'ops-today', async () => {
      await glance(page, page.getByText('Active Trips').first(), 900);
      await scrollSteps(page, 1, 350);
    });

    await beat(page, 'ops-trips', async () => {
      await visit(page, '/fleet/trips');
      await glance(page, page.locator('table tbody tr').first(), 700);
      await openRow(page, /.+/, /\/fleet\/trips\/[^/]+$/);
      await scrollSteps(page, 1, 300);
    });

    await beat(page, 'ops-vouchers', async () => {
      await visit(page, '/vouchers');
      await openRow(page, /Sent|sent/, /\/vouchers\/[^/]+$/);
      const confirm = page.getByRole('button', { name: /Mark as confirmed|Confirm/i }).first();
      if (await confirm.isVisible().catch(() => false)) {
        await clickOn(page, confirm);
        const dlg = page.getByRole('dialog');
        if (await dlg.isVisible().catch(() => false)) await clickOn(page, dlg.getByRole('button', { name: /Confirm/i }).last());
        await settle(page, 900);
      }
      await glance(page, page.getByText(/^confirmed$/i).first(), 800);
    });

    await beat(page, 'ops-tasks', async () => {
      await visit(page, '/tasks');
      await clickOn(page, page.getByRole('button', { name: 'Kanban view' }));
      await settle(page, 1200);
      await pause(page, 900);
      await clickOn(page, page.getByRole('button', { name: 'Table view' }));
      await settle(page, 600);
    });

    await beat(page, 'ops-visa', async () => {
      await page.goto('/visa/dashboard');
      await settle(page, 1300);
      await expect(page.getByText('Docs Collecting').first()).toBeVisible();
      await glance(page, page.getByText('Docs Collecting').first(), 900);
    });
  });
});
